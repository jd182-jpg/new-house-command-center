import { test } from 'node:test';
import assert from 'node:assert/strict';
import seed from '../js/seed-data.js';
import { buildStateFromSeed, applyTextOps, describeForParser, shortDate, budgetSummary } from '../js/model.js';

const fresh = () => {
  const s = buildStateFromSeed(seed);
  s.homeInfo.wifiPassword = 'secret-pass';
  s.updatedAt = 5;
  return s;
};
const item = (s, name) => s.items.find((i) => i.name === name);

test('ordering an item sets status, price, store, delivery and counts as spent', () => {
  const s = fresh();
  const frame = item(s, 'Samsung The Frame Pro');
  const r = applyTextOps(s, [{
    kind: 'updateItem', itemId: frame.id, status: 'ordered', unitPrice: '$1,999', store: 'Best Buy',
    expectedDelivery: '2026-11-22', orderNumber: 'BBY01-123',
  }]);
  assert.equal(r.ok, true);
  assert.equal(r.summary, "Marked 'Samsung The Frame Pro' Ordered, $1,999, Best Buy, order BBY01-123, arrives Nov 22");
  const after = item(r.state, 'Samsung The Frame Pro');
  assert.equal(after.status, 'Ordered');
  assert.equal(after.prevStatus, 'Suggested');
  assert.equal(after.unitPrice, 1999);
  assert.equal(budgetSummary(r.state.items).spent, 1999);
  assert.equal(item(s, 'Samsung The Frame Pro').status, 'Suggested', 'input state is not mutated');
});

test('a link is added once and chosen', () => {
  const s = fresh();
  const id = item(s, 'Coffee maker').id;
  const op = { kind: 'updateItem', itemId: id, url: 'https://www.breville.com/x', unitPrice: 299 };
  const once = applyTextOps(s, [op]).state;
  const twice = applyTextOps(once, [op]).state;
  const it = item(twice, 'Coffee maker');
  assert.equal(it.links.length, 1);
  assert.equal(it.chosenLinkId, it.links[0].id);
  assert.equal(it.links[0].label, 'breville.com');
});

test('marking a task done and adding a task', () => {
  const s = fresh();
  const gas = s.tasks.find((t) => t.title === 'Set up natural gas service');
  const r = applyTextOps(s, [
    { kind: 'updateTask', taskId: gas.id, status: 'Done', confirmation: 'CNP-889' },
    { kind: 'addTask', title: 'Schedule movers', category: 'utilities', priority: 'High', due: '2026-11-18' },
  ]);
  assert.equal(r.ok, true);
  assert.equal(r.summary, "Marked 'Set up natural gas service' Done, confirmation CNP-889; Added task 'Schedule movers' (Utilities, due Nov 18)");
  assert.equal(r.state.tasks.find((t) => t.id === gas.id).status, 'Done');
  const added = r.state.tasks.at(-1);
  assert.equal(added.priority, 'High');
  assert.ok(added.order > gas.order);
});

test('adding an item puts it in a known room, else Whole house', () => {
  const s = fresh();
  const r = applyTextOps(s, [
    { kind: 'addItem', name: 'Bar stools', room: 'kitchen', qty: 3 },
    { kind: 'addItem', name: 'Hammock', room: 'Backyard' },
  ]);
  assert.equal(r.ok, true);
  assert.equal(r.summary, "Added 'Bar stools' (Kitchen, qty 3); Added 'Hammock' (Whole house)");
  assert.equal(item(r.state, 'Bar stools').source, 'mine');
  assert.equal(item(r.state, 'Bar stools').status, 'Suggested');
});

test('duplicates, unknown ids and bad values change nothing', () => {
  const s = fresh();
  const before = JSON.stringify(s);
  const frame = item(s, 'Samsung The Frame Pro');
  const bad = [
    [{ kind: 'addItem', name: 'samsung the frame pro' }],
    [{ kind: 'updateItem', itemId: 'nope', status: 'Ordered' }],
    [{ kind: 'updateTask', taskId: 'nope', status: 'Done' }],
    [{ kind: 'updateItem', itemId: frame.id, status: 'Bought' }],
    [{ kind: 'updateItem', itemId: frame.id, expectedDelivery: 'next week' }],
    [{ kind: 'updateItem', itemId: frame.id, url: 'javascript:alert(1)' }],
    [{ kind: 'updateItem', itemId: frame.id }],
    [{ kind: 'setDates', closingDate: '11/14' }],
    [{ kind: 'deleteEverything' }],
    [],
    // a good op followed by a bad one: all or nothing
    [{ kind: 'updateItem', itemId: frame.id, status: 'Ordered' }, { kind: 'updateTask', taskId: 'nope', status: 'Done' }],
  ];
  for (const ops of bad) {
    const r = applyTextOps(s, ops);
    assert.equal(r.ok, false, JSON.stringify(ops));
    assert.ok(r.message);
  }
  assert.equal(JSON.stringify(s), before);
});

