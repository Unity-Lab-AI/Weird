// DUNGEON MASTER: THE HUNT — shop page.

(function () {
  'use strict';

  const SUBCATS = ['blunt','sedation','restraint','containment','toys','drugs','food','player-boost','dungeon-upgrade','consumables','utility','tech'];

  // the active "pay for things" method, persists across renders this session.
  //   'pocket'     → cash in pocket   ·   'vault-trip' → run home to the vault (game-time trip)
  //   'credit'     → charge the card
  // Defaults to vault-trip so a buy never strands you when your pocket's empty.
  let payMode = 'vault-trip';
  function affordBy(price, pocket, vault, creditAvail) {
    if (payMode === 'pocket') return pocket >= price;
    if (payMode === 'credit') return creditAvail >= price;
    return vault >= price;   // vault-trip
  }

  // Build a THOROUGH shop-item tooltip — drug types show their modifiers, toys show fx.
  // Starts from notes, then appends the item's REAL numbers when we
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
        const gameMin = Math.round(curve.wearOffMin || 0);
        const uc = window.DMTHGame.drugs.useCaseOf ? window.DMTHGame.drugs.useCaseOf(dkey) : null;
        lines.push(`💊 High +${curve.highContribution} · lasts ~${gameMin} game-min${uc ? ' · use: ' + uc : ''}${curve.canOD ? ' · can OD' : ''}`);
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
    // live balances for the pay-with selector + affordability.
    const St = window.DMTHGame.state;
    const pocket = St.getPocket ? St.getPocket() : (s.wallet.money || 0);
    const vault = St.getVault ? St.getVault() : (s.wallet.money || 0);
    const creditAvail = St.creditAvailable ? St.creditAvailable() : 0;

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
        <div class="btn-row" style="margin-top:8px;align-items:center;gap:6px;flex-wrap:wrap" data-tooltip="How you pay for shit at the Bloc. Cash in pocket = what you carry. Run home to the vault = pay from your stash but it burns game-time on the round trip. Charge it = your credit card (riskier — it's debt).">
          <span class="small muted">Pay with:</span>
          <button class="btn-small ${payMode === 'pocket' ? 'btn-primary' : ''}" data-pay="pocket" data-tooltip="Spend the cash in your pocket.">💵 Pocket $${pocket.toLocaleString()}</button>
          <button class="btn-small ${payMode === 'vault-trip' ? 'btn-primary' : ''}" data-pay="vault-trip" data-tooltip="Run home, crack the vault, come back — pays from your stash but burns ~1 game-hour on the trip.">🏦 Vault $${vault.toLocaleString()} (run home)</button>
          <button class="btn-small ${payMode === 'credit' ? 'btn-primary' : ''}" data-pay="credit" data-tooltip="Charge that shit to the card — debt, riskier, but the limit grows as you pay it off.">💳 Charge it (avail $${creditAvail.toLocaleString()})</button>
        </div>
      </div>
      <div class="panel">
        <h2>${subcat}</h2>
        <div class="girl-grid">
          ${listings.map(it => {
            const have = s.inventory[it.id] || 0;
            const canAfford = affordBy(it.price, pocket, vault, creditAvail);
            const tooltip = shopItemTooltip(it).replace(/"/g, '&quot;');
            // Stock + level-lock state.
            const stockTxt = it.staple ? '∞' : (it.available > 0 ? `${it.available} today` : 'sold out today');
            const soldOut = !it.staple && it.available <= 0;
            const blocked = it.locked || soldOut || !canAfford;
            const buyMax = it.staple ? Infinity : it.available;
            const buyLabel = it.locked ? '🔒 locked' : soldOut ? 'sold out' : !canAfford ? (window.DMTHGame.state.brokeShort ? window.DMTHGame.state.brokeShort() : 'broke') : 'Buy';
            return `<div class="model-card${it.locked ? ' locked' : ''}" data-tooltip="${tooltip}">
              <div class="asset-slot" data-asset-category="item" data-asset-id="${it.id}" data-asset-size="80"></div>
              <div class="model-name">${it.locked ? '🔒 ' : ''}${it.emoji} ${it.displayName}</div>
              <div class="model-meta">
                <span data-tooltip="Item cost in dollars">$${it.price.toLocaleString()}</span>
                <span data-tooltip="Item tier — higher = more powerful, level-locked">tier ${it.tier}</span>
                <span data-tooltip="In stock today (∞ = unlimited staple, refreshes daily)" class="${soldOut ? 'danger' : ''}">${stockTxt}</span>
                <span data-tooltip="Count currently in your inventory">have: ${have}</span>
              </div>
              <div class="model-notes small">${it.locked ? `<span class="danger">🔒 Locked — needs ${it.lockReason}.</span> ` : ''}${it.notes || ''}</div>
              <button class="btn-small ${blocked ? '' : 'btn-primary'}" data-buy="${it.id}" ${blocked ? 'disabled' : ''} data-tooltip="${it.locked ? 'Locked — needs ' + it.lockReason : soldOut ? 'Back tomorrow for fresh stock' : 'Buy one. Deducts $' + it.price.toLocaleString() + '.'}">
                ${buyLabel}
              </button>
              <button class="btn-small" data-buy5="${it.id}" ${(blocked || !affordBy(it.price * 5, pocket, vault, creditAvail) || buyMax < 5) ? 'disabled' : ''} data-tooltip="Bulk buy ×5 via the selected pay method. Costs $${(it.price * 5).toLocaleString()}.">

                Buy ×5
              </button>
            </div>`;
          }).join('')}
        </div>
      </div>
      ${subcat === 'dungeon-upgrade' && window.DMTHGame.dungeonOps ? (() => {
        //  (a) — dungeon FACILITIES are bought into inventory HERE, then installed to a
        // specific dungeon from the dungeon page (buy → your hands → install where you want it).
        const ops = window.DMTHGame.dungeonOps;
        const entries = [...Object.entries(ops.SECURITY_FACILITIES || {}), ...Object.entries(ops.DISPOSAL_FACILITIES || {})];
        const cards = entries.map(([id, f]) => {
          const qty = ops.facilityOwnedQty ? ops.facilityOwnedQty(id) : 0;
          const afford = vault >= f.cost;
          const tip = (f.notes || '').replace(/"/g, '&quot;');
          return `<div class="model-card" data-tooltip="${tip}">
            <div class="model-name">${f.displayName}</div>
            <div class="model-meta"><span data-tooltip="Cost (paid from your vault)">$${f.cost.toLocaleString()}</span><span data-tooltip="How many you hold in inventory, uninstalled">inv: ${qty}</span></div>
            <div class="model-notes small">${f.notes || ''} — buy it into your inventory, then INSTALL it to a dungeon from the dungeon page.</div>
            <button class="btn-small ${afford ? 'btn-primary' : ''}" data-buy-fac="${id}" ${afford ? '' : 'disabled'} data-tooltip="Buy 1 into your inventory ($${f.cost.toLocaleString()} from your vault). Install it from the dungeon page.">${afford ? `Buy $${f.cost.toLocaleString()}` : (window.DMTHGame.state.brokeShort ? window.DMTHGame.state.brokeShort() : 'broke')}</button>
          </div>`;
        }).join('');
        return `<div class="panel"><h2>🏗️ Dungeon Facilities</h2><p class="small muted">Security + disposal infrastructure — bought into your inventory here, then INSTALLED to whichever dungeon you want from the dungeon page (just like toys + clothing: buy → your hands → install where it's needed). Paid straight from your vault.</p><div class="girl-grid">${cards}</div></div>`;
      })() : ''}
    `;

    //  (a) — buy a dungeon facility into inventory (install happens on the dungeon page).
    el.querySelectorAll('[data-buy-fac]').forEach(b => {
      b.onclick = () => {
        const r = window.DMTHGame.dungeonOps.buyFacilityToInventory(b.dataset.buyFac);
        if (!r.ok) { alert(r.reason); return; }
        window.DMTHRouter.handle();
      };
    });

    // pick the pay method; re-render to update balances + affordability.
    el.querySelectorAll('[data-pay]').forEach(b => {
      b.onclick = () => { payMode = b.dataset.pay; window.DMTHRouter.handle(); };
    });
    el.querySelectorAll('[data-buy]').forEach(b => {
      b.onclick = () => {
        try {
          const r = window.DMTHGame.shop.buy(b.dataset.buy, 1, { pay: payMode });
          if (r && r.pay === 'vault-trip' && window.DMTHNotify) window.DMTHNotify.show('🏦 Ran home to the vault — ~1 game-hour gone.', { type: 'info', durationMs: 2500 });
          window.DMTHRouter.handle();
        } catch (e) { alert(e.message); }
      };
    });
    el.querySelectorAll('[data-buy5]').forEach(b => {
      b.onclick = () => {
        try { window.DMTHGame.shop.buy(b.dataset.buy5, 5, { pay: payMode }); window.DMTHRouter.handle(); }
        catch (e) { alert(e.message); }
      };
    });

    // Asset images lazy-loaded (if any cover.png present in the folder)
    if (window.DMTHAssetImg) window.DMTHAssetImg.decorate(el, 80);
  }

  window.DMTHRouter.register('shop', render);
})();
