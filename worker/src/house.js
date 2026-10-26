// The text-update endpoint, minus the network clients, so tests can drive it with fakes.
// index.js wires in the real fetch and the Claude call.
import { safeFolder, fileNameFor, NEW_FOLDERS } from './onedrive.js';
import { applyTextOps, describeForParser, normalizeState, stampUpdated, TASK_CATEGORIES, TASK_STATUSES,
  ITEM_STATUSES, ITEM_PRIORITIES, TASK_PRIORITIES } from '../../js/model.js';

export const MAX_MESSAGE = 1000;
// Forwarded emails are long; this caps what goes to the parser.
export const MAX_FORWARD = 40000;

// What Claude sends back. Ids come from the listing in the prompt, so a vague message
// produces a question instead of a guess. One id, name and date field serve every kind;
// toModelOps maps them onto the ops in js/model.js.
export const PARSER_KINDS = ['updateTask', 'addTask', 'updateItem', 'addItem', 'setClosingDate', 'setMoveInDate',
  'addAppointment', 'updateAppointment', 'addDocument', 'addContact'];

const str = { type: 'string' };
// Input schema for the apply_changes tool. Structured outputs rejected an earlier, smaller
// shape as too complex, so it is a plain tool schema; applyTextOps checks every op anyway.
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
          name: { type: 'string', description: 'Title or name (adds only; the contact name for addContact).' },
          status: str, category: str, room: str, priority: str,
          date: { type: 'string', description: 'YYYY-MM-DD' },
          start: { type: 'string', description: 'HH:MM, 24 hour' },
          end: { type: 'string', description: 'HH:MM, 24 hour' },
          confirmation: str, unitPrice: { type: 'number' }, qty: { type: 'integer' },
          store: str, url: str, orderNumber: str, notes: str,
          who: str, phone: str, email: str, location: str, role: str,
          docKind: { type: 'string', description: 'Estimate, Warranty, Notice, Receipt, Contract, Insurance, Manual or Other' },
          vendor: str, amount: { type: 'number' },
          expires: { type: 'string', description: 'YYYY-MM-DD' },
          summary: str,
          taskId: { type: 'string', description: 'Link to this task id' },
          itemId: { type: 'string', description: 'Link to this shopping item id' },
          saveFiles: {
            type: 'array',
            description: 'addDocument only: attachments to save to OneDrive.',
            items: {
              type: 'object',
              required: ['attachment', 'folder', 'name'],
              properties: {
                attachment: { type: 'integer', description: 'Attachment number, or -1 to save the email itself' },
                folder: { type: 'string', description: 'Folder path inside the house folder' },
                name: { type: 'string', description: 'YYYY-MM-DD Vendor - what it is (no extension)' },
              },
            },
          },
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
      case 'addAppointment': return { kind, title: name, date, ...rest };
      case 'updateAppointment': return { kind, appointmentId: id, date, ...rest };
      case 'addDocument': return { kind, title: name, date, ...rest };
      case 'addContact': return { kind, name, ...rest };
      default: return { kind };
    }
  });
}

