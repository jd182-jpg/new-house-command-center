// Pure data logic for the New House Command Center.
// No DOM, no storage: everything here is unit tested in tests/model.test.js.

export const TASK_CATEGORIES = ['Closing', 'Repairs', 'Utilities', 'Internet and Wi-Fi', 'Address Changes', 'Mail'];
export const TASK_STATUSES = ['To do', 'In progress', 'Waiting', 'Done'];
export const TASK_PRIORITIES = ['High', 'Medium', 'Low'];

export const ITEM_PRIORITIES = ['Before move-in', 'First week', 'Later'];
export const ITEM_STATUSES = ['Idea', 'Researching', 'Ordered', 'Shipped', 'Delivered', 'Placed'];
// Statuses that mean money has left the building.
export const PURCHASED_STATUSES = ['Ordered', 'Shipped', 'Delivered', 'Placed'];
export const STAIR_OPTIONS = ['Need to check', 'Yes', 'No'];

export const DOC_KINDS = ['Estimate', 'Warranty', 'Notice', 'Receipt', 'Contract', 'Insurance', 'Manual', 'Other'];
export const APPOINTMENT_STATUSES = ['Scheduled', 'Done', 'Canceled'];

export const SCHEMA_VERSION = 1;

let idCounter = 0;
export function makeId(prefix = 'id') {
  idCounter += 1;
  return `${prefix}_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}${idCounter}`;
}

const num = (v, fallback = 0) => {
  const n = typeof v === 'string' ? parseFloat(v.replace(/[$,\s]/g, '')) : Number(v);
  return Number.isFinite(n) ? n : fallback;
};

// ---------- Factories ----------

export function createTask(fields = {}) {
  return {
    id: fields.id || makeId('task'),
    title: (fields.title || '').trim() || 'Untitled task',
    category: TASK_CATEGORIES.includes(fields.category) ? fields.category : 'Utilities',
    status: TASK_STATUSES.includes(fields.status) ? fields.status : 'To do',
    priority: TASK_PRIORITIES.includes(fields.priority) ? fields.priority : 'Medium',
    due: fields.due || '',
    notes: fields.notes || '',
    link: fields.link || '',
    contact: fields.contact || '',
    phone: fields.phone || '',
    confirmation: fields.confirmation || '',
    hint: fields.hint || '',
    order: Number.isFinite(fields.order) ? fields.order : 0,
  };
}

export function createLink(fields = {}) {
  return {
    id: fields.id || makeId('link'),
    label: fields.label || '',
    url: fields.url || '',
    price: fields.price === '' || fields.price == null ? null : num(fields.price, null),
  };
}

export function createItem(fields = {}) {
  const dims = fields.dims || {};
  return {
    id: fields.id || makeId('item'),
    name: (fields.name || '').trim() || 'New item',
    room: fields.room || 'Whole house',
    category: fields.category || 'Other',
    priority: ITEM_PRIORITIES.includes(fields.priority) ? fields.priority : 'First week',
    status: ITEM_STATUSES.includes(fields.status) ? fields.status : 'Idea',
    qty: Math.max(1, Math.round(num(fields.qty, 1)) || 1),
    unitPrice: fields.unitPrice === '' || fields.unitPrice == null ? null : num(fields.unitPrice, null),
    store: fields.store || '',
    // A single legacy `link` becomes the first option in `links`.
    links: Array.isArray(fields.links) && fields.links.length
      ? fields.links.map(createLink)
      : fields.link ? [createLink({ url: fields.link })] : [],
    chosenLinkId: fields.chosenLinkId || null,
    orderNumber: fields.orderNumber || '',
    expectedDelivery: fields.expectedDelivery || '',
    dims: {
      w: dims.w === '' || dims.w == null ? null : num(dims.w, null),
      d: dims.d === '' || dims.d == null ? null : num(dims.d, null),
      h: dims.h === '' || dims.h == null ? null : num(dims.h, null),
    },
    stairOk: STAIR_OPTIONS.includes(fields.stairOk) ? fields.stairOk : 'Need to check',
    notes: fields.notes || '',
    source: fields.source || 'starter',
    // Remembered so un-ticking an item in shopping mode restores where it was.
    prevStatus: ITEM_STATUSES.includes(fields.prevStatus) ? fields.prevStatus : null,
    order: Number.isFinite(fields.order) ? fields.order : 0,
  };
}

const hhmm = (v) => (/^([01]\d|2[0-3]):[0-5]\d$/.test(v || '') ? v : '');

// A visit or booking: install, inspection, delivery window, HOA meeting.
export function createAppointment(fields = {}) {
  return {
    id: fields.id || makeId('appt'),
    title: (fields.title || '').trim() || 'Appointment',
    date: fields.date || '',
    start: hhmm(fields.start),
    end: hhmm(fields.end),
    status: APPOINTMENT_STATUSES.includes(fields.status) ? fields.status : 'Scheduled',
    who: fields.who || '',
    phone: fields.phone || '',
    location: fields.location || '',
    confirmation: fields.confirmation || '',
    notes: fields.notes || '',
    taskId: fields.taskId || null,
    itemId: fields.itemId || null,
    source: fields.source || 'manual',
  };
}

