// DUNGEON MASTER: THE HUNT — The Hustle: shady time-passing gigs .
// Queue up jobs, then run the night — each burns game-time, pays cash, maybe lifts stolen goods,
// and stacks WANTED. The shady money loop that isn't films / johns / the card / the sharks.

(function () {
  'use strict';

  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c])); }

  function render(el) {
    const G = window.DMTHGame;
    if (!G.gigs) { el.innerHTML = '<div class="panel"><p>Hustles unavailable.</p></div>'; return; }
    const fmt = m => (G.gameClock && G.gameClock.formatDuration) ? G.gameClock.formatDuration(m) : m + ' min';
    const gigs = G.gigs.listForDisplay();
    const q = G.gigs.queue();
    const GIGS = G.gigs.GIGS;
    // captives you can take along as crew; her Stockholm level scales the run.
    const captives = (G.state.current.roster || []).filter(x => x.encounterState === 'captive');

    el.innerHTML = `
      <div class="panel">
        <h2>🃏 The Hustle</h2>
        <p class="small muted">When films, johns, the card and the sharks aren't cutting it, you go to work the OTHER way. Line up jobs, then run the night — each one burns game-time, pays cash into your vault, maybe rips off stolen goods, and stacks WANTED heat. Bigger scores, bigger heat.</p>
      </div>
      <div class="panel">
        <h2>📋 Tonight's run (${q.length}/8)</h2>
        ${q.length
          ? `<div class="btn-col">${q.map((id, i) => `<div class="stat-row small"><span>${esc(GIGS[id] && GIGS[id].name || id)} <span class="muted">· ${fmt(GIGS[id] && GIGS[id].min || 0)}</span></span><button class="btn-small btn-danger" data-gig-del="${i}" data-tooltip="Drop this job from the run.">✕</button></div>`).join('')}</div>
            <div class="stat-row small" style="margin-top:8px" data-tooltip="Take a TRAINED captive along as crew — her Stockholm level scales pay + loot + the kidnap odds. A half-trained one (low Stockholm) might BOLT mid-job and get loose, so only bring the broken ones.">
              <span>🪢 Bring a girl (crew)</span>
              <select id="gig-crew" class="inline-select">
                <option value="">— none (solo) —</option>
                ${captives.map(c => `<option value="${c.id}">${esc(c.captiveName || c.name)} · Stockholm ${(((c.bond && c.bond.bondLevel) || 0) + 1)}/10</option>`).join('')}
              </select>
            </div>
            <div class="btn-row" style="margin-top:8px">
              <button class="btn-small btn-primary" id="gig-run" data-tooltip="Run every queued job back-to-back — game-time passes per job, cash + stolen loot + WANTED land.">💰 Run the night (${q.length})</button>
              <button class="btn-small" id="gig-clear" data-tooltip="Clear the queue.">Clear</button>
            </div>`
          : `<p class="sect-stub">Nothing lined up. Add jobs below, then run the night.</p>`}
      </div>
      <div class="panel">
        <h2>Available jobs</h2>
        <div class="girl-grid">
          ${gigs.map(g => `<div class="model-card${g.unlocked ? '' : ' locked'}" data-tooltip="${esc(g.notes)}">
            <div class="model-name">${g.unlocked ? '' : '🔒 '}${esc(g.name)}</div>
            <div class="model-meta">
              <span data-tooltip="Cash range this job pays">$${g.pay[0].toLocaleString()}-${g.pay[1].toLocaleString()}</span>
              <span data-tooltip="Game-time the job eats">${fmt(g.min)}</span>
              <span data-tooltip="Chance to lift a stolen item (up to tier ${g.lootTier})">${Math.round(g.lootChance * 100)}% loot</span>
              <span data-tooltip="WANTED heat added per run" class="${g.wanted >= 10 ? 'danger' : ''}">+${g.wanted} heat</span>
            </div>
            <button class="btn-small ${g.unlocked ? 'btn-primary' : ''}" data-gig-add="${g.id}" ${g.unlocked ? '' : 'disabled'} data-tooltip="${g.unlocked ? "Add to tonight's run." : 'Locked — reach DEPRAVITY level ' + g.levelReq}">${g.unlocked ? '+ Queue it' : '🔒 Level ' + g.levelReq}</button>
          </div>`).join('')}
        </div>
      </div>
    `;

    el.querySelectorAll('[data-gig-add]').forEach(b => b.onclick = () => { const r = G.gigs.enqueue(b.dataset.gigAdd); if (!r.ok) { alert(r.reason); return; } window.DMTHRouter.handle(); });
    el.querySelectorAll('[data-gig-del]').forEach(b => b.onclick = () => { G.gigs.dequeue(parseInt(b.dataset.gigDel, 10)); window.DMTHRouter.handle(); });
    const runB = el.querySelector('#gig-run'); if (runB) runB.onclick = () => { const crewSel = el.querySelector('#gig-crew'); const crewId = crewSel ? crewSel.value : ''; const r = G.gigs.runQueue(crewId || null); if (!r.ok) { alert(r.reason); return; } window.DMTHRouter.handle(); };
    const clrB = el.querySelector('#gig-clear'); if (clrB) clrB.onclick = () => { G.gigs.clear(); window.DMTHRouter.handle(); };
    if (window.DMTHAssetImg) window.DMTHAssetImg.decorate(el, 80);
  }

  window.DMTHRouter.register('gigs', render);
})();
