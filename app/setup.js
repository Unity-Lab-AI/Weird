// First-run installer: everything the game runs on, into one folder that can be removed in one go.
//
// Steps (each skipped when already satisfied, so a machine already set up for the repo launchers is complete):
//   python    Python 3.11 runtime (python-build-standalone, includes pip)     -> DATA/runtime/python
//   base      torch (CUDA 11.8) + local-services/requirements.txt             -> into that runtime
//   ollama    Ollama server binaries (portable zip, no tray app, no service)  -> DATA/runtime/ollama
//   image     RealVisXL V5.0 fp16 checkpoint (SD 1.5 model as a fallback)     -> DATA/models
//   listener  faster-whisper small speech-to-text model                       -> DATA/models/whisper-small
//   brain     dolphin-mistral:7b chat model                                   -> DATA/ollama-models
//   memory    nomic-embed-text embedding model (conversation memory)          -> DATA/ollama-models
// Nothing touches the registry or PATH; the uninstaller (and the in-app button) removes DATA whole.
'use strict';
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const http = require('node:http');
const https = require('node:https');
const { spawn, execSync } = require('node:child_process');
const { DATA, RUNTIME, resolve, exists, freeBytes } = require('./paths');

const DL = path.join(DATA, 'downloads');
const TORCH = ['torch==2.7.1', '--index-url', 'https://download.pytorch.org/whl/cu118'];
const PYTHON_TAG = '20261110';       // python-build-standalone release the runtime is taken from
const CHAT_MODEL = 'dolphin-mistral:7b';
const EMBED_MODEL = 'nomic-embed-text';
const SETUP_PORT = 11436;            // temporary Ollama server used only while pulling models
const CHECKPOINT = {
  file: 'RealVisXL_V5.0_fp16.safetensors',
  url: 'https://huggingface.co/SG161222/RealVisXL_V5.0/resolve/main/RealVisXL_V5.0_fp16.safetensors',
};
const CHECKPOINT_FALLBACK = {
  file: 'realistic-vision-v51.safetensors',
  url: 'https://huggingface.co/SG161222/Realistic_Vision_V5.1_noVAE/resolve/main/Realistic_Vision_V5.1_fp16-no-ema.safetensors',
};
const tar = 'C:\\Windows\\System32\\tar.exe';   // bsdtar ships with Windows 10+: reads .tar.gz and .zip
const UA = { 'User-Agent': 'dmth-setup' };

function fmt(n) { return n > 1e9 ? (n / 1e9).toFixed(2) + ' GB' : (n / 1e6).toFixed(0) + ' MB'; }

function fetchJson(url) {
  return new Promise((res, rej) => {
    https.get(url, { headers: { ...UA, Accept: 'application/vnd.github+json' } }, r => {
      if ([301, 302, 307, 308].includes(r.statusCode)) return fetchJson(new URL(r.headers.location, url).href).then(res, rej);
      let b = ''; r.on('data', d => b += d);
      r.on('end', () => { try { res(JSON.parse(b)); } catch (e) { rej(e); } });
    }).on('error', rej);
  });
}

/** Download to dest, resuming a partial file and following redirects. onProgress(got, total). */
function download(url, dest, onProgress = () => {}) {
  return new Promise((res, rej) => {
    const part = dest + '.part';
    const have = exists(part) ? fs.statSync(part).size : 0;
    const headers = { ...UA, ...(have ? { Range: `bytes=${have}-` } : {}) };
    https.get(url, { headers }, r => {
      if ([301, 302, 307, 308].includes(r.statusCode)) {
        r.resume();
        return download(new URL(r.headers.location, url).href, dest, onProgress).then(res, rej);
      }
      if (r.statusCode === 416) { r.resume(); fs.renameSync(part, dest); return res(dest); }   // already complete
      if (r.statusCode !== 200 && r.statusCode !== 206) { r.resume(); return rej(new Error(`${url}: HTTP ${r.statusCode}`)); }
      const resumed = r.statusCode === 206;
      const base = resumed ? have : 0;
      const total = base + Number(r.headers['content-length'] || 0);
      let got = base, last = 0;
      const f = fs.createWriteStream(part, { flags: resumed ? 'a' : 'w' });
      r.on('data', d => { got += d.length; if (Date.now() - last > 500) { last = Date.now(); onProgress(got, total); } });
      r.pipe(f);
      f.on('finish', () => f.close(() => {
        if (total && got < total) return rej(new Error('download ended early; run setup again to resume'));
        fs.renameSync(part, dest);
        onProgress(total, total);
        res(dest);
      }));
      f.on('error', rej);
      r.on('error', rej);
    }).on('error', rej);
  });
}