// A filed paper: estimate, warranty, notice, receipt. Files live in OneDrive; this keeps the facts and links.
export function createDocument(fields = {}) {
  return {
    id: fields.id || makeId('doc'),
    title: (fields.title || '').trim() || 'Document',
    kind: DOC_KINDS.includes(fields.kind) ? fields.kind : 'Other',
    vendor: fields.vendor || '',
    amount: fields.amount === '' || fields.amount == null ? null : num(fields.amount, null),
    date: fields.date || '',
    expires: fields.expires || '',
    summary: fields.summary || '',
    files: Array.isArray(fields.files)
      ? fields.files.filter((f) => f && f.name).map((f) => ({ name: String(f.name), path: f.path || '', webUrl: f.webUrl || '', driveId: f.driveId || '', size: Number(f.size) || 0 }))
      : [],
    taskId: fields.taskId || null,
    itemId: fields.itemId || null,
    source: fields.source || 'manual',
    addedAt: fields.addedAt || '',
  };
}

// Builds a fresh app state from the seed module.
export function buildStateFromSeed(seed) {
  const base = normalizeState({
    version: SCHEMA_VERSION,
    settings: { ...seed.settings },
    tasks: seed.tasks.map((t, i) => ({ ...t, order: i })),
    items: seed.items.map((it, i) => ({ ...it, order: i })),
    homeInfo: JSON.parse(JSON.stringify(seed.homeInfo)),
    rooms: seed.rooms.map((r) => ({ ...r })),
  });
  // Later facts (seed.updates) are layered on top, exactly as they reach existing data.
  return applySeedUpdates(base, seed.updates || []).state;
}

// Accepts anything that looks like saved state (including imports) and makes it safe to use.
export function normalizeState(raw) {
  if (!raw || typeof raw !== 'object') throw new Error('That file is not a Command Center backup.');
  if (!Array.isArray(raw.tasks) || !Array.isArray(raw.items)) {
    throw new Error('Backup is missing tasks or items.');
  }
  const settings = raw.settings || {};
  return {
    version: SCHEMA_VERSION,
    settings: {
      closingDate: settings.closingDate || '',
      moveInDate: settings.moveInDate || '',
      budget: settings.budget === '' || settings.budget == null ? null : num(settings.budget, null),
      roomBudgets: { ...(settings.roomBudgets || {}) },
      theme: ['light', 'dark', 'auto'].includes(settings.theme) ? settings.theme : 'auto',
      syncWifiPasswords: settings.syncWifiPasswords === true,
    },
    tasks: raw.tasks.map(createTask),
    items: raw.items.map(createItem),
    homeInfo: raw.homeInfo && typeof raw.homeInfo === 'object' ? raw.homeInfo : {},
    rooms: Array.isArray(raw.rooms) ? raw.rooms : [],
    appointments: Array.isArray(raw.appointments) ? raw.appointments.map(createAppointment) : [],
    documents: Array.isArray(raw.documents) ? raw.documents.map(createDocument) : [],
    appliedUpdates: Array.isArray(raw.appliedUpdates) ? raw.appliedUpdates.filter((x) => typeof x === 'string') : [],
    // Milliseconds of the last edit. 0 means untouched seed data, so any real copy beats it.
    updatedAt: Number.isFinite(raw.updatedAt) && raw.updatedAt > 0 ? raw.updatedAt : 0,
  };
}

// ---------- Seed updates ----------

// Seed updates deliver new facts to data you are already using, once per update id.
// They only fill gaps: new tasks are added by id, settings are set only when blank, and
// edits to existing tasks and items match by title or name (or a task's id) and leave deleted ones alone.
// update: { id, settings, addTasks, editTasks: [{ title | id, set }], editItems: [{ name, set }],
//           addContacts, appendNotes }
export function pendingUpdates(state, updates = []) {
  const done = new Set(state.appliedUpdates || []);
  return updates.filter((u) => !done.has(u.id));
}