test('setDates moves closing and move-in', () => {
  const r = applyTextOps(fresh(), [{ kind: 'setDates', closingDate: '2026-11-14', moveInDate: '2026-11-21' }]);
  assert.equal(r.summary, 'Set closing Nov 14 and move-in Nov 21');
  assert.equal(r.state.settings.closingDate, '2026-11-14');
  assert.equal(r.state.settings.moveInDate, '2026-11-21');
});

test('text ops never touch Home Info or the edit stamp', () => {
  const s = fresh();
  const r = applyTextOps(s, [{ kind: 'addTask', title: 'x' }]);
  assert.deepEqual(r.state.homeInfo, s.homeInfo);
  assert.equal(r.state.homeInfo.wifiPassword, 'secret-pass');
  assert.equal(r.state.updatedAt, 5, 'the caller stamps');
});

test('parser view lists ids and leaves out Wi-Fi passwords', () => {
  const s = fresh();
  const text = describeForParser(s);
  assert.ok(text.includes(`${item(s, 'Samsung The Frame Pro').id} | Suggested | Living`));
  assert.ok(text.includes(s.tasks[0].id));
  assert.ok(!text.includes('secret-pass'));
});

test('shortDate and no em dashes in confirmations', () => {
  assert.equal(shortDate('2026-11-02'), 'Nov 2');
  const s = fresh();
  const r = applyTextOps(s, [{ kind: 'updateItem', itemId: s.items[0].id, status: 'Delivered', unitPrice: 12.5 }]);
  assert.ok(r.summary.includes('$12.50'));
  assert.ok(!r.summary.includes('\u2014'));
});

test('appointments: add, reschedule, cancel, and reject bad times or duplicates', () => {
  const s = fresh();
  const hvac = s.tasks.find((t) => t.title === 'Plan the HVAC replacement');
  const r = applyTextOps(s, [{ kind: 'addAppointment', title: 'HVAC estimate visit', date: '2026-11-03', start: '09:00', end: '11:30', who: 'Autumn Mechanical', phone: '713-555-0100', taskId: hvac.id }]);
  assert.equal(r.ok, true);
  assert.equal(r.summary, "Added appointment 'HVAC estimate visit' Nov 3 9am-11:30am with Autumn Mechanical");
  const a = r.state.appointments[0];
  assert.equal(a.status, 'Scheduled');
  assert.equal(a.taskId, hvac.id);

  const moved = applyTextOps(r.state, [{ kind: 'updateAppointment', appointmentId: a.id, date: '2026-11-05', start: '13:00', end: '' }]);
  assert.equal(moved.summary, "Updated appointment 'HVAC estimate visit' Nov 5 1pm-11:30am");
  const canceled = applyTextOps(moved.state, [{ kind: 'updateAppointment', appointmentId: a.id, status: 'canceled' }]);
  assert.match(canceled.summary, /^Canceled appointment/);

  for (const bad of [
    [{ kind: 'addAppointment', title: 'HVAC estimate visit', date: '2026-11-03' }],
    [{ kind: 'addAppointment', title: 'Movers', date: '2026-11-20', start: '9am' }],
    [{ kind: 'addAppointment', title: 'Movers' }],
    [{ kind: 'addAppointment', title: 'Movers', date: '2026-11-20', taskId: 'nope' }],
    [{ kind: 'updateAppointment', appointmentId: 'nope', date: '2026-11-21' }],
  ]) assert.equal(applyTextOps(r.state, bad).ok, false, JSON.stringify(bad));
});

