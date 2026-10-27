import { test } from 'node:test';
import assert from 'node:assert/strict';
import seed from '../js/seed-data.js';
import { buildStateFromSeed } from '../js/model.js';
import { handle, processMessage, parserPrompt, houstonToday, toModelOps, OPS_SCHEMA } from '../worker/src/house.js';

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
  assert.equal(db.payload().items.find((i) => i.id === frame.id).status, 'Suggested');
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
  assert.deepEqual(toModelOps([
    { kind: 'addAppointment', name: 'Xfinity install', date: '2026-11-21', start: '08:00' },
    { kind: 'updateAppointment', id: 'a1', status: 'Canceled' },
    { kind: 'addDocument', name: 'HVAC estimate', docKind: 'Estimate', amount: 14200 },
    { kind: 'addContact', name: 'Bayou Plumbing', role: 'Plumber' },
  ]), [
    { kind: 'addAppointment', title: 'Xfinity install', date: '2026-11-21', start: '08:00' },
    { kind: 'updateAppointment', appointmentId: 'a1', date: undefined, status: 'Canceled' },
    { kind: 'addDocument', title: 'HVAC estimate', date: undefined, docKind: 'Estimate', amount: 14200 },
    { kind: 'addContact', name: 'Bayou Plumbing', role: 'Plumber' },
  ]);
  assert.ok(OPS_SCHEMA.properties.ops.items.properties.saveFiles);
});

test('email: only allowed, authenticated senders, and the command comes from the body or subject', async () => {
  const { allowedSenders, authPassed, extractCommand, replySubject } = await import('../worker/src/email.js');
  assert.deepEqual(allowedSenders(' A@Outlook.com, b@icloud.com ,'), ['a@outlook.com', 'b@icloud.com']);
  assert.equal(authPassed('mx.cloudflare.net; dkim=pass header.d=outlook.com; spf=pass'), true);
  assert.equal(authPassed('mx.cloudflare.net; dkim=fail; spf=softfail'), false);
  assert.equal(authPassed(null), false);

  assert.equal(extractCommand({ subject: 'ordered the Frame TV', text: '' }), 'ordered the Frame TV');
  assert.equal(extractCommand({ subject: 'Re: House update', text: 'undo\n\nOn Mon, Oct 26, 2026, 2608 House wrote:\n> Marked it' }), 'undo');
  assert.equal(extractCommand({ subject: '', text: 'done: called CenterPoint\nconfirmation 4471\n\nSent from my iPhone' }), 'done: called CenterPoint confirmation 4471');
  assert.equal(extractCommand({ subject: 'Fwd: x', text: '-- \nJackson' }), 'x');
  assert.equal(replySubject('ordered the TV'), 'Re: ordered the TV');
  assert.equal(replySubject('Re: ordered the TV'), 'Re: ordered the TV');
  assert.equal(replySubject(''), 'House update');
});

// ---------- Forwarded emails with files ----------

function fakeDrive() {
  const drive = { files: new Map(), removed: [], n: 0 };
  drive.upload = async (folder, name, bytes) => {
    drive.n += 1;
    const f = { name, path: `${folder}/${name}`, webUrl: `https://onedrive.live.com/${drive.n}`, driveId: `id${drive.n}`, size: bytes.byteLength };
    drive.files.set(f.driveId, f);
    return f;
  };
  drive.remove = async (ids) => { for (const id of ids) { drive.files.delete(id); drive.removed.push(id); } };
  return drive;
}

const pdf = new Uint8Array([37, 80, 68, 70]).buffer;
const forward = (attachments = [{ filename: 'Quote 4471.pdf', mimeType: 'application/pdf', size: 4, content: pdf }]) => ({
  attachments, raw: new Uint8Array([1, 2, 3]).buffer, folders: ['03 HOA', '04 Quotes and Estimates', '07 Renovation and Contractors'],
});

