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
  assert.equal(after.prevStatus, 'Idea');
  assert.equal(after.unitPrice, 1999);
  assert.equal(budgetSummary(r.state.items).spent, 1999);
  assert.equal(item(s, 'Samsung The Frame Pro').status, 'Idea', 'input state is not mutated');
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
  assert.equal(item(r.state, 'Bar stools').status, 'Idea');
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
  assert.ok(text.includes(`${item(s, 'Samsung The Frame Pro').id} | Idea | Living`));
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
