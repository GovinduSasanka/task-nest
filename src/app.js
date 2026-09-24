/* Task Nest — renderer */

// Browser fallback so the UI can be previewed outside Electron (never used inside the app).
const IN_APP = navigator.userAgent.includes('Electron');
const api = window.nest || (IN_APP ? null : {
  load: async () => { try { const d = JSON.parse(localStorage.getItem('tasknest')); return d ? { status: 'ok', data: d } : { status: 'empty' }; } catch { return { status: 'empty' }; } },
  save: (d) => localStorage.setItem('tasknest', JSON.stringify(d)),
  expandSide: async () => 'right',
  setExpanded: async () => 'right',
  setMini: async (on) => on,
  hide: () => {},
  togglePin: async () => false,
  getPin: async () => false,
  onPinChanged: () => {},
  getAutoStart: async () => false,
  setAutoStart: async (v) => v,
  quit: () => {},
  openData: () => {},
});

const $ = (s) => document.querySelector(s);
const uid = () => Math.random().toString(36).slice(2, 10);
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const todayISO = () => { const d = new Date(); d.setMinutes(d.getMinutes() - d.getTimezoneOffset()); return d.toISOString().slice(0, 10); };

const EMOJIS = ['💼', '🏠', '📚', '🏡', '💪', '🎨', '🛒', '✈️', '💡', '🎯', '🌱', '💰', '🧘', '🎮', '🍳', '❤️', '🐾', '📝'];
const TAG_COLORS = [
  ['#E7F0FC', '#3E7BD6'], ['#EFE9FB', '#7A5BC7'], ['#E6F2E8', '#4F9463'],
  ['#FCE8EE', '#C94F72'], ['#FBF0DC', '#B87718'], ['#E4F4F4', '#2E8F8F'],
];
const PRIORITY = {
  high: { label: 'High', color: '#D4577A' },
  medium: { label: 'Medium', color: '#C27C1E' },
  low: { label: 'Low', color: '#3E7BD6' },
  none: { label: 'None', color: '#C9C6BE' },
};

// ---------- state ----------
let S = null;
let openId = null;
let saveTimer = null;

function seed() {
  const c = [
    { id: uid(), name: 'Work', icon: '💼' },
    { id: uid(), name: 'Personal', icon: '🏠' },
    { id: uid(), name: 'Study', icon: '📚' },
    { id: uid(), name: 'Home', icon: '🏡' },
  ];
  const t = (catId, title, time, done = false, extra = {}) => ({
    id: uid(), catId, title, time, done, date: todayISO(), desc: '', priority: 'none',
    tags: [], subtasks: [], notes: '', createdAt: Date.now(), ...extra,
  });
  return {
    version: 1,
    activeCat: c[0].id,
    categories: c,
    tasks: [
      t(c[0].id, 'Reply to client emails', '09:00', true),
      t(c[0].id, 'Finish project proposal', '11:00', false, {
        desc: 'Finalize the proposal. Include timeline, scope and pricing details.',
        priority: 'high', tags: ['Work', 'Proposal'],
        subtasks: [
          { id: uid(), text: 'Outline key points', done: true },
          { id: uid(), text: 'Add timeline and milestones', done: true },
          { id: uid(), text: 'Include pricing details', done: false },
          { id: uid(), text: 'Proofread and polish', done: false },
        ],
        notes: 'Keep it concise and focus on business value. ✨',
      }),
      t(c[0].id, 'Team sync meeting', '13:00', true),
      t(c[0].id, 'Update roadmap', '15:00'),
      t(c[1].id, 'Call mom', '18:00', false, { priority: 'medium' }),
      t(c[2].id, 'Read one chapter', '', false),
      t(c[3].id, 'Water the plants 🌿', '08:00', false),
    ],
  };
}

let canSave = false;
function persist() {
  if (!canSave || !S) return;
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => api.save(S), 250);
}
window.addEventListener('beforeunload', () => { clearTimeout(saveTimer); if (S && canSave) (api.saveSync || api.save)(S); });

const cat = (id) => S.categories.find((c) => c.id === id);
const task = (id) => S.tasks.find((t) => t.id === id);
const catTasks = () => S.tasks.filter((t) => t.catId === S.activeCat);

// ---------- formatting ----------
function fmtTime(hhmm) {
  if (!hhmm) return '';
  const [h, m] = hhmm.split(':').map(Number);
  return `${((h + 11) % 12) + 1}:${String(m).padStart(2, '0')} ${h < 12 ? 'AM' : 'PM'}`;
}
function fmtDate(iso) {
  if (!iso) return '';
  const d = new Date(iso + 'T00:00:00');
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const diff = Math.round((d - today) / 86400000);
  const md = d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
  if (diff === 0) return `Today, ${md}`;
  if (diff === 1) return `Tomorrow, ${md}`;
  if (diff === -1) return `Yesterday, ${md}`;
  return d.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' });
}
function tagColor(name) {
  let h = 0; for (const ch of name.toLowerCase()) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return TAG_COLORS[h % TAG_COLORS.length];
}

// Pull a time like "5pm", "at 9:30am" or "17:00" off the end of a quick-add title.
function parseQuickAdd(text) {
  let title = text.trim(), time = '', priority = 'none';
  const pr = title.match(/\s!(high|med|medium|low)\b/i);
  if (pr) { priority = { high: 'high', med: 'medium', medium: 'medium', low: 'low' }[pr[1].toLowerCase()]; title = title.replace(pr[0], ''); }
  const m = title.match(/\s+(?:at\s+)?(\d{1,2})(?::(\d{2}))?\s*(am|pm)\s*$/i) || title.match(/\s+(?:at\s+)?([01]?\d|2[0-3]):([0-5]\d)\s*$/);
  if (m) {
    let h = +m[1]; const min = m[2] ? +m[2] : 0; const ap = m[3]?.toLowerCase();
    if (ap === 'pm' && h < 12) h += 12;
    if (ap === 'am' && h === 12) h = 0;
    if (h < 24 && min < 60) { time = `${String(h).padStart(2, '0')}:${String(min).padStart(2, '0')}`; title = title.slice(0, m.index); }
  }
  return { title: title.trim() || text.trim(), time, priority };
}

// ---------- header / greeting ----------
function renderGreeting() {
  const h = new Date().getHours();
  const [g, icon] = h < 12 ? ['Good morning', '☀️'] : h < 17 ? ['Good afternoon', '🌤️'] : h < 21 ? ['Good evening', '🌙'] : ['Good night', '🌙'];
  $('#greeting').textContent = g;
  const ic = $('#todayIcon');
  ic.textContent = icon;
  ic.classList.toggle('moon', icon !== '☀️');
}