export function applySeedUpdates(state, updates = []) {
  const pending = pendingUpdates(state, updates);
  if (!pending.length) return { state, changed: false };
  const next = JSON.parse(JSON.stringify(state));
  next.appliedUpdates = [...(next.appliedUpdates || [])];
  for (const u of pending) {
    for (const [k, v] of Object.entries(u.settings || {})) {
      if (next.settings[k] === '' || next.settings[k] == null) next.settings[k] = v;
    }
    let order = Math.max(-1, ...next.tasks.map((t) => t.order));
    for (const t of u.addTasks || []) {
      if (!next.tasks.some((x) => x.id === t.id)) next.tasks.push(createTask({ ...t, order: (order += 1) }));
    }
    for (const { id, title, set } of u.editTasks || []) {
      const t = next.tasks.find((x) => (id ? x.id === id : x.title === title));
      if (t) Object.assign(t, setOrFill(t, set));
    }
    for (const { name, set } of u.editItems || []) {
      const it = next.items.find((x) => x.name === name);
      if (it) Object.assign(it, setOrFill(it, set));
    }
    if (u.addContacts) {
      next.homeInfo.contacts = next.homeInfo.contacts || [];
      for (const c of u.addContacts) {
        if (!next.homeInfo.contacts.some((x) => x.role === c.role)) next.homeInfo.contacts.push({ ...c });
      }
    }
    if (u.appendNotes) {
      const cur = next.homeInfo.notes || '';
      if (!cur.includes(u.appendNotes)) next.homeInfo.notes = cur ? `${cur}\n\n${u.appendNotes}` : u.appendNotes;
    }
    next.appliedUpdates.push(u.id);
  }
  return { state: normalizeState(next), changed: true };
}

// `set` keys ending in "?" only fill a blank field (so your own due dates win); others overwrite.
function setOrFill(target, set) {
  const out = {};
  for (const [key, v] of Object.entries(set)) {
    if (key.endsWith('?')) {
      const k = key.slice(0, -1);
      if (target[k] === '' || target[k] == null) out[k] = v;
    } else out[key] = v;
  }
  return out;
}

// ---------- Sync ----------

// Home Info fields that stay on each device unless syncWifiPasswords is turned on.
export const SECRET_HOME_KEYS = ['wifiPassword', 'guestWifiPassword'];

// Marks the state as edited now. Always moves forward, even if the clock was set back.
export function stampUpdated(state, now = Date.now()) {
  state.updatedAt = Math.max(now, (state.updatedAt || 0) + 1);
  return state;
}

// The copy that goes to the cloud: Wi-Fi passwords removed unless the user opted in.
export function toSyncPayload(state) {
  const copy = JSON.parse(JSON.stringify(state));
  if (!copy.settings || !copy.settings.syncWifiPasswords) {
    for (const k of SECRET_HOME_KEYS) delete copy.homeInfo[k];
  }
  return copy;
}

// Builds the state to adopt from a newer remote copy. When the remote copy does not carry
// passwords, this device keeps its own. When it does but a password is blank, the local one
// is kept too, so switching syncing on from a device without passwords can't erase them.
export function mergeRemote(local, remote) {
  const next = normalizeState(remote);
  next.homeInfo = { ...next.homeInfo };
  const mine = (local && local.homeInfo) || {};
  for (const k of SECRET_HOME_KEYS) {
    const keepLocal = !next.settings.syncWifiPasswords || !next.homeInfo[k];
    if (!keepLocal) continue;
    if (mine[k] != null) next.homeInfo[k] = mine[k];
    else delete next.homeInfo[k];
  }
  return next;
}

// Decides what to do when the cloud copy and this device disagree. Strictly by updatedAt:
//   'apply'  remote is newer, adopt `state`
//   'push'   this device is newer (or the cloud is empty), upload it
//   'none'   same timestamp, nothing to do
// `remote` is null when the cloud document does not exist yet. Data saved before sync existed
// (PRE_SYNC) is stamped as current (`state`) when it uploads, so a second device still holding
// pre-sync data adopts it instead of tying with it. Seed data (0) never claims to be current.
export const PRE_SYNC = 1;
export function reconcile(local, remote, now = Date.now()) {
  const lAt = Number(local && local.updatedAt) || 0;
  const claim = () => (lAt === PRE_SYNC || (!remote && lAt > 0)
    ? { action: 'push', state: stampUpdated({ ...local }, now) }
    : { action: 'push' });
  if (!remote) return claim();
  const rAt = Number(remote.updatedAt) || 0;
  if (rAt > lAt) return { action: 'apply', state: mergeRemote(local, remote) };
  if (lAt > rAt) return claim();
  return { action: 'none' };
}

// ---------- Money ----------

// The price we trust: the item's own unit price, else the chosen link's price.
export function effectiveUnitPrice(item) {
  if (item.unitPrice != null) return item.unitPrice;
  const chosen = (item.links || []).find((l) => l.id === item.chosenLinkId);
  return chosen && chosen.price != null ? chosen.price : null;
}

export function itemTotal(item) {
  const p = effectiveUnitPrice(item);
  return p == null ? 0 : roundMoney(p * (item.qty || 1));
}

export const isPurchased = (item) => PURCHASED_STATUSES.includes(item.status);

export function roundMoney(n) {
  return Math.round(n * 100) / 100;
}

