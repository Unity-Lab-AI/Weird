// DUNGEON MASTER: THE HUNT — roster page. All collected girls.

(function () {
  'use strict';

  // One sortable girls list — sort by name / Stockholm level / time held, ascending or descending.
  let sortKey = 'held';   // 'name' | 'level' | 'held'
  let sortDir = 'desc';   // 'asc' | 'desc'

  function daysHeldOf(g) {
    const ls = window.DMTHGame.lifespan ? window.DMTHGame.lifespan.describeLifespan(g) : null;
    if (ls && typeof ls.daysCaptive === 'number') return ls.daysCaptive;
    return g.captureDate ? (Date.now() - g.captureDate) : 0;
  }
  function sortGirls(list) {
    const dir = sortDir === 'asc' ? 1 : -1;
    return list.slice().sort((a, b) => {
      let cmp = 0;
      if (sortKey === 'name') cmp = String(a.name || '').localeCompare(String(b.name || ''));
      else if (sortKey === 'level') cmp = ((a.bond?.bondLevel || 0) - (b.bond?.bondLevel || 0));
      else cmp = (daysHeldOf(a) - daysHeldOf(b));   // held
      if (cmp === 0) cmp = String(a.name || '').localeCompare(String(b.name || ''));
      return cmp * dir;
    });
  }

  function render(el) {
    const s = window.DMTHGame.state.current;
    const roster = s.roster || [];
    const captives = roster.filter(g => g.encounterState === 'captive');
    const listed = roster.filter(g => s.slaveMarket.listed.some(l => l.girlId === g.id));
    const escaped = roster.filter(g => g.encounterState === 'escaped');
    const filter = new URLSearchParams(location.hash.split('?')[1]).get('filter');
    const active = sortGirls(filter === 'escaped' ? escaped : filter === 'listed' ? listed : captives);
    const sortBtn = (key, label) => `<button class="btn-small ${sortKey === key ? 'btn-primary' : ''}" data-sort="${key}" data-tooltip="Sort the list by ${label.toLowerCase()}.">${label}</button>`;

    el.innerHTML = `
      <div class="panel">
        <h2>📋 Roster · ${roster.length}</h2>
        <div class="tabs">
          <a href="#roster" class="tab active">Captives (${captives.length})</a>
          <a href="#roster?filter=listed" class="tab">Listed for sale (${listed.length})</a>
          <a href="#roster?filter=escaped" class="tab">Escaped (${escaped.length})</a>
        </div>
        <div class="btn-row" style="margin:8px 0;align-items:center;gap:6px;flex-wrap:wrap">
          <span class="small muted">Sort:</span>
          ${sortBtn('name', 'Name')}${sortBtn('level', 'Level')}${sortBtn('held', 'Time held')}
          <button class="btn-small" id="sort-dir" data-tooltip="Toggle order — top-to-bottom vs bottom-to-top.">${sortDir === 'asc' ? '⬆️ Asc' : '⬇️ Desc'}</button>
        </div>
        <div class="girl-grid">
          ${active.map(renderCard).join('')}
        </div>
      </div>

      <div class="panel">
        <h2>Disposal log (${s.disposals.length})</h2>
        ${s.disposals.length === 0 ? `<p class="muted small">No disposals yet.</p>` :
          `<ul class="small">${s.disposals.slice(-10).reverse().map(d =>
            `<li>${new Date(d.disposalDate).toLocaleDateString()} — <b>${d.girlNameAtDisposal}</b> — ${d.method} — Level ${d.finalBondLevel}${d.generatedFilmId ? ' · film recorded' : ''} · +${d.notorietyImpact} notoriety</li>`
          ).join('')}</ul>`
        }
      </div>
    `;

    el.querySelectorAll('[data-sort]').forEach(b => {
      b.onclick = () => { sortKey = b.dataset.sort; render(el); };
    });
    const dirBtn = el.querySelector('#sort-dir');
    if (dirBtn) dirBtn.onclick = () => { sortDir = sortDir === 'asc' ? 'desc' : 'asc'; render(el); };

    function renderCard(g) {
      const ls = window.DMTHGame.lifespan ? window.DMTHGame.lifespan.describeLifespan(g) : null;
      const preg = g.pregnancy || {};
      const pregBadge = preg.status === 'pregnant' ? ' 🤰' : '';
      const pregMeta = preg.status === 'pregnant'
        ? `<span class="muted small" data-tooltip="🤰 Pregnant — gestation day ${preg.gestationDays}/280 (trimester ${preg.trimester})">🤰Trimester ${preg.trimester} · day ${preg.gestationDays}</span>`
        : preg.status === 'aborted' ? `<span class="muted small" data-tooltip="Pregnancy aborted">⚪aborted</span>`
        : preg.status === 'miscarried' ? `<span class="muted small" data-tooltip="Miscarried (complication)">🩸miscarried</span>`
        : preg.status === 'birthed' ? `<span class="muted small" data-tooltip="Birthed">🍼birthed</span>`
        : preg.status === 'lost' ? `<span class="muted small" data-tooltip="Lost to authorities">🚨lost</span>`
        : '';
      return `
        <a class="girl-card" href="#room?girl=${g.id}">
          <div class="girl-emoji">${g.mood.moodEmoji}</div>
          <div class="girl-name">${g.name}${pregBadge}</div>
          <div class="girl-meta">
            <span data-tooltip="Stockholm rating Level ${g.bond.bondLevel}/9 — captivity bond level. Higher = lower escape risk + bigger pay multiplier when whoring out.">⛓ Stockholm Level ${g.bond.bondLevel}</span>
            <span>${window.DMTHGame.girlGen.archetypeLabel(g.archetypeTemplate)}</span>
            <span data-tooltip="Bruise count.">🩸${g.body.bruises}</span>
            ${ls ? `<span>${ls.daysCaptive} days held</span>` : ''}
            ${pregMeta}
          </div>
          ${ls ? `<div class="small muted">${ls.label}</div>` : ''}
          <div class="bar"><div class="bar-fill ${ls && ls.score < 30 ? 'danger' : ''}" style="width:${Math.round(((g.bond.bondXP % 50) / 50) * 100)}%"></div></div>
        </a>
      `;
    }
  }

  window.DMTHRouter.register('roster', render);
})();
