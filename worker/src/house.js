// The text-update endpoint, minus the network clients, so tests can drive it with fakes.
// index.js wires in the real fetch and the Claude call.
import { applyTextOps, describeForParser, normalizeState, stampUpdated, TASK_CATEGORIES, TASK_STATUSES,
  ITEM_STATUSES, ITEM_PRIORITIES, TASK_PRIORITIES } from '../../js/model.js';

export const MAX_MESSAGE = 1000;

// What Claude sends back. Ids come from the listing in the prompt, so a vague message
// produces a question instead of a guess. One id, name and date field serve every kind;
// toModelOps maps them onto the ops in js/model.js.
export const PARSER_KINDS = ['updateTask', 'addTask', 'updateItem', 'addItem', 'setClosingDate', 'setMoveInDate'];

// Input schema for the apply_changes tool. Structured outputs rejected this shape as too
// complex, so it is a plain tool schema; applyTextOps checks every op anyway.
export const OPS_SCHEMA = {
  type: 'object',
  required: ['ops'],
  properties: {
    ops: {
      type: 'array',
      items: {
        type: 'object',
        required: ['kind'],
        properties: {
          kind: { type: 'string', enum: PARSER_KINDS },
          id: { type: 'string', description: 'Exact id from the listing (updates only).' },
          name: { type: 'string', description: 'Task title or item name (adds only).' },
          status: { type: 'string' },
          category: { type: 'string' },
          room: { type: 'string' },
          priority: { type: 'string' },
          date: { type: 'string', description: 'YYYY-MM-DD' },
          confirmation: { type: 'string' },
          unitPrice: { type: 'number' },
          qty: { type: 'integer' },
          store: { type: 'string' },
          url: { type: 'string' },
          orderNumber: { type: 'string' },
          notes: { type: 'string' },
        },
      },
    },
  },
};

// Turns the parser's compact ops into the ops applyTextOps understands.
export function toModelOps(ops) {
  return (ops || []).map((o) => {
    const { kind, id, name, date, ...rest } = o;
    switch (kind) {
      case 'updateTask': return { kind, taskId: id, due: date, ...rest };
      case 'addTask': return { kind, title: name, due: date, ...rest };
      case 'updateItem': return { kind, itemId: id, expectedDelivery: date, ...rest };
      case 'addItem': return { kind, name, expectedDelivery: date, ...rest };
      case 'setClosingDate': return { kind: 'setDates', closingDate: date };
      case 'setMoveInDate': return { kind: 'setDates', moveInDate: date };
      default: return { kind };
    }
  });
}

export const SYSTEM_PROMPT = `You turn a short text from Jackson into edits to his move-in tracker for 2608 Montrose Blvd, Houston.
The user turn holds his current tasks and shopping items (each with an id), today's date, and his message.

When the message is clear, call apply_changes once with all the ops. When it is not, do not call the tool: reply with one short question instead.

Op kinds (leave out every field he did not mention):
- updateTask: id plus any of status (${TASK_STATUSES.join(', ')}), date (the due date), confirmation, notes. "done: X" means status Done.
- addTask: name (the title), optional category (${TASK_CATEGORIES.join(', ')}), priority (${TASK_PRIORITIES.join(', ')}), date (due), notes.
- updateItem: id plus any of status (${ITEM_STATUSES.join(', ')}), unitPrice (number, per unit), qty, store, url, orderNumber, date (expected delivery), notes. "ordered/bought" means Ordered, "shipped" Shipped, "arrived/delivered" Delivered, "set up/hung/installed" Placed.
- addItem: name, room (one of his rooms), optional category, priority (${ITEM_PRIORITIES.join(', ')}), status, unitPrice, qty, store, url, notes.
- setClosingDate / setMoveInDate: date.

Rules:
- Use only ids that appear in the listing. Match loosely on meaning ("the Frame TV" is "Samsung The Frame Pro"; calling CenterPoint is about gas service).
- If more than one row could fit, or none clearly fits an update, don't call the tool. Ask a short question naming the candidates.
- Only add when he asks to add something. Never add a row to stand in for an update you could not match.
- Dates are YYYY-MM-DD. Resolve "Nov 22", "Friday", "tomorrow" against today's date, in the future.
- Never invent prices, stores, order numbers or dates.
- No em dashes.`;

// Today in Houston, as YYYY-MM-DD plus the weekday.
export function houstonToday(now = new Date()) {
  const parts = Object.fromEntries(new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/Chicago', year: 'numeric', month: '2-digit', day: '2-digit', weekday: 'long',
  }).formatToParts(now).map((p) => [p.type, p.value]));
  return `${parts.year}-${parts.month}-${parts.day} (${parts.weekday})`;
}

export function parserPrompt(state, message, now = new Date()) {
  return `${describeForParser(state)}\n\nToday is ${houstonToday(now)}.\n\nMessage: ${message}`;
}

// ---------- Firestore REST ----------

