// DUNGEON MASTER: THE HUNT — asset image popup. Click any asset slot (emoji or its generated
// image) and this pops the image up BIG over a dark backdrop you dismiss with a click ANYWHERE.
//
// On open it shows the image if it's already generated (cache), otherwise it fires a live
// procedural generation (asset-gen.js) — every fresh generation stacks into the playthrough
// asset gallery. If generation fails it falls back to the committed static cover.png, then to the
// emoji. Modeled on the loot-popup's click-away pattern.

(function () {
  'use strict';

  let overlay = null;

  function close() { if (overlay) { overlay.remove(); overlay = null; } }

  function escapeHtml(s) {
    return String(s == null ? '' : s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  }

  async function show(category, id) {
    const meta = (window.DMTHAssets && window.DMTHAssets.getById) ? window.DMTHAssets.getById(category, id) : null;
    const name = meta ? meta.displayName : id;
    const emoji = (meta && meta.emoji) || '🖼️';

    close();
    overlay = document.createElement('div');
    overlay.className = 'asset-popup-overlay';
    overlay.style.cssText = 'position:fixed;inset:0;z-index:9997;display:flex;align-items:center;justify-content:center;background:rgba(0,0,0,.85);cursor:pointer;padding:24px;';
    overlay.innerHTML = `
      <figure class="asset-popup-card" style="margin:0;max-width:min(92vw,640px);text-align:center;">
        <div class="asset-popup-img" style="min-height:180px;display:flex;flex-direction:column;align-items:center;justify-content:center;">
          <div style="font-size:2.4rem;opacity:.85;">${emoji}</div>
          <div style="font-size:.82rem;margin-top:8px;color:#caa;">generating…</div>
        </div>
        <figcaption style="margin-top:12px;color:#e6b8d8;font-weight:600;">${escapeHtml(name)}</figcaption>
        <div style="font-size:.74rem;color:#998;margin-top:4px;font-style:italic;">click anywhere to dismiss</div>
      </figure>`;
    // Any click anywhere (backdrop OR card) dismisses — no close button, exactly like loot-popup.
    overlay.addEventListener('click', close);
    document.body.appendChild(overlay);
    const slot = overlay.querySelector('.asset-popup-img');

    const gen = window.DMTHAssetGen;
    let url = null;

    // 1) already-generated this playthrough → show instantly from cache.
    try { if (gen && gen.getCached) url = await gen.getCached(category, id); } catch (e) { /* miss */ }

    // 2) not generated yet → fire a live generation (it caches + stacks into the gallery).
    if (!url && gen && gen.generateAssetImage && (!gen.isEnabled || gen.isEnabled())) {
      try { url = await gen.generateAssetImage(category, id); } catch (e) { /* fall through to static */ }
    }

    // 3) generation failed / disabled → committed static cover.png fallback.
    if (!url && window.DMTHAssetLoader && window.DMTHAssetLoader.resolveImageUrl) {
      try { url = await window.DMTHAssetLoader.resolveImageUrl(category, id); } catch (e) { /* none */ }
    }

    if (!overlay) return;   // user dismissed while it was generating

    if (url) {
      // refresh the loader's memo so the inline slot thumbnail updates on the next render.
      try { if (window.DMTHAssetLoader && window.DMTHAssetLoader.invalidate) window.DMTHAssetLoader.invalidate(category, id); } catch (e) {}
      const img = document.createElement('img');
      img.src = url;
      img.alt = name;
      img.style.cssText = 'max-width:100%;max-height:78vh;border-radius:10px;display:block;box-shadow:0 16px 60px rgba(0,0,0,.7);';
      img.onerror = () => { slot.innerHTML = `<div style="font-size:3rem">${emoji}</div>`; };
      slot.innerHTML = '';
      slot.appendChild(img);
    } else {
      slot.innerHTML = `<div style="font-size:3rem">${emoji}</div><div style="font-size:.82rem;color:#caa;margin-top:8px;">no image yet — generation unavailable</div>`;
    }
  }

  window.DMTHAssetPopup = Object.freeze({ show });
})();