function renderStats(celebrate = false) {
  const list = catTasks();
  const done = list.filter((t) => t.done).length;
  const pct = list.length ? Math.round((done / list.length) * 100) : 0;
  $('#todaySub').textContent = list.length ? `${done} of ${list.length} tasks completed` : 'No tasks yet';
  $('#progressFill').style.width = pct + '%';
  $('#progressPct').textContent = pct + '%';

  const allDone = list.length > 0 && done === list.length;
  const pt = $('#plantText');
  pt.innerHTML = allDone ? 'All done!<br/>You bloomed today 🌸' : SCENES[sceneIndex()].text;
  if (celebrate && allDone) {
    const pc = $('#plantCard');
    pc.classList.remove('grow'); void pc.offsetWidth; pc.classList.add('grow');
    floatHearts();
  }
  // tab counters
  document.querySelectorAll('.tab[data-id]').forEach((el) => {
    const n = S.tasks.filter((t) => t.catId === el.dataset.id && !t.done).length;
    const c = el.querySelector('.count'); if (c) c.textContent = n || '';
  });
  const open = S.tasks.filter((t) => !t.done).length;
  $('#miniCount').textContent = open ? `· ${open} left` : '· all done 🌸';
}

// ---------- daily footer (a different little scene every day) ----------
const SCENES = [
  { name: 'sprout', bg: 'linear-gradient(135deg,#FAF6EE,#F4EEE2)', ink: '#7C7566', accent: '#D4577A', mark: '♡',
    text: 'Small steps,<br/>big progress.',
    svg: `<ellipse cx="30" cy="54" rx="14" ry="3" fill="#E9E4D8"/>
      <g class="sway" style="transform-origin:30px 54px"><path d="M30 54V30" stroke="#6FAE7E" stroke-width="3" stroke-linecap="round"/>
      <path d="M30 36c-2-9-9-13-18-12 1 9 8 13 18 12Z" fill="#8CC79A"/><path d="M30 31c1-9 8-14 17-14 0 9-7 14-17 14Z" fill="#6FAE7E"/></g>` },
  { name: 'sunny', bg: 'linear-gradient(135deg,#EEF5FC,#F3F0FA)', ink: '#5B6B82', accent: '#E9A93A', mark: '✦',
    text: 'Slow progress<br/>is still progress.',
    svg: `<g class="spin" style="transform-origin:24px 24px">${[0, 45, 90, 135, 180, 225, 270, 315].map((a) => `<rect x="23" y="7" width="2.4" height="6" rx="1.2" fill="#F6C86B" transform="rotate(${a} 24 24)"/>`).join('')}</g>
      <circle cx="24" cy="24" r="9" fill="#F6C86B"/>
      <g class="drift"><path d="M20 46a8 8 0 0 1 3-15.5A10 10 0 0 1 42 30a7.5 7.5 0 0 1 2 16Z" fill="#fff"/><path d="M20 46a8 8 0 0 1 3-15.5A10 10 0 0 1 42 30a7.5 7.5 0 0 1 2 16Z" fill="none" stroke="#DCE6F2" stroke-width="1.5"/></g>` },
  { name: 'coffee', bg: 'linear-gradient(135deg,#FBF4EA,#F5EADB)', ink: '#7A5F48', accent: '#B98158', mark: '☕︎',
    text: 'One task<br/>at a time.',
    svg: `<g class="steam" fill="none" stroke="#CDB59C" stroke-width="2.2" stroke-linecap="round"><path d="M22 22c-3-4 3-6 0-10"/><path d="M30 22c-3-4 3-6 0-10" style="animation-delay:.6s"/><path d="M38 22c-3-4 3-6 0-10" style="animation-delay:1.2s"/></g>
      <path d="M14 27h32v12a10 10 0 0 1-10 10H24a10 10 0 0 1-10-10Z" fill="#E7C7A6"/><path d="M46 31h3a5 5 0 0 1 0 10h-3" fill="none" stroke="#E7C7A6" stroke-width="3.5"/>
      <ellipse cx="30" cy="27" rx="16" ry="3" fill="#A87B55"/><ellipse cx="30" cy="54" rx="16" ry="2.5" fill="#EADBC8"/>` },
  { name: 'night', bg: 'linear-gradient(135deg,#F2EFFB,#E9E5F7)', ink: '#6B5E91', accent: '#9C86D6', mark: '☾',
    text: 'Rest is part<br/>of the work.',
    svg: `<g class="bob"><path d="M36 12a18 18 0 1 0 12 30A15 15 0 0 1 36 12Z" fill="#F3D98B"/><circle cx="30" cy="34" r="2" fill="#E7C66E"/><circle cx="37" cy="41" r="1.4" fill="#E7C66E"/></g>
      <path class="twinkle" d="M14 14l1.5 3.5L19 19l-3.5 1.5L14 24l-1.5-3.5L9 19l3.5-1.5Z" fill="#B9A8EA"/>
      <path class="twinkle" style="animation-delay:.8s" d="M50 10l1 2.2 2.2.8-2.2.8-1 2.2-1-2.2-2.2-.8 2.2-.8Z" fill="#B9A8EA"/>
      <circle class="twinkle" style="animation-delay:1.4s" cx="48" cy="50" r="1.6" fill="#B9A8EA"/>` },
  { name: 'cactus', bg: 'linear-gradient(135deg,#EEF7F0,#E5F2E9)', ink: '#4F7A5B', accent: '#E58FA8', mark: '✿',
    text: 'Stay sharp,<br/>stay kind.',
    svg: `<g class="wiggle" style="transform-origin:30px 42px"><rect x="24" y="14" width="12" height="30" rx="6" fill="#7DB88A"/>
      <path d="M24 30h-4a4 4 0 0 1-4-4v-5a3 3 0 0 1 6 0v3h2" fill="#7DB88A"/><path d="M36 26h3v-4a3 3 0 0 1 6 0v6a4 4 0 0 1-4 4h-5" fill="#7DB88A"/>
      <circle cx="30" cy="13" r="3.4" fill="#F2A7BB"/><circle cx="30" cy="13" r="1.3" fill="#F6C86B"/></g>
      <path d="M18 42h24l-3 13H21Z" fill="#E7A98A"/><rect x="16" y="40" width="28" height="5" rx="2" fill="#DB957A"/>` },
  { name: 'peaks', bg: 'linear-gradient(135deg,#FDF2EA,#FAE7DB)', ink: '#9A6650', accent: '#E58F6B', mark: '▲',
    text: 'Little by little,<br/>a lot gets done.',
    svg: `<circle class="rise" cx="40" cy="22" r="7" fill="#F6B98E"/>
      <path d="M4 52l18-26 10 13 6-7 18 20Z" fill="#D9A08A"/><path d="M22 26l5 7-5-2-4 3Z" fill="#fff" opacity=".8"/>
      <path d="M22 52l14-16 20 16Z" fill="#C48370"/><path class="drift" d="M8 18h10M12 14h8" stroke="#fff" stroke-width="2.4" stroke-linecap="round"/>` },
  { name: 'tulip', bg: 'linear-gradient(135deg,#FDF0F4,#FAE5EC)', ink: '#A05571', accent: '#E07A9B', mark: '♥',
    text: 'Bloom at<br/>your own pace.',
    svg: `<ellipse cx="30" cy="55" rx="13" ry="2.6" fill="#F3D5DF"/>
      <g class="sway" style="transform-origin:30px 55px"><path d="M30 55V28" stroke="#7DB88A" stroke-width="3" stroke-linecap="round"/>
      <path d="M30 46c-8-1-12-7-12-12 7 0 11 5 12 12Z" fill="#8CC79A"/>
      <path d="M20 16c0 10 4 15 10 15s10-5 10-15l-5 4-5-7-5 7Z" fill="#F29BB5"/><path d="M30 13l-5 7 5 11 5-11Z" fill="#E77F9F"/></g>` },
];

