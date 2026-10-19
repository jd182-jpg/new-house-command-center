import { test } from 'node:test';
import assert from 'node:assert/strict';
import seed from '../js/seed-data.js';
import {
  createItem, createTask, buildStateFromSeed, normalizeState, budgetSummary, roomSummaries,
  itemTotal, effectiveUnitPrice, taskProgress, shoppingProgress, overallProgress, doNext,
  daysUntil, isOverdue, reorder, fitCheck, stairWarning, wifiQrPayload, TASK_CATEGORIES, applySeedUpdates,
  reconcile, stampUpdated, toSyncPayload, SECRET_HOME_KEYS,
} from '../js/model.js';

const NOW = new Date(2026, 9, 17); // Oct 17 2026, local time

test('seed builds a valid state with every task category covered', () => {
  const state = buildStateFromSeed(seed);
  assert.ok(state.tasks.length > 20);
  assert.ok(state.items.length > 50);
  for (const c of TASK_CATEGORIES) assert.ok(state.tasks.some((t) => t.category === c), c);
  assert.equal(state.settings.closingDate, '2026-11-13');
  assert.equal(state.settings.moveInDate, '2026-11-20');
  const ids = new Set([...state.tasks, ...state.items].map((x) => x.id));
  assert.equal(ids.size, state.tasks.length + state.items.length, 'ids are unique');
});

test('seed includes every item from your list', () => {
  const names = seed.items.filter((i) => i.source === 'mine').map((i) => i.name);
  assert.equal(names.length, 20);
});

test('seed rooms all exist for every seeded item', () => {
  const roomNames = seed.rooms.map((r) => r.name);
  for (const it of seed.items) assert.ok(roomNames.includes(it.room), `${it.name} -> ${it.room}`);
});

test('no em dashes in seed text', () => {
  assert.ok(!JSON.stringify(seed).includes('\u2014'));
});

test('createItem fills defaults and coerces numbers', () => {
  const it = createItem({ name: '  Sofa ', qty: '2', unitPrice: '$1,250.50', dims: { w: '96' } });
  assert.equal(it.name, 'Sofa');
  assert.equal(it.qty, 2);
  assert.equal(it.unitPrice, 1250.5);
  assert.equal(it.dims.w, 96);
  assert.equal(it.dims.d, null);
  assert.equal(it.status, 'Idea');
  assert.equal(it.stairOk, 'Need to check');
});

test('createTask rejects unknown enums', () => {
  const t = createTask({ title: 'x', status: 'Nope', priority: 'Urgent', category: 'Pets' });
  assert.equal(t.status, 'To do');
  assert.equal(t.priority, 'Medium');
  assert.equal(t.category, 'Utilities');
});

test('effective price falls back to the chosen link', () => {
  const it = createItem({
    name: 'Lamp', qty: 2,
    links: [{ id: 'a', url: 'https://a', price: 80 }, { id: 'b', url: 'https://b', price: 120 }],
    chosenLinkId: 'b',
  });
  assert.equal(effectiveUnitPrice(it), 120);
  assert.equal(itemTotal(it), 240);
  it.unitPrice = 99.99;
  assert.equal(itemTotal(it), 199.98);
});

test('budget summary counts only purchased items as spent', () => {
  const items = [
    createItem({ name: 'a', unitPrice: 100, qty: 2, status: 'Ordered' }),
    createItem({ name: 'b', unitPrice: 50, status: 'Placed' }),
    createItem({ name: 'c', unitPrice: 300, status: 'Researching' }),
    createItem({ name: 'd', status: 'Idea' }),
  ];
  const s = budgetSummary(items, 400);
  assert.equal(s.spent, 250);
  assert.equal(s.planned, 550);
  assert.equal(s.remaining, 150);
  assert.equal(s.remainingAfterPlanned, -150);
  assert.equal(s.overBudget, false);
  assert.equal(s.plannedOverBudget, true);
  assert.equal(s.unpriced, 1);
  assert.equal(s.pctSpent, 63);
  assert.equal(s.statusCounts.Ordered, 1);
  assert.equal(s.statusCounts.Idea, 1);
});

test('budget summary flags over budget and handles no budget', () => {
  const items = [createItem({ name: 'a', unitPrice: 500, status: 'Delivered' })];
  assert.equal(budgetSummary(items, 400).overBudget, true);
  const none = budgetSummary(items, null);
  assert.equal(none.remaining, null);
  assert.equal(none.overBudget, false);
});

