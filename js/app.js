// UI for the New House Command Center. Renders HTML strings into #view and
// handles every interaction through a few delegated listeners.
import * as M from './model.js';
import { loadState, saveState, resetToSeed, exportJSON, importJSON } from './store.js';
import { startSync } from './sync.js';
import seed from './seed-data.js';
import { FIREBASE_CONFIG, COLLECTION, DOC_ID } from './sync-config.js';

const SYNC_ON = !!(FIREBASE_CONFIG && FIREBASE_CONFIG.projectId);

let state = loadState();
const UI_KEY = 'nhcc.ui.v1';
const ui = Object.assign({
  taskView: 'category',
  taskFilters: { q: '', cat: '', status: '', priority: '', hideDone: false },
  shopView: 'table',
  shopFilters: { q: '', room: '', category: '', status: '', priority: '' },
  sort: { key: 'room', dir: 1 },
  shopHideGot: false,
  docKind: '',
  docFilters: { q: '' },
}, readUi());
const openTasks = new Set();
let lastDeleted = null;

const ITEM_CATEGORIES = ['Furniture', 'Bedding and textiles', 'Lighting', 'Electronics', 'Smart home', 'Kitchenware',
  'Appliances', 'Cleaning', 'Tools and safety', 'Storage', 'Bath', 'Art and decor', 'Fitness', 'Wellness',
  'Pantry and supplies', 'Outdoor', 'Other'];

// ---------- Helpers ----------

function readUi() {
  try { return JSON.parse(localStorage.getItem(UI_KEY)) || {}; } catch { return {}; }
}
function saveUi() {
  try { localStorage.setItem(UI_KEY, JSON.stringify(ui)); } catch { /* private mode: fine */ }
}
const $ = (sel, root = document) => root.querySelector(sel);
const esc = (v) => String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const money = (n) => (n == null ? '' : M.formatMoney(n, { cents: n % 1 !== 0 }));
const opts = (list, selected, blank) =>
  (blank != null ? `<option value="">${esc(blank)}</option>` : '') +
  list.map((v) => `<option value="${esc(v)}"${v === selected ? ' selected' : ''}>${esc(v)}</option>`).join('');
const slug = (s) => s.toLowerCase().replace(/[^a-z]+/g, '');

