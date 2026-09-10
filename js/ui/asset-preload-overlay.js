// DUNGEON MASTER: THE HUNT — asset preload overlay.
// Fullscreen modal used by the new-game flow while the SD server bakes the
// starter asset set. Shows a progress bar, the current asset's name, and a
// live preview thumbnail of each finished render, plus a Skip button that
// aborts the loop and falls the game back to emoji/static tiers.
//
// Usage:
//   const result = await window.DMTHAssetPreloadOverlay.show({
//     list,      // [{category, id}] to render
//     title,     // headline (default: "Baking asset images")
//     subtitle   // subhead (default: "Fresh render per playthrough.")
//   });
//   // result: { completed: bool, skipped: bool, rendered: number, failed: number }

(function () {
  'use strict';

  function ensureStyles() {
    if (document.getElementById('dmth-asset-preload-styles')) return;
    const style = document.createElement('style');
    style.id = 'dmth-asset-preload-styles';
    style.textContent = `
      .dmth-preload-overlay {
        position: fixed; inset: 0; z-index: 9998;
        background: rgba(0,0,0,0.92);
        display: flex; align-items: center; justify-content: center;
        padding: 24px;
        color: #eee2f2; font-family: system-ui, -apple-system, sans-serif;
      }
      .dmth-preload-card {
        max-width: 560px; width: 100%;
        background: #1a1018;
        border: 1px solid #ff3d8a; border-radius: 12px;
        padding: 24px;
        box-shadow: 0 12px 48px rgba(255,61,138,0.18);
      }
      .dmth-preload-card h2 {
        margin: 0 0 6px 0; color: #ff3d8a;
        font-size: 1.3rem; letter-spacing: 0.02em;
      }
      .dmth-preload-card .dmth-preload-subtitle {
        font-size: 0.9rem; opacity: 0.75; margin-bottom: 18px;
      }
      .dmth-preload-preview {
        width: 100%; aspect-ratio: 1 / 1;
        background: #0e0810; border: 1px solid #2a1828;
        border-radius: 8px; overflow: hidden;
        display: flex; align-items: center; justify-content: center;
        margin-bottom: 14px;
      }
      .dmth-preload-preview img { width: 100%; height: 100%; object-fit: cover; display: block; }
      .dmth-preload-preview .dmth-preload-placeholder {
        color: #6a4a5a; font-size: 0.85rem;
      }
      .dmth-preload-bar-wrap {
        height: 14px; background: #2a1828; border-radius: 7px;
        overflow: hidden; border: 1px solid #3a2438;
      }
      .dmth-preload-bar-fill {
        height: 100%;
        background: linear-gradient(90deg, #ff3d8a, #d94872);
        width: 0%; transition: width 0.25s ease-out;
      }
      .dmth-preload-status {
        font-size: 0.85rem; opacity: 0.85; margin-top: 8px;
        font-family: ui-monospace, Menlo, monospace;
      }
      .dmth-preload-buttons {
        margin-top: 16px; display: flex; gap: 10px; justify-content: flex-end;
      }
      .dmth-preload-buttons button {
        padding: 8px 14px; font-size: 0.9rem; font-weight: 600;
        border-radius: 6px; border: 1px solid #ff3d8a;
        background: transparent; color: #eee2f2;
        cursor: pointer;
        transition: background 0.15s;
      }
      .dmth-preload-buttons button:hover { background: rgba(255,61,138,0.14); }
    `;
    document.head.appendChild(style);
  }

  async function show({ list, title, subtitle } = {}) {
    ensureStyles();
    const total = Array.isArray(list) ? list.length : 0;
    if (!total || !window.DMTHAssetPreload) {
      return { completed: true, skipped: false, rendered: 0, failed: 0 };
    }

    const abortSignal = { aborted: false };
    const overlay = document.createElement('div');
    overlay.className = 'dmth-preload-overlay';
    overlay.innerHTML = `
      <div class="dmth-preload-card">
        <h2>${title || 'Baking asset images'}</h2>
        <div class="dmth-preload-subtitle">${subtitle || 'Fresh render per playthrough. Sit tight.'}</div>
        <div class="dmth-preload-preview"><div class="dmth-preload-placeholder">warming up the GPU…</div></div>
        <div class="dmth-preload-bar-wrap"><div class="dmth-preload-bar-fill"></div></div>
        <div class="dmth-preload-status">0 / ${total}</div>
        <div class="dmth-preload-buttons">
          <button class="dmth-preload-skip">Skip (use emoji fallbacks)</button>
        </div>
      </div>`;
    document.body.appendChild(overlay);

    const previewSlot = overlay.querySelector('.dmth-preload-preview');
    const barFill     = overlay.querySelector('.dmth-preload-bar-fill');
    const statusEl    = overlay.querySelector('.dmth-preload-status');
    const skipBtn     = overlay.querySelector('.dmth-preload-skip');
    skipBtn.onclick = () => { abortSignal.aborted = true; };

    let rendered = 0, failed = 0;
    await window.DMTHAssetPreload.preloadAll(list, {
      abortSignal,
      onProgress: ({ done, total, displayName, url, error }) => {
        if (url) rendered++;
        else failed++;
        const pct = Math.round((done / total) * 100);
        barFill.style.width = pct + '%';
        statusEl.textContent = `${done} / ${total} · ${displayName || ''}${error ? ' (failed — falling back)' : ''}`;
        if (url) {
          previewSlot.innerHTML = `<img src="${url}" alt="${displayName || ''}" />`;
        }
      }
    });

    overlay.remove();
    const skipped = abortSignal.aborted;
    return { completed: !skipped, skipped, rendered, failed };
  }

  window.DMTHAssetPreloadOverlay = Object.freeze({ show });
})();