test('floating point money stays clean', () => {
  const items = [0.1, 0.2].map((p) => createItem({ name: 'x', unitPrice: p, status: 'Ordered' }));
  assert.equal(budgetSummary(items, 1).spent, 0.3);
});

test('room summaries use per-room budgets and include stray rooms', () => {
  const items = [
    createItem({ name: 'a', room: 'Living', unitPrice: 1000, status: 'Ordered' }),
    createItem({ name: 'b', room: 'Attic', unitPrice: 10, status: 'Ordered' }),
  ];
  const rows = roomSummaries(items, ['Living', 'Kitchen'], { Living: '800' });
  const living = rows.find((r) => r.room === 'Living');
  assert.equal(living.overBudget, true);
  assert.equal(living.remaining, -200);
  assert.ok(rows.find((r) => r.room === 'Attic'));
  assert.equal(rows.find((r) => r.room === 'Kitchen').count, 0);
});

test('progress math', () => {
  const tasks = [
    createTask({ title: 'a', status: 'Done', category: 'Mail' }),
    createTask({ title: 'b', category: 'Mail' }),
    createTask({ title: 'c', category: 'Utilities' }),
  ];
  const items = [createItem({ name: 'x', status: 'Shipped' }), createItem({ name: 'y' })];
  assert.deepEqual(taskProgress(tasks, 'Mail'), { done: 1, total: 2, pct: 50 });
  assert.deepEqual(shoppingProgress(items), { done: 1, total: 2, pct: 50 });
  assert.deepEqual(overallProgress(tasks, items), { done: 2, total: 5, pct: 40 });
  assert.deepEqual(taskProgress([], 'Mail'), { done: 0, total: 0, pct: 0 });
});

test('daysUntil and overdue', () => {
  assert.equal(daysUntil('2026-10-20', NOW), 3);
  assert.equal(daysUntil('2026-10-16', NOW), -1);
  assert.equal(daysUntil('', NOW), null);
  assert.equal(isOverdue(createTask({ title: 'a', due: '2026-10-01' }), NOW), true);
  assert.equal(isOverdue(createTask({ title: 'a', due: '2026-10-01', status: 'Done' }), NOW), false);
});

test('doNext puts overdue first, then priority, then due date', () => {
  const tasks = [
    createTask({ id: 'low-overdue', title: 'a', priority: 'Low', due: '2026-10-01' }),
    createTask({ id: 'high-late', title: 'b', priority: 'High', due: '2026-12-01' }),
    createTask({ id: 'high-soon', title: 'c', priority: 'High', due: '2026-10-20' }),
    createTask({ id: 'high-nodate', title: 'd', priority: 'High' }),
    createTask({ id: 'done', title: 'e', priority: 'High', status: 'Done', due: '2026-01-01' }),
    createTask({ id: 'med', title: 'f', priority: 'Medium' }),
  ];
  const ids = doNext(tasks, 5, NOW).map((t) => t.id);
  assert.deepEqual(ids, ['low-overdue', 'high-soon', 'high-late', 'high-nodate', 'med']);
});

test('reorder moves an item before a target and keeps orders dense', () => {
  const list = ['a', 'b', 'c', 'd'].map((id, i) => ({ id, order: i }));
  const out = reorder(list, 'd', 'b');
  const sorted = [...out].sort((x, y) => x.order - y.order).map((x) => x.id);
  assert.deepEqual(sorted, ['a', 'd', 'b', 'c']);
  const toEnd = reorder(list, 'a', null);
  assert.deepEqual([...toEnd].sort((x, y) => x.order - y.order).map((x) => x.id), ['b', 'c', 'd', 'a']);
});

test('fit check: 96 in sofa in the 25x23 living room is roomy', () => {
  const living = { name: 'Living', level: 2, w: 25, l: 23 };
  const f = fitCheck(createItem({ name: 'Sofa', dims: { w: 96, d: 38 } }), living);
  assert.equal(f.level, 'roomy');
  assert.equal(f.pctLong, 32);
  assert.match(f.message, /Room to spare/);
});

test('fit check: wide table in the dining room gets a watch note', () => {
  const dining = { name: 'Dining', level: 2, w: 10, l: 14 };
  assert.equal(fitCheck(createItem({ name: 't', dims: { w: 130 } }), dining).level, 'watch');
  assert.equal(fitCheck(createItem({ name: 't', dims: { w: 200 } }), dining).level, 'tight');
  assert.equal(fitCheck(createItem({ name: 't' }), dining), null);
  assert.equal(fitCheck(createItem({ name: 't', dims: { w: 50 } }), { name: 'Terrace' }), null);
});