test('documents: filed with kind, amount, expiry, files and a link to an item', () => {
  const s = fresh();
  const wd = s.items.find((i) => i.name === 'Washer and dryer');
  const files = [{ name: '2026-11-21 LG - washer warranty.pdf', path: '08 Warranties and Receipts/2026-11-21 LG - washer warranty.pdf', webUrl: 'https://onedrive.live.com/x', driveId: 'ABC!1', size: 1200 }];
  const r = applyTextOps(s, [{ kind: 'addDocument', title: 'LG washer warranty', docKind: 'Warranty', vendor: 'LG', date: '2026-11-21', expires: '2027-11-21', files, itemId: wd.id }]);
  assert.equal(r.ok, true);
  assert.equal(r.summary, "Filed 'LG washer warranty' (Warranty, LG, expires Nov 21, 1 file, linked to 'Washer and dryer')");
  assert.deepEqual(r.state.documents[0].files, files);

  const est = applyTextOps(s, [{ kind: 'addDocument', title: 'HVAC replacement estimate', docKind: 'estimate', amount: '$14,200', vendor: 'Autumn Mechanical' }]);
  assert.equal(est.summary, "Filed 'HVAC replacement estimate' (Estimate, Autumn Mechanical, $14,200)");
  assert.equal(est.state.documents[0].amount, 14200);

  for (const bad of [
    [{ kind: 'addDocument', title: 'x', docKind: 'Brochure' }],
    [{ kind: 'addDocument', title: 'x', expires: 'next year' }],
    [{ kind: 'addDocument', title: 'x', itemId: 'nope' }],
    [{ kind: 'addDocument', title: '' }],
  ]) assert.equal(applyTextOps(s, bad).ok, false, JSON.stringify(bad));
});

test('contacts: added once, blanks filled, nothing else in Home Info touched', () => {
  const s = fresh();
  const r = applyTextOps(s, [{ kind: 'addContact', role: 'Plumber', name: 'Bayou Plumbing', phone: '713-555-0100' }]);
  assert.equal(r.summary, 'Added contact Bayou Plumbing (Plumber)');
  const again = applyTextOps(r.state, [{ kind: 'addContact', name: 'bayou plumbing', email: 'service@bayou.example', phone: '000' }]);
  assert.equal(again.summary, 'Updated contact Bayou Plumbing');
  const c = again.state.homeInfo.contacts.find((x) => x.name === 'Bayou Plumbing');
  assert.equal(c.phone, '713-555-0100', 'your phone number wins');
  assert.equal(c.email, 'service@bayou.example');
  // Autumn Mechanical is already there, so it isn't duplicated.
  const autumn = applyTextOps(s, [{ kind: 'addContact', role: 'HVAC', name: 'Autumn Mechanical', phone: '1' }]);
  assert.equal(autumn.state.homeInfo.contacts.filter((x) => x.name === 'Autumn Mechanical').length, 1);
  assert.equal(autumn.state.homeInfo.contacts.find((x) => x.name === 'Autumn Mechanical').phone, '713-864-8368');
  // The empty Designer row gets its name filled instead of a duplicate row.
  const designer = applyTextOps(s, [{ kind: 'addContact', role: 'Designer', name: 'Jackie' }]);
  assert.equal(designer.state.homeInfo.contacts.filter((x) => x.role === 'Designer').length, 1);
  assert.equal(again.state.homeInfo.wifiPassword, 'secret-pass');
});

test('old saved data without appointments or documents still loads', () => {
  const s = fresh();
  delete s.appointments;
  delete s.documents;
  const r = applyTextOps(s, [{ kind: 'addTask', title: 'x' }]);
  assert.deepEqual(r.state.appointments, []);
  assert.deepEqual(r.state.documents, []);
});

test('a brand or link moves a suggestion to To purchase; notes alone do not', () => {
  const s = fresh();
  const mixer = s.items.find((i) => i.status === 'Suggested');
  let r = applyTextOps(s, [{ kind: 'updateItem', itemId: mixer.id, notes: 'want it in black' }]);
  assert.equal(item(r.state, mixer.name).status, 'Suggested');
  r = applyTextOps(r.state, [{ kind: 'updateItem', itemId: mixer.id, brand: 'KitchenAid Artisan 5qt' }]);
  assert.equal(item(r.state, mixer.name).status, 'To purchase');
  assert.equal(item(r.state, mixer.name).brand, 'KitchenAid Artisan 5qt');
  assert.ok(r.summary.includes('moved to To purchase'));

  const other = s.items.filter((i) => i.status === 'Suggested')[1];
  r = applyTextOps(s, [{ kind: 'updateItem', itemId: other.id, url: 'https://example.com/x' }]);
  assert.equal(item(r.state, other.name).status, 'To purchase');
  r = applyTextOps(s, [{ kind: 'updateItem', itemId: other.id, url: 'https://example.com/x', status: 'Ordered' }]);
  assert.equal(item(r.state, other.name).status, 'Ordered', 'an explicit status wins');
});
