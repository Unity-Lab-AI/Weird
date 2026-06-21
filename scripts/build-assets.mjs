// scripts/build-assets.mjs — generate the STATIC DEFAULT ASSET SET (tier-2 fallback + template).
//
// Walks every asset in js/assets/catalog.js, composes the styled prompt (shared STYLE BLOCK +
// the asset's own catalog prompt) with its deterministic per-asset seed, fires Pollinations, and
// writes the result to assets/<plural>/<id>/cover.png — exactly where loader.js resolves it.
// Pure Node (no browser): Pollinations is a GET-URL-returns-an-image service.
//
// This is the curate-and-commit step: generate → eyeball the pngs → re-roll misses → commit the
// winners. The committed cover.png set is BOTH the offline/static-host fallback AND the visual
// template/example each procedural (asset-gen.js) render aims to match. Style law: docs/ASSET-STYLE-BIBLE.md.
//
// Usage:
//   node scripts/build-assets.mjs                 # all 102 assets
//   node scripts/build-assets.mjs item            # one category (location|item|dungeon|room|facility)
//   node scripts/build-assets.mjs item pipe       # one asset (re-roll a single miss)
//   DELAY_MS=1500 node scripts/build-assets.mjs    # throttle between requests (default 1200ms)

import { mkdirSync, writeFileSync, existsSync, readFileSync } from 'node:fs';
import { join, resolve, dirname } from 'node:path';

const PROJECT_DIR = resolve(import.meta.dirname, '..');
const DELAY_MS = parseInt(process.env.DELAY_MS || '1200', 10);
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

// --- Pollinations key (optional) from js/env.local.js → use the authed endpoint when present. ---
function readPollyKey() {
  const f = join(PROJECT_DIR, 'js', 'env.local.js');
  if (!existsSync(f)) return '';
  const m = readFileSync(f, 'utf8').match(/POLLINATIONS_API_KEY:\s*['"]([^'"]+)['"]/);
  return m ? m[1] : '';
}
const KEY = readPollyKey();
const ENDPOINT_AUTH = 'https://gen.pollinations.ai/image/';
const ENDPOINT_FREE = 'https://image.pollinations.ai/prompt/';
const MODEL = 'flux';

function buildUrl(prompt, seed) {
  const params = new URLSearchParams({
    model: MODEL, width: '768', height: '768', nologo: 'true', seed: String(seed),
    safe: 'false', referrer: 'dungeon-master-the-hunt'
  });
  if (KEY) { params.set('key', KEY); return `${ENDPOINT_AUTH}${encodeURIComponent(prompt).slice(0, 1800)}?${params}`; }
  return `${ENDPOINT_FREE}${encodeURIComponent(prompt).slice(0, 1800)}?${params}`;
}

function folderFor(category, id) {
  const plural = { location: 'locations', item: 'items', dungeon: 'dungeons', room: 'rooms', facility: 'facilities' }[category] || category;
  return join(PROJECT_DIR, 'assets', plural, id);
}

const sleep = (ms) => new Promise(r => setTimeout(r, ms));

(async () => {
  console.log(`Pollinations: ${KEY ? 'authed (' + KEY.slice(0, 5) + '…)' : 'anonymous free endpoint'} · delay ${DELAY_MS}ms`);
  const cats = catFilter ? [catFilter] : ['location', 'item', 'dungeon', 'room', 'facility'];
  let ok = 0, fail = 0, skipped = 0;

  for (const category of cats) {
    const all = DMTHAssets.getAll(category) || [];
    const list = idFilter ? all.filter(a => a.id === idFilter) : all;
    for (const entry of list) {
      const basePrompt = DMTHAssetGen.buildAssetPrompt(category, entry.id);
      const prompt = EXTRA ? `${basePrompt}, ${EXTRA}` : basePrompt;
      const seed = (DMTHAssetGen.assetSeed(category, entry.id) + SEED_SALT * 7919) >>> 0 & 0x7FFFFFFF;
      const url = buildUrl(prompt, seed);
      const dir = folderFor(category, entry.id);
      const out = join(dir, 'cover.png');
      try {
        const res = await fetch(url);
        if (!res.ok) { console.warn(`  ✗ ${category}/${entry.id} — HTTP ${res.status}`); fail++; await sleep(DELAY_MS); continue; }
        const buf = Buffer.from(await res.arrayBuffer());
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
