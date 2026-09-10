// DUNGEON MASTER: THE HUNT — procedural game-asset image engine (DORMANT / opt-in).
//
// Generates cohesive game-asset images (location cards, item icons, dungeon/room/facility art)
// on demand from a SHARED STYLE BLOCK + each asset's own catalog prompt + a DETERMINISTIC
// per-asset seed, so the whole set reads like one artist made it and the SAME asset always
// renders consistently. Reuses the local SD pipeline already exported by imaging.js
// (renderImage + promptHash) + the IDB cache.
//
// This module is the procedural source — the DEFAULT live image path (tier-1) in the chain:
//   1. procedural (THIS — default ON; generated on-acquire + on-click, stacked in the gallery)
//   2. static default cover.png  (assets/<plural>/<id>/cover.png — the FALLBACK when gen fails)
//   3. emoji                     (catalog emoji placeholder)
//
// Default ON: each asset generates its own image per playthrough (warmed on acquire, or on the
// first click of its emoji), caches the blob, and stacks into the playthrough asset gallery.
// Disable with localStorage.dmth_procedural_assets === 'false'. Full style law: docs/ASSET-STYLE-BIBLE.md.

(function () {
  'use strict';

  // The cohesion spine — append to EVERY asset subject prompt. Mirrors docs/ASSET-STYLE-BIBLE.md;
  // if this changes, re-run scripts/build-assets.mjs to regenerate the static default set for cohesion.
  const STYLE_BLOCK = 'dark grimy dungeon-noir aesthetic, 35mm film grain, low-key cinematic lighting, ' +
    'deep shadows, desaturated muted base palette of black charcoal and oxblood, lit by sickly accents of ' +
    'blood-red neon-pink and bruise-purple, wet sheen, oppressive moody atmosphere, high detail, ' +
    'painterly-realistic, centered square framing, no people, no text, no watermark, no logo, no border';

  const OPT_IN_KEY = 'dmth_procedural_assets';

  // Default ON: procedural generation drives the live game; static cover.png is the fallback.
  // Disable explicitly with localStorage.dmth_procedural_assets === 'false'.
  function isEnabled() {
    try { return localStorage.getItem(OPT_IN_KEY) !== 'false'; } catch (e) { return true; }
  }

  // Deterministic per-asset seed (djb2 of "category/id") — same asset → same seed → same render.
  function assetSeed(category, id) {
    const s = `${category}/${id}`;
    let h = 5381;
    for (let i = 0; i < s.length; i++) h = ((h << 5) + h) + s.charCodeAt(i);
    return (h >>> 0) & 0x7FFFFFFF;
  }

  // Compose the full styled prompt: the asset's own subject prompt + the shared style block.
  // Subject comes from the catalog (getPrompt); falls back to the displayName if no prompt.
  function buildAssetPrompt(category, id) {
    const subject = (window.DMTHAssets && window.DMTHAssets.getPrompt)
      ? (window.DMTHAssets.getPrompt(category, id) || '')
      : '';
    const entry = (window.DMTHAssets && window.DMTHAssets.getById) ? window.DMTHAssets.getById(category, id) : null;
    const base = subject || (entry ? entry.displayName : id);
    return `${base}, ${STYLE_BLOCK}`;
  }

  // Cache key for a generated asset image (separate namespace from per-girl images).
  function cacheKey(category, id) {
    const hashFn = window.DMTHGame && window.DMTHGame.imaging && window.DMTHGame.imaging.promptHash;
    const sig = hashFn ? hashFn(buildAssetPrompt(category, id)) : `${category}_${id}`;
    return `asset:${category}:${id}:${sig}`;
  }

  // Generate (or pull cached) a procedural image URL for one asset. Returns a usable URL string
  // or null (caller falls through to the static/emoji tiers). Uses imaging.renderImage which
  // POSTs to the local SD server and returns a blob URL directly. When the server is down
  // there is no cross-origin URL to fall back to — the caller falls through to static/emoji.
  async function generateAssetImage(category, id, opts = {}) {
    if (!isEnabled() && !opts.force) return null;
    const imaging = window.DMTHGame && window.DMTHGame.imaging;
    const store = window.DMTHStorage && window.DMTHStorage.cache;
    if (!imaging || !imaging.renderImage) return null;
    const key = cacheKey(category, id);

    // Cache hit — rebuild a live blob URL from the stored Blob (a persisted blobUrl dies on reload).
    if (store && !opts.force) {
      try {
        const cached = await store.get(key);
        if (cached) {
          const live = cached.blob ? URL.createObjectURL(cached.blob) : cached.blobUrl;
          if (live) return live;
        }
      } catch (e) { /* cache miss is fine */ }
    }

    const prompt = buildAssetPrompt(category, id);
    const seed = assetSeed(category, id);
    // Local SD render — returns { blob, url, error }. On failure the caller falls through
    // to the static default tier; nothing else to try (no cross-origin URL fallback exists).
    const attempt = await imaging.renderImage(prompt, seed, { width: 768, height: 768 });
    if (!attempt.blob) return null;
    const objUrl = attempt.url;
    if (store) { try { await store.put(key, { category, id, prompt, seed, blob: attempt.blob, blobUrl: objUrl, createdAt: 0 }); } catch (e) { /* non-fatal */ } }
    // Stack this FRESH generation into the playthrough asset gallery (complete history). Only on
    // a real generation — cache hits above already recorded theirs, so re-shows never duplicate.
    try {
      const meta = (window.DMTHAssets && window.DMTHAssets.getById) ? window.DMTHAssets.getById(category, id) : null;
      window.DMTHGame?.state?.pushAssetGen?.({ category, id, displayName: meta ? meta.displayName : id, url: objUrl, cacheKey: key });
    } catch (e) { /* non-fatal */ }
    return objUrl;
  }

  // Cache-only lookup (NO network) — returns a live blob URL for an already-generated asset, or
  // null. Used by the slot renderer to show a generated image without firing a fresh generation.
  async function getCached(category, id) {
    const store = window.DMTHStorage && window.DMTHStorage.cache;
    if (!store) return null;
    try {
      const cached = await store.get(cacheKey(category, id));
      if (cached) return cached.blob ? URL.createObjectURL(cached.blob) : (cached.blobUrl || null);
    } catch (e) { /* miss */ }
    return null;
  }

  // Fire-and-forget warm — called on acquire (state.addItem/addDungeon/addOwnedLocation). Generates
  // + caches + gallery-stacks in the background. No-op if disabled or already cached.
  function prewarm(category, id) {
    if (!id || !isEnabled()) return;
    try { Promise.resolve(generateAssetImage(category, id)).catch(() => {}); } catch (e) { /* non-fatal */ }
  }

  window.DMTHAssetGen = Object.freeze({
    STYLE_BLOCK,
    OPT_IN_KEY,
    isEnabled,
    assetSeed,
    buildAssetPrompt,
    cacheKey,
    generateAssetImage,
    getCached,
    prewarm
  });
})();
