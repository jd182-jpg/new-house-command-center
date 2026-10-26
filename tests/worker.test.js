import { test } from 'node:test';
import assert from 'node:assert/strict';
import seed from '../js/seed-data.js';
import { buildStateFromSeed } from '../js/model.js';
import { handle, parserPrompt, houstonToday, toModelOps, OPS_SCHEMA } from '../worker/src/house.js';

const env = {
  HOUSE_TOKEN: 'tok-123', FIREBASE_PROJECT_ID: 'p', FIREBASE_API_KEY: 'k',
  FIRESTORE_COLLECTION: 'houses', FIRESTORE_DOC_ID: 'd',
};

// A fake Firestore REST endpoint holding one document, with updateTime preconditions.
function fakeFirestore(payload) {
  const db = { fields: { payload: { stringValue: JSON.stringify(payload) }, updatedAt: { integerValue: String(payload.updatedAt) } }, version: 1, writes: 0 };
  db.fetch = async (url, init = {}) => {
    const u = new URL(url);
    if (!init.method) {
      return new Response(JSON.stringify({ fields: db.fields, updateTime: `t${db.version}` }), { status: 200 });
    }
    if (u.searchParams.get('currentDocument.updateTime') !== `t${db.version}`) return new Response('{}', { status: 400 + 12 });
    const { fields } = JSON.parse(init.body);
    const next = {};
    for (const p of u.searchParams.getAll('updateMask.fieldPaths')) if (fields[p]) next[p] = fields[p];
    db.fields = next;
    db.version += 1;
    db.writes += 1;
    return new Response('{}', { status: 200 });
  };
  db.payload = () => JSON.parse(db.fields.payload.stringValue);
  return db;
}

const start = () => {
  const s = buildStateFromSeed(seed);
  s.updatedAt = 1000;
  return s;
};
const post = (text, token = 'tok-123') => new Request('https://w/', {
  method: 'POST', headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' }, body: JSON.stringify({ text }),
});