export const SYSTEM_PROMPT = `You turn a message from Jackson into edits to his move-in tracker for 2608 Montrose Blvd, Houston.
The user turn holds his current tasks, shopping items, appointments and documents (each with an id), today's date, and his message. A message is either a short text, or a forwarded email (with any attachments) and maybe a note from him on top.

When there is something to change, call apply_changes once with all the ops. When the message is unclear, do not call the tool: reply with one short question instead.

Op kinds (leave out every field he did not mention):
- updateTask: id plus any of status (${TASK_STATUSES.join(', ')}), date (the due date), confirmation, notes. "done: X" means status Done.
- addTask: name (the title), optional category (${TASK_CATEGORIES.join(', ')}), priority (${TASK_PRIORITIES.join(', ')}), date (due), notes.
- updateItem: id plus any of status (${ITEM_STATUSES.join(', ')}), unitPrice (number, per unit), qty, store, url, orderNumber, date (expected delivery), notes. "ordered/bought" means Ordered, "shipped" Shipped, "arrived/delivered" Delivered, "set up/hung/installed" Placed.
- addItem: name, room (one of his rooms), optional category, priority (${ITEM_PRIORITIES.join(', ')}), status, unitPrice, qty, store, url, notes.
- setClosingDate / setMoveInDate: date.
- addAppointment: name (short title, like "Xfinity install"), date, start and end (24 hour HH:MM, for an arrival window use its start and end), who (company or person), phone, location (only if not the house), confirmation, notes, taskId or itemId when it clearly belongs to one.
- updateAppointment: id plus the fields that changed. A reschedule changes date and times; a cancellation sets status Canceled.
- addDocument: name (short title), docKind, vendor, amount (the total, as a number), date (the document's date), expires (warranty or policy end), summary (one or two sentences: scope, key terms, what he must do), taskId or itemId when it clearly belongs to one, saveFiles.
- addContact: name (business or person), role (what they do for the house), phone, email. Only for businesses or people working on the house, not marketing senders.

Rules:
- Use only ids that appear in the listing. Match loosely on meaning ("the Frame TV" is "Samsung The Frame Pro"; calling CenterPoint is about gas service).
- For a short text: if more than one row could fit, or none clearly fits an update, don't call the tool. Ask a short question naming the candidates. Only add when he asks to add something.
- For a forwarded email, file what it is about without being asked:
  - A booked visit, install, delivery window or meeting: addAppointment (or updateAppointment if it is already listed).
  - An estimate, quote, invoice, receipt, warranty, policy, contract, manual or official notice: addDocument, with saveFiles for each real attachment. Skip logos, signature images and tracking pixels. If the important content is only in the email body (no attachment), save the email itself with attachment -1.
  - If it asks him to do or pay something by a date: addTask with that due date, unless a task already covers it (then updateTask).
  - An order or shipping confirmation for something on his list: updateItem.
  - New businesses working on the house: addContact.
  - His note on top wins over your own reading. If nothing in it is about the house, don't call the tool and say so.
- Folders for saveFiles: pick the best fit from the folder list in the user turn. Estimates and quotes go in "04 Quotes and Estimates", HOA items in "03 HOA", contractor paperwork in "07 Renovation and Contractors/<company>", closing and title papers in "01 Contract and Closing", warranties, manuals and receipts in "08 Warranties and Receipts", utility and service accounts in "09 Utilities and Services". Use "00 Inbox" when unsure.
- File names: "YYYY-MM-DD Vendor - what it is", using the document's own date, no extension.
- Dates are YYYY-MM-DD. Resolve "Nov 22", "Friday", "tomorrow" against today's date, in the future.
- Never invent prices, stores, order numbers, dates or phone numbers.
- No em dashes.`;

// Today in Houston, as YYYY-MM-DD plus the weekday.
export function houstonToday(now = new Date()) {
  const parts = Object.fromEntries(new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/Chicago', year: 'numeric', month: '2-digit', day: '2-digit', weekday: 'long',
  }).formatToParts(now).map((p) => [p.type, p.value]));
  return `${parts.year}-${parts.month}-${parts.day} (${parts.weekday})`;
}

const kb = (n) => (n >= 1048576 ? `${(n / 1048576).toFixed(1)} MB` : `${Math.max(1, Math.round(n / 1024))} KB`);

