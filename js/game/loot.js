// DUNGEON MASTER: THE HUNT — loot system (LOOT.1). Tools/items don't only come from the
// shop — you LOOT them from specific locations and specific actions, in a fiendishly clever way:
//   • A successful capture drops loot keyed to WHERE you took her (club → party drugs, a
//     remote spot → heavy chems, the street → a pipe), or cash she was carrying.
//   • "Ask a captive for drugs" — she may be holding a stash (archetype-based, and it DEPLETES);
//     low bond she hides it, higher bond she gives it up.
//   • scavengeLocation() is exposed for a hunt "search the area" action.
// All item ids below are real catalog / drug-scheduler inventory ids.

(function () {
  'use strict';

  const GENERIC = ['duct-tape', 'rope', 'zip-ties', 'weed'];
  // Per-location findable tools — "specific locations".
  const LOCATION_LOOT = {
    club:            ['mdma', 'wine', 'rohypnol'],
    'private-party': ['mdma', 'coke-bumps', 'wine'],
    street:          ['pipe', 'zip-ties', 'weed'],
    library:         ['duct-tape', 'rope'],
    'coffee-shop':   ['weed', 'wine'],
    mall:            ['duct-tape', 'zip-ties'],
    park:            ['rope', 'weed'],
    neighborhood:    ['duct-tape', 'rope', 'zip-ties'],
    'hotel-lobby':   ['wine', 'rohypnol'],
    'school-campus': ['weed', 'duct-tape'],
    sorority:        ['mdma', 'wine'],
    gym:             ['rope', 'duct-tape'],
    remote:          ['pipe', 'ether', 'chloroform']
  };
  // What a captive of each archetype tends to be holding + how big her stash is.
  const DRUG_STASH = {
    club:              { drugs: ['mdma', 'coke-bumps'], size: 4 },
    'private-party':   { drugs: ['mdma', 'wine'],       size: 3 },
    street:            { drugs: ['weed', 'coke-bumps'], size: 3 },
    barista:           { drugs: ['weed'],               size: 2 },
    sorority:          { drugs: ['mdma', 'wine'],       size: 2 },
    'college-student': { drugs: ['weed'],               size: 2 },
    gym:               { drugs: ['coke-bumps'],         size: 1 }
  };
  // Full-catalog rare-find pool (LOOT.2) — ANY tool / equipment / drug / consumable can turn
  // up as loot, not just the location-flavored basics. Scavenges + conversation-wins
  // occasionally pull from here so the whole kit is obtainable in the world, not only the shop.
  const FULL_POOL = [
    'pipe', 'rohypnol', 'chloroform', 'ether', 'ketamine', 'tranquilizer',
    'duct-tape', 'rope', 'zip-ties', 'handcuffs', 'shackles', 'harness',
    'coke-bumps', 'weed', 'mdma', 'acid', 'wine',
    'basic-meal', 'bottled-water', 'condom', 'condom-standard', 'condom-french-tickler', 'condom-magnum', 'condom-ribbed',
    // TOYS.1 — lower-tier toys/implements can be FOUND in the world too (not just bought). The
    // gory high-tier chamber implements stay shop/level-gated to keep them special.
    'wand-vibrator', 'dildo-set', 'loop-gag', 'flogger-whip', 'fucking-machine'
  ];
  const ITEM_LABEL = { 'coke-bumps': 'coke', mdma: 'molly', wine: 'whiskey', 'duct-tape': 'duct tape', 'zip-ties': 'zip-ties', 'basic-meal': 'meal', 'bottled-water': 'water', 'condom-french-tickler': 'french tickler' };
  function label(id) { return ITEM_LABEL[id] || String(id).replace(/-/g, ' '); }
  function pick(arr) { return arr[Math.floor(Math.random() * arr.length)]; }

  // Loot dropped on a SUCCESSFUL capture — location-aware. ~40% find something; 1-in-4 of
  // those is cash she had on her, otherwise a location-appropriate tool.
  function rollCaptureLoot(locationId) {
    if (Math.random() > 0.4) return null;
    if (Math.random() < 0.25) {
      const cash = 20 + Math.floor(Math.random() * 120);
      window.DMTHGame.state.addMoney(cash, 'loot:capture-cash');
      if (window.DMTHNotify) window.DMTHNotify.show(`🎁 Looted $${cash} off her.`, { type: 'success', durationMs: 4500 });
      return { kind: 'cash', amount: cash };
    }
    const pool = LOCATION_LOOT[locationId] || GENERIC;
    const id = pick(pool);
    const qty = 1 + Math.floor(Math.random() * 2);
    window.DMTHGame.state.addItem(id, qty);
    if (window.DMTHNotify) window.DMTHNotify.show(`🎁 Looted ${qty}× ${label(id)} from the scene.`, { type: 'success', durationMs: 4500 });
    return { kind: 'item', id, qty };
  }

  // Scavenge a hunt location for tools (LOOT.2 — exposed for the hunt "search the area" action).
  // Most finds are location-flavored; ~25% pull a rare item from the full catalog pool.
  function scavengeLocation(locationId) {
    if (Math.random() > 0.5) return { ok: false, reason: 'found nothing worth taking' };
    const rare = Math.random() < 0.25;
    const pool = rare ? FULL_POOL : (LOCATION_LOOT[locationId] || GENERIC);
    const id = pick(pool);
    const qty = 1 + Math.floor(Math.random() * 2);
    window.DMTHGame.state.addItem(id, qty);
    if (window.DMTHNotify) window.DMTHNotify.show(`🔦 Scavenged ${qty}× ${label(id)} from the area${rare ? ' — nice find!' : ''}.`, { type: 'success', durationMs: 4500 });
    return { ok: true, id, qty, rare };
  }

  // Conversation-win loot (LOOT.2) — winning a pre-capture talk can shake loose an item: a
  // pill from her purse, a tool from the scene, cash. ~40% on a win. Bonded/charmed targets
  // give up more. Returns { ok, kind, id?, qty?, amount? } or { ok:false }.
  function rollConversationWin(girl, locationId) {
    if (Math.random() > 0.4) return { ok: false, reason: 'she gave up nothing this time' };
    // 1-in-4: cash she was carrying.
    if (Math.random() < 0.25) {
      const cash = 15 + Math.floor(Math.random() * 90);
      window.DMTHGame.state.addMoney(cash, 'loot:talk-cash');
      if (window.DMTHNotify) window.DMTHNotify.show(`🎁 Talked $${cash} out of ${girl?.name || 'her'}.`, { type: 'success', durationMs: 4500 });
      return { ok: true, kind: 'cash', amount: cash };
    }
    // Prefer her archetype drug-stash, else the location pool, else a rare full-pool find.
    const stash = DRUG_STASH[girl?.archetypeTemplate];
    const rare = Math.random() < 0.2;
    const pool = stash ? stash.drugs : rare ? FULL_POOL : (LOCATION_LOOT[locationId] || GENERIC);
    const id = pick(pool);
    const qty = 1 + Math.floor(Math.random() * 2);
    window.DMTHGame.state.addItem(id, qty);
    if (window.DMTHNotify) window.DMTHNotify.show(`🎁 ${girl?.name || 'She'} let slip ${qty}× ${label(id)}${rare ? ' — nice find!' : ''}.`, { type: 'success', durationMs: 4500 });
    return { ok: true, kind: 'item', id, qty, rare };
  }

  // Ask a captive for drugs (the "actions" loot path). She may be holding a stash (archetype-
  // based + DEPLETING). Low bond = she hides/refuses; higher bond = she gives it up.
  function askGirlForDrugs(girlId) {
    const girl = window.DMTHGame.state.getGirl(girlId);
    if (!girl) return { ok: false, reason: 'no such girl' };
    const cfg = DRUG_STASH[girl.archetypeTemplate];
    const loot = { ...(girl.loot || {}) };
    if (loot.drugStash == null) loot.drugStash = cfg ? cfg.size : 0;   // lazy init from archetype
    if (!cfg || loot.drugStash <= 0) {
      window.DMTHGame.state.updateGirl(girlId, { loot });
      return { ok: false, reason: 'she has nothing left on her' };
    }
    // Cooperation odds rise with Stockholm bond — terrified captives hide their stash.
    const coop = Math.min(0.9, 0.2 + (girl.bond?.bondLevel || 0) * 0.09);
    if (Math.random() > coop) {
      window.DMTHGame.state.updateGirl(girlId, { loot });
      return { ok: false, reason: 'she swears she doesn\'t have any', held: true };
    }
    const id = pick(cfg.drugs);
    loot.drugStash -= 1;
    window.DMTHGame.state.updateGirl(girlId, { loot });
    window.DMTHGame.state.addItem(id, 1);
    if (window.DMTHNotify) window.DMTHNotify.show(`🎁 ${girl.name} gave up 1× ${label(id)} from her stash.`, { type: 'success', durationMs: 4500 });
    return { ok: true, id, qty: 1 };
  }

  // ── ARCHGIFT.1 — passive per-archetype loot gifts ──────────────────────────────────────
  // EVERY girl type quietly produces a type-specific gift while you hold at least one of her —
  // a nurse's prescription pad yields free sedatives, a sorority girl bleeds daddy's allowance,
  // a club girl scores party drugs, an office girl skims petty cash. Granted on a cadence per
  // DISTINCT held archetype (staggered so they don't all land the same tick). All ids are real
  // inventory items.
  const ARCHETYPE_GIFTS = {
    nurse:           { kind: 'item', id: 'rohypnol',   n: 1, label: '💊 Prescription pad — free sedatives' },
    club:            { kind: 'item', id: 'mdma',       n: 1, label: '🍸 Club connect — free molly' },
    'private-party': { kind: 'item', id: 'mdma',       n: 1, label: '🎉 Party plug — free molly' },
    street:          { kind: 'item', id: 'duct-tape',  n: 1, label: '🔪 Corner hookup — free supplies' },
    gym:             { kind: 'item', id: 'coke-bumps', n: 1, label: '🏋️ Pre-workout connect — free bumps' },
    'college-student': { kind: 'item', id: 'weed',     n: 1, label: '🎓 Dorm stash — free weed' },
    unity_seed:      { kind: 'item', id: 'coke-bumps', n: 1, label: '🖤 She scores for the house — free coke' },
    sorority:        { kind: 'cash', amount: 60, label: "🏛️ Daddy's allowance" },
    office:          { kind: 'cash', amount: 45, label: '💼 Skimmed petty cash' },
    model:           { kind: 'cash', amount: 40, label: '📸 Comp-card kickback' },
    waitress:        { kind: 'cash', amount: 30, label: '🧾 Pocketed tips' },
    library:         { kind: 'cash', amount: 25, label: '📇 Rare-book resale' },
    barista:         { kind: 'cash', amount: 20, label: '☕ Register skim' }
  };
  const GIFT_PERIOD = 12;   // ~6 real minutes between gifts per held archetype
  function giftOffset(a) { let h = 0; const s = String(a || ''); for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0; return Math.abs(h) % GIFT_PERIOD; }

  // Per-tick passive accrual — called from tick.js. One gift per DISTINCT held archetype on its
  // staggered cadence.
  function tickArchetypeGifts() {
    const s = window.DMTHGame.state.current;
    if (!s) return;
    const held = new Set((s.roster || []).filter(g => g.encounterState === 'captive').map(g => g.archetypeTemplate));
    for (const a of held) {
      const gift = ARCHETYPE_GIFTS[a];
      if (!gift) continue;
      if (((s.tickCount || 0) + giftOffset(a)) % GIFT_PERIOD !== 0) continue;
      if (gift.kind === 'cash') {
        window.DMTHGame.state.addMoney(gift.amount, 'archgift:' + a);
        if (window.DMTHNotify) window.DMTHNotify.show(`${gift.label}: +$${gift.amount}`, { type: 'success', durationMs: 3500 });
      } else {
        window.DMTHGame.state.addItem(gift.id, gift.n || 1);
        if (window.DMTHNotify) window.DMTHNotify.show(`${gift.label}: +${gift.n || 1}× ${label(gift.id)}`, { type: 'success', durationMs: 3500 });
      }
    }
  }

  window.DMTHGame = window.DMTHGame || {};
  window.DMTHGame.loot = Object.freeze({
    LOCATION_LOOT, DRUG_STASH, FULL_POOL, ARCHETYPE_GIFTS,
    rollCaptureLoot, scavengeLocation, askGirlForDrugs, rollConversationWin, tickArchetypeGifts
  });
})();
