// scripts/build-assets.mjs — generate the STATIC DEFAULT ASSET SET (tier-2 fallback + template).
//
// Walks every asset in js/assets/catalog.js, composes the styled prompt (shared STYLE BLOCK +
// the asset's own catalog prompt) with its deterministic per-asset seed, renders it on the local Stable Diffusion server, and
// writes the result to assets/<plural>/<id>/cover.png — exactly where loader.js resolves it.
// Pure Node (no browser): POSTs to the local SD server (scripts/start_image_gen must be running).
//
// This is the curate-and-commit step: generate → eyeball the pngs → re-roll misses → commit the
// winners. The committed cover.png set is BOTH the offline/static-host fallback AND the visual
// template/example each procedural (asset-gen.js) render aims to match. Style law: docs/ASSET-STYLE-BIBLE.md.
//
// Usage:
//   node scripts/build-assets.mjs                 # all 102 assets
//   node scripts/build-assets.mjs item            # one category (location|item|dungeon|room|facility)
//   node scripts/build-assets.mjs item pipe       # one asset (re-roll a single miss)
//   DELAY_MS=500 node scripts/build-assets.mjs     # pause between requests (default 200ms)
//   LOCAL_IMAGE_ENDPOINT=http://127.0.0.1:7860     # override the server address

import { mkdirSync, writeFileSync, existsSync, readFileSync } from 'node:fs';
import { join, resolve, dirname } from 'node:path';

const PROJECT_DIR = resolve(import.meta.dirname, '..');
const DELAY_MS = parseInt(process.env.DELAY_MS || '200', 10);
const [catFilter, idFilter] = process.argv.slice(2);

// Curation re-roll knobs (the static default set is one-time-curated, so determinism doesn't
// matter for it — only getting a good frame does):
//   SEED_SALT=<n>  offsets the deterministic per-asset seed so a miss re-rolls to a fresh frame.
//   EXTRA="..."    appends extra prompt text (e.g. a lighting boost) to rescue too-dark misses
//                  whose small object got swallowed by the low-key STYLE_BLOCK shadows.
const SEED_SALT = parseInt(process.env.SEED_SALT || '0', 10);
const EXTRA = (process.env.EXTRA || '').trim();

// --- Load the browser catalog + asset-gen into a window shim so we reuse the SAME prompt/seed logic. ---
globalThis.window = globalThis.window || globalThis;
function evalBrowserModule(relPath) {
  const txt = readFileSync(join(PROJECT_DIR, relPath), 'utf8');
  // eslint-disable-next-line no-new-func
  new Function(txt)();
}
evalBrowserModule('js/assets/catalog.js');     // → window.DMTHAssets
evalBrowserModule('js/assets/asset-gen.js');   // → window.DMTHAssetGen (buildAssetPrompt + assetSeed are node-safe)

const DMTHAssets = window.DMTHAssets;
const DMTHAssetGen = window.DMTHAssetGen;
if (!DMTHAssets || !DMTHAssetGen) { console.error('failed to load catalog / asset-gen'); process.exit(1); }

// --- Local Stable Diffusion server (same API the game uses, see js/config.js LOCAL_IMAGE). ---
const ENDPOINT = process.env.LOCAL_IMAGE_ENDPOINT || 'http://127.0.0.1:7860';
const NEGATIVE = 'blurry, lowres, bad anatomy, bad hands, extra fingers, deformed, watermark, text, jpeg artifacts, worst quality';

async function renderPng(prompt, seed) {
  const res = await fetch(`${ENDPOINT}/sdapi/v1/txt2img`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      prompt: prompt.slice(0, 1500), negative_prompt: NEGATIVE,
      steps: 24, width: 768, height: 768, cfg_scale: 7.0, seed
    })
  });
  if (!res.ok) return { error: `HTTP ${res.status}` };
  const j = await res.json().catch(() => ({}));
  const b64 = (j.images || [])[0];
  return b64 ? { buf: Buffer.from(b64, 'base64') } : { error: 'no image in response' };
}

function folderFor(category, id) {
  const plural = { location: 'locations', item: 'items', dungeon: 'dungeons', room: 'rooms', facility: 'facilities' }[category] || category;
  return join(PROJECT_DIR, 'assets', plural, id);
}

const sleep = (ms) => new Promise(r => setTimeout(r, ms));

(async () => {
  console.log(`Local image server: ${ENDPOINT} · delay ${DELAY_MS}ms`);
  const cats = catFilter ? [catFilter] : ['location', 'item', 'dungeon', 'room', 'facility'];
  let ok = 0, fail = 0, skipped = 0;

  for (const category of cats) {
    const all = DMTHAssets.getAll(category) || [];
    const list = idFilter ? all.filter(a => a.id === idFilter) : all;
    for (const entry of list) {
      const basePrompt = DMTHAssetGen.buildAssetPrompt(category, entry.id);
      const prompt = EXTRA ? `${basePrompt}, ${EXTRA}` : basePrompt;
      const seed = (DMTHAssetGen.assetSeed(category, entry.id) + SEED_SALT * 7919) >>> 0 & 0x7FFFFFFF;
      const dir = folderFor(category, entry.id);
      const out = join(dir, 'cover.png');
      try {
        const r = await renderPng(prompt, seed);
        if (r.error) { console.warn(`  ✗ ${category}/${entry.id} — ${r.error}`); fail++; await sleep(DELAY_MS); continue; }
        const buf = r.buf;
        if (buf.length < 500) { console.warn(`  ✗ ${category}/${entry.id} — empty/placeholder body`); fail++; await sleep(DELAY_MS); continue; }
        mkdirSync(dirname(out), { recursive: true });
        writeFileSync(out, buf);
        console.log(`  ✓ ${category}/${entry.id} → assets/${folderFor(category, entry.id).split(/[\\/]assets[\\/]/)[1].replace(/\\/g, '/')}/cover.png (${(buf.length / 1024).toFixed(0)}kb)`);
        ok++;
      } catch (e) {
        console.warn(`  ✗ ${category}/${entry.id} — ${e.message}`); fail++;
      }
      await sleep(DELAY_MS);
    }
  }
  console.log(`\nDone — ${ok} written, ${fail} failed, ${skipped} skipped. Eyeball assets/**/cover.png, re-roll misses, commit the keepers.`);
})();
