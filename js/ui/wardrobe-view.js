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
        <p class="small muted">🧵 Out of outfits? Buy more at <a href="#clothing-store">The Carcass Closet</a> (Stores hub) — everything stockpiles in your inventory, then comes back here to dress her. <span class="muted">(: buying lives at the storefront now; this page is for dressing her from what you own.)</span></p>
      </div>
    `;

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
