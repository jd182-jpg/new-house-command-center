// Cloudflare Worker: a plain-English update in (POST or email), a one-line confirmation out.
// Secrets (set with `npx wrangler secret put`): HOUSE_TOKEN, ANTHROPIC_API_KEY, ALLOWED_SENDERS.
import Anthropic from '@anthropic-ai/sdk';
import PostalMime from 'postal-mime';
import { createMimeMessage } from 'mimetext';
import { EmailMessage } from 'cloudflare:email';
import { handle, processMessage, parserPrompt, OPS_SCHEMA, SYSTEM_PROMPT } from './house.js';
import { allowedSenders, authPassed, extractCommand, replySubject } from './email.js';

const MODEL = 'claude-haiku-5-5';

async function parseWithClaude(env, state, message) {
  const client = new Anthropic({ apiKey: env.ANTHROPIC_API_KEY, maxRetries: 1 });
  const started = Date.now();
  const res = await client.messages.create({
    model: MODEL,
    max_tokens: 4096,
    output_config: { effort: 'low' },
    tools: [{ name: 'apply_changes', description: 'Apply the edits from his message to the tracker.', input_schema: OPS_SCHEMA }],
    tool_choice: { type: 'auto' },
    system: SYSTEM_PROMPT,
    messages: [{ role: 'user', content: parserPrompt(state, message) }],
  });
  console.log(`claude ${Date.now() - started} ms, stop ${res.stop_reason}, in ${res.usage.input_tokens} out ${res.usage.output_tokens}`);
  if (res.stop_reason === 'refusal') return { question: "I can't help with that one.", ops: [] };
  if (res.stop_reason === 'max_tokens') return { question: 'That was too much at once. Try one change per text.', ops: [] };
  const call = res.content.find((b) => b.type === 'tool_use' && b.name === 'apply_changes');
  if (call) return { question: '', ops: call.input.ops || [] };
  const text = res.content.filter((b) => b.type === 'text').map((b) => b.text).join(' ').trim();
  return { question: text || "I couldn't tell what to change, so nothing changed.", ops: [] };
}

const depsFor = (env) => ({
  fetch: (...args) => fetch(...args),
  parse: (state, message) => parseWithClaude(env, state, message),
  now: () => Date.now(),
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

    const mail = await PostalMime.parse(message.raw);
    const text = mail.text || String(mail.html || '').replace(/<(br|\/p|\/div)[^>]*>/gi, '\n').replace(/<[^>]+>/g, '');
    const command = extractCommand({ subject: mail.subject, text });
    const { text: answer } = await processMessage(command, env, depsFor(env));
    console.log(`email from ${from}: "${command}" -> ${answer}`);

    const out = createMimeMessage();
    out.setSender({ name: '2608 House', addr: message.to });
    out.setRecipient(message.from);
    out.setSubject(replySubject(mail.subject));
    if (mail.messageId) {
      out.setHeader('In-Reply-To', mail.messageId);
      out.setHeader('References', mail.messageId);
    }
    out.addMessage({ contentType: 'text/plain', data: `${answer}\n\nYou wrote: ${command}\n\nReply "undo" to take it back.` });
    await message.reply(new EmailMessage(message.to, message.from, out.asRaw()));
  },
};