/** Run a child with a hidden console, streaming its lines to `log`. Resolves on exit 0. */
function run(cmd, args, { env = {}, cwd, log = () => {} } = {}) {
  return new Promise((res, rej) => {
    const c = spawn(cmd, args, { cwd, env: { ...process.env, ...env }, stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true });
    let tail = '';
    const onData = d => {
      const s = d.toString();
      tail = (tail + s).slice(-2000);
      for (const l of s.split(/\r?\n/)) if (l.trim()) log(l.trimEnd());
    };
    c.stdout.on('data', onData);
    c.stderr.on('data', onData);
    c.on('error', rej);
    c.on('exit', code => code === 0 ? res() : rej(new Error(`${path.basename(cmd)} ${args.slice(0, 3).join(' ')} exited ${code}\n${tail}`)));
  });
}

// `tag` pins a specific release; without it the repo's latest release is used. The Python runtime is pinned
// because the rolling "latest" release drops interpreter versions as they reach end of life.
async function ghAsset(repo, test, tag) {
  const rel = await fetchJson(`https://api.github.com/repos/${repo}/releases/${tag ? 'tags/' + tag : 'latest'}`);
  const a = (rel.assets || []).find(x => test(x.name));
  if (!a) throw new Error(`no matching asset in ${repo} ${rel.tag_name}`);
  return { url: a.browser_download_url, name: a.name, tag: rel.tag_name };
}

const PROBE_IMPORTS = ['torch', 'diffusers', 'transformers', 'accelerate', 'safetensors', 'faster_whisper', 'numpy'];
function probe(pyExe, mods) {
  return run(pyExe, ['-c', mods.map(m => `import ${m}`).join('; ')]).then(() => true, () => false);
}

/** Does an Ollama on `port` list `name`? */
function tagsHave(port, name) {
  const want = name.includes(':') ? name : `${name}:latest`;
  return new Promise(res => {
    const req = http.get(`http://127.0.0.1:${port}/api/tags`, { timeout: 800 }, r => {
      let b = '';
      r.on('data', d => b += d);
      r.on('end', () => { try { res((JSON.parse(b).models || []).some(m => m.name === want)); } catch { res(false); } });
    });
    req.on('error', () => res(false));
    req.on('timeout', () => { req.destroy(); res(false); });
  });
}

/** Is `name` already in an Ollama model store on disk (either manifest layout)? */
function manifestHas(P, name) {
  const [base, tag = 'latest'] = name.split(':');
  const stores = [P.ollamaModels, path.join(os.homedir(), '.ollama', 'models')].filter(Boolean);
  return stores.some(s => ['manifests/registry.ollama.ai/library', 'manifests-v2/ollama.com/library']
    .some(rel => exists(path.join(s, rel, base, tag))));
}

/** Run fn with a temporary Ollama server (own port, models kept under DATA) and always stop it. */
async function withTempOllama(P, fn) {
  const exe = P.ollamaExe;
  const store = P.ollamaModels || (exe.startsWith(RUNTIME) ? path.join(DATA, 'ollama-models') : null);
  if (store) fs.mkdirSync(store, { recursive: true });
  const env = { OLLAMA_HOST: `127.0.0.1:${SETUP_PORT}`, ...(store ? { OLLAMA_MODELS: store } : {}) };
  const srv = spawn(exe, ['serve'], { env: { ...process.env, ...env }, stdio: 'ignore', windowsHide: true });
  try {
    await new Promise(r => setTimeout(r, 2500));
    await fn(exe, env);
  } finally {
    try { execSync(`taskkill /PID ${srv.pid} /T /F`, { stdio: 'ignore', windowsHide: true }); } catch { /* already gone */ }
  }
}