// mail (forwards only): { attachments: [{ filename, mimeType, size }], folders: [names] }
export function parserPrompt(state, message, now = new Date(), mail = null) {
  let extra = '';
  if (mail) {
    const folders = [...new Set([...(mail.folders || []), ...NEW_FOLDERS])];
    const atts = (mail.attachments || []).map((a, i) => `[${i}] ${a.filename || 'unnamed'} (${a.mimeType}, ${kb(a.size)})`);
    extra = `\n\nFolders in the house folder: ${folders.join(', ')}\nAttachments:${atts.length ? `\n${atts.join('\n')}` : ' none'}`;
  }
  return `${describeForParser(state)}\n\nToday is ${houstonToday(now)}.${extra}\n\nMessage: ${message}`;
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

// Body is JSON { text, token? } or plain text. The token may ride in the body because the
// Shortcuts header editor is easy to get wrong.
async function readBody(request) {
  const raw = (await request.text()).trim();
  if (raw.startsWith('{')) {
    try {
      const body = JSON.parse(raw);
      return { message: String(body.text || '').trim(), token: String(body.token || '') };
    } catch { return { message: '', token: '' }; }
  }
  return { message: raw, token: '' };
}

// deps: { fetch, parse(state, message) -> { question, ops }, now() }
export async function handle(request, env, deps) {
  if (request.method !== 'POST') return reply('Send a POST with your message.', 405);
  const { message, token: bodyToken } = await readBody(request);
  // Forgiving about stray spaces and a missing "Bearer " in a pasted token.
  const auth = ((request.headers.get('authorization') || '').trim() || bodyToken.trim());
  if (!auth) return reply('Not allowed: no token. Add a "token" field to the JSON body.', 401);
  const token = auth.replace(/^bearer\s+/i, '').trim();
  if (!env.HOUSE_TOKEN || !safeEqual(token, env.HOUSE_TOKEN)) return reply("Not allowed: the token doesn't match.", 401);

  const { status, text } = await processMessage(message, env, deps);
  return reply(text, status);
}

// The shared core for the web endpoint and email: one message in, one line of reply out.
// Callers check who is asking first. mail (forwarded emails only) carries the attachments
// and the raw email: { attachments: [{ filename, mimeType, size, content }], raw, folders }.
// deps.files ({ upload(folder, name, bytes), remove(driveIds) }) is only needed with mail.
export async function processMessage(message, env, deps, mail = null) {
  const say = (text, status = 200, files = [], changed = false) => ({ status, text, files, changed });
  if (!message) return say('Say what changed, like "ordered the Frame TV from Best Buy, $1,999".');
  if (message.length > (mail ? MAX_FORWARD : MAX_MESSAGE)) {
    if (!mail) return say('That message is too long. Keep it to a sentence or two.');
    message = message.slice(0, MAX_FORWARD);
  }

  const uploaded = [];
  try {
    if (/^undo[.!]?$/i.test(message)) return say(await undo(env, deps));

    let doc = await readDoc(env, deps.fetch);
    const parsed = await deps.parse(normalizeState(doc.payload), message, mail);
    if (parsed.question) return say(parsed.question);
    if (!parsed.ops || !parsed.ops.length) return say("I couldn't tell what to change, so nothing changed.");
    const ops = toModelOps(parsed.ops);

    // Which files each document wants saved. Unknown attachment numbers are dropped.
    const wanted = (op) => (op.kind === 'addDocument' && mail && Array.isArray(op.saveFiles) ? op.saveFiles : [])
      .map((f) => ({ ...f, att: f.attachment === -1 ? { filename: 'email.eml', content: mail.raw } : mail.attachments[f.attachment] }))
      .filter((f) => f.att && f.att.content);

    // Dry run first, so nothing is uploaded for changes that would be rejected.
    const dry = applyTextOps(normalizeState(doc.payload), ops.map((op) => ({ ...op, files: wanted(op).map((f) => ({ name: f.name })) })));
    if (!dry.ok) return say(dry.message);

    for (const op of ops) {
      const files = [];
      for (const f of wanted(op)) {
        const folder = safeFolder(f.folder, mail.folders || []);
        const saved = await deps.files.upload(folder, fileNameFor(f.name, f.att.filename), f.att.content);
        uploaded.push(saved);
        files.push(saved);
      }
      if (op.kind === 'addDocument') {
        op.files = files;
        op.source = mail ? 'email' : 'text';
        op.addedAt = new Date(deps.now()).toISOString();
      }
      if (op.kind === 'addAppointment') op.source = mail ? 'email' : 'text';
      delete op.saveFiles;
    }

    // Apply against the freshest copy; if a device wrote in between, re-read and apply again.
    for (let attempt = 0; attempt < 3; attempt += 1) {
      const result = applyTextOps(normalizeState(doc.payload), ops);
      if (!result.ok) throw Object.assign(new Error(result.message), { userFacing: true });
      const next = stampUpdated(result.state, Math.max(deps.now(), doc.payload.updatedAt + 1));
      const undoInfo = { before: doc.payload, after: next.updatedAt, summary: result.summary, files: uploaded.map((f) => f.driveId) };
      if (await writeDoc(env, deps.fetch, doc.updateTime, next, undoInfo)) return say(`${result.summary}.`, 200, uploaded, true);
      doc = await readDoc(env, deps.fetch);
    }
    throw Object.assign(new Error('The list kept changing while I saved. Try again in a moment.'), { userFacing: true });
  } catch (err) {
    console.error(err);
    if (uploaded.length) await deps.files.remove(uploaded.map((f) => f.driveId));
    if (err.userFacing) return say(err.message);
    return say(`Something went wrong, nothing changed. (${err.message})`, 500);
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
  const files = doc.undo.files || [];
  if (files.length && deps.files) await deps.files.remove(files);
  return `Undid: ${doc.undo.summary}.${files.length ? ` Moved ${files.length} saved file${files.length === 1 ? '' : 's'} to the OneDrive recycle bin.` : ''}`;
}
