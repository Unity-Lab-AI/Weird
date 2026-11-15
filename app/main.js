// Desktop shell for DUNGEON MASTER: THE HUNT. Opens -> (first run: installs what the game needs) -> starts the local
// servers -> the game fills the window. Closes -> every server it started is shut down with it.
'use strict';
const { app, BrowserWindow, Menu, ipcMain, dialog, shell } = require('electron');
const path = require('node:path');
const fs = require('node:fs');
const http = require('node:http');
const { Supervisor } = require('./supervisor');
const setup = require('./setup');
const { resolve, INSTALLED } = require('./paths');

const DEV = !app.isPackaged;
const ROOT = DEV ? path.join(__dirname, '..') : process.resourcesPath;
const GAME_PORT = 9535;

let win = null;
let sup = null;
let gameServer = null;
let gameUrl = null;
const status = {};

if (!app.requestSingleInstanceLock()) { app.quit(); }
app.on('second-instance', () => { if (win) { if (win.isMinimized()) win.restore(); win.focus(); } });

function log(...a) {
  console.log(new Date().toISOString().slice(11, 19), ...a);
  if (win && !win.isDestroyed()) win.webContents.send('dmth:log', a.join(' '));
}

// ---- static server for the game files --------------------------------------------------------------------------
// The game is plain static files that need a real http origin (modules, fetch, IndexedDB), so the app serves them
// itself on loopback instead of needing Python, Node or a browser.
const MIME = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8', '.svg': 'image/svg+xml',
  '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp', '.gif': 'image/gif',
  '.ico': 'image/x-icon', '.woff': 'font/woff', '.woff2': 'font/woff2', '.txt': 'text/plain; charset=utf-8',
  '.wasm': 'application/wasm', '.md': 'text/markdown; charset=utf-8',
};

function startGameServer(dir) {
  const base = path.resolve(dir);
  const srv = http.createServer((req, res) => {
    let rel;
    try { rel = decodeURIComponent(new URL(req.url, 'http://x').pathname); } catch { res.writeHead(400); return res.end(); }
    if (rel.endsWith('/')) rel += 'index.html';
    const file = path.resolve(base, '.' + rel);
    if (file !== base && !file.startsWith(base + path.sep)) { res.writeHead(403); return res.end(); }
    fs.readFile(file, (err, buf) => {
      if (err) { res.writeHead(404); return res.end('not found'); }
      res.writeHead(200, {
        'Content-Type': MIME[path.extname(file).toLowerCase()] || 'application/octet-stream',
        'Cache-Control': 'no-store',
      });
      res.end(buf);
    });
  });
  return new Promise(resolvePromise => {
    const bind = port => {
      srv.once('error', () => bind(0));            // 9535 taken: let the OS pick a free port
      srv.listen(port, '127.0.0.1', () => resolvePromise({ srv, port: srv.address().port }));
    };
    bind(GAME_PORT);
  });
}

// ---- window ----------------------------------------------------------------------------------------------------
function createWindow() {
  win = new BrowserWindow({
    width: 1360, height: 900, minWidth: 900, minHeight: 600,
    backgroundColor: '#0b0b0f', title: 'Dungeon Master: The Hunt',
    autoHideMenuBar: true, show: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'), contextIsolation: true, nodeIntegration: false,
      backgroundThrottling: false, spellcheck: false,
    },
  });
  // links to other sites open in the visitor's own browser; the game's own pages stay in the window
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:/i.test(url) && gameUrl && !url.startsWith(gameUrl)) { shell.openExternal(url); return { action: 'deny' }; }
    return { action: 'allow' };
  });
  // microphone for voice-in, without a prompt: it is the visitor's own app on their own machine
  win.webContents.session.setPermissionRequestHandler((_wc, permission, cb) => cb(['media', 'clipboard-read', 'notifications'].includes(permission)));
  win.once('ready-to-show', () => { win.show(); win.focus(); });
  win.on('closed', () => { win = null; });
}

