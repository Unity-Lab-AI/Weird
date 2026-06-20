// DUNGEON MASTER: THE HUNT — Bloodland Holdings (the property / real-estate storefront).
//  ph3 (a real-estate office in the shops tab, with a canon filthy name — NOT
// "Real Estate Office"). One storefront in the Stores hub for ALL property acquisition: buy new
// hideouts (dungeons) + buy access to / buy OUT the hunting grounds (turf). The scattered buy
// points that used to live in dungeon-view ("Available hideouts to acquire") + town-view (turf
// access / buyout) are pulled in HERE — those pages now point at this store.

(function () {
  'use strict';

  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c])); }

  // Where each hideout template sits (descriptor stamped on the dungeon at purchase) — mirrors the
  // map dungeon-view used before the buy moved here.
  const DUNGEON_DESCRIPTOR = {
    'hole-in-the-desert':   'a remote stretch of desert 2 hours east',
    'woods-container':      'deep pine forest off an abandoned logging road',
    'basement-hidden-room': 'an unremarkable single-family house at 1147 Oak',
    'subway-service-room':  'sealed corridor under Line 4',
    'sewer-tunnel-locked':  'Victorian-era tunnel system under the old district',
    'coldwar-bunker':       '80-acre wooded parcel, the old civil-defense site',
    'abandoned-mine-shaft': 'the Boulder Creek claim, deeded wilderness',
    'remote-compound':      'off-grid mountain acreage, 15mi from nearest neighbor',
    'underground-complex':  'purpose-built facility under your legitimate front'
  };

  function buyDungeon(tplId) {
    const tpl = window.DMTHAssets.getById('dungeon', tplId);
    if (!tpl) return;
    if (!window.DMTHGame.state.spendMoney(tpl.cost, `buy-dungeon:${tplId}`)) {
      alert(window.DMTHGame.state.brokeLine ? window.DMTHGame.state.brokeLine() : 'broke'); return;
    }
    const id = 'dun_' + Date.now().toString(36);
    window.DMTHGame.state.addDungeon({
      id,
      templateId: tpl.id,
      displayName: tpl.displayName,
      capacity: tpl.roomSlots,
      holds: Array.from({ length: tpl.roomSlots }, (_, i) => ({
        id: `${id}_hold_${i}`, captiveGirlId: null, holdType: tpl.holdType, restraintStatus: 'standard',
        foodReserve: 0, waterReserve: 0
      })),
      locationDescriptor: DUNGEON_DESCRIPTOR[tpl.id] || 'unspecified location',
      purchasedAt: Date.now()
    });
    window.DMTHRouter.handle();
  }

  function render(el) {
    const G = window.DMTHGame;
    const s = G.state.current;
    const prog = G.progression;
    const money = s.wallet.money;
    const ownedTplIds = (s.dungeons || []).map(d => d.templateId);

    // Hideouts you don't own yet.
    const hideouts = (window.DMTHAssets.DUNGEONS || []).filter(t => !ownedTplIds.includes(t.id));

    // Turf — every gated hunting ground (the buyable/ownable town locations). Show locked (buy
    // access), unlocked-not-owned (buy out), owned (badge).  names via state.locationName.
    const turfIds = prog && prog.LOCATION_GATES ? Object.keys(prog.LOCATION_GATES) : [];

    el.innerHTML = `
      <div class="panel">
        <h2>🏚️ Bloodland Holdings</h2>
        <p class="small muted">Deeds &amp; turf — the property arm of the operation. Buy new hideouts to stuff with meat, buy private access to the hunting grounds, then BUY OUT the turf outright so the whole rotten town answers to you. Everything you own pays a passive skim and bleeds your heat down. <a href="#stores">← Stores</a></p>
        <div class="stat-row small" data-tooltip="Your treasury."><span>💰 Cash</span><b>$${money.toLocaleString()}</b></div>
      </div>

      <div class="panel">
        <h2>🏚️ Hideouts for sale (${hideouts.length})</h2>
        ${hideouts.length ? `<div class="girl-grid">
          ${hideouts.map(t => {
            const afford = money >= t.cost;
            const tip = (t.notes || '').replace(/"/g, '&quot;');
            return `<div class="model-card" data-tooltip="${tip}">
              <div class="model-name">${t.emoji} ${esc(t.displayName)}</div>
              <div class="model-meta">
                <span data-tooltip="Purchase cost">$${t.cost.toLocaleString()}</span>
                <span data-tooltip="Captive holds at base capacity">${t.roomSlots} hold${t.roomSlots === 1 ? '' : 's'}</span>
                <span data-tooltip="Isolation — higher = lower suspicion moving captives">Iso ${Math.round((t.isolation || 0.5) * 100)}%</span>
                <span data-tooltip="Concealment — higher = lower escape-aftermath notoriety">Concl ${Math.round((t.concealment || 0.5) * 100)}%</span>
              </div>
              <div class="model-notes small">${esc(t.notes || '')}</div>
              <button class="btn-small ${afford ? 'btn-primary' : ''}" data-buy-dungeon="${t.id}" ${afford ? '' : 'disabled'} data-tooltip="${afford ? 'Buy this hideout — adds ' + t.roomSlots + ' empty hold(s). Install facilities + upgrades from the dungeon page after.' : 'Need $' + t.cost.toLocaleString() + ' — earn it from films + properties.'}">${afford ? 'Acquire →' : (G.state.brokeShort ? G.state.brokeShort() : 'broke')}</button>
            </div>`;
          }).join('')}
        </div>` : `<p class="sect-stub">You own every hideout on the market. Build out the ones you've got.</p>`}
      </div>

      <div class="panel">
        <h2>🏴 Turf — own the grounds (${turfIds.length})</h2>
        <p class="small muted">The hunting grounds aren't just to prowl — buy private access, then own the turf: 🙈 fewer witnesses, 💋 less WANTED, 🩸 better capture odds, 💰 a passive skim every tick.</p>
        <div class="girl-grid">
          ${turfIds.map(locId => {
            const loc = window.DMTHAssets.getById('location', locId);
            if (!loc) return '';
            const name = (G.state.locationName ? G.state.locationName(locId) : loc.displayName);
            const owns = prog.ownsLocation && prog.ownsLocation(locId);
            const unlocked = prog.isLocationUnlocked(locId);
            const accessCost = prog.locationCost(locId);
            const boCost = prog.buyOutCost ? prog.buyOutCost(locId) : 0;
            let action;
            if (owns) {
              action = `<div class="small ok">🏴 YOUR TURF — perks active</div>`;
            } else if (!unlocked) {
              const reason = prog.locationGateReason(locId);
              action = accessCost
                ? `<button class="btn-small ${money >= accessCost ? 'btn-primary' : ''}" data-buy-access="${locId}" ${money >= accessCost ? '' : 'disabled'} data-tooltip="Buy private access to ${esc(name)} — $${accessCost.toLocaleString()}. Unlocks hunting + lets you buy it out.">🗝️ Buy access $${accessCost.toLocaleString()}</button>`
                : `<div class="small warn" data-tooltip="${esc(reason)}">🔒 ${esc(reason)}</div>`;
            } else {
              action = boCost
                ? `<button class="btn-small ${money >= boCost ? 'btn-primary' : ''}" data-buyout="${locId}" ${money >= boCost ? '' : 'disabled'} data-tooltip="BUY OUT ${esc(name)} — $${boCost.toLocaleString()}. Own the turf outright + its perks.">🏴 Buy out $${boCost.toLocaleString()}</button>`
                : `<div class="small muted">access unlocked</div>`;
            }
            return `<div class="model-card${owns ? ' owned' : ''}" data-tooltip="${esc(loc.notes || '')}">
              <div class="model-name">${loc.emoji} ${esc(name)}</div>
              <div class="model-meta"><span>${loc.subcategory || ''} grounds</span></div>
              <div>${action}</div>
            </div>`;
          }).join('')}
        </div>
      </div>
    `;

    el.querySelectorAll('[data-buy-dungeon]').forEach(b => b.onclick = () => buyDungeon(b.dataset.buyDungeon));
    el.querySelectorAll('[data-buy-access]').forEach(b => b.onclick = () => {
      const r = prog.buyLocationAccess(b.dataset.buyAccess);
      if (!r.ok) { alert(r.reason); return; }
      render(el);
    });
    el.querySelectorAll('[data-buyout]').forEach(b => b.onclick = () => {
      const locId = b.dataset.buyout;
      const cost = prog.buyOutCost(locId);
      if (!confirm(`Buy out this turf for $${cost.toLocaleString()}? You'll own it — fewer witnesses, less WANTED, better capture odds, and a passive skim every tick.`)) return;
      const r = prog.buyOutLocation(locId);
      if (!r.ok) { alert(r.reason); return; }
      render(el);
    });
    if (window.DMTHAssetImg) window.DMTHAssetImg.decorate(el, 100);
  }

  window.DMTHRouter.register('property', render);
})();