function safeUrl(u) {
  const s = String(u || '').trim();
  if (!s) return '';
  if (/^https?:\/\//i.test(s)) return s;
  if (/^[\w-]+(\.[\w-]+)+(\/\S*)?$/.test(s)) return `https://${s}`;
  return '';
}
function hostOf(u) {
  try { return new URL(safeUrl(u)).hostname.replace(/^www\./, ''); } catch { return 'link'; }
}
function fmtDate(iso) {
  if (!iso) return '';
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(y, m - 1, d).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}
function dueLabel(task) {
  if (!task.due) return '';
  const n = M.daysUntil(task.due);
  if (task.status !== 'Done' && n < 0) return `<span class="pill overdue">Overdue ${-n}d</span>`;
  if (n === 0) return '<span class="pill warn">Due today</span>';
  return `<span class="pill">${n === 1 ? 'Tomorrow' : fmtDate(task.due)}</span>`;
}
const roomMap = () => new Map(state.rooms.map((r) => [r.name, r]));
const roomNames = () => {
  const names = state.rooms.map((r) => r.name);
  for (const it of state.items) if (!names.includes(it.room)) names.push(it.room);
  return names;
};
const itemCategories = () => [...new Set([...ITEM_CATEGORIES, ...state.items.map((i) => i.category)])];

const ICON = {
  edit: '<svg viewBox="0 0 24 24"><path d="M3 17.2V21h3.8l11-11-3.8-3.8zM20.7 7a1 1 0 0 0 0-1.4l-2.3-2.3a1 1 0 0 0-1.4 0l-1.8 1.8 3.8 3.8z"/></svg>',
  chev: '<svg viewBox="0 0 24 24"><path d="M7.4 8.6 12 13.2l4.6-4.6L18 10l-6 6-6-6z"/></svg>',
  grip: '<svg viewBox="0 0 24 24"><path d="M9 4h2v2H9zm4 0h2v2h-2zM9 9h2v2H9zm4 0h2v2h-2zm-4 5h2v2H9zm4 0h2v2h-2zm-4 5h2v2H9zm4 0h2v2h-2z"/></svg>',
  x: '<svg viewBox="0 0 24 24"><path d="M19 6.4 17.6 5 12 10.6 6.4 5 5 6.4 10.6 12 5 17.6 6.4 19l5.6-5.6 5.6 5.6 1.4-1.4-5.6-5.6z"/></svg>',
  open: '<svg viewBox="0 0 24 24"><path d="M14 3v2h3.6l-9.8 9.8 1.4 1.4L19 6.4V10h2V3zm5 16H5V5h7V3H5a2 2 0 0 0-2 2v14c0 1.1.9 2 2 2h14a2 2 0 0 0 2-2v-7h-2z"/></svg>',
  eye: '<svg viewBox="0 0 24 24"><path d="M12 4.5C7 4.5 2.7 7.6 1 12c1.7 4.4 6 7.5 11 7.5s9.3-3.1 11-7.5c-1.7-4.4-6-7.5-11-7.5M12 17a5 5 0 1 1 0-10 5 5 0 0 1 0 10m0-8a3 3 0 1 0 0 6 3 3 0 0 0 0-6"/></svg>',
  lock: '<svg viewBox="0 0 24 24"><path d="M18 8h-1V6A5 5 0 0 0 7 6v2H6a2 2 0 0 0-2 2v10c0 1.1.9 2 2 2h12a2 2 0 0 0 2-2V10a2 2 0 0 0-2-2m-6 9a2 2 0 1 1 0-4 2 2 0 0 1 0 4m3.1-9H8.9V6a3.1 3.1 0 0 1 6.2 0z"/></svg>',
};

// ---------- State changes ----------

function commit(mutator, { render = true } = {}) {
  mutator(state);
  M.stampUpdated(state);
  saveState(state);
  sync.push();
  if (render) renderView();
}

// Swaps in a whole new state (import, reset, or a newer copy from another device).
function replaceState(next, { push = true } = {}) {
  state = next;
  saveState(state);
  if (push) sync.push();
  applyTheme();
  renderSoon();
}

// A newer copy can arrive while you are typing; wait for the field to lose focus
// instead of redrawing the page under your cursor.
let renderPending = false;
function renderSoon() {
  const a = document.activeElement;
  if (a && a.closest('#view') && a.matches('input, textarea, select')) {
    renderPending = true;
    return;
  }
  renderView();
}
document.addEventListener('focusout', () => {
  if (!renderPending) return;
  setTimeout(() => {
    const a = document.activeElement;
    if (a && a.closest('#view') && a.matches('input, textarea, select')) return;
    renderPending = false;
    renderView();
  }, 0);
});

function setSyncBadge(label, mode) {
  const el = $('#sync-badge');
  if (!el) return;
  el.dataset.mode = mode;
  $('#sync-label').textContent = label;
  el.title = {
    on: 'Saved to the cloud. Your other devices will match.',
    wait: 'Changes are saved here and will sync when the connection is back.',
    off: 'Sync is not set up, so data stays in this browser. See the README.',
    error: 'Sync is not working right now. Changes are still saved in this browser.',
  }[mode] || '';
}

function toast(msg, undo) {
  const el = $('#toast');
  el.innerHTML = `<span>${esc(msg)}</span>${undo ? '<button type="button" data-act="undo">Undo</button>' : ''}`;
  el.classList.add('show');
  clearTimeout(toast.t);
  toast.t = setTimeout(() => el.classList.remove('show'), undo ? 6000 : 2600);
}

function confirmAction(title, body, okLabel = 'Yes, do it') {
  const dlg = $('#confirm');
  $('#confirm-title').textContent = title;
  $('#confirm-body').textContent = body;
  $('#confirm-ok').textContent = okLabel;
  dlg.returnValue = '';
  dlg.showModal();
  return new Promise((resolve) => dlg.addEventListener('close', () => resolve(dlg.returnValue === 'ok'), { once: true }));
}

function applyTheme() {
  const t = state.settings.theme;
  if (t === 'auto') delete document.documentElement.dataset.theme;
  else document.documentElement.dataset.theme = t;
}

function togglePurchased(item, purchasedStatus = 'Ordered') {
  if (M.isPurchased(item)) {
    item.status = item.prevStatus && !M.PURCHASED_STATUSES.includes(item.prevStatus) ? item.prevStatus : 'To purchase';
    item.prevStatus = null;
  } else {
    item.prevStatus = item.status;
    item.status = purchasedStatus;
  }
}

// ---------- Router ----------

const ROUTES = { dashboard: viewDashboard, tasks: viewTasks, shopping: viewShopping, home: viewHome, files: viewFiles, settings: viewSettings };
const route = () => (location.hash.slice(1) in ROUTES ? location.hash.slice(1) : 'dashboard');

function renderView() {
  const r = route();
  const y = window.scrollY;
  $('#view').innerHTML = ROUTES[r]();
  document.querySelectorAll('.tabs a').forEach((a) => a.classList.toggle('active', a.dataset.route === r));
  if (r === 'home') drawQr();
  window.scrollTo(0, y);
}

// ---------- Dashboard ----------

function viewDashboard() {
  const s = state.settings;
  const mi = M.daysUntil(s.moveInDate);
  const cl = M.daysUntil(s.closingDate);
  let big; let label;
  if (mi == null) { big = '?'; label = 'Add your move-in date to start the countdown.'; }
  else if (mi > 0) { big = mi; label = `day${mi === 1 ? '' : 's'} until move-in`; }
  else if (mi === 0) { big = 'Today'; label = 'Move-in day. Lift with your legs.'; }
  else { big = -mi; label = `day${mi === -1 ? '' : 's'} since move-in. Welcome home.`; }
  const closingLine = cl == null ? 'Closing date not set yet.'
    : cl > 0 ? `Closing in ${cl} day${cl === 1 ? '' : 's'} (${fmtDate(s.closingDate)}).`
      : cl === 0 ? 'Closing is today. Bring a pen and ID.' : `Closed ${fmtDate(s.closingDate)}. It's yours.`;

  const overall = M.overallProgress(state.tasks, state.items);
  const C = 2 * Math.PI * 56;
  const bars = [...M.TASK_CATEGORIES.map((c) => [c, M.taskProgress(state.tasks, c)]), ['Shopping', M.shoppingProgress(state.items)]];
  const next = M.doNext(state.tasks, 5);
  const b = M.budgetSummary(state.items, s.budget);
  const soon = state.items
    .filter((i) => i.expectedDelivery && ['Ordered', 'Shipped'].includes(i.status))
    .sort((a, c) => (a.expectedDelivery < c.expectedDelivery ? -1 : 1)).slice(0, 5);

  return `
  <div class="page-head"><div><h1>Howdy, Jackson.</h1><p>Here's where the move stands.</p></div></div>
  <div class="grid dash-grid">
    <section class="card countdown span-5">
      <h2>Move-in countdown</h2>
      <div><div class="big-num">${esc(big)}</div><div class="label">${esc(label)}</div></div>
      <div class="label">${esc(closingLine)}</div>
      <div class="dates">
        <label class="field">Closing date<input type="date" data-change="setting" data-key="closingDate" value="${esc(s.closingDate)}"></label>
        <label class="field">Move-in date<input type="date" data-change="setting" data-key="moveInDate" value="${esc(s.moveInDate)}"></label>
      </div>
    </section>

    <section class="card span-7">
      <h2>Progress</h2>
      <div class="progress-wrap">
        <div class="ring" role="img" aria-label="${overall.pct}% complete overall">
          <svg viewBox="0 0 132 132"><circle class="track" cx="66" cy="66" r="56" fill="none" stroke-width="12"/>
          <circle class="bar" cx="66" cy="66" r="56" fill="none" stroke-width="12" stroke-linecap="round"
            stroke-dasharray="${C}" stroke-dashoffset="${C * (1 - overall.pct / 100)}"/></svg>
          <div class="center"><div><strong>${overall.pct}%</strong><span>${overall.done} of ${overall.total}</span></div></div>
        </div>
        <div class="bars">${bars.map(([name, p]) => `
          <div class="bar-row"><span>${esc(name)}</span><span class="muted">${p.done}/${p.total}</span>
          <div class="meter"><i style="width:${p.pct}%"></i></div></div>`).join('')}
        </div>
      </div>
    </section>

    <section class="card span-7">
      <div class="card-head"><h2>Do next</h2><a href="#tasks" class="small">All tasks</a></div>
      ${next.length ? `<ul class="donext">${next.map((t) => `
        <li class="${M.isOverdue(t) ? 'overdue' : ''}">
          <input type="checkbox" class="check" data-act="toggle-task" data-id="${t.id}" aria-label="Mark done">
          <div class="title">${esc(t.title)}<small>${esc(t.category)}</small></div>
          ${dueLabel(t)}<span class="pill ${slug(t.priority)}">${esc(t.priority)}</span>
        </li>`).join('')}</ul>`
    : empty('🏁', 'Nothing on deck.', 'Every task is done. Go find the good taco spot.')}
    </section>

    <section class="card span-5">
      <div class="card-head"><h2>Shopping budget</h2><a href="#shopping" class="small">Open shopping</a></div>
      ${b.budget == null
    ? '<div class="callout">No budget yet. Set one in Shopping or Settings to see what is left.</div>'
    : `<div class="meter lg ${b.overBudget ? 'over' : ''}"><i style="width:${b.pctSpent}%"></i></div>`}
      <div class="stat-row">
        <div class="stat"><span>Spent</span><strong>${money(b.spent)}</strong></div>
        <div class="stat"><span>Budget</span><strong>${b.budget == null ? 'None' : money(b.budget)}</strong></div>
        <div class="stat ${b.overBudget ? 'over' : ''}"><span>${b.overBudget ? 'Over by' : 'Left'}</span><strong>${b.remaining == null ? '...' : money(Math.abs(b.remaining))}</strong></div>
      </div>
      ${b.plannedOverBudget && !b.overBudget ? `<div class="callout warn" style="margin-bottom:10px">Heads up: priced items total ${money(b.planned)}, which is over budget.</div>` : ''}
      ${b.overBudget ? '<div class="callout danger" style="margin-bottom:10px">Over budget. Time to move something to Later.</div>' : ''}
      <div class="chips">${M.ITEM_STATUSES.map((st) => `<span class="pill">${esc(st)} ${b.statusCounts[st]}</span>`).join('')}</div>
      ${soon.length ? `<div class="section-label">Arriving soon</div><ul class="donext">${soon.map((i) => `
        <li><div class="title">${esc(i.name)}<small>${esc(i.room)} · ${esc(i.status)}</small></div><span class="pill">${fmtDate(i.expectedDelivery)}</span></li>`).join('')}</ul>` : ''}
    </section>

    <section class="card span-7">
      <div class="card-head"><h2>Coming up</h2><a href="#files" class="small">All appointments</a></div>
      ${upcoming().length ? `<ul class="donext">${upcoming().slice(0, 5).map(apptLi).join('')}</ul>`
    : empty('📅', 'No appointments yet.', 'Forward booking emails to house@darr.solutions and they show up here.')}
    </section>

    <section class="card span-5">
      <div class="card-head"><h2>Warranties and papers</h2><a href="#files" class="small">All files</a></div>
      ${warranties().length ? `<ul class="donext">${warranties().slice(0, 4).map((d) => `
        <li><div class="title">${esc(d.title)}<small>${esc(d.vendor || d.kind)}</small></div>${expiryPill(d)}</li>`).join('')}</ul>`
    : `<p class="muted small">${state.documents.length} filed. Forward estimates, warranties and notices to house@darr.solutions.</p>`}
    </section>
  </div>`;
}

// ---------- Files and appointments ----------

const linkedName = (x) => (x.itemId ? (state.items.find((i) => i.id === x.itemId) || {}).name
  : x.taskId ? (state.tasks.find((t) => t.id === x.taskId) || {}).title : '') || '';
const upcoming = () => state.appointments
  .filter((a) => a.status === 'Scheduled' && (M.daysUntil(a.date) ?? 0) >= 0)
  .sort((a, b) => `${a.date} ${a.start}`.localeCompare(`${b.date} ${b.start}`));
const warranties = () => state.documents.filter((d) => d.expires)
  .sort((a, b) => a.expires.localeCompare(b.expires));
const timeRange = (a) => (a.start ? `${M.fmtTime(a.start)}${a.end ? `-${M.fmtTime(a.end)}` : ''}` : 'Any time');

function expiryPill(d) {
  if (!d.expires) return '';
  const days = M.daysUntil(d.expires);
  const cls = days < 0 ? 'high' : days <= 60 ? 'medium' : 'ok';
  return `<span class="pill ${cls}">${days < 0 ? 'Expired' : 'Until'} ${fmtDate(d.expires)}</span>`;
}

function apptLi(a) {
  const days = M.daysUntil(a.date);
  const on = linkedName(a);
  return `<li class="${a.status !== 'Scheduled' ? 'muted' : ''}">
    <div class="title">${esc(a.title)}<small>${esc([timeRange(a), a.who, a.phone, on && `for ${on}`].filter(Boolean).join(' · '))}</small></div>
    <span class="pill ${days === 0 ? 'medium' : ''}">${a.status === 'Scheduled' ? (days === 0 ? 'Today' : fmtDate(a.date)) : esc(a.status)}</span>
  </li>`;
}

function fileLinks(d) {
  const links = d.files.map((f) => {
    const url = safeUrl(f.webUrl);
    return url ? `<a href="${esc(url)}" target="_blank" rel="noopener" title="${esc(f.path)}">${esc(f.name)} ↗</a>` : `<span>${esc(f.name)}</span>`;
  });
  // Photo sets can hold 20 files; show two and fold the rest away.
  if (links.length <= 3) return links.join(' ');
  return `${links.slice(0, 2).join(' ')}<details class="more-files"><summary>+${links.length - 2} more</summary>${links.slice(2).join(' ')}</details>`;
}

// Docs and appointments linked to one task or item, for the task row and item editor.
function linkedPapers(key, id) {
  const docs = state.documents.filter((d) => d[key] === id);
  const appts = state.appointments.filter((a) => a[key] === id);
  if (!docs.length && !appts.length) return '';
  return `<div class="kv papers">
    ${appts.map((a) => `<span><b>${esc(a.title)}:</b> ${fmtDate(a.date)} ${esc(timeRange(a))}${a.status !== 'Scheduled' ? ` (${esc(a.status)})` : ''}</span>`).join('')}
    ${docs.map((d) => `<span><b>${esc(d.kind)}:</b> ${esc(d.title)}${d.amount != null ? `, ${money(d.amount)}` : ''} ${fileLinks(d)}</span>`).join('')}
  </div>`;
}

function viewFiles() {
  const kinds = M.DOC_KINDS.filter((k) => state.documents.some((d) => d.kind === k));
  const q = ((ui.docFilters && ui.docFilters.q) || '').trim().toLowerCase();
  const docs = state.documents.filter((d) => !ui.docKind || d.kind === ui.docKind)
    .filter((d) => !q || `${d.title} ${d.vendor} ${d.summary} ${d.kind}`.toLowerCase().includes(q))
    .sort((a, b) => (b.date || b.addedAt || '').localeCompare(a.date || a.addedAt || ''));
  const up = upcoming();
  const past = state.appointments.filter((a) => !up.includes(a)).sort((a, b) => b.date.localeCompare(a.date));
  return `
  <div class="page-head"><div><h1>Files and appointments</h1>
    <p>Forward any house email (estimates, warranties, notices, bookings) to <a href="mailto:house@darr.solutions">house@darr.solutions</a>. Files are saved to your 2608-Montrose-Blvd OneDrive folder.</p></div></div>
  <div class="grid">
    <section class="card span-12">
      <div class="card-head"><h2>Appointments</h2></div>
      ${up.length || past.length ? `<ul class="donext">${up.map((a) => apptRow(a)).join('')}</ul>
        ${past.length ? `<details class="past"><summary class="small muted">Past and canceled (${past.length})</summary><ul class="donext">${past.map((a) => apptRow(a)).join('')}</ul></details>` : ''}`
    : empty('📅', 'Nothing booked yet.', 'Forward a confirmation email and it lands here with the time, who is coming and their number.')}
    </section>

    <section class="card span-12">
      <div class="card-head"><h2>Documents</h2>
        ${kinds.length > 1 ? `<div class="segmented"><button class="${ui.docKind ? '' : 'on'}" data-act="doc-kind" data-v="">All</button>${kinds.map((k) => `<button class="${ui.docKind === k ? 'on' : ''}" data-act="doc-kind" data-v="${esc(k)}">${esc(k)}</button>`).join('')}</div>` : ''}
      </div>
      ${state.documents.length > 8 ? `<div class="toolbar"><input type="search" placeholder="Search documents" value="${esc(q)}" data-filter="doc" data-key="q" aria-label="Search documents"></div>` : ''}
      ${docs.length ? `<ul class="donext">${docs.map((d) => {
    const on = linkedName(d);
    return `<li class="doc-row">
          <div class="title">${esc(d.title)}
            <small>${esc([d.kind, d.vendor, d.date && fmtDate(d.date), on && `for ${on}`].filter(Boolean).join(' · '))}</small>
            ${d.summary ? `<p class="doc-summary">${esc(d.summary)}</p>` : ''}
            ${d.files.length ? `<div class="doc-files">${fileLinks(d)}</div>` : ''}
          </div>
          ${d.amount != null ? `<strong>${money(d.amount)}</strong>` : ''}${expiryPill(d)}
          <button class="icon-btn" data-act="delete-doc" data-id="${d.id}" title="Remove from the list (the file stays in OneDrive)">${ICON.x}</button>
        </li>`;
  }).join('')}</ul>`
    : empty('🗂️', q ? 'Nothing matches that search.' : ui.docKind ? `No ${ui.docKind.toLowerCase()} documents.` : 'No documents yet.', q ? 'Try a vendor or a word from the title.' : 'Forward an estimate or warranty email to house@darr.solutions to file it.')}
    </section>
  </div>`;
}

function apptRow(a) {
  return apptLi(a).replace('</li>', `
    ${a.status === 'Scheduled' ? `<button class="btn sm" data-act="appt-done" data-id="${a.id}">Done</button>` : ''}
    <button class="icon-btn" data-act="delete-appt" data-id="${a.id}" title="Delete">${ICON.x}</button></li>`);
}

function empty(icon, title, body) {
  return `<div class="empty"><div class="big">${icon}</div><strong>${esc(title)}</strong>${esc(body)}</div>`;
}

// ---------- Tasks ----------

function filteredTasks() {
  const f = ui.taskFilters;
  const q = f.q.trim().toLowerCase();
  return state.tasks.filter((t) =>
    (!q || `${t.title} ${t.notes} ${t.hint} ${t.contact}`.toLowerCase().includes(q)) &&
    (!f.cat || t.category === f.cat) &&
    (!f.status || t.status === f.status) &&
    (!f.priority || t.priority === f.priority) &&
    (!f.hideDone || t.status !== 'Done'));
}

function viewTasks() {
  const f = ui.taskFilters;
  const list = filteredTasks();
  const filtering = f.q || f.cat || f.status || f.priority || f.hideDone;
  let body;
  if (ui.taskView === 'category') {
    body = M.TASK_CATEGORIES.filter((c) => !f.cat || f.cat === c).map((c) => {
      const tasks = list.filter((t) => t.category === c).sort((a, b) => a.order - b.order);
      const p = M.taskProgress(state.tasks, c);
      return `<section class="group">
        <div class="group-head"><h2>${esc(c)}</h2><span class="muted small">${p.done}/${p.total}</span><div class="meter"><i style="width:${p.pct}%"></i></div></div>
        ${tasks.length ? `<ul class="task-list" data-cat="${esc(c)}">${tasks.map((t) => taskRow(t, true)).join('')}</ul>`
    : `<div class="card empty small">${filtering ? 'Nothing matches here.' : 'All clear in this category.'}</div>`}
      </section>`;
    }).join('');
  } else {
    const buckets = [['Overdue', []], ['Next 7 days', []], ['Later', []], ['No due date', []], ['Done', []]];
    for (const t of list) {
      const n = M.daysUntil(t.due);
      const i = t.status === 'Done' ? 4 : n == null ? 3 : n < 0 ? 0 : n <= 7 ? 1 : 2;
      buckets[i][1].push(t);
    }
    body = buckets.filter(([, ts]) => ts.length).map(([name, ts]) => `
      <section class="group"><div class="group-head"><h2>${name}</h2><span class="muted small">${ts.length}</span></div>
      <ul class="task-list">${ts.sort((a, b) => (a.due || '9') < (b.due || '9') ? -1 : 1).map((t) => taskRow(t, false)).join('')}</ul></section>`).join('')
      || empty('🔎', 'No tasks match.', 'Try clearing a filter.');
  }

  return `
  <div class="page-head"><div><h1>Tasks</h1><p>Closing, repairs, utilities, Wi-Fi, address changes, and mail. Tap a task for the how-to.</p></div>
    <div class="segmented" role="tablist">
      <button class="${ui.taskView === 'category' ? 'on' : ''}" data-act="task-view" data-v="category">By category</button>
      <button class="${ui.taskView === 'due' ? 'on' : ''}" data-act="task-view" data-v="due">By due date</button>
    </div></div>
  <form class="quick-add" data-form="quick-task">
    <input name="title" placeholder="Add a task, like &quot;Call CenterPoint&quot;" autocomplete="off" aria-label="New task">
    <select name="category" aria-label="Category">${opts(M.TASK_CATEGORIES, f.cat || 'Utilities')}</select>
    <button class="btn primary">Add</button>
  </form>
  <div class="toolbar">
    <input type="search" placeholder="Search tasks" value="${esc(f.q)}" data-filter="task" data-key="q" aria-label="Search tasks">
    <select data-filter="task" data-key="cat" aria-label="Category">${opts(M.TASK_CATEGORIES, f.cat, 'All categories')}</select>
    <select data-filter="task" data-key="status" aria-label="Status">${opts(M.TASK_STATUSES, f.status, 'Any status')}</select>
    <select data-filter="task" data-key="priority" aria-label="Priority">${opts(M.TASK_PRIORITIES, f.priority, 'Any priority')}</select>
    <label class="check-inline"><input type="checkbox" data-filter="task" data-key="hideDone" ${f.hideDone ? 'checked' : ''}> Hide done</label>
    ${filtering ? '<button class="btn ghost sm" data-act="clear-task-filters">Clear</button>' : ''}
  </div>
  ${body}`;
}

function taskRow(t, draggable) {
  const done = t.status === 'Done';
  const link = safeUrl(t.link);
  return `<li class="task ${done ? 'done' : ''} ${openTasks.has(t.id) ? 'open' : ''}" data-id="${t.id}">
    <div class="task-row">
      ${draggable ? `<span class="handle" draggable="true" title="Drag to reorder">${ICON.grip}</span>` : ''}
      <input type="checkbox" class="check" data-act="toggle-task" data-id="${t.id}" ${done ? 'checked' : ''} aria-label="Done">
      <span class="task-title" data-act="expand" data-id="${t.id}">${esc(t.title)}</span>
      <div class="task-meta">
        ${dueLabel(t)}
        <span class="pill ${slug(t.priority)}">${esc(t.priority)}</span>
        <select data-change="task-status" data-id="${t.id}" aria-label="Status">${opts(M.TASK_STATUSES, t.status)}</select>
        <button class="icon-btn" data-act="edit-task" data-id="${t.id}" title="Edit">${ICON.edit}</button>
        <button class="icon-btn chev" data-act="expand" data-id="${t.id}" title="Show how">${ICON.chev}</button>
      </div>
    </div>
    <div class="task-body">
      ${t.hint ? `<div class="hint"><b>How</b>${esc(t.hint)}</div>` : ''}
      <div class="kv">
        ${t.notes ? `<span><b>Notes:</b> ${esc(t.notes)}</span>` : ''}
        ${t.contact ? `<span><b>Contact:</b> ${esc(t.contact)}</span>` : ''}
        ${t.phone ? `<span><b>Phone:</b> <a href="tel:${esc(t.phone.replace(/[^\d+]/g, ''))}">${esc(t.phone)}</a></span>` : ''}
        ${t.confirmation ? `<span><b>Confirmation:</b> ${esc(t.confirmation)}</span>` : ''}
        ${link ? `<span><a href="${esc(link)}" target="_blank" rel="noopener">${esc(hostOf(link))} ↗</a></span>` : ''}
        ${t.due ? `<span><b>Due:</b> ${fmtDate(t.due)}</span>` : ''}
      </div>
      ${linkedPapers('taskId', t.id)}
    </div>
  </li>`;
}

function openTaskEditor(id) {
  const t = id ? state.tasks.find((x) => x.id === id) : M.createTask({ title: '' });
  if (!t) return;
  const m = $('#modal');
  m.innerHTML = `<form class="modal-inner" data-form="task" data-id="${id || ''}">
    <div class="modal-head"><h2>${id ? 'Edit task' : 'New task'}</h2><button type="button" class="icon-btn" data-act="close-modal" title="Close">${ICON.x}</button></div>
    <div class="form-grid">
      <label class="field full">Title<input name="title" value="${esc(t.title)}" required></label>
      <label class="field">Category<select name="category">${opts(M.TASK_CATEGORIES, t.category)}</select></label>
      <label class="field">Status<select name="status">${opts(M.TASK_STATUSES, t.status)}</select></label>
      <label class="field">Priority<select name="priority">${opts(M.TASK_PRIORITIES, t.priority)}</select></label>
      <label class="field">Due date<input type="date" name="due" value="${esc(t.due)}"></label>
      <label class="field">Contact name<input name="contact" value="${esc(t.contact)}"></label>
      <label class="field">Phone<input type="tel" name="phone" value="${esc(t.phone)}"></label>
      <label class="field full">Link<input name="link" value="${esc(t.link)}" placeholder="https://"></label>
      <label class="field full">Confirmation number<input name="confirmation" value="${esc(t.confirmation)}" autocomplete="off">
        <span class="warn-note">Never store passwords, SSNs, or full account numbers here. Last 4 digits is plenty.</span></label>
      <label class="field full">Notes<textarea name="notes">${esc(t.notes)}</textarea></label>
      <label class="field full">How (hint)<textarea name="hint">${esc(t.hint)}</textarea></label>
    </div>
    <div class="modal-actions">
      ${id ? '<button type="button" class="btn ghost" data-act="delete-task" data-id="' + id + '" style="color:var(--danger)">Delete</button>' : ''}
      <div class="right"><button type="button" class="btn ghost" data-act="close-modal">Cancel</button><button class="btn primary">Save</button></div>
    </div>
  </form>`;
  m.showModal();
}

// ---------- Shopping ----------

function filteredItems() {
  const f = ui.shopFilters;
  const q = f.q.trim().toLowerCase();
  return state.items.filter((i) =>
    (!q || `${i.name} ${i.brand} ${i.notes} ${i.store} ${i.category}`.toLowerCase().includes(q)) &&
    (!f.room || i.room === f.room) && (!f.category || i.category === f.category) &&
    (!f.status || i.status === f.status) && (!f.priority || i.priority === f.priority));
}

function viewShopping() {
  const s = state.settings;
  const b = M.budgetSummary(state.items, s.budget);
  const f = ui.shopFilters;
  const filtering = f.q || f.room || f.category || f.status || f.priority;
  const purchased = state.items.filter(M.isPurchased).length;
  const views = [['table', 'Table'], ['board', 'Board'], ['rooms', 'By room'], ['shop', 'Shopping mode']];
  let body = '';
  const list = filteredItems();
  if (ui.shopView === 'shop') body = shopMode();
  else if (!list.length) body = empty('🛋️', filtering ? 'Nothing matches.' : 'No items yet.', filtering ? 'Try clearing a filter.' : 'Add your first item above. Start with the mattress.');
  else if (ui.shopView === 'board') body = shopBoard(list);
  else if (ui.shopView === 'rooms') body = shopRooms(list);
  else body = shopTable(list);

  return `
  <div class="page-head"><div><h1>Shopping and supplies</h1><p>Save links to options, pick one, and tick it off once ordered.</p></div>
    <div class="segmented">${views.map(([v, l]) => `<button class="${ui.shopView === v ? 'on' : ''}" data-act="shop-view" data-v="${v}">${l}</button>`).join('')}</div></div>
  ${ui.shopView === 'shop' ? '' : `<div class="budget-strip">
    <label class="stat field">Overall budget<input type="number" min="0" step="100" inputmode="decimal" placeholder="Set a budget" value="${s.budget ?? ''}" data-change="setting" data-key="budget"></label>
    <div class="stat"><span>Spent (ordered and up)</span><strong>${money(b.spent)}</strong></div>
    <div class="stat"><span>All priced items</span><strong>${money(b.planned)}</strong>${b.unpriced ? `<span>${b.unpriced} not priced yet</span>` : ''}</div>
    <div class="stat ${b.overBudget ? 'over' : ''}"><span>${b.overBudget ? 'Over budget by' : 'Remaining'}</span><strong>${b.remaining == null ? 'No budget' : money(Math.abs(b.remaining))}</strong></div>
    <div class="stat"><span>Ordered</span><strong>${purchased} of ${state.items.length}</strong></div>
  </div>
  ${b.overBudget ? '<div class="callout danger" style="margin-bottom:14px">You are over the overall budget. Some of this can wait for Later.</div>'
    : b.plannedOverBudget ? `<div class="callout warn" style="margin-bottom:14px">Everything you have priced adds up to ${money(b.planned)}, which would go over budget by ${money(b.planned - b.budget)}.</div>` : ''}`}
  ${ui.shopView === 'shop' ? '' : `
  <form class="quick-add" data-form="quick-item">
    <input name="name" placeholder="Add an item, like &quot;Bar stools&quot;" autocomplete="off" aria-label="New item">
    <input name="link" placeholder="Paste a link (optional)" autocomplete="off" aria-label="Link" style="flex:1 1 200px">
    <select name="room" aria-label="Room">${opts(roomNames(), f.room || 'Living')}</select>
    <button class="btn primary">Add</button>
  </form>
  <div class="toolbar">
    <input type="search" placeholder="Search items" value="${esc(f.q)}" data-filter="shop" data-key="q" aria-label="Search items">
    <select data-filter="shop" data-key="room" aria-label="Room">${opts(roomNames(), f.room, 'All rooms')}</select>
    <select data-filter="shop" data-key="category" aria-label="Category">${opts(itemCategories(), f.category, 'All categories')}</select>
    <select data-filter="shop" data-key="status" aria-label="Status">${opts(M.ITEM_STATUSES, f.status, 'Any status')}</select>
    <select data-filter="shop" data-key="priority" aria-label="Priority">${opts(M.ITEM_PRIORITIES, f.priority, 'Any priority')}</select>
    ${filtering ? '<button class="btn ghost sm" data-act="clear-shop-filters">Clear</button>' : ''}
  </div>`}
  ${body}`;
}

function sourcePill(i) {
  if (i.source === 'mine') return '<span class="pill mine">Your pick</span>';
  if (i.source === 'suggested') return '<span class="pill suggested">Suggested</span>';
  return '';
}

function linkChips(i) {
  if (!i.links.length) return `<button class="btn ghost sm" data-act="edit-item" data-id="${i.id}">+ Link</button>`;
  return `<div class="links-cell">${i.links.map((l) => {
    const u = safeUrl(l.url);
    const label = l.label || hostOf(l.url);
    const price = l.price != null ? ` · ${money(l.price)}` : '';
    return u ? `<a class="link-chip ${l.id === i.chosenLinkId ? 'chosen' : ''}" href="${esc(u)}" target="_blank" rel="noopener" title="${esc(u)}">${esc(label)}${price}</a>` : '';
  }).join('')}</div>`;
}

function orderedToggle(i) {
  return `<label class="ordered-toggle"><input type="checkbox" class="check" data-act="toggle-ordered" data-id="${i.id}" ${M.isPurchased(i) ? 'checked' : ''} aria-label="Ordered"></label>`;
}

function shopTable(list) {
  const { key, dir } = ui.sort;
  const pRank = (p) => M.ITEM_PRIORITIES.indexOf(p);
  const sRank = (s) => M.ITEM_STATUSES.indexOf(s);
  const rRank = (r) => roomNames().indexOf(r);
  const val = {
    name: (i) => i.name.toLowerCase(), room: (i) => rRank(i.room) * 1000 + i.order, priority: (i) => pRank(i.priority),
    status: (i) => sRank(i.status), total: (i) => M.itemTotal(i), delivery: (i) => i.expectedDelivery || '9999',
    ordered: (i) => (M.isPurchased(i) ? 1 : 0),
  }[key] || ((i) => i.order);
  const rows = [...list].sort((a, b) => (val(a) < val(b) ? -dir : val(a) > val(b) ? dir : 0));
  const th = (k, label, cls = '') => `<th class="${cls}"><button data-act="sort" data-k="${k}">${label}${key === k ? (dir > 0 ? ' ▲' : ' ▼') : ''}</button></th>`;
  const rooms = roomMap();
  return `<div class="table-wrap"><table>
    <thead><tr>${th('ordered', 'Ordered')}${th('name', 'Item')}${th('room', 'Room')}${th('priority', 'Priority')}${th('status', 'Status')}<th class="num">Qty</th>${th('total', 'Total', 'num')}<th>Links</th>${th('delivery', 'Delivery')}</tr></thead>
    <tbody>${rows.map((i) => {
    const fit = M.fitCheck(i, rooms.get(i.room));
    const stair = M.stairWarning(i, rooms.get(i.room));
    const total = M.itemTotal(i);
    return `<tr>
      <td>${orderedToggle(i)}</td>
      <td><span class="item-name" data-act="edit-item" data-id="${i.id}">${esc(i.name)}</span> ${sourcePill(i)}${i.brand ? `<div class="muted small">${esc(i.brand)}</div>` : ''}
        ${stair ? `<span class="pill warn" title="${esc(stair)}">Stairs?</span>` : ''}${fit && fit.level !== 'roomy' ? `<span class="pill warn" title="${esc(fit.message)}">Fit?</span>` : ''}</td>
      <td>${esc(i.room)}</td>
      <td><select data-change="item-field" data-field="priority" data-id="${i.id}" aria-label="Priority">${opts(M.ITEM_PRIORITIES, i.priority)}</select></td>
      <td><select data-change="item-field" data-field="status" data-id="${i.id}" aria-label="Status">${opts(M.ITEM_STATUSES, i.status)}</select></td>
      <td class="num">${i.qty}</td>
      <td class="num">${total ? money(total) : '<span class="muted">...</span>'}</td>
      <td>${linkChips(i)}</td>
      <td>${i.expectedDelivery ? fmtDate(i.expectedDelivery) : ''}</td>
    </tr>`;
  }).join('')}</tbody></table></div>`;
}

function shopBoard(list) {
  return `<div class="board">${M.ITEM_STATUSES.map((st) => {
    const cards = list.filter((i) => i.status === st).sort((a, b) => a.order - b.order);
    return `<div class="col" data-status="${esc(st)}"><h3>${esc(st)}<span>${cards.length}</span></h3>
      ${cards.map((i) => `<div class="kcard" draggable="true" data-id="${i.id}" data-act="edit-item">
        <strong>${esc(i.name)}</strong>
        <div class="muted">${esc(i.room)}${M.itemTotal(i) ? ' · ' + money(M.itemTotal(i)) : ''}${i.links.length ? ` · ${i.links.length} link${i.links.length > 1 ? 's' : ''}` : ''}</div>
        ${sourcePill(i)}
      </div>`).join('') || '<div class="muted small" style="padding:8px">Drop items here</div>'}
    </div>`;
  }).join('')}</div>`;
}

function shopRooms(list) {
  const rooms = roomMap();
  const sums = M.roomSummaries(list, roomNames(), state.settings.roomBudgets);
  const withItems = sums.filter((r) => r.count);
  const emptyRooms = sums.filter((r) => !r.count).map((r) => r.room);
  return withItems.map((r) => {
    const info = rooms.get(r.room) || {};
    const items = list.filter((i) => i.room === r.room).sort((a, b) => a.order - b.order);
    const budgetVal = state.settings.roomBudgets[r.room] ?? '';
    return `<section class="card room-card">
      <div class="room-head">
        <h2>${esc(r.room)}</h2>
        <span class="muted small">${info.level ? `Floor ${info.level}` : ''}${info.w ? ` · ${info.w}x${info.l} ft` : ''}</span>
        <span class="spacer"></span>
        <span class="small">Subtotal <b>${money(r.planned)}</b> · Spent <b>${money(r.spent)}</b></span>
        <label class="room-budget">Budget <input type="number" min="0" step="50" inputmode="decimal" value="${esc(budgetVal)}" data-change="room-budget" data-room="${esc(r.room)}" placeholder="None"></label>
        ${r.budget != null ? `<span class="pill ${r.overBudget ? 'high' : r.plannedOverBudget ? 'medium' : 'ok'}">${r.overBudget ? `Over by ${money(-r.remaining)}` : `${money(r.remaining)} left`}</span>` : ''}
      </div>
      ${r.budget != null ? `<div class="meter ${r.overBudget ? 'over' : ''}" style="margin-bottom:8px"><i style="width:${r.pctSpent}%"></i></div>` : ''}
      ${r.plannedOverBudget && !r.overBudget ? `<div class="callout warn small" style="margin-bottom:8px">Priced items total ${money(r.planned)}, over this room's budget.</div>` : ''}
      <ul class="room-items">${items.map((i) => `<li>${orderedToggle(i)}
        <span class="grow"><span class="item-name" data-act="edit-item" data-id="${i.id}">${esc(i.name)}</span> ${sourcePill(i)}</span>
        <span class="pill">${esc(i.status)}</span><span class="num" style="min-width:80px;text-align:right">${M.itemTotal(i) ? money(M.itemTotal(i)) : '<span class="muted">...</span>'}</span></li>`).join('')}</ul>
    </section>`;
  }).join('') + (emptyRooms.length ? `<p class="muted small">No items yet in: ${emptyRooms.map(esc).join(', ')}.</p>` : '');
}

function shopMode() {
  const items = state.items.filter((i) => i.priority === 'Before move-in');
  const got = items.filter(M.isPurchased).length;
  const shown = ui.shopHideGot ? items.filter((i) => !M.isPurchased(i)) : items;
  const byStore = new Map();
  for (const i of shown) {
    const k = i.store.trim() || 'No store picked yet';
    if (!byStore.has(k)) byStore.set(k, []);
    byStore.get(k).push(i);
  }
  const stores = [...byStore.keys()].sort((a, b) => (a.startsWith('No store') ? 1 : b.startsWith('No store') ? -1 : a.localeCompare(b)));
  return `<div class="shop-mode">
    <div class="toolbar"><span class="pill ok">${got} of ${items.length} before move-in items handled</span>
      <label class="check-inline"><input type="checkbox" data-act="shop-hide-got" ${ui.shopHideGot ? 'checked' : ''}> Hide purchased</label></div>
    <div class="meter lg" style="margin-bottom:18px"><i style="width:${items.length ? Math.round((got / items.length) * 100) : 0}%"></i></div>
    ${stores.length ? stores.map((st) => {
    const rows = byStore.get(st).sort((a, b) => Number(M.isPurchased(a)) - Number(M.isPurchased(b)) || a.order - b.order);
    return `<section class="store"><h2>${esc(st)}<span class="muted small">${rows.filter((i) => !M.isPurchased(i)).length} to get</span></h2>
      ${rows.map((i) => `<button type="button" class="shop-row ${M.isPurchased(i) ? 'got' : ''}" data-act="shop-toggle" data-id="${i.id}">
        <span class="box"></span><span><span class="nm">${esc(i.name)}${i.qty > 1 ? ` ×${i.qty}` : ''}</span><small>${esc(i.room)}${M.itemTotal(i) ? ' · ' + money(M.itemTotal(i)) : ''}</small></span></button>`).join('')}
    </section>`;
  }).join('') : empty('🤠', 'Cart is empty, partner.', 'Every before-move-in item is handled. Go sit on something.')}
    <p class="muted small">Tip: set a store on an item to group it here. Tapping marks it Delivered (you have it); tap again to undo.</p>
  </div>`;
}

// ---------- Item editor ----------

let draft = null;

function openItemEditor(id, preset = {}) {
  const src = id ? state.items.find((x) => x.id === id) : M.createItem({ room: ui.shopFilters.room || 'Living', ...preset });
  if (!src) return;
  draft = JSON.parse(JSON.stringify(src));
  draft._isNew = !id;
  renderItemModal();
  $('#modal').showModal();
}

function fitHtml() {
  const room = roomMap().get(draft.room);
  const it = M.createItem(draft);
  const fit = M.fitCheck(it, room);
  const stair = M.stairWarning(it, room);
  if (!fit && !stair) {
    return `<div class="callout small">${room && room.w ? 'Add a width to get a rough fit check against the room.' : 'No room size on file for this room, so no fit check.'}</div>`;
  }
  return `${fit ? `<div class="callout ${fit.level === 'roomy' ? 'ok' : 'warn'} small"><b>Rough fit guide:</b> ${esc(fit.message)}</div>` : ''}
    ${stair ? `<div class="callout warn small" style="margin-top:6px"><b>Stairs:</b> ${esc(stair)}</div>` : ''}
    <div class="muted small" style="margin-top:4px">A ballpark only. Measure doorways, stair turns, and walkways before you buy.</div>`;
}

function renderItemModal() {
  const d = draft;
  const purchased = M.PURCHASED_STATUSES.includes(d.status);
  $('#modal').innerHTML = `<form class="modal-inner" data-form="item">
    <div class="modal-head"><h2>${d._isNew ? 'New item' : 'Edit item'}</h2>
      <button type="button" class="icon-btn" data-act="close-modal" title="Close">${ICON.x}</button></div>
    <div class="form-grid">
      <label class="field full">Name<input data-f="name" value="${esc(d.name)}" required></label>
      <label class="field full">Brand or model<input data-f="brand" value="${esc(d.brand)}" placeholder="Adding a brand or a link moves a suggestion to To purchase"></label>
      <label class="field">Room<select data-f="room">${opts(roomNames(), d.room)}</select></label>
      <label class="field">Category<select data-f="category">${opts(itemCategories(), d.category)}</select></label>
      <label class="field">Priority<select data-f="priority">${opts(M.ITEM_PRIORITIES, d.priority)}</select></label>
      <label class="field">Status<select data-f="status" id="f-status">${opts(M.ITEM_STATUSES, d.status)}</select></label>
    </div>

    <div class="section-label">Links and options</div>
    <p class="muted small" style="margin:0 0 8px">Save every option you are weighing. Pick one with the dot; its price fills in automatically if you leave Unit price blank.</p>
    <div id="links">${d.links.map((l) => `
      <div class="link-row" data-lid="${l.id}">
        <input type="radio" name="chosen" data-act="choose-link" data-lid="${l.id}" ${l.id === d.chosenLinkId ? 'checked' : ''} title="Pick this one">
        <input data-lf="label" data-lid="${l.id}" value="${esc(l.label)}" placeholder="Label (e.g. CB2 walnut)">
        <input class="lr-url" data-lf="url" data-lid="${l.id}" value="${esc(l.url)}" placeholder="https://">
        <input class="lr-price" type="number" min="0" step="0.01" inputmode="decimal" data-lf="price" data-lid="${l.id}" value="${l.price ?? ''}" placeholder="Price">
        ${safeUrl(l.url) ? `<a class="icon-btn" href="${esc(safeUrl(l.url))}" target="_blank" rel="noopener" title="Open">${ICON.open}</a>` : '<span></span>'}
        <button type="button" class="icon-btn" data-act="remove-link" data-lid="${l.id}" title="Remove link">${ICON.x}</button>
      </div>`).join('') || '<div class="muted small" style="margin-bottom:6px">No links yet.</div>'}</div>
    <button type="button" class="btn sm" data-act="add-link">+ Add link</button>

    <div class="section-label">Order</div>
    <label class="check-inline" style="color:var(--ink);margin-bottom:10px">
      <input type="checkbox" class="check" data-act="draft-ordered" ${purchased ? 'checked' : ''}> I have ordered this
    </label>
    <div class="form-grid three">
      <label class="field">Quantity<input type="number" min="1" step="1" data-f="qty" value="${d.qty}"></label>
      <label class="field">Unit price<input type="number" min="0" step="0.01" inputmode="decimal" data-f="unitPrice" value="${d.unitPrice ?? ''}" placeholder="From chosen link"></label>
      <label class="field">Store<input data-f="store" value="${esc(d.store)}" placeholder="Target, CB2, Amazon"></label>
      <label class="field">Order number<input data-f="orderNumber" value="${esc(d.orderNumber)}" autocomplete="off"></label>
      <label class="field">Expected delivery<input type="date" data-f="expectedDelivery" value="${esc(d.expectedDelivery)}"></label>
      <label class="field">Stair path OK?<select data-f="stairOk">${opts(M.STAIR_OPTIONS, d.stairOk)}</select></label>
    </div>

    <div class="section-label">Size (inches)</div>
    <div class="dims">
      <label class="field">Width<input type="number" min="0" step="0.5" data-f="dims.w" value="${d.dims.w ?? ''}"></label>
      <label class="field">Depth<input type="number" min="0" step="0.5" data-f="dims.d" value="${d.dims.d ?? ''}"></label>
      <label class="field">Height<input type="number" min="0" step="0.5" data-f="dims.h" value="${d.dims.h ?? ''}"></label>
    </div>
    <div id="fit" style="margin-top:10px">${fitHtml()}</div>

    <label class="field full" style="margin-top:14px">Notes<textarea data-f="notes">${esc(d.notes)}</textarea></label>
    ${d._isNew || !linkedPapers('itemId', d.id) ? '' : `<div class="section-label">Files and appointments</div>${linkedPapers('itemId', d.id)}`}
    <div class="modal-actions">
      ${d._isNew ? '' : `<button type="button" class="btn ghost" data-act="delete-item" data-id="${d.id}" style="color:var(--danger)">Delete</button>`}
      <div class="right"><button type="button" class="btn ghost" data-act="close-modal">Cancel</button><button class="btn primary">Save</button></div>
    </div>
  </form>`;
}

function setDraftField(path, value) {
  if (path.startsWith('dims.')) draft.dims[path.slice(5)] = value === '' ? null : Number(value);
  else if (path === 'qty') draft.qty = value;
  else if (path === 'unitPrice') draft.unitPrice = value === '' ? null : Number(value);
  else draft[path] = value;
}

// ---------- Home Info ----------

function viewHome() {
  const h = state.homeInfo;
  const field = (key, label, type = 'text', ph = '') =>
    `<label class="field">${label}<input type="${type}" data-home="${key}" value="${esc(h[key] || '')}" placeholder="${esc(ph)}" autocomplete="off"></label>`;
  const secret = (key, label) => `<label class="field">${label}<span class="secret">
    <input type="password" data-home="${key}" id="sec-${key}" value="${esc(h[key] || '')}" autocomplete="off">
    <button type="button" class="btn" data-act="reveal" data-target="sec-${key}">${ICON.eye.replace('<svg', '<svg width="18" height="18" fill="currentColor"')}<span>Show</span></button></span></label>`;
  const utilities = h.utilities || [];
  const contacts = h.contacts || [];
  return `
  <div class="page-head"><div><h1>Home Info</h1><p>The stuff you will Google at 11pm otherwise. Every field is optional.</p></div></div>
  <div class="card lock-note" style="margin-bottom:16px">${ICON.lock}<div class="small">${!SYNC_ON
    ? '<b>Stored only in this browser.</b> Nothing here is sent anywhere, and it won\'t reach your phone on its own (use Export in Settings).'
    : state.settings.syncWifiPasswords
      ? '<b>Syncs to your other devices, Wi-Fi passwords included.</b> Turn that off in Settings to keep passwords on each device.'
      : '<b>Syncs to your other devices, except the Wi-Fi passwords.</b> Those stay in this browser unless you turn on syncing them in Settings.'} Wi-Fi passwords are fine here; bank or email passwords are not.</div></div>
  <div class="grid dash-grid">
    <section class="card span-6"><h2>The house</h2>
      <div class="form-grid">
        <label class="field full">Address<input data-home="address" value="${esc(h.address || '')}"></label>
        ${field('trashDay', 'Trash day', 'text', 'e.g. Tuesday, recycling every other week')}
        ${field('internetProvider', 'Internet provider')}
        <label class="field full">Internet account contact<input data-home="internetContact" value="${esc(h.internetContact || '')}" placeholder="Name, phone, or support line"></label>
        <label class="field full">Notes<textarea data-home="notes">${esc(h.notes || '')}</textarea></label>
      </div>
    </section>
    <section class="card span-6"><h2>Wi-Fi</h2>
      <div class="form-grid">
        ${field('wifiName', 'Network name')}
        ${secret('wifiPassword', 'Password')}
        ${field('guestWifiName', 'Guest network name')}
        ${secret('guestWifiPassword', 'Guest password')}
      </div>
      <div class="section-label">Guest QR code</div>
      <div class="qr-box"><div class="qr" id="qr"></div>
        <div class="small muted" id="qr-note" style="flex:1;min-width:160px"></div></div>
    </section>
    <section class="card span-12"><div class="card-head"><h2>Utility providers</h2><button class="btn sm" data-act="add-row" data-list="utilities">+ Add</button></div>
      <div class="table-wrap" style="border:0"><table class="rows-table"><thead><tr><th>Service</th><th>Provider</th><th>Phone</th><th></th></tr></thead><tbody>
      ${utilities.map((u, i) => `<tr>
        <td><input data-row="utilities" data-i="${i}" data-k="name" value="${esc(u.name)}"></td>
        <td><input data-row="utilities" data-i="${i}" data-k="provider" value="${esc(u.provider)}"></td>
        <td><input type="tel" data-row="utilities" data-i="${i}" data-k="phone" value="${esc(u.phone)}"></td>
        <td><button class="icon-btn" data-act="remove-row" data-list="utilities" data-i="${i}" title="Remove">${ICON.x}</button></td></tr>`).join('')}
      </tbody></table></div>
    </section>
    <section class="card span-12"><div class="card-head"><h2>Key contacts</h2><button class="btn sm" data-act="add-row" data-list="contacts">+ Add</button></div>
      <div class="table-wrap" style="border:0"><table class="rows-table"><thead><tr><th>Role</th><th>Name</th><th>Phone</th><th>Email</th><th></th></tr></thead><tbody>
      ${contacts.map((c, i) => `<tr>
        <td><input data-row="contacts" data-i="${i}" data-k="role" value="${esc(c.role)}"></td>
        <td><input data-row="contacts" data-i="${i}" data-k="name" value="${esc(c.name)}"></td>
        <td><input type="tel" data-row="contacts" data-i="${i}" data-k="phone" value="${esc(c.phone)}"></td>
        <td><input type="email" data-row="contacts" data-i="${i}" data-k="email" value="${esc(c.email)}"></td>
        <td><button class="icon-btn" data-act="remove-row" data-list="contacts" data-i="${i}" title="Remove">${ICON.x}</button></td></tr>`).join('')}
      </tbody></table></div>
    </section>
  </div>`;
}

function drawQr() {
  const box = $('#qr');
  const note = $('#qr-note');
  if (!box) return;
  const h = state.homeInfo;
  const useGuest = !!h.guestWifiName;
  const payload = M.wifiQrPayload(useGuest ? h.guestWifiName : h.wifiName, useGuest ? h.guestWifiPassword : h.wifiPassword);
  if (!payload) {
    box.innerHTML = '<span class="muted small" style="text-align:center">📶</span>';
    note.textContent = 'Add a network name and a QR code appears here. Guests point their camera at it and they are on.';
    return;
  }
  if (typeof window.qrcode !== 'function') {
    box.innerHTML = '';
    note.textContent = 'The QR library did not load (offline?). Refresh when you are back online.';
    return;
  }
  const qr = window.qrcode(0, 'M');
  qr.addData(payload);
  qr.make();
  box.innerHTML = qr.createSvgTag({ cellSize: 4, margin: 0, scalable: true });
  note.innerHTML = `Scanning joins <b>${esc(useGuest ? h.guestWifiName : h.wifiName)}</b>${useGuest ? ' (guest network)' : ''}. Screenshot it or print it for the fridge.`;
}

// ---------- Settings ----------

function viewSettings() {
  const s = state.settings;
  return `
  <div class="page-head"><div><h1>Settings</h1><p>Dates, budget, look, and your data.</p></div></div>
  <div class="grid dash-grid">
    <section class="card span-6"><h2>Dates and budget</h2>
      <div class="form-grid">
        <label class="field">Closing date<input type="date" data-change="setting" data-key="closingDate" value="${esc(s.closingDate)}"></label>
        <label class="field">Move-in date<input type="date" data-change="setting" data-key="moveInDate" value="${esc(s.moveInDate)}"></label>
        <label class="field full">Overall shopping budget<input type="number" min="0" step="100" inputmode="decimal" data-change="setting" data-key="budget" value="${s.budget ?? ''}" placeholder="e.g. 25000"></label>
      </div>
      <div class="section-label">Room budgets</div>
      <div class="form-grid">${roomNames().map((r) => `<label class="field">${esc(r)}<input type="number" min="0" step="50" inputmode="decimal" data-change="room-budget" data-room="${esc(r)}" value="${esc(s.roomBudgets[r] ?? '')}" placeholder="None"></label>`).join('')}</div>
    </section>
    <section class="card span-6"><h2>Look</h2>
      <label class="field">Theme<select data-change="setting" data-key="theme">${[['auto', 'Match my device'], ['light', 'Light'], ['dark', 'Dark']].map(([v, l]) => `<option value="${v}"${s.theme === v ? ' selected' : ''}>${l}</option>`).join('')}</select></label>
      <div class="section-label">Sync</div>
      ${SYNC_ON ? `<p class="small muted" style="margin-top:0">Changes save to the cloud and show up on your phone and laptop within a few seconds. The newest edit wins, so a device that has been asleep catches up instead of overwriting.</p>
      <label class="check-inline"><input type="checkbox" data-change="sync-wifi" ${s.syncWifiPasswords ? 'checked' : ''}> Also sync Wi-Fi passwords</label>
      <p class="small muted">Off by default: the synced copy has no login, so passwords stay on each device unless you turn this on.</p>
      <div class="toolbar"><button class="btn" data-act="sync-force">Send this device's copy to all devices</button></div>
      <p class="small muted">Only needed if two devices disagree and both say Synced.</p>`
      : '<p class="small muted" style="margin-top:0">Not set up yet, so everything stays in this browser. The README has the five minute setup.</p>'}
      <div class="section-label">Your data</div>
      <p class="small muted" style="margin-top:0">A copy also lives in this browser. Export a backup now and then.</p>
      <div class="toolbar">
        <button class="btn" data-act="export">Export JSON</button>
        <label class="btn">Import JSON<input type="file" accept="application/json,.json" data-change="import" class="sr-only"></label>
      </div>
      <div class="section-label">Start over</div>
      <p class="small muted" style="margin-top:0">Reset brings back the starter tasks and items from <code>js/seed-data.js</code> and erases your changes.</p>
      <button class="btn danger" data-act="reset">Reset to seed data</button>
    </section>
  </div>`;
}

// ---------- Events ----------

document.addEventListener('click', async (e) => {
  const el = e.target.closest('[data-act]');
  if (!el) {
    if (e.target.id === 'modal') $('#modal').close(); // backdrop click
    return;
  }
  const act = el.dataset.act;
  const id = el.dataset.id;

  switch (act) {
    case 'toggle-task':
      commit((s) => { const t = s.tasks.find((x) => x.id === id); t.status = t.status === 'Done' ? 'To do' : 'Done'; });
      if (state.tasks.find((x) => x.id === id).status === 'Done') toast(pick(['Nice. One less thing.', 'Checked off. Yeehaw.', 'Done and dusted.']));
      break;
    case 'expand':
      openTasks.has(id) ? openTasks.delete(id) : openTasks.add(id);
      el.closest('.task').classList.toggle('open');
      break;
    case 'edit-task': openTaskEditor(id); break;
    case 'delete-task': {
      const t = state.tasks.find((x) => x.id === id);
      $('#modal').close();
      if (!(await confirmAction('Delete this task?', `"${t.title}" will be removed.`, 'Delete'))) return;
      lastDeleted = { kind: 'tasks', obj: t };
      commit((s) => { s.tasks = s.tasks.filter((x) => x.id !== id); });
      toast('Task deleted.', true);
      break;
    }
    case 'task-view': ui.taskView = el.dataset.v; saveUi(); renderView(); break;
    case 'clear-task-filters': ui.taskFilters = { q: '', cat: '', status: '', priority: '', hideDone: false }; saveUi(); renderView(); break;
    case 'shop-view': ui.shopView = el.dataset.v; saveUi(); renderView(); break;
    case 'doc-kind': ui.docKind = el.dataset.v; saveUi(); renderView(); break;
    case 'appt-done': commit((s) => { s.appointments.find((a) => a.id === id).status = 'Done'; }); break;
    case 'delete-appt': {
      const a = state.appointments.find((x) => x.id === id);
      if (await confirmAction('Delete this appointment?', `"${a.title}" on ${fmtDate(a.date)} will be removed.`, 'Delete')) {
        commit((s) => { s.appointments = s.appointments.filter((x) => x.id !== id); });
      }
      break;
    }
    case 'delete-doc': {
      const d = state.documents.find((x) => x.id === id);
      if (await confirmAction('Remove this document?', `"${d.title}" leaves the list. Any saved file stays in your OneDrive folder.`, 'Remove')) {
        commit((s) => { s.documents = s.documents.filter((x) => x.id !== id); });
      }
      break;
    }
    case 'clear-shop-filters': ui.shopFilters = { q: '', room: '', category: '', status: '', priority: '' }; saveUi(); renderView(); break;
    case 'sort':
      ui.sort = { key: el.dataset.k, dir: ui.sort.key === el.dataset.k ? -ui.sort.dir : 1 };
      saveUi(); renderView(); break;
    case 'toggle-ordered':
      commit((s) => togglePurchased(s.items.find((x) => x.id === id)));
      if (M.isPurchased(state.items.find((x) => x.id === id))) toast('Marked as ordered.');
      break;
    case 'shop-toggle':
      commit((s) => togglePurchased(s.items.find((x) => x.id === id), 'Delivered'));
      break;
    case 'shop-hide-got': ui.shopHideGot = el.checked; saveUi(); renderView(); break;
    case 'edit-item': if (!e.target.closest('a')) openItemEditor(id); break;
    case 'delete-item': {
      const it = state.items.find((x) => x.id === id);
      $('#modal').close();
      if (!(await confirmAction('Delete this item?', `"${it.name}" and its saved links will be removed.`, 'Delete'))) return;
      lastDeleted = { kind: 'items', obj: it };
      commit((s) => { s.items = s.items.filter((x) => x.id !== id); });
      toast('Item deleted.', true);
      break;
    }
    case 'add-link':
      draft.links.push(M.createLink({}));
      if (draft.links.length === 1) draft.chosenLinkId = draft.links[0].id;
      renderItemModal();
      $(`[data-lid="${draft.links.at(-1).id}"][data-lf="url"]`)?.focus();
      break;
    case 'remove-link':
      draft.links = draft.links.filter((l) => l.id !== el.dataset.lid);
      if (draft.chosenLinkId === el.dataset.lid) draft.chosenLinkId = draft.links[0]?.id || null;
      renderItemModal();
      break;
    case 'choose-link': draft.chosenLinkId = el.dataset.lid; $('#fit').innerHTML = fitHtml(); break;
    case 'draft-ordered':
      togglePurchased(draft);
      $('#f-status').value = draft.status;
      break;
    case 'close-modal': $('#modal').close(); break;
    case 'undo':
      if (lastDeleted) {
        const { kind, obj } = lastDeleted;
        commit((s) => { s[kind].push(obj); });
        lastDeleted = null;
        toast('Restored.');
      }
      break;
    case 'reveal': {
      const input = document.getElementById(el.dataset.target);
      const show = input.type === 'password';
      input.type = show ? 'text' : 'password';
      el.querySelector('span').textContent = show ? 'Hide' : 'Show';
      break;
    }
    case 'add-row': {
      const list = el.dataset.list;
      commit((s) => { (s.homeInfo[list] ||= []).push(list === 'utilities' ? { name: '', provider: '', phone: '' } : { role: '', name: '', phone: '', email: '' }); });
      break;
    }
    case 'remove-row': {
      const { list, i } = el.dataset;
      commit((s) => { s.homeInfo[list].splice(Number(i), 1); });
      break;
    }
    case 'export': {
      const blob = new Blob([exportJSON(state)], { type: 'application/json' });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = `new-house-backup-${M.todayISO()}.json`;
      a.click();
      URL.revokeObjectURL(a.href);
      toast('Backup downloaded.');
      break;
    }
    case 'sync-force':
      if (!(await confirmAction('Send this copy everywhere?', 'Your other devices will switch to exactly what is on this one.', 'Send it'))) return;
      commit(() => {}, { render: false });
      toast('Sent. Other devices will update in a moment.');
      break;
    case 'reset':
      if (!(await confirmAction('Reset to seed data?', `This erases every change you have made and brings back the starter list${SYNC_ON ? ' on every synced device' : ''}. Export a backup first if you might want it.`, 'Reset'))) return;
      replaceState(resetToSeed());
      toast('Fresh start loaded.');
      break;
    default:
  }
});

const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];

document.addEventListener('change', async (e) => {
  const el = e.target;
  const kind = el.dataset.change;
  if (kind === 'setting') {
    const key = el.dataset.key;
    commit((s) => { s.settings[key] = key === 'budget' ? (el.value === '' ? null : Math.max(0, Number(el.value))) : el.value; });
    if (key === 'theme') applyTheme();
  } else if (kind === 'sync-wifi') {
    commit((s) => { s.settings.syncWifiPasswords = el.checked; });
    toast(el.checked ? 'Wi-Fi passwords will sync.' : 'Wi-Fi passwords now stay on each device.');
  } else if (kind === 'room-budget') {
    commit((s) => {
      if (el.value === '') delete s.settings.roomBudgets[el.dataset.room];
      else s.settings.roomBudgets[el.dataset.room] = Math.max(0, Number(el.value));
    });
  } else if (kind === 'task-status') {
    commit((s) => { s.tasks.find((x) => x.id === el.dataset.id).status = el.value; });
  } else if (kind === 'item-field') {
    commit((s) => {
      const it = s.items.find((x) => x.id === el.dataset.id);
      it[el.dataset.field] = el.value;
    });
  } else if (kind === 'import') {
    const file = el.files[0];
    if (!file) return;
    try {
      const next = importJSON(await file.text());
      if (!(await confirmAction('Replace everything with this backup?', `${next.tasks.length} tasks and ${next.items.length} items will replace what is here now${SYNC_ON ? ' and on your other devices' : ''}.`, 'Import'))) return;
      replaceState(M.stampUpdated(next));
      toast('Backup imported.');
    } catch (err) {
      toast(`Import failed: ${err.message}`);
    } finally {
      el.value = '';
    }
  } else if (el.dataset.filter) {
    handleFilter(el);
  } else if (el.dataset.f && draft) {
    setDraftField(el.dataset.f, el.value);
    if (el.dataset.f === 'room') $('#fit').innerHTML = fitHtml();
  }
});

function handleFilter(el) {
  const target = el.dataset.filter === 'task' ? ui.taskFilters : el.dataset.filter === 'doc' ? (ui.docFilters ||= { q: '' }) : ui.shopFilters;
  target[el.dataset.key] = el.type === 'checkbox' ? el.checked : el.value;
  saveUi();
  const pos = el.type === 'search' ? el.selectionStart : null;
  renderView();
  if (pos != null) {
    const again = $(`[data-filter="${el.dataset.filter}"][data-key="q"]`);
    again.focus();
    again.setSelectionRange(pos, pos);
  }
}

document.addEventListener('input', (e) => {
  const el = e.target;
  if (el.dataset.filter && el.type === 'search') { handleFilter(el); return; }
  if (el.dataset.home) {
    commit((s) => { s.homeInfo[el.dataset.home] = el.value; }, { render: false });
    if (/wifi/i.test(el.dataset.home)) drawQr();
    return;
  }
  if (el.dataset.row) {
    commit((s) => { s.homeInfo[el.dataset.row][Number(el.dataset.i)][el.dataset.k] = el.value; }, { render: false });
    return;
  }
  if (!draft || !el.closest('#modal')) return;
  if (el.dataset.f) {
    setDraftField(el.dataset.f, el.value);
    if (el.dataset.f.startsWith('dims') || el.dataset.f === 'stairOk') $('#fit').innerHTML = fitHtml();
  } else if (el.dataset.lf) {
    const l = draft.links.find((x) => x.id === el.dataset.lid);
    l[el.dataset.lf] = el.dataset.lf === 'price' ? (el.value === '' ? null : Number(el.value)) : el.value;
  }
});

document.addEventListener('submit', (e) => {
  const form = e.target;
  const kind = form.dataset.form;
  if (!kind) return;
  e.preventDefault();
  const data = Object.fromEntries(new FormData(form));
  if (kind === 'quick-task') {
    if (!data.title.trim()) return;
    commit((s) => {
      const order = Math.max(-1, ...s.tasks.map((t) => t.order)) + 1;
      s.tasks.push(M.createTask({ title: data.title, category: data.category, order }));
    });
    toast('Task added.');
    $('[data-form="quick-task"] input[name="title"]')?.focus();
  } else if (kind === 'quick-item') {
    if (!data.name.trim()) return;
    commit((s) => {
      const order = Math.max(-1, ...s.items.map((t) => t.order)) + 1;
      const links = safeUrl(data.link) ? [M.createLink({ url: safeUrl(data.link) })] : [];
      const it = M.createItem({ name: data.name, room: data.room, source: 'mine', order, links, chosenLinkId: links[0]?.id });
      M.promoteIfPicked(it);
      s.items.push(it);
    });
    toast('Item added. Tap its name to add details.');
    $('[data-form="quick-item"] input[name="name"]')?.focus();
  } else if (kind === 'task') {
    const id = form.dataset.id;
    commit((s) => {
      if (id) {
        const i = s.tasks.findIndex((t) => t.id === id);
        s.tasks[i] = M.createTask({ ...s.tasks[i], ...data });
      } else {
        s.tasks.push(M.createTask({ ...data, order: Math.max(-1, ...s.tasks.map((t) => t.order)) + 1 }));
      }
    });
    $('#modal').close();
    toast('Saved.');
  } else if (kind === 'item') {
    const { _isNew, ...rest } = draft;
    const clean = M.createItem({ ...rest, links: rest.links.filter((l) => l.url.trim() || l.label.trim()) });
    if (!clean.links.some((l) => l.id === clean.chosenLinkId)) clean.chosenLinkId = clean.links[0]?.id || null;
    // A new brand or link on a suggestion moves it to To purchase.
    const pickKey = (it) => [it.brand.trim(), ...it.links.map((l) => l.url.trim()).filter(Boolean).sort()].join('|');
    const before = state.items.find((x) => x.id === clean.id);
    if (!before || pickKey(before) !== pickKey(clean)) M.promoteIfPicked(clean);
    commit((s) => {
      const i = s.items.findIndex((x) => x.id === clean.id);
      if (i >= 0) s.items[i] = clean;
      else s.items.push({ ...clean, order: Math.max(-1, ...s.items.map((t) => t.order)) + 1 });
    });
    $('#modal').close();
    toast('Saved.');
  }
});

$('#modal').addEventListener('close', () => { draft = null; });

// ---------- Drag and drop ----------

let dragId = null;
document.addEventListener('dragstart', (e) => {
  const handle = e.target.closest?.('.handle');
  const card = e.target.closest?.('.kcard');
  if (handle) {
    const li = handle.closest('.task');
    dragId = li.dataset.id;
    li.classList.add('dragging');
    e.dataTransfer.setDragImage(li, 20, 20);
  } else if (card) {
    dragId = card.dataset.id;
    card.classList.add('dragging');
  } else return;
  e.dataTransfer.effectAllowed = 'move';
  e.dataTransfer.setData('text/plain', dragId);
});
document.addEventListener('dragover', (e) => {
  if (!dragId) return;
  const li = e.target.closest('.task');
  const col = e.target.closest('.col');
  if (li || col) e.preventDefault();
  document.querySelectorAll('.drop-target, .col.drop').forEach((x) => x.classList.remove('drop-target', 'drop'));
  if (li && li.dataset.id !== dragId) li.classList.add('drop-target');
  if (col) col.classList.add('drop');
});
document.addEventListener('drop', (e) => {
  if (!dragId) return;
  e.preventDefault();
  const li = e.target.closest('.task');
  const col = e.target.closest('.col');
  if (li && li.dataset.id !== dragId) {
    const target = state.tasks.find((t) => t.id === li.dataset.id);
    const moving = state.tasks.find((t) => t.id === dragId);
    commit((s) => {
      if (moving.category !== target.category) s.tasks.find((t) => t.id === dragId).category = target.category;
      s.tasks = M.reorder(s.tasks, dragId, li.dataset.id);
    });
  } else if (col) {
    commit((s) => {
      const it = s.items.find((x) => x.id === dragId);
      if (it.status !== col.dataset.status) { it.prevStatus = it.status; it.status = col.dataset.status; }
    });
  }
  dragId = null;
});
document.addEventListener('dragend', () => {
  dragId = null;
  document.querySelectorAll('.dragging, .drop-target, .col.drop').forEach((x) => x.classList.remove('dragging', 'drop-target', 'drop'));
});

// ---------- Boot ----------

window.addEventListener('hashchange', () => { renderView(); window.scrollTo(0, 0); });
window.addEventListener('load', () => { if (route() === 'home') drawQr(); });
const sync = startSync({
  config: FIREBASE_CONFIG,
  collection: COLLECTION,
  docId: DOC_ID,
  hooks: {
    getState: () => state,
    applyRemote: (next) => replaceState(next, { push: false }),
    // Seed updates wait until this device has caught up with the cloud, so they land on the
    // newest data. The timeout lets the snapshot that confirmed the sync finish reconciling first.
    setBadge: (label, mode) => {
      setSyncBadge(label, mode);
      if (mode === 'on' || mode === 'off') setTimeout(ensureUpdates, 0);
    },
  },
});

function ensureUpdates() {
  const { state: next, changed } = M.applySeedUpdates(state, seed.updates);
  if (!changed) return;
  replaceState(M.stampUpdated(next));
  toast('New info added from your house docs.');
}
applyTheme();
renderView();
