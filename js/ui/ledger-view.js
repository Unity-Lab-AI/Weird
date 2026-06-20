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
      ${(() => {
        // the revolving credit card, surfaced + payable right here in the finance tab.
        const cr = G.state.getCredit ? G.state.getCredit() : null;
        if (!cr) return '';
        const avail = G.state.creditAvailable ? G.state.creditAvailable() : Math.max(0, cr.limit - cr.balance);
        const usedPct = cr.limit > 0 ? Math.round((cr.balance / cr.limit) * 100) : 0;
        return `<div class="panel">
          <h2>💳 The Plastic <span class="small muted">— filthy credit for when your pockets run dry</span></h2>
          <div class="stat-row" data-tooltip="Your revolving credit line. Charge it at checkout when you're cash-short; the limit GROWS the more you pay it off + use it."><span>Limit</span><b>$${cr.limit.toLocaleString()}</b></div>
          <div class="stat-row" data-tooltip="What you currently owe on the card. Pay it down with cash to grow your limit."><span>Owed</span><b class="${cr.balance > 0 ? 'bad' : 'ok'}">$${cr.balance.toLocaleString()}</b></div>
          <div class="bar"><div class="bar-fill ${usedPct >= 90 ? 'danger' : usedPct >= 60 ? 'warn' : ''}" style="width:${usedPct}%;background:${usedPct >= 90 ? '#c0392b' : '#8e44ad'}"></div></div>
          <div class="stat-row" data-tooltip="Credit still available to charge right now."><span>Available</span><b class="ok">$${avail.toLocaleString()}</b></div>
          ${cr.balance > 0 ? `<div class="btn-row" style="margin-top:6px;flex-wrap:wrap;gap:4px">
            <button class="btn-small btn-primary" data-pay-credit="all" data-tooltip="Pay off as much of the card as your cash covers — paying it down grows your limit the most.">Pay it down (all)</button>
            ${[100, 500, 2000].filter(a => a < cr.balance).map(a => `<button class="btn-small" data-pay-credit="${a}" data-tooltip="Pay $${a.toLocaleString()} toward the card.">Pay $${a.toLocaleString()}</button>`).join('')}
          </div>` : `<p class="small muted">Paid off — clean. Charge it at checkout when you're short, then pay it down here to grow the limit.</p>`}
        </div>`;
      })()}
      ${(() => {
        // Pocket ↔ Vault cash movement. Your money lives in the home vault; carry cash
        // in pocket to pay in the field without a run-home trip. Withdraw here is FREE (you're home).
        const St = G.state;
        const pocket = St.getPocket ? St.getPocket() : 0;
        const vault = St.getVault ? St.getVault() : ((G.state.current.wallet && G.state.current.wallet.money) || 0);
        return `<div class="panel">
          <h2>💵 Pocket &amp; 🏦 Vault</h2>
          <p class="small muted">Your money lives in the home VAULT — all income lands there. Carry CASH IN POCKET to pay at the Bloc without a run-home trip. Withdraw a wad here (free, you're home), then pay 💵 Pocket out in the field.</p>
          <div class="stat-row" data-tooltip="Cash on you — spendable in the field (the 💵 Pocket pay option)."><span>💵 Pocket</span><b>$${pocket.toLocaleString()}</b></div>
          <div class="stat-row" data-tooltip="The home vault — all income lands here; at-home spends + the 🏦 run-home pay option pull from it."><span>🏦 Vault</span><b>$${vault.toLocaleString()}</b></div>
          <div class="btn-row" style="flex-wrap:wrap;gap:4px;margin-top:6px">
            ${[500, 2000, 10000].filter(a => vault >= a).map(a => `<button class="btn-small" data-withdraw="${a}" data-tooltip="Move $${a.toLocaleString()} from the vault into your pocket.">Withdraw $${a.toLocaleString()}</button>`).join('')}
            ${vault > 0 ? `<button class="btn-small btn-primary" data-withdraw="all" data-tooltip="Empty the whole vault into your pocket.">Withdraw all</button>` : ''}
            ${pocket > 0 ? `<button class="btn-small" data-deposit="all" data-tooltip="Stash all your pocket cash back in the vault.">Stash pocket → vault</button>` : ''}
          </div>
        </div>`;
      })()}
      ${(() => {
        // shady cash at a brutal vig, on a deadline. Borrow / pay down right here.
        const LS = G.loanshark;
        if (!LS) return '';
        const sharks = LS.listForDisplay();
        const owe = LS.totalOwed();
        return `<div class="panel">
          <h2>🦈 Loan Sharks ${owe > 0 ? `<span class="bad small">— you owe $${owe.toLocaleString()}</span>` : ''}</h2>
          <p class="small muted">Dry pockets, maxed card? The sharks front you cash NOW at a brutal daily vig — on a clock. Miss the deadline and the leg-breakers come, and the heat climbs the longer you stiff them.</p>
          ${sharks.map(sh => {
            const take1 = Math.min(1000, sh.available);
            return `<div class="stat-row small" data-tooltip="${esc(sh.notes)}">
              <span>${esc(sh.displayName)} <span class="muted">· ${Math.round(sh.vigPerDay * 100)}%/day · ${sh.dueDays}d</span>${sh.owed > 0 ? ` <b class="${sh.overdue ? 'bad' : 'warn'}">owe $${sh.owed.toLocaleString()}${sh.overdue ? ' · OVERDUE' : ''}</b>` : ''}</span>
              <span style="display:inline-flex;gap:4px;flex-wrap:wrap">
                ${take1 > 0 ? `<button class="btn-small" data-loan-take="${sh.id}" data-loan-amt="${take1}" data-tooltip="Borrow $${take1.toLocaleString()}.">Borrow $${take1.toLocaleString()}</button>` : ''}
                ${sh.available >= 5000 ? `<button class="btn-small" data-loan-take="${sh.id}" data-loan-amt="5000" data-tooltip="Borrow $5,000.">$5k</button>` : ''}
                ${sh.owed > 0 ? `<button class="btn-small btn-primary" data-loan-pay="${sh.id}" data-tooltip="Pay this shark down with your cash.">Pay down</button>` : ''}
              </span>
            </div>`;
          }).join('')}
        </div>`;
      })()}
      ${(() => {
        // the inventory vault, built into the fabric of the finance tab. Everything
        // you're holding, stashed in the books beside the money.
        const inv = (G.state.current && G.state.current.inventory) || {};
        const ids = Object.keys(inv).filter(id => (inv[id] || 0) > 0).sort();
        const nameOf = id => {
          const it = window.DMTHAssets && window.DMTHAssets.getById ? window.DMTHAssets.getById('item', id) : null;
          if (it) return { emoji: it.emoji || '📦', name: it.displayName || id };
          const toy = window.DMTHGame.toys && window.DMTHGame.toys.spec ? window.DMTHGame.toys.spec(id) : null;
          if (toy) return { emoji: toy.emoji || '🧰', name: toy.name || id };
          const out = (window.DMTHGame.wardrobe && window.DMTHGame.wardrobe.catalog) ? window.DMTHGame.wardrobe.catalog().find(o => o.id === id) : null;
          if (out) return { emoji: '🧵', name: out.displayName || id };
          return { emoji: '📦', name: id.replace(/-/g, ' ') };
        };
        const rows = ids.length
          ? ids.map(id => { const n = nameOf(id); return `<div class="stat-row small"><span>${n.emoji} ${esc(n.name)}</span><b>×${inv[id]}</b></div>`; }).join('')
          : '<p class="sect-stub">Empty — go take everything you can carry.</p>';
        return `<div class="panel">
          <h2>🗄️ The Vault <span class="small muted">— everything you're holding, stashed in the books (${ids.length})</span></h2>
          <div style="max-height:42vh;overflow-y:auto">${rows}</div>
        </div>`;
      })()}
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

    // pay the card down (grows the limit). "all" pays as much as cash covers.
    el.querySelectorAll('[data-pay-credit]').forEach(b => b.onclick = () => {
      const cur = G.state.getCredit();
      const amt = b.dataset.payCredit === 'all' ? cur.balance : (parseInt(b.dataset.payCredit, 10) || 0);
      const r = G.state.payCredit(amt);
      if (!r.ok) { alert(r.reason); return; }
      if (window.DMTHNotify) window.DMTHNotify.show(`💳 Paid $${r.paid.toLocaleString()} on the card — you owe $${r.balance.toLocaleString()}, limit now $${r.limit.toLocaleString()}.`, { type: 'success', durationMs: 4500 });
      render(el);
    });

    // withdraw vault → pocket (free at home) / stash pocket → vault.
    el.querySelectorAll('[data-withdraw]').forEach(b => b.onclick = () => {
      const v = b.dataset.withdraw;
      const amt = v === 'all' ? G.state.getVault() : (parseInt(v, 10) || 0);
      const r = G.state.withdrawFromVault(amt);
      if (!r.ok) { alert(r.reason); return; }
      render(el);
    });
    el.querySelectorAll('[data-deposit]').forEach(b => b.onclick = () => {
      const r = G.state.depositToVault(G.state.getPocket());
      if (!r.ok) { alert(r.reason); return; }
      render(el);
    });

    // borrow from / pay down a shark.
    el.querySelectorAll('[data-loan-take]').forEach(b => b.onclick = () => {
      const r = G.loanshark.take(b.dataset.loanTake, parseInt(b.dataset.loanAmt, 10) || 0);
      if (!r.ok) { alert(r.reason); return; }
      render(el);
    });
    el.querySelectorAll('[data-loan-pay]').forEach(b => b.onclick = () => {
      const id = b.dataset.loanPay;
      const r = G.loanshark.pay(id, G.loanshark.owedTo(id));
      if (!r.ok) { alert(r.reason); return; }
      render(el);
    });
  }

  window.DMTHRouter.register('ledger', render);
})();
