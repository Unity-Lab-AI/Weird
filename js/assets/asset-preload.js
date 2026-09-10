// DUNGEON MASTER: THE HUNT — asset preload orchestrator.
// Bulk-renders a list of {category, id} assets sequentially through the shared
// SD queue and reports progress. Used by the new-game flow so the starter kit
// bakes with a visible progress bar BEFORE the game entry point — otherwise
// Unity's portrait sits queued behind on-boot prewarm renders and never shows.
//
// Fresh set per playthrough: wipeAssetCache() nukes the asset-namespace cache
// entries before the render loop, so a new game rerolls the whole set.

(function () {
  'use strict';

  // Starter set — the exact list of assets the player will encounter within a
  // few seconds of pressing Start. Pure function; consult after bootstrap.newGame
  // has seeded state, or synthesize from opts via bootstrap.starterAssets.
  function starterListFromState(state) {
    const s = state || (window.DMTHGame?.state?.current) || {};
    const list = [];
    for (const d of (s.dungeons || [])) {
      if (d && d.templateId) list.push({ category: 'dungeon', id: d.templateId });
    }
    for (const [itemId, qty] of Object.entries(s.inventory || {})) {
      if (qty > 0) list.push({ category: 'item', id: itemId });
    }
    for (const locId of (s.ownedLocations || [])) {
      list.push({ category: 'location', id: locId });
    }
    return dedupe(list);
  }

  function fullCatalogList() {
    const A = window.DMTHAssets;
    if (!A) return [];
    const list = [];
    for (const it of (A.LOCATIONS  || [])) list.push({ category: 'location',  id: it.id });
    for (const it of (A.ITEMS      || [])) list.push({ category: 'item',      id: it.id });
    for (const it of (A.DUNGEONS   || [])) list.push({ category: 'dungeon',   id: it.id });
    for (const it of (A.ROOMS      || [])) list.push({ category: 'room',      id: it.id });
    for (const it of (A.FACILITIES || [])) list.push({ category: 'facility',  id: it.id });
    return dedupe(list);
  }

  function dedupe(list) {
    const seen = new Set();
    return list.filter(({ category, id }) => {
      const k = category + ':' + id;
      if (seen.has(k)) return false;
      seen.add(k);
      return !!id;
    });
  }

  // Clear every asset-namespace entry from the shared cache store so a fresh
  // playthrough re-renders. Iterates the cache values (each asset entry carries
  // {category, id}) and deletes by reconstructed key. Girl portrait / room-scene
  // entries are left alone (no {category, id} shape).
  async function wipeAssetCache() {
    const cache = window.DMTHStorage?.cache;
    const gen = window.DMTHAssetGen;
    if (!cache || !gen || !gen.cacheKey) return 0;
    let entries = [];
    try { entries = await cache.getAll(); } catch (e) { return 0; }
    let deleted = 0;
    for (const entry of entries) {
      if (entry && entry.category && entry.id) {
        const key = gen.cacheKey(entry.category, entry.id);
        try { await window.DMTHStorage.del('cache', key); deleted++; } catch (e) { /* non-fatal */ }
      }
    }
    return deleted;
  }

  // Sequential preload. Each render awaits the local SD queue. onProgress fires
  // AFTER each attempt with { done, total, category, id, displayName, url, error }.
  // Set abortSignal.aborted = true from the UI to cut the loop short (skip button).
  //
  // Sets DMTHAssetGen.setPreloadInFlight(true) so on-boot prewarm() calls no-op
  // during the loop — otherwise state.addItem/addDungeon's fire-and-forget prewarms
  // race the preload loop and burn double renders on the same assets.
  async function preloadAll(list, opts = {}) {
    const { onProgress, abortSignal } = opts;
    const gen = window.DMTHAssetGen;
    const A = window.DMTHAssets;
    if (!gen || !gen.generateAssetImage || !Array.isArray(list) || !list.length) return;
    if (gen.setPreloadInFlight) gen.setPreloadInFlight(true);
    try {
      const total = list.length;
      let done = 0;
      for (const { category, id } of list) {
        if (abortSignal && abortSignal.aborted) break;
        let url = null, error = null;
        try {
          url = await gen.generateAssetImage(category, id);   // cache-hit friendly; no force
        } catch (err) { error = (err && err.message) || String(err); }
        done++;
        const meta = A && A.getById ? A.getById(category, id) : null;
        const displayName = (meta && meta.displayName) || id;
        if (typeof onProgress === 'function') {
          try { onProgress({ done, total, category, id, displayName, url, error }); } catch (e) { /* non-fatal */ }
        }
      }
    } finally {
      if (gen.setPreloadInFlight) gen.setPreloadInFlight(false);
    }
  }

  window.DMTHAssetPreload = Object.freeze({
    starterListFromState,
    fullCatalogList,
    wipeAssetCache,
    preloadAll
  });
})();
