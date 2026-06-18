// DUNGEON MASTER: THE HUNT — Trophy Room.
// The collection of trophies minted from terminal disposals. Each is unique to the girl's
// type + personality and grants stacking player perks. Top panel shows the AGGREGATE active
// perks; the grid shows every trophy earned.

(function () {
  'use strict';

  const PERK_LABEL = {
    wantedDecayBonus:        '🚨 WANTED cools faster',
    filmPriceMul:            '🎬 Film prices up',
    johnCadenceBonus:        '👥 Johns arrive faster',
    escapeContainmentBonus:  '🔒 Tighter containment',
    shopDiscount:            '🛒 Shop discount',
    healBonus:               '💊 Faster healing'
  };

  function render(el) {
    const trophies = (window.DMTHGame.state.getTrophies ? window.DMTHGame.state.getTrophies() : []).slice().reverse();
    const perks = window.DMTHGame.trophies ? window.DMTHGame.trophies.activePerks() : null;

    const perkRows = [];
    if (perks) {
      if (perks.huntBonus.all > 0) perkRows.push(`<div class="stat-row"><span>🎯 Hunt odds (all)</span><b class="ok">+${Math.round(perks.huntBonus.all * 100)}%</b></div>`);
      for (const [arch, v] of Object.entries(perks.huntBonus.byArchetype)) {
        if (v > 0) perkRows.push(`<div class="stat-row"><span>🎯 Hunt odds vs ${arch}</span><b class="ok">+${Math.round(v * 100)}%</b></div>`);
      }
      for (const key of Object.keys(PERK_LABEL)) {
        if ((perks[key] || 0) > 0) perkRows.push(`<div class="stat-row"><span>${PERK_LABEL[key]}</span><b class="ok">+${Math.round(perks[key] * 100)}%</b></div>`);
      }
    }

    el.innerHTML = `
      <div class="panel">
        <h2>🏆 Trophy Room</h2>
        <p class="small muted">Every girl you retire for good leaves a trophy — unique to her type and personality. Their perks stack across the whole collection. ${trophies.length} earned.</p>
      </div>

      <div class="panel">
        <h2>Active perks (stacked)</h2>
        ${perkRows.length ? perkRows.join('') : `<p class="muted small">No perks yet — put a captive in the ground for good (bury / incinerate / dump at sea / snuff finale) to carve your first trophy off her.</p>`}
      </div>

      <div class="panel">
        <h2>Collection (${trophies.length})</h2>
        ${trophies.length === 0 ? `<p class="muted small">Empty. The shelf is waiting.</p>` :
          `<div class="girl-grid">${trophies.map(renderTrophy).join('')}</div>`
        }
      </div>
    `;
  }

  function renderTrophy(t) {
    const when = Math.max(0, Math.round((Date.now() - (t.mintedAt || Date.now())) / 86400000));
    const perkText = (t.perks || []).map(p => {
      const lbl = p.key === 'huntBonus' ? (p.target ? `hunt vs ${p.target}` : 'hunt odds') : (PERK_LABEL[p.key] || p.key);
      return `${lbl} +${Math.round(p.value * 100)}%`;
    }).join(' · ');
    return `<div class="model-card" data-tooltip="${escapeHtml(t.flavor || '')}">
      <div class="model-name">${t.rarityEmoji || ''} ${t.emoji} ${escapeHtml(t.name)}</div>
      <div class="small muted">${escapeHtml(t.girlName || '')} · ${escapeHtml(t.archetype || '')}${t.affect ? ` · ${escapeHtml(t.affect)}` : ''} · ${escapeHtml(t.rarity || 'common')}</div>
      <div class="small" style="margin:4px 0;font-style:italic">"${escapeHtml(t.flavor || '')}"</div>
      <div class="small ok">${escapeHtml(perkText)}</div>
      <div class="small muted">via ${escapeHtml(t.method || '')} · bond L${t.bondAtEnd || 0} · held ${t.daysHeld || 0}d · ${when}d ago</div>
    </div>`;
  }

  function escapeHtml(s) {
    return String(s ?? '').replace(/[&<>"']/g, c => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[c]));
  }

  window.DMTHRouter.register('trophy-room', render);
})();