test('stair warning only for long pieces above floor 1', () => {
  const up = { name: 'Primary BR', level: 3, w: 29, l: 19 };
  const down = { name: 'Bedroom', level: 1, w: 15, l: 17 };
  assert.match(stairWarning(createItem({ name: 'bed', dims: { w: 86 } }), up), /floor 3/);
  assert.equal(stairWarning(createItem({ name: 'bed', dims: { w: 86 }, stairOk: 'Yes' }), up), null);
  assert.equal(stairWarning(createItem({ name: 'bed', dims: { w: 86 } }), down), null);
  assert.match(stairWarning(createItem({ name: 'x', stairOk: 'No' }), up), /knock-down/);
});

test('wifi QR payload escapes special characters', () => {
  assert.equal(wifiQrPayload('Casa', 'pa;ss:word'), 'WIFI:T:WPA;S:Casa;P:pa\\;ss\\:word;;');
  assert.equal(wifiQrPayload('Open Net', ''), 'WIFI:T:nopass;S:Open Net;P:;;');
  assert.equal(wifiQrPayload('', 'x'), '');
});

test('normalizeState rejects junk and survives partial imports', () => {
  assert.throws(() => normalizeState(null));
  assert.throws(() => normalizeState({ tasks: [] }));
  const s = normalizeState({ tasks: [{ title: 'x' }], items: [{ name: 'y' }] });
  assert.equal(s.settings.theme, 'auto');
  assert.equal(s.tasks[0].status, 'To do');
  assert.equal(s.items[0].qty, 1);
});

// ---------- Sync reconcile ----------

const withHome = (updatedAt, homeInfo = {}, settings = {}) => normalizeState({
  tasks: [{ id: 't1', title: `task at ${updatedAt}` }],
  items: [],
  homeInfo,
  settings,
  updatedAt,
});

test('normalizeState keeps updatedAt and defaults it to 0', () => {
  assert.equal(withHome(1234).updatedAt, 1234);
  assert.equal(normalizeState({ tasks: [], items: [] }).updatedAt, 0);
  assert.equal(normalizeState({ tasks: [], items: [], updatedAt: 'x' }).updatedAt, 0);
  assert.equal(buildStateFromSeed(seed).updatedAt, 0, 'seed data loses to any real copy');
});

test('stampUpdated always moves forward', () => {
  const s = withHome(5000);
  stampUpdated(s, 9000);
  assert.equal(s.updatedAt, 9000);
  stampUpdated(s, 100); // clock went backwards
  assert.equal(s.updatedAt, 9001);
});

test('reconcile pushes when the cloud document does not exist yet', () => {
  assert.deepEqual(reconcile(withHome(0), null), { action: 'push' }, 'seed data is pushed as-is');
  const founded = reconcile(withHome(1), undefined, 9000);
  assert.equal(founded.action, 'push');
  assert.equal(founded.state.updatedAt, 9000, 'real data founding the cloud copy is stamped current');
});

test('pre-sync data on a second device adopts the founding copy instead of tying', () => {
  const laptop = reconcile(withHome(1), null, 9000).state; // both had pre-sync data (1)
  assert.equal(reconcile(withHome(1), laptop).action, 'apply');
});

test('reconcile applies a newer remote copy', () => {
  const r = reconcile(withHome(100), withHome(200));
  assert.equal(r.action, 'apply');
  assert.equal(r.state.updatedAt, 200);
  assert.equal(r.state.tasks[0].title, 'task at 200');
});

test('reconcile pushes when this device is newer, so a stale cloud never wins', () => {
  assert.deepEqual(reconcile(withHome(300), withHome(200)), { action: 'push' });
});

test('a stale device does nothing to newer data on load', () => {
  // Fresh phone on seed data (0) meets a laptop copy in the cloud: it adopts, never pushes.
  assert.equal(reconcile(buildStateFromSeed(seed), withHome(50)).action, 'apply');
});

test('reconcile does nothing when timestamps match (our own write echoing back)', () => {
  assert.deepEqual(reconcile(withHome(200), withHome(200)), { action: 'none' });
});

