# New House Command Center

A personal move-in tracker for 2608 Montrose Blvd. It covers utilities, Wi-Fi, address changes, mail, and shopping, plus a home info sheet.
It's a static site: plain HTML, CSS, and JavaScript modules, with no build step and no server. Your data lives in your browser's localStorage.

## Run it locally

```bash
cd ~/Documents/Projects/new-house-command-center && python3 -m http.server 8080
```

Then open http://localhost:8080. You need the server because browsers block JavaScript modules opened straight from `file://`.

## Run the tests

```bash
npm test
```

The tests use Node's built-in test runner (Node 18 or newer), so there is nothing to install. They cover the data model, the budget math, progress, do-next ordering, reordering, the fit check, the stair warnings, and the Wi-Fi QR payload.

## Files

| File | What it does |
| --- | --- |
| `js/seed-data.js` | **Edit this one.** Starter tasks, shopping items, rooms, and home info. |
| `js/model.js` | Pure logic (budget math, progress, do-next, fit check, QR payload). No DOM. |
| `js/store.js` | Saving to localStorage, plus import and export. |
| `js/app.js` | All the screens and interactions. |
| `css/styles.css` | The look: cognac leather, black metal, warm light. Light and dark themes. |
| `tests/model.test.js` | Unit tests. |

Seed changes show up after **Settings > Reset to seed data**, or in a browser that has never opened the app.

## Data model

```
state = {
  settings: { closingDate, moveInDate, budget, roomBudgets: { [room]: number }, theme },
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

Heads up: `js/seed-data.js` holds your address, your HOA contact, and your agent's phone number. If you publish from a **public** repo, anyone can read that file. Your own edits and Wi-Fi passwords stay in your browser either way and are never uploaded.

**Option A: Netlify Drop (no account settings, keeps the repo private)**
1. Go to https://app.netlify.com/drop
2. Drag the `new-house-command-center` folder onto the page.
3. You get a live URL in a few seconds. Rename the site from Site settings if you like.

**Option B: GitHub Pages (same flow as your other apps)**

```bash
gh repo create new-house-command-center --public --source=. --push && gh api -X POST repos/jd182-jpg/new-house-command-center/pages -f "source[branch]=main" -f "source[path]=/"
```

The site goes live at https://jd182-jpg.github.io/new-house-command-center/ about a minute later. Free GitHub accounts only serve Pages from public repos, so strip the contacts out of the seed file first if that bothers you.

## Moving data between devices

Each browser keeps its own copy. To get your list onto your phone, go to **Settings > Export JSON** on your laptop, AirDrop the file to your phone, then use **Settings > Import JSON** there.
