// DUNGEON MASTER: THE HUNT — condom types.
// Different condoms with distinct stats. They ride on the existing 'condom-on' outfit overlay
// (invisible in images) but now track WHICH type via girl.condomType. The pregnancy / cum-fill
// gate reads condoms.blocks(girl) instead of a bare 'condom-on' check — so a SABOTAGED (holed)
// condom does NOT block breeding (it guarantees it). Buy / loot / find them; higher-tier ones
// (the holed one) are gated behind the DEPRAVITY level (cheat-start bypasses).
//
// Condom-type items live as plain inventory ids (condom-standard / -french-tickler / -magnum /
// -ribbed / -holed). buy() spends money + stocks one; equip() consumes one. The legacy generic
// 'condom' item still works (no condomType set → treated as a plain blocking condom).

(function () {
  'use strict';

  const CONDOM_ON = 'condom-on';
  // A player-equipped condom is a TIMED tool effect: it protects for a few
  // game hours, then wears off (auto-reverts to her prior outfit on the tick). 1 game hour =
  // 60 game minutes, so 4 hours = 240 game minutes.
  const CONDOM_DURATION_MIN = 240;
  function gameMin() { return window.DMTHGame.gameClock ? window.DMTHGame.gameClock.now() : 0; }
  const CONDOM_TYPES = Object.freeze({
    'condom-standard':       { displayName: 'Standard Condom', emoji: '🎈', cost: 3,  blocks: true,  pleasure: 0, indoctrination: 0, levelReq: 1, notes: 'Basic latex. Blocks pregnancy. Cheap and forgettable.' },
    'condom-french-tickler': { displayName: 'French Tickler',  emoji: '🎀', cost: 14, blocks: true,  pleasure: 8, indoctrination: 1, levelReq: 1, notes: 'Ribbed + nubbed — pleases her more (+arousal) and nudges her indoctrination up a sliver each use. Blocks pregnancy.' },
    'condom-magnum':         { displayName: 'Magnum',           emoji: '🍆', cost: 8,  blocks: true,  pleasure: 4, indoctrination: 0, levelReq: 1, notes: 'Oversized — stretches her, mild pleasure bump. Blocks pregnancy.' },
    'condom-ribbed':         { displayName: 'Ribbed',           emoji: '〰️', cost: 6,  blocks: true,  pleasure: 5, indoctrination: 0, levelReq: 1, notes: 'Ribbed for her (un)pleasure. Blocks pregnancy.' },
    'condom-holed':          { displayName: 'Sabotaged (Holed) Condom', emoji: '🕳️', cost: 60, blocks: false, pleasure: 2, indoctrination: 0, levelReq: 5, notes: 'Pinholed — she thinks she is protected, but it does NOT block pregnancy: cum still fills her and breeds her. High-tier, unlocks with DEPRAVITY level.' }
  });

  function spec(typeId) { return CONDOM_TYPES[typeId] || null; }
  function typeOf(girl) { return (girl && girl.condomType) || null; }

  // Is the equipped condom still within its timed window? (Legacy condoms with no timestamp
  // are treated as active.) Once expired it no longer protects + tickExpiry reverts the outfit.
  function isActive(girl) {
    if (!girl || girl.currentOutfit !== CONDOM_ON) return false;
    if (girl.condomActiveUntil == null) return true;   // legacy / untimed = active
    return gameMin() < girl.condomActiveUntil;
  }

  // Is she protected from pregnancy RIGHT NOW? Only while she's wearing a STILL-ACTIVE condom
  // whose type blocks. A holed condom (blocks:false), an expired condom, or no condom → NOT
  // protected → cum-fill / conception happens.
  function blocks(girl) {
    if (!isActive(girl)) return false;
    const t = CONDOM_TYPES[girl.condomType];
    return t ? t.blocks !== false : true;   // legacy generic condom (no type) = blocking
  }

  // A SABOTAGED (holed) condom currently on her — she thinks she's safe but cum still breeds
  // her, and instantly (CONDOM instant-preggo): one vaginal cum-in conceives outright.
  function isHoled(girl) {
    if (!isActive(girl)) return false;
    const t = CONDOM_TYPES[girl.condomType];
    return !!(t && t.blocks === false);
  }

  // Per-tick wear-off — revert any expired condom to her prior outfit.
  function tickExpiry() {
    const s = window.DMTHGame.state.current;
    if (!s) return;
    const now = gameMin();
    for (const g of s.roster || []) {
      if (g.currentOutfit !== CONDOM_ON) continue;
      if (g.condomActiveUntil != null && now >= g.condomActiveUntil) {
        window.DMTHGame.state.updateGirl(g.id, { currentOutfit: g.previousOutfit || 'default', condomType: null, condomActiveUntil: null });
        if (window.DMTHNotify) window.DMTHNotify.show(`🎈 ${g.name}'s condom wore off — she's raw again.`, { type: 'info', durationMs: 3000 });
      }
    }
  }

  function isLevelUnlocked(typeId) {
    const t = CONDOM_TYPES[typeId];
    if (!t) return false;
    const p = window.DMTHGame.progression;
    if (!p) return (t.levelReq || 1) <= 1;
    if (p.isCheatUnlocked && p.isCheatUnlocked()) return true;
    return p.getLevel() >= (t.levelReq || 1);
  }

  function buy(typeId) {
    const t = CONDOM_TYPES[typeId];
    if (!t) return { ok: false, reason: 'unknown condom' };
    if (!isLevelUnlocked(typeId)) return { ok: false, reason: `${t.displayName} is locked — reach DEPRAVITY level ${t.levelReq} first` };
    const ok = window.DMTHGame.state.spendMoney(t.cost, 'buy:' + typeId);
    if (!ok) return { ok: false, reason: (window.DMTHGame.state.brokeLine ? window.DMTHGame.state.brokeLine() : 'broke') };
    window.DMTHGame.state.addItem(typeId, 1);
    return { ok: true, typeId, cost: t.cost };
  }

  function equip(girlId, typeId) {
    const girl = window.DMTHGame.state.getGirl(girlId);
    if (!girl) return { ok: false, reason: 'no such girl' };
    const t = CONDOM_TYPES[typeId];
    if (!t) return { ok: false, reason: 'unknown condom' };
    if (!isLevelUnlocked(typeId)) return { ok: false, reason: `${t.displayName} is locked — reach DEPRAVITY level ${t.levelReq} first` };
    const ok = window.DMTHGame.state.consumeItem(typeId, 1);
    if (!ok) return { ok: false, reason: `no ${t.displayName} in inventory — buy one first` };
    window.DMTHGame.state.updateGirl(girlId, {
      currentOutfit: CONDOM_ON,
      previousOutfit: girl.currentOutfit === CONDOM_ON ? (girl.previousOutfit || 'default') : (girl.currentOutfit || 'default'),
      condomType: typeId,
      condomActiveUntil: gameMin() + CONDOM_DURATION_MIN   // timed — wears off in ~4 game hours
    });
    if (window.DMTHNotify) window.DMTHNotify.show(`${t.emoji} ${t.displayName} on ${girl.name} — lasts ~${Math.round(CONDOM_DURATION_MIN / 60)} game hours.${t.blocks === false ? ' ⚠️ does NOT block pregnancy — one vaginal load breeds her on the spot.' : ''}`, { type: 'info', durationMs: 4500 });
    return { ok: true, typeId };
  }

  function unequip(girlId) {
    const girl = window.DMTHGame.state.getGirl(girlId);
    if (!girl) return;
    window.DMTHGame.state.updateGirl(girlId, { currentOutfit: girl.previousOutfit || 'default', condomType: null, condomActiveUntil: null });
  }

  // Applied by action-effects on a sex act when a condom is worn — the type's pleasure +
  // indoctrination bump (e.g. french-tickler pleases her more + nudges her bond up).
  function applyWearEffect(girlId) {
    const girl = window.DMTHGame.state.getGirl(girlId);
    if (!girl || girl.currentOutfit !== CONDOM_ON) return;
    const t = CONDOM_TYPES[girl.condomType];
    if (!t) return;
    const patch = {};
    if (t.pleasure) {
      const body = { ...girl.body };
      body.arousal = Math.max(0, Math.min(100, (body.arousal || 0) + t.pleasure));
      patch.body = body;
    }
    if (t.indoctrination) patch.bond = { ...girl.bond, bondXP: (girl.bond?.bondXP || 0) + t.indoctrination };
    if (Object.keys(patch).length) window.DMTHGame.state.updateGirl(girlId, patch);
  }

  window.DMTHGame = window.DMTHGame || {};
  window.DMTHGame.condoms = Object.freeze({
    CONDOM_TYPES, CONDOM_ON, CONDOM_DURATION_MIN,
    spec, typeOf, blocks, isHoled, isActive, tickExpiry, isLevelUnlocked, buy, equip, unequip, applyWearEffect
  });
})();