test('Wi-Fi passwords are stripped from the payload unless opted in', () => {
  const s = withHome(1, { wifiName: 'Montrose', wifiPassword: 'pw1', guestWifiPassword: 'pw2' });
  const out = toSyncPayload(s);
  assert.equal(out.homeInfo.wifiName, 'Montrose');
  for (const k of SECRET_HOME_KEYS) assert.ok(!(k in out.homeInfo), k);
  assert.equal(s.homeInfo.wifiPassword, 'pw1', 'local copy is untouched');

  s.settings.syncWifiPasswords = true;
  assert.equal(toSyncPayload(s).homeInfo.wifiPassword, 'pw1');
});

test('applying a remote copy without passwords keeps this device\'s passwords', () => {
  const local = withHome(1, { wifiPassword: 'mine', guestWifiPassword: 'guest' });
  const remote = toSyncPayload(withHome(2, { wifiName: 'New name', wifiPassword: 'other' }));
  const { state } = reconcile(local, remote);
  assert.equal(state.homeInfo.wifiName, 'New name');
  assert.equal(state.homeInfo.wifiPassword, 'mine');
  assert.equal(state.homeInfo.guestWifiPassword, 'guest');
});

test('opted-in remote passwords replace local ones', () => {
  const local = withHome(1, { wifiPassword: 'old' });
  const remote = toSyncPayload(withHome(2, { wifiPassword: 'new' }, { syncWifiPasswords: true }));
  const { state } = reconcile(local, remote);
  assert.equal(state.homeInfo.wifiPassword, 'new');
  assert.equal(state.settings.syncWifiPasswords, true);
});

test('turning on password sync from a device without passwords does not erase them elsewhere', () => {
  const phone = withHome(1, { wifiPassword: 'phonepw' });
  const laptop = toSyncPayload(withHome(2, { wifiPassword: '' }, { syncWifiPasswords: true }));
  const { state } = reconcile(phone, laptop);
  assert.equal(state.homeInfo.wifiPassword, 'phonepw');
});

test('pre-sync data uploading over seed data claims to be current', () => {
  // A device that only opened the site (seed, 0) created the cloud doc first.
  const r = reconcile(withHome(1), withHome(0), 9000);
  assert.equal(r.action, 'push');
  assert.equal(r.state.updatedAt, 9000);
  assert.equal(reconcile(withHome(1), r.state).action, 'apply', 'the next pre-sync device adopts it');
  assert.equal(reconcile(withHome(500), withHome(0)).state, undefined, 'normal edits push as-is');
});

test('seed updates: fresh seed already has them applied, once', () => {
  const state = buildStateFromSeed(seed);
  assert.deepEqual(state.appliedUpdates, seed.updates.map((u) => u.id));
  assert.equal(state.settings.closingDate, '2026-11-13');
  assert.equal(state.tasks.filter((t) => t.id === 'closing-wire').length, 1);
  assert.equal(state.items.find((i) => i.name === 'Washer and dryer').status, 'Placed');
  assert.equal(applySeedUpdates(state, seed.updates).changed, false);
});

test('seed updates fill gaps in existing data without clobbering your edits', () => {
  // Data from before the update: no appliedUpdates, a custom move-in date, a deleted task.
  const old = buildStateFromSeed({ ...seed, updates: [] });
  old.settings.moveInDate = '2026-12-01';
  old.tasks = old.tasks.filter((t) => t.title !== 'Final meter readings at closing');
  const usps = old.tasks.find((t) => t.title === 'USPS change of address from Wisconsin');
  usps.due = '2026-11-01';
  old.updatedAt = 5;
  const { state, changed } = applySeedUpdates(old, seed.updates);
  assert.equal(changed, true);
  assert.equal(state.settings.closingDate, '2026-11-13');
  assert.equal(state.settings.moveInDate, '2026-12-01', 'your date wins');
  assert.equal(state.tasks.find((t) => t.title === 'USPS change of address from Wisconsin').due, '2026-11-01');
  assert.ok(!state.tasks.some((t) => t.title === 'Final meter readings at closing'), 'deleted stays deleted');
  assert.equal(state.tasks.filter((t) => t.category === 'Closing').length, 13);
  assert.equal(state.updatedAt, 5, 'stamping is the caller\'s job');
  assert.equal(applySeedUpdates(state, seed.updates).changed, false);
  assert.equal(old.appliedUpdates.length, 0, 'input is not mutated');
});
