// DUNGEON MASTER: THE HUNT — shop page.

(function () {
  'use strict';

  const SUBCATS = ['blunt','sedation','restraint','containment','toys','drugs','food','player-boost','dungeon-upgrade','consumables','utility','tech'];

  // TOOLTIPS-FULL.1 — build a THOROUGH shop-item tooltip (Gee: "drug types need to show theri
  // modifiers ... toys show fx"). Starts from notes, then appends the item's REAL numbers when we
  // can resolve them: a toy's HER/YOU fx (toys.toyTooltip), a drug's body modifiers + high/duration/
  // use-case (action-effects + drug-scheduler), and a player-boost item's Nut Reserve refill.
  const DRUGKEY_TO_ACTION = {
    coke: 'drug-coke', weed: 'drug-weed', mdma: 'drug-mdma', acid: 'drug-acid',
    whiskey: 'drug-whiskey', alcohol: 'drug-whiskey', ketamine: 'drug-ketamine', tranquilizer: 'drug-tranquilizer'
  };
  function shopItemTooltip(it) {
    const AE = window.DMTHGame.actionEffects;
    const lines = [`${it.emoji || ''} ${it.displayName}`.trim()];
    if (it.notes) lines.push(it.notes);
    // Toy → pull its HER / YOU / flag lines (skip the duplicate header + notes).
    if (window.DMTHGame.toys?.TOYS?.[it.id] && window.DMTHGame.toys.toyTooltip) {
      window.DMTHGame.toys.toyTooltip(it.id).split('\n')
        .filter(l => /^(👤|🎮|⚠|🔒)/.test(l))
        .forEach(l => lines.push(l));
    }
    // Drug → body modifiers (action-effects) + high / duration / use-case (drug-scheduler).
    const dkey = window.DMTHGame.drugs?.ITEM_TO_DRUG?.[it.id];
    if (dkey) {
      const a = AE?.ACTIONS?.[DRUGKEY_TO_ACTION[dkey]];
      if (a && AE.girlEffectLine) { const her = AE.girlEffectLine(a); if (her) lines.push('👤 HER: ' + her); }
      const curve = window.DMTHGame.drugs.DRUG_CURVES?.[dkey];
      if (curve) {
        const mins = Math.round((curve.wearOffMs || 0) / 60000);
        const uc = window.DMTHGame.drugs.useCaseOf ? window.DMTHGame.drugs.useCaseOf(dkey) : null;
        lines.push(`💊 High +${curve.highContribution} · ~${mins}min${uc ? ' · use: ' + uc : ''}${curve.canOD ? ' · can OD' : ''}`);
      }
    }
    // Player-boost refill → Nut Reserve gain.
    if (typeof it.playerRefill === 'number') {
      lines.push(`💦 Nut Reserve ${it.playerRefill >= 999 ? 'FULL refill' : '+' + it.playerRefill}`);
    }
    return lines.join('\n');
  }

  function render(el, params) {
    const subcat = params.sub || 'sedation';
    const s = window.DMTHGame.state.current;
    const listings = window.DMTHGame.shop.listingsBySubcategory(subcat);

    // Per-subcategory tooltip hints surfaced on the tab + per-item notes on the card.
    const SUBCAT_TOOLTIPS = {
      'blunt': 'Blunt-force tools — pipes etc. Cheap Approach + Subdue stage assist. Messy.',
      'sedation': 'Chemical subdue tools — rohypnol / chloroform / ether / ketamine / tranquilizer. Single-use per stage.',
      'restraint': 'Binding tools — handcuffs / shackles / harness. Multi-use, drive Secure stage.',
      'containment': 'Tape / rope / zip-ties. Single-use Secure-stage cheap binding.',
      'toys': 'In-room toys for sessions.',
      'drugs': 'Recreational drugs you administer in the dungeon — coke, weed, mdma, acid, whiskey.',
      'food': 'Food + water consumables for your captives.',
      'player-boost': 'Refill your 💦 Nut Reserve — blue pill (viagra, full refill), energy shot, the good coke, oyster tonic. Pop them from the dashboard.',
      'dungeon-upgrade': 'Static dungeon-template upgrades.',
      'consumables': 'Misc per-girl ongoing items.',
      'utility': 'Tools + supplies that don\'t fit the capture loop.',
      'tech': 'Cameras, recording gear, surveillance.',
      'contraception': 'Condoms + preventive items. Blocks pregnancy conception roll when in use.',
      'reproductive-medical': 'Plan-B / abortion pills / surgical kits / OB-GYN referrals. Each has a gestation-day window.'
    };
    el.innerHTML = `
      <div class="panel">
        <h2>🏴 The Defilers' Bloc</h2>
        <p class="small muted">An off-grid anarchist cell that arms the appetite no legitimate market will touch — kidnap chems, restraints, chamber implements, and the slop you keep your stock alive on. Cheap staples (condoms / food) never run out; the good shit (high-tier tools, toys, chems) is level-locked and only a handful drops each day. The Bloc restocks every game-day. (Everything-unlocked start = the Bloc keeps you fully armed.)</p>
        <div class="tabs">
          ${SUBCATS.map(c => `<a href="#shop?sub=${c}" class="tab ${c === subcat ? 'active' : ''}" data-tooltip="${SUBCAT_TOOLTIPS[c] || c}">${c}</a>`).join('')}
        </div>
      </div>
      <div class="panel">
        <h2>${subcat}</h2>
        <div class="girl-grid">
          ${listings.map(it => {
            const have = s.inventory[it.id] || 0;
            const canAfford = s.wallet.money >= it.price;
            const tooltip = shopItemTooltip(it).replace(/"/g, '&quot;');
            // SHOPREWORK.1 — stock + level-lock state.
            const stockTxt = it.staple ? '∞' : (it.available > 0 ? `${it.available} today` : 'sold out today');
            const soldOut = !it.staple && it.available <= 0;
            const blocked = it.locked || soldOut || !canAfford;
            const buyMax = it.staple ? Infinity : it.available;
            const buyLabel = it.locked ? '🔒 level-locked' : soldOut ? 'sold out' : !canAfford ? 'Too poor' : 'Buy';
            return `<div class="model-card${it.locked ? ' locked' : ''}" data-tooltip="${tooltip}">
              <div class="asset-slot" data-asset-category="item" data-asset-id="${it.id}" data-asset-size="80"></div>
              <div class="model-name">${it.locked ? '🔒 ' : ''}${it.emoji} ${it.displayName}</div>
              <div class="model-meta">
                <span data-tooltip="Item cost in dollars">$${it.price.toLocaleString()}</span>
                <span data-tooltip="Item tier — higher = more powerful, level-locked">tier ${it.tier}</span>
                <span data-tooltip="In stock today (∞ = unlimited staple, refreshes daily)" class="${soldOut ? 'danger' : ''}">${stockTxt}</span>
                <span data-tooltip="Count currently in your inventory">have: ${have}</span>
              </div>
              <div class="model-notes small">${it.locked ? '<span class="danger">Locked — raise your DEPRAVITY level to buy this tier.</span> ' : ''}${it.notes || ''}</div>
              <button class="btn-small ${blocked ? '' : 'btn-primary'}" data-buy="${it.id}" ${blocked ? 'disabled' : ''} data-tooltip="${it.locked ? 'Locked by DEPRAVITY level' : soldOut ? 'Back tomorrow for fresh stock' : 'Buy one. Deducts $' + it.price.toLocaleString() + '.'}">
                ${buyLabel}
              </button>
              <button class="btn-small" data-buy5="${it.id}" ${(blocked || s.wallet.money < it.price * 5 || buyMax < 5) ? 'disabled' : ''} data-tooltip="Bulk buy ×5. Deducts $${(it.price * 5).toLocaleString()}.">
                Buy ×5
              </button>
            </div>`;
          }).join('')}
        </div>
      </div>
    `;

    el.querySelectorAll('[data-buy]').forEach(b => {
      b.onclick = () => {
        try { window.DMTHGame.shop.buy(b.dataset.buy, 1); window.DMTHRouter.handle(); }
        catch (e) { alert(e.message); }
      };
    });
    el.querySelectorAll('[data-buy5]').forEach(b => {
      b.onclick = () => {
        try { window.DMTHGame.shop.buy(b.dataset.buy5, 5); window.DMTHRouter.handle(); }
        catch (e) { alert(e.message); }
      };
    });

    // Asset images lazy-loaded (if any cover.png present in the folder)
    if (window.DMTHAssetImg) window.DMTHAssetImg.decorate(el, 80);
  }

  window.DMTHRouter.register('shop', render);
})();
