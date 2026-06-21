// DUNGEON MASTER: THE HUNT — tiny helper to insert an asset image into the DOM with emoji fallback.
// Used by shop / town / dungeon / dispose views to auto-show dropped-in cover.png images.

(function () {
  'use strict';

  // Insert an <img> into the given target that tries the asset folder's cover candidates.
  // Falls back to nothing (caller handles the emoji rendering already).
  // Usage: DMTHAssetImg.lazyInto(element, 'item', 'pipe', 80)
  async function lazyInto(target, category, id, sizePx = 80) {
    if (!target) return;
    try {
      const url = await window.DMTHAssetLoader.resolveImageUrl(category, id);
      if (url) {
        const img = document.createElement('img');
        img.src = url;
        img.alt = id;
        img.className = 'asset-img';
        img.style.width  = sizePx + 'px';
        img.style.height = sizePx + 'px';
        img.style.objectFit = 'cover';
        img.style.borderRadius = '6px';
        target.innerHTML = '';
        target.appendChild(img);
      }
    } catch {}
  }

  // Batch-decorate all [data-asset-category] [data-asset-id] targets in a container.
  function decorate(container, sizePx = 80) {
    if (!container) return;
    container.querySelectorAll('[data-asset-category][data-asset-id]').forEach(el => {
      const cat = el.dataset.assetCategory;
      const id  = el.dataset.assetId;
      if (!cat || !id) return;
      // Click any asset slot (emoji placeholder OR its generated image) → click-away popup that
      // shows it big, generating it live on the spot if it hasn't been generated yet this run.
      if (!el.dataset.assetClickBound) {
        el.dataset.assetClickBound = '1';
        el.style.cursor = 'pointer';
        if (!el.title) el.title = 'click to view / generate image';
        el.addEventListener('click', (ev) => {
          ev.preventDefault();
          ev.stopPropagation();   // the image is its own action — don't fire the parent card's nav
          if (window.DMTHAssetPopup) window.DMTHAssetPopup.show(cat, id);
        });
      }
      lazyInto(el, cat, id, parseInt(el.dataset.assetSize, 10) || sizePx);
    });
  }

  window.DMTHAssetImg = Object.freeze({ lazyInto, decorate });
})();