function docUrl(env, query = '') {
  return `https://firestore.googleapis.com/v1/projects/${env.FIREBASE_PROJECT_ID}/databases/(default)/documents/`
    + `${env.FIRESTORE_COLLECTION}/${env.FIRESTORE_DOC_ID}?key=${env.FIREBASE_API_KEY}${query}`;
}

export async function readDoc(env, fetchFn) {
  const res = await fetchFn(docUrl(env));
  if (!res.ok) throw new Error(`Firestore read failed (${res.status})`);
  const doc = await res.json();
  const f = doc.fields || {};
  return {
    updateTime: doc.updateTime,
    payload: JSON.parse(f.payload.stringValue),
    undo: f.undo ? JSON.parse(f.undo.stringValue) : null,
  };
}

// Writes only if nobody else wrote since `updateTime` (returns false on that conflict).
// The fields listed in the mask but missing from `undo` are deleted, which is how undo clears.
export async function writeDoc(env, fetchFn, updateTime, state, undo) {
  const fields = {
    payload: { stringValue: JSON.stringify(state) },
    updatedAt: { integerValue: String(state.updatedAt) },
  };
  if (undo) fields.undo = { stringValue: JSON.stringify(undo) };
  const mask = ['payload', 'updatedAt', 'undo'].map((p) => `&updateMask.fieldPaths=${p}`).join('');
  const res = await fetchFn(docUrl(env, `${mask}&currentDocument.updateTime=${encodeURIComponent(updateTime)}`), {
    method: 'PATCH',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ fields }),
  });
  if (res.status === 409 || res.status === 412) return false;
  if (!res.ok) throw new Error(`Firestore write failed (${res.status})`);
  return true;
}

// ---------- Request handling ----------

function safeEqual(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string' || a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i += 1) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

const reply = (text, status = 200) => new Response(text, { status, headers: { 'content-type': 'text/plain; charset=utf-8' } });

async function readMessage(request) {
  const raw = (await request.text()).trim();
  if (raw.startsWith('{')) {
    try { return String(JSON.parse(raw).text || '').trim(); } catch { return ''; }
  }
  return raw;
}

// deps: { fetch, parse(state, message) -> { question, ops }, now() }
export async function handle(request, env, deps) {
  if (request.method !== 'POST') return reply('Send a POST with your message.', 405);
  // Forgiving about stray spaces, line breaks and a missing "Bearer " from a pasted header.
  const auth = (request.headers.get('authorization') || '').trim();
  if (!auth) return reply('Not allowed: the Authorization header is missing.', 401);
  const token = auth.replace(/^bearer\s+/i, '').trim();
  if (!env.HOUSE_TOKEN || !safeEqual(token, env.HOUSE_TOKEN)) return reply("Not allowed: the token doesn't match.", 401);

  const message = await readMessage(request);
  if (!message) return reply('Say what changed, like "ordered the Frame TV from Best Buy, $1,999".');
  if (message.length > MAX_MESSAGE) return reply('That message is too long. Keep it to a sentence or two.');

  try {
    if (/^undo[.!]?$/i.test(message)) return reply(await undo(env, deps));

    let doc = await readDoc(env, deps.fetch);
    const parsed = await deps.parse(normalizeState(doc.payload), message);
    if (parsed.question) return reply(parsed.question);
    if (!parsed.ops || !parsed.ops.length) return reply("I couldn't tell what to change, so nothing changed.");

    // Apply against the freshest copy; if a device wrote in between, re-read and apply again.
    for (let attempt = 0; attempt < 3; attempt += 1) {
      const result = applyTextOps(normalizeState(doc.payload), toModelOps(parsed.ops));
      if (!result.ok) return reply(result.message);
      const next = stampUpdated(result.state, Math.max(deps.now(), doc.payload.updatedAt + 1));
      const undoInfo = { before: doc.payload, after: next.updatedAt, summary: result.summary };
      if (await writeDoc(env, deps.fetch, doc.updateTime, next, undoInfo)) return reply(`${result.summary}.`);
      doc = await readDoc(env, deps.fetch);
    }
    return reply('The list kept changing while I saved. Try again in a moment.');
  } catch (err) {
    console.error(err);
    return reply(`Something went wrong, nothing changed. (${err.message})`, 500);
  }
}

// Puts back the copy from before the last text, as long as nothing else changed since.
async function undo(env, deps) {
  const doc = await readDoc(env, deps.fetch);
  if (!doc.undo || doc.undo.after !== doc.payload.updatedAt) {
    return 'Nothing to undo. The list has changed since the last text.';
  }
  const restored = stampUpdated(doc.undo.before, Math.max(deps.now(), doc.payload.updatedAt + 1));
  if (!(await writeDoc(env, deps.fetch, doc.updateTime, restored, null))) return 'The list just changed, so I left it alone.';
  return `Undid: ${doc.undo.summary}.`;
}
