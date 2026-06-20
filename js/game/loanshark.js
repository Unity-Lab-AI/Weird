// DUNGEON MASTER: THE HUNT — loan sharks + shady money .
// When your pockets AND your vault are dry and the card's maxed, you crawl to the sharks: instant
// cash at a brutal daily vig, on a clock. Pay it back before the deadline or the leg-breakers come —
// the debt keeps compounding and the heat climbs the longer you stiff them. A shady money SOURCE,
// distinct from earning it (films/johns) or charging it (the card). Loans live in wallet.loans[].

(function () {
  'use strict';

  // The sharks — escalating ceilings + viciousness, brutal-named per the game's register. `vigPerDay`
  // is the compounding daily interest; `dueDays` is the game-day grace before they come collecting;
  // `wantedPerDay` is the heat they put on you for every game-day you're overdue (the collection).
  const SHARKS = Object.freeze({
    gutterbank: {
      displayName: '🩸 The Gutterbank', max: 2000, vigPerDay: 0.06, dueDays: 5, wantedPerDay: 1.5,
      notes: 'Small-time gutter lender. A couple grand, 6% a day, five days to make good. Stiff him and he sends a kid with a bat.'
    },
    knuckles: {
      displayName: '🔨 Knuckles Moricano', max: 8000, vigPerDay: 0.09, dueDays: 7, wantedPerDay: 3,
      notes: 'Mid-tier breaker. Up to eight grand, 9% a day. Miss the date and he starts snapping fingers — heat follows the bodies.'
    },
    syndicate: {
      displayName: '⛓️ The Syndicate', max: 25000, vigPerDay: 0.12, dueDays: 10, wantedPerDay: 6,
      notes: 'The real money. Twenty-five grand if they like you, 12% a day. Default and they bury you in heat — and eventually in a hole.'
    }
  });

  function nowMin() {
    const c = window.DMTHGame.gameClock;
    return c && c.now ? c.now() : 0;
  }
  function loans() {
    const s = window.DMTHGame.state.current;
    return (s && Array.isArray(s.wallet.loans)) ? s.wallet.loans : [];
  }
  function owedTo(sharkId) {
    return loans().filter(l => l.sharkId === sharkId).reduce((t, l) => t + (l.owed || 0), 0);
  }
  function totalOwed() {
    return loans().reduce((t, l) => t + (l.owed || 0), 0);
  }
  // How much this shark will still front you (their ceiling minus what you already owe them).
  function available(sharkId) {
    const sh = SHARKS[sharkId];
    if (!sh) return 0;
    return Math.max(0, sh.max - owedTo(sharkId));
  }

  // Borrow — instant cash into the vault, a new loan on the books with its deadline.
  function take(sharkId, amount) {
    const sh = SHARKS[sharkId];
    if (!sh) return { ok: false, reason: 'no such lender' };
    amount = Math.round(amount || 0);
    if (amount <= 0) return { ok: false, reason: 'borrow how much?' };
    if (amount > available(sharkId)) return { ok: false, reason: `${sh.displayName} won't front you more than $${available(sharkId).toLocaleString()} right now` };
    const dueMin = nowMin() + sh.dueDays * 1440;
    window.DMTHGame.state.addMoney(amount, `loanshark:take:${sharkId}`);
    window.DMTHGame.state.addLoan({
      id: 'loan_' + sharkId + '_' + Math.round(nowMin()),
      sharkId, principal: amount, owed: amount,
      vigPerDay: sh.vigPerDay, takenMin: nowMin(), dueMin, overdueDriftDays: 0
    });
    if (window.DMTHNotify) window.DMTHNotify.show(`💵 Borrowed $${amount.toLocaleString()} from ${sh.displayName} — ${Math.round(sh.vigPerDay * 100)}%/day, due in ${sh.dueDays} game-days. Don't be late.`, { type: 'info', durationMs: 6000 });
    return { ok: true, amount, dueMin };
  }

  // Pay down — cash (vault) toward your oldest balance with this shark first.
  function pay(sharkId, amount) {
    const owe = owedTo(sharkId);
    amount = Math.min(Math.round(amount || 0), owe, window.DMTHGame.state.getVault ? window.DMTHGame.state.getVault() : (window.DMTHGame.state.current.wallet.money || 0));
    if (amount <= 0) return { ok: false, reason: owe <= 0 ? 'nothing owed to them' : (window.DMTHGame.state.brokeLine ? window.DMTHGame.state.brokeLine() : 'no cash') };
    if (!window.DMTHGame.state.spendMoney(amount, `loanshark:pay:${sharkId}`)) return { ok: false, reason: (window.DMTHGame.state.brokeLine ? window.DMTHGame.state.brokeLine() : 'broke') };
    window.DMTHGame.state.payDownLoans(sharkId, amount);
    const left = owedTo(sharkId);
    if (window.DMTHNotify) window.DMTHNotify.show(`💵 Paid ${SHARKS[sharkId].displayName} $${amount.toLocaleString()}${left > 0 ? ` — still owe $${left.toLocaleString()}` : ' — square. For now.'}`, { type: 'success', durationMs: 4500 });
    return { ok: true, amount, owed: left };
  }

  // Per-tick (+ reconcileSpan) accrual: the vig compounds on every open loan; once a loan is past its
  // deadline it ALSO bleeds WANTED — the collection heat — scaled by how long you've stiffed them.
  function accrue(dayFraction) {
    if (!(dayFraction > 0)) return;
    const ls = loans();
    if (!ls.length) return;
    const s = window.DMTHGame.state.current;
    s._loanDrift = s._loanDrift || {};
    let dirty = false;
    let overdueWanted = 0;
    for (const l of ls) {
      const sh = SHARKS[l.sharkId];
      if (!sh || !(l.owed > 0)) continue;
      // compound the vig (sub-dollar drift per loan so slow ticks still add up)
      const d = (s._loanDrift[l.id] || 0) + l.owed * sh.vigPerDay * dayFraction;
      const add = Math.floor(d);
      s._loanDrift[l.id] = d - add;
      if (add >= 1) { l.owed += add; dirty = true; }
      // overdue → collection heat
      if (nowMin() > l.dueMin) {
        overdueWanted += sh.wantedPerDay * dayFraction;
        l.overdueDriftDays = (l.overdueDriftDays || 0) + dayFraction;
        dirty = true;
      }
    }
    if (overdueWanted > 0 && window.DMTHGame.wanted) window.DMTHGame.wanted.accrue('loanshark-overdue', overdueWanted);
    if (dirty) { try { window.DMTHGame.state.save(); } catch (e) { /* non-fatal */ } }
  }

  // UI helper — each shark with live terms + your standing.
  function listForDisplay() {
    return Object.entries(SHARKS).map(([id, sh]) => ({
      id, displayName: sh.displayName, notes: sh.notes,
      vigPerDay: sh.vigPerDay, dueDays: sh.dueDays, max: sh.max,
      owed: owedTo(id), available: available(id),
      overdue: loans().some(l => l.sharkId === id && l.owed > 0 && nowMin() > l.dueMin)
    }));
  }

  window.DMTHGame = window.DMTHGame || {};
  window.DMTHGame.loanshark = Object.freeze({
    SHARKS, loans, owedTo, totalOwed, available, take, pay, accrue, listForDisplay
  });
})();
