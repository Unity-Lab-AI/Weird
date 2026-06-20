// DUNGEON MASTER: THE HUNT — running in-game day clock.
//
// Time model:
//   1 real second  = 1  game minute
//   60 real sec    = 1  game hour
//   24 real min    = 1  game day  (= 1440 game minutes)
//
// Per-tick advancement: tick.js fires every 30 real seconds, so each tick
// advances game time by 30 game minutes. The clock can also be advanced
// continuously between ticks via `now()` which reads the real-clock delta.

(function () {
  'use strict';

  const MIN_PER_DAY = 24 * 60;          // 1440

  // The anchor is intentionally NOT persisted across page reloads. If we kept
  // the old anchor in the save and the user came back to the tab 3 real days
  // later, the clock would fast-forward 3×24×60 = 4320 game days at boot. The
  // game-clock only runs while the tab is open; closing the tab pauses time.
  // Each module load resets the anchor to Date.now(), so realDelta is measured
  // from the boot of THIS tab session.
  let anchorRealMs = null;
  // when paused, game time FREEZES: now() stops advancing and the tick is gated
  // (tick.js early-returns), so escapes / decay / johns / raids all halt while the player
  // steps away with the tab open. Closing the tab already freezes time (the anchor isn't
  // persisted), so this covers the "tab open but walked away" case + an explicit stop.
  let pausedAt = null;

  function ensureSeed() {
    const s = window.DMTHGame.state.current;
    if (!s) return null;
    if (typeof s.gameMinutes !== 'number') {
      s.gameMinutes = 0;
    }
    if (anchorRealMs == null) {
      anchorRealMs = Date.now();
    }
    return s;
  }

  // Continuous game-time read. Returns gameMinutes including the real-clock
  // delta since the last anchor (boot, or last advanceFromTick). Frozen while paused.
  function now() {
    const s = ensureSeed();
    if (!s) return 0;
    if (pausedAt != null) return s.gameMinutes;   // frozen — no time passes while paused
    const realDeltaSec = Math.max(0, (Date.now() - anchorRealMs) / 1000);
    return s.gameMinutes + realDeltaSec;   // 1 real second = 1 game minute
  }

  // Advance the persisted gameMinutes by the real-clock delta since last anchor,
  // then re-anchor to NOW. Called by tick.js at the top of each tick. No-op while paused.
  function advanceFromTick() {
    const s = ensureSeed();
    if (!s || pausedAt != null) return;
    const realDeltaSec = Math.max(0, (Date.now() - anchorRealMs) / 1000);
    s.gameMinutes += realDeltaSec;
    anchorRealMs = Date.now();
  }

  // burn an EXPLICIT chunk of game-time forward (a physical act consumes time:
  // a kiss ~1 min, a torture session ~hours). Distinct from advanceFromTick (which folds in the
  // real-clock delta): this jumps gameMinutes by an explicit game-minute amount. The real-time
  // anchor is left untouched, so the next now()/advanceFromTick stays correct (no double-count).
  // Works even while paused — the player chose to spend that time. Returns the minutes burned.
  function advanceBy(minutes) {
    const s = ensureSeed();
    if (!s || !(minutes > 0)) return 0;
    s.gameMinutes += minutes;
    return minutes;
  }

  // Freeze the clock — bakes the elapsed real-time delta into gameMinutes, then stops.
  function pause() {
    const s = ensureSeed();
    if (!s || pausedAt != null) return;
    s.gameMinutes = now();      // bake in time elapsed up to this instant
    pausedAt = Date.now();
  }
  // Unfreeze — re-anchor to now so the paused interval doesn't retroactively count.
  function resume() {
    if (pausedAt == null) return;
    anchorRealMs = Date.now();
    pausedAt = null;
  }
  function isPaused() { return pausedAt != null; }

  // Convert a game-minutes timestamp delta into days.
  function minutesToDays(min) {
    return min / MIN_PER_DAY;
  }

  // Days elapsed since a stored game-minutes timestamp. Returns 0 if the
  // timestamp is null/undefined (treat as "just now") so a brand-new captive
  // doesn't trigger starvation on first tick.
  function daysSince(stampGameMinutes) {
    if (stampGameMinutes == null) return 0;
    return Math.max(0, (now() - stampGameMinutes) / MIN_PER_DAY);
  }

  // Format current game-time as "Day N, HH:MM"
  function formatNow() {
    const m = now();
    const day = Math.floor(m / MIN_PER_DAY) + 1;
    const dayMin = Math.floor(m % MIN_PER_DAY);
    const hh = Math.floor(dayMin / 60);
    const mm = Math.floor(dayMin % 60);
    return `Day ${day}, ${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}`;
  }

  // Format a game-minutes timestamp (for "last fed: X" / "last watered: X" displays).
  function formatStamp(stampGameMinutes) {
    if (stampGameMinutes == null) return '—';
    const day = Math.floor(stampGameMinutes / MIN_PER_DAY) + 1;
    const dayMin = Math.floor(stampGameMinutes % MIN_PER_DAY);
    const hh = Math.floor(dayMin / 60);
    const mm = Math.floor(dayMin % 60);
    return `Day ${day} ${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}`;
  }

  // Format a duration (in game minutes) compactly. Examples:
  //   45  → "45m"
  //   90  → "1h 30m"
  //   2880 → "2d"
  function formatDuration(min) {
    if (!Number.isFinite(min) || min < 0) return '—';
    if (min < 60) return `${Math.round(min)}m`;
    if (min < MIN_PER_DAY) {
      const h = Math.floor(min / 60);
      const m = Math.floor(min % 60);
      return m === 0 ? `${h}h` : `${h}h ${m}m`;
    }
    const d = Math.floor(min / MIN_PER_DAY);
    const remMin = min - d * MIN_PER_DAY;
    const h = Math.floor(remMin / 60);
    return h === 0 ? `${d}d` : `${d}d ${h}h`;
  }

  window.DMTHGame = window.DMTHGame || {};
  window.DMTHGame.gameClock = Object.freeze({
    now,
    advanceFromTick,
    advanceBy,
    pause, resume, isPaused,
    daysSince,
    minutesToDays,
    formatNow,
    formatStamp,
    formatDuration,
    MIN_PER_DAY
  });
})();
