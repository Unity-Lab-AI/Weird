// DUNGEON MASTER: THE HUNT — per-girl SPECIALIZATIONS (SPECIALIZE.1).
// Fucked-up "upgrades" you buy onto an individual captive to specialize her for a role —
// a cow-titted milk machine, a bottomless cum-dump, a brood mare, a body that won't break.
// Each is permanent, costs money, and either bumps a persistent stat once (cum-dump → bigger
// storage) or is read LIVE by the system it modifies (big-tits → milk.js, brood-mare →
// pregnancy.js, pain-proof → action-effects max-health). Ids live on `girl.specializations`.
// More specializations drop in here over time — the registry is the single source of truth.

(function () {
  'use strict';

  // Registry. cost = $ to install. onApply(girl) → optional one-time persistent stat patch
  // (merged into updateGirl). Time-varying effects are read live via the helpers below.
  const SPECIALIZATIONS = {
    'big-tits': {
      id: 'big-tits', displayName: 'Cow Tits (surgical)', emoji: '🍈', cost: 1400,
      notes: "Massive surgically-swollen udders. DOUBLES her milk output AND storage while she's lactating, and stretches her postpartum milk window a few extra days. The single best milk earner — pair her with a Tit Sucker."
    },
    'cum-dump': {
      id: 'cum-dump', displayName: 'Bottomless Cum-Dump', emoji: '🕳️', cost: 900,
      notes: 'Permanently reworked + stretched to hold a flood. +15 cum-load STORAGE capacity on top of any vaginal-weight training — more load held to the brim = bigger john/film payouts.',
      onApply(girl) { return { body: { cumLoadCap: (girl.body?.cumLoadCap || 10) + 15 } }; }
    },
    'bred-mare': {
      id: 'bred-mare', displayName: 'Brood Mare', emoji: '🐎', cost: 1100,
      notes: 'Hyper-fertile womb. Conception rolls land far more often — breed her back-to-back for a perpetual milk + birth pipeline.'
    },
    'pain-proof': {
      id: 'pain-proof', displayName: 'Deadened Nerves', emoji: '🩹', cost: 1200,
      notes: "Her body shrugs off punishment that would wreck a lesser girl. +20 to her max-health ceiling, so she survives the rough trade and the friends' visits."
    }
  };

  function has(girl, id) {
    return Array.isArray(girl?.specializations) && girl.specializations.includes(id);
  }
  function list(girl) {
    return (girl?.specializations || []).map(id => SPECIALIZATIONS[id]).filter(Boolean);
  }
  function all() { return Object.values(SPECIALIZATIONS); }

  // Install a specialization — spends money, records the id, runs any one-time stat bump.
  function apply(girlId, id) {
    const spec = SPECIALIZATIONS[id];
    if (!spec) return { ok: false, reason: 'unknown specialization' };
    const girl = window.DMTHGame.state.getGirl(girlId);
    if (!girl) return { ok: false, reason: 'no such girl' };
    if (girl.encounterState !== 'captive') return { ok: false, reason: 'she has to be a captive in your dungeon' };
    if (has(girl, id)) return { ok: false, reason: `she already has ${spec.displayName}` };
    if (!window.DMTHGame.state.spendMoney(spec.cost, `specialize:${id}`)) return { ok: false, reason: 'insufficient funds' };
    const patch = { specializations: [...(girl.specializations || []), id] };
    if (typeof spec.onApply === 'function') {
      const p = spec.onApply(girl) || {};
      if (p.body) patch.body = p.body;
    }
    window.DMTHGame.state.updateGirl(girlId, patch);
    if (window.DMTHNotify) window.DMTHNotify.show(`🧬 ${girl.name} now has ${spec.emoji} ${spec.displayName}.`, { type: 'success', durationMs: 4500 });
    return { ok: true };
  }

  // --- Live-read effect helpers (read by milk.js / pregnancy.js / action-effects.js) ---

  // big-tits doubles milk volume + storage capacity while lactating.
  function milkMultiplier(girl) { return has(girl, 'big-tits') ? 2 : 1; }
  // big-tits keeps her producing a few extra days postpartum (ticks added to lactatingUntil;
  // 48 ticks = 1 game day, so this is ~3 extra game days).
  function postpartumBonusTicks(girl) { return has(girl, 'big-tits') ? 144 : 0; }
  // pain-proof lifts her max-health ceiling so she survives more.
  function maxHealthBonus(girl) { return has(girl, 'pain-proof') ? 20 : 0; }
  // brood-mare conceives more readily.
  function fertilityMultiplier(girl) { return has(girl, 'bred-mare') ? 1.6 : 1; }

  window.DMTHGame = window.DMTHGame || {};
  window.DMTHGame.specialize = Object.freeze({
    SPECIALIZATIONS, has, list, all, apply,
    milkMultiplier, postpartumBonusTicks, maxHealthBonus, fertilityMultiplier
  });
})();