let sceneOffset = 0;
function sceneIndex() {
  const now = new Date();
  const day = Math.floor((now - now.getTimezoneOffset() * 60000) / 86400000);
  return (day + sceneOffset) % SCENES.length;
}
let lastScene = -1;
function renderFooter(force = false) {
  const i = sceneIndex();
  if (i === lastScene && !force) return;
  lastScene = i;
  const sc = SCENES[i];
  const pc = $('#plantCard');
  pc.dataset.scene = sc.name;
  pc.style.background = sc.bg;
  pc.style.setProperty('--ink', sc.ink);
  pc.style.setProperty('--accent', sc.accent);
  $('#plantArt').innerHTML = `<svg viewBox="0 0 60 60" aria-hidden="true">${sc.svg}</svg>`;
  pc.querySelector('.heart').textContent = sc.mark;
  pc.classList.remove('swap'); void pc.offsetWidth; pc.classList.add('swap');
  if (S) renderStats();
}
// click the footer to peek at the other scenes
$('#plantCard').addEventListener('click', () => { sceneOffset++; renderFooter(true); });

function floatHearts() {
  const pc = $('#plantCard');
  for (let i = 0; i < 5; i++) {
    const h = document.createElement('span');
    h.className = 'float-heart';
    h.textContent = [SCENES[sceneIndex()].mark, '✿', '♡'][i % 3];
    h.style.left = 60 + Math.random() * 240 + 'px';
    h.style.bottom = '8px';
    h.style.animationDelay = i * 120 + 'ms';
    h.style.fontSize = 12 + Math.random() * 8 + 'px';
    pc.appendChild(h);
    setTimeout(() => h.remove(), 1800);
  }
}

// ---------- tabs ----------
function renderTabs() {
  const nav = $('#tabs');
  nav.innerHTML = S.categories.map((c) => `
    <button class="tab ${c.id === S.activeCat ? 'active' : ''}" data-id="${c.id}" draggable="true" title="Drag to reorder · right-click for options">
      <span class="emoji">${c.icon}</span><span class="name">${esc(c.name)}</span><span class="count"></span>
    </button>`).join('') + `<button class="tab add" id="addCat" title="New category">+</button>`;

  nav.querySelectorAll('.tab[data-id]').forEach((el) => {
    el.onclick = () => selectCat(el.dataset.id);
    el.ondblclick = () => renameCat(el.dataset.id);
    el.oncontextmenu = (e) => { e.preventDefault(); catMenu(el.dataset.id, el); };
  });
  $('#addCat').onclick = addCat;
  nav.querySelector('.tab.active')?.scrollIntoView({ inline: 'nearest', block: 'nearest' });
}

// ----- reorder lists: drag a tab, or use the right-click menu -----
function moveCat(id, toIndex) {
  const from = S.categories.findIndex((c) => c.id === id);
  if (from < 0) return;
  toIndex = Math.max(0, Math.min(S.categories.length - 1, toIndex));
  if (from === toIndex) return;
  const before = new Map([...document.querySelectorAll('.tab[data-id]')].map((el) => [el.dataset.id, el.getBoundingClientRect().left]));
  const [c] = S.categories.splice(from, 1);
  S.categories.splice(toIndex, 0, c);
  persist();
  renderTabs();
  renderStats();
  // glide tabs into their new spots
  document.querySelectorAll('.tab[data-id]').forEach((el) => {
    const dx = (before.get(el.dataset.id) ?? 0) - el.getBoundingClientRect().left;
    if (Math.abs(dx) > 1) el.animate([{ transform: `translateX(${dx}px)` }, { transform: 'none' }], { duration: 380, easing: 'cubic-bezier(.2,.8,.2,1)' });
  });
}

let dragCat = null;
const tabsNav = $('#tabs');
const clearDropMarks = () => tabsNav.querySelectorAll('.tab').forEach((el) => el.classList.remove('drop-before', 'drop-after', 'dragging'));
tabsNav.addEventListener('dragstart', (e) => {
  const el = e.target.closest('.tab[data-id]'); if (!el) return;
  dragCat = el.dataset.id;
  e.dataTransfer.effectAllowed = 'move';
  e.dataTransfer.setData('text/plain', dragCat);
  requestAnimationFrame(() => el.classList.add('dragging'));
});
tabsNav.addEventListener('dragover', (e) => {
  if (!dragCat) return;
  e.preventDefault();
  const el = e.target.closest('.tab[data-id]');
  tabsNav.querySelectorAll('.tab').forEach((t) => t.classList.remove('drop-before', 'drop-after'));
  if (!el || el.dataset.id === dragCat) return;
  const r = el.getBoundingClientRect();
  el.classList.add(e.clientX < r.left + r.width / 2 ? 'drop-before' : 'drop-after');
  // auto-scroll when dragging near the edges
  const nr = tabsNav.getBoundingClientRect();
  if (e.clientX < nr.left + 30) tabsNav.scrollLeft -= 8;
  if (e.clientX > nr.right - 30) tabsNav.scrollLeft += 8;
});
tabsNav.addEventListener('drop', (e) => {
  if (!dragCat) return;
  e.preventDefault();
  const el = e.target.closest('.tab[data-id]');
  const id = dragCat;
  clearDropMarks();
  dragCat = null;
  if (!el || el.dataset.id === id) return;
  const r = el.getBoundingClientRect();
  const after = e.clientX >= r.left + r.width / 2;
  const without = S.categories.filter((c) => c.id !== id);
  let to = without.findIndex((c) => c.id === el.dataset.id) + (after ? 1 : 0);
  moveCat(id, to);
});
tabsNav.addEventListener('dragend', () => { dragCat = null; clearDropMarks(); });

