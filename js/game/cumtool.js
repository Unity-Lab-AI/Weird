// DUNGEON MASTER: THE HUNT — CUMTOOL.1: insertable hold-in plug on a TIMER.
//
// Gee: the Pussy Wrecker (massive plug) is left IN over game-time — you plug her, leave it in
// ~1-2 game days while a timer runs, and when it completes her cum-load CAPACITY upgrades to hold
// more + better bonuses. Distinct from the kegel TRAINER (instant per-session +cap, action-effects).
// "Visual expansion" = her cum-level cap NUMBER visibly jumping on the stat bar (STATNUM) — you can
// SEE the capacity grow. Capacity is pushable past the kegel cap toward a 60 ceiling.

(function () {
  'use strict';

  const TICKS_PER_GAME_DAY = 48;
  const CUMTOOL_CAP_CEILING = 60;

  function st() { return window.DMTHGame.state.current; }
  function tickNow() { return st()?.tickCount || 0; }
  function implantDef(itemId) {
    const it = (window.DMTHAssets && window.DMTHAssets.getById) ? window.DMTHAssets.getById('item', itemId) : null;
    return it && it.cumImplant ? it.cumImplant : null;
  }
  function ticksNeeded(def) { return (def.days || 1.5) * TICKS_PER_GAME_DAY; }

  // Insert a hold-in plug (reusable — requires owning ≥1; one implant at a time per girl).
  function insert(girlId, itemId) {
    const girl = window.DMTHGame.state.getGirl(girlId);
    if (!girl) return { ok: false, reason: 'no such girl' };
    if (girl.encounterState !== 'captive') return { ok: false, reason: 'she has to be a living captive' };
    const def = implantDef(itemId);
    if (!def) return { ok: false, reason: 'that item is not an insertable plug' };
    if ((st()?.inventory?.[itemId] || 0) < 1) return { ok: false, reason: "you don't own one" };
    if (girl.body?.cumImplant) return { ok: false, reason: 'she already has a plug in — remove it first' };
    if ((girl.body?.cumLoadCap ?? 10) >= CUMTOOL_CAP_CEILING) return { ok: false, reason: 'her capacity is already maxed out' };
    window.DMTHGame.state.updateGirl(girlId, { body: { ...girl.body, cumImplant: { itemId, startTick: tickNow() } } });
    if (window.DMTHNotify) window.DMTHNotify.show(`🥒 Plugged ${girl.name} with the ${itemId.replace(/-/g, ' ')} — leave it buried in her ~${def.days} game days and her cum-load capacity upgrades.`, { type: 'info', durationMs: 5000 });
    return { ok: true };
  }

  // Pull the plug early (no upgrade — the timer hadn't completed).
  function remove(girlId) {
    const girl = window.DMTHGame.state.getGirl(girlId);
    if (!girl || !girl.body?.cumImplant) return { ok: false, reason: 'no plug in her' };
    window.DMTHGame.state.updateGirl(girlId, { body: { ...girl.body, cumImplant: null } });
    return { ok: true };
  }

  // Progress 0..1 of the current implant timer (for the UI bar). null if none.
  function progress(girl) {
    const imp = girl?.body?.cumImplant;
    if (!imp) return null;
    const def = implantDef(imp.itemId);
    if (!def) return null;
    return Math.max(0, Math.min(1, (tickNow() - (imp.startTick || 0)) / ticksNeeded(def)));
  }

  // Per-tick — complete any implant whose timer elapsed: bump cumLoadCap (the visible stat jump),
  // clear the implant, notify. Called from tick.js.
  function tick() {
    const s = st();
    if (!s) return;
    for (const girl of s.roster) {
      if (girl.encounterState !== 'captive') continue;
      const imp = girl.body?.cumImplant;
      if (!imp) continue;
      const def = implantDef(imp.itemId);
      if (!def) { window.DMTHGame.state.updateGirl(girl.id, { body: { ...girl.body, cumImplant: null } }); continue; }
      if (tickNow() - (imp.startTick || 0) < ticksNeeded(def)) continue;
      const curCap = girl.body?.cumLoadCap ?? 10;
      const newCap = Math.min(CUMTOOL_CAP_CEILING, curCap + (def.capGain || 8));
      window.DMTHGame.state.updateGirl(girl.id, { body: { ...girl.body, cumLoadCap: newCap, cumImplant: null } });
      if (window.DMTHNotify) window.DMTHNotify.show(`🥒 ${girl.name}'s cunt is permanently stretched out — cum-load capacity ${curCap} → ${newCap}. Bigger loads held, bigger premiums.`, { type: 'success', durationMs: 6500 });
    }
  }

  window.DMTHGame = window.DMTHGame || {};
  window.DMTHGame.cumtool = Object.freeze({ insert, remove, progress, tick, CUMTOOL_CAP_CEILING });
})();
