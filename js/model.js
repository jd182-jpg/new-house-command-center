// Pure data logic for the New House Command Center.
// No DOM, no storage: everything here is unit tested in tests/model.test.js.

export const TASK_CATEGORIES = ['Utilities', 'Internet and Wi-Fi', 'Address Changes', 'Mail'];
export const TASK_STATUSES = ['To do', 'In progress', 'Waiting', 'Done'];
export const TASK_PRIORITIES = ['High', 'Medium', 'Low'];

export const ITEM_PRIORITIES = ['Before move-in', 'First week', 'Later'];
export const ITEM_STATUSES = ['Idea', 'Researching', 'Ordered', 'Shipped', 'Delivered', 'Placed'];
// Statuses that mean money has left the building.
export const PURCHASED_STATUSES = ['Ordered', 'Shipped', 'Delivered', 'Placed'];
export const STAIR_OPTIONS = ['Need to check', 'Yes', 'No'];

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
    category: TASK_CATEGORIES.includes(fields.category) ? fields.category : TASK_CATEGORIES[0],
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

// Builds a fresh app state from the seed module.
export function buildStateFromSeed(seed) {
  return normalizeState({
    version: SCHEMA_VERSION,
    settings: { ...seed.settings },
    tasks: seed.tasks.map((t, i) => ({ ...t, order: i })),
    items: seed.items.map((it, i) => ({ ...it, order: i })),
    homeInfo: JSON.parse(JSON.stringify(seed.homeInfo)),
    rooms: seed.rooms.map((r) => ({ ...r })),
  });
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
    },
    tasks: raw.tasks.map(createTask),
    items: raw.items.map(createItem),
    homeInfo: raw.homeInfo && typeof raw.homeInfo === 'object' ? raw.homeInfo : {},
    rooms: Array.isArray(raw.rooms) ? raw.rooms : [],
  };
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