function selectCat(id) {
  if (S.activeCat === id) return;
  S.activeCat = id;
  persist();
  closeDetail();
  renderTabs();
  renderList();
  renderStats();
}

function addCat() {
  const c = { id: uid(), name: 'New list', icon: EMOJIS[(S.categories.length + 4) % EMOJIS.length] };
  S.categories.push(c);
  S.activeCat = c.id;
  persist();
  renderTabs(); renderList(); renderStats();
  renameCat(c.id);
}

function renameCat(id) {
  const el = document.querySelector(`.tab[data-id="${id}"] .name`);
  if (!el) return;
  const c = cat(id);
  const input = document.createElement('input');
  input.value = c.name;
  el.replaceWith(input);
  input.focus(); input.select();
  const finish = (ok) => {
    if (ok && input.value.trim()) c.name = input.value.trim();
    persist(); renderTabs(); renderStats();
  };
  input.onkeydown = (e) => { if (e.key === 'Enter') input.blur(); if (e.key === 'Escape') { input.onblur = null; finish(false); } };
  input.onblur = () => finish(true);
  input.onclick = (e) => e.stopPropagation();
}

function catMenu(id, anchor) {
  const c = cat(id);
  showMenu(anchor, [
    { icon: '✏️', label: 'Rename', onClick: () => renameCat(id) },
    { icon: '⬅️', label: 'Move left', disabled: S.categories[0].id === id, onClick: () => moveCat(id, S.categories.findIndex((x) => x.id === id) - 1) },
    { icon: '➡️', label: 'Move right', disabled: S.categories[S.categories.length - 1].id === id, onClick: () => moveCat(id, S.categories.findIndex((x) => x.id === id) + 1) },
    { custom: () => {
      const wrap = document.createElement('div');
      wrap.innerHTML = `<div class="menu-label">Icon</div><div class="emoji-grid">${EMOJIS.map((e) => `<button>${e}</button>`).join('')}</div>`;
      wrap.querySelectorAll('.emoji-grid button').forEach((b) => b.onclick = () => { c.icon = b.textContent; persist(); renderTabs(); renderStats(); closeMenu(); });
      return wrap;
    } },
    { sep: true },
    { icon: '🗑️', label: 'Delete list', danger: true, disabled: S.categories.length <= 1, onClick: () => deleteCat(id) },
  ]);
}

function deleteCat(id) {
  if (S.categories.length <= 1) return;
  const idx = S.categories.findIndex((c) => c.id === id);
  const removedCat = S.categories[idx];
  const removedTasks = S.tasks.filter((t) => t.catId === id);
  S.categories.splice(idx, 1);
  S.tasks = S.tasks.filter((t) => t.catId !== id);
  if (S.activeCat === id) S.activeCat = S.categories[Math.max(0, idx - 1)].id;
  closeDetail();
  persist(); renderTabs(); renderList(); renderStats();
  toast(`Deleted “${removedCat.name}”`, () => {
    S.categories.splice(idx, 0, removedCat);
    S.tasks.push(...removedTasks);
    S.activeCat = removedCat.id;
    persist(); renderTabs(); renderList(); renderStats();
  });
}

// ---------- task list ----------
const ICON_SUB = '<svg viewBox="0 0 24 24"><path d="M5 12l4 4 10-10"/></svg>';
const ICON_NOTE = '<svg viewBox="0 0 24 24"><path d="M6 3h9l4 4v14H6z M14 3v5h5 M9 13h7 M9 17h5"/></svg>';
const ICON_X = '<svg viewBox="0 0 24 24"><path d="M6 6l12 12M18 6L6 18"/></svg>';
const ICON_CHECK = '<svg viewBox="0 0 24 24"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg>';

const STATUS = {
  todo: { label: 'To do' },
  progress: { label: 'In progress' },
  done: { label: 'Completed' },
};
const STATUS_RANK = { todo: 0, progress: 1 };
const PRIORITY_RANK = { high: 0, medium: 1, low: 2, none: 3 };

function setStatus(t, s) {
  if (t.status === s) return;
  t.status = s;
  t.done = s === 'done';
  t.doneAt = t.done ? Date.now() : null;
}

function statusPill(s, extra = '') {
  return `<button class="status-pill st-${s} ${extra}"><span class="sdot"></span>${STATUS[s].label}</button>`;
}

function statusMenu(anchor, t, after) {
  showMenu(anchor, ['todo', 'progress', 'done'].map((s) => ({
    icon: `<span class="status-pill st-${s} mini"><span class="sdot"></span></span>`,
    label: STATUS[s].label, checked: t.status === s,
    onClick: () => {
      const wasDone = t.status === 'done';
      setStatus(t, s);
      persist();
      after?.(s, wasDone);
    },
  })));
}

function taskRow(t, i, still = false) {
  const subsDone = t.subtasks.filter((s) => s.done).length;
  const meta = [];
  if (t.priority && t.priority !== 'none') meta.push(`<span class="mi"><span class="pdot" style="background:${PRIORITY[t.priority].color}"></span>${PRIORITY[t.priority].label}</span>`);
  if (t.subtasks.length) meta.push(`<span class="mi">${ICON_SUB}${subsDone}/${t.subtasks.length}</span>`);
  if (t.notes || t.desc) meta.push(`<span class="mi">${ICON_NOTE}</span>`);
  if (t.date && t.date !== todayISO()) meta.push(`<span class="mi">${esc(fmtDate(t.date))}</span>`);
  return `
    <li class="task ${t.status === 'done' ? 'done' : ''} ${t.id === openId ? 'selected' : ''} ${still ? 'still' : ''}" data-id="${t.id}" style="--i:${i}">
      <button class="check" title="Complete">${ICON_CHECK}</button>
      <div class="t-main">
        <div class="t-title">${esc(t.title)}</div>
        <div class="t-meta">${meta.join('')}</div>
      </div>
      ${statusPill(t.status)}
      <button class="t-del" title="Delete">${ICON_X}</button>
    </li>`;
}

// To do first, then In progress; inside each, High → Medium → Low → none; then the order they were added.
function sortActive(list) {
  return list
    .filter((t) => t.status !== 'done')
    .map((t, i) => [t, i])
    .sort(([a, ai], [b, bi]) =>
      STATUS_RANK[a.status] - STATUS_RANK[b.status] ||
      PRIORITY_RANK[a.priority || 'none'] - PRIORITY_RANK[b.priority || 'none'] ||
      ai - bi)
    .map(([t]) => t);
}

function rowPositions() {
  const m = new Map();
  document.querySelectorAll('#tasks .task').forEach((el) => m.set(el.dataset.id, el.getBoundingClientRect().top));
  return m;
}

