// Email updates: mail to house@darr.solutions reaches the Worker through Cloudflare Email
// Routing. Only mail from ALLOWED_SENDERS (a comma separated secret) that passed sender
// authentication is acted on; the reply goes back to the sender.

// Lowercased addresses from "a@x.com, B@y.com".
export function allowedSenders(list) {
  return String(list || '').split(',').map((s) => s.trim().toLowerCase()).filter(Boolean);
}

// Cloudflare adds an Authentication-Results header. A forged From fails both SPF and DKIM.
export function authPassed(authResults) {
  return /\b(dkim|spf)=pass\b/i.test(String(authResults || ''));
}

const SIGNOFF = /^(sent from my|get outlook for|--\s*$|__+$)/i;
const QUOTE_START = /^(on .+wrote:|from: |-+ ?(original|forwarded) message ?-+|begin forwarded message|>)/i;

// The command is the body's own text (before any quoted reply or signature), or the
// subject when the body is empty. "Re:" and "Fwd:" prefixes are dropped.
export function extractCommand({ subject, text }) {
  const lines = [];
  for (const raw of String(text || '').split(/\r?\n/)) {
    const line = raw.trim();
    if (QUOTE_START.test(line) || SIGNOFF.test(line)) break;
    if (line) lines.push(line);
  }
  const body = lines.join(' ').trim();
  const subj = String(subject || '').replace(/^((re|fwd?|fw):\s*)+/i, '').trim();
  return body || subj;
}

// Only his own words above a forward or quote (no subject fallback), for the note.
export function noteAbove(text) {
  return extractCommand({ subject: '', text });
}

export function replySubject(subject) {
  const s = String(subject || '').trim();
  if (!s) return 'House update';
  return /^re:/i.test(s) ? s : `Re: ${s}`;
}

// A forward, an attachment, or a long fresh email gets the full filing treatment. A reply
// to one of our emails ("undo", "the living room one") quotes us, so it stays a short command.
export function isFiling({ subject, text, attachments }) {
  if (/^undo[.!]?$/i.test(noteAbove(text))) return false;
  if ((attachments || []).length > 0) return true;
  if (/^\s*(fw|fwd):/i.test(subject || '') || /(forwarded message|begin forwarded message)/i.test(text || '')) return true;
  return !/^\s*re:/i.test(subject || '') && String(text || '').length > 600;
}

// Drops signature logos and other small inline images; keeps real files.
export function realAttachments(list) {
  return (list || []).filter((a) => {
    const size = a.content ? a.content.byteLength : 0;
    const isImage = /^image\//.test(a.mimeType || '');
    if (!size) return false;
    if (isImage && (a.disposition === 'inline' || a.contentId) && size < 60 * 1024) return false;
    return true;
  });
}

// What the parser reads for a forward: his note, then the email itself.
export function forwardText({ note, from, subject, date, text, calendars }) {
  const parts = [];
  if (note) parts.push(`Jackson's note: ${note}`);
  parts.push(`Email from ${from || 'unknown'}${date ? ` on ${date}` : ''}\nSubject: ${subject || '(none)'}\n\n${String(text || '').trim()}`);
  for (const c of calendars || []) parts.push(`Calendar invite:\n${c}`);
  return parts.join('\n\n');
}
