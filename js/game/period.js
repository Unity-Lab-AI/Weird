// DUNGEON MASTER: THE HUNT — menstrual cycle.
//
// Girls cycle on their period roughly every five days, with bloody-fucking acts available while
// on it carrying appropriately-balanced stat modifiers.
//
// Each captive bleeds for ~1 game day every ~5 game days. The bloody-fucking ACTS themselves
// (period-fuck / period-oral) live in action-effects.js with appropriately-balanced premium
// modifiers; this module only owns the CYCLE — when she's on it, when the next one's due, and
// surfacing that to the room. A pregnant girl's cycle pauses entirely.

(function () {
  'use strict';

  const PERIOD_CYCLE_DAYS = 5;      // a fresh period every ~5 game days (measured from the last start)
  const PERIOD_DURATION_DAYS = 1;   // she bleeds for ~1 game day

  function st() { return window.DMTHGame.state.current; }
  function clock() { return window.DMTHGame.gameClock; }
  function isPregnant(g) { return g && g.pregnancy && g.pregnancy.status === 'pregnant'; }

  function isOnPeriod(girl) { return !!(girl && girl.body && girl.body.onPeriod); }

  // Game-days until her next period starts (0 if she's due / on it now). null if no clock.
  function daysUntilNext(girl) {
    const c = clock();
    if (!c) return null;
    const last = (girl && girl.body && girl.body.lastPeriodAt) || 0;
    if (!last) return PERIOD_CYCLE_DAYS;
    return Math.max(0, PERIOD_CYCLE_DAYS - c.daysSince(last));
  }

  // Human-readable cycle line for the room status panel.
  function describe(girl) {
    if (isPregnant(girl)) return 'pregnant — cycle paused';
    const c = clock();
    if (isOnPeriod(girl)) {
      const left = c ? Math.max(0, PERIOD_DURATION_DAYS - c.daysSince((girl.body.periodStartedAt) || 0)) : 0;
      return `on her period · ~${left.toFixed(1)} game days left`;
    }
    const dn = daysUntilNext(girl);
    return dn == null ? 'cycling' : `next period in ~${dn.toFixed(1)} game days`;
  }

  // Deterministic 0..PERIOD_CYCLE_DAYS phase from a girl's id, so the whole roster doesn't bleed
  // in lockstep — each girl's first cycle is staggered by her own offset.
  function idHash(id) {
    let h = 0; const s = String(id || '');
    for (let i = 0; i < s.length; i++) { h = (h * 31 + s.charCodeAt(i)) | 0; }
    return Math.abs(h);
  }

  // Per-tick cycle advance for every alive captive. Pregnant girls don't cycle.
  function tick() {
    const s = st(); if (!s) return;
    const c = clock(); if (!c) return;
    const now = c.now();
    for (const g of s.roster) {
      if (g.encounterState !== 'captive') continue;
      const b = g.body || {};
      // Pregnancy pauses the cycle — clear any lingering flag and skip.
      if (isPregnant(g)) {
        if (b.onPeriod) window.DMTHGame.state.updateGirl(g.id, { body: { onPeriod: false } });
        continue;
      }
      // First sighting — seed a staggered last-period stamp so cycles don't all align.
      if (!b.lastPeriodAt) {
        const phaseDays = (idHash(g.id) % (PERIOD_CYCLE_DAYS * 100)) / 100;   // 0..5 game days
        window.DMTHGame.state.updateGirl(g.id, { body: { lastPeriodAt: now - phaseDays * c.MIN_PER_DAY } });
        continue;
      }
      if (b.onPeriod) {
        // End the bleed once the duration's elapsed (measured from the period's start).
        if (c.daysSince(b.periodStartedAt || b.lastPeriodAt) >= PERIOD_DURATION_DAYS) {
          window.DMTHGame.state.updateGirl(g.id, { body: { onPeriod: false } });
        }
      } else if (c.daysSince(b.lastPeriodAt) >= PERIOD_CYCLE_DAYS) {
        // Start a new period; lastPeriodAt stamps the start so the next one schedules 5 days out.
        window.DMTHGame.state.updateGirl(g.id, { body: { onPeriod: true, periodStartedAt: now, lastPeriodAt: now } });
        if (window.DMTHNotify) window.DMTHNotify.show(`🩸 ${g.name} started her period.`, { type: 'info', durationMs: 2500 });
      }
    }
  }

  window.DMTHGame = window.DMTHGame || {};
  window.DMTHGame.period = Object.freeze({
    PERIOD_CYCLE_DAYS, PERIOD_DURATION_DAYS,
    isOnPeriod, daysUntilNext, describe, tick
  });
})();