test('rejects a missing or wrong token without reading anything', async () => {
  const db = fakeFirestore(start());
  let calls = 0;
  const deps = { fetch: async () => { calls += 1; }, parse: async () => ({}), now: () => 2000 };
  assert.equal((await handle(post('hi', 'nope'), env, deps)).status, 401);
  assert.equal((await handle(post('hi', 'tok-1234'), env, deps)).status, 401);
  const noHeader = new Request('https://w/', { method: 'POST', body: 'hi' });
  assert.match(await (await handle(noHeader, env, deps)).text(), /no token/);
  assert.match(await (await handle(post('hi', 'nope'), env, deps)).text(), /doesn't match/);
  assert.equal(calls, 0);
  assert.equal(db.writes, 0);
});

test('a pasted token with stray spaces or no Bearer still works', async () => {
  const db = fakeFirestore(start());
  const deps = { fetch: db.fetch, now: () => 2000, parse: async () => ({ question: 'Which one?', ops: [] }) };
  for (const header of ['Bearer tok-123 ', 'bearer  tok-123', 'tok-123', ' Bearer tok-123']) {
    const req = new Request('https://w/', { method: 'POST', headers: { authorization: header }, body: 'rug' });
    assert.equal(await (await handle(req, env, deps)).text(), 'Which one?', JSON.stringify(header));
  }
  const inBody = new Request('https://w/', { method: 'POST', body: JSON.stringify({ text: 'rug', token: ' tok-123 ' }) });
  assert.equal(await (await handle(inBody, env, deps)).text(), 'Which one?');
  const wrongInBody = new Request('https://w/', { method: 'POST', body: JSON.stringify({ text: 'rug', token: 'tok-1' }) });
  assert.equal((await handle(wrongInBody, env, deps)).status, 401);
});

test('applies ops, stamps a newer updatedAt, and replies with the confirmation', async () => {
  const s = start();
  const db = fakeFirestore(s);
  const frame = s.items.find((i) => i.name === 'Samsung The Frame Pro');
  const deps = {
    fetch: db.fetch, now: () => 5000,
    parse: async (state, msg) => {
      assert.equal(msg, 'ordered the Frame TV from Best Buy, $1,999');
      return { question: '', ops: [{ kind: 'updateItem', id: frame.id, status: 'Ordered', unitPrice: 1999, store: 'Best Buy' }] };
    },
  };
  const res = await handle(post('ordered the Frame TV from Best Buy, $1,999'), env, deps);
  assert.equal(await res.text(), "Marked 'Samsung The Frame Pro' Ordered, $1,999, Best Buy.");
  const saved = db.payload();
  assert.equal(saved.updatedAt, 5000);
  assert.equal(db.fields.updatedAt.integerValue, '5000');
  assert.equal(saved.items.find((i) => i.id === frame.id).status, 'Ordered');

  // undo puts the old copy back with an even newer stamp, once
  const undone = await handle(post('Undo'), env, { ...deps, now: () => 6000 });
  assert.equal(await undone.text(), "Undid: Marked 'Samsung The Frame Pro' Ordered, $1,999, Best Buy.");
  assert.equal(db.payload().items.find((i) => i.id === frame.id).status, 'Idea');
  assert.equal(db.payload().updatedAt, 6000);
  assert.equal(db.fields.undo, undefined);
  assert.match(await (await handle(post('undo'), env, deps)).text(), /Nothing to undo/);
});

test('undo refuses once a device has edited after the text', async () => {
  const s = start();
  const db = fakeFirestore(s);
  const deps = { fetch: db.fetch, now: () => 5000, parse: async () => ({ question: '', ops: [{ kind: 'addTask', name: 'Book movers' }] }) };
  await handle(post('add book movers'), env, deps);
  // the app's setDoc replaces the whole document
  const edited = db.payload();
  edited.updatedAt = 7000;
  db.fields = { payload: { stringValue: JSON.stringify(edited) }, updatedAt: { integerValue: '7000' } };
  assert.match(await (await handle(post('undo'), env, deps)).text(), /Nothing to undo/);
  assert.equal(db.payload().updatedAt, 7000);
});

test('a question or a bad op changes nothing', async () => {
  const db = fakeFirestore(start());
  const ask = { fetch: db.fetch, now: () => 5000, parse: async () => ({ question: 'Which rug, living or dining?', ops: [] }) };
  assert.equal(await (await handle(post('rug arrived'), env, ask)).text(), 'Which rug, living or dining?');
  const bad = { ...ask, parse: async () => ({ question: '', ops: [{ kind: 'updateItem', id: 'made-up', status: 'Delivered' }] }) };
  assert.match(await (await handle(post('rug arrived'), env, bad)).text(), /couldn't tell which item/);
  assert.equal(db.writes, 0);
});

test('if a device writes mid-request, the ops are applied to the newer copy', async () => {
  const s = start();
  const db = fakeFirestore(s);
  const gas = s.tasks.find((t) => t.title === 'Set up natural gas service');
  const deps = {
    now: () => 5000,
    parse: async () => ({ question: '', ops: [{ kind: 'updateTask', id: gas.id, status: 'Done' }] }),
    fetch: async (url, init) => {
      if (init && init.method === 'PATCH' && db.writes === 0 && !db.raced) {
        // the phone saves first
        db.raced = true;
        const other = db.payload();
        other.items[0].status = 'Delivered';
        other.updatedAt = 4000;
        db.fields = { payload: { stringValue: JSON.stringify(other) }, updatedAt: { integerValue: '4000' } };
        db.version += 1;
      }
      return db.fetch(url, init);
    },
  };
  const res = await handle(post('done: called CenterPoint'), env, deps);
  assert.equal(await res.text(), "Marked 'Set up natural gas service' Done.");
  const saved = db.payload();
  assert.equal(saved.items[0].status, 'Delivered', "the phone's edit survives");
  assert.equal(saved.tasks.find((t) => t.id === gas.id).status, 'Done');
  assert.equal(saved.updatedAt, 5000);
});

test('plain-text bodies work and the prompt carries ids and the Houston date', async () => {
  const s = start();
  const prompt = parserPrompt(s, 'add bar stools to kitchen', new Date(Date.UTC(2026, 9, 27, 3)));
  assert.ok(prompt.includes('Today is 2026-10-26 (Monday)'));
  assert.ok(prompt.includes(s.items[0].id));
  assert.equal(houstonToday(new Date(Date.UTC(2026, 10, 22, 18))), '2026-11-22 (Sunday)');
  const db = fakeFirestore(s);
  let seen = '';
  const deps = { fetch: db.fetch, now: () => 5000, parse: async (_, m) => { seen = m; return { question: 'ok?', ops: [] }; } };
  await handle(new Request('https://w/', { method: 'POST', headers: { authorization: 'Bearer tok-123' }, body: 'add bar stools' }), env, deps);
  assert.equal(seen, 'add bar stools');
});

test('parser ops map onto model ops, dates going to the right field', () => {
  assert.deepEqual(toModelOps([
    { kind: 'updateItem', id: 'i1', date: '2026-11-22', store: 'Best Buy' },
    { kind: 'updateTask', id: 't1', date: '2026-11-15' },
    { kind: 'addTask', name: 'Book movers' },
    { kind: 'setClosingDate', date: '2026-11-14' },
    { kind: 'setMoveInDate', date: '2026-11-21' },
    { kind: 'wipe' },
  ]), [
    { kind: 'updateItem', itemId: 'i1', expectedDelivery: '2026-11-22', store: 'Best Buy' },
    { kind: 'updateTask', taskId: 't1', due: '2026-11-15' },
    { kind: 'addTask', title: 'Book movers', due: undefined },
    { kind: 'setDates', closingDate: '2026-11-14' },
    { kind: 'setDates', moveInDate: '2026-11-21' },
    { kind: 'wipe' },
  ]);
  assert.ok(Object.keys(OPS_SCHEMA.properties.ops.items.properties).length <= 15);
});
