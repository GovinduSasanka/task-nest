const { app, BrowserWindow, ipcMain, Tray, Menu, nativeImage, screen, globalShortcut, shell } = require('electron');
const path = require('path');
const fs = require('fs');

const COLLAPSED_W = 400;   // list only (includes 10px shadow gutter each side)
const EXPANDED_W = 780;    // list + detail
const MINI_H = 78;         // header-only "mini" mode
const MARGIN = 16;

let win = null;
let tray = null;
let expanded = false;
let expandSide = 'right';
let mini = false;
let fullHeight = 680;

// ---------- persistence ----------
const userFile = (name) => path.join(app.getPath('userData'), name);
const DATA = 'tasknest.json';
const sleep = (ms) => Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);

function log(...args) {
  const line = `[${new Date().toISOString()}] ${args.join(' ')}\n`;
  try {
    const f = userFile('nest.log');
    if (fs.existsSync(f) && fs.statSync(f).size > 256 * 1024) fs.renameSync(f, f + '.old');
    fs.appendFileSync(f, line);
  } catch { /* logging must never break the app */ }
}

// Retry file operations: right after Windows sign-in, antivirus / indexing can briefly lock files.
function retry(fn, label, tries = 8) {
  for (let i = 1; ; i++) {
    try { return fn(); } catch (err) {
      if (i >= tries) { log(label, 'FAILED:', err.code || '', err.message); throw err; }
      sleep(120 * i);
    }
  }
}

function readJSON(name, fallback) {
  try { return JSON.parse(fs.readFileSync(userFile(name), 'utf8')); } catch { return fallback; }
}

function writeFileSafe(file, text) {
  retry(() => fs.writeFileSync(file + '.tmp', text), 'write tmp ' + path.basename(file));
  try {
    retry(() => fs.renameSync(file + '.tmp', file), 'rename ' + path.basename(file), 5);
  } catch {
    // rename blocked (file locked): fall back to writing in place
    retry(() => fs.writeFileSync(file, text), 'direct write ' + path.basename(file));
    try { fs.unlinkSync(file + '.tmp'); } catch {}
  }
}
function writeJSON(name, data) {
  writeFileSafe(userFile(name), JSON.stringify(data, null, 2));
}

// Load tasks. Never pretends the file is missing when it merely failed to read.
function loadData() {
  const file = userFile(DATA);
  const candidates = [file, file + '.tmp', userFile('tasknest.bak.json')];
  if (!candidates.some((f) => fs.existsSync(f))) { log('load: no data yet (first run)'); return { status: 'empty' }; }
  for (const f of candidates) {
    if (!fs.existsSync(f)) continue;
    try {
      const data = retry(() => JSON.parse(fs.readFileSync(f, 'utf8')), 'read ' + path.basename(f), 6);
      if (data && Array.isArray(data.categories) && Array.isArray(data.tasks)) {
        if (f !== file) log('load: recovered from', path.basename(f));
        backupOnce(data);
        return { status: 'ok', data };
      }
    } catch { /* try the next candidate */ }
  }
  log('load: data file exists but could not be read');
  return { status: 'error' };
}

// One rolling backup per app start, plus one per day kept for a week.
let backedUp = false;
function backupOnce(data) {
  if (backedUp) return;
  backedUp = true;
  try {
    const text = JSON.stringify(data, null, 2);
    writeFileSafe(userFile('tasknest.bak.json'), text);
    const dir = userFile('backups');
    fs.mkdirSync(dir, { recursive: true });
    const day = new Date().toISOString().slice(0, 10);
    fs.writeFileSync(path.join(dir, `tasknest-${day}.json`), text);
    fs.readdirSync(dir).filter((n) => n.startsWith('tasknest-')).sort().slice(0, -7)
      .forEach((n) => fs.unlinkSync(path.join(dir, n)));
  } catch (err) { log('backup failed:', err.message); }
}

let lastData = null;
function saveData(data) {
  if (!data || !Array.isArray(data.categories) || !Array.isArray(data.tasks)) { log('save: rejected invalid data'); return false; }
  lastData = data;
  try { writeJSON(DATA, data); return true; } catch { return false; }
}

let prefs = readJSON('window.json', {});
// v2: widgets sit behind other apps by default (the pin opts back into always-on-top)
const savePrefs = () => writeJSON('window.json', prefs);
if (!prefs.v2) { prefs.pinned = false; prefs.v2 = true; app.whenReady().then(savePrefs); }

// ---------- auto start ----------
function loginOpts() {
  // In dev (npm start) Windows must launch electron.exe with this folder as the argument.
  return app.isPackaged ? {} : { path: process.execPath, args: [path.resolve(__dirname)] };
}
function getAutoStart() {
  return app.getLoginItemSettings(loginOpts()).openAtLogin;
}
function setAutoStart(on) {
  app.setLoginItemSettings({ ...loginOpts(), openAtLogin: on });
  prefs.autoStart = on;
  prefs.autoStartExe = process.execPath;
  savePrefs();
  buildTrayMenu();
}

