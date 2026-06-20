// DUNGEON MASTER: THE HUNT — insertable hold-in cum-capacity plug on a per-level timer.
//
// The Pussy Wrecker (massive plug) is left buried in her; every ~2.5 real minutes (measured in
// game-time, so it freezes when the game pauses) it completes a LEVEL and her cum-load CAPACITY
// jumps. 3 levels per girl take her to +100% over base. A live "Level X of 3 · next in mm:ss"
// readout drives the UI. Pull it out early to stop. Distinct from the kegel TRAINER (instant
// per-session +cap, in action-effects).

(function () {
  'use strict';

  const PLUG_MAX_LEVEL = 3;             // 3 levels per girl
  const PLUG_LEVEL_GAME_MIN = 150;      // ~2.5 real minutes per level (60 game-min = 1 real min)
  const BASE_CAP_REF = 10;              // baseline cum-load cap; +100% of this spread over 3 levels
  const CUMTOOL_CAP_CEILING = 60;

  function st() { return window.DMTHGame.state.current; }
  // Game-clock NOW in game-minutes (timer lives on game time, not the wall-clock).
  function gnow() { return window.DMTHGame.gameClock ? window.DMTHGame.gameClock.now() : (Date.now() / 1000); }
  function implantDef(itemId) {
    const it = (window.DMTHAssets && window.DMTHAssets.getById) ? window.DMTHAssets.getById('item', itemId) : null;
    return it && it.cumImplant ? it.cumImplant : null;
  }
  function plugLevel(girl) { return girl?.body?.cumPlugLevel || 0; }
  // Cumulative cap bonus after `level` plug-levels (+100% of base spread across PLUG_MAX_LEVEL).
  function capBonusAt(level) { return Math.round(BASE_CAP_REF * level / PLUG_MAX_LEVEL); }

  // Insert a hold-in plug (reusable — requires owning ≥1; one plug at a time per girl).
  function insert(girlId, itemId) {
    const girl = window.DMTHGame.state.getGirl(girlId);
    if (!girl) return { ok: false, reason: 'no such girl' };
    if (girl.encounterState !== 'captive') return { ok: false, reason: 'she has to be a living captive' };
    const def = implantDef(itemId);
    if (!def) return { ok: false, reason: 'that item is not an insertable plug' };
    if ((st()?.inventory?.[itemId] || 0) < 1) return { ok: false, reason: "you don't own one" };
    if (girl.body?.cumImplant) return { ok: false, reason: 'she already has a plug buried in her — pull it out first' };
    if (plugLevel(girl) >= PLUG_MAX_LEVEL) return { ok: false, reason: "her cunt's already fully wrecked — max plug level" };
    if ((girl.body?.cumLoadCap ?? 10) >= CUMTOOL_CAP_CEILING) return { ok: false, reason: 'her capacity is already maxed out' };
    window.DMTHGame.state.updateGirl(girlId, { body: { ...girl.body, cumImplant: { itemId, startMin: gnow() } } });
    if (window.DMTHNotify) window.DMTHNotify.show(`🥒 Plugged ${girl.name} with the ${itemId.replace(/-/g, ' ')} — buried in her, it wrenches her cunt a level wider every ~2.5 min. Currently level ${plugLevel(girl)}/${PLUG_MAX_LEVEL}.`, { type: 'info', durationMs: 5000 });
    return { ok: true };
  }

  // Pull the plug early (keeps levels already earned; just stops the running level).
  function remove(girlId) {
    const girl = window.DMTHGame.state.getGirl(girlId);
    if (!girl || !girl.body?.cumImplant) return { ok: false, reason: 'no plug in her' };
    window.DMTHGame.state.updateGirl(girlId, { body: { ...girl.body, cumImplant: null } });
    return { ok: true };
  }

  // UI state — { level, maxLevel, frac (0..1 toward the next level), remainingRealSec, maxed }.
  // null when no plug is buried in her.
  function progress(girl) {
    const imp = girl?.body?.cumImplant;
    if (!imp) return null;
    const elapsed = Math.max(0, gnow() - (imp.startMin || 0));
    const frac = Math.max(0, Math.min(1, elapsed / PLUG_LEVEL_GAME_MIN));
    const remainingGameMin = Math.max(0, PLUG_LEVEL_GAME_MIN - elapsed);
    return {
      level: plugLevel(girl),
      maxLevel: PLUG_MAX_LEVEL,
      frac,
      remainingRealSec: Math.round(remainingGameMin),   // 1 game-min ≈ 1 real-sec at the clock rate
      maxed: plugLevel(girl) >= PLUG_MAX_LEVEL
    };
  }

  // Per-tick — advance any buried plug; on each completed level bump cumLoadCap + restart the
  // timer; pop it out once she hits max level. Called from tick.js.
  function tick() {
    const s = st();
    if (!s) return;
    for (const girl of s.roster) {
      if (girl.encounterState !== 'captive') continue;
      const imp = girl.body?.cumImplant;
      if (!imp) continue;
      const def = implantDef(imp.itemId);
      if (!def) { window.DMTHGame.state.updateGirl(girl.id, { body: { ...girl.body, cumImplant: null } }); continue; }
      if ((gnow() - (imp.startMin || 0)) < PLUG_LEVEL_GAME_MIN) continue;   // current level not done yet
      const prevLevel = plugLevel(girl);
      const newLevel = prevLevel + 1;
      const inc = capBonusAt(newLevel) - capBonusAt(prevLevel);
      const curCap = girl.body?.cumLoadCap ?? 10;
      const newCap = Math.min(CUMTOOL_CAP_CEILING, curCap + inc);
      const done = newLevel >= PLUG_MAX_LEVEL;
      window.DMTHGame.state.updateGirl(girl.id, {
        body: {
          ...girl.body,
          cumLoadCap: newCap,
          cumPlugLevel: newLevel,
          cumImplant: done ? null : { itemId: imp.itemId, startMin: gnow() }
        }
      });
      if (window.DMTHNotify) window.DMTHNotify.show(
        done
          ? `🥒 ${girl.name}'s cunt is fully wrecked — plug level ${newLevel}/${PLUG_MAX_LEVEL}, cum-load capacity now ${newCap} (+100%). The plug pops out, its work done.`
          : `🥒 ${girl.name} stretched another level — plug level ${newLevel}/${PLUG_MAX_LEVEL}, cum-load capacity ${curCap} → ${newCap}. Leave it buried for more.`,
        { type: 'success', durationMs: 6000 });
    }
  }

  // ── TEMPORARY cum-load-MAX bonus (CUMMOD-MAX) ──────────────────────────────
  // A modifier that does NOT actually produce cum (the Relentless Fucking Machine, a plug left in,
  // any cum-load-modifier toy) must NOT raise her CURRENT load — it raises her cum-load MAX for the
  // next few days. Stored as { bonus, untilMin } on body.cumCapTemp; expires lazily (no tick needed).
  const TEMP_CAP_GAME_MIN = 4320;   // ~3 game-days the raised max holds
  function activeCapBonus(body) {
    const t = body && body.cumCapTemp;
    if (!t || !t.bonus) return 0;
    return gnow() < (t.untilMin || 0) ? t.bonus : 0;   // 0 once the window lapses
  }
  // Effective cum-load cap = permanent trained cap + any active temporary modifier bonus.
  function effectiveCap(body) {
    return (body && body.cumLoadCap != null ? body.cumLoadCap : 10) + activeCapBonus(body);
  }
  // Apply a non-cum-producing modifier as a TEMPORARY max bump (never current load). Mutates body.
  // fxCumLoad is the legacy per-use cum value (~0.4-0.8) — scaled to a meaningful cap bonus.
  function addTempCapBonus(body, fxCumLoad) {
    if (!body || !fxCumLoad) return 0;
    const bonus = Math.max(1, Math.round(fxCumLoad * 5));
    const keep = Math.max(activeCapBonus(body), bonus);   // refresh, don't infinitely stack
    body.cumCapTemp = { bonus: keep, untilMin: gnow() + TEMP_CAP_GAME_MIN };
    return keep;
  }

  window.DMTHGame = window.DMTHGame || {};
  window.DMTHGame.cumtool = Object.freeze({ insert, remove, progress, tick, plugLevel, PLUG_MAX_LEVEL, PLUG_LEVEL_GAME_MIN, CUMTOOL_CAP_CEILING, effectiveCap, activeCapBonus, addTempCapBonus, TEMP_CAP_GAME_MIN });
})();