function bootHtml() {
  return `<!doctype html><meta charset="utf-8"><title>Dungeon Master: The Hunt</title>
  <style>body{margin:0;background:#0b0b0f;color:#e8e6f0;font:15px system-ui;display:flex;align-items:center;justify-content:center;height:100vh}
  .box{width:460px}h1{font-size:14px;letter-spacing:.14em;text-transform:uppercase;color:#8c8aa0;margin:0 0 14px}
  .row{display:flex;justify-content:space-between;padding:6px 0;border-bottom:1px solid #262633}.ok{color:#39d98a}.bad{color:#ff5c5c}.wait{color:#8c8aa0}
  pre{font:11px ui-monospace,monospace;color:#8c8aa0;max-height:160px;overflow:auto;white-space:pre-wrap}</style>
  <div class="box"><h1>Dungeon Master: The Hunt - starting up</h1><div id="rows"></div><pre id="log"></pre></div>
  <script>
  const rows=document.getElementById('rows');
  for(const n of ['ollama','image','voice']){rows.insertAdjacentHTML('beforeend','<div class="row"><span>'+n+'</span><span id="s-'+n+'" class="wait">waiting</span></div>')}
  window.dmthApp.onStatus((n,s)=>{const e=document.getElementById('s-'+n);if(!e)return;e.textContent=s;e.className=s==='ready'||s==='adopted'?'ok':(s.startsWith('exited')||s==='failed'?'bad':'wait')});
  window.dmthApp.onLog(l=>{const p=document.getElementById('log');p.textContent=(l+'\\n'+p.textContent).slice(0,4000)});
  </script>`;
}

async function boot() {
  await win.loadURL('data:text/html;charset=utf-8,' + encodeURIComponent(bootHtml()));
  if (!sup) sup = new Supervisor(ROOT, log);
  await sup.start((name, s) => { status[name] = s; if (win && !win.isDestroyed()) win.webContents.send('dmth:status', name, s); });
  if (win && !win.isDestroyed()) await win.loadURL(`${gameUrl}index.html`);
}

async function showSetupOrBoot() {
  const need = await setup.missing(ROOT);
  if (need.length) {
    log(`first run: missing ${need.map(s => s.id).join(', ')}`);
    await win.loadFile(path.join(__dirname, 'setup.html'));
    return;
  }
  await boot();
}

app.whenReady().then(async () => {
  const { srv, port } = await startGameServer(resolve(ROOT).gameDir);
  gameServer = srv;
  gameUrl = `http://127.0.0.1:${port}/`;
  createWindow();
  buildMenu();
  await showSetupOrBoot();
});

let down = false;
function shutdown() {
  if (down) return;
  down = true;
  try { sup && sup.stop(); } catch { /* already stopped */ }
  try { gameServer && gameServer.close(); } catch { /* already closed */ }
}
app.on('window-all-closed', () => { shutdown(); app.quit(); });
app.on('before-quit', shutdown);
process.on('SIGINT', () => { shutdown(); process.exit(0); });
process.on('SIGTERM', () => { shutdown(); process.exit(0); });

/** The same sweep the installer uses: stops anything still running from the install folder (orphaned model
 *  runners, servers that outlived their parent) so the GPU is free and the folder can be updated or removed. */
function sweep() {
  if (!INSTALLED) return Promise.resolve();
  return new Promise(res => {
    try {
      const ps1 = path.join(require('node:os').tmpdir(), `dmth-stop-${process.pid}.ps1`);
      fs.writeFileSync(ps1, fs.readFileSync(path.join(__dirname, 'installer-stop.ps1')));
      require('node:child_process').execFile('powershell.exe',
        ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-WindowStyle', 'Hidden', '-File', ps1, '-Dir', path.dirname(process.execPath)],
        { windowsHide: true, timeout: 60000 }, () => { try { fs.rmSync(ps1, { force: true }); } catch { /* temp file */ } res(); });
    } catch (e) { log(`stop sweep: ${e.message}`); res(); }
  });
}

