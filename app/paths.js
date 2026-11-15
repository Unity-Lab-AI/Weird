// Where everything the game runs on lives. One data folder: installed, it is <install folder>\data (the updater
// and uninstaller spare it unless asked); a dev checkout keeps it under %LOCALAPPDATA%\DungeonMasterTheHunt.
// Every lookup falls back to the repo / system locations, so a machine that already has Python, Ollama and a
// checkpoint set up for the repo launchers works unchanged.
'use strict';
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const exists = p => { try { return !!p && fs.existsSync(p); } catch { return false; } };

const LOCAL = process.env.LOCALAPPDATA || path.join(os.homedir(), 'AppData', 'Local');
const INSTALLED = path.basename(process.execPath).toLowerCase() === 'dungeonmasterthehunt.exe';
const DATA = process.env.DMTH_DATA
  || (INSTALLED ? path.join(path.dirname(process.execPath), 'data') : path.join(LOCAL, 'DungeonMasterTheHunt'));
const RUNTIME = path.join(DATA, 'runtime');

function freeBytes(dir) {
  let d = path.resolve(dir);
  while (!exists(d) && path.dirname(d) !== d) d = path.dirname(d);
  try { const s = fs.statfsSync(d); return s.bavail * s.bsize; } catch { return null; }
}

/** @param {string} root  repo root (dev) or the packaged app's resources folder */
function resolve(root) {
  const packaged = exists(path.join(root, 'game', 'index.html'));
  const gameDir = packaged ? path.join(root, 'game') : root;
  const pythonExe = [path.join(RUNTIME, 'python', 'python.exe'), process.env.DMTH_PYTHON].find(exists) || null;
  const ollamaExe = [
    path.join(RUNTIME, 'ollama', 'ollama.exe'),
    path.join(LOCAL, 'Programs', 'Ollama', 'ollama.exe'),
    'C:\Program Files\Ollama\ollama.exe',
  ].find(exists) || null;
  const models = exists(path.join(DATA, 'models')) ? path.join(DATA, 'models') : path.join(root, 'models');
  const ollamaModels = exists(path.join(DATA, 'ollama-models')) ? path.join(DATA, 'ollama-models') : null;
  const checkpoint = exists(models)
    ? fs.readdirSync(models).find(f => /\.(safetensors|ckpt)$/i.test(f)) || null : null;
  return {
    DATA, RUNTIME, gameDir, pythonExe, ollamaExe, models, ollamaModels,
    servicesDir: path.join(root, 'local-services'),
    hf: path.join(DATA, 'hf'),
    have: {
      checkpoint: !!checkpoint,
      listener: exists(path.join(models, 'whisper-small', 'model.bin')),
    },
  };
}

module.exports = { DATA, RUNTIME, INSTALLED, resolve, exists, freeBytes };
