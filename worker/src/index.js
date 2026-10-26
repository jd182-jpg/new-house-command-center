// Cloudflare Worker: a plain-English update in (POST or email), a one-line confirmation out.
// Secrets (set with `npx wrangler secret put`): HOUSE_TOKEN, ANTHROPIC_API_KEY, ALLOWED_SENDERS.
// KV holds the OneDrive refresh token (ms_refresh_token) and which forwards were already filed.
import Anthropic from '@anthropic-ai/sdk';
import PostalMime, { decodeWords } from 'postal-mime';
import { createMimeMessage } from 'mimetext';
import { EmailMessage } from 'cloudflare:email';
import { Buffer } from 'node:buffer';
import { handle, processMessage, parserPrompt, OPS_SCHEMA, SYSTEM_PROMPT } from './house.js';
import { allowedSenders, authPassed, extractCommand, replySubject, isFiling, realAttachments, forwardText, noteAbove, MAX_PARSE_BYTES, tooBigText } from './email.js';
import * as drive from './onedrive.js';

// Short texts use the fast model; forwarded emails (long, messy, with PDFs) use a stronger one.
const MODEL = 'claude-haiku-5-5';
const FORWARD_MODEL = 'claude-sonnet-5-5';
const PDF_LIMIT = 10 * 1024 * 1024;
const IMAGE_LIMIT = 5 * 1024 * 1024;
const IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];

// PDFs and photos go to Claude as documents and images so it can read amounts and dates.
function attachmentBlocks(mail) {
  const blocks = [];
  (mail.attachments || []).forEach((a, i) => {
    const data = () => Buffer.from(a.content).toString('base64');
    if (a.mimeType === 'application/pdf' && a.size <= PDF_LIMIT) {
      blocks.push({ type: 'text', text: `Attachment [${i}] ${a.filename}:` }, { type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: data() } });
    } else if (IMAGE_TYPES.includes(a.mimeType) && a.size <= IMAGE_LIMIT) {
      blocks.push({ type: 'text', text: `Attachment [${i}] ${a.filename}:` }, { type: 'image', source: { type: 'base64', media_type: a.mimeType, data: data() } });
    }
  });
  return blocks;
}

async function parseWithClaude(env, state, message, mail = null) {
  const client = new Anthropic({ apiKey: env.ANTHROPIC_API_KEY, maxRetries: 1 });
  const started = Date.now();
  const prompt = parserPrompt(state, message, new Date(), mail);
  const res = await client.messages.create({
    model: mail ? FORWARD_MODEL : MODEL,
    max_tokens: mail ? 16000 : 4096,
    output_config: { effort: mail ? 'medium' : 'low' },
    tools: [{ name: 'apply_changes', description: 'Apply the edits from his message to the tracker.', input_schema: OPS_SCHEMA }],
    tool_choice: { type: 'auto' },
    system: SYSTEM_PROMPT,
    messages: [{ role: 'user', content: mail ? [...attachmentBlocks(mail), { type: 'text', text: prompt }] : prompt }],
  });
  console.log(`claude ${mail ? 'forward' : 'text'} ${Date.now() - started} ms, stop ${res.stop_reason}, in ${res.usage.input_tokens} out ${res.usage.output_tokens}`);
  if (res.stop_reason === 'refusal') return { question: "I can't help with that one.", ops: [] };
  if (res.stop_reason === 'max_tokens') return { question: 'That was too much at once. Try one change per text.', ops: [] };
  const call = res.content.find((b) => b.type === 'tool_use' && b.name === 'apply_changes');
  if (call) return { question: '', ops: call.input.ops || [] };
  const text = res.content.filter((b) => b.type === 'text').map((b) => b.text).join(' ').trim();
  return { question: text || "I couldn't tell what to change, so nothing changed.", ops: [] };
}

const depsFor = (env) => ({
  fetch: (...args) => fetch(...args),
  parse: (state, message, mail) => parseWithClaude(env, state, message, mail),
  now: () => Date.now(),
  files: {
    upload: (folder, name, bytes) => drive.upload(env, fetch, folder, name, bytes),
    remove: (ids) => drive.remove(env, fetch, ids),
  },
});