async function shutDownEverything() {
  log('shutdown: stopping every server and freeing the GPU');
  shutdown();
  await sweep();
  app.quit();
}

async function purgeComponents() {
  const r = await dialog.showMessageBox(win, {
    type: 'warning', buttons: ['Remove everything', 'Cancel'], defaultId: 1, cancelId: 1,
    title: 'Remove downloaded components',
    message: 'Remove everything this app downloaded for itself?',
    detail: `${setup.DATA}\n\nPython runtime, image model, chat model, speech model, logs, generated images. Your saved games live in the app window's storage and are not touched. The app will close; the next launch downloads everything again.`,
  });
  if (r.response !== 0) return false;
  shutdown();
  await sweep();
  const ok = setup.uninstallData();
  await dialog.showMessageBox(win, { type: 'info', message: ok ? 'Downloaded components removed.' : 'Some files were still in use and could not be removed. Close everything and try again.' });
  app.quit();
  return ok;
}

function buildMenu() {
  Menu.setApplicationMenu(Menu.buildFromTemplate([
    {
      label: 'App', submenu: [
        { label: 'Check / repair components', click: () => { win.loadFile(path.join(__dirname, 'setup.html')); } },
        { label: 'Open data folder', click: () => shell.openPath(setup.DATA) },
        { label: 'Open logs folder', click: () => shell.openPath(path.join(setup.DATA, 'logs')) },
        { type: 'separator' },
        { label: 'Shut down everything and quit', click: () => shutDownEverything() },
        { label: 'Remove downloaded components...', click: () => purgeComponents() },
        { type: 'separator' },
        { role: 'quit' },
      ],
    },
    {
      label: 'View', submenu: [
        { role: 'reload' }, { role: 'forceReload' }, { role: 'toggleDevTools' },
        { type: 'separator' }, { role: 'resetZoom' }, { role: 'zoomIn' }, { role: 'zoomOut' }, { role: 'togglefullscreen' },
      ],
    },
  ]));
}

// ---- IPC for the setup screen ----------------------------------------------------------------------------------
// What this PC has, for the requirements check on the setup screen.
function systemInfo() {
  const os = require('node:os');
  const out = { os: `${os.type()} ${os.release()}`, ramBytes: os.totalmem(), gpus: [] };
  return new Promise(res => {
    require('node:child_process').execFile('nvidia-smi', ['--query-gpu=name,memory.total', '--format=csv,noheader,nounits'],
      { windowsHide: true, timeout: 8000 }, (err, stdout) => {
        if (!err) {
          out.gpus = String(stdout).split(/\r?\n/).map(l => l.trim()).filter(Boolean).map(l => {
            const [name, mb] = l.split(',').map(x => x.trim());
            return { name, vramMB: Number(mb) || 0 };
          });
        }
        res(out);
      });
  });
}

ipcMain.handle('dmth:system', () => systemInfo());
ipcMain.handle('dmth:status', () => status);
ipcMain.handle('dmth:setup:plan', async () => ({
  data: setup.DATA, free: setup.freeBytes(setup.DATA),
  steps: await Promise.all(setup.plan(ROOT).map(async s => ({ id: s.id, title: s.title, gb: s.gb, done: !!(await s.done()) }))),
}));
ipcMain.handle('dmth:setup:start', async () => {
  try {
    await setup.install(ROOT, ev => { if (win && !win.isDestroyed()) win.webContents.send('dmth:setup:event', ev); });
  } catch (e) {
    log('setup failed:', e.message);
    return { ok: false, error: String(e.message || e) };
  }
  await boot();
  return { ok: true };
});
ipcMain.handle('dmth:purge', () => purgeComponents());
ipcMain.handle('dmth:quit', () => app.quit());