// spent: purchased items. planned: everything with a price (purchased or not).
export function budgetSummary(items, budget) {
  let spent = 0;
  let planned = 0;
  let unpriced = 0;
  const statusCounts = Object.fromEntries(ITEM_STATUSES.map((s) => [s, 0]));
  for (const it of items) {
    const total = itemTotal(it);
    planned += total;
    if (isPurchased(it)) spent += total;
    if (effectiveUnitPrice(it) == null) unpriced += 1;
    statusCounts[it.status] = (statusCounts[it.status] || 0) + 1;
  }
  spent = roundMoney(spent);
  planned = roundMoney(planned);
  const hasBudget = budget != null && budget > 0;
  return {
    budget: hasBudget ? budget : null,
    spent,
    planned,
    unpriced,
    remaining: hasBudget ? roundMoney(budget - spent) : null,
    remainingAfterPlanned: hasBudget ? roundMoney(budget - planned) : null,
    overBudget: hasBudget && spent > budget,
    plannedOverBudget: hasBudget && planned > budget,
    pctSpent: hasBudget ? Math.min(100, Math.round((spent / budget) * 100)) : null,
    statusCounts,
  };
}

export function roomSummaries(items, roomNames, roomBudgets = {}) {
  const names = [...roomNames];
  for (const it of items) if (!names.includes(it.room)) names.push(it.room);
  return names.map((room) => {
    const roomItems = items.filter((it) => it.room === room);
    const b = roomBudgets[room];
    return { room, count: roomItems.length, ...budgetSummary(roomItems, b == null || b === '' ? null : num(b, null)) };
  });
}

// ---------- Progress ----------

export function taskProgress(tasks, category) {
  const list = category ? tasks.filter((t) => t.category === category) : tasks;
  const done = list.filter((t) => t.status === 'Done').length;
  return { done, total: list.length, pct: list.length ? Math.round((done / list.length) * 100) : 0 };
}

export function shoppingProgress(items) {
  const done = items.filter(isPurchased).length;
  return { done, total: items.length, pct: items.length ? Math.round((done / items.length) * 100) : 0 };
}

export function overallProgress(tasks, items) {
  const t = taskProgress(tasks);
  const s = shoppingProgress(items);
  const total = t.total + s.total;
  const done = t.done + s.done;
  return { done, total, pct: total ? Math.round((done / total) * 100) : 0 };
}

// ---------- Dates ----------