// FLIP: rows glide from their old spot to their new one after a re-sort.
function glide(before) {
  document.querySelectorAll('#tasks .task').forEach((el) => {
    const top = before.get(el.dataset.id);
    if (top == null) { el.classList.remove('still'); return; }
    const dy = top - el.getBoundingClientRect().top;
    if (Math.abs(dy) > 1) el.animate([{ transform: `translateY(${dy}px)` }, { transform: 'none' }], { duration: 420, easing: 'cubic-bezier(.2,.8,.2,1)' });
  });
}

function renderList({ animate = false } = {}) {
  const ul = $('#tasks');
  const all = catTasks();
  if (!all.length) {
    ul.innerHTML = `<li class="empty"><span class="big">🌱</span>Nothing here yet.<br/>Add your first task below.</li>`;
    return;
  }
  const before = animate ? rowPositions() : null;
  const active = sortActive(all);
  const done = all.filter((t) => t.status === 'done').sort((a, b) => (b.doneAt || 0) - (a.doneAt || 0));

  let html = active.length
    ? active.map((t, i) => taskRow(t, i, animate)).join('')
    : `<li class="empty small"><span class="big">🌸</span>All caught up!</li>`;
  if (done.length) {
    html += `<li class="done-toggle ${S.showDone ? 'open' : ''}"><button id="doneToggle">
      <svg viewBox="0 0 24 24"><path d="M9 6l6 6-6 6"/></svg>Completed<span class="n">${done.length}</span></button></li>`;
    if (S.showDone) html += done.map((t, i) => taskRow(t, i, animate)).join('');
  }
  ul.innerHTML = html;
  if (before) glide(before);
}

// Re-sort after a status change; a row that is about to be hidden fades out first.
let reflowTimer;
function reflow(id, delay = 0) {
  clearTimeout(reflowTimer);
  reflowTimer = setTimeout(() => {
    const t = task(id);
    const li = document.querySelector(`.task[data-id="${id}"]`);
    if (t && li && t.status === 'done' && !S.showDone) {
      li.style.height = li.offsetHeight + 'px';
      li.classList.add('leaving');
      setTimeout(() => renderList({ animate: true }), 260);
    } else renderList({ animate: true });
  }, delay);
}

function updateRow(id) {
  const t = task(id);
  const li = document.querySelector(`.task[data-id="${id}"]`);
  if (!t || !li) return;
  const tmp = document.createElement('div');
  tmp.innerHTML = taskRow(t, 0, true).trim();
  li.replaceWith(tmp.firstChild);
}

$('#tasks').addEventListener('click', (e) => {
  if (e.target.closest('#doneToggle')) {
    S.showDone = !S.showDone;
    persist();
    return renderList({ animate: true });
  }
  const li = e.target.closest('.task');
  if (!li) return;
  const id = li.dataset.id;
  if (e.target.closest('.check')) return toggleTask(id, li);
  if (e.target.closest('.t-del')) return deleteTask(id);
  if (e.target.closest('.status-pill')) {
    return statusMenu(e.target.closest('.status-pill'), task(id), (s, wasDone) => afterStatusChange(id, s, wasDone));
  }
  openId === id ? closeDetail() : openDetail(id);
});
$('#tasks').addEventListener('contextmenu', (e) => {
  const li = e.target.closest('.task');
  if (!li) return;
  e.preventDefault();
  taskMenu(li.dataset.id, { x: e.clientX, y: e.clientY });
});

function afterStatusChange(id, s, wasDone) {
  const li = document.querySelector(`.task[data-id="${id}"]`);
  if (li) {
    updateRow(id);
    if (s === 'done' && !wasDone) {
      const chk = document.querySelector(`.task[data-id="${id}"] .check`);
      chk.classList.add('pop'); burst(chk);
    }
  }
  if (openId === id) renderStatus();
  renderStats(s === 'done' && !wasDone);
  reflow(id, s === 'done' ? 650 : 150);
}

function toggleTask(id, li) {
  const t = task(id);
  setStatus(t, t.status === 'done' ? 'todo' : 'done');
  persist();
  li = li || document.querySelector(`.task[data-id="${id}"]`);
  if (li) {
    li.classList.toggle('done', t.done);
    const chk = li.querySelector('.check');
    chk.classList.remove('pop'); void chk.offsetWidth; chk.classList.add('pop');
    if (t.done) burst(chk);
    const pill = li.querySelector('.status-pill');
    pill.outerHTML = statusPill(t.status, 'swap');
  }
  if (openId === id) renderStatus();
  renderStats(t.done);
  reflow(id, t.done ? 650 : 200);
}

function burst(el) {
  const colors = ['#8CC79A', '#F2A7BB', '#F6C86B', '#9CC3F0', '#5DA271', '#C5A8F0'];
  for (let i = 0; i < 8; i++) {
    const p = document.createElement('span');
    p.className = 'burst';
    p.style.setProperty('--a', `${i * 45 + Math.random() * 20}deg`);
    p.style.background = colors[i % colors.length];
    el.appendChild(p);
    setTimeout(() => p.remove(), 650);
  }
}

function addTask(text) {
  const { title, time, priority } = parseQuickAdd(text);
  const t = {
    id: uid(), catId: S.activeCat, title, time, status: 'todo', done: false, date: todayISO(),
    desc: '', priority, tags: [], subtasks: [], notes: '', createdAt: Date.now(),
  };
  S.tasks.push(t);
  persist();
  renderList({ animate: true });
  document.querySelector(`.task[data-id="${t.id}"]`)?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  renderStats();
}

function deleteTask(id) {
  const idx = S.tasks.findIndex((t) => t.id === id);
  if (idx < 0) return;
  const [removed] = S.tasks.splice(idx, 1);
  persist();
  if (openId === id) closeDetail();
  const li = document.querySelector(`.task[data-id="${id}"]`);
  const after = () => { renderList({ animate: true }); renderStats(); };
  if (li) { li.style.height = li.offsetHeight + 'px'; li.classList.add('leaving'); setTimeout(after, 260); } else after();
  toast(`Deleted “${removed.title.slice(0, 28)}”`, () => {
    S.tasks.splice(idx, 0, removed);
    persist(); renderList({ animate: true }); renderStats();
  });
}

