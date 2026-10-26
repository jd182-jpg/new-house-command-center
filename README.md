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

The tests use Node's built-in test runner (Node 18 or newer), so there is nothing to install. They cover the data model, the text-update operations and endpoint, the budget math, progress, do-next ordering, reordering, the fit check, the stair warnings, the Wi-Fi QR payload, the sync reconcile rules, and a two-device sync run against a fake Firestore.

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
| `tests/text-ops.test.js` | The text-update operations (mark ordered, add item, and so on). |
| `tests/worker.test.js` | The text-update endpoint against a fake Firestore, including undo and a mid-save race. |
| `worker/` | The Cloudflare Worker behind **Text an update** (below). |

Edits to the base seed lists only show up after **Settings > Reset to seed data**, or in a browser that has never opened the app.

To add new facts to data you are already using, append an entry to `updates` at the bottom of `js/seed-data.js`. Each update runs once (remembered by its id) after the device has synced. It fills blank settings, adds tasks by id, and edits seeded tasks and items by exact title. It never touches your own dates or anything you deleted.

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

## Text an update

Say or type something like "ordered the Frame TV from Best Buy, $1,999, arrives Nov 22", "done: called CenterPoint", or "add bar stools to kitchen", and the change shows up on every device within a few seconds. Your phone gets a one-line reply such as `Marked 'Samsung The Frame Pro' Ordered, $1,999, Best Buy, arrives Nov 22.`

**How it works.** An Apple Shortcut named **House** posts your message to a small Cloudflare Worker (`worker/`, live at `https://house-text.leggettcp.workers.dev`). The Worker reads the Firestore document, sends Claude Haiku 5.5 your message plus a list of your tasks and items with their ids, and gets back structured operations. It applies them with `applyTextOps` in `js/model.js` (the same rules the tests cover), stamps a newer `updatedAt`, and writes the document back. Every device then adopts it through the normal sync.

**What it can do:** mark a task done or set its status, due date, confirmation number or a note; add a task; add an item; set an item's status, price, quantity, store, link, order number, expected delivery or a note; and change the closing or move-in date.

**Safety rules.**
- If Claude isn't sure which task or item you mean, nothing changes and you get a question back ("Which rug, living or dining?").
- All changes in one message apply together or not at all. Ids that don't exist, made-up statuses and unreadable dates are rejected.
- It never touches Home Info, so Wi-Fi passwords are never read or written.
- The write only goes through if nobody else saved in the meantime. If a device did, the Worker re-reads and applies your change on top.
- Text **undo** to put back the copy from before your last text. It only works until you edit something in the app.

**Cost.** Cloudflare Workers is free at this volume. Each text costs a small fraction of a cent on your Anthropic API key.

### Secrets

The Worker needs two secrets. Neither is in this repo.

| Secret | What it is |
| --- | --- |
| `HOUSE_TOKEN` | A long random password the Shortcut sends. A copy lives in `~/.house-text-token` on the laptop (readable only by you). |
| `ANTHROPIC_API_KEY` | Your key from https://console.anthropic.com (Settings > API Keys). |

To set or change one (you paste the value at the prompt):

```bash
cd ~/Documents/Projects/new-house-command-center/worker && npx wrangler secret put ANTHROPIC_API_KEY
```

To redeploy after changing `worker/` or `js/model.js` (the Worker bundles `js/model.js`, so redeploy after model changes too):

```bash
cd ~/Documents/Projects/new-house-command-center/worker && npm install && npx wrangler deploy
```

It deploys to the Cloudflare account `Jackson@leggettcp.com's Account` (pinned in `worker/wrangler.toml`). Logs: `npx wrangler tail` in `worker/`.

### Build the House shortcut (iPhone, about 3 minutes)

1. Open **Shortcuts**, tap **+**, and name the shortcut **House** (tap the name at the top).
2. Tap **Add Action**, search **Ask for Input**, and add it. Tap **Prompt** and type `What changed?`. Leave the input type as **Text**.
3. Search **Get Contents of URL** and add it. Tap **URL** and enter `https://house-text.leggettcp.workers.dev`.
4. Tap the **>** arrow on that action:
   - **Method:** POST.
   - **Request Body:** JSON. Tap **Add new field > Text**, key `text`, and for the value tap the variable bar and choose **Provided Input**.
   - Tap **Add new field > Text** again: key `token`, value your token (the text in `~/.house-text-token`).
   - No headers needed. (An `Authorization: Bearer <token>` header also works, but the Shortcuts header editor is easy to get wrong.)
5. Search **Show Notification** and add it. Tap the default text, delete it, and pick the **Contents of URL** variable.
6. Tap **Done**.

Now say "Hey Siri, House" and speak the update, or tap the shortcut and type it. To get the token onto the phone, open `~/.house-text-token` on the Mac and copy it into Notes or AirDrop it, then delete that note after pasting.

**If something's off:** "Not allowed: no token" means the `token` field is missing or its key is misspelled. "the token doesn't match" means the value is wrong; paste it again. "Something went wrong" includes the reason; `npx wrangler tail` shows more.
