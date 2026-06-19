// DUNGEON MASTER: THE HUNT — The Blood Ledger: a real, full, categorized + sortable + filterable
// money tab. Opens from the top-bar money chip (not the dashboard). EVERY credit and debit is
// listed with its category, cause, signed amount and the running balance after it.

(function () {
  'use strict';

  let filterCat = 'all';
  let sortKey = 'time';     // 'time' | 'amount'
  let sortDir = 'desc';     // 'desc' | 'asc'

  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c])); }
  function fmtStamp(gm) { const c = window.DMTHGame.gameClock; return (c && c.formatStamp && gm != null) ? c.formatStamp(gm) : ''; }
  function catOf(e) { return e.category || (window.DMTHGame.state.categorizeLedger ? window.DMTHGame.state.categorizeLedger(e.reason) : 'Other'); }
  function cleanReason(r) { return String(r || 'misc').replace(/[:|].*$/, '').replace(/-/g, ' '); }

  function render(el) {
    const G = window.DMTHGame;
    const led = (G.state && G.state.getLedger) ? G.state.getLedger() : [];
    const bal = (G.state.current && G.state.current.wallet && G.state.current.wallet.money) || 0;

    const totalIn = led.filter(e => e.delta > 0).reduce((a, e) => a + e.delta, 0);
    const totalOut = led.filter(e => e.delta < 0).reduce((a, e) => a + Math.abs(e.delta), 0);

    // Per-category tallies for the filter chips.
    const cats = {};
    led.forEach(e => {
      const c = catOf(e);
      if (!cats[c]) cats[c] = { in: 0, out: 0, n: 0 };
      if (e.delta >= 0) cats[c].in += e.delta; else cats[c].out += Math.abs(e.delta);
      cats[c].n++;
    });
    const catNames = Object.keys(cats).sort();

    let rows = led.slice();
    if (filterCat !== 'all') rows = rows.filter(e => catOf(e) === filterCat);
    rows.sort((a, b) => {
      const av = sortKey === 'amount' ? Math.abs(a.delta) : (a.at || 0);
      const bv = sortKey === 'amount' ? Math.abs(b.delta) : (b.at || 0);
      return sortDir === 'asc' ? av - bv : bv - av;
    });

    // If a category is filtered, show that category's own in/out subtotal.
    const filtIn = rows.filter(e => e.delta > 0).reduce((a, e) => a + e.delta, 0);
    const filtOut = rows.filter(e => e.delta < 0).reduce((a, e) => a + Math.abs(e.delta), 0);

    const rowsHtml = rows.length ? rows.map(e => {
      const t = fmtStamp(e.gameMin);
      const c = catOf(e);
      return `<div class="stat-row small">
        <span>${e.delta >= 0 ? '➕' : '➖'} <b>${esc(c)}</b> · ${esc(cleanReason(e.reason))}${t ? ` <span class="muted">· ${esc(t)}</span>` : ''}</span>
        <span><b class="${e.delta >= 0 ? 'ok' : 'bad'}">${e.delta >= 0 ? '+' : '−'}$${Math.abs(e.delta).toLocaleString()}</b> <span class="muted">→ $${(e.balance || 0).toLocaleString()}</span></span>
      </div>`;
    }).join('') : '<p class="sect-stub">No money has moved yet — go bleed someone for a dollar.</p>';

    el.innerHTML = `
      <div class="panel">
        <h2>📒 The Blood Ledger <span class="small muted">— every filthy dollar in and out, balanced to the cent</span></h2>
        <div class="dash-stats">
          <div class="panel"><h2>💵 Bled in</h2><div class="big-num ok">+$${totalIn.toLocaleString()}</div></div>
          <div class="panel"><h2>🩸 Bled out</h2><div class="big-num bad">−$${totalOut.toLocaleString()}</div></div>
          <div class="panel"><h2>⚖️ On hand</h2><div class="big-num">$${bal.toLocaleString()}</div></div>
        </div>
        <p class="small muted">Net of everything ever: <b class="${totalIn - totalOut >= 0 ? 'ok' : 'bad'}">${totalIn - totalOut >= 0 ? '+' : '−'}$${Math.abs(totalIn - totalOut).toLocaleString()}</b>.</p>
        ${(() => {
          const w = G.wanted ? G.wanted.describe() : null;
          const bq = (w && w.level > 0 && G.wanted.bribeQuote) ? G.wanted.bribeQuote(15) : null;
          return bq ? `<div class="btn-row" style="margin-top:6px"><button class="btn-small" data-bribe data-tooltip="Grease the right filthy palms — WANTED −${bq.drop} for $${bq.cost.toLocaleString()} (cost climbs with your tier). Or lay off hunting + be sweet to your girls to cool it for free.">💵 Bribe your heat down — WANTED −${bq.drop} ($${bq.cost.toLocaleString()})</button></div>` : '';
        })()}
      </div>
      <div class="panel">
        <div class="btn-row" style="flex-wrap:wrap;gap:4px" data-tooltip="Filter the books by where the money came from or went.">
          <button class="btn-small ${filterCat === 'all' ? 'btn-primary' : ''}" data-cat="all">All (${led.length})</button>
          ${catNames.map(c => `<button class="btn-small ${filterCat === c ? 'btn-primary' : ''}" data-cat="${esc(c)}">${esc(c)} (${cats[c].n})</button>`).join('')}
        </div>
        <div class="btn-row" style="margin-top:6px;flex-wrap:wrap;gap:4px">
          <span class="small muted">Sort:</span>
          <button class="btn-small ${sortKey === 'time' ? 'btn-primary' : ''}" data-sort="time">Time</button>
          <button class="btn-small ${sortKey === 'amount' ? 'btn-primary' : ''}" data-sort="amount">Amount</button>
          <button class="btn-small" data-dir data-tooltip="Flip the order.">${sortDir === 'desc' ? '▼ newest / biggest first' : '▲ oldest / smallest first'}</button>
          ${filterCat !== 'all' ? `<span class="small muted" style="margin-left:auto">${esc(filterCat)}: <b class="ok">+$${filtIn.toLocaleString()}</b> / <b class="bad">−$${filtOut.toLocaleString()}</b></span>` : ''}
        </div>
        <div style="max-height:58vh;overflow-y:auto;margin-top:8px">${rowsHtml}</div>
      </div>
    `;

    el.querySelectorAll('[data-cat]').forEach(b => b.onclick = () => { filterCat = b.dataset.cat; render(el); });
    el.querySelectorAll('[data-sort]').forEach(b => b.onclick = () => { sortKey = b.dataset.sort; render(el); });
    const dir = el.querySelector('[data-dir]');
    if (dir) dir.onclick = () => { sortDir = sortDir === 'desc' ? 'asc' : 'desc'; render(el); };
    const bribe = el.querySelector('[data-bribe]');
    if (bribe) bribe.onclick = () => { const r = window.DMTHGame.wanted.bribe(15); if (!r.ok) { alert(r.reason); return; } render(el); };
  }

  window.DMTHRouter.register('ledger', render);
})();