export default {
  fetch(request, env) {
    return handle(request, env, depsFor(env));
  },

  async email(message, env) {
    const from = String(message.from || '').toLowerCase();
    if (!allowedSenders(env.ALLOWED_SENDERS).includes(from)) {
      console.log(`email from ${from}: not an allowed sender, dropped`);
      message.setReject('Unknown sender');
      return;
    }
    if (!authPassed(message.headers.get('authentication-results'))) {
      console.log(`email from ${from}: failed SPF and DKIM, dropped`);
      message.setReject('Sender authentication failed');
      return;
    }

    const raw = await new Response(message.raw).arrayBuffer();
    if (raw.byteLength > MAX_PARSE_BYTES) {
      await saveTooBig(message, env, raw, from);
      return;
    }
    const mail = await PostalMime.parse(raw);
    const html = String(mail.html || '').replace(/<(br|\/p|\/div|\/tr)[^>]*>/gi, '\n').replace(/<[^>]+>/g, '').replace(/&nbsp;/g, ' ');
    const text = mail.text || html;
    const all = mail.attachments || [];
    // Calendar invites become text the parser can read; the rest are files.
    const calendars = all.filter((a) => /calendar/.test(a.mimeType || '')).map((a) => new TextDecoder().decode(a.content).slice(0, 4000));
    const attachments = realAttachments(all.filter((a) => !/calendar/.test(a.mimeType || '')))
      .map((a) => ({ filename: a.filename || 'attachment', mimeType: a.mimeType || 'application/octet-stream', size: a.content.byteLength, content: a.content }));

    let command;
    let filing = null;
    if (isFiling({ subject: mail.subject, text, attachments })) {
      // The same email forwarded twice is filed once.
      const seenKey = mail.messageId ? `seen:${mail.messageId}` : null;
      if (seenKey && (await env.KV.get(seenKey))) {
        await sendReply(message, mail, 'Already filed this one, so nothing changed.', '(forwarded email)', [], env);
        return;
      }
      command = forwardText({ note: noteAbove(text), from: mail.from && mail.from.address, subject: mail.subject, date: mail.date, text, calendars });
      filing = { attachments, raw, folders: await drive.topFolders(env, fetch).catch(() => []), seenKey };
    } else {
      command = extractCommand({ subject: mail.subject, text });
    }
    const { text: answer, files, changed } = await processMessage(command, env, depsFor(env), filing);
    if (filing && filing.seenKey && changed) await env.KV.put(filing.seenKey, '1', { expirationTtl: 60 * 86400 });
    const shown = filing ? `(forwarded: ${mail.subject || 'no subject'}${attachments.length ? `, ${attachments.length} attachment${attachments.length === 1 ? '' : 's'}` : ''})` : command;
    console.log(`email from ${from}: ${filing ? 'forward' : 'text'} "${shown}" -> ${answer}`);
    await sendReply(message, mail, answer, shown, files, env);
  },
};

// Too big to unpack within the CPU limit: save the raw email to 00 Inbox without parsing it.
async function saveTooBig(message, env, raw, from) {
  const subject = decodeWords(message.headers.get('subject') || '');
  const mail = { subject, messageId: message.headers.get('message-id') };
  const seenKey = mail.messageId ? `big:${mail.messageId}` : null;
  let path = seenKey ? await env.KV.get(seenKey) : null;
  if (!path) {
    try {
      const day = new Date().toISOString().slice(0, 10);
      const saved = await drive.upload(env, fetch, '00 Inbox', drive.fileNameFor(`${day} ${subject.replace(/^((re|fwd?|fw):\s*)+/i, '')}`, 'email.eml'), raw);
      path = saved.path;
      if (seenKey) await env.KV.put(seenKey, path, { expirationTtl: 60 * 86400 });
    } catch (err) {
      console.error(err);
    }
  }
  const answer = tooBigText(raw.byteLength, path);
  console.log(`email from ${from}: too big (${raw.byteLength} bytes) "${subject}" -> ${path || 'not saved'}`);
  await sendReply(message, mail, answer, `(forwarded: ${subject || 'no subject'})`, [], env);
}

// Replies in the same thread: what changed, any files saved, and how to undo.
async function sendReply(message, mail, answer, shown, files = [], env = null) {
  const out = createMimeMessage();
  out.setSender({ name: '2608 House', addr: message.to });
  out.setRecipient(message.from);
  out.setSubject(replySubject(mail.subject));
  if (mail.messageId) {
    out.setHeader('In-Reply-To', mail.messageId);
    out.setHeader('References', mail.messageId);
  }
  const lines = answer.replace(/\.$/, '').split('; ').map((l) => `- ${l}`);
  const saved = (files || []).map((f) => `- 2608-Montrose-Blvd/${f.path}`);
  const body = [lines.length > 1 ? lines.join('\n') : answer,
    saved.length ? `\nSaved to OneDrive:\n${saved.join('\n')}` : '',
    `\nYou sent: ${shown}`, '\nReply "undo" to take it back.'].join('\n');
  out.addMessage({ contentType: 'text/plain', data: body });
  try {
    await message.reply(new EmailMessage(message.to, message.from, out.asRaw()));
  } catch (err) {
    // Cloudflare only allows reply() to mail that passes DMARC (Outlook.com mail often doesn't).
    // Sending fresh works to any destination address verified in Email Routing.
    console.log(`reply() refused (${err.message}); sending instead`);
    if (!env || !env.MAILER) throw err;
    await env.MAILER.send(new EmailMessage(message.to, message.from, out.asRaw()));
  }
}
