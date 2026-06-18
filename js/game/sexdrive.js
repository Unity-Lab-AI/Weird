// DUNGEON MASTER: THE HUNT — player sexual-drive NEED (SEXDRIVE.1).
// A need meter (state.wallet.sexDrive) fed by sex acts and decaying over time. When it's
// MAXED the player gets stat boosts (hunting + cash); when DEPRIVED he takes debuffs. The
// CAP scales with roster size + DEPRAVITY level, so you literally cannot reach the maxed
// boost band until you have multiple girls across multiple holds — one girl can't satisfy a
// growing appetite. Spreads use across the collection (interlocks with XTOL.1: a single girl
// only takes ~10 extreme acts before she's spent, so you NEED more bodies to stay maxed).

(function () {
  'use strict';

  const BASE_CAP = 30;      // appetite ceiling with zero girls
  const PER_GIRL = 12;      // each captive raises the ceiling
  const PER_LEVEL = 3;      // each DEPRAVITY level raises it a little
  const HARD_MAX = 100;
  const MAXED_PCT = 0.85;   // ≥85% of the current ceiling = maxed (boosts)
  const DEPRIVED_AT = 20;   // ≤ this absolute value = deprived (debuffs)
  const DECAY_PER_TICK = 0.6;

  function captiveCount() {
    const s = window.DMTHGame.state.current;
    return s ? s.roster.filter(g => g.encounterState === 'captive').length : 0;
  }
  function depLevel() { return window.DMTHGame.progression ? window.DMTHGame.progression.getLevel() : 1; }

  // The scaling appetite ceiling — grows with roster + level.
  function effectiveMax() {
    return Math.min(HARD_MAX, BASE_CAP + captiveCount() * PER_GIRL + depLevel() * PER_LEVEL);
  }

  function get() { return window.DMTHGame.state.getSexDrive ? window.DMTHGame.state.getSexDrive() : 0; }

  // Feed the drive (sex acts). Clamped to the current scaling ceiling — so on few girls it
  // can't climb into the maxed band no matter how much you use the one you have.
  function feed(amount) {
    if (!amount) return;
    const max = effectiveMax();
    window.DMTHGame.state.setSexDrive(Math.max(0, Math.min(max, get() + amount)));
  }

  // Per-tick deprivation drift (called from tick.js).
  function decayTick() {
    const cur = get();
    if (cur <= 0) return;
    window.DMTHGame.state.setSexDrive(Math.max(0, cur - DECAY_PER_TICK));
  }

  function status() {
    const max = effectiveMax();
    const val = Math.min(get(), max);
    const pct = max > 0 ? val / max : 0;
    return { value: Math.round(val), max, pct, maxed: pct >= MAXED_PCT, deprived: val <= DEPRIVED_AT };
  }

  // Boosts when maxed, debuffs when deprived. Consumed by hunt odds + income.
  function huntBonus() { const s = status(); return s.maxed ? 0.12 : s.deprived ? -0.10 : 0; }
  function cashMul() { const s = status(); return s.maxed ? 1.15 : s.deprived ? 0.92 : 1.0; }

  function describe() {
    const s = status();
    return `🍆 Sex-drive ${s.value}/${s.max}${s.maxed ? ' · MAXED (boosts)' : s.deprived ? ' · DEPRIVED (debuffs)' : ''}`;
  }

  window.DMTHGame = window.DMTHGame || {};
  window.DMTHGame.sexdrive = Object.freeze({
    BASE_CAP, PER_GIRL, PER_LEVEL, MAXED_PCT, DEPRIVED_AT,
    effectiveMax, get, feed, decayTick, status, huntBonus, cashMul, describe
  });
})();
