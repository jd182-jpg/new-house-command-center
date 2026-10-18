# New House Command Center

A personal move-in tracker for 2608 Montrose Blvd. It covers utilities, Wi-Fi, address changes, mail, and shopping, plus a home info sheet.
It's a static site: plain HTML, CSS, and JavaScript modules, with no build step and no server. Your data lives in your browser's localStorage, and once sync is turned on it also lives in one Firestore document so your phone and laptop match.

## Run it locally

```bash
cd ~/Documents/Projects/new-house-command-center && python3 -m http.server 8080
```

Then open http://localhost:8080. You need the server because browsers block JavaScript modules opened straight from `file://`.

## Run the tests

```bash
npm test
```

The tests use Node's built-in test runner (Node 18 or newer), so there is nothing to install. They cover the data model, the budget math, progress, do-next ordering, reordering, the fit check, the stair warnings, the Wi-Fi QR payload, the sync reconcile rules, and a two-device sync run against a fake Firestore.

## Files

| File | What it does |
| --- | --- |
| `js/seed-data.js` | **Edit this one.** Starter tasks, shopping items, rooms, and home info. |
| `js/model.js` | Pure logic (budget math, progress, do-next, fit check, QR payload). No DOM. |
| `js/store.js` | Saving to localStorage, plus import and export. |
| `js/sync.js` | Cross-device sync with Firestore and the header badge. |
| `js/sync-config.js` | **Paste your Firebase config here** to turn sync on. Also holds the document id. |
| `firestore.rules` | Security rules to publish in the Firebase console. |
| `js/app.js` | All the screens and interactions. |
| `css/styles.css` | The look: cognac leather, black metal, warm light. Light and dark themes. |
| `tests/model.test.js` | Unit tests, including the sync reconcile rules. |
| `tests/sync.test.js` | Two fake devices syncing through a fake Firestore. |

Seed changes show up after **Settings > Reset to seed data**, or in a browser that has never opened the app.

## Data model

```
state = {
  updatedAt: number,   // ms of the last edit; 0 means untouched seed data
  settings: { closingDate, moveInDate, budget, roomBudgets: { [room]: number }, theme, syncWifiPasswords },
  tasks:    [{ id, title, category, status, priority, due, notes, link, contact, phone, confirmation, hint, order }],
  items:    [{ id, name, room, category, priority, status, qty, unitPrice, store,
               links: [{ id, label, url, price }], chosenLinkId,
               orderNumber, expectedDelivery, dims: { w, d, h }, stairOk, notes, source, order }],
  homeInfo: { address, wifiName, wifiPassword, guestWifiName, guestWifiPassword, internetProvider,
              internetContact, trashDay, notes, utilities: [...], contacts: [...] },
  rooms:    [{ name, level, w, l }]
}
```

- **Spent** counts items marked Ordered, Shipped, Delivered, or Placed. **Planned** counts every item that has a price.
- An item's price is its own unit price. If that's blank, it uses the price on the chosen link.
- The **fit check** is a rough guide. It compares an item's width with the room's walls and is clearly labeled as a ballpark.

## Deploy

Live at **https://jd182-jpg.github.io/new-house-command-center/** (GitHub Pages, public repo `jd182-jpg/new-house-command-center`).

Every push to `main` redeploys automatically in about a minute:

```bash
git push
```

Your own edits are never in the repo. The seed file is public, though, so keep secrets out of `js/seed-data.js`.

## Sync between devices

Once it's set up, every change saves to one Firestore document and shows up on your other devices within a few seconds. There's no login.

The header badge tells you where things stand:

| Badge | Meaning |
| --- | --- |
| **Synced** (green) | Firestore's server has confirmed the latest copy. It only says this when the snapshot did not come from the local cache. |
| **Saving / Connecting / Offline, will sync** (amber) | Changes are safe in this browser and go up when the connection is back. |
| **Sync blocked / Sync error** (red) | Usually the rules aren't published yet. Your data is still saved locally. |
| **This device only** (grey) | Sync isn't set up, so the app works like before. |

**Who wins.** Every edit stamps the state with `updatedAt`. When a device connects or hears about a change, it compares timestamps (`reconcile` in `js/model.js`): the newer copy wins in either direction, and an older device adopts the cloud copy instead of overwriting it. Untouched seed data counts as 0, so a brand new phone always adopts your real list. If two devices ever disagree while both say Synced, open **Settings > Send this device's copy to all devices** on the one that's right.

**Wi-Fi passwords** stay in each browser by default and are stripped before anything is uploaded. **Settings > Also sync Wi-Fi passwords** turns that on. Leave it off unless you're fine with them sitting in a document that has no login.

**Privacy.** The document id in `js/sync-config.js` is random, but it's in this public repo, so anyone who reads the code could read or change your list. Fine for a shopping list. Don't put anything sensitive in the app.

### Turn on sync (about 5 minutes, free)

1. Go to https://console.firebase.google.com, click **Create a project**, name it `new-house-command-center`, and turn Google Analytics off.
2. On the project home, click the **</>** (Web) icon. Nickname it `nhcc`, leave Firebase Hosting unchecked, and click **Register app**.
3. Firebase shows a `firebaseConfig = { ... }` block. Copy it into `js/sync-config.js`, replacing `null`:

   ```js
   export const FIREBASE_CONFIG = {
     apiKey: '...',
     authDomain: '...',
     projectId: '...',
     storageBucket: '...',
     messagingSenderId: '...',
     appId: '...',
   };
   ```

   These values are meant to be public. The rules in step 5 are what protect the data.
4. In the left sidebar open **Build > Firestore Database > Create database**. Pick a US location (for example `us-central1` or `nam5`) and choose **production mode**.
5. Open the **Rules** tab, replace everything with the contents of `firestore.rules`, and click **Publish**.
6. Push (`git push`). Open the site on your laptop **first**, so its list becomes the cloud copy, and wait for the green **Synced** badge. Then open it on your phone, which adopts the same list.

To move data without sync (or as a backup), **Settings > Export JSON** still downloads everything and **Import JSON** loads it on another device.