// ---------- icon (drawn in code so there are no binary assets) ----------
function appIcon(size) {
  const img = nativeImage.createFromPath(path.join(__dirname, 'build', 'icon.png'));
  return img.isEmpty() ? makeIcon(size) : img.resize({ width: size, height: size, quality: 'best' });
}

function makeIcon(size = 32) {
  const buf = Buffer.alloc(size * size * 4);
  const c = size / 2;
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const i = (y * size + x) * 4;
      const d = Math.hypot(x + 0.5 - c, y + 0.5 - c);
      let r = 0, g = 0, b = 0, a = 0;
      if (d < c - 0.5) { r = 0xF4; g = 0xF1; b = 0xE8; a = 255; } // cream disc
      // two leaves: ellipses rotated ±40°
      const leaf = (cx, cy, ang) => {
        const dx = x + 0.5 - cx, dy = y + 0.5 - cy;
        const rx = dx * Math.cos(ang) + dy * Math.sin(ang);
        const ry = -dx * Math.sin(ang) + dy * Math.cos(ang);
        return (rx * rx) / ((size * 0.2) ** 2) + (ry * ry) / ((size * 0.11) ** 2) < 1;
      };
      const stem = Math.abs(x + 0.5 - c) < size * 0.045 && y > size * 0.45 && y < size * 0.8;
      if (leaf(c - size * 0.15, size * 0.42, 0.6) || leaf(c + size * 0.15, size * 0.38, -0.6) || stem) {
        r = 0x5D; g = 0xA2; b = 0x71; a = 255;
      }
      buf[i] = b; buf[i + 1] = g; buf[i + 2] = r; buf[i + 3] = a; // BGRA
    }
  }
  return nativeImage.createFromBitmap(buf, { width: size, height: size });
}

// ---------- window ----------
function workAreaFor(bounds) {
  return screen.getDisplayMatching(bounds).workArea;
}