/** The steps, against a repo/resources root. Each `done` is a capability check. */
function plan(root) {
  const P = () => resolve(root);
  const py = () => P().pythonExe;
  const dlDir = () => { fs.mkdirSync(DL, { recursive: true }); return DL; };
  const pull = model => async log => {
    await withTempOllama(P(), async (exe, env) => {
      log(`pulling ${model}`);
      await run(exe, ['pull', model], { log, env });
    });
  };
  return [
    {
      gb: 0.1, id: 'python', title: 'Python 3.11 runtime',
      done: () => !!py(),
      async run(log, progress) {
        const a = await ghAsset('astral-sh/python-build-standalone',
          n => /^cpython-3\.11\.\d+\+\d+-x86_64-pc-windows-msvc-install_only\.tar\.gz$/.test(n), PYTHON_TAG);
        log(`downloading ${a.name} (${a.tag})`);
        const f = path.join(dlDir(), a.name);
        if (!exists(f)) await download(a.url, f, progress);
        fs.mkdirSync(RUNTIME, { recursive: true });
        await run(tar, ['-xzf', f, '-C', RUNTIME], { log });
        if (!exists(path.join(RUNTIME, 'python', 'python.exe'))) throw new Error('python.exe not found after extract');
      },
    },
    {
      gb: 6, id: 'base', title: 'PyTorch (CUDA 11.8), diffusers and faster-whisper',
      // a real probe: every library the image and voice servers import must load in that interpreter
      done: async () => !!py() && await probe(py(), PROBE_IMPORTS),
      async run(log) {
        const p = py();
        await run(p, ['-m', 'pip', 'install', '--upgrade', 'pip', 'wheel'], { log });
        if (!(await probe(p, ['torch']))) await run(p, ['-m', 'pip', 'install', ...TORCH], { log });
        await run(p, ['-m', 'pip', 'install', '-r', path.join(P().servicesDir, 'requirements.txt')], { log });
      },
    },
    {
      gb: 1.5, id: 'ollama', title: "Ollama server (the chat model's runtime)",
      done: () => !!P().ollamaExe,
      async run(log, progress) {
        const a = await ghAsset('ollama/ollama', n => n === 'ollama-windows-amd64.zip');
        log(`downloading ${a.name} (${a.tag})`);
        const f = path.join(dlDir(), `ollama-${a.tag}.zip`);
        if (!exists(f)) await download(a.url, f, progress);
        const dest = path.join(RUNTIME, 'ollama');
        fs.mkdirSync(dest, { recursive: true });
        await run(tar, ['-xf', f, '-C', dest], { log });
        if (!exists(path.join(dest, 'ollama.exe'))) throw new Error('ollama.exe not found after extract');
      },
    },
    {
      gb: 6.9, id: 'image', title: 'Image model (RealVisXL V5.0, SDXL)',
      done: () => P().have.checkpoint,
      async run(log, progress) {
        const models = path.join(DATA, 'models');
        fs.mkdirSync(models, { recursive: true });
        for (const c of [CHECKPOINT, CHECKPOINT_FALLBACK]) {
          try {
            log(`downloading ${c.file}`);
            await download(c.url, path.join(models, c.file), progress);
            return;
          } catch (e) {
            log(`${c.file} failed: ${e.message}`);
            if (c === CHECKPOINT_FALLBACK) throw e;
            log('falling back to the smaller SD 1.5 model');
          }
        }
      },
    },
    {
      gb: 0.5, id: 'listener', title: 'Speech-to-text model (faster-whisper small)',
      done: () => P().have.listener,
      async run(log) {
        const dir = path.join(DATA, 'models', 'whisper-small');
        fs.mkdirSync(dir, { recursive: true });
        const code = `from huggingface_hub import snapshot_download; snapshot_download('Systran/faster-whisper-small', local_dir=r'${dir}')`;
        await run(py(), ['-c', code], { log, env: { HF_HOME: P().hf, HF_HUB_DISABLE_SYMLINKS: '1' } });
      },
    },
    {
      gb: 4.1, id: 'brain', title: `Chat model (${CHAT_MODEL})`,
      done: async () => manifestHas(P(), CHAT_MODEL) || (await tagsHave(11434, CHAT_MODEL)),
      run: pull(CHAT_MODEL),
    },
    {
      gb: 0.3, id: 'memory', title: `Memory model (${EMBED_MODEL})`,
      done: async () => manifestHas(P(), EMBED_MODEL) || (await tagsHave(11434, EMBED_MODEL)),
      run: pull(EMBED_MODEL),
    },
  ];
}

async function missing(root) {
  const out = [];
  for (const s of plan(root)) if (!(await s.done())) out.push(s);
  return out;
}

/** Run every unsatisfied step in order. `emit(ev)` gets {step, status, line?, got?, total?}. */
async function install(root, emit = () => {}) {
  fs.mkdirSync(DATA, { recursive: true });
  for (const s of plan(root)) {
    if (await s.done()) { emit({ step: s.id, status: 'done' }); continue; }
    emit({ step: s.id, status: 'running' });
    try {
      await s.run(
        line => emit({ step: s.id, status: 'running', line }),
        (got, total) => emit({ step: s.id, status: 'running', got, total, line: `${fmt(got)} / ${fmt(total)}` }));
      if (!(await s.done())) throw new Error(`${s.title}: finished but still not satisfied`);
      emit({ step: s.id, status: 'done' });
    } catch (e) {
      emit({ step: s.id, status: 'failed', line: String(e.message || e) });
      throw e;
    }
  }
}

/** Remove everything setup put on this machine. The app's own files go with the NSIS uninstaller. */
function uninstallData() {
  if (exists(DATA)) { try { fs.rmSync(DATA, { recursive: true, force: true, maxRetries: 20, retryDelay: 300 }); } catch { /* retry below */ } }
  return !exists(DATA);
}

module.exports = { plan, missing, install, uninstallData, DATA, freeBytes };
