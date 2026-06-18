// DUNGEON MASTER: THE HUNT — central game state. Reactive, IDB-backed.
// Every subsystem reads/writes through DMTHGame.state.*. Mutations emit 'change' events
// for UI refresh. Persisted atomically after every mutation.

(function () {
  'use strict';

  const DEFAULT_STATE = {
    version: 1,
    createdAt: null,
    mode: 'normal',                // 'normal' | 'sandbox'
    tickCount: 0,

    // Set by the arrest system (js/game/arrest.js) when a raid ends the run — jail, no bail.
    // { reason, at, finalStats } | null. When set, the tick loop halts and the game-over
    // screen takes over. The lose condition.
    gameOver: null,

    wallet: {
      money: 200,
      notoriety: 0,
      suspicionByLocation: {},
      // Player satisfaction meter (0-100). Sex acts with captives raise it; slow per-tick
      // decay drops it without intimacy. High satisfaction grants a hunting bonus —
      // capture odds get easier the more satisfied the player is.
      playerSatisfaction: 50,
      // BUZZ meter (0-100). Underground word-of-mouth about the operator's dungeons —
      // distinct from `notoriety` which is cop-heat. Bumped by film sales, successful
      // john completions, high-bond captives in the roster, stress-band streaks. Drained
      // by time-decay between income events, failed encounters, captive deaths. Drives
      // a buzzMul = 1 + (buzz/100) on whore-out john arrival rate — BUZZ 100 doubles
      // the johns coming through. Visible as chrome-bar 🐝 BUZZ badge.
      buzz: 0,

      // WANTED level (0-100). The law-heat axis — distinct from `notoriety` (legacy soft
      // stat) and `buzz` (good underground rep). Builds from hunts/escapes/deaths/sloppy
      // disposal/corpse content; decays slowly over time (js/game/wanted.js decayTick).
      // High tiers trigger raids → fines → jail → GAME OVER (arrest system). Pure liability.
      wanted: 0,

      // DEPRAVITY XP (0+). The player-progression spine (js/game/progression.js). Earned from
      // every successful action; the derived DEPRAVITY level gates high-tier depravities
      // (branding / extreme acts / nugget / dismember / later hunting grounds). Level is always
      // computed from this xp — never stored separately.
      depravityXp: 0,

      // SEXDRIVE.1 — player sexual-drive NEED (0..scaling cap). Fed by sex acts, decays over
      // time. Maxed = stat boosts (hunting/cash); deprived = debuffs. The CAP scales with
      // roster size + DEPRAVITY level (js/game/sexdrive.js) so it can't be maxed early.
      sexDrive: 0,

      // PLAYERSTAM.1 — "💦 Nut Reserve" (0-100). The player's spend-it-to-use-them resource:
      // every act on a girl drains it (heavy/extreme acts cost more), it regenerates each tick
      // (js/game/playerstamina.js), and it's instantly refilled by viagra / girl's-milk / etc.
      // Empty = "running on fumes" debuff. Depraved-named per Gee, NOT "stamina".
      nutReserve: 100
    },

    inventory: {},                 // { [itemId]: qty }

    dungeons: [],                  // [{ id, templateId, holds:[{id, captiveGirlId|null, upgrades}], purchasedAt }]

    properties: [],                // [{ locationId, owned, passiveIncomePerTick }]
    unlockedLocations: [],         // [locationId] hunting grounds with bought private access (PLVL.2)
    ownedLocations: [],            // [locationId] locations BOUGHT OUT — you own the turf, grants perks (BUYLOCATION.1)
    purchasedUnlocks: [],          // [unlockKey] gated action tiers bought early with cash (PAYUNLOCK.1)

    roster: [],                    // [GirlProfile+state]  id-keyed; see girl-gen.js

    films: [],                     // [Film]  see film.js
    disposals: [],                 // [DisposalLog]
    trophies: [],                  // [Trophy] minted on terminal disposal — see trophies.js. Each grants stacking player perks.
    bodyParts: [],                 // [BodyPart] harvested via the dismember disposal path — sold passively in the body-part market (market.js).
    propositioners: {              // propositioner business sim
      inbox: [],                   // pending offers
      active: [],                  // engagements underway
      completed: [],               // resolved
      repeatClients: {}            // { clientId: {rep, visits, preferredGirls:[]} }
    },

    slaveMarket: {
      listed: [],                  // player listings for sale
      available: [],               // procedural girls for sale by NPCs
      recentSales: []
    },

    turns: {},                     // { girlId: [{role, text, ts}] }  per-girl chat log (bounded)
    activity: {},                  // GIRLHIST.1 — { girlId: [{ts, gameMin, kind, label, detail}] } per-girl activity history (bounded)
    friendCreep: {},               // FRIENDCREEP.1 — { friendArchetypeId: {level 0-10, into} } per-friend creep progression

    // REQUEST.1 — pre-capture item-request cooldown log. Keyed by `${locationId}|${archetype}`,
    // value = the game-day number the last request was made. Enforces "once a day per girl-type
    // per location" so pre-capture item asks are a trickle, never an endless faucet.
    itemRequestLog: {},

    // NAMELOCK.1 — lowercased full names already in play this game. girl-gen consults this to
    // avoid generating two girls with the same name; capture + persistent location spawns
    // register here so names never collide within a single playthrough.
    usedNames: [],

    // LOCPERSIST.1 — persistent per-location spawn sets. Keyed by locationId →
    // { girls:[GirlProfile], rolledDay, expiresDay, taken:{ [girlId]: 'captured'|'walked' } }.
    // Same location, same day = same girls; the set refreshes after a randomized 2-4 day window.
    locationSpawns: {},

    settings: {
      mode: 'sexy',                // 'sexy' | 'hurtme' | 'sexy_with_damage'
      activeGirlId: null,
      activeDungeonId: null,
      // What the girls call the player — set at new-game. Default 'Master'. Injected into
      // every system prompt so captives address the player by his chosen name, not just "Master".
      playerName: 'Master'
    }
  };

  const listeners = new Set();
  function emit() { for (const fn of listeners) { try { fn(state); } catch {} } }
  function onChange(fn) { listeners.add(fn); return () => listeners.delete(fn); }

  let state = null;
  let loaded = false;

  async function load() {
    const stored = await window.DMTHStorage.save.get('main');
    state = stored && stored.version === DEFAULT_STATE.version
      ? Object.assign({}, DEFAULT_STATE, stored)
      : null;
    if (state) migrateLoadedState(state);
    loaded = true;
    return state;
  }

  // One-shot migrations on load — repair save shapes that pre-date a schema change.
  // Each migration is idempotent + null-safe so re-running doesn't double-mutate.
  function migrateLoadedState(s) {
    // Wallet backfill — the shallow load-merge (Object.assign) lets an old save's wallet
    // overwrite DEFAULT_STATE.wallet wholesale, dropping fields added after that save was
    // written. Backfill the heat/economy meters so reads never hit undefined.
    if (s.wallet) {
      if (typeof s.wallet.wanted !== 'number') s.wallet.wanted = 0;
      if (typeof s.wallet.buzz !== 'number') s.wallet.buzz = 0;
      if (typeof s.wallet.playerSatisfaction !== 'number') s.wallet.playerSatisfaction = 50;
      if (typeof s.wallet.depravityXp !== 'number') s.wallet.depravityXp = 0;
      if (typeof s.wallet.sexDrive !== 'number') s.wallet.sexDrive = 0;
      if (typeof s.wallet.nutReserve !== 'number') s.wallet.nutReserve = 100;
      if (!s.wallet.suspicionByLocation) s.wallet.suspicionByLocation = {};
    }
    // Nested-container backfill — the shallow load-merge can drop sub-shapes added after an
    // old save was written. Guard every container the engine assumes exists (IMG.7).
    if (!s.trophies) s.trophies = [];
    if (!s.bodyParts) s.bodyParts = [];
    if (!s.unlockedLocations) s.unlockedLocations = [];
    if (!s.ownedLocations) s.ownedLocations = [];
    if (!s.purchasedUnlocks) s.purchasedUnlocks = [];
    if (!s.settings) s.settings = {};
    if (!s.settings.playerName) s.settings.playerName = 'Master';
    if (!s.slaveMarket) s.slaveMarket = { listed: [], available: [], recentSales: [] };
    else { s.slaveMarket.listed ||= []; s.slaveMarket.available ||= []; s.slaveMarket.recentSales ||= []; }
    if (!s.propositioners) s.propositioners = { inbox: [], active: [], completed: [], repeatClients: {} };
    else { s.propositioners.inbox ||= []; s.propositioners.active ||= []; s.propositioners.completed ||= []; s.propositioners.repeatClients ||= {}; }
    if (!s.disposals) s.disposals = [];
    if (!s.turns) s.turns = {};
    if (!s.activity) s.activity = {};   // GIRLHIST.1 — backfill the activity log for pre-feature saves
    if (!s.friendCreep) s.friendCreep = {};   // FRIENDCREEP.1 — backfill the creep-level store
    if (!s.itemRequestLog || typeof s.itemRequestLog !== 'object') s.itemRequestLog = {};
    if (!Array.isArray(s.usedNames)) s.usedNames = [];
    if (!s.locationSpawns || typeof s.locationSpawns !== 'object') s.locationSpawns = {};
    // Dungeon-level backfill — the shared supply POOL (POOL-SUPPLY.1) + per-hold toy mounts
    // (TOY-HOLD.1) + condom/drug reserves. Defense-in-depth so any future unguarded read on an
    // old save can't hit undefined.
    for (const d of s.dungeons || []) {
      if (!d.pool || typeof d.pool !== 'object') d.pool = { food: 0, water: 0, condoms: 0, drugs: {} };
      else { d.pool.food ||= 0; d.pool.water ||= 0; d.pool.condoms ||= 0; if (!d.pool.drugs || typeof d.pool.drugs !== 'object') d.pool.drugs = {}; }
      for (const h of d.holds || []) {
        if (h && !Array.isArray(h.toys)) h.toys = [];
        if (h && typeof h.condomReserve !== 'number') h.condomReserve = 0;
        if (h && (!h.drugReserve || typeof h.drugReserve !== 'object')) h.drugReserve = {};
        // TITSUCKER.1 — one Tit Sucker can be attached per hold; it bottles the held girl's milk.
        if (h && typeof h.titSucker !== 'boolean') h.titSucker = false;
      }
    }
    // TITSUCKER.1 — legacy conversion. The old single global 'milk-sucker' rig is replaced by
    // per-hold 'tit-sucker' machines. Carry any owned legacy rig over as an unattached Tit
    // Sucker the player re-attaches to a hold. Idempotent (only fires while the old key exists).
    if (s.inventory && s.inventory['milk-sucker']) {
      s.inventory['tit-sucker'] = (s.inventory['tit-sucker'] || 0) + s.inventory['milk-sucker'];
      delete s.inventory['milk-sucker'];
    }
    if (!s.roster) return;
    // Known archetype-id → canonical display name fallbacks for the seeded captives.
    // Procedural archetypes (library/club/street/sorority/gym/barista/etc.) use their
    // namePool[0] as a recovery hint when name was wiped or set to the archetype id.
    const NAME_FALLBACKS = {
      'unity_seed':  'Unity',
      'unity':       'Unity'
    };
    const ARCHETYPE_NAME_POOL_HEAD = {
      library: 'Marcy', club: 'Taryn', street: 'Nikki', sorority: 'Ashley',
      gym: 'Alex', barista: 'Juno', office: 'Alison', waitress: 'Candy',
      model: 'Sasha', nurse: 'Jennifer'
    };
    for (const g of s.roster) {
      if (!g) continue;
      // Repair name when it's been persisted as the archetype id (Unity_seed / unity_seed
      // / similar). Bootstrap.js writes 'Unity' correctly going forward; this migration
      // catches existing saves where the name slot got the archetype id.
      const arch = g.archetypeTemplate;
      const nameLooksLikeArchetype = typeof g.name === 'string' && (
        g.name === arch ||
        g.name.toLowerCase() === (arch || '').toLowerCase() ||
        /^[a-z_]+_seed$/i.test(g.name)
      );
      if (nameLooksLikeArchetype) {
        const fixed = NAME_FALLBACKS[arch] || ARCHETYPE_NAME_POOL_HEAD[arch] || 'Captive';
        console.info(`[state-migrate] repaired ${g.id} name "${g.name}" → "${fixed}"`);
        g.name = fixed;
      }
      // Backfill body fields the renderer assumes exist on every captive. Old saves
      // pre-date some of these (cumLoad / stamina / health / lastFedAt / decayedMinutes).
      // The renderer accesses them as bare numbers (g.body.cumLoad.toFixed(1) etc.) and
      // throws when they're undefined — the BUGStwo.38a "page won't open" symptom.
      g.body = g.body || {};
      const BODY_DEFAULTS = {
        arousal: 0, wetness: 0, cumLoad: 0, bruises: 0, high: 0,
        stamina: 70, health: 100,
        activeDrugs: [], outfitState: 'intact',
        // CUMFILL.1 — vaginal cum-fill meter (preggo-relevant; distinct from generic cumLoad)
        // + the sustained-fill maintain counter that the preggo timer reads.
        vaginalCum: 0, preggoFillMaintained: 0,
        // XTOL.1 — running count of extreme acts since her last recovery (heal/care/rest).
        extremeStreak: 0,
        // CUMCAP.1 — per-girl cum-load STORAGE capacity (trained up by vaginal-weight tools).
        // cumLoad is clamped to this; near-cap = pay premium, sustained high = mood/health/escape cost.
        cumLoadCap: 10,
        // MILKBAL.1 — per-girl breast-milk fill (liters). Refills slowly over time ONLY while
        // she's lactating (preggo 2nd-trimester+ OR inside the postpartum window). A direct
        // suck empties her; a Tit Sucker bottles it. Bounded by breastCap → no endless milk.
        breastMilk: 0,
        // MILKBAL.1 — postpartum lactation window expiry (real-ms timestamp). Set on delivery;
        // while now < this she keeps lactating "a few days after birth". 0 = not in window.
        lactatingUntil: 0,
        // Trophy-history — running count of PLAYER acts committed against her (johns/friends are
        // counted separately in her whore-out ledger). Surfaced in her death record + trophy.
        actsCommitted: 0,
        // Trophy-history — total liters of milk she produced for you (bottled + sucked).
        milkProducedTotal: 0,
        // CUMTOOL.1 — an insertable hold-in plug left in over time. { itemId, startTick } | null;
        // when the timer elapses her cumLoadCap upgrades. Gapes/stretches her image while in.
        cumImplant: null,
        // PERIOD.1 — menstrual cycle. She bleeds for ~1 game day every ~5 game days. `onPeriod`
        // is the live flag; `periodStartedAt` stamps the current bleed's start (game-minutes);
        // `lastPeriodAt` stamps the last cycle start so the 5-day cadence measures from it.
        // period.tick() drives all three; a pregnant girl doesn't cycle.
        onPeriod: false,
        periodStartedAt: 0,
        lastPeriodAt: 0
      };
      for (const [k, v] of Object.entries(BODY_DEFAULTS)) {
        if (g.body[k] == null) g.body[k] = v;
      }
      // Permanent ownership marks (DEP-EXP.1) — own array per girl (never the shared default
      // ref) so marks can't alias across captives. Lazy-init for saves predating the feature.
      if (!Array.isArray(g.body.ownershipMarks)) g.body.ownershipMarks = [];
      // Forced-addiction map (DEP-EXP.2) — own object per girl. { [drugKey]: 0-100 }.
      if (!g.body.addiction || typeof g.body.addiction !== 'object') g.body.addiction = {};
      // KINKMATRIX.1 / KINKDISC.1 — backfill a hidden like/dislike on pre-feature captives.
      if (!g.kink || typeof g.kink !== 'object') {
        const KC = ['tenderness', 'rough', 'anal', 'oral', 'choke', 'pain', 'degradation', 'drugs'];
        const li = Math.floor(Math.random() * KC.length);
        let di = Math.floor(Math.random() * KC.length); if (di === li) di = (li + 1) % KC.length;
        g.kink = { like: KC[li], dislike: KC[di], likeFound: false, dislikeFound: false };
      }
      // bond / mood / escape minimal shape
      g.bond = g.bond || { bondLevel: 0, bondXP: 0, bondDebt: 0, milestones: [] };
      if (g.bond.bondLevel == null) g.bond.bondLevel = 0;
      if (g.bond.bondXP == null) g.bond.bondXP = 0;
      if (g.bond.bondDebt == null) g.bond.bondDebt = 0;
      g.mood = g.mood || { mood: 'neutral', moodEmoji: '🙂', history: [] };
      if (g.mood.mood == null) g.mood.mood = 'neutral';
      if (g.mood.moodEmoji == null) g.mood.moodEmoji = '🙂';
      g.escape = g.escape || { currentRisk: 0.1, factors: {}, lastAttempt: null };
      // New per-girl array fields (MULTIGIRL.3 scene roster + DEATHSTATS.1 dungeon history).
      if (!Array.isArray(g.dungeonHistory)) g.dungeonHistory = [];
      if (!Array.isArray(g.sceneGirlIds)) g.sceneGirlIds = [];
      // SPECIALIZE.1 — per-girl specialization upgrades (e.g. big-tits = 2× milk). Ids only;
      // effects resolved live by js/game/specialize.js.
      if (!Array.isArray(g.specializations)) g.specializations = [];
    }
  }

  async function save() {
    if (!state) return;
    // Refuse to save while a wipe is in progress. Without this, an in-flight tick-driven
    // mutate() between wipeAll() and location.reload() would repopulate the save store
    // with the old state, defeating "fresh slate".
    if (window.DMTHGame?.state?._nuking) return;
    await window.DMTHStorage.save.put('main', state);
  }

  function initNew(opts = {}) {
    state = JSON.parse(JSON.stringify(DEFAULT_STATE));
    state.createdAt = Date.now();
    state.mode = opts.mode || 'normal';
    if (state.mode === 'sandbox') {
      state.wallet.money = window.DMTHConfig.GAME.sandboxMoney;
    } else {
      state.wallet.money = window.DMTHConfig.GAME.startingMoney;
    }
    return state;
  }

  // --- Mutators (each auto-persists + emits) ---

  function mutate(fn) {
    if (!state) throw new Error('[state] not loaded');
    fn(state);
    save();
    emit();
  }

  // wallet
  function addMoney(amount, reason) {
    mutate(s => {
      s.wallet.money += amount;
      s._lastTxn = { amount, reason, at: Date.now() };
    });
  }
  function spendMoney(amount, reason) {
    if (!state || state.wallet.money < amount) return false;
    mutate(s => {
      s.wallet.money -= amount;
      s._lastTxn = { amount: -amount, reason, at: Date.now() };
    });
    return true;
  }
  function addNotoriety(delta) { mutate(s => { s.wallet.notoriety = Math.max(0, s.wallet.notoriety + delta); }); }
  function addSatisfaction(delta, reason) {
    mutate(s => {
      const cur = typeof s.wallet.playerSatisfaction === 'number' ? s.wallet.playerSatisfaction : 50;
      s.wallet.playerSatisfaction = Math.max(0, Math.min(100, cur + delta));
      s.wallet._lastSatisfactionEvent = { delta, reason, at: Date.now() };
    });
  }
  function getSatisfaction() { return typeof state?.wallet?.playerSatisfaction === 'number' ? state.wallet.playerSatisfaction : 50; }
  function addBuzz(delta, reason) {
    mutate(s => {
      const cur = typeof s.wallet.buzz === 'number' ? s.wallet.buzz : 0;
      s.wallet.buzz = Math.max(0, Math.min(100, cur + delta));
      s.wallet._lastBuzzEvent = { delta, reason, at: Date.now() };
    });
  }
  function getBuzz() { return typeof state?.wallet?.buzz === 'number' ? state.wallet.buzz : 0; }
  function addWanted(delta, reason) {
    mutate(s => {
      const cur = typeof s.wallet.wanted === 'number' ? s.wallet.wanted : 0;
      s.wallet.wanted = Math.max(0, Math.min(100, cur + delta));
      s.wallet._lastWantedEvent = { delta, reason, at: Date.now() };
    });
  }
  function getWanted() { return typeof state?.wallet?.wanted === 'number' ? state.wallet.wanted : 0; }
  function addDepravityXp(delta, reason) {
    mutate(s => {
      const cur = typeof s.wallet.depravityXp === 'number' ? s.wallet.depravityXp : 0;
      s.wallet.depravityXp = Math.max(0, cur + delta);
      s.wallet._lastDepravityEvent = { delta, reason, at: Date.now() };
    });
  }
  function getDepravityXp() { return typeof state?.wallet?.depravityXp === 'number' ? state.wallet.depravityXp : 0; }
  function setSexDrive(v) { mutate(s => { s.wallet.sexDrive = Math.max(0, v); }); }
  function getSexDrive() { return typeof state?.wallet?.sexDrive === 'number' ? state.wallet.sexDrive : 0; }
  // PLAYERSTAM.1 — Nut Reserve (0-100).
  function setNutReserve(v) { mutate(s => { s.wallet.nutReserve = Math.max(0, Math.min(100, v)); }); }
  function getNutReserve() { return typeof state?.wallet?.nutReserve === 'number' ? state.wallet.nutReserve : 100; }

  // inventory
  // Per-item max is basically-unlimited (ITEMCAP.1) — 9999 of each. The sandbox / everything-
  // unlocked start seeds 99 of each (bootstrap.js), which is fine; this clamp guarantees the
  // player can keep GAINING well past the starting amount (buy / loot) up to 9999, while
  // preventing a runaway/overflow count.
  const ITEM_MAX = 9999;
  function addItem(itemId, qty = 1) {
    mutate(s => { s.inventory[itemId] = Math.min(ITEM_MAX, (s.inventory[itemId] || 0) + qty); });
  }
  function consumeItem(itemId, qty = 1) {
    if (!state || (state.inventory[itemId] || 0) < qty) return false;
    mutate(s => {
      s.inventory[itemId] -= qty;
      if (s.inventory[itemId] <= 0) delete s.inventory[itemId];
    });
    return true;
  }

  // dungeons
  function addDungeon(dungeon) { mutate(s => { s.dungeons.push(dungeon); }); }
  function updateDungeon(id, patch) {
    mutate(s => {
      const d = s.dungeons.find(x => x.id === id);
      if (d) Object.assign(d, patch);
    });
  }
  function getDungeon(id) { return state?.dungeons.find(d => d.id === id); }

  // roster
  function addGirl(girl) { mutate(s => { s.roster.push(girl); }); }
  function updateGirl(id, patch) {
    mutate(s => {
      const g = s.roster.find(x => x.id === id);
      if (g) deepMerge(g, patch);
    });
  }
  function getGirl(id) { return state?.roster.find(g => g.id === id); }
  function removeGirl(id) { mutate(s => { s.roster = s.roster.filter(g => g.id !== id); }); }

  function deepMerge(target, src) {
    for (const k of Object.keys(src)) {
      const v = src[k];
      if (v !== null && typeof v === 'object' && !Array.isArray(v) && typeof target[k] === 'object' && target[k] !== null) {
        deepMerge(target[k], v);
      } else {
        target[k] = v;
      }
    }
  }

  // turns
  // `speaker` is optional — used by the multi-girl scene (MULTIGIRL.2) to mirror a partner
  // captive's reply into the HOST girl's shared log with HER name, while each girl's OWN log
  // stays speaker-less (so each girl's Ollama context only ever sees her own lines — the
  // context builder filters out speaker-tagged turns).
  function appendTurn(girlId, role, text, speaker) {
    mutate(s => {
      if (!s.turns[girlId]) s.turns[girlId] = [];
      const entry = { role, text, ts: Date.now() };
      if (speaker) entry.speaker = speaker;
      s.turns[girlId].push(entry);
      if (s.turns[girlId].length > 200) s.turns[girlId] = s.turns[girlId].slice(-200);
    });
  }
  function getTurns(girlId, n = 10) {
    return (state?.turns[girlId] || []).slice(-n);
  }
  // Wipes the per-girl turn log so the room view starts blank. Other girls' logs untouched.
  function clearTurns(girlId) {
    mutate(s => {
      if (s.turns[girlId]) delete s.turns[girlId];
    });
  }

  // GIRLHIST.1 — per-girl ACTIVITY history (distinct from the chat `turns` log). A running list of
  // everything DONE to/by her — player acts (+ the buff/debuff each caused), johns/friends, milk
  // bottled, cash made, captures, births. Surfaced LIVE in the room (no waiting for a trophy) AND
  // in her trophy/dossier via a shared renderer. Bounded; stamps both real-ms ts + game-minutes.
  //   entry: { kind, label, detail?, delta? }  — kind groups it (action|john|friend|milk|cash|capture|birth|death|buff)
  function appendActivity(girlId, entry) {
    if (!girlId || !entry) return;
    mutate(s => {
      if (!s.activity) s.activity = {};
      if (!s.activity[girlId]) s.activity[girlId] = [];
      const e = { ts: Date.now(), kind: entry.kind || 'action', label: entry.label || '' };
      if (entry.detail) e.detail = entry.detail;
      if (entry.delta) e.delta = entry.delta;
      const clk = window.DMTHGame.gameClock;
      if (clk && typeof clk.now === 'function') e.gameMin = clk.now();
      s.activity[girlId].push(e);
      if (s.activity[girlId].length > 300) s.activity[girlId] = s.activity[girlId].slice(-300);
    });
  }
  function getActivity(girlId, n) {
    const arr = (state?.activity && state.activity[girlId]) || [];
    return n ? arr.slice(-n) : arr.slice();
  }
  function clearActivity(girlId) {
    mutate(s => { if (s.activity && s.activity[girlId]) delete s.activity[girlId]; });
  }

  // FRIENDCREEP.1 — per-friend-archetype CREEP level 0-10. A friend levels up on successful visits
  // with a TRIANGULAR cost (Gee: "first fuck success 1 levle up next level 2 fucks next level 3
  // fuckes ... to levle 10"): reaching L1 takes 1 success, L1→L2 takes 2 more, L2→L3 takes 3 more,
  // … L9→L10 takes 10 more. Higher creep = he returns + hits harder + pays more + better loot.
  function getFriendCreep(archetypeId) {
    const fc = (state?.friendCreep && state.friendCreep[archetypeId]) || null;
    return { level: (fc && fc.level) || 0, into: (fc && fc.into) || 0 };
  }
  // Record a successful friend visit → advance his creep progress; returns { level, leveled }.
  function noteFriendCreepSuccess(archetypeId) {
    let out = { level: 0, leveled: false };
    if (!archetypeId) return out;
    mutate(s => {
      if (!s.friendCreep) s.friendCreep = {};
      const fc = s.friendCreep[archetypeId] || { level: 0, into: 0 };
      if ((fc.level || 0) >= 10) { s.friendCreep[archetypeId] = fc; out = { level: 10, leveled: false }; return; }
      fc.into = (fc.into || 0) + 1;
      const need = (fc.level || 0) + 1;            // L0→1 needs 1, L1→2 needs 2, … L9→10 needs 10
      let leveled = false;
      if (fc.into >= need) { fc.level = (fc.level || 0) + 1; fc.into = 0; leveled = true; }
      s.friendCreep[archetypeId] = fc;
      out = { level: fc.level, leveled };
    });
    return out;
  }

  // films
  function addFilm(film) { mutate(s => { s.films.push(film); }); }
  function updateFilm(id, patch) {
    mutate(s => {
      const f = s.films.find(x => x.id === id);
      if (f) Object.assign(f, patch);
    });
  }
  function getFilm(id) { return state?.films.find(f => f.id === id); }

  // disposals
  function addDisposal(log) { mutate(s => { s.disposals.push(log); }); }

  // trophies — minted on terminal disposal; never removed (permanent collection + perks).
  function addTrophy(trophy) { mutate(s => { if (!s.trophies) s.trophies = []; s.trophies.push(trophy); }); }
  function getTrophies() { return (state && state.trophies) || []; }

  // body parts — harvested via the dismember disposal path (DEP-EXP.3); sold in the body-part market.
  function addBodyPart(part) { mutate(s => { if (!s.bodyParts) s.bodyParts = []; s.bodyParts.push(part); }); }
  function getBodyParts() { return (state && state.bodyParts) || []; }
  function removeBodyPart(id) { mutate(s => { if (s.bodyParts) s.bodyParts = s.bodyParts.filter(p => p.id !== id); }); }

  // unlocked hunting grounds — bought private access (PLVL.2). Never removed.
  function addUnlockedLocation(locId) { mutate(s => { if (!s.unlockedLocations) s.unlockedLocations = []; if (!s.unlockedLocations.includes(locId)) s.unlockedLocations.push(locId); }); }
  // BUYLOCATION.1 — locations BOUGHT OUT (you own the turf → perks). Never removed.
  function addOwnedLocation(locId) { mutate(s => { if (!s.ownedLocations) s.ownedLocations = []; if (!s.ownedLocations.includes(locId)) s.ownedLocations.push(locId); }); }
  // purchased early-access action unlocks (PAYUNLOCK.1). Never removed.
  function addPurchasedUnlock(key) { mutate(s => { if (!s.purchasedUnlocks) s.purchasedUnlocks = []; if (!s.purchasedUnlocks.includes(key)) s.purchasedUnlocks.push(key); }); }

  // propositioners
  function enqueuePropositioner(p) { mutate(s => { s.propositioners.inbox.push(p); }); }
  function acceptPropositioner(id, girlId, terms) {
    mutate(s => {
      const i = s.propositioners.inbox.findIndex(p => p.id === id);
      if (i < 0) return;
      const [p] = s.propositioners.inbox.splice(i, 1);
      p.acceptedAt = Date.now();
      p.girlId = girlId;
      p.terms = terms;
      p.endsAt = Date.now() + (terms.durationMinutes || 60) * 60 * 1000;
      s.propositioners.active.push(p);
    });
  }
  function completePropositioner(id, outcome) {
    mutate(s => {
      const i = s.propositioners.active.findIndex(p => p.id === id);
      if (i < 0) return;
      const [p] = s.propositioners.active.splice(i, 1);
      p.outcome = outcome;
      p.completedAt = Date.now();
      s.propositioners.completed.push(p);
      // Update repeat-client memory
      const key = p.clientId;
      if (!s.propositioners.repeatClients[key]) {
        s.propositioners.repeatClients[key] = { rep: 0, visits: 0, preferredGirls: [] };
      }
      const rc = s.propositioners.repeatClients[key];
      rc.visits++;
      rc.rep += outcome.satisfaction || 0;
      if (outcome.satisfaction > 0.6 && !rc.preferredGirls.includes(p.girlId)) rc.preferredGirls.push(p.girlId);
    });
  }
  function rejectPropositioner(id) {
    mutate(s => {
      s.propositioners.inbox = s.propositioners.inbox.filter(p => p.id !== id);
    });
  }

  // slave market
  function listGirlForSale(girlId, price) {
    mutate(s => {
      s.slaveMarket.listed.push({ girlId, price, listedAt: Date.now() });
    });
  }
  function unlistGirl(girlId) {
    mutate(s => {
      s.slaveMarket.listed = s.slaveMarket.listed.filter(l => l.girlId !== girlId);
    });
  }

  // tick
  function bumpTick() { mutate(s => { s.tickCount++; }); }

  // game over — the lose condition (arrest → jail). Idempotent: first call wins.
  function setGameOver(reason, finalStats) {
    mutate(s => {
      if (s.gameOver) return;
      s.gameOver = { reason, at: Date.now(), finalStats: finalStats || null };
    });
  }
  function isGameOver() { return !!(state && state.gameOver); }

  // Player name / honorific the captives address the player by.
  function setPlayerName(name) {
    mutate(s => {
      if (!s.settings) s.settings = {};
      s.settings.playerName = (name && String(name).trim()) || 'Master';
    });
  }
  function getPlayerName() { return (state && state.settings && state.settings.playerName) || 'Master'; }

  // REQUEST.1 — pre-capture item-request daily cooldown. `key` = `${locationId}|${archetype}`.
  function noteItemRequest(key, day) { mutate(s => { if (!s.itemRequestLog) s.itemRequestLog = {}; s.itemRequestLog[key] = day; }); }
  function lastItemRequestDay(key) { return (state && state.itemRequestLog && state.itemRequestLog[key]) || null; }

  // NAMELOCK.1 — register a full name as used so no future girl reuses it this game.
  function noteUsedName(name) {
    if (!name) return;
    mutate(s => {
      if (!Array.isArray(s.usedNames)) s.usedNames = [];
      const lc = String(name).toLowerCase();
      if (!s.usedNames.some(n => String(n).toLowerCase() === lc)) s.usedNames.push(name);
    });
  }

  // LOCPERSIST.1 — persistent per-location spawn sets. read/write the whole record for a location.
  function getLocationSpawns(locId) { return (state && state.locationSpawns && state.locationSpawns[locId]) || null; }
  function setLocationSpawns(locId, record) { mutate(s => { if (!s.locationSpawns) s.locationSpawns = {}; s.locationSpawns[locId] = record; }); }
  function updateLocationSpawns(locId, patch) {
    mutate(s => {
      if (!s.locationSpawns) s.locationSpawns = {};
      s.locationSpawns[locId] = { ...(s.locationSpawns[locId] || {}), ...patch };
    });
  }

  window.DMTHGame = window.DMTHGame || {};
  window.DMTHGame.state = {
    get current() { return state; },
    isLoaded: () => loaded,
    load, save, initNew, onChange,
    addMoney, spendMoney, addNotoriety,
    addSatisfaction, getSatisfaction,
    addBuzz, getBuzz,
    addWanted, getWanted,
    addDepravityXp, getDepravityXp,
    setSexDrive, getSexDrive,
    setNutReserve, getNutReserve,
    addItem, consumeItem,
    addDungeon, updateDungeon, getDungeon,
    addGirl, updateGirl, getGirl, removeGirl,
    appendTurn, getTurns, clearTurns,
    appendActivity, getActivity, clearActivity,
    getFriendCreep, noteFriendCreepSuccess,
    addFilm, updateFilm, getFilm,
    addDisposal,
    addTrophy, getTrophies,
    addBodyPart, getBodyParts, removeBodyPart,
    addUnlockedLocation, addOwnedLocation, addPurchasedUnlock,
    enqueuePropositioner, acceptPropositioner, completePropositioner, rejectPropositioner,
    listGirlForSale, unlistGirl,
    bumpTick,
    setGameOver, isGameOver,
    setPlayerName, getPlayerName,
    noteItemRequest, lastItemRequestDay,
    noteUsedName,
    getLocationSpawns, setLocationSpawns, updateLocationSpawns
  };
})();