function taskMenu(id, anchor) {
  const t = task(id);
  const others = S.categories.filter((c) => c.id !== t.catId);
  const setTo = (s) => () => { const was = t.status === 'done'; setStatus(t, s); persist(); afterStatusChange(id, s, was); };
  showMenu(anchor, [
    { icon: '📄', label: 'Open details', onClick: () => openDetail(id) },
    { label: 'Status', header: true },
    ...['todo', 'progress', 'done'].map((s) => ({
      icon: `<span class="status-pill st-${s} mini"><span class="sdot"></span></span>`,
      label: STATUS[s].label, checked: t.status === s, onClick: setTo(s),
    })),
    { label: 'Priority', header: true },
    ...['high', 'medium', 'low', 'none'].map((p) => ({
      icon: `<span class="pdot" style="display:inline-block;width:9px;height:9px;border-radius:50%;background:${PRIORITY[p].color}"></span>`,
      label: PRIORITY[p].label, checked: (t.priority || 'none') === p, onClick: () => setPriority(id, p),
    })),
    { sep: true },
    { icon: '📋', label: 'Duplicate', onClick: () => duplicateTask(id) },
    ...(others.length ? [{ sep: true }, { label: 'Move to', header: true }, ...others.map((c) => ({ icon: c.icon, label: c.name, onClick: () => moveTask(id, c.id) }))] : []),
    { sep: true },
    { icon: '🗑️', label: 'Delete', danger: true, onClick: () => deleteTask(id) },
  ]);
}

function duplicateTask(id) {
  const t = task(id);
  const copy = { ...structuredClone(t), id: uid(), title: t.title + ' (copy)', status: 'todo', done: false, doneAt: null, createdAt: Date.now() };
  copy.subtasks.forEach((s) => (s.id = uid()));
  S.tasks.splice(S.tasks.indexOf(t) + 1, 0, copy);
  persist(); renderList({ animate: true }); renderStats();
}

function moveTask(id, catId) {
  const t = task(id);
  t.catId = catId;
  persist();
  if (openId === id) closeDetail();
  renderList({ animate: true }); renderStats();
  toast(`Moved to ${cat(catId).icon} ${cat(catId).name}`);
}

$('#addForm').addEventListener('submit', (e) => {
  e.preventDefault();
  const input = $('#addInput');
  if (!input.value.trim()) return;
  addTask(input.value);
  input.value = '';
});

// ---------- detail panel ----------
let animating = Promise.resolve();

async function openDetail(id) {
  openId = id;
  document.querySelectorAll('.task').forEach((el) => el.classList.toggle('selected', el.dataset.id === id));
  fillDetail();
  if (document.body.classList.contains('expanded')) {
    // already open: quick content swap
    const d = $('#detail'); d.style.opacity = '.4';
    requestAnimationFrame(() => { d.style.opacity = ''; });
    return;
  }
  await animating;
  animating = (async () => {
    const side = await api.expandSide();
    document.body.classList.toggle('side-left', side === 'left');
    await api.setExpanded(true);
    document.body.classList.add('expanded');
    await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
    document.body.classList.add('open');
    autosizeAll();
  })();
  await animating;
  const t = task(id);
  if (t && t.title === '') $('#dTitle').focus();
}

async function closeDetail() {
  if (!openId && !document.body.classList.contains('expanded')) return;
  openId = null;
  document.querySelectorAll('.task.selected').forEach((el) => el.classList.remove('selected'));
  await animating;
  animating = (async () => {
    document.body.classList.remove('open');
    await new Promise((r) => setTimeout(r, 200));
    if (openId) { document.body.classList.add('open'); return; } // reopened meanwhile
    document.body.classList.remove('expanded');
    await api.setExpanded(false);
  })();
  await animating;
}

function autosize(el) { el.style.height = 'auto'; el.style.height = el.scrollHeight + 'px'; }
const autosizeAll = () => ['#dTitle', '#dDesc', '#dNotes'].forEach((s) => autosize($(s)));

function fillDetail() {
  const t = task(openId);
  if (!t) return;
  $('#dTitle').value = t.title;
  $('#dDesc').value = t.desc || '';
  $('#dNotes').value = t.notes || '';
  requestAnimationFrame(autosizeAll);
  renderStatus();
  renderDateTime();
  renderPriority();
  renderTags();
  renderSubs();
  $('#dCreated').textContent = 'Created ' + new Date(t.createdAt).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
}

function renderDateTime() {
  const t = task(openId);
  $('#dDateLabel').textContent = t.date ? fmtDate(t.date) : 'Empty';
  $('#dDateBtn').classList.toggle('empty', !t.date);
  $('#dDateBtn').classList.toggle('overdue', !!t.date && !t.done && t.date < todayISO());
  $('#dTimeLabel').textContent = t.time ? fmtTime(t.time) : 'Empty';
  $('#dTimeBtn').classList.toggle('empty', !t.time);
}

function renderStatus() {
  const t = task(openId); if (!t) return;
  $('#dStatus').innerHTML = statusPill(t.status, 'big');
}
$('#dStatus').onclick = (e) => {
  const id = openId;
  statusMenu(e.currentTarget, task(id), (s, wasDone) => afterStatusChange(id, s, wasDone));
};

function setPriority(id, p) {
  const t = task(id);
  if (!t || t.priority === p) return;
  t.priority = p;
  persist();
  if (openId === id) renderPriority();
  updateRow(id);
  reflow(id, 150);
}

function renderPriority() {
  const p = task(openId).priority || 'none';
  $('#dPriority').innerHTML = `<span class="chip prio-${p}">${p === 'none' ? 'Set priority' : PRIORITY[p].label}<svg viewBox="0 0 24 24"><path d="M6 9l6 6 6-6"/></svg></span>`;
}

function renderTags() {
  const t = task(openId);
  const box = $('#dTags');
  box.querySelectorAll('.tag').forEach((el) => el.remove());
  const input = $('#dTagInput');
  t.tags.forEach((name, i) => {
    const [bg, fg] = tagColor(name);
    const el = document.createElement('span');
    el.className = 'chip tag';
    el.style.background = bg; el.style.color = fg;
    el.innerHTML = `${esc(name)}<span class="x" title="Remove">×</span>`;
    el.querySelector('.x').onclick = () => { t.tags.splice(i, 1); persist(); renderTags(); };
    box.insertBefore(el, input);
  });
}

function renderSubs() {
  const t = task(openId);
  const done = t.subtasks.filter((s) => s.done).length;
  $('#dSubCount').textContent = `${done} / ${t.subtasks.length}`;
  $('#dSubs').innerHTML = t.subtasks.map((s) => `
    <li class="sub ${s.done ? 'done' : ''}" data-id="${s.id}">
      <button class="check ${s.done ? 'on' : ''}">${ICON_CHECK}</button>
      <span class="sub-text" contenteditable="plaintext-only" spellcheck="false">${esc(s.text)}</span>
      <button class="t-del" title="Remove">${ICON_X}</button>
    </li>`).join('');
}

// detail field bindings
function bindText(sel, key, after) {
  const el = $(sel);
  el.addEventListener('input', () => {
    const t = task(openId); if (!t) return;
    t[key] = key === 'title' ? el.value.replace(/\n/g, ' ') : el.value;
    autosize(el);
    persist();
    after?.();
  });
}
bindText('#dTitle', 'title', () => updateRow(openId));
bindText('#dDesc', 'desc', () => updateRow(openId));
bindText('#dNotes', 'notes', () => updateRow(openId));
$('#dTitle').addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); $('#dDesc').focus(); } });

