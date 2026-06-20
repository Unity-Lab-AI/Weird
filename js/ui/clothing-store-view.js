// DUNGEON MASTER: THE HUNT — The Carcass Closet (global clothing store).
// Inventory-first: buy outfits into your shared inventory here, then APPLY them to a captive
// from her wardrobe page. (Per-girl buying still works in the wardrobe view; this is the
// stockpile storefront under the Stores hub.) Reads wardrobe.catalog() + buyToInventory.

(function () {
  'use strict';

  function render(el) {
    const s = window.DMTHGame.state.current;
    const w = window.DMTHGame.wardrobe;
    if (!w || !w.catalog) { el.innerHTML = '<div class="panel"><p class="muted">Wardrobe system unavailable.</p></div>'; return; }
    const money = s.wallet.money;
    const outfits = w.catalog();

    el.innerHTML = `
      <div class="panel">
        <h2>🧵 The Carcass Closet — Clothing Store</h2>
        <p class="small muted">Dress your meat. Buy outfits into your inventory (stack as many as you want) — then APPLY one to a captive from her wardrobe page. Type-matched outfits (a nurse in a nurse fit, a cheerleader in cheer) pay a sync premium on films + sales.</p>
      </div>
      <div class="panel">
        <div class="girl-grid">
          ${outfits.map(o => {
            const have = (w.ownedQty ? w.ownedQty(o.id) : (s.inventory[o.id] || 0));
            const st = w.clothingStatus ? w.clothingStatus(o.id) : { locked: false };
            const locked = !!st.locked;
            const lockReason = locked && w.clothingLockReason ? w.clothingLockReason(o.id) : '';
            const canAfford = money >= o.price;
            const blocked = locked || !canAfford;
            const tip = `${o.emoji || '👗'} ${o.displayName} — ${o.description || ''}${o.multiplier ? ` · content ×${o.multiplier}` : ''}${o.syncArchetype ? ` · syncs: ${o.syncArchetype}` : ''}`.replace(/"/g, '&quot;');
            const btnLabel = locked ? `🔒 ${lockReason || 'locked'}` : !canAfford ? (window.DMTHGame.state.brokeShort ? window.DMTHGame.state.brokeShort() : 'broke') : `Buy $${o.price.toLocaleString()}`;
            return `<div class="model-card${locked ? ' locked' : ''}" data-tooltip="${tip}">
              <div class="model-name">${locked ? '🔒 ' : ''}${o.emoji || '👗'} ${o.displayName}</div>
              <div class="model-meta">
                <span data-tooltip="Outfit price">$${o.price.toLocaleString()}</span>
                <span data-tooltip="Outfit tier">tier ${o.tier || 1}</span>
                <span data-tooltip="Content-value multiplier when she wears it">×${o.multiplier || 1}</span>
                <span data-tooltip="How many you hold in inventory">have: ${have}</span>
              </div>
              <div class="model-notes small">${locked ? `<span class="danger">🔒 Needs ${lockReason}.</span> ` : ''}${o.description || ''}</div>
              <button class="btn-small ${blocked ? '' : 'btn-primary'}" data-buy-outfit="${o.id}" ${blocked ? 'disabled' : ''} data-tooltip="${locked ? 'Locked — needs ' + lockReason : 'Buy 1 into your inventory ($' + o.price.toLocaleString() + '). Apply it to a girl from her wardrobe page.'}">${btnLabel}</button>
            </div>`;
          }).join('')}
        </div>
      </div>
    `;

    el.querySelectorAll('[data-buy-outfit]').forEach(b => {
      b.onclick = () => {
        const r = w.buyToInventory(b.dataset.buyOutfit);
        if (!r || !r.ok) { alert((r && r.reason) || 'could not buy'); return; }
        window.DMTHRouter.handle();
      };
    });
  }

  window.DMTHRouter.register('clothing-store', render);
})();
