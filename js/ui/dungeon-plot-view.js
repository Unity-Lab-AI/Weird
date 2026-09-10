// DUNGEON MASTER: THE HUNT — per-dungeon interior plot-grid page.

(function () {
  'use strict';

  function render(el, params) {
    const dungeonId = params.dungeon;
    const dungeon = window.DMTHGame.state.getDungeon(dungeonId);
    if (!dungeon) { el.innerHTML = `<p>no such dungeon · <a href="#dungeon">Dungeons</a></p>`; return; }
    const tpl = window.DMTHAssets.getById('dungeon', dungeon.templateId);
    const grid = window.DMTHGame.dungeonPlot.buildGrid(dungeon);
    const money = window.DMTHGame.state.current.wallet.money;

    el.innerHTML = `
      <div class="panel">
        <h2>${tpl?.emoji || '⛓️'} ${tpl?.displayName} — interior plot</h2>
        <p class="small muted">Hold cells auto-placed. Add facility slots where empty. Render the interior as a local SD image when you want.</p>
        <div class="btn-row">
          <a href="#upgrade?dungeon=${dungeonId}" class="btn-small">← upgrades</a>
        </div>
      </div>

      <div class="panel">
        <h2>Plot</h2>
        <div class="plot-grid" style="grid-template-columns: repeat(${grid.width}, 1fr);">
          ${grid.slots.map(s => slotHtml(s, dungeon, money)).join('')}
        </div>
      </div>

      <div class="panel">
        <h2>Add facility</h2>
        <div class="girl-grid">
          ${window.DMTHGame.dungeonPlot.INTERIOR_ITEMS.filter(i => i.category === 'facility').map(f => `
            <div class="model-card">
              <div class="asset-slot slot-emoji" data-asset-category="facility" data-asset-id="${f.id}" data-asset-size="90" style="font-size:2rem" title="Click to view / generate this facility's image">${f.emoji}</div>
              <div class="model-name">${f.displayName}</div>
              <div class="model-notes small">${f.promptTokens}</div>
              <div class="stat-row small"><span>Cost</span><b>$${f.cost.toLocaleString()}</b></div>
              <p class="small muted">Click the icon to view its image · click an empty slot above, then Prepare to place.</p>
              <button class="btn-small ${money >= f.cost ? 'btn-primary' : ''}" data-add-facility="${f.id}" ${money >= f.cost ? '' : 'disabled'}>
                ${money >= f.cost ? 'Prepare' : (window.DMTHGame.state.brokeShort ? window.DMTHGame.state.brokeShort() : 'broke')}
              </button>
            </div>
          `).join('')}
        </div>
        <div class="small muted" id="place-status"></div>
      </div>

      <div class="panel">
        <h2>Room styles</h2>
        <p class="small muted">The room style each hold can wear (set per-hold from upgrades). Click any icon to view / generate its image.</p>
        <div class="girl-grid">
          ${window.DMTHGame.dungeonPlot.INTERIOR_ITEMS.filter(i => i.category === 'room').map(r => `
            <div class="model-card" style="text-align:center">
              <div class="asset-slot slot-emoji" data-asset-category="room" data-asset-id="${r.id}" data-asset-size="90" style="font-size:2rem" title="Click to view / generate this room style's image">${r.emoji}</div>
              <div class="model-name">${r.displayName}</div>
              <div class="stat-row small"><span>Cost</span><b>$${r.cost.toLocaleString()}</b></div>
            </div>
          `).join('')}
        </div>
      </div>

      <div class="panel">
        <h2>Render dungeon interior</h2>
        <button id="render-btn" class="btn-small ${window.DMTHGame.imaging.isAvailable() ? 'btn-primary' : ''}" ${window.DMTHGame.imaging.isAvailable() ? '' : 'disabled'}>
          ${window.DMTHGame.imaging.isAvailable() ? 'Render interior →' : 'Start local SD server first'}
        </button>
        <div id="dungeon-render-slot"></div>
      </div>
    `;

    // Click-to-prepare flow: select a facility template, then click an empty slot to place it.
    let preparedFacility = null;
    el.querySelectorAll('[data-add-facility]').forEach(b => {
      b.onclick = () => {
        preparedFacility = b.dataset.addFacility;
        el.querySelector('#place-status').textContent = `Prepared: ${preparedFacility}. Click an empty slot above to place.`;
      };
    });
    el.querySelectorAll('[data-empty-slot]').forEach(slotBtn => {
      slotBtn.onclick = () => {
        if (!preparedFacility) { alert('Pick a facility below first'); return; }
        const [x, y] = slotBtn.dataset.emptySlot.split(',').map(Number);
        try {
          window.DMTHGame.dungeonPlot.placeFacility(dungeonId, x, y, preparedFacility);
          preparedFacility = null;
          window.DMTHRouter.handle();
        } catch (e) { alert(e.message); }
      };
    });
    el.querySelectorAll('[data-remove-facility]').forEach(b => {
      b.onclick = () => {
        const [x, y] = b.dataset.removeFacility.split(',').map(Number);
        window.DMTHGame.dungeonPlot.removeFacility(dungeonId, x, y);
        window.DMTHRouter.handle();
      };
    });

    const renderBtn = el.querySelector('#render-btn');
    if (renderBtn) renderBtn.onclick = async () => {
      const slot = el.querySelector('#dungeon-render-slot');
      slot.innerHTML = `<p class="small muted">Generating interior image…</p>`;
      const prompt = window.DMTHGame.dungeonPlot.renderPrompt(dungeon, grid);
      const hash = window.DMTHGame.dungeonPlot.hashGrid(grid);
      const r = await window.DMTHGame.imaging.renderEnvironment({ kind: `dungeon-${dungeonId}`, prompt, hash });
      if (r.url) slot.innerHTML = `<img src="${r.url}" alt="interior" class="gen-img" />${r.cached ? '<p class="small muted">cached</p>' : ''}`;
      else      slot.innerHTML = `<p class="small danger">render failed: ${r.error}</p>`;
    };

    // Every room-style + facility icon → clickable button that pops its image up big (generating
    // it live if needed). This is the contextual home for rooms + facilities.
    if (window.DMTHAssetImg) window.DMTHAssetImg.decorate(el, 90);
  }

  function slotHtml(s, dungeon, money) {
    if (!s.filled) {
      return `<button data-empty-slot="${s.x},${s.y}" class="plot-slot empty" style="grid-column:${s.x+1};grid-row:${s.y+1}">
        <div class="small muted">empty</div>
      </button>`;
    }
    if (s.category === 'room') {
      return `<a href="#upgrade?dungeon=${dungeon.id}&hold=${s.holdIdx}" class="plot-slot filled" style="grid-column:${s.x+1};grid-row:${s.y+1}">
        <div class="slot-emoji">${s.emoji}</div>
        <div class="slot-label">${s.label}</div>
      </a>`;
    }
    return `<div class="plot-slot filled" style="grid-column:${s.x+1};grid-row:${s.y+1}">
      <div class="slot-emoji">${s.emoji}</div>
      <div class="slot-label">${s.label}</div>
      <button class="btn-small" data-remove-facility="${s.x},${s.y}">Remove</button>
    </div>`;
  }

  window.DMTHRouter.register('dungeon-plot', render);
})();