const isoOf = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
function setDate(v) { task(openId).date = v; persist(); renderDateTime(); updateRow(openId); }
function setTime(v) { task(openId).time = v; persist(); renderDateTime(); updateRow(openId); }

// Themed calendar popover (replaces the native date input)
function datePicker(anchor, value, onPick) {
  const view = value ? new Date(value + 'T00:00:00') : new Date();
  view.setDate(1);
  const wrap = document.createElement('div');
  wrap.className = 'cal';
  const today = todayISO();
  const shift = (n) => { const d = new Date(); d.setDate(d.getDate() + n); return isoOf(d); };
  const draw = (dir = 0) => {
    const start = new Date(view); start.setDate(1 - start.getDay());
    let days = '';
    for (let i = 0; i < 42; i++) {
      const d = new Date(start); d.setDate(start.getDate() + i);
      const iso = isoOf(d);
      const cls = [d.getMonth() !== view.getMonth() && 'out', iso === today && 'today', iso === value && 'sel'].filter(Boolean).join(' ');
      days += `<button class="day ${cls}" data-d="${iso}">${d.getDate()}</button>`;
    }
    wrap.innerHTML = `
      <div class="cal-quick">
        <button data-d="${shift(0)}">Today</button><button data-d="${shift(1)}">Tomorrow</button><button data-d="${shift(7)}">Next week</button>
      </div>
      <div class="cal-head">
        <span>${view.toLocaleDateString(undefined, { month: 'long', year: 'numeric' })}</span>
        <div><button class="nav" data-nav="-1">‹</button><button class="nav" data-nav="1">›</button></div>
      </div>
      <div class="cal-grid ${dir < 0 ? 'from-left' : dir > 0 ? 'from-right' : ''}">
        ${['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'].map((w) => `<span class="wd">${w}</span>`).join('')}${days}
      </div>
      <div class="pick-foot"><button class="clear">Clear</button></div>`;
    wrap.querySelectorAll('[data-d]').forEach((b) => b.onclick = () => { closeMenu(); onPick(b.dataset.d); });
    wrap.querySelectorAll('[data-nav]').forEach((b) => b.onclick = () => { const n = +b.dataset.nav; view.setMonth(view.getMonth() + n); draw(n); });
    wrap.querySelector('.clear').onclick = () => { closeMenu(); onPick(''); };
  };
  draw();
  showMenu(anchor, [{ custom: () => wrap }]);
}

// Themed time popover (replaces the native time input)
function timePicker(anchor, value, onPick) {
  const wrap = document.createElement('div');
  wrap.className = 'tp';
  const slots = [];
  for (let m = 0; m < 24 * 60; m += 15) slots.push(`${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`);
  wrap.innerHTML = `
    <div class="cal-quick">${['09:00', '12:00', '15:00', '18:00'].map((v) => `<button data-t="${v}">${fmtTime(v).replace(':00', '')}</button>`).join('')}</div>
    <div class="tp-list">${slots.map((v) => `<button class="slot ${v === value ? 'sel' : ''}" data-t="${v}">${fmtTime(v)}</button>`).join('')}</div>
    <div class="pick-foot"><button class="clear">Clear</button></div>`;
  wrap.querySelectorAll('[data-t]').forEach((b) => b.onclick = () => { closeMenu(); onPick(b.dataset.t); });
  wrap.querySelector('.clear').onclick = () => { closeMenu(); onPick(''); };
  showMenu(anchor, [{ custom: () => wrap }]);
  const target = wrap.querySelector('.slot.sel') || wrap.querySelector('[data-t="09:00"].slot');
  wrap.querySelector('.tp-list').scrollTop = target.offsetTop - 60;
}

$('#dDateBtn').onclick = (e) => datePicker(e.currentTarget, task(openId).date, setDate);
$('#dTimeBtn').onclick = (e) => timePicker(e.currentTarget, task(openId).time, setTime);

$('#dPriority').onclick = (e) => {
  const t = task(openId);
  showMenu(e.currentTarget, ['high', 'medium', 'low', 'none'].map((p) => ({
    icon: `<span class="pdot" style="display:inline-block;width:9px;height:9px;border-radius:50%;background:${PRIORITY[p].color}"></span>`,
    label: PRIORITY[p].label, checked: t.priority === p,
    onClick: () => setPriority(t.id, p),
  })));
};

$('#dTagInput').addEventListener('keydown', (e) => {
  const input = e.target;
  const t = task(openId);
  if ((e.key === 'Enter' || e.key === ',') && input.value.trim()) {
    e.preventDefault();
    const v = input.value.trim().replace(/,/g, '');
    if (!t.tags.some((x) => x.toLowerCase() === v.toLowerCase())) t.tags.push(v);
    input.value = '';
    persist(); renderTags();
  } else if (e.key === 'Backspace' && !input.value && t.tags.length) {
    t.tags.pop(); persist(); renderTags();
  }
});

$('#dSubForm').addEventListener('submit', (e) => {
  e.preventDefault();
  const input = $('#dSubInput');
  const v = input.value.trim(); if (!v) return;
  task(openId).subtasks.push({ id: uid(), text: v, done: false });
  input.value = '';
  persist(); renderSubs(); updateRow(openId);
});
$('#dSubs').addEventListener('click', (e) => {
  const li = e.target.closest('.sub'); if (!li) return;
  const t = task(openId);
  const s = t.subtasks.find((x) => x.id === li.dataset.id);
  if (e.target.closest('.check')) {
    s.done = !s.done;
    li.classList.toggle('done', s.done);
    const chk = li.querySelector('.check');
    chk.classList.toggle('on', s.done);
    chk.classList.remove('pop'); void chk.offsetWidth; chk.classList.add('pop');
    if (s.done) burst(chk);
    $('#dSubCount').textContent = `${t.subtasks.filter((x) => x.done).length} / ${t.subtasks.length}`;
    persist(); updateRow(openId);
  } else if (e.target.closest('.t-del')) {
    t.subtasks = t.subtasks.filter((x) => x.id !== s.id);
    persist(); renderSubs(); updateRow(openId);
  }
});
$('#dSubs').addEventListener('input', (e) => {
  const li = e.target.closest('.sub'); if (!li) return;
  const s = task(openId).subtasks.find((x) => x.id === li.dataset.id);
  s.text = e.target.textContent;
  persist();
});
$('#dSubs').addEventListener('keydown', (e) => {
  if (e.key === 'Enter' && e.target.classList.contains('sub-text')) { e.preventDefault(); e.target.blur(); }
});

