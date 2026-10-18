import { test } from 'node:test';
import assert from 'node:assert/strict';
import { startSync } from '../js/sync.js';
import { normalizeState, stampUpdated } from '../js/model.js';

// A stand-in for Firestore: one shared document, and every device's listener hears every
// write. Snapshots carry the same metadata flags the real SDK uses.
function fakeServer() {
  const server = { doc: null, listeners: [], online: true };
  server.notify = () => {
    for (const fn of server.listeners) fn(server.snapshot(false));
  };
  server.snapshot = (fromCache) => ({
    metadata: { fromCache, hasPendingWrites: false },
    exists: () => server.doc !== null,
    data: () => server.doc,
  });
  server.sdk = {
    initializeApp: () => ({}),
    getFirestore: () => ({}),
    doc: () => ({}),
    setDoc: async (_ref, data) => {
      server.doc = data;
      server.notify();
    },
    onSnapshot: (_ref, _opts, fn) => {
      server.listeners.push(fn);
      fn(server.snapshot(true)); // cached first, like the real SDK
      if (server.online) fn(server.snapshot(false));
    },
  };
  return server;
}

function device(server, initial) {
  const d = { state: initial, badge: null, applied: 0 };
  d.sync = startSync({
    config: { projectId: 'test' },
    collection: 'houses',
    docId: 'x',
    sdk: server.sdk,
    hooks: {
      getState: () => d.state,
      applyRemote: (next) => { d.state = next; d.applied += 1; },
      setBadge: (label) => { d.badge = label; },
    },
  });
  d.edit = (fn) => { fn(d.state); stampUpdated(d.state); d.sync.push(); };
  return d;
}

const make = (title, updatedAt, homeInfo = {}) =>
  normalizeState({ tasks: [{ id: 't1', title }], items: [], homeInfo, updatedAt });
const settle = () => new Promise((r) => setTimeout(r, 800)); // push is debounced 700ms

test('edits on one device show up on the other, both ways', async () => {
  const server = fakeServer();
  const laptop = device(server, make('laptop copy', 100));
  await settle();
  assert.equal(JSON.parse(server.doc.payload).tasks[0].title, 'laptop copy', 'first device seeds the cloud');
  assert.equal(laptop.badge, 'Synced');

  const phone = device(server, make('seed', 0));
  await settle();
  assert.equal(phone.state.tasks[0].title, 'laptop copy', 'phone adopts the newer laptop copy');

  phone.edit((s) => { s.tasks[0].title = 'edited on phone'; });
  await settle();
  assert.equal(laptop.state.tasks[0].title, 'edited on phone');

  laptop.edit((s) => { s.tasks[0].title = 'edited on laptop'; });
  await settle();
  assert.equal(phone.state.tasks[0].title, 'edited on laptop');
});

test('a stale device coming online never overwrites newer cloud data', async () => {
  const server = fakeServer();
  server.doc = { payload: JSON.stringify(make('newest', 5000)), updatedAt: 5000 };
  const stale = device(server, make('old', 10));
  await settle();
  assert.equal(stale.state.tasks[0].title, 'newest');
  assert.equal(JSON.parse(server.doc.payload).tasks[0].title, 'newest');
});

test('Wi-Fi passwords never reach the cloud unless opted in', async () => {
  const server = fakeServer();
  device(server, make('x', 100, { wifiName: 'Montrose', wifiPassword: 'secret' }));
  await settle();
  const payload = JSON.parse(server.doc.payload);
  assert.equal(payload.homeInfo.wifiName, 'Montrose');
  assert.ok(!('wifiPassword' in payload.homeInfo));
});

test('badge does not claim Synced while only the cache has answered', async () => {
  const server = fakeServer();
  server.online = false;
  const d = device(server, make('x', 100));
  await settle();
  assert.equal(d.badge, 'Offline, will sync');
  assert.equal(server.doc, null, 'no write is attempted on a cache-only view');
});

test('without a config the app stays local', () => {
  let badge;
  const s = startSync({ config: null, hooks: { getState: () => ({}), applyRemote() {}, setBadge: (l) => { badge = l; } } });
  s.push();
  assert.equal(badge, 'This device only');
});
