// DUNGEON MASTER: THE HUNT — Asset Gallery. The complete history of every game-asset image
// generated THIS playthrough (locations / items / dungeons / rooms / facilities), newest first.
// EXPERIENCE-ONLY: it holds ONLY the images actually generated/used in-game — it is NOT pre-filled
// with assets the player hasn't encountered yet. Source: state.assetGallery (asset-gen.js stacks
// every fresh generation). Click a thumbnail for a click-away lightbox. Reuses the
// .gallery-grid / .gallery-lightbox styling from the Spank Bank.

(function () {
  'use strict';

  function escapeHtml(s) {
    return String(s == null ? '' : s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  }

  function render(el) {
    const gallery = (window.DMTHGame.state.getAssetGallery ? window.DMTHGame.state.getAssetGallery() : []).slice().reverse();

    el.innerHTML = `
      <div class="panel">
        <h2>🖼️ Asset Gallery (${gallery.length})</h2>
        <p class="small muted">Every game-asset image you've actually generated this playthrough — locations, items, dungeons, rooms, facilities — stacked newest-first. Only what you've ENCOUNTERED shows here; it's not pre-filled with assets you haven't touched. Click any asset's emoji/tile anywhere in the game to generate + view it; it all collects here. (The committed static cover.png art is the fallback used only when a live generation fails.)</p>
        <div class="btn-row"><a href="#stores" class="btn-small">← Stores</a> <a href="#dashboard" class="btn-small">Dashboard</a></div>
      </div>
      ${gallery.length === 0 ? `
        <div class="panel"><p class="small muted">Nothing generated yet. Acquire an item / dungeon / turf (it warms its image on acquire), or click any asset's emoji to generate it — every image you make stacks here for the whole run.</p></div>
      ` : `
        <div class="panel">
          <div class="gallery-grid">
            ${gallery.map((e, i) => `
              <figure class="gallery-thumb" data-idx="${i}" data-tooltip="${escapeHtml(e.displayName || e.id)} · ${escapeHtml(e.category)} · ${new Date(e.ts).toLocaleString()}">
                <img src="${e.url}" alt="${escapeHtml(e.displayName || e.id)}" loading="lazy" onerror="this.outerHTML='<div class=\\'small muted\\'>(reopen the asset to regenerate)</div>'" />
                <figcaption class="small muted">${escapeHtml(e.displayName || e.id)}<br><span class="small">${escapeHtml(e.category)}</span></figcaption>
              </figure>
            `).join('')}
          </div>
        </div>
      `}

      <div id="asset-lightbox" class="gallery-lightbox" style="display:none">
        <button class="gallery-close" id="asset-lb-close" data-tooltip="Close (Escape)">✕</button>
        <div class="gallery-main">
          <img id="asset-lb-img" alt="" />
          <div class="gallery-meta" id="asset-lb-meta"></div>
        </div>
      </div>
    `;

    if (!gallery.length) return;

    // Stored entry.url is a dead blob: URL after a reload — rebuild a live object URL from the
    // asset cache (DMTHStorage.cache, keyed by the generation's cacheKey) and swap it in.
    const store = window.DMTHStorage && window.DMTHStorage.cache;
    if (store) {
      el.querySelectorAll('.gallery-thumb').forEach(async (thumb) => {
        const e = gallery[Number(thumb.dataset.idx)];
        if (!e || !e.cacheKey) return;
        try {
          const c = await store.get(e.cacheKey);
          if (c && c.blob) { const u = URL.createObjectURL(c.blob); e._live = u; const img = thumb.querySelector('img'); if (img) img.src = u; }
        } catch (err) { /* leave the (likely dead) url; onerror handles it */ }
      });
    }

    const lb = el.querySelector('#asset-lightbox');
    const lbImg = el.querySelector('#asset-lb-img');
    const lbMeta = el.querySelector('#asset-lb-meta');
    function open(i) {
      const e = gallery[i]; if (!e) return;
      lbImg.src = e._live || e.url; lbImg.alt = e.displayName || e.id;
      lbMeta.innerHTML = `<b>${escapeHtml(e.displayName || e.id)}</b> · ${escapeHtml(e.category)} <span class="small muted">· ${new Date(e.ts).toLocaleString()}</span>`;
      lb.style.display = 'flex';
    }
    function hide() { lb.style.display = 'none'; }
    el.querySelectorAll('.gallery-thumb').forEach(t => { t.onclick = () => open(Number(t.dataset.idx)); });
    // Click anywhere on the lightbox dismisses (the ✕ is just an affordance).
    lb.onclick = hide;
    function onKey(ev) { if (lb.style.display !== 'none' && ev.key === 'Escape') hide(); }
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }

  window.DMTHRouter.register('asset-gallery', render);
})();
