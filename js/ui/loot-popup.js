// DUNGEON MASTER: THE HUNT — loot-gain popup (all loot gains get a popup you can just
// click away from — no close button). A centered card; ANY click anywhere on the screen
// dismisses it. Rapid multiple gains stack their lines into the one open card.

(function () {
  'use strict';

  let overlay = null;

  function ensure() {
    if (overlay && document.body.contains(overlay)) return overlay;
    overlay = document.createElement('div');
    overlay.id = 'loot-popup-overlay';
    overlay.style.cssText = 'position:fixed;inset:0;z-index:9998;display:flex;align-items:center;justify-content:center;background:rgba(0,0,0,.5);cursor:pointer;padding:20px;';
    overlay.innerHTML = '<div style="background:#161018;border:1px solid #6a4a20;border-radius:12px;max-width:440px;width:100%;padding:18px 20px;box-shadow:0 14px 50px rgba(0,0,0,.7);text-align:center;color:#f0d8a0;">'
      + '<div style="font-size:1.1rem;font-weight:700;margin-bottom:8px;color:#ffd87a">🎁 Loot</div>'
      + '<div id="loot-popup-body"></div>'
      + '<div class="small" style="margin-top:12px;color:#998;font-style:italic">click anywhere to dismiss</div>'
      + '</div>';
    // Any click anywhere (backdrop OR card) dismisses — no close button needed.
    overlay.addEventListener('click', () => { if (overlay) { overlay.remove(); overlay = null; } });
    document.body.appendChild(overlay);
    return overlay;
  }

  function show(message) {
    if (!message) return;
    // LOOTPOP-TOGGLE  — the player can silence loot pop-ups (Settings → Interface). The loot
    // itself is already added to inventory BEFORE this call, so silencing just skips the popup —
    // "better to just let it go to inventory without the annoying popups" in end-game.
    try { if (localStorage.getItem('dmth_lootpops_off') === '1') return; } catch (e) { /* storage blocked — show anyway */ }
    try {
      const o = ensure();
      const body = o.querySelector('#loot-popup-body');
      const line = document.createElement('div');
      line.style.cssText = 'margin:5px 0;font-size:0.95rem;line-height:1.4;';
      line.innerHTML = String(message);
      body.appendChild(line);
    } catch (e) { /* fall back to a toast if the DOM isn't ready */ if (window.DMTHNotify) window.DMTHNotify.show(String(message), { type: 'success', durationMs: 5000 }); }
  }

  window.DMTHLootPopup = Object.freeze({ show });
})();
