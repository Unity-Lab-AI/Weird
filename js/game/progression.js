// DUNGEON MASTER: THE HUNT — player progression: the DEPRAVITY level (PLVL.1 / PLVL.2).
// The spine the whole game hangs off. The player earns DEPRAVITY XP from EVERY successful
// action — a kiss, a sex act, a capture, a disposal, a "mass" dumpster-drop — and levels up.
// Higher-tier depravities (branding, extreme acts, nugget/delimb, dismemberment, later
// hunting grounds) are LOCKED behind level milestones so you can't nugget the first girl you
// capture. The cheat / everything-unlocked (sandbox) start bypasses every gate.
//
// XP is depravity-weighted: a gentle kiss nudges the meter a sliver, a brutal extreme act
// pumps it hard — the fouler the deed, the faster you fall. Level is always DERIVED from xp
// (single source of truth = state.wallet.depravityXp), never stored separately.

(function () {
  'use strict';

  // Cumulative XP needed to REACH each level (index 0 = level 1). Early levels come fast;
  // the climb stretches out so the heaviest depravities (nugget L6, dismember L7) take real play.
  const LEVEL_THRESHOLDS = [0, 30, 80, 160, 280, 450, 700, 1050, 1500, 2100, 2900, 4000];
  // Flavor titles per level (taboo register).
  const LEVEL_TITLES = [
    'Curious', 'Creep', 'Deviant', 'Predator', 'Degenerate', 'Sadist',
    'Monster', 'Butcher', 'Fiend', 'Abomination', 'Nightmare', 'The Depraved'
  ];
  const MAX_LEVEL = LEVEL_THRESHOLDS.length;

  // Feature → minimum DEPRAVITY level required to use it. Anything not listed is L1 (always on).
  const UNLOCKS = Object.freeze({
    own:       3,   // brand / tattoo / piercing (ownership marks)
    extreme:   4,   // the ☠️ Extreme action tab
    nugget:    6,   // delimbing / nugget-making
    dismember: 7,   // the dismember + harvest disposal path
    snuff:     7    // kill a captive into a corpse (optionally filmed) — top-tier
  });

  function levelForXp(xp) {
    let lvl = 1;
    for (let i = 0; i < LEVEL_THRESHOLDS.length; i++) {
      if ((xp || 0) >= LEVEL_THRESHOLDS[i]) lvl = i + 1; else break;
    }
    return lvl;
  }

  function getXp() { return window.DMTHGame.state.getDepravityXp ? window.DMTHGame.state.getDepravityXp() : 0; }
  function getLevel() { return levelForXp(getXp()); }
  function titleFor(level) { return LEVEL_TITLES[Math.min(level, MAX_LEVEL) - 1] || ''; }

  // XP to the NEXT level (for a progress readout). null at max.
  function xpToNext() {
    const lvl = getLevel();
    if (lvl >= MAX_LEVEL) return null;
    return { have: getXp(), need: LEVEL_THRESHOLDS[lvl], level: lvl, next: lvl + 1 };
  }

  // Grant depravity XP for a successful action. Detects a level-up across the grant and
  // fires a toast announcing the new unlocks. amount is depravity-weighted by the caller.
  function grantXp(amount, reason) {
    if (!amount || amount <= 0) return;
    if (!window.DMTHGame.state.addDepravityXp) return;
    const before = getLevel();
    window.DMTHGame.state.addDepravityXp(amount, reason);
    const after = getLevel();
    if (after > before && window.DMTHNotify) {
      const newly = Object.entries(UNLOCKS).filter(([, req]) => req > before && req <= after).map(([k]) => k);
      const unlockTxt = newly.length ? ` Unlocked: ${newly.join(', ')}.` : '';
      window.DMTHNotify.show(`😈 DEPRAVITY LEVEL ${after} — "${titleFor(after)}".${unlockTxt}`, { type: 'success', durationMs: 6000 });
    }
  }

  // Cheat / sandbox start unlocks everything. Otherwise gate on current level.
  function isCheatUnlocked() { return window.DMTHGame.state.current?.mode === 'sandbox'; }
  function purchasedUnlocks() { return window.DMTHGame.state.current?.purchasedUnlocks || []; }
  function isUnlocked(key) {
    if (isCheatUnlocked()) return true;
    if (purchasedUnlocks().includes(key)) return true;     // bought early access (PAYUNLOCK.1)
    return getLevel() >= (UNLOCKS[key] || 1);
  }
  function requiredLevel(key) { return UNLOCKS[key] || 1; }

  // Pay-to-unlock (PAYUNLOCK.1) — buy a gated tier early instead of grinding to its level.
  // Fees are steep so leveling is still the default path; this is the "fast-track with cash" lever.
  const UNLOCK_FEES = Object.freeze({ own: 400, extreme: 900, nugget: 2500, dismember: 3500, snuff: 4000 });
  function unlockFee(key) { return UNLOCK_FEES[key] || 0; }
  function buyUnlock(key) {
    if (!(key in UNLOCKS)) return { ok: false, reason: 'not a purchasable unlock' };
    if (isUnlocked(key)) return { ok: false, reason: 'already unlocked' };
    const fee = UNLOCK_FEES[key] || 0;
    if (!fee) return { ok: false, reason: 'no fee defined' };
    const ok = window.DMTHGame.state.spendMoney(fee, 'unlock:' + key);
    if (!ok) return { ok: false, reason: 'insufficient funds' };
    window.DMTHGame.state.addPurchasedUnlock(key);
    if (window.DMTHNotify) window.DMTHNotify.show(`🔓 Bought early access — "${key}" unlocked for $${fee.toLocaleString()}.`, { type: 'success', durationMs: 5000 });
    return { ok: true, key, fee };
  }

  // Human-readable HUD line.
  function describe() {
    const lvl = getLevel();
    const next = xpToNext();
    return next
      ? `😈 DEPRAVITY L${lvl} "${titleFor(lvl)}" · ${next.have}/${next.need} XP → L${next.next}`
      : `😈 DEPRAVITY L${lvl} "${titleFor(lvl)}" · MAX`;
  }

  // ---- HUNTING-GROUND GATES (PLVL.2) ----
  // The richer hunting grounds aren't all open at the start. Some unlock with DEPRAVITY level,
  // some require you to already hold a stable of captives, and some are bought as private
  // access. Easy grounds (street / park / library / coffee-shop / club / gym / neighborhood)
  // are ungated. Cheat-start opens everything.
  const LOCATION_GATES = Object.freeze({
    mall:            { girlCount: 2 },
    sorority:        { level: 3 },
    'hotel-lobby':   { cost: 1500 },
    'private-party': { level: 3, girlCount: 4 },
    'school-campus': { level: 5 },
    remote:          { level: 6 }
  });
  function captiveCount() {
    const s = window.DMTHGame.state.current;
    return s ? s.roster.filter(g => g.encounterState === 'captive').length : 0;
  }
  function isLocationUnlocked(locId) {
    if (isCheatUnlocked()) return true;
    const g = LOCATION_GATES[locId];
    if (!g) return true;                                  // ungated ground
    const owned = window.DMTHGame.state.current?.unlockedLocations || [];
    if (owned.includes(locId)) return true;               // bought / already unlocked
    if (g.cost) return false;                             // cost-gated → only via purchase
    if (g.level && getLevel() < g.level) return false;
    if (g.girlCount && captiveCount() < g.girlCount) return false;
    return true;
  }
  function locationGateReason(locId) {
    const g = LOCATION_GATES[locId];
    if (!g) return '';
    if (g.cost) return `Buy access — $${g.cost.toLocaleString()}`;
    const parts = [];
    if (g.level) parts.push(`DEPRAVITY L${g.level}`);
    if (g.girlCount) parts.push(`${g.girlCount} captives held`);
    return parts.join(' + ') + ' required';
  }
  function locationCost(locId) { return LOCATION_GATES[locId]?.cost || 0; }
  function buyLocationAccess(locId) {
    const g = LOCATION_GATES[locId];
    if (!g || !g.cost) return { ok: false, reason: 'not purchasable' };
    if ((window.DMTHGame.state.current?.unlockedLocations || []).includes(locId)) return { ok: false, reason: 'you already own access' };
    const ok = window.DMTHGame.state.spendMoney(g.cost, 'location-access:' + locId);
    if (!ok) return { ok: false, reason: 'insufficient funds' };
    window.DMTHGame.state.addUnlockedLocation(locId);
    if (window.DMTHNotify) window.DMTHNotify.show(`🗝️ Bought private access to ${locId}.`, { type: 'success', durationMs: 4000 });
    return { ok: true, cost: g.cost };
  }

  window.DMTHGame = window.DMTHGame || {};
  window.DMTHGame.progression = Object.freeze({
    LEVEL_THRESHOLDS, LEVEL_TITLES, MAX_LEVEL, UNLOCKS, LOCATION_GATES,
    levelForXp, getXp, getLevel, titleFor, xpToNext, grantXp,
    isCheatUnlocked, isUnlocked, requiredLevel, describe,
    UNLOCK_FEES, unlockFee, buyUnlock,
    isLocationUnlocked, locationGateReason, locationCost, buyLocationAccess
  });
})();