test('a forwarded estimate saves its PDF, files a document, and undo removes both', async () => {
  const s = start();
  const db = fakeFirestore(s);
  const drive = fakeDrive();
  const hvac = s.tasks.find((t) => t.title === 'Plan the HVAC replacement');
  let seenMail = null;
  const deps = {
    fetch: db.fetch, now: () => 5000, files: drive,
    parse: async (state, msg, mail) => {
      seenMail = mail;
      return { question: '', ops: [
        { kind: 'addDocument', name: 'HVAC replacement estimate', docKind: 'Estimate', vendor: 'Autumn Mechanical', amount: 14200, date: '2026-10-30', taskId: hvac.id,
          saveFiles: [{ attachment: 0, folder: '04 Quotes and Estimates', name: '2026-10-30 Autumn Mechanical - HVAC estimate' }, { attachment: 7, folder: 'x', name: 'y' }] },
        { kind: 'addAppointment', name: 'HVAC install', date: '2026-11-24', start: '08:00', end: '12:00', who: 'Autumn Mechanical' },
      ] };
    },
  };
  const res = await processMessage('FW: Your estimate', env, deps, forward());
  assert.equal(res.text, "Filed 'HVAC replacement estimate' (Estimate, Autumn Mechanical, $14,200, 1 file, linked to 'Plan the HVAC replacement'); Added appointment 'HVAC install' Nov 24 8am-12pm with Autumn Mechanical.");
  assert.equal(seenMail.attachments.length, 1);
  assert.deepEqual(res.files.map((f) => f.path), ['04 Quotes and Estimates/2026-10-30 Autumn Mechanical - HVAC estimate.pdf']);
  const saved = db.payload();
  assert.equal(saved.documents[0].files[0].driveId, 'id1');
  assert.equal(saved.documents[0].source, 'email');
  assert.equal(saved.appointments[0].who, 'Autumn Mechanical');

  const undone = await processMessage('undo', env, { ...deps, now: () => 6000 });
  assert.match(undone.text, /Moved 1 saved file to the OneDrive recycle bin/);
  assert.deepEqual(drive.removed, ['id1']);
  assert.deepEqual(db.payload().documents, []);
});

