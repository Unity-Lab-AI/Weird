// DUNGEON MASTER: THE HUNT — wardrobe page. Buy outfits, equip/unequip per girl.

(function () {
  'use strict';

  function render(el, params) {
    const girlId = params.girl;
    const girl = window.DMTHGame.state.getGirl(girlId);
    if (!girl) { el.innerHTML = `<p>no such girl · <a href="#roster">Roster</a></p>`; return; }
    const money = window.DMTHGame.state.current.wallet.money;
    const owned = new Set((girl.wardrobe || []).map(w => w.id));

    const isNude = girl.currentOutfit === 'nude';
    const isStripped = girl.currentOutfit === 'none';
    const currentWear = (girl.wardrobe || []).find(w => w.id === girl.currentOutfit);
    const capturedEntry = (girl.wardrobe || []).find(w => w.source === 'captured-with');
    el.innerHTML = `
      <div class="panel">
        <h2>👗 ${girl.name}'s wardrobe</h2>
        <p class="small muted">Currently wearing: <b>${currentWear?.displayName || 'default'}</b>${currentWear?.source === 'captured-with' ? ' <span class="small">(her captured-at outfit)</span>' : ''}</p>
        ${capturedEntry?.description ? `<p class="small muted">📸 <b>Captured wearing:</b> ${capturedEntry.description}</p>` : ''}
        <div class="btn-row">
          <a href="#room?girl=${girl.id}" class="btn-small">← back to her hold</a>
          <button class="btn-small ${isNude ? '' : 'btn-primary'}" data-derobe>${isNude ? '👗 Re-dress (her captured-at outfit)' : '🍑 Derobe — strip her fully nude'}</button>
          <button class="btn-small ${isStripped ? '' : 'btn-danger'}" data-strip-all>${isStripped ? '👗 Re-dress (her captured-at outfit)' : '🚫 Strip everything — no accessories'}</button>
        </div>
        <p class="small muted" style="margin-top:8px">
          <b>🍑 Derobe</b> puts <code>nude</code> at position 2 of the image prompt — accessories (collars, cuffs, harnesses) still allowed if equipped.<br>
          <b>🚫 Strip everything</b> is more aggressive — bans accessories, jewelry, collars, restraints. Raw nakedness, no body adornment whatsoever.<br>
          <b>👗 Re-dress</b> restores her captured-at outfit (the clothes she was wearing when taken). Both strip options free + always available.
        </p>
      </div>

      <div class="panel">
        <h2>👗 Dress her <span class="small muted">— everything you can put on her right now: her own wardrobe + any outfits sitting in your inventory</span></h2>
        <div class="girl-grid">
          ${(girl.wardrobe || []).map(w => `
            <div class="model-card ${w.id === girl.currentOutfit ? 'active' : ''}">
              <div class="model-name">${w.displayName}</div>
              <div class="model-notes small">${w.description || ''}</div>
              ${w.id === girl.currentOutfit
                ? `<div class="small gold">EQUIPPED</div>`
                : `<button class="btn-small" data-equip="${w.id}">Wear it</button>`
              }
            </div>
          `).join('')}
          ${window.DMTHGame.wardrobe.catalog()
              .filter(o => window.DMTHGame.wardrobe.ownedQty(o.id) > 0 && !owned.has(o.id))
              .map(o => `
            <div class="model-card">
              <div class="model-name">${o.emoji} ${o.displayName} <span class="small muted">· in your inventory ×${window.DMTHGame.wardrobe.ownedQty(o.id)}</span></div>
              <div class="model-notes small">${o.description || ''}</div>
              <button class="btn-small btn-primary" data-apply="${o.id}" data-tooltip="Pull one out of your inventory and put it on ${girl.name} (consumes 1, equips it).">Apply to her</button>
            </div>
          `).join('') || ''}
        </div>
      </div>

      <div class="panel">
        <h2>🧵 The Carcass Closet <span class="small muted">— buy outfits into your inventory, then apply them to any girl (you can stockpile duplicates; her captured-at outfit is hers forever)</span></h2>
        <div class="girl-grid">
          ${window.DMTHGame.wardrobe.catalog().map(o => {
            const W = window.DMTHGame.wardrobe;
            const inWardrobe = owned.has(o.id);
            const equipped = girl.currentOutfit === o.id;
            const invQty = W.ownedQty(o.id);
            const st = W.clothingStatus(o.id);
            const lockReason = (st.unmet || []).join(' + ');
            const cardTip = (o.description || '').replace(/"/g, '&quot;');
            const canAfford = money >= o.price;
            // Buy button (into shared inventory) — gated.
            const buyBtn = st.locked
              ? `<button class="btn-small" disabled data-tooltip="Locked — needs ${lockReason}. Buying adds it to your inventory; then apply it to a girl.">🔒 ${lockReason}</button>`
              : `<button class="btn-small ${canAfford ? 'btn-primary' : ''}" data-buy="${o.id}" ${canAfford ? '' : 'disabled'} data-tooltip="Buy 1 into your inventory ($${o.price.toLocaleString()}). Stackable — hoard as many as you want, then apply to any girl.">${canAfford ? `Buy $${o.price.toLocaleString()}` : 'Too poor'}</button>`;
            // Apply button (consume from inventory onto her) — available when held in inventory or already in her wardrobe.
            const applyBtn = equipped
              ? `<div class="small gold">EQUIPPED</div>`
              : (invQty > 0 || inWardrobe)
                ? `<button class="btn-small" data-apply="${o.id}" data-tooltip="${inWardrobe ? 'Re-equip this on her (already in her wardrobe — no inventory used).' : `Apply one from inventory onto ${girl.name} (consumes 1, equips it).`}">${inWardrobe ? 'Equip' : 'Apply to her'}</button>`
                : '';
            return `<div class="model-card" data-tooltip="${cardTip}">
              <div class="model-name">${o.emoji} ${o.displayName}</div>
              <div class="model-notes small">${o.description}</div>
              <div class="model-meta">
                <span data-tooltip="Purchase cost in dollars">$${o.price}</span>
                <span data-tooltip="Outfit tier — higher tier = more elaborate, costlier, bigger film-value multiplier, later unlock">tier ${o.tier}</span>
                <span data-tooltip="Multiplies film sale price when she's wearing this outfit during recording">×${o.multiplier} film value</span>
                <span data-tooltip="How many of this outfit you're holding in your inventory">inv: ${invQty}</span>
              </div>
              <div style="display:flex;gap:4px;flex-wrap:wrap">${buyBtn}${applyBtn}</div>
            </div>`;
          }).join('')}
        </div>
      </div>
    `;

    el.querySelectorAll('[data-buy]').forEach(b => {
      b.onclick = () => {
        const r = window.DMTHGame.wardrobe.buyToInventory(b.dataset.buy);
        if (!r.ok) { alert(r.reason); return; }
        window.DMTHRouter.handle();
      };
    });
    el.querySelectorAll('[data-apply]').forEach(b => {
      b.onclick = () => {
        const r = window.DMTHGame.wardrobe.applyToGirl(girl.id, b.dataset.apply);
        if (!r.ok) { alert(r.reason); return; }
        window.DMTHRouter.handle();
      };
    });
    el.querySelectorAll('[data-equip]').forEach(b => {
      b.onclick = () => {
        try { window.DMTHGame.wardrobe.equip(girl.id, b.dataset.equip); window.DMTHRouter.handle(); }
        catch (e) { alert(e.message); }
      };
    });
    const derobeBtn = el.querySelector('[data-derobe]');
    if (derobeBtn) {
      derobeBtn.onclick = () => {
        try {
          if (girl.currentOutfit === 'nude') {
            window.DMTHGame.wardrobe.equip(girl.id, 'default');
          } else {
            window.DMTHGame.wardrobe.derobe(girl.id);
          }
          window.DMTHRouter.handle();
        } catch (e) { alert(e.message); }
      };
    }
    const stripAllBtn = el.querySelector('[data-strip-all]');
    if (stripAllBtn) {
      stripAllBtn.onclick = () => {
        try {
          if (girl.currentOutfit === 'none') {
            window.DMTHGame.wardrobe.equip(girl.id, 'default');
          } else {
            window.DMTHGame.wardrobe.stripEverything(girl.id);
          }
          window.DMTHRouter.handle();
        } catch (e) { alert(e.message); }
      };
    }
  }

  window.DMTHRouter.register('wardrobe', render);
})();
