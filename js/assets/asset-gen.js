// DUNGEON MASTER: THE HUNT — procedural game-asset image engine (DORMANT / opt-in).
//
// Generates cohesive game-asset images (location cards, item icons, dungeon/room/facility art)
// on demand from a SHARED STYLE BLOCK + each asset's own catalog prompt + a DETERMINISTIC
// per-asset seed, so the whole set reads like one artist made it and the SAME asset always
// renders consistently. Reuses the Pollinations pipeline already exported by imaging.js
// (buildUrl + promptHash) + the IDB cache.
//
// This module is the procedural (tier-1) source in the asset fallback chain:
//   1. procedural (THIS, when localStorage.dmth_procedural_assets === 'true')
//   2. static default cover.png  (assets/<plural>/<id>/cover.png — loader.js)
//   3. emoji                     (catalog emoji)
//
// SAFE BY DEFAULT: opt-in flag is OFF, and nothing calls this yet — loader.js wiring is a
// separate, deliberate step (see docs/TODO.md asset-build section). Loading this file changes
// no live behavior. Full style law: docs/ASSET-STYLE-BIBLE.md.

(function () {
  'use strict';

  // The cohesion spine — append to EVERY asset subject prompt. Mirrors docs/ASSET-STYLE-BIBLE.md;
  // if this changes, re-run scripts/build-assets.mjs to regenerate the static default set for cohesion.
  const STYLE_BLOCK = 'dark grimy dungeon-noir aesthetic, 35mm film grain, low-key cinematic lighting, ' +
    'deep shadows, desaturated muted base palette of black charcoal and oxblood, lit by sickly accents of ' +
    'blood-red neon-pink and bruise-purple, wet sheen, oppressive moody atmosphere, high detail, ' +
    'painterly-realistic, centered square framing, no people, no text, no watermark, no logo, no border';

  const OPT_IN_KEY = 'dmth_procedural_assets';

  // Opt-in: live game stays on the static/emoji chain until the player/operator enables this.
  function isEnabled() {
    try { return localStorage.getItem(OPT_IN_KEY) === 'true'; } catch (e) { return false; }
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
  // or null (caller falls through to the static/emoji tiers). Requires imaging.buildUrl + the cache.
  async function generateAssetImage(category, id, opts = {}) {
    if (!isEnabled() && !opts.force) return null;
    const imaging = window.DMTHGame && window.DMTHGame.imaging;
    const store = window.DMTHStorage && window.DMTHStorage.cache;
    if (!imaging || !imaging.buildUrl) return null;
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
    const url = imaging.buildUrl(prompt, seed, { width: 768, height: 768 });

    // Try to fetch + cache the blob (so a static host / reload reuses it). On any failure return
    // the direct Pollinations URL — it still works as an <img src>.
    try {
      const res = await fetch(url);
      if (!res.ok) return url;
      const blob = await res.blob();
      if (blob.size < 500) return url;            // guard the placeholder error image
      const objUrl = URL.createObjectURL(blob);
      if (store) { try { await store.put(key, { category, id, prompt, seed, blob, blobUrl: objUrl, createdAt: 0 }); } catch (e) { /* non-fatal */ } }
      return objUrl;
    } catch (e) {
      return url;
    }
  }

  window.DMTHAssetGen = Object.freeze({
    STYLE_BLOCK,
    OPT_IN_KEY,
    isEnabled,
    assetSeed,
    buildAssetPrompt,
    cacheKey,
    generateAssetImage
  });
})();
