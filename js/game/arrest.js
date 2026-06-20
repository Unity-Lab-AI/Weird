// DUNGEON MASTER: THE HUNT — arrest / fine / jail / GAME OVER.
// The consequence end of the WANTED axis. Each tick at high WANTED rolls a raid (scaled by
// the WANTED tier's raidChancePerTick). A raid → pay a fine (scaled by WANTED + body count);
// can't pay → jail → GAME OVER. And the most-fucked-up knob: get raided while a corpse or
// un-disposed body is sitting in a hold and it's an instant arrest — no bail, no fine option.

(function () {
  'use strict';

  const FINE_BASE = 600;

  // Body-count exposure: disposals on the ledger (each a body to explain) + corpses still
  // sitting in holds (the damning ones).
  function bodyCounts() {
    const s = window.DMTHGame.state.current;
    const disposed = (s.disposals || []).length;
    const corpsesHeld = (s.roster || []).filter(g => g.encounterState === 'dead').length;
    const captives = (s.roster || []).filter(g => g.encounterState === 'captive' || g.encounterState === 'broken').length;
    return { disposed, corpsesHeld, captives };
  }

  // Fine scales with how hot you are + how many bodies you have to account for.
  function fineFor(wantedLevel, counts) {
    return Math.round(
      FINE_BASE * (1 + wantedLevel / 25)
      + counts.disposed * 300
      + counts.captives * 150
    );
  }

  // --- F.5 — ARREST ESCAPE VALVES (lawyer / bribe / flee) ---
  // Pre-purchased defenses that AUTO-APPLY on a raid (no tedious mid-tick modal). Lawyer +
  // escape-kit are stackable inventory items; bribe-contacts is a one-time unlock. Buy them
  // ahead from the dashboard 🚨 Legal Defenses panel and they kick in when the door gets kicked.
  const VALVES = Object.freeze({
    'legal-retainer': { displayName: '⚖️ Lawyer on Retainer', emoji: '⚖️', cost: 900,
      notes: 'On a raid, ONE retainer is spent to beat the worst: it suppresses a body-in-hold instant-arrest (downgrades it to a heavy fine) — or, failing that, knocks 40% off a normal fine. Stack several for repeated raids.' },
    'escape-kit': { displayName: '🏃 Escape Kit + Safehouse', emoji: '🏃', cost: 1500,
      notes: 'Last resort. If a raid hits with a fine you CAN\'T pay, an escape kit is spent to FLEE instead of prison — you lose half your cash and up to 2 captives are lost in the chaos, but you survive and WANTED resets to near zero. Without one, an unpayable fine is GAME OVER.' }
  });
  const BRIBE_UNLOCK = 'bribe-contacts';
  const BRIBE_COST = 1200;          // one-time price to develop the dirty-cop connections
  const BRIBE_FINE_MUL = 1.6;       // a bribe costs more cash than the fine...
  const BRIBE_WANTED_COOL = 60;     // ...but cools WANTED far harder and leaves no record escalation

  function valveCount(id) { return (window.DMTHGame.state.current?.inventory?.[id]) || 0; }
  function hasBribeContacts() { return (window.DMTHGame.state.current?.purchasedUnlocks || []).includes(BRIBE_UNLOCK); }

  function buyValve(id) {
    const v = VALVES[id];
    if (!v) return { ok: false, reason: 'unknown defense' };
    if (!window.DMTHGame.state.spendMoney(v.cost, `valve:${id}`)) return { ok: false, reason: (window.DMTHGame.state.brokeLine ? window.DMTHGame.state.brokeLine() : 'broke') };
    window.DMTHGame.state.addItem(id, 1);
    if (window.DMTHNotify) window.DMTHNotify.show(`${v.emoji} Bought ${v.displayName} ($${v.cost.toLocaleString()}).`, { type: 'success', durationMs: 4000 });
    return { ok: true, id, cost: v.cost };
  }
  function buyBribeContacts() {
    if (hasBribeContacts()) return { ok: false, reason: 'already connected' };
    if (!window.DMTHGame.state.spendMoney(BRIBE_COST, 'valve:bribe-contacts')) return { ok: false, reason: (window.DMTHGame.state.brokeLine ? window.DMTHGame.state.brokeLine() : 'broke') };
    window.DMTHGame.state.addPurchasedUnlock(BRIBE_UNLOCK);
    if (window.DMTHNotify) window.DMTHNotify.show(`💰 Dirty-cop connections made ($${BRIBE_COST.toLocaleString()}). Raids can now be bribed away.`, { type: 'success', durationMs: 5000 });
    return { ok: true, cost: BRIBE_COST };
  }

  // DIRTY-COP PAYROLL. Pay the badges off in escalating tiers: each tier makes raids
  // far RARER (raidMul on the per-tick roll) AND cools WANTED faster (decayBonus, read by wanted.js).
  // The mid/end-game answer to "no one would play if they're jailed every day" — a flush operator
  // buys breathing room. Stacks on top of the lawyer/bribe/escape-kit valves. One-time tier buys.
  const PAYROLL_TIERS = [
    { name: 'no payroll',            cost: 0,     raidMul: 1.0,  decayBonus: 0 },
    { name: '🚓 Beat-Cop Envelope',  cost: 4000,  raidMul: 0.55, decayBonus: 0.25 },
    { name: '🥇 Precinct Captain',   cost: 15000, raidMul: 0.30, decayBonus: 0.6 },
    { name: "🏛️ City Hall's Pocket", cost: 50000, raidMul: 0.12, decayBonus: 1.2 }
  ];
  function payrollTier() {
    const t = window.DMTHGame.state.getCopPayrollTier ? window.DMTHGame.state.getCopPayrollTier() : 0;
    return Math.max(0, Math.min(PAYROLL_TIERS.length - 1, t));
  }
  function payrollRaidMul() { return PAYROLL_TIERS[payrollTier()].raidMul; }
  function payrollDecayBonus() { return PAYROLL_TIERS[payrollTier()].decayBonus; }   // read by wanted.decayTick
  function payrollInfo() {
    const t = payrollTier();
    return { tier: t, current: PAYROLL_TIERS[t], next: PAYROLL_TIERS[t + 1] || null };
  }
  function buyPayroll() {
    const t = payrollTier();
    const next = PAYROLL_TIERS[t + 1];
    if (!next) return { ok: false, reason: 'the whole city is already on your payroll' };
    if (!window.DMTHGame.state.spendMoney(next.cost, `cop-payroll:tier${t + 1}`)) return { ok: false, reason: window.DMTHGame.state.brokeLine ? window.DMTHGame.state.brokeLine() : 'insufficient funds' };
    window.DMTHGame.state.setCopPayrollTier(t + 1);
    if (window.DMTHNotify) window.DMTHNotify.show(`💵 ${next.name} on the payroll ($${next.cost.toLocaleString()}) — raids ${Math.round((1 - next.raidMul) * 100)}% rarer, heat cools faster. Stay paid, stay free.`, { type: 'success', durationMs: 6000 });
    return { ok: true, tier: t + 1 };
  }

  // FLEE — consume an escape kit, lose half your cash + up to 2 captives, reset WANTED, survive.
  function flee(wlevel) {
    const s = window.DMTHGame.state.current;
    window.DMTHGame.state.consumeItem('escape-kit', 1);
    const lost = Math.ceil((s.wallet?.money || 0) / 2);
    if (lost > 0) window.DMTHGame.state.spendMoney(lost, 'flee:abandoned-cash');
    // Two captives are lost in the chaos — freed from their holds, gone from the operation.
    const abandoned = (s.roster || []).filter(g => g.encounterState === 'captive').slice(0, 2);
    for (const g of abandoned) {
      const d = window.DMTHGame.state.getDungeon(g.assignedDungeonId);
      if (d) {
        const newHolds = (d.holds || []).map(h => h.captiveGirlId === g.id ? { ...h, captiveGirlId: null } : h);
        window.DMTHGame.state.updateDungeon(d.id, { holds: newHolds });
      }
      window.DMTHGame.state.updateGirl(g.id, { encounterState: 'escaped', assignedDungeonId: null, assignedHoldIdx: null, escape: { ...(g.escape || {}), currentRisk: 1, escapedAt: Date.now(), escapedFrom: 'raid-flee' } });
    }
    if (window.DMTHGame.state.addWanted) window.DMTHGame.state.addWanted(10 - wlevel, 'fled-raid');  // → ~10
    if (window.DMTHNotify) window.DMTHNotify.show(`🏃 You FLED the raid — burned half your cash and lost ${abandoned.length} captive${abandoned.length === 1 ? '' : 's'} in the scramble, but you\'re free and the heat is cold. Lie low.`, { type: 'error', durationMs: 10000 });
    return { outcome: 'fled', cashLost: lost, captivesLost: abandoned.length };
  }

  function finalStats() {
    const s = window.DMTHGame.state.current;
    const counts = bodyCounts();
    const filmsSold = (s.films || []).filter(f => f.status === 'sold' || (f.passiveEarnings || 0) > 0).length;
    const lifetimeFilm = (s.films || []).reduce((t, f) => t + (f.passiveEarnings || 0) + (f.saleRecord?.price || 0), 0);
    return {
      money: s.wallet?.money || 0,
      wanted: window.DMTHGame.wanted ? window.DMTHGame.wanted.get() : (s.wallet?.wanted || 0),
      ticks: s.tickCount || 0,
      captives: counts.captives,
      corpsesHeld: counts.corpsesHeld,
      disposed: counts.disposed,
      filmsSold,
      lifetimeFilm
    };
  }

  function gameOver(reason) {
    window.DMTHGame.state.setGameOver(reason, finalStats());
    if (window.DMTHGame.tick) window.DMTHGame.tick.stop();
    if (window.DMTHNotify) window.DMTHNotify.show(`🚨 GAME OVER — ${reason}`, { type: 'error', durationMs: 12000 });
    // Hand off to the game-over screen.
    try { window.location.hash = '#game-over'; } catch {}
  }

  // Resolve a raid. Returns an outcome string for logging/UI.
  function triggerRaid() {
    const s = window.DMTHGame.state.current;
    if (!s || s.gameOver) return { outcome: 'none' };
    const counts = bodyCounts();
    const wlevel = window.DMTHGame.wanted ? window.DMTHGame.wanted.get() : (s.wallet?.wanted || 0);
    let lawyerSpent = false;   // a retainer is good for ONE save per raid (bodies OR fine cut)

    // F.4/F.5 — caught with a body in a hold = instant arrest, UNLESS a lawyer suppresses it.
    if (counts.corpsesHeld > 0) {
      if (valveCount('legal-retainer') > 0) {
        window.DMTHGame.state.consumeItem('legal-retainer', 1);
        lawyerSpent = true;
        if (window.DMTHNotify) window.DMTHNotify.show(`⚖️ Your lawyer got the bodies thrown out — instant-arrest beaten. Now settle the rest.`, { type: 'warn', durationMs: 8000 });
      } else {
        gameOver(`A raid hit while ${counts.corpsesHeld} ${counts.corpsesHeld === 1 ? 'body was' : 'bodies were'} still in your holds. Caught with the evidence in the room — no bail, no deal. The cell door closes.`);
        return { outcome: 'arrested-bodies' };
      }
    }

    let fine = fineFor(wlevel, counts);

    // F.5 — BRIBE: if you've got the connections + the cash, buy the whole raid away. Costs
    // more than the fine but cools WANTED hard and leaves no escalating record.
    if (hasBribeContacts()) {
      const bribeCost = Math.round(fine * BRIBE_FINE_MUL);
      if ((s.wallet?.money || 0) >= bribeCost) {
        window.DMTHGame.state.spendMoney(bribeCost, 'arrest:bribe');
        if (window.DMTHGame.state.addWanted) window.DMTHGame.state.addWanted(-Math.min(wlevel, BRIBE_WANTED_COOL), 'bribed-raid');
        if (window.DMTHNotify) window.DMTHNotify.show(`💰 BRIBED the raid away for $${bribeCost.toLocaleString()} — WANTED slashed, no record. Cheaper than prison.`, { type: 'warn', durationMs: 9000 });
        return { outcome: 'bribed', cost: bribeCost };
      }
    }

    // F.5 — LAWYER fine discount: a remaining retainer knocks 40% off the fine.
    if (!lawyerSpent && valveCount('legal-retainer') > 0) {
      window.DMTHGame.state.consumeItem('legal-retainer', 1);
      lawyerSpent = true;
      fine = Math.round(fine * 0.6);
    }

    if ((s.wallet?.money || 0) >= fine) {
      window.DMTHGame.state.spendMoney(fine, 'arrest:fine');
      // Paying buys the heat down — a cooperating, solvent operator slides.
      if (window.DMTHGame.state.addWanted) window.DMTHGame.state.addWanted(-Math.min(wlevel, 35), 'paid-fine');
      if (window.DMTHNotify) window.DMTHNotify.show(`🚔 RAIDED — ${lawyerSpent ? 'lawyer cut it to ' : 'paid a '}$${fine.toLocaleString()} fine, WANTED cooled. They'll be back if you don't lie low.`, { type: 'error', durationMs: 9000 });
      return { outcome: 'fined', fine, lawyerSpent };
    }

    // Can't pay the fine → FLEE with an escape kit, else jail → GAME OVER.
    if (valveCount('escape-kit') > 0) {
      return flee(wlevel);
    }
    gameOver(`Raided at WANTED ${wlevel}/100 with a $${fine.toLocaleString()} fine you couldn't pay. No money, no lawyer, no escape kit, no out. You go to prison and the dungeon goes cold.`);
    return { outcome: 'arrested-broke', fine };
  }

  // Per-tick raid roll. Chance comes from the current WANTED tier (wanted.js TIERS).
  function runRaidTick() {
    const s = window.DMTHGame.state.current;
    if (!s || s.gameOver || s.mode === 'sandbox') return;   // sandbox is consequence-free
    if (!window.DMTHGame.wanted) return;
    // the Dirty-Cop Payroll multiplies the raid roll down (a paid-off city rarely kicks doors).
    const chance = window.DMTHGame.wanted.raidChancePerTick() * payrollRaidMul();
    if (chance <= 0) return;
    if (Math.random() < chance) triggerRaid();
  }

  window.DMTHGame = window.DMTHGame || {};
  window.DMTHGame.arrest = Object.freeze({
    runRaidTick, triggerRaid, fineFor, bodyCounts, finalStats, FINE_BASE,
    VALVES, BRIBE_UNLOCK, BRIBE_COST, valveCount, hasBribeContacts, buyValve, buyBribeContacts,
    PAYROLL_TIERS, payrollTier, payrollRaidMul, payrollDecayBonus, payrollInfo, buyPayroll
  });
})();
