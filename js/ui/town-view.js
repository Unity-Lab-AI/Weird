// DUNGEON MASTER: THE HUNT — town plot-grid page. Hunt locations only — you VISIT to hunt, you don't buy.

(function () {
  'use strict';

  //   — the town is split into ZONES. Each location belongs to one; some are level-
  // gated, some pay-to-unlock (handled by progression.LOCATION_GATES). Zone is shown on each slot.
  const LOCATION_ZONES = {
    street: 'The Gutter', 'coffee-shop': 'The Gutter', library: 'The Gutter', park: 'The Gutter',
    club: 'The Meat District', 'strip-club': 'The Meat District',
    gym: 'The Quarter', mall: 'The Quarter', 'school-campus': 'The Quarter', sorority: 'The Quarter',
    'hotel-lobby': 'The Heights', 'private-party': 'The Heights',
    'prenatal-clinic': 'The Brood Ward',
    'family-reunion': 'The Cul-de-sac',
    remote: 'The Sticks', neighborhood: 'The Cul-de-sac'
  };
  function zoneOf(locId) { return LOCATION_ZONES[locId] || 'Outskirts'; }

  function render(el) {
    const grid = window.DMTHGame.townPlot.buildGrid();

    el.innerHTML = `
      <div class="panel">
        <h2>🌆 Town</h2>
        <p class="small muted">Click any location to visit and hunt the girls available there. Each location spawns different archetypes at different difficulty levels.</p>
        <div class="stat-row small" data-tooltip="Cumulative heat from your operation. Higher = harder spawns, lower capture odds, more cop interest."><span>Notoriety</span><b>${window.DMTHGame.state.current.wallet.notoriety}</b>
          <span class="muted">(affects spawns + acquire odds)</span></div>
        <div class="btn-row" style="margin-top:6px">
          <button id="case-streets" class="btn-small" data-tooltip="Prowl the town for loose loot — tools, drugs, gear, cash off the streets. ~50% you turn something up; sometimes a rare item from the full catalog. Free, no notoriety.">🔦 Case the streets</button>
        </div>
      </div>

      <div class="panel">
        <div class="plot-grid" style="grid-template-columns: repeat(${grid.width}, 1fr);">
          ${grid.slots.map(s => slotHtml(s)).join('')}
        </div>
      </div>

      <div class="panel">
        <h2>Render town</h2>
        <p class="small muted">Generate a full-res image of the town layout via local SD.</p>
        <button id="render-btn" class="btn-small btn-primary" data-tooltip="Local Stable Diffusion renders the full town grid as a single overhead image. Hash-cached so repeat clicks reuse the cached image until you change slots.">Render town →</button>
        <div id="town-render-slot"></div>
      </div>
    `;

    // Wire visit buttons — clicking the slot or the Visit button both navigate
    el.querySelectorAll('[data-visit]').forEach(b => {
      b.onclick = (ev) => {
        ev.preventDefault();
        ev.stopPropagation();
        window.DMTHRouter.go('hunt', { stage: 'location', loc: b.dataset.visit });
      };
    });

    // turf access + buyout moved to the property storefront (#property / Bloodland
    // Holdings) in the Stores hub; the town map just links there. The buy handlers used to live here.

    // town action: case the streets for loose loot (generic + rare full-catalog pulls).
    const caseBtn = el.querySelector('#case-streets');
    if (caseBtn) caseBtn.onclick = () => {
      const r = window.DMTHGame.loot.scavengeLocation('__town__');
      if (!r.ok && window.DMTHNotify) window.DMTHNotify.show(`🔦 ${r.reason || 'nothing on the streets right now'}.`, { type: 'info', durationMs: 3000 });
    };

    // Lazy-load cover images (if dropped into assets/locations/<id>/cover.*)
    if (window.DMTHAssetImg) window.DMTHAssetImg.decorate(el, 64);

    const renderBtn = el.querySelector('#render-btn');
    renderBtn.onclick = async () => {
      const slot = el.querySelector('#town-render-slot');
      slot.innerHTML = `<p class="small muted">Generating town image…</p>`;
      const prompt = window.DMTHGame.townPlot.renderPrompt(grid);
      const hash = window.DMTHGame.townPlot.hashGrid(grid);
      const r = await window.DMTHGame.imaging.renderEnvironment({ kind: 'town', prompt, hash });
      if (r.url) {
        const hint = r.cached ? ' (cached)' : '';
        slot.innerHTML = `<img src="${r.url}" alt="town" class="gen-img" onerror="this.outerHTML='<p class=\\'small danger\\'>image load failed — check the local SD server on 127.0.0.1:7860.</p>'" /><p class="small muted">${hint}</p>`;
      } else {
        slot.innerHTML = `<p class="small danger">Render failed: ${r.error || 'unknown'}</p>`;
      }
    };
  }

  function slotHtml(s) {
    if (!s.filled) {
      return `<div class="plot-slot empty" style="grid-column:${s.x+1};grid-row:${s.y+1}">
        <div class="small muted">—</div>
      </div>`;
    }
    const diff = s.subcategory === 'easy' ? '🟢' : s.subcategory === 'medium' ? '🟡' : '🔴';
    // the player-facing name is this playthrough's rolled location name (state.locationName
    // self-falls-back to the catalog displayName when there's no pool / no state).
    const label = (window.DMTHGame.state && window.DMTHGame.state.locationName) ? window.DMTHGame.state.locationName(s.itemId) : s.label;
    // gated hunting grounds. Locked ones can't be visited until the level / roster /
    // purchase requirement is met; cost-gated ones show a Buy-access button.
    const prog = window.DMTHGame.progression;
    const locked = prog && !prog.isLocationUnlocked(s.itemId);
    if (locked) {
      const reason = prog.locationGateReason(s.itemId);
      const cost = prog.locationCost(s.itemId);
      return `<div class="plot-slot filled locked" style="grid-column:${s.x+1};grid-row:${s.y+1};opacity:.6" data-tooltip="🔒 ${reason.replace(/"/g, '&quot;')}">
        <div class="asset-slot slot-emoji" data-asset-category="location" data-asset-id="${s.itemId}" data-asset-size="64">${s.emoji}</div>
        <div class="slot-label">${label} 🔒</div>
        <div class="slot-meta small">${reason}</div>
        ${cost ? `<div class="small muted" data-tooltip="Property acquisition lives in the Stores hub now.">🗝️ Buy access ($${cost.toLocaleString()}) at <a href="#property">🏚️ Bloodland Holdings</a></div>` : ''}
      </div>`;
    }
    // once access is unlocked, you can BUY OUT the turf for perks. Owned turf shows
    // a badge + its perk package in the tooltip; un-owned shows a Buy-out button.
    const owns = prog && prog.ownsLocation && prog.ownsLocation(s.itemId);
    const boCost = prog && prog.buyOutCost ? prog.buyOutCost(s.itemId) : 0;
    const perkList = (prog && prog.OWNERSHIP_PERK_NAMES) ? prog.OWNERSHIP_PERK_NAMES.join(' · ') : '';
    const tip = owns
      ? `${label} (${zoneOf(s.itemId)}) — 🏴 YOUR TURF. Perks: ${perkList}`
      : `${label} — ${zoneOf(s.itemId)} zone · ${s.subcategory} difficulty. Click to visit + hunt.`;
    return `
      <div class="plot-slot filled${owns ? ' owned' : ''}" style="grid-column:${s.x+1};grid-row:${s.y+1}" data-tooltip="${tip.replace(/"/g, '&quot;')}">
        <button class="slot-visit-btn" data-visit="${s.itemId}" style="all:unset;cursor:pointer;display:block;width:100%">
          <div class="asset-slot slot-emoji" data-asset-category="location" data-asset-id="${s.itemId}" data-asset-size="64">${s.emoji}</div>
          <div class="slot-label">${label}${owns ? ' 🏴' : ''}</div>
          <div class="slot-meta">${diff} ${s.subcategory} · <span class="muted">${zoneOf(s.itemId)}</span></div>
        </button>
        ${owns
          ? `<div class="small ok" data-tooltip="You own this turf — ${perkList.replace(/"/g, '&quot;')}">🏴 Owned — perks active</div>`
          : (boCost ? `<div class="small muted" data-tooltip="Own the turf at the property storefront — 🙈 fewer witnesses, 💋 less WANTED, 🩸 better capture odds, 💰 a passive skim.">🏴 Buy out ($${boCost.toLocaleString()}) at <a href="#property">🏚️ Bloodland Holdings</a></div>` : '')}
      </div>
    `;
  }

  window.DMTHRouter.register('town', render);
})();