$('#dClose').onclick = closeDetail;
$('#dMore').onclick = (e) => taskMenu(openId, e.currentTarget);

// ---------- menus ----------
function closeMenu() { $('#menuLayer').innerHTML = ''; }

function showMenu(anchor, items) {
  closeMenu();
  const m = document.createElement('div');
  m.className = 'menu';
  for (const it of items) {
    if (it.sep) { m.insertAdjacentHTML('beforeend', '<div class="menu-sep"></div>'); continue; }
    if (it.header) { m.insertAdjacentHTML('beforeend', `<div class="menu-label">${esc(it.label)}</div>`); continue; }
    if (it.custom) { m.appendChild(it.custom()); continue; }
    const b = document.createElement('button');
    b.className = 'menu-item' + (it.danger ? ' danger' : '');
    b.innerHTML = `<span class="mi-icon">${it.icon || ''}</span><span>${esc(it.label)}</span>${it.checked ? '<span class="tick">✓</span>' : ''}`;
    if (it.disabled) { b.disabled = true; b.style.opacity = .4; b.style.cursor = 'default'; }
    b.onclick = () => { closeMenu(); it.onClick?.(); };
    m.appendChild(b);
  }
  $('#menuLayer').appendChild(m);
  const r = anchor.getBoundingClientRect ? anchor.getBoundingClientRect() : { left: anchor.x, bottom: anchor.y, right: anchor.x, top: anchor.y };
  let x = r.left, y = r.bottom + 4;
  const mw = m.offsetWidth, mh = m.offsetHeight;
  if (x + mw > innerWidth - 12) x = Math.max(12, (r.right ?? r.left) - mw);
  if (y + mh > innerHeight - 12) y = Math.max(12, r.top - mh - 4);
  m.style.left = x + 'px'; m.style.top = y + 'px';
}
document.addEventListener('mousedown', (e) => { if (!e.target.closest('.menu')) closeMenu(); });

// ---------- toast ----------
let toastTimer;
function toast(msg, undo) {
  const el = $('#toast');
  el.innerHTML = `<span>${esc(msg)}</span>${undo ? '<button>Undo</button>' : ''}`;
  if (undo) el.querySelector('button').onclick = () => { undo(); el.classList.remove('show'); };
  el.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove('show'), 4000);
}

// ---------- window buttons ----------
async function setPinUI(on) { $('#btnPin').classList.toggle('on', on); $('#btnPin').title = on ? 'Unpin (stop keeping on top)' : 'Keep on top'; }
$('#btnPin').onclick = async () => { const on = await api.togglePin(); setPinUI(on); toast(on ? '📌 Pinned — stays above other apps' : 'Unpinned — other apps can cover it'); };
api.onPinChanged(setPinUI);
$('#btnClose').onclick = () => api.hide();

let mini = false;
$('#btnMini').onclick = async () => {
  if (!mini) await closeDetail();
  mini = !mini;
  if (mini) { document.body.classList.add('mini'); await api.setMini(true); }
  else { await api.setMini(false); document.body.classList.remove('mini'); }
  $('#btnMini').title = mini ? 'Expand' : 'Collapse';
  $('#btnMini').innerHTML = mini
    ? '<svg viewBox="0 0 24 24"><path d="M6 15l6-6 6 6" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>'
    : '<svg viewBox="0 0 24 24"><path d="M5 12h14" stroke-width="2" stroke-linecap="round"/></svg>';
};
$('.header').addEventListener('dblclick', (e) => { if (!e.target.closest('button')) $('#btnMini').click(); });

$('#btnMenu').onclick = async (e) => {
  const auto = await api.getAutoStart();
  const pinned = $('#btnPin').classList.contains('on');
  showMenu(e.currentTarget, [
    { icon: '🚀', label: 'Start with Windows', checked: auto, onClick: async () => { const v = await api.setAutoStart(!auto); toast(v ? 'Task Nest will open when you start your laptop' : 'Won’t open at startup'); } },
    { icon: '📌', label: 'Always on top', checked: pinned, onClick: () => $('#btnPin').click() },
    { sep: true },
    { icon: '🧹', label: 'Clear completed in this list', onClick: clearCompleted },
    { icon: '📁', label: 'Open data & backups folder', onClick: () => api.openData() },
    { sep: true },
    { label: 'Quick add tips', header: true },
    { icon: '⏰', label: '“Gym 6pm” sets a time', onClick: () => $('#addInput').focus() },
    { icon: '🚩', label: '“Pay rent !high” sets priority', onClick: () => $('#addInput').focus() },
    { sep: true },
    { icon: '👋', label: 'Quit Task Nest', danger: true, onClick: () => api.quit() },
  ]);
};

function clearCompleted() {
  const removed = S.tasks.filter((t) => t.catId === S.activeCat && t.done);
  if (!removed.length) return toast('Nothing to clear ✨');
  const before = S.tasks.slice();
  S.tasks = S.tasks.filter((t) => !(t.catId === S.activeCat && t.done));
  if (openId && !task(openId)) closeDetail();
  persist(); renderList(); renderStats();
  toast(`Cleared ${removed.length} completed`, () => { S.tasks = before; persist(); renderList(); renderStats(); });
}

// ---------- keyboard ----------
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') {
    if ($('#menuLayer').children.length) return closeMenu();
    if (openId) return closeDetail();
  }
  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'n') { e.preventDefault(); $('#addInput').focus(); }
});

// ---------- boot ----------
(async function init() {
  if (!api) return; // main process will reload the window once the bridge is ready
  let res = { status: 'error' };
  for (let i = 0; i < 6; i++) {
    res = await api.load().catch(() => ({ status: 'error' }));
    if (res.status !== 'error') break;
    await new Promise((r) => setTimeout(r, 500 * (i + 1)));
  }
  if (res.status === 'error') {
    $('#tasks').innerHTML = `<li class="empty"><span class="big">🫣</span>Couldn't open your tasks.<br/>They're safe — restart Task Nest to try again.</li>`;
    return; // do NOT overwrite the file with anything
  }
  S = res.status === 'ok' ? res.data : seed();
  canSave = true;
  if (!cat(S.activeCat)) S.activeCat = S.categories[0].id;
  for (const t of S.tasks) {
    if (!STATUS[t.status]) t.status = t.done ? 'done' : 'todo';
    t.done = t.status === 'done';
  }
  // header mini counter
  $('.brand').insertAdjacentHTML('beforeend', '<span class="mini-count" id="miniCount"></span>');
  persist();
  renderGreeting();
  renderFooter();
  renderTabs();
  renderList();
  renderStats();
  setPinUI(await api.getPin());
  setInterval(() => { renderGreeting(); renderFooter(); }, 60_000);
})();