function createWindow() {
  const wa = screen.getPrimaryDisplay().workArea;
  fullHeight = Math.min(860, wa.height - MARGIN * 2);

  let x = wa.x + wa.width - COLLAPSED_W - MARGIN + 10;
  let y = wa.y + MARGIN;
  if (prefs.bounds) {
    // only restore if still on a connected screen
    const onScreen = screen.getAllDisplays().some((d) => {
      const a = d.workArea;
      return prefs.bounds.x >= a.x - 50 && prefs.bounds.x < a.x + a.width - 50 &&
             prefs.bounds.y >= a.y - 50 && prefs.bounds.y < a.y + a.height - 50;
    });
    if (onScreen) ({ x, y } = prefs.bounds);
    const a = screen.getDisplayMatching({ x, y, width: COLLAPSED_W, height: fullHeight }).workArea;
    y = Math.max(a.y, Math.min(y, a.y + a.height - fullHeight));
  }

  win = new BrowserWindow({
    x, y,
    width: COLLAPSED_W,
    height: fullHeight,
    frame: false,
    transparent: true,
    resizable: false,
    maximizable: false,
    fullscreenable: false,
    skipTaskbar: true,
    hasShadow: false,
    alwaysOnTop: !!prefs.pinned,
    show: false,
    icon: appIcon(256),
    title: 'Task Nest',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  win.loadFile(path.join(__dirname, 'src', 'index.html'));
  win.once('ready-to-show', () => win.show());

  // If the bridge to the main process failed to load, reload instead of running without saving.
  let reloads = 0;
  win.webContents.on('preload-error', (_e, p, err) => log('preload error:', p, err && err.message));
  win.webContents.on('render-process-gone', (_e, d) => { log('renderer gone:', d.reason); if (!app.isQuitting) win.reload(); });
  win.webContents.on('did-finish-load', async () => {
    const ok = await win.webContents.executeJavaScript('!!window.nest').catch(() => false);
    if (!ok) {
      log('bridge missing after load, reload #' + (reloads + 1));
      if (reloads++ < 5) setTimeout(() => win.reload(), 400 * reloads);
    }
  });
  win.on('session-end', () => { log('windows session ending'); if (lastData) saveData(lastData); });

  win.on('moved', () => {
    const b = win.getBounds();
    // always remember the position of the *collapsed* window
    const cx = expanded && expandSide === 'left' ? b.x + (EXPANDED_W - COLLAPSED_W) : b.x;
    prefs.bounds = { x: cx, y: b.y };
    savePrefs();
  });

  win.on('close', (e) => {
    if (!app.isQuitting) { e.preventDefault(); win.hide(); }
  });
}

function setBounds(b) {
  win.setResizable(true);
  win.setBounds(b);
  win.setResizable(false);
}

function toggleShow() {
  if (!win) return;
  if (win.isVisible() && win.isFocused()) win.hide();
  else { win.show(); win.focus(); }
}

// ---------- tray ----------
function buildTrayMenu() {
  if (!tray) return;
  tray.setContextMenu(Menu.buildFromTemplate([
    { label: 'Show Task Nest', click: () => { win.show(); win.focus(); } },
    { label: 'Hide', click: () => win.hide() },
    { type: 'separator' },
    { label: 'Start with Windows', type: 'checkbox', checked: getAutoStart(), click: (m) => setAutoStart(m.checked) },
    { label: 'Always on top', type: 'checkbox', checked: !!prefs.pinned, click: (m) => setPinned(m.checked) },
    { label: 'Reset position', click: resetPosition },
    { type: 'separator' },
    { label: 'Quit', click: () => { app.isQuitting = true; app.quit(); } },
  ]));
}

function setPinned(on) {
  prefs.pinned = on;
  savePrefs();
  win.setAlwaysOnTop(on);
  win.webContents.send('pinned-changed', on);
  buildTrayMenu();
}

function resetPosition() {
  const wa = screen.getPrimaryDisplay().workArea;
  const w = win.getBounds().width;
  setBounds({ x: wa.x + wa.width - w - MARGIN + 10, y: wa.y + MARGIN, width: w, height: win.getBounds().height });
  expandSide = 'left';
  win.emit('moved');
  win.show();
}

// ---------- IPC ----------
ipcMain.handle('data:load', () => loadData());
ipcMain.on('data:save', (_e, data) => saveData(data));
ipcMain.on('data:save-sync', (e, data) => { e.returnValue = saveData(data); });
ipcMain.on('app:open-data', () => shell.openPath(app.getPath('userData')));

ipcMain.handle('win:expand-side', () => {
  const b = win.getBounds();
  const wa = workAreaFor(b);
  return b.x + EXPANDED_W <= wa.x + wa.width ? 'right' : 'left';
});

ipcMain.handle('win:set-expanded', (_e, on) => {
  const b = win.getBounds();
  // update state *before* resizing so a 'moved' event during setBounds saves the right position
  if (on && !expanded) {
    const wa = workAreaFor(b);
    expandSide = b.x + EXPANDED_W <= wa.x + wa.width ? 'right' : 'left';
    expanded = true;
    const x = expandSide === 'left' ? b.x - (EXPANDED_W - COLLAPSED_W) : b.x;
    setBounds({ x, y: b.y, width: EXPANDED_W, height: b.height });
  } else if (!on && expanded) {
    expanded = false;
    const x = expandSide === 'left' ? b.x + (EXPANDED_W - COLLAPSED_W) : b.x;
    setBounds({ x, y: b.y, width: COLLAPSED_W, height: b.height });
  }
  return expandSide;
});

ipcMain.handle('win:set-mini', (_e, on) => {
  mini = on;
  const b = win.getBounds();
  let y = b.y;
  if (!on) {
    // growing back to full height: keep it on screen
    const wa = workAreaFor(b);
    y = Math.max(wa.y, Math.min(y, wa.y + wa.height - fullHeight));
  }
  setBounds({ x: b.x, y, width: b.width, height: on ? MINI_H : fullHeight });
  return mini;
});

ipcMain.on('win:hide', () => win.hide());
ipcMain.handle('win:toggle-pin', () => { setPinned(!prefs.pinned); return prefs.pinned; });
ipcMain.handle('win:get-pin', () => !!prefs.pinned);
ipcMain.handle('app:get-autostart', () => getAutoStart());
ipcMain.handle('app:set-autostart', (_e, on) => { setAutoStart(on); return getAutoStart(); });
ipcMain.on('app:quit', () => { app.isQuitting = true; app.quit(); });

// ---------- lifecycle ----------
if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on('second-instance', () => { if (win) { win.show(); win.focus(); } });

  app.whenReady().then(() => {
    app.setAppUserModelId('com.tasknest.widget');

    log('start', app.getVersion(), app.isPackaged ? 'installed' : 'dev', process.execPath);

    // first launch: turn on "start with Windows" (can be switched off from the tray / menu)
    if (!prefs.autoStartInit) {
      prefs.autoStartInit = true;
      setAutoStart(true);
    } else if (prefs.autoStart !== false && prefs.autoStartExe !== process.execPath && app.isPackaged) {
      // moved from the dev copy to the installed app: point start-up at this exe
      setAutoStart(true);
    }

    createWindow();

    tray = new Tray(appIcon(32));
    tray.setToolTip('Task Nest');
    tray.on('click', toggleShow);
    buildTrayMenu();

    globalShortcut.register('Alt+Shift+T', toggleShow);
  });

  app.on('before-quit', () => { app.isQuitting = true; if (lastData) saveData(lastData); });
  app.on('will-quit', () => globalShortcut.unregisterAll());
  app.on('window-all-closed', (e) => e.preventDefault());
}