test('a forward whose ops are rejected uploads nothing; a bad folder lands in 00 Inbox', async () => {
  const db = fakeFirestore(start());
  const drive = fakeDrive();
  const bad = { fetch: db.fetch, now: () => 5000, files: drive, parse: async () => ({ question: '', ops: [
    { kind: 'addDocument', name: 'x', docKind: 'Brochure', saveFiles: [{ attachment: 0, folder: '04 Quotes and Estimates', name: 'x' }] }] }) };
  assert.match((await processMessage('fwd', env, bad, forward())).text, /isn't a document kind/);
  assert.equal(drive.n, 0);

  const sneaky = { ...bad, parse: async () => ({ question: '', ops: [
    { kind: 'addDocument', name: 'Email notice', docKind: 'Notice', saveFiles: [{ attachment: -1, folder: '../../Documents', name: 'HOA notice' }] }] }) };
  const res = await processMessage('fwd', env, sneaky, forward([]));
  assert.deepEqual(res.files.map((f) => f.path), ['00 Inbox/HOA notice.eml']);
});

test('if saving the list fails after uploading, the uploaded files are removed', async () => {
  const s = start();
  const db = fakeFirestore(s);
  const drive = fakeDrive();
  const deps = {
    now: () => 5000, files: drive,
    parse: async () => ({ question: '', ops: [{ kind: 'addDocument', name: 'Warranty', docKind: 'Warranty', saveFiles: [{ attachment: 0, folder: '04 Quotes and Estimates', name: 'w' }] }] }),
    fetch: async (url, init) => (init && init.method === 'PATCH' ? new Response('{}', { status: 500 }) : db.fetch(url, init)),
  };
  const res = await processMessage('fwd', env, deps, forward());
  assert.equal(res.status, 500);
  assert.deepEqual(drive.removed, ['id1']);
});

test('OneDrive names: unsafe characters, extensions, and folders outside the house folder', async () => {
  const { safeName, safeFolder, fileNameFor } = await import('../worker/src/onedrive.js');
  const tops = ['03 HOA', '04 Quotes and Estimates', '07 Renovation and Contractors'];
  assert.equal(safeName('a/b:c*?"<>|#%d'), 'a-b-c-d');
  assert.equal(safeFolder('07 Renovation and Contractors/Autumn Mechanical', tops), '07 Renovation and Contractors/Autumn Mechanical');
  assert.equal(safeFolder('08 Warranties and Receipts', tops), '08 Warranties and Receipts');
  assert.equal(safeFolder('../../etc', tops), '00 Inbox');
  assert.equal(safeFolder('Random', tops), '00 Inbox');
  assert.equal(safeFolder('', tops), '00 Inbox');
  assert.equal(fileNameFor('2026-10-30 Autumn - estimate', 'Quote 4471.PDF'), '2026-10-30 Autumn - estimate.PDF');
  assert.equal(fileNameFor('Warranty.pdf', 'scan.pdf'), 'Warranty.pdf');
  assert.equal(fileNameFor('', 'scan.pdf'), 'scan.pdf');
});

test('email: forwards and attachments file; replies to us stay short commands', async () => {
  const { isFiling, realAttachments, forwardText, noteAbove } = await import('../worker/src/email.js');
  assert.equal(isFiling({ subject: 'FW: Your appointment', text: 'see below', attachments: [] }), true);
  assert.equal(isFiling({ subject: 'Quote', text: 'here', attachments: [{}] }), true);
  assert.equal(isFiling({ subject: 'x', text: '---------- Forwarded message ---------\nFrom: a@b.com', attachments: [] }), true);
  assert.equal(isFiling({ subject: 'Re: House update', text: 'undo\n\nFrom: 2608 House <house@darr.solutions>\nSent: Monday', attachments: [] }), false);
  assert.equal(isFiling({ subject: 'Re: the rug arrived', text: `the living room one\n\nFrom: 2608 House\n${'x'.repeat(900)}`, attachments: [] }), false);
  assert.equal(isFiling({ subject: 'ordered the TV', text: '', attachments: [] }), false);

  const big = new ArrayBuffer(200 * 1024);
  const small = new ArrayBuffer(3000);
  const kept = realAttachments([
    { filename: 'image001.png', mimeType: 'image/png', contentId: '<x>', disposition: 'inline', content: small },
    { filename: 'photo.jpg', mimeType: 'image/jpeg', disposition: 'attachment', content: small },
    { filename: 'estimate.pdf', mimeType: 'application/pdf', content: big },
    { filename: 'empty.txt', mimeType: 'text/plain', content: new ArrayBuffer(0) },
  ]).map((a) => a.filename);
  assert.deepEqual(kept, ['photo.jpg', 'estimate.pdf']);

  assert.equal(noteAbove('file under HVAC\n\n---------- Forwarded message ---------\nFrom: Autumn'), 'file under HVAC');
  assert.equal(noteAbove('\n---------- Forwarded message ---------\nFrom: Autumn'), '');
  const t = forwardText({ note: 'file under HVAC', from: 'jackson@leggettcp.com', subject: 'FW: Estimate', date: 'Mon', text: 'body', calendars: ['BEGIN:VCALENDAR'] });
  assert.ok(t.startsWith("Jackson's note: file under HVAC"));
  assert.ok(t.includes('Subject: FW: Estimate') && t.includes('Calendar invite:\nBEGIN:VCALENDAR'));
});

test('email: too-big emails get a clear reply instead of being read', async () => {
  const { tooBigText, MAX_PARSE_BYTES } = await import('../worker/src/email.js');
  assert.equal(MAX_PARSE_BYTES, 200 * 1024);
  const t = tooBigText(2.4 * 1048576, '00 Inbox/2026-10-26 Hot Water Guys - Job scheduled.eml');
  assert.match(t, /^This email is 2\.4 MB, too big for me to read \(my limit is 200 KB/);
  assert.match(t, /saved the whole email, attachments included, to 2608-Montrose-Blvd\/00 Inbox\/2026-10-26 Hot Water Guys/);
  assert.match(tooBigText(300 * 1024, null), /couldn't save a copy/);
});
