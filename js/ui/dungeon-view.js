// DUNGEON MASTER: THE HUNT — dungeon portfolio view. All owned hideouts + holds.

(function () {
  'use strict';

  function render(el) {
    const s = window.DMTHGame.state.current;
    const dungeons = s.dungeons;

    el.innerHTML = `
      <div class="panel">
        <h2>🏚️ Dungeon portfolio · ${dungeons.length}</h2>
        <p class="small muted">Predator hideouts. Hidden from prying eyes and ears.</p>
        ${dungeons.map(renderDungeon).join('')}
      </div>

      ${(() => {
        // AUTOLOGISTICS.1 — install + configure the auto-supply rig (sliders per kind).
        const sup = window.DMTHGame.supply;
        if (!sup || !sup.logisticsConfig) return '';
        const cfg = sup.logisticsConfig();
        if (!cfg.unlocked) {
          return `<div class="panel">
            <h2>🚚 Auto-Logistics</h2>
            <p class="small muted">Install the auto-logistics rig — every tick it pulls food / water / condoms from your inventory into EVERY dungeon's shared pool, up to your slider targets (best-value source first). Set it once, stop hand-stocking.</p>
            <button class="btn-small btn-primary" id="buy-logistics" data-tooltip="Install Auto-Logistics — $${sup.LOGISTICS_UNLOCK_COST.toLocaleString()}. Then set per-kind target sliders.">🚚 Install Auto-Logistics — $${sup.LOGISTICS_UNLOCK_COST.toLocaleString()}</button>
          </div>`;
        }
        const t = cfg.targets || { food: 20, water: 20, condoms: 10 };
        const slider = (kind, max) => `<div class="stat-row small" data-tooltip="Top every dungeon pool up to this many ${kind} units each tick (consumes matching inventory items)."><span>${kind}</span> <input type="range" id="log-${kind}" min="0" max="${max}" value="${t[kind] || 0}" style="flex:1"/> <b id="log-${kind}-val">${t[kind] || 0}</b></div>`;
        return `<div class="panel">
          <h2>🚚 Auto-Logistics ${cfg.enabled ? '<span class="ok small">· ON</span>' : '<span class="muted small">· off</span>'}</h2>
          <p class="small muted">Each tick, tops every dungeon pool up to these targets from your inventory.</p>
          <label class="field" style="flex-direction:row;gap:8px;align-items:center;cursor:pointer"><input type="checkbox" id="log-enabled" ${cfg.enabled ? 'checked' : ''}/> <span>Enabled</span></label>
          ${slider('food', 60)}${slider('water', 60)}${slider('condoms', 40)}
        </div>`;
      })()}

      <div class="panel">
        <h2>Available hideouts to acquire</h2>
        ${window.DMTHAssets.DUNGEONS
          .filter(t => !dungeons.some(d => d.templateId === t.id))
          .map(t => {
            const tooltip = `${t.notes || ''}`.replace(/"/g, '&quot;');
            return `<div class="model-card" data-tooltip="${tooltip}">
              <div class="model-name">${t.emoji} ${t.displayName}</div>
              <div class="model-meta">
                <span data-tooltip="Purchase cost">$${t.cost.toLocaleString()}</span>
                <span data-tooltip="Number of captive holds this dungeon provides at base capacity">${t.roomSlots} hold${t.roomSlots === 1 ? '' : 's'}</span>
                <span data-tooltip="Isolation — how far from civilization. Higher = lower suspicion when transporting captives.">iso ${Math.round((t.isolation || 0.5) * 100)}%</span>
                <span data-tooltip="Concealment — how hidden from accidental discovery. Higher = lower escape-aftermath notoriety.">conc ${Math.round((t.concealment || 0.5) * 100)}%</span>
              </div>
              <div class="model-notes">${t.notes}</div>
              <div class="asset-slot" data-asset-category="dungeon" data-asset-id="${t.id}" data-asset-size="140"></div>
              <button class="btn-small ${s.wallet.money >= t.cost ? 'btn-primary' : ''}" data-buy="${t.id}" ${s.wallet.money < t.cost ? 'disabled' : ''} data-tooltip="${s.wallet.money < t.cost ? 'Need $' + t.cost.toLocaleString() + ' — earn more from films + properties.' : 'Buy this hideout. Adds ' + t.roomSlots + ' empty hold' + (t.roomSlots === 1 ? '' : 's') + ' to your portfolio.'}">
                ${s.wallet.money < t.cost ? 'Insufficient funds' : 'Acquire →'}
              </button>
            </div>`;
          }).join('')}
      </div>
    `;

    function renderDungeon(d) {
      const tpl = window.DMTHAssets.getById('dungeon', d.templateId);
      return `
        <div class="model-card">
          <div class="model-name">${tpl?.emoji || '⛓️'} ${tpl?.displayName || d.templateId} <span class="muted small">— ${d.locationDescriptor}</span></div>
          <div class="model-meta">
            <span data-tooltip="Filled holds / total capacity">${d.holds.filter(h => h.captiveGirlId).length}/${d.capacity} held</span>
            <a href="#upgrade?dungeon=${d.id}" class="btn-small" data-tooltip="Configure per-hold upgrade tracks (security / restraints / lights / toys / food / toilet / waterSupply / feedAutomation / bedding / entertainment / decor / climate) + buy more capacity.">⚙️ Upgrades + capacity</a>
          </div>
          ${renderFacilities(d)}
          <div class="hold-grid">
            ${d.holds.map((h, i) => {
              const g = h.captiveGirlId ? window.DMTHGame.state.getGirl(h.captiveGirlId) : null;
              // Defensive reads — old saves may be missing fields the renderer assumes.
              // displayName recovers from name-as-archetype-id leaks (Unity_seed → Unity).
              const archetypeIdAsName = g && typeof g.name === 'string' && (
                g.name === g.archetypeTemplate ||
                /^[a-z_]+_seed$/i.test(g.name)
              );
              const displayName = g
                ? (archetypeIdAsName
                    ? (g.archetypeTemplate === 'unity_seed' ? 'Unity' : 'Captive')
                    : (g.name || 'Captive'))
                : '';
              const bondLevel = g?.bond?.bondLevel ?? 0;
              const moodEmoji = g?.mood?.moodEmoji ?? '🙂';
              const arch = g?.archetypeTemplate ?? '—';
              const holdType = h.holdType || 'cell';
              return `<div class="hold-slot ${g ? 'filled' : 'empty'}" data-tooltip="${g ? displayName + ' — L' + bondLevel + ' Stockholm rating, ' + arch + '. Click to enter her hold.' : 'Empty ' + holdType + ' hold. Assign a captive on successful hunt.'}">
                ${g
                  ? `<a href="#room?girl=${g.id}">${moodEmoji} ${displayName} <span class="muted small">L${bondLevel}</span></a>`
                  : `<span class="muted small">hold ${i+1} · empty · ${holdType}</span>`
                }
              </div>`;
            }).join('')}
          </div>
        </div>
      `;
    }

    function renderFacilities(d) {
      const ops = window.DMTHGame.dungeonOps;
      if (!ops || !ops.SECURITY_FACILITIES) return '';
      const money = s.wallet.money;
      const secRows = Object.entries(ops.SECURITY_FACILITIES).map(([id, f]) => {
        const owned = ops.hasSecurity(d, id);
        const tip = `${f.notes} (+${Math.round((f.containment||0)*100)}% containment, −${(f.wantedReduction||0).toFixed(2)} WANTED/tick)`.replace(/"/g, '&quot;');
        if (owned) return `<span class="ok small" data-tooltip="${tip}">✓ ${f.displayName}</span>`;
        return `<button class="btn-small" data-buy-sec="${id}" data-dungeon="${d.id}" ${money < f.cost ? 'disabled' : ''} data-tooltip="${tip}">${f.displayName} — $${f.cost.toLocaleString()}</button>`;
      }).join(' ');
      const dispRows = Object.entries(ops.DISPOSAL_FACILITIES || {}).map(([id, f]) => {
        const owned = ops.hasFacility(d, f.facilityKey);
        const tip = `${f.notes}`.replace(/"/g, '&quot;');
        if (owned) return `<span class="ok small" data-tooltip="${tip}">✓ ${f.displayName}</span>`;
        return `<button class="btn-small" data-buy-disp="${id}" data-dungeon="${d.id}" ${money < f.cost ? 'disabled' : ''} data-tooltip="${tip}">${f.displayName} — $${f.cost.toLocaleString()}</button>`;
      }).join(' ');
      return `<div class="facilities small" style="margin:6px 0">
        <div class="muted" data-tooltip="Dungeon-wide security — suppresses escape-risk + auto-contains breaks once invested. Guard dog is just one option.">🔒 Containment: ${secRows}</div>
        <div class="muted" style="margin-top:4px" data-tooltip="Build these to unlock the gated disposal methods.">⚱️ Disposal: ${dispRows}</div>
      </div>`;
    }

    // Lazy-load any cover images dropped into asset folders
    if (window.DMTHAssetImg) window.DMTHAssetImg.decorate(el, 140);

    // AUTOLOGISTICS.1 — install / toggle / configure the auto-supply rig.
    const buyLog = el.querySelector('#buy-logistics');
    if (buyLog) buyLog.onclick = () => { const r = window.DMTHGame.supply.unlockLogistics(); if (!r.ok) { alert(r.reason); return; } window.DMTHRouter.handle(); };
    const logEnabled = el.querySelector('#log-enabled');
    if (logEnabled) logEnabled.onchange = () => window.DMTHGame.state.setLogistics({ enabled: logEnabled.checked });
    ['food', 'water', 'condoms'].forEach(kind => {
      const sl = el.querySelector(`#log-${kind}`);
      if (!sl) return;
      sl.oninput = () => { const v = el.querySelector(`#log-${kind}-val`); if (v) v.textContent = sl.value; };
      sl.onchange = () => {
        const cur = window.DMTHGame.supply.logisticsConfig().targets || { food: 20, water: 20, condoms: 10 };
        window.DMTHGame.state.setLogistics({ targets: { ...cur, [kind]: parseInt(sl.value, 10) || 0 } });
      };
    });

    el.querySelectorAll('[data-buy-sec]').forEach(b => {
      b.onclick = () => {
        try { window.DMTHGame.dungeonOps.buySecurityFacility(b.dataset.dungeon, b.dataset.buySec); window.DMTHRouter.handle(); }
        catch (e) { alert(e.message); }
      };
    });
    el.querySelectorAll('[data-buy-disp]').forEach(b => {
      b.onclick = () => {
        try { window.DMTHGame.dungeonOps.buyDisposalFacility(b.dataset.dungeon, b.dataset.buyDisp); window.DMTHRouter.handle(); }
        catch (e) { alert(e.message); }
      };
    });

    el.querySelectorAll('[data-buy]').forEach(b => {
      b.onclick = () => {
        const tplId = b.dataset.buy;
        const tpl = window.DMTHAssets.getById('dungeon', tplId);
        if (!window.DMTHGame.state.spendMoney(tpl.cost, `buy-dungeon:${tplId}`)) {
          alert('Insufficient funds'); return;
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
          locationDescriptor: locationForTemplate(tpl.id),
          purchasedAt: Date.now()
        });
        window.DMTHRouter.handle();
      };
    });
  }

  function locationForTemplate(tplId) {
    const map = {
      'hole-in-the-desert':   'a remote stretch of desert 2 hours east',
      'woods-container':       'deep pine forest off an abandoned logging road',
      'basement-hidden-room':  'an unremarkable single-family house at 1147 Oak',
      'subway-service-room':   'sealed corridor under Line 4',
      'sewer-tunnel-locked':   'Victorian-era tunnel system under the old district',
      'coldwar-bunker':        '80-acre wooded parcel, the old civil-defense site',
      'abandoned-mine-shaft':  'the Boulder Creek claim, deeded wilderness',
      'remote-compound':       'off-grid mountain acreage, 15mi from nearest neighbor',
      'underground-complex':   'purpose-built facility under your legitimate front'
    };
    return map[tplId] || 'unspecified location';
  }

  window.DMTHRouter.register('dungeon', render);
})();
