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

  // ── SEXDRIVE.2 — fill scaling ───────────────────────────────────────────────────────────
  // Maxing the drive is a MID-GAME thing across MULTIPLE girls, not something you grind on one.
  //   • variety: each distinct girl you use in a game-day raises the fill multiplier;
  //   • anti-spam: repeating the SAME act on the SAME girl pays diminishing fill fast;
  //   • extremity: more extreme acts already carry higher satisfaction, so they fill more.
  const recentActs = {};          // `${girlId}|${actId}` -> { n, at(gameMin) } — in-memory anti-spam
  const SPAM_WINDOW_MIN = 90;     // diminishing memory lasts ~1.5 game-hours
  function gameNow() { const c = window.DMTHGame.gameClock; return c ? c.now() : 0; }
  function gameDay() { const c = window.DMTHGame.gameClock; return c ? Math.floor(c.now() / (c.MIN_PER_DAY || 1440)) + 1 : 1; }

  // Distinct girls used today → fill multiplier. 1 girl = 1.0×; each additional distinct girl
  // this game-day adds +25% up to +100% (5+ girls). Persisted lazily on state (_sexDriveDay).
  function varietyMultiplier(girlId) {
    const s = window.DMTHGame.state.current;
    if (!s) return 1;
    const day = gameDay();
    let log = s._sexDriveDay;
    if (!log || log.day !== day) log = { day, girls: [] };
    if (girlId && !log.girls.includes(girlId)) log.girls.push(girlId);
    s._sexDriveDay = log;
    // No explicit save() — feed()'s setSexDrive mutate (and the action's own deltas) persist
    // this same state object on the same turn, so _sexDriveDay rides along without extra I/O.
    return 1 + Math.min(1.0, Math.max(0, log.girls.length - 1) * 0.25);
  }

  // Repeat the same act on the same girl inside the window → fill decays (0.6^n, floor 0.15) so
  // you can't just spam the single most-extreme act to cap the meter.
  function spamMultiplier(girlId, actId) {
    if (!girlId || !actId) return 1;
    const key = girlId + '|' + actId;
    const now = gameNow();
    const rec = recentActs[key];
    const n = (rec && (now - rec.at) <= SPAM_WINDOW_MIN) ? rec.n : 0;
    recentActs[key] = { n: n + 1, at: now };
    return Math.max(0.15, Math.pow(0.6, n));
  }

  // Feed the drive (sex acts). amount = action.satisfaction (extreme acts carry more). Scaled by
  // variety × anti-spam, then clamped to the roster/level ceiling (one girl can't reach maxed).
  function feed(amount, opts = {}) {
    if (!amount) return;
    const max = effectiveMax();
    const gain = amount * varietyMultiplier(opts.girlId) * spamMultiplier(opts.girlId, opts.actId);
    window.DMTHGame.state.setSexDrive(Math.max(0, Math.min(max, get() + gain)));
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

  // SEXDRIVE.2 — GRADED capture/hunt bonus by drive band (was binary). Different bonus at
  // different levels: deprived hurts, then it climbs warming → high → maxed.
  function huntBonus() {
    const s = status();
    if (s.deprived) return -0.10;
    if (s.pct >= 0.85) return 0.14;   // maxed — sharpest hunter
    if (s.pct >= 0.55) return 0.07;   // high
    if (s.pct >= 0.30) return 0.02;   // warming
    return 0;
  }
  function cashMul() {
    const s = status();
    if (s.deprived) return 0.92;
    if (s.pct >= 0.85) return 1.15;
    if (s.pct >= 0.55) return 1.08;
    return 1.0;
  }
  // Band label for HUD/tooltips.
  function band() {
    const s = status();
    if (s.deprived) return 'DEPRIVED';
    if (s.pct >= 0.85) return 'MAXED';
    if (s.pct >= 0.55) return 'HIGH';
    if (s.pct >= 0.30) return 'WARMING';
    return 'LOW';
  }

  function describe() {
    const s = status();
    return `🍆 Sex-drive ${s.value}/${s.max}${s.maxed ? ' · MAXED (boosts)' : s.deprived ? ' · DEPRIVED (debuffs)' : ''}`;
  }

  window.DMTHGame = window.DMTHGame || {};
  window.DMTHGame.sexdrive = Object.freeze({
    BASE_CAP, PER_GIRL, PER_LEVEL, MAXED_PCT, DEPRIVED_AT,
    effectiveMax, get, feed, decayTick, status, huntBonus, cashMul, band, describe
  });
})();
