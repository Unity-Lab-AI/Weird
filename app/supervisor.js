// Supervisor: starts the local servers the game talks to (Ollama, image, voice-in) as hidden-console children of
// the app, waits on their health endpoints, and kills the whole process tree when the window closes.
// A server already listening on its port (the visitor's own Ollama, a repo launcher) is adopted, not duplicated.
'use strict';
const { spawn, execSync } = require('node:child_process');
const fs = require('node:fs');
const net = require('node:net');
const path = require('node:path');
const http = require('node:http');
const { resolve } = require('./paths');

const PORTS = { ollama: 11434, image: 7860, voice: 7861 };

function get(url, timeoutMs = 2000) {
  return new Promise(done => {
    const req = http.get(url, { timeout: timeoutMs }, res => { res.resume(); res.on('end', () => done(res.statusCode)); });
    req.on('error', () => done(null));
    req.on('timeout', () => { req.destroy(); done(null); });
  });
}

function listening(port) {
  return new Promise(done => {
    const s = net.connect({ port, host: '127.0.0.1' });
    s.once('connect', () => { s.destroy(); done(true); });
    s.once('error', () => done(false));
    s.setTimeout(800, () => { s.destroy(); done(false); });
  });
}

class Supervisor {
  /** @param {string} root  repo root (dev) or resources folder (packaged) */
  constructor(root, log = console.log) {
    this.root = root;
    this.log = log;
    this.children = new Map();
    const P = resolve(root);
    this.paths = P;
    const py = P.pythonExe || process.env.DMTH_PYTHON || 'python';
    const pyEnv = { HF_HOME: P.hf, HF_HUB_DISABLE_SYMLINKS: '1', HF_HUB_DISABLE_SYMLINKS_WARNING: '1', PYTHONUNBUFFERED: '1' };
    this.services = [
      ...(P.ollamaExe ? [{
        name: 'ollama', port: PORTS.ollama, health: `http://127.0.0.1:${PORTS.ollama}/api/tags`,
        cmd: P.ollamaExe, args: ['serve'], cwd: P.DATA,
        // the browser calls Ollama directly, so it must allow the game's origin
        env: {
          OLLAMA_ORIGINS: '*', OLLAMA_HOST: `127.0.0.1:${PORTS.ollama}`, OLLAMA_KEEP_ALIVE: '30m',
          ...(P.ollamaModels ? { OLLAMA_MODELS: P.ollamaModels } : {}),
        },
      }] : []),
      ...(P.pythonExe || process.env.DMTH_PYTHON ? [
        {
          name: 'image', port: PORTS.image, health: `http://127.0.0.1:${PORTS.image}/sdapi/v1/options`,
          cmd: py, args: ['-u', path.join(P.servicesDir, 'image-server', 'sd_server.py')], cwd: P.DATA,
          env: { ...pyEnv, SD_MODELS: P.models, SD_PORT: String(PORTS.image) },
        },
        {
          name: 'voice', port: PORTS.voice, health: `http://127.0.0.1:${PORTS.voice}/state`,
          cmd: py, args: ['-u', path.join(P.servicesDir, 'voice-server', 'voice_server.py')], cwd: P.DATA,
          env: { ...pyEnv, STT_MODEL: path.join(P.models, 'whisper-small'), VOICE_PORT: String(PORTS.voice) },
        },
      ] : []),
    ];
  }

  /** Start every service. Resolves once Ollama is answering (or gave up); image and voice keep loading in the
   *  background and report through onStatus, because the game is fully playable as text while they warm up. */
  async start(onStatus = () => {}) {
    this.logDir = path.join(this.paths.DATA, 'logs');
    fs.mkdirSync(this.logDir, { recursive: true });
    this.onStatus = onStatus;
    for (const s of this.services) {
      if (await listening(s.port)) {
        this.log(`${s.name}: already running on :${s.port}, adopting`);
        onStatus(s.name, 'adopted');
        continue;
      }
      this.spawnService(s);
    }
    const watch = async s => {
      const t0 = Date.now();
      while (!this.stopping && Date.now() - t0 < 600000) {
        if ((await get(s.health, 3000)) === 200) {
          onStatus(s.name, 'ready');
          this.log(`${s.name}: ready in ${((Date.now() - t0) / 1000).toFixed(1)}s`);
          return true;
        }
        if (!this.children.has(s.name) && !(await listening(s.port))) { onStatus(s.name, 'failed'); return false; }
        await new Promise(r => setTimeout(r, 800));
      }
      return false;
    };
    const watchers = this.services.map(s => ({ s, p: watch(s) }));
    const ollama = watchers.find(w => w.s.name === 'ollama');
    if (ollama) await Promise.race([ollama.p, new Promise(r => setTimeout(r, 45000))]);
  }

  /** Start one server. One that exits while the app runs is started again; a crash loop backs off and gives up. */
  spawnService(s) {
    const out = fs.openSync(path.join(this.logDir, `${s.name}.log`), 'a');
    const child = spawn(s.cmd, s.args, {
      cwd: s.cwd || this.root, env: { ...process.env, ...(s.env || {}) },
      stdio: ['ignore', out, out], windowsHide: true,
    });
    child.on('error', e => {
      this.log(`${s.name}: spawn failed ${e.message}`);
      this.onStatus(s.name, 'failed');
      this.children.delete(s.name);
    });
    child.on('exit', code => {
      this.log(`${s.name} exited ${code}`);
      this.onStatus(s.name, `exited ${code}`);
      if (this.children.get(s.name) === child) this.children.delete(s.name);
      if (this.stopping) return;
      const now = Date.now();
      s.exits = (s.exits || []).filter(t => now - t < 120000).concat(now);
      if (s.exits.length > 5) { this.log(`${s.name}: exited ${s.exits.length} times in 2 min, not restarting`); return; }
      setTimeout(() => {
        if (!this.stopping && !this.children.has(s.name)) { this.log(`${s.name}: restarting`); this.spawnService(s); }
      }, 1500);
    });
    this.children.set(s.name, child);
    this.onStatus(s.name, 'starting');
    this.log(`${s.name}: spawned pid ${child.pid}`);
  }

  stop() {
    this.stopping = true;
    for (const [name, child] of this.children) {
      try {
        if (process.platform === 'win32') execSync(`taskkill /PID ${child.pid} /T /F`, { stdio: 'ignore', windowsHide: true });
        else child.kill('SIGTERM');
        this.log(`${name}: stopped`);
      } catch (e) { this.log(`${name}: stop failed ${e.message}`); }
    }
    this.children.clear();
  }
}

module.exports = { Supervisor, PORTS };
