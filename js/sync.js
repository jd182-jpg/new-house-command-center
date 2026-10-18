// Keeps this browser and the Firestore document in step. The decision of who wins lives in
// model.js (reconcile), so it is unit tested; this file only moves data and paints the badge.
import { reconcile, toSyncPayload } from './model.js';

const SDK = 'https://www.gstatic.com/firebasejs/10.12.2';
const PUSH_DELAY = 700;
// Firestore can stay silent for a long time when it can't reach the server, so stop
// saying "Connecting" after this long without a server answer.
const CONNECT_TIMEOUT = 12000;

// hooks: { getState, applyRemote(state) saves a state locally without pushing, setBadge(label, mode) }
// mode is 'on' (server confirmed), 'wait' (working or offline), 'off' (not set up) or 'error'.
// `sdk` can be passed in for tests; otherwise Firebase is loaded from the CDN.
export function startSync({ config, collection, docId, hooks, sdk }) {
  const { getState, applyRemote, setBadge } = hooks;
  if (!config || !config.projectId) {
    setBadge('This device only', 'off');
    return { push() {} };
  }
  setBadge('Connecting', 'wait');
  let heardFromServer = false;
  const connectTimer = setTimeout(() => { if (!heardFromServer) setBadge('Offline, will sync', 'wait'); }, CONNECT_TIMEOUT);
  if (connectTimer.unref) connectTimer.unref(); // Node only: don't hold the test runner open

  let docRef = null;
  let fs = null;
  let timer = null;
  let lastPushed = -1;

  function push() {
    if (!docRef) return; // the first snapshot will reconcile once connected
    clearTimeout(timer);
    timer = setTimeout(() => {
      const state = getState();
      if (state.updatedAt === lastPushed) return;
      lastPushed = state.updatedAt;
      setBadge('Saving', 'wait');
      fs.setDoc(docRef, { payload: JSON.stringify(toSyncPayload(state)), updatedAt: state.updatedAt })
        .catch((err) => {
          lastPushed = -1;
          console.warn('Sync write failed.', err);
          setBadge(err.code === 'permission-denied' ? 'Sync blocked' : 'Sync error', 'error');
        });
    }, PUSH_DELAY);
  }

  const load = sdk
    ? Promise.resolve(sdk)
    : Promise.all([import(`${SDK}/firebase-app.js`), import(`${SDK}/firebase-firestore.js`)])
      .then(([app, firestore]) => ({ ...app, ...firestore }));

  load.then((mod) => {
    fs = mod;
    const db = mod.getFirestore(mod.initializeApp(config));
    docRef = mod.doc(db, collection, docId);

    // Firestore hands over a cached snapshot before it has reached the server, so "Synced"
    // waits for one that is not fromCache and has no writes still in flight.
    mod.onSnapshot(docRef, { includeMetadataChanges: true }, (snap) => {
      const fromServer = !snap.metadata.fromCache;
      if (fromServer) heardFromServer = true;
      const confirmed = fromServer && !snap.metadata.hasPendingWrites;
      if (confirmed) setBadge('Synced', 'on');
      else if (!fromServer) setBadge('Offline, will sync', 'wait');

      let remote = null;
      if (snap.exists()) {
        try { remote = JSON.parse(snap.data().payload); } catch (err) {
          console.warn('Cloud copy could not be read.', err);
          return;
        }
      } else if (!fromServer) {
        return; // an empty cache says nothing about the server
      }

      const decision = reconcile(getState(), remote);
      if (decision.action === 'apply') applyRemote(decision.state);
      // Only upload once the server has answered, so a stale cache can't trigger a write.
      else if (decision.action === 'push' && fromServer) {
        if (decision.state) applyRemote(decision.state); // saves the fresh stamp locally first
        push();
      }
    }, (err) => {
      console.warn('Sync listen failed.', err);
      setBadge(err.code === 'permission-denied' ? 'Sync blocked' : 'Sync error', 'error');
    });
  }).catch((err) => {
    console.warn('Could not load Firebase.', err);
    setBadge('Sync unavailable', 'error');
  });

  return { push };
}