export function todayISO(now = new Date()) {
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

// Whole days from today to an ISO date (negative means it has passed). Null if no date.
export function daysUntil(iso, now = new Date()) {
  if (!iso) return null;
  const [y, m, d] = iso.split('-').map(Number);
  if (!y || !m || !d) return null;
  const target = Date.UTC(y, m - 1, d);
  const today = Date.UTC(now.getFullYear(), now.getMonth(), now.getDate());
  return Math.round((target - today) / 86400000);
}

export const isOverdue = (task, now = new Date()) =>
  task.status !== 'Done' && task.due !== '' && daysUntil(task.due, now) < 0;

// Top open tasks: overdue first, then priority, then soonest due date, then manual order.
export function doNext(tasks, limit = 5, now = new Date()) {
  const rank = { High: 0, Medium: 1, Low: 2 };
  return tasks
    .filter((t) => t.status !== 'Done')
    .sort((a, b) => {
      const ao = isOverdue(a, now) ? 0 : 1;
      const bo = isOverdue(b, now) ? 0 : 1;
      if (ao !== bo) return ao - bo;
      if (rank[a.priority] !== rank[b.priority]) return rank[a.priority] - rank[b.priority];
      const ad = a.due || '9999-12-31';
      const bd = b.due || '9999-12-31';
      if (ad !== bd) return ad < bd ? -1 : 1;
      return a.order - b.order;
    })
    .slice(0, limit);
}

// ---------- Ordering ----------

// Moves the task with dragId to sit just before targetId (or to the end when targetId is null)
// and rewrites order numbers so they stay dense.
export function reorder(list, dragId, targetId) {
  const sorted = [...list].sort((a, b) => a.order - b.order);
  const from = sorted.findIndex((x) => x.id === dragId);
  if (from < 0) return list;
  const [moved] = sorted.splice(from, 1);
  const to = targetId == null ? sorted.length : sorted.findIndex((x) => x.id === targetId);
  sorted.splice(to < 0 ? sorted.length : to, 0, moved);
  const orderById = new Map(sorted.map((x, i) => [x.id, i]));
  return list.map((x) => ({ ...x, order: orderById.get(x.id) }));
}

// ---------- Fit check ----------

// Friendly, rough comparison of an item to its room. Returns null when there is nothing to say.
export function fitCheck(item, room) {
  if (!room || !room.w || !room.l) return null;
  const { w, d } = item.dims || {};
  if (!w) return null;
  const longWallIn = Math.max(room.w, room.l) * 12;
  const shortWallIn = Math.min(room.w, room.l) * 12;
  const pctLong = Math.round((w / longWallIn) * 100);
  const pctShort = Math.round((w / shortWallIn) * 100);
  const footprintPct = d ? Math.round(((w * d) / (room.w * room.l * 144)) * 100) : null;
  const sizeLabel = `${room.w}x${room.l} ft`;

  let level;
  let message;
  if (w > longWallIn) {
    level = 'tight';
    message = `At ${fmtIn(w)}, this is wider than the longest wall in the ${room.name} (${sizeLabel}). Double check the numbers.`;
  } else if (w > shortWallIn) {
    level = 'watch';
    message = `${fmtIn(w)} wide: fits along the ${Math.max(room.w, room.l)} ft wall (about ${pctLong}%) but not the ${Math.min(room.w, room.l)} ft one.`;
  } else if (pctShort > 75) {
    level = 'watch';
    message = `${fmtIn(w)} wide takes about ${pctShort}% of the ${Math.min(room.w, room.l)} ft wall. Snug, leave ~36 in walkways.`;
  } else {
    level = 'roomy';
    message = `${fmtIn(w)} wide in a ${sizeLabel} room: about ${pctLong}% of the long wall. Room to spare.`;
  }
  if (footprintPct != null) message += ` Footprint is ~${footprintPct}% of the floor.`;
  return { level, message, pctLong, pctShort, footprintPct };
}

function fmtIn(inches) {
  return `${Math.round(inches)} in`;
}

// Large pieces headed above floor 1 deserve a stair check.
export function stairWarning(item, room) {
  if (!room || !room.level || room.level < 2) return null;
  const { w, d, h } = item.dims || {};
  const longest = Math.max(w || 0, d || 0, h || 0);
  if (item.stairOk === 'No') return `Marked as not fitting the stairs to floor ${room.level}. Look for knock-down or modular.`;
  if (longest >= 80 && item.stairOk !== 'Yes') {
    return `Long piece (${Math.round(longest)} in) going up to floor ${room.level}. Confirm it clears the stair turn.`;
  }
  return null;
}

// ---------- Wi-Fi QR ----------

// Standard Wi-Fi QR payload. Special characters must be backslash escaped.
export function wifiQrPayload(ssid, password, security = 'WPA') {
  if (!ssid) return '';
  const esc = (s) => String(s).replace(/([\\;,:"])/g, '\\$1');
  const type = password ? security : 'nopass';
  return `WIFI:T:${type};S:${esc(ssid)};P:${password ? esc(password) : ''};;`;
}

// ---------- Formatting ----------

export function formatMoney(n, { cents = false } = {}) {
  if (n == null || !Number.isFinite(n)) return '';
  return n.toLocaleString('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: cents ? 2 : 0,
    maximumFractionDigits: cents ? 2 : 0,
  });
}

// ---------- Text updates ----------

// Plain-English updates ("ordered the Frame TV from Best Buy, $1,999") arrive through the
// Worker in worker/, which asks Claude to turn the message into these operations. The rules
// for applying them live here so the app and the Worker agree, and so they are unit tested.
//
// op kinds:
//   updateTask { taskId, status?, due?, confirmation?, notes? }   notes are appended
//   addTask    { title, category?, priority?, due?, notes? }
//   updateItem { itemId, status?, unitPrice?, qty?, store?, url?, orderNumber?, expectedDelivery?, notes? }
//   addItem    { name, room?, category?, priority?, status?, unitPrice?, qty?, store?, url?, notes? }
//   setDates   { closingDate?, moveInDate? }
//   addAppointment    { title, date, start?, end?, who?, phone?, location?, confirmation?, notes?, taskId?, itemId? }
//   updateAppointment { appointmentId, date?, start?, end?, status?, who?, phone?, location?, confirmation?, notes? }
//   addDocument { title, docKind?, vendor?, amount?, date?, expires?, summary?, files?, taskId?, itemId? }
//   addContact  { role, name, phone?, email? }
//
// The only part of homeInfo touched is the contact list, so Wi-Fi passwords can't be.

export const TEXT_OP_KINDS = ['updateTask', 'addTask', 'updateItem', 'addItem', 'setDates',
  'addAppointment', 'updateAppointment', 'addDocument', 'addContact'];

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

// "2026-11-22" -> "Nov 22"
export function shortDate(iso) {
  if (!ISO_DATE.test(iso || '')) return iso || '';
  const [, m, d] = iso.split('-').map(Number);
  return `${MONTHS[m - 1]} ${d}`;
}

const pickEnum = (list, v) => list.find((x) => x.toLowerCase() === String(v).trim().toLowerCase());
const has = (o, k) => o[k] != null && o[k] !== '';
const sameName = (a, b) => a.trim().toLowerCase() === b.trim().toLowerCase();

function validUrl(url) {
  try {
    const u = new URL(url);
    return u.protocol === 'https:' || u.protocol === 'http:';
  } catch {
    return false;
  }
}

function hostLabel(url) {
  try { return new URL(url).hostname.replace(/^www\./, ''); } catch { return ''; }
}

// The compact view of the list that the parser sees. Ids let it point at an exact row.
export function describeForParser(state) {
  const lines = [
    `Closing date: ${state.settings.closingDate || 'not set'}. Move-in date: ${state.settings.moveInDate || 'not set'}.`,
    `Rooms: ${state.rooms.map((r) => r.name).join(', ')}`,
    '',
    'TASKS (id | status | category | due | title)',
    ...state.tasks.map((t) => `${t.id} | ${t.status} | ${t.category} | ${t.due || '-'} | ${t.title}`),
    '',
    'ITEMS (id | status | room | price | store | name)',
    ...state.items.map((i) => {
      const p = effectiveUnitPrice(i);
      return `${i.id} | ${i.status} | ${i.room} | ${p == null ? '-' : p} | ${i.store || '-'} | ${i.name}`;
    }),
  ];
  const appts = state.appointments || [];
  if (appts.length) {
    lines.push('', 'APPOINTMENTS (id | status | date | time | who | title)',
      ...appts.map((a) => `${a.id} | ${a.status} | ${a.date || '-'} | ${a.start || '-'} | ${a.who || '-'} | ${a.title}`));
  }
  const docs = state.documents || [];
  if (docs.length) {
    lines.push('', 'DOCUMENTS (id | kind | date | vendor | title)',
      ...docs.map((d) => `${d.id} | ${d.kind} | ${d.date || '-'} | ${d.vendor || '-'} | ${d.title}`));
  }
  return lines.join('\n');
}

const APPT_FIELDS = ['date', 'start', 'end', 'who', 'phone', 'location', 'confirmation', 'notes', 'taskId', 'itemId'];
const DOC_FIELDS = ['vendor', 'date', 'expires', 'summary', 'files', 'taskId', 'itemId'];

function pickFields(op, keys) {
  const out = {};
  for (const k of keys) if (has(op, k)) out[k] = k === 'files' ? op[k] : (typeof op[k] === 'string' ? op[k].trim() : op[k]);
  return out;
}

// taskId and itemId must point at rows that exist.
function checkLinks(state, op) {
  if (has(op, 'taskId') && !state.tasks.some((t) => t.id === op.taskId)) return "I couldn't find the task to link that to, so nothing changed.";
  if (has(op, 'itemId') && !state.items.some((i) => i.id === op.itemId)) return "I couldn't find the item to link that to, so nothing changed.";
  return null;
}

// "13:30" -> "1:30pm"
export function fmtTime(v) {
  if (!hhmm(v)) return '';
  const [h, m] = v.split(':').map(Number);
  return `${h % 12 || 12}${m ? `:${String(m).padStart(2, '0')}` : ''}${h < 12 ? 'am' : 'pm'}`;
}

// Checks every op and applies them all, or none. Returns
//   { ok: true, state, summary }   summary is a one-line confirmation
//   { ok: false, message }         message says what was wrong; state is unchanged
// The caller stamps updatedAt (stampUpdated) before saving.
export function applyTextOps(state, ops) {
  if (!Array.isArray(ops) || !ops.length) return { ok: false, message: 'Nothing to change.' };
  const next = JSON.parse(JSON.stringify(state));
  const parts = [];
  let taskOrder = Math.max(-1, ...next.tasks.map((t) => t.order));
  let itemOrder = Math.max(-1, ...next.items.map((i) => i.order));

  const fail = (message) => ({ ok: false, message });
  const checkDate = (v, label) => (ISO_DATE.test(v) ? null : `${label} "${v}" isn't a date I can use.`);

  for (const op of ops) {
    if (!op || !TEXT_OP_KINDS.includes(op.kind)) return fail(`I don't know how to do "${op && op.kind}".`);

    if (op.kind === 'updateTask' || op.kind === 'addTask') {
      let status = null;
      if (has(op, 'status')) {
        status = pickEnum(TASK_STATUSES, op.status);
        if (!status) return fail(`"${op.status}" isn't a task status. Use ${TASK_STATUSES.join(', ')}.`);
      }
      if (has(op, 'due')) { const e = checkDate(op.due, 'Due date'); if (e) return fail(e); }

      if (op.kind === 'updateTask') {
        const t = next.tasks.find((x) => x.id === op.taskId);
        if (!t) return fail("I couldn't tell which task you meant, so nothing changed.");
        const bits = [];
        if (status) { t.status = status; bits.push(status === 'Done' ? 'Done' : status); }
        if (has(op, 'due')) { t.due = op.due; bits.push(`due ${shortDate(op.due)}`); }
        if (has(op, 'confirmation')) { t.confirmation = String(op.confirmation); bits.push(`confirmation ${op.confirmation}`); }
        if (has(op, 'notes')) { t.notes = t.notes ? `${t.notes}\n${op.notes}` : String(op.notes); bits.push('note added'); }
        if (!bits.length) return fail(`I found '${t.title}' but not what to change.`);
        parts.push(`Marked '${t.title}' ${bits.join(', ')}`);
      } else {
        const title = String(op.title || '').trim();
        if (!title) return fail('A new task needs a title.');
        if (next.tasks.some((x) => sameName(x.title, title))) return fail(`'${title}' is already a task.`);
        const category = has(op, 'category') ? pickEnum(TASK_CATEGORIES, op.category) : null;
        const priority = has(op, 'priority') ? pickEnum(TASK_PRIORITIES, op.priority) : null;
        const t = createTask({
          title, category: category || 'Utilities', priority: priority || 'Medium',
          status: status || 'To do', due: op.due || '', notes: op.notes || '', order: (taskOrder += 1),
        });
        next.tasks.push(t);
        parts.push(`Added task '${t.title}' (${t.category}${t.due ? `, due ${shortDate(t.due)}` : ''})`);
      }
      continue;
    }

    if (op.kind === 'updateItem' || op.kind === 'addItem') {
      let status = null;
      if (has(op, 'status')) {
        status = pickEnum(ITEM_STATUSES, op.status);
        if (!status) return fail(`"${op.status}" isn't an item status. Use ${ITEM_STATUSES.join(', ')}.`);
      }
      if (has(op, 'expectedDelivery')) { const e = checkDate(op.expectedDelivery, 'Delivery date'); if (e) return fail(e); }
      if (has(op, 'url') && !validUrl(op.url)) return fail(`"${op.url}" isn't a web link.`);
      const price = has(op, 'unitPrice') ? num(op.unitPrice, null) : null;
      if (has(op, 'unitPrice') && (price == null || price < 0)) return fail(`"${op.unitPrice}" isn't a price.`);

      let it;
      const bits = [];
      if (op.kind === 'updateItem') {
        it = next.items.find((x) => x.id === op.itemId);
        if (!it) return fail("I couldn't tell which item you meant, so nothing changed.");
      } else {
        const name = String(op.name || '').trim();
        if (!name) return fail('A new item needs a name.');
        if (next.items.some((x) => sameName(x.name, name))) return fail(`'${name}' is already on the list. Say what to change about it instead.`);
        const room = (has(op, 'room') && (next.rooms.find((r) => sameName(r.name, String(op.room))) || {}).name) || 'Whole house';
        const priority = has(op, 'priority') ? pickEnum(ITEM_PRIORITIES, op.priority) : null;
        it = createItem({ name, room, category: op.category || 'Other', priority: priority || 'First week', source: 'mine', order: (itemOrder += 1) });
        next.items.push(it);
        bits.push(room);
      }

      if (status && status !== it.status) { it.prevStatus = it.status; it.status = status; }
      if (status) bits.push(status);
      if (price != null) { it.unitPrice = price; bits.push(formatMoney(price, { cents: price % 1 !== 0 })); }
      if (has(op, 'qty')) { it.qty = Math.max(1, Math.round(num(op.qty, 1)) || 1); bits.push(`qty ${it.qty}`); }
      if (has(op, 'store')) { it.store = String(op.store).trim(); bits.push(it.store); }
      if (has(op, 'url')) {
        let link = it.links.find((l) => l.url === op.url);
        if (!link) {
          link = createLink({ label: it.store || hostLabel(op.url), url: op.url, price });
          it.links.push(link);
        }
        it.chosenLinkId = link.id;
        bits.push('link saved');
      }
      if (has(op, 'orderNumber')) { it.orderNumber = String(op.orderNumber); bits.push(`order ${it.orderNumber}`); }
      if (has(op, 'expectedDelivery')) { it.expectedDelivery = op.expectedDelivery; bits.push(`arrives ${shortDate(op.expectedDelivery)}`); }
      if (has(op, 'notes')) { it.notes = it.notes ? `${it.notes}\n${op.notes}` : String(op.notes); bits.push('note added'); }

      if (op.kind === 'addItem') parts.push(`Added '${it.name}' (${bits.join(', ')})`);
      else if (!bits.length) return fail(`I found '${it.name}' but not what to change.`);
      else parts.push(`${status ? 'Marked' : 'Updated'} '${it.name}' ${bits.join(', ')}`);
      continue;
    }

    if (op.kind === 'addAppointment' || op.kind === 'updateAppointment') {
      for (const k of ['start', 'end']) {
        if (has(op, k) && !hhmm(op[k])) return fail(`"${op[k]}" isn't a time I can use (HH:MM).`);
      }
      if (has(op, 'date')) { const e = checkDate(op.date, 'The appointment date'); if (e) return fail(e); }
      let status = null;
      if (has(op, 'status')) {
        status = pickEnum(APPOINTMENT_STATUSES, op.status);
        if (!status) return fail(`"${op.status}" isn't an appointment status.`);
      }
      const linkErr = checkLinks(next, op);
      if (linkErr) return fail(linkErr);
      next.appointments = next.appointments || [];
      const when = (a) => `${shortDate(a.date)}${a.start ? ` ${fmtTime(a.start)}${a.end ? `-${fmtTime(a.end)}` : ''}` : ''}`;

      if (op.kind === 'addAppointment') {
        const title = String(op.title || '').trim();
        if (!title) return fail('A new appointment needs a title.');
        if (!has(op, 'date')) return fail(`What day is '${title}'?`);
        if (next.appointments.some((a) => sameName(a.title, title) && a.date === op.date)) return fail(`'${title}' on ${shortDate(op.date)} is already on the list.`);
        const a = createAppointment({ ...pickFields(op, APPT_FIELDS), title, status: status || 'Scheduled', source: op.source });
        next.appointments.push(a);
        parts.push(`Added appointment '${a.title}' ${when(a)}${a.who ? ` with ${a.who}` : ''}`);
      } else {
        const a = next.appointments.find((x) => x.id === op.appointmentId);
        if (!a) return fail("I couldn't tell which appointment you meant, so nothing changed.");
        const set = pickFields(op, APPT_FIELDS);
        if (status) set.status = status;
        if (!Object.keys(set).length) return fail(`I found '${a.title}' but not what to change.`);
        Object.assign(a, set);
        parts.push(`${status === 'Canceled' ? 'Canceled' : 'Updated'} appointment '${a.title}' ${when(a)}`);
      }
      continue;
    }

    if (op.kind === 'addDocument') {
      const title = String(op.title || '').trim();
      if (!title) return fail('A document needs a title.');
      for (const [k, label] of [['date', 'The document date'], ['expires', 'The expiry date']]) {
        if (has(op, k)) { const e = checkDate(op[k], label); if (e) return fail(e); }
      }
      const kind = has(op, 'docKind') ? pickEnum(DOC_KINDS, op.docKind) : 'Other';
      if (!kind) return fail(`"${op.docKind}" isn't a document kind. Use ${DOC_KINDS.join(', ')}.`);
      const amount = has(op, 'amount') ? num(op.amount, null) : null;
      if (has(op, 'amount') && amount == null) return fail(`"${op.amount}" isn't an amount.`);
      const linkErr = checkLinks(next, op);
      if (linkErr) return fail(linkErr);
      next.documents = next.documents || [];
      const d = createDocument({ ...pickFields(op, DOC_FIELDS), title, kind, amount, source: op.source, addedAt: op.addedAt });
      next.documents.push(d);
      const on = d.itemId ? next.items.find((x) => x.id === d.itemId).name : d.taskId ? next.tasks.find((x) => x.id === d.taskId).title : '';
      const bits = [d.kind, d.vendor, d.amount != null ? formatMoney(d.amount, { cents: d.amount % 1 !== 0 }) : '',
        d.expires ? `expires ${shortDate(d.expires)}` : '', d.files.length ? `${d.files.length} file${d.files.length === 1 ? '' : 's'}` : '',
        on ? `linked to '${on}'` : ''].filter(Boolean);
      parts.push(`Filed '${d.title}' (${bits.join(', ')})`);
      continue;
    }

    if (op.kind === 'addContact') {
      const name = String(op.name || '').trim();
      const role = String(op.role || '').trim();
      if (!name && !role) return fail('A contact needs a name or role.');
      next.homeInfo = next.homeInfo || {};
      const list = (next.homeInfo.contacts = next.homeInfo.contacts || []);
      const existing = list.find((c) => (name && c.name && sameName(c.name, name)) || (!c.name && role && c.role && sameName(c.role, role)));
      if (existing) {
        // Fill blanks only, so your own edits win.
        for (const k of ['role', 'name', 'phone', 'email']) if (!existing[k] && has(op, k)) existing[k] = String(op[k]).trim();
        parts.push(`Updated contact ${existing.name || existing.role}`);
      } else {
        list.push({ role, name, phone: String(op.phone || '').trim(), email: String(op.email || '').trim() });
        parts.push(`Added contact ${name || role}${role && name ? ` (${role})` : ''}`);
      }
      continue;
    }

    // setDates
    const bits = [];
    for (const [key, label] of [['closingDate', 'closing'], ['moveInDate', 'move-in']]) {
      if (!has(op, key)) continue;
      const e = checkDate(op[key], `The ${label} date`);
      if (e) return fail(e);
      next.settings[key] = op[key];
      bits.push(`${label} ${shortDate(op[key])}`);
    }
    if (!bits.length) return fail('Which date should change?');
    parts.push(`Set ${bits.join(' and ')}`);
  }

  return { ok: true, state: normalizeState(next), summary: parts.join('; ') };
}
