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
const QUOTE_START = /^(on .+wrote:|from: |-+ ?original message ?-+|>)/i;

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

export function replySubject(subject) {
  const s = String(subject || '').trim();
  if (!s) return 'House update';
  return /^re:/i.test(s) ? s : `Re: ${s}`;
}
