// DUNGEON MASTER: THE HUNT — loot system. Tools/items don't only come from the shop — you
// LOOT them from the world:
//   • A successful capture drops loot keyed to WHERE you took her (club → party drugs, a
//     remote spot → heavy chems, the street → a pipe), or cash she was carrying.
//   • scavengeLocation() is exposed for a hunt "search the area" action.
//   • PRE-CAPTURE item requests. While you're sizing up a girl you haven't taken
//     yet, you can ask her for ONE item. Each girl TYPE has three templated options (cheap →
//     prize); each is a stat-based roll whose odds scale with your DEPRAVITY level, the
//     location difficulty, and her difficulty/stats. Cheap gear is likely (~80%), prizes are a
//     long shot (~25%). Never impossible, never endless — hard-capped to once per game-day per
//     girl-type per location. (This REPLACES the old "ask a captive for drugs" stash-drain,
//     which was wrong — captives don't hand you items; pre-capture girls do.)
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
  // Full-catalog rare-find pool — ANY tool / equipment / drug / consumable can turn
  // up as loot, not just the location-flavored basics. Scavenges + conversation-wins
  // occasionally pull from here so the whole kit is obtainable in the world, not only the shop.
  const FULL_POOL = [
    'pipe', 'rohypnol', 'chloroform', 'ether', 'ketamine', 'tranquilizer',
    'duct-tape', 'rope', 'zip-ties', 'handcuffs', 'shackles', 'harness',
    'coke-bumps', 'weed', 'mdma', 'acid', 'wine',
    'basic-meal', 'bottled-water', 'condom', 'condom-standard', 'condom-french-tickler', 'condom-magnum', 'condom-ribbed',
    // Nut Reserve refills can turn up as loot too.
    'blue-pill', 'energy-shot', 'the-good-coke', 'oyster-tonic',
    // Lower-tier toys/implements can be FOUND in the world too (not just bought). The
    // gory high-tier chamber implements stay shop/level-gated to keep them special.
    'wand-vibrator', 'dildo-set', 'loop-gag', 'flogger-whip', 'fucking-machine',
    // The Tit Sucker machine is a rare lootable find (attach one per hold).
    'tit-sucker'
  ];
  const ITEM_LABEL = { 'coke-bumps': 'coke', mdma: 'molly', wine: 'whiskey', 'duct-tape': 'duct tape', 'zip-ties': 'zip-ties', 'basic-meal': 'meal', 'bottled-water': 'water', 'condom-french-tickler': 'french tickler' };
  function label(id) { return ITEM_LABEL[id] || String(id).replace(/-/g, ' '); }
  function pick(arr) { return arr[Math.floor(Math.random() * arr.length)]; }
  // All loot GAINS get a click-away popup (no close button). Prefer the popup; fall back to a
  // toast if it isn't loaded. (Passive ambient trickle — ARCHGIFT — stays a quiet toast on purpose.)
  function lootPop(msg) {
    if (window.DMTHLootPopup) window.DMTHLootPopup.show(msg);
    else if (window.DMTHNotify) window.DMTHNotify.show(msg, { type: 'success', durationMs: 5000 });
  }

  // ── The ENTIRE catalog is lootable, not a curated subset. ───────────────
  // Loot quality + type scale by (a) the GIRL TYPE (archetype biases the pool), (b) the DROP
  // SOURCE on an escalating ladder — capture < friend-fuck < CORPSING — which raises the max item
  // TIER + count, and (c) the GIRL'S TIER (a harder/more-vibrant archetype drops better on capture).
  // Pools are built at runtime from the live catalog (DMTHAssets.ITEMS + the toys module) so any
  // new item is automatically lootable. dungeon-upgrade + location items are excluded (not carryable).
  const LOOT_EXCLUDE_SUBCATS = new Set(['dungeon-upgrade']);
  function lootByTierPools() {
    const pools = { 1: [], 2: [], 3: [], 4: [], 5: [] };
    const items = (window.DMTHAssets && window.DMTHAssets.ITEMS) || [];
    for (const it of items) {
      if (it.category !== 'item' || LOOT_EXCLUDE_SUBCATS.has(it.subcategory)) continue;
      const t = Math.max(1, Math.min(5, it.tier || 1));
      pools[t].push(it.id);
    }
    // Toys (chamber implements) are lootable too — tier them by their DEPRAVITY level requirement.
    if (window.DMTHGame.toys && window.DMTHGame.toys.lootableIds) {
      for (const id of window.DMTHGame.toys.lootableIds()) {
        const spec = window.DMTHGame.toys.spec ? window.DMTHGame.toys.spec(id) : null;
        const t = Math.max(1, Math.min(5, Math.ceil((spec && spec.levelReq || 0) / 1.5) + 1));
        if (!pools[t].includes(id)) pools[t].push(id);
      }
    }
    return pools;
  }
  // Per-archetype thematic bias — favors loot that FITS the girl-type (a nurse drops meds, a club
  // girl party drugs, a gym girl gear, etc.). Falls back to no-bias (pure tier roll) off-list.
  const ARCHETYPE_LOOT_BIAS = {
    nurse:    ['rohypnol', 'ketamine', 'ether', 'chloroform', 'blue-pill'],
    club:     ['mdma', 'coke-bumps', 'wine', 'condom-french-tickler'],
    stripper: ['coke-bumps', 'mdma', 'wine', 'wand-vibrator', 'ben-wa-balls'],
    'private-party': ['mdma', 'coke-bumps', 'acid', 'wine'],
    street:   ['pipe', 'duct-tape', 'zip-ties', 'weed', 'rope'],
    gym:      ['rope', 'harness', 'shackles', 'energy-shot'],
    sorority: ['mdma', 'wine', 'the-good-coke', 'cheerleader-outfit'],
    cheerleader: ['mdma', 'wine', 'the-good-coke'],
    office:   ['wine', 'handcuffs', 'blue-pill'],
    teacher:  ['wine', 'handcuffs', 'rohypnol'],
    police:   ['handcuffs', 'shackles', 'harness', 'pipe'],
    maid:     ['rope', 'duct-tape', 'wine'],
    model:    ['the-good-coke', 'mdma', 'oyster-tonic', 'latex-fetish'],
    library:  ['duct-tape', 'rope', 'weed'],
    barista:  ['weed', 'wine', 'energy-shot'],
    waitress: ['coke-bumps', 'wine', 'weed'],
    remote:   ['pipe', 'ether', 'chloroform', 'tranquilizer']
  };
  // Category rarity weighting: drugs are COMMON, food/water/tools/restraints/
  // consumables/tech are COMMONPLACE, toys are RARE (clothing — also rare — drops via OUTFITLOOT's
  // grantOutfit path, not the item pool). Higher weight = shows up more often in a roll.
  const RARITY_WEIGHT = { commonplace: 5, common: 3, rare: 1 };
  function lootRarityClass(id) {
    if (window.DMTHGame.toys && window.DMTHGame.toys.spec && window.DMTHGame.toys.spec(id)) return 'rare';   // toys = rare (incl. the Tit Sucker if it's a toy)
    const items = (window.DMTHAssets && window.DMTHAssets.ITEMS) || [];
    const it = items.find(x => x.id === id);
    if (!it) return 'common';
    if (it.subcategory === 'drugs') return 'common';
    if (it.subcategory === 'toys') return 'rare';
    return 'commonplace';   // food / water / sedation / restraint / containment / utility / tech / player-boost / consumables
  }
  function weightedPickLoot(candidates) {
    if (!candidates || !candidates.length) return null;
    const bag = [];
    for (const id of candidates) { const w = RARITY_WEIGHT[lootRarityClass(id)] || 2; for (let i = 0; i < w; i++) bag.push(id); }
    return bag.length ? pick(bag) : pick(candidates);
  }
  function pickLootByTier(maxTier, biasIds) {
    const pools = lootByTierPools();
    let candidates = [];
    for (let t = 1; t <= Math.max(1, Math.min(5, maxTier)); t++) candidates = candidates.concat(pools[t] || []);
    if (!candidates.length) return null;
    if (biasIds && biasIds.length && Math.random() < 0.55) {
      const inTier = biasIds.filter(id => candidates.includes(id));
      if (inTier.length) return pick(inTier);
    }
    return weightedPickLoot(candidates);   // category-rarity-weighted pull
  }
  // Girl's loot tier on capture — a harder/more-vibrant archetype (higher ARCHETYPE_DIFFICULTY)
  // drops better gear. maps 0..1 difficulty → maxTier 2..5.
  function girlLootTier(girl) {
    const diff = (window.DMTHGame.hunt && window.DMTHGame.hunt.ARCHETYPE_DIFFICULTY
      && window.DMTHGame.hunt.ARCHETYPE_DIFFICULTY[girl && girl.archetypeTemplate]) ?? 0.45;
    return Math.max(2, Math.min(5, 2 + Math.round(diff * 3)));
  }
  // NOTE: there is intentionally NO corpse-loot function. A girl is only lootable
  // ON CAPTURE (grantCaptureHaul) — you can't loot an already-captured girl by killing her. The
  // "corpsing = best loot" tier lives in grantNpcGift below (the friend's KILLWIN gift on a kill),
  // which is the friend rewarding you, NOT stripping her body.

  // Loot dropped on a SUCCESSFUL capture — location-aware. ~40% find something; 1-in-4 of
  // those is cash she had on her, otherwise a location-appropriate tool.
  function rollCaptureLoot(locationId) {
    if (Math.random() > 0.4) return null;
    if (Math.random() < 0.25) {
      const cash = 20 + Math.floor(Math.random() * 120);
      window.DMTHGame.state.addMoney(cash, 'loot:capture-cash');
      lootPop(`🎁 Looted $${cash} off her.`);
      return { kind: 'cash', amount: cash };
    }
    const pool = LOCATION_LOOT[locationId] || GENERIC;
    const id = pick(pool);
    const qty = 1 + Math.floor(Math.random() * 2);
    window.DMTHGame.state.addItem(id, qty);
    lootPop(`🎁 Looted ${qty}× ${label(id)} from the scene.`);
    return { kind: 'item', id, qty };
  }

  // Scavenge a hunt location for tools (exposed for the hunt "search the area" action).
  // Most finds are location-flavored; ~25% pull a rare item from the full catalog pool.
  function scavengeLocation(locationId) {
    if (Math.random() > 0.5) return { ok: false, reason: 'found nothing worth taking' };
    const rare = Math.random() < 0.25;
    const pool = rare ? FULL_POOL : (LOCATION_LOOT[locationId] || GENERIC);
    const id = pick(pool);
    const qty = 1 + Math.floor(Math.random() * 2);
    window.DMTHGame.state.addItem(id, qty);
    lootPop(`🔦 Scavenged ${qty}× ${label(id)} from the area${rare ? ' — nice find!' : ''}.`);
    return { ok: true, id, qty, rare };
  }

  // ── PRE-CAPTURE item requests ────────────────────────────────────────────────
  // Each girl TYPE has three templated options spanning cheap → prize. Tier sets the base odds;
  // your DEPRAVITY level + the location difficulty + her difficulty/stats modify them. Item ids
  // are real catalog / drug-scheduler ids. Themed to what that kind of girl plausibly carries.
  const REQUEST_TEMPLATES = {
    club:            [{ id: 'weed', tier: 'cheap' },        { id: 'mdma', tier: 'mid' },        { id: 'coke-bumps', tier: 'prize' }],
    street:          [{ id: 'zip-ties', tier: 'cheap' },    { id: 'pipe', tier: 'mid' },        { id: 'chloroform', tier: 'prize' }],
    library:         [{ id: 'duct-tape', tier: 'cheap' },   { id: 'rope', tier: 'mid' },        { id: 'handcuffs', tier: 'prize' }],
    sorority:        [{ id: 'wine', tier: 'cheap' },        { id: 'mdma', tier: 'mid' },        { id: 'coke-bumps', tier: 'prize' }],
    gym:             [{ id: 'bottled-water', tier: 'cheap' },{ id: 'rope', tier: 'mid' },       { id: 'coke-bumps', tier: 'prize' }],
    barista:         [{ id: 'weed', tier: 'cheap' },        { id: 'wine', tier: 'mid' },        { id: 'mdma', tier: 'prize' }],
    office:          [{ id: 'zip-ties', tier: 'cheap' },    { id: 'wine', tier: 'mid' },        { id: 'handcuffs', tier: 'prize' }],
    waitress:        [{ id: 'basic-meal', tier: 'cheap' },  { id: 'wine', tier: 'mid' },        { id: 'weed', tier: 'prize' }],
    model:           [{ id: 'condom-standard', tier: 'cheap' },{ id: 'wine', tier: 'mid' },     { id: 'mdma', tier: 'prize' }],
    nurse:           [{ id: 'basic-meal', tier: 'cheap' },  { id: 'rohypnol', tier: 'mid' },    { id: 'ketamine', tier: 'prize' }],
    neighbor:        [{ id: 'duct-tape', tier: 'cheap' },   { id: 'rope', tier: 'mid' },        { id: 'wine', tier: 'prize' }],
    unity_seed:      [{ id: 'weed', tier: 'cheap' },        { id: 'coke-bumps', tier: 'mid' },  { id: 'mdma', tier: 'prize' }],
    'highschool-grad':[{ id: 'weed', tier: 'cheap' },       { id: 'wine', tier: 'mid' },        { id: 'mdma', tier: 'prize' }],
    'family-friend': [{ id: 'basic-meal', tier: 'cheap' },  { id: 'wine', tier: 'mid' },        { id: 'rohypnol', tier: 'prize' }],
    'second-cousin': [{ id: 'weed', tier: 'cheap' },        { id: 'wine', tier: 'mid' },        { id: 'mdma', tier: 'prize' }],
    'college-student':[{ id: 'weed', tier: 'cheap' },       { id: 'wine', tier: 'mid' },        { id: 'mdma', tier: 'prize' }],
    _default:        [{ id: 'duct-tape', tier: 'cheap' },   { id: 'rope', tier: 'mid' },        { id: 'zip-ties', tier: 'prize' }]
  };
  // Base success odds per tier — the 80 / 50 / 25 the player asked for.
  const TIER_BASE = { cheap: 0.80, mid: 0.50, prize: 0.25 };
  const TIER_LABEL = { cheap: 'easy ask', mid: 'fair ask', prize: 'long shot' };
  // Location difficulty (0 easy … ~0.15 hard) — harder grounds make her warier.
  const LOCATION_REQ_DIFF = {
    street: 0, library: 0, park: 0.02, 'coffee-shop': 0.02, mall: 0.04, gym: 0.04,
    neighborhood: 0.05, club: 0.06, sorority: 0.08, 'school-campus': 0.10,
    'hotel-lobby': 0.12, 'private-party': 0.12, remote: 0.15
  };

  function requestTemplateFor(arch) { return REQUEST_TEMPLATES[arch] || REQUEST_TEMPLATES._default; }

  // Build the FULL ask list: the type template (themed cheap→prize) PLUS extra items this girl-type
  // plausibly carries (ARCHETYPE_LOOT_BIAS), tiered by how hard the LOCATION is — a starter spot
  // only coughs up basics, an end-game location gives prize-grade gear. Deduped + capped at 6 +
  // stable order so the once-a-day index stays consistent between requestOptions + requestItem.
  function buildRequestList(girl, locationId) {
    const arch = girl && girl.archetypeTemplate;
    const list = requestTemplateFor(arch).slice();          // 3 themed base items
    const seen = new Set(list.map(o => o.id));
    const locDiff = LOCATION_REQ_DIFF[locationId] || 0;
    const extraTier = locDiff >= 0.10 ? 'prize' : locDiff >= 0.05 ? 'mid' : 'cheap';
    const bias = ARCHETYPE_LOOT_BIAS[arch] || [];
    for (const id of bias) {
      if (seen.has(id)) continue;
      list.push({ id, tier: extraTier });
      seen.add(id);
      if (list.length >= 6) break;
    }
    return list;
  }
  function currentGameDay() {
    const gc = window.DMTHGame.gameClock;
    return gc ? Math.floor(gc.now() / (gc.MIN_PER_DAY || 1440)) + 1 : 1;
  }
  // Once-per-day key. Now that encounters persist with stable ids, this is
  // keyed per GIRL per location per day (was per-archetype while encounters were ephemeral) —
  // "once a day per girl in a location" exactly as asked.
  function requestKey(locationId, girlId) { return (locationId || '?') + '|' + (girlId || '?'); }

  // Stat-based success chance for one option. base(tier) + char-level bonus − location diff −
  // girl-type diff − her defiance/intelligence. Clamped 5–95% — never impossible, never certain.
  function requestSuccessChance(option, girl, locationId) {
    const base = TIER_BASE[option.tier] ?? 0.40;
    const lvl = window.DMTHGame.progression ? window.DMTHGame.progression.getLevel() : 0;
    const charBonus = Math.min(0.15, lvl * 0.015);   // smoother talker as you climb DEPRAVITY
    const locDiff = LOCATION_REQ_DIFF[locationId] || 0;
    const archDiff = (window.DMTHGame.hunt && window.DMTHGame.hunt.ARCHETYPE_DIFFICULTY[girl && girl.archetypeTemplate]) ?? 0.5;
    const girlDiff = archDiff * 0.18;                 // harder girl type = harder ask
    const defiance = (girl && girl.stats && girl.stats.defiance != null ? girl.stats.defiance : 50) / 100;
    const intel = (girl && girl.stats && girl.stats.intelligence != null ? girl.stats.intelligence : 50) / 100;
    const statPenalty = defiance * 0.12 + intel * 0.05;
    const p = base + charBonus - locDiff - girlDiff - statPenalty;
    return Math.max(0.05, Math.min(0.95, p));
  }

  // The three options for this girl + their live odds + whether today's ask is already spent.
  function requestOptions(girl, locationId) {
    const tpl = buildRequestList(girl, locationId);
    const usedToday = window.DMTHGame.state.lastItemRequestDay(requestKey(locationId, girl && (girl.id || girl.archetypeTemplate))) === currentGameDay();
    return {
      usedToday,
      options: tpl.map(o => ({
        id: o.id, tier: o.tier, label: label(o.id),
        tierLabel: TIER_LABEL[o.tier], chance: requestSuccessChance(o, girl, locationId)
      }))
    };
  }

  // Make the request for option `index`. Burns the daily attempt up front (success OR fail) per
  // (location, girl-type) so you can't re-roll by leaving and coming back. Grants 1× on success.
  function requestItem(girl, locationId, index) {
    const tpl = buildRequestList(girl, locationId);
    const opt = tpl[index];
    if (!opt) return { ok: false, reason: 'no such option' };
    const key = requestKey(locationId, girl && (girl.id || girl.archetypeTemplate));
    const day = currentGameDay();
    if (window.DMTHGame.state.lastItemRequestDay(key) === day) {
      return { ok: false, usedToday: true, reason: 'you already worked this type here today — come back tomorrow' };
    }
    window.DMTHGame.state.noteItemRequest(key, day);   // spend the daily attempt regardless of outcome
    const chance = requestSuccessChance(opt, girl, locationId);
    const roll = Math.random();
    if (roll > chance) {
      return { ok: false, id: opt.id, chance, roll, reason: 'won\'t give it up' };
    }
    window.DMTHGame.state.addItem(opt.id, 1);
    lootPop(`🎁 ${(girl && girl.name) || 'She'} hands over 1× ${label(opt.id)}.`);
    return { ok: true, id: opt.id, qty: 1, chance, roll };
  }

  // On CAPTURE you strip her stash — you get SOME OF ALL she had on her: 2-5 of EACH item her
  // girl-type offered (the same per-type template the pre-capture request draws from). Keyed to
  // the girl, not the location, so the haul matches the kind of girl you just took.
  function grantCaptureHaul(girl) {
    const tpl = requestTemplateFor(girl && girl.archetypeTemplate);
    const granted = [];
    for (const o of tpl) {
      const qty = 2 + Math.floor(Math.random() * 4);   // 2-5 of each
      window.DMTHGame.state.addItem(o.id, qty);
      granted.push({ id: o.id, qty });
    }
    // ~1 in 3 girls is carrying her own sex toy — a rare bonus drop on top of the normal haul.
    // Pulled from the toys catalog, filtered to ones usable at the player's current level.
    let toy = null;
    if (Math.random() < 1 / 3 && window.DMTHGame.toys && window.DMTHGame.toys.lootableIds) {
      const usable = window.DMTHGame.toys.lootableIds().filter(id =>
        window.DMTHGame.toys.levelOk ? window.DMTHGame.toys.levelOk(id) : true);
      if (usable.length) {
        const toyId = pick(usable);
        window.DMTHGame.state.addItem(toyId, 1);
        const spec = window.DMTHGame.toys.spec ? window.DMTHGame.toys.spec(toyId) : null;
        toy = { id: toyId, name: (spec && spec.name) || label(toyId), emoji: (spec && spec.emoji) || '🧰' };
      }
    }
    // Higher-TIER girls drop BETTER loot on capture: a tier-scaled bonus pull from the
    // FULL catalog (type-biased), on top of her stash + any toy. A harder/more-vibrant archetype
    // (higher ARCHETYPE_DIFFICULTY) → higher max item tier + more drops.
    const lootTier = girlLootTier(girl);
    const bonusN = 1 + (lootTier >= 4 ? 1 : 0) + (lootTier >= 5 ? 1 : 0);
    const bias = ARCHETYPE_LOOT_BIAS[girl && girl.archetypeTemplate] || null;
    const bonus = [];
    for (let i = 0; i < bonusN; i++) { const id = pickLootByTier(lootTier, bias); if (id) { window.DMTHGame.state.addItem(id, 1); bonus.push(id); } }
    if (window.DMTHNotify) {
      if (granted.length) lootPop(`🎒 Stripped her stash: ${granted.map(g => `${g.qty}× ${label(g.id)}`).join(', ')}.`);
      if (toy) lootPop(`${toy.emoji} She was carrying her own toy — looted 1× ${toy.name}!`);
      if (bonus.length) lootPop(`💎 Premium haul off a ${girl.archetypeTemplate} (loot tier ${lootTier}): ${bonus.map(label).join(', ')}.`);
    }
    return { items: granted, toy, bonus };
  }

  // Johns AND friends GIFT high-tier gear/toys/drugs on a successful use (the perk
  // of renting her out / letting friends in). Friends gift more + bigger; johns rarer + smaller.
  // Pool is the "good stuff" — heavy chems, premium restraints, chamber toys, capacity trainers.
  const HIGH_TIER_GIFTS = [
    'ketamine', 'chloroform', 'ether', 'rohypnol', 'tranquilizer',
    'handcuffs', 'shackles', 'harness',
    'mdma', 'coke-bumps',
    'monster-dildo', 'fucking-machine', 'flogger-whip', 'cattle-prod',
    'blue-pill', 'ben-wa-balls', 'vaginal-expander', 'condom-magnum',
    // A generous friend/john might gift you a whole Tit Sucker machine.
    'tit-sucker'
  ];
  function grantNpcGift(opts = {}) {
    // RARE: instead of gear, a generous client gifts the girl a slutty special
    // outfit (added free to HER wardrobe). Needs a girl context (opts.girlId); type-matched when
    // possible. ~12% on a generous/kill gift, lower otherwise. Falls through to a normal gift if
    // she already owns the rolled outfit or no girl is in context.
    if (opts.girlId && window.DMTHGame.wardrobe?.grantOutfit && Math.random() < (opts.generous || opts.kill ? 0.12 : 0.06)) {
      const ids = window.DMTHGame.wardrobe.skimpyOutfitIds ? window.DMTHGame.wardrobe.skimpyOutfitIds() : [];
      const g = window.DMTHGame.state.getGirl(opts.girlId);
      const oid = window.DMTHGame.wardrobe.skimpyForArchetype(g && g.archetypeTemplate)
        || (ids.length ? ids[Math.floor(Math.random() * ids.length)] : null);
      if (oid) {
        const r = window.DMTHGame.wardrobe.grantOutfit(opts.girlId, oid);
        if (r && r.ok) { lootPop(`👗 ${opts.from || 'A client'} gifted ${g ? g.name : 'her'} a ${r.outfit.displayName} to wear for him.`); return { id: oid, qty: 1, outfit: true }; }
      }
    }
    // Gift quality climbs the source ladder: a CORPSING kill drops the BEST (tier 5),
    // a generous friend tier 4, a routine john tier 3. Pulled from the FULL catalog, type-biased to
    // the girl when we have her; HIGH_TIER_GIFTS is the fallback bias/pool.
    const gMaxTier = opts.kill ? 5 : (opts.generous ? 4 : 3);
    const gGirl = opts.girlId ? window.DMTHGame.state.getGirl(opts.girlId) : null;
    const gBias = (ARCHETYPE_LOOT_BIAS[gGirl && gGirl.archetypeTemplate] || HIGH_TIER_GIFTS);
    const id = pickLootByTier(gMaxTier, gBias) || pick(HIGH_TIER_GIFTS);
    // A kill is an EPIC WIN for the john/friend — they tip bigger, so a kill-gift skews to 2×.
    const qty = 1 + ((opts.generous && Math.random() < 0.4) || (opts.kill && Math.random() < 0.7) ? 1 : 0);
    window.DMTHGame.state.addItem(id, qty);
    lootPop(`🎁 ${opts.from || 'A client'} ${opts.kill ? 'was THRILLED she died on him — left you' : 'left you'} ${qty}× ${label(id)} — high-tier gift.`);
    return { id, qty };
  }

  // ── Passive per-archetype loot gifts ──────────────────────────────────────
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
    LOCATION_LOOT, FULL_POOL, ARCHETYPE_GIFTS, REQUEST_TEMPLATES, TIER_BASE,
    rollCaptureLoot, scavengeLocation, tickArchetypeGifts,
    requestOptions, requestItem, grantCaptureHaul,
    HIGH_TIER_GIFTS, grantNpcGift,
    lootByTierPools, pickLootByTier, girlLootTier
  });
})();
