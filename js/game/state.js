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

      // player sexual-drive NEED (0..scaling cap). Fed by sex acts, decays over
      // time. Maxed = stat boosts (hunting/cash); deprived = debuffs. The CAP scales with
      // roster size + DEPRAVITY level (js/game/sexdrive.js) so it can't be maxed early.
      sexDrive: 0,

      // "💦 Nut Reserve" (0-100). The player's spend-it-to-use-them resource:
      // every act on a girl drains it (heavy/extreme acts cost more), it regenerates each tick
      // (js/game/playerstamina.js), and it's instantly refilled by viagra / girl's-milk / etc.
      // Empty = "running on fumes" debuff. Depraved-named , NOT "stamina".
      nutReserve: 100,

      // a revolving credit line the player charges when cash-short. `balance` is the
      // current debt owed; `limit` is the ceiling and GROWS the more you pay it off (big) + use
      // it (small), capped. Card PAYMENTS flow through spendMoney (cash ledger); charges live
      // here as debt (not cash), surfaced in the finance tab. Interest on a carried balance =
      //  (wired into tick later).
      credit: { limit: 500, balance: 0, chargedLifetime: 0, paidLifetime: 0, openedAt: null },

      //  / VAULT money model . `money`
      // IS the home VAULT — all income + at-home spends flow through it unchanged. `pocket` is the
      // cash you CARRY out into the world; field purchases (the back alley, town) spend from pocket.
      // Short out there? Run home to the vault to withdraw more (a game-time round trip) or charge
      // the card. `vaultTier` = store-bought bigger-vault upgrades (capacity) — bought, never added
      // directly. (UI + checkout wiring =  next phase; this is the state foundation.)
      pocket: 0,
      vaultTier: 0,

      // open shark loans: [{ id, sharkId, principal, owed, vigPerDay, takenMin, dueMin }].
      // Cash borrowed at a brutal compounding daily vig on a deadline; overdue bleeds WANTED.
      loans: [],

      // Dirty-Cop Payroll tier (0-3). Pay the badges off → far fewer raids + faster
      // WANTED cooling, so a high-heat mid/end-game empire isn't stopped + jailed every day.
      copPayrollTier: 0
    },

    inventory: {},                 // { [itemId]: qty }

    dungeons: [],                  // [{ id, templateId, holds:[{id, captiveGirlId|null, upgrades}], purchasedAt }]

    properties: [],                // [{ locationId, owned, passiveIncomePerTick }]
    unlockedLocations: [],         // [locationId] hunting grounds with bought private access 
    ownedLocations: [],            // [locationId] locations BOUGHT OUT — you own the turf, grants perks 
    logistics: { unlocked: false, enabled: false, targets: { food: 20, water: 20, condoms: 10 } },   // auto-distribute supplies to dungeon pools
    ledger: [],                    // 📒 every money in/out: { at, gameMin, delta, reason, balance }
    purchasedUnlocks: [],          // [unlockKey] gated action tiers bought early with cash 
    gigQueue: [],                  // queued shady jobs [gigId,...]; run together, time passes per job

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
    activity: {},                  // { girlId: [{ts, gameMin, kind, label, detail}] } per-girl activity history (bounded)
    friendCreep: {},               // { friendArchetypeId: {level 0-10, into} } per-friend creep progression

    // pre-capture item-request cooldown log. Keyed by `${locationId}|${archetype}`,
    // value = the game-day number the last request was made. Enforces "once a day per girl-type
    // per location" so pre-capture item asks are a trickle, never an endless faucet.
    itemRequestLog: {},

    // lowercased full names already in play this game. girl-gen consults this to
    // avoid generating two girls with the same name; capture + persistent location spawns
    // register here so names never collide within a single playthrough.
    usedNames: [],

    // persistent per-location spawn sets. Keyed by locationId →
    // { girls:[GirlProfile], rolledDay, expiresDay, taken:{ [girlId]: 'captured'|'walked' } }.
    // Same location, same day = same girls; the set refreshes after a randomized 2-4 day window.
    locationSpawns: {},

    settings: {
      mode: 'sexy',                // 'sexy' | 'hurtme' | 'sexy_with_damage'
      activeGirlId: null,
      activeDungeonId: null,
      // What the girls call the player — set at new-game. Default 'Master'. Injected into
      // every system prompt so captives address the player by his chosen name, not just "Master".
      playerName: 'Master',
      // the player's own avatar, chosen in the new-game character creator.
      // Threaded into image prompts (so HE renders into the scenes with the girls) + his clothing
      // store. Defaulted to a generic captor so pre-creator saves / skipped setup still render him.
      playerCharacter: {
        sex: 'male', age: 35, race: 'white', build: 'average',
        hair: 'short dark hair', hairColor: 'brown', startClothing: 'a plain dark t-shirt and jeans', custom: '',
        // owned player outfit ids + the currently-worn one.
        wardrobe: [], clothingId: null
      },
      // the whole set of player/scene image toggles ("{playername} in shot,
      // pov, watch her visitors, and the gangbang mechanics, ect ect"). Honored by the auto-render
      // paths (roomScene) + the scene wiring. Default OFF — opt-in.
      sceneToggles: { playerInShot: false, pov: false, watchVisitors: false }
    }
  };

  // canonical default avatar, reused by the migration backfill + the
  // getter/setter so every read returns a complete shape even on the oldest save.
  const DEFAULT_PLAYER_CHARACTER = {
    sex: 'male', age: 35, race: 'white', build: 'average',
    hair: 'short dark hair', hairColor: 'brown', startClothing: 'a plain dark t-shirt and jeans', custom: '',
    wardrobe: [], clothingId: null
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
      // backfill the revolving credit line on pre-feature saves.
      if (!s.wallet.credit || typeof s.wallet.credit !== 'object') {
        s.wallet.credit = { limit: 500, balance: 0, chargedLifetime: 0, paidLifetime: 0, openedAt: null };
      } else {
        const c = s.wallet.credit;
        if (typeof c.limit !== 'number') c.limit = 500;
        if (typeof c.balance !== 'number') c.balance = 0;
        if (typeof c.chargedLifetime !== 'number') c.chargedLifetime = 0;
        if (typeof c.paidLifetime !== 'number') c.paidLifetime = 0;
        if (c.openedAt === undefined) c.openedAt = null;
      }
      // backfill the carried-pocket + vault-tier on pre-feature saves.
      if (typeof s.wallet.pocket !== 'number') s.wallet.pocket = 0;
      if (typeof s.wallet.vaultTier !== 'number') s.wallet.vaultTier = 0;
      if (!Array.isArray(s.wallet.loans)) s.wallet.loans = [];   // 
      if (typeof s.wallet.copPayrollTier !== 'number') s.wallet.copPayrollTier = 0;   // 
    }
    // Nested-container backfill — the shallow load-merge can drop sub-shapes added after an
    // old save was written. Guard every container the engine assumes exists .
    if (!s.trophies) s.trophies = [];
    if (!s.bodyParts) s.bodyParts = [];
    if (!s.unlockedLocations) s.unlockedLocations = [];
    if (!s.ownedLocations) s.ownedLocations = [];
    if (!s.logistics) s.logistics = { unlocked: false, enabled: false, targets: { food: 20, water: 20, condoms: 10 } };
    if (!s.ledger) s.ledger = [];
    if (!s.purchasedUnlocks) s.purchasedUnlocks = [];
    if (!Array.isArray(s.gigQueue)) s.gigQueue = [];   // 
    if (!s.settings) s.settings = {};
    if (!s.settings.playerName) s.settings.playerName = 'Master';
    // backfill the avatar + any fields added after an old save was written.
    s.settings.playerCharacter = Object.assign({}, DEFAULT_PLAYER_CHARACTER, s.settings.playerCharacter || {});
    // backfill the player/scene image toggles on pre-feature saves.
    s.settings.sceneToggles = Object.assign({ playerInShot: false, pov: false, watchVisitors: false }, s.settings.sceneToggles || {});
    if (!s.slaveMarket) s.slaveMarket = { listed: [], available: [], recentSales: [] };
    else { s.slaveMarket.listed ||= []; s.slaveMarket.available ||= []; s.slaveMarket.recentSales ||= []; }
    if (!s.propositioners) s.propositioners = { inbox: [], active: [], completed: [], repeatClients: {} };
    else { s.propositioners.inbox ||= []; s.propositioners.active ||= []; s.propositioners.completed ||= []; s.propositioners.repeatClients ||= {}; }
    if (!s.disposals) s.disposals = [];
    if (!s.turns) s.turns = {};
    if (!s.activity) s.activity = {};   // backfill the activity log for pre-feature saves
    if (!s.friendCreep) s.friendCreep = {};   // backfill the creep-level store
    if (!s.itemRequestLog || typeof s.itemRequestLog !== 'object') s.itemRequestLog = {};
    if (!Array.isArray(s.usedNames)) s.usedNames = [];
    if (!s.locationSpawns || typeof s.locationSpawns !== 'object') s.locationSpawns = {};
    // Dungeon-level backfill — the shared supply POOL  + per-hold toy mounts
    //  + condom/drug reserves. Defense-in-depth so any future unguarded read on an
    // old save can't hit undefined.
    for (const d of s.dungeons || []) {
      if (!d.pool || typeof d.pool !== 'object') d.pool = { food: 0, water: 0, condoms: 0, drugs: {} };
      else { d.pool.food ||= 0; d.pool.water ||= 0; d.pool.condoms ||= 0; if (!d.pool.drugs || typeof d.pool.drugs !== 'object') d.pool.drugs = {}; }
      for (const h of d.holds || []) {
        if (h && !Array.isArray(h.toys)) h.toys = [];
        if (h && typeof h.condomReserve !== 'number') h.condomReserve = 0;
        if (h && (!h.drugReserve || typeof h.drugReserve !== 'object')) h.drugReserve = {};
        // one Tit Sucker can be attached per hold; it bottles the held girl's milk.
        if (h && typeof h.titSucker !== 'boolean') h.titSucker = false;
      }
    }
    // legacy conversion. The old single global 'milk-sucker' rig is replaced by
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
        // vaginal cum-fill meter (preggo-relevant; distinct from generic cumLoad)
        // + the sustained-fill maintain counter that the preggo timer reads.
        vaginalCum: 0, preggoFillMaintained: 0,
        // running count of extreme acts since her last recovery (heal/care/rest).
        extremeStreak: 0,
        // per-girl cum-load STORAGE capacity (trained up by vaginal-weight tools).
        // cumLoad is clamped to this; near-cap = pay premium, sustained high = mood/health/escape cost.
        cumLoadCap: 10,
        // per-girl breast-milk fill (liters). Refills slowly over time ONLY while
        // she's lactating (preggo 2nd-trimester+ OR inside the postpartum window). A direct
        // suck empties her; a Tit Sucker bottles it. Bounded by breastCap → no endless milk.
        breastMilk: 0,
        // postpartum lactation window expiry (real-ms timestamp). Set on delivery;
        // while now < this she keeps lactating "a few days after birth". 0 = not in window.
        lactatingUntil: 0,
        // Trophy-history — running count of PLAYER acts committed against her (johns/friends are
        // counted separately in her whore-out ledger). Surfaced in her death record + trophy.
        actsCommitted: 0,
        // Trophy-history — total liters of milk she produced for you (bottled + sucked).
        milkProducedTotal: 0,
        // an insertable hold-in plug left in over time. { itemId, startTick } | null;
        // when the timer elapses her cumLoadCap upgrades. Gapes/stretches her image while in.
        cumImplant: null,
        // menstrual cycle. She bleeds for ~1 game day every ~5 game days. `onPeriod`
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
      // Permanent ownership marks  — own array per girl (never the shared default
      // ref) so marks can't alias across captives. Lazy-init for saves predating the feature.
      if (!Array.isArray(g.body.ownershipMarks)) g.body.ownershipMarks = [];
      // Forced-addiction map  — own object per girl. { [drugKey]: 0-100 }.
      if (!g.body.addiction || typeof g.body.addiction !== 'object') g.body.addiction = {};
      //  / backfill a hidden like/dislike on pre-feature captives.
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
      // New per-girl array fields ( scene roster +  dungeon history).
      if (!Array.isArray(g.dungeonHistory)) g.dungeonHistory = [];
      if (!Array.isArray(g.sceneGirlIds)) g.sceneGirlIds = [];
      // per-girl specialization upgrades (e.g. big-tits = 2× milk). Ids only;
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
      // Cheat / sandbox start = MAX DEPRAVITY out of the gate (everything unlocked, top level).
      // A huge XP grant — levelForXp clamps to MAX_LEVEL regardless of the exact threshold.
      state.wallet.depravityXp = 9999999;
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
  // The LEDGER (📒) — EVERY money in/out is recorded with a signed delta + reason + CATEGORY +
  // running balance so the wallet tab can show the full, sortable, filterable books. Bounded to
  // the last 800 entries.
  // Classify a raw spend/earn reason string into a player-facing category for the filterable ledger.
  function categorizeLedger(reason) {
    const r = String(reason || '').toLowerCase();
    if (r.startsWith('credit')) return 'Credit';   // credit-card payments (charges aren't cash → not ledgered)
    if (r.startsWith('loanshark') || r.startsWith('loan')) return 'Loan sharks';
    if (r.startsWith('toy:')) return 'Toys';
    if (r.startsWith('wardrobe')) return 'Wardrobe';
    if (r.includes('film') || r.startsWith('sell-negatives') || r.startsWith('market:')) return 'Films';
    if (r.startsWith('bodypart') || r.includes('organ')) return 'Organs';
    if (r.startsWith('buy-out-location') || r.startsWith('location-access')) return 'Property — purchase';
    if (r.includes('skim') || r.startsWith('location-income') || r.startsWith('passive')) return 'Property — income';
    if (r.startsWith('logistics') || r.includes('upgrade') || r.includes('capacity') || r.startsWith('dungeon') || r.startsWith('hold')) return 'Dungeon / Holds';
    if (r.startsWith('unlock')) return 'Unlocks';
    if (r.startsWith('bribe') || r.includes('fine') || r.includes('wanted')) return 'Bribes / Heat';
    if (r.startsWith('friend')) return 'Friends';
    if (r.startsWith('john') || r.startsWith('whore') || r.startsWith('proposition') || r.startsWith('gangbang')) return 'Johns';
    if (r.includes('milk')) return 'Milk';
    if (r.startsWith('slave') || r.includes('sell-girl') || r.includes('buy-girl')) return 'Slave market';
    if (r.startsWith('loot') || r.startsWith('grant')) return 'Loot';
    if (r.startsWith('buy:')) return 'Supplies'; // shop-item buys (drugs / tools / food / restraints)
    if (r.startsWith('odd-job') || r.startsWith('side') || r.startsWith('hustle')) return 'Odd jobs';
    return 'Other';
  }
  function recordLedger(s, delta, reason) {
    if (!s.ledger) s.ledger = [];
    s.ledger.push({
      at: Date.now(),
      gameMin: window.DMTHGame.gameClock ? window.DMTHGame.gameClock.now() : null,
      delta,
      reason: reason || 'misc',
      category: categorizeLedger(reason),
      balance: s.wallet.money
    });
    if (s.ledger.length > 800) s.ledger = s.ledger.slice(-800);
  }
  function addMoney(amount, reason) {
    mutate(s => {
      s.wallet.money += amount;
      s._lastTxn = { amount, reason, at: Date.now() };
      recordLedger(s, amount, reason);
    });
  }
  function spendMoney(amount, reason) {
    if (!state || state.wallet.money < amount) return false;
    mutate(s => {
      s.wallet.money -= amount;
      s._lastTxn = { amount: -amount, reason, at: Date.now() };
      recordLedger(s, -amount, reason);
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
  // Nut Reserve (0-100).
  function setNutReserve(v) { mutate(s => { s.wallet.nutReserve = Math.max(0, Math.min(100, v)); }); }
  function getNutReserve() { return typeof state?.wallet?.nutReserve === 'number' ? state.wallet.nutReserve : 100; }

  // revolving credit line. Charge it when cash is short; pay it down with cash; the
  // limit GROWS the more you pay it off (big) + use it (small), capped. A charge is DEBT (it does
  // not move cash, so it isn't cash-ledgered); a payment spends cash through spendMoney so it
  // lands in the cash ledger under the 'Credit' category. Interest on a carried balance is
  //  (a tick hook to be added).
  const CREDIT_LIMIT_MAX = 20000;
  function getCredit() {
    const c = (state && state.wallet && state.wallet.credit) || {};
    return {
      limit: typeof c.limit === 'number' ? c.limit : 500,
      balance: typeof c.balance === 'number' ? c.balance : 0,
      chargedLifetime: typeof c.chargedLifetime === 'number' ? c.chargedLifetime : 0,
      paidLifetime: typeof c.paidLifetime === 'number' ? c.paidLifetime : 0,
      openedAt: c.openedAt ?? null
    };
  }
  function creditAvailable() { const c = getCredit(); return Math.max(0, c.limit - c.balance); }
  // Charge the card. Returns false if the amount exceeds available credit. Grows the limit a hair.
  function chargeCredit(amount, reason) {
    amount = Math.round(amount || 0);
    if (!state || amount <= 0 || amount > creditAvailable()) return false;
    mutate(s => {
      const c = s.wallet.credit;
      c.balance += amount;
      c.chargedLifetime += amount;
      if (c.openedAt == null) c.openedAt = window.DMTHGame.gameClock ? window.DMTHGame.gameClock.now() : 0;
      c.limit = Math.min(CREDIT_LIMIT_MAX, c.limit + Math.round(amount * 0.05));   // using it nudges the limit up
      s.wallet._lastCreditEvent = { kind: 'charge', amount, reason: reason || 'credit-charge', at: Date.now() };
    });
    return true;
  }
  // Pay the card down with cash. Pays min(amount, balance, cash). Paying it off is what grows the
  // limit the most. Returns { ok, paid?, balance?, limit?, reason? }.
  function payCredit(amount) {
    if (!state) return { ok: false, reason: 'no game' };
    const c = getCredit();
    amount = Math.min(Math.round(amount || 0), c.balance, state.wallet.money);
    if (amount <= 0) return { ok: false, reason: c.balance <= 0 ? 'no balance to pay' : 'no cash to pay with' };
    if (!spendMoney(amount, 'credit-payment')) return { ok: false, reason: (window.DMTHGame.state.brokeLine ? window.DMTHGame.state.brokeLine() : 'broke') };
    mutate(s => {
      const cc = s.wallet.credit;
      cc.balance = Math.max(0, cc.balance - amount);
      cc.paidLifetime += amount;
      cc.limit = Math.min(CREDIT_LIMIT_MAX, cc.limit + Math.round(amount * 0.5));   // paying off grows it most
      s.wallet._lastCreditEvent = { kind: 'payment', amount, at: Date.now() };
    });
    const now = getCredit();
    return { ok: true, paid: amount, balance: now.balance, limit: now.limit };
  }
  // credit is NOT free money: interest claws onto any carried balance over game-time,
  // so an unpaid balance SPIRALS (it can climb past your limit — the debt is the risk woven through
  // the whole financial system). Called from the tick + reconcileSpan with the elapsed game-day
  // fraction. Sub-dollar interest accumulates in a drift so slow ticks still compound correctly.
  const CREDIT_INTEREST_PER_DAY = 0.03;   // 3% per game-day on the carried balance
  function accrueCreditInterest(dayFraction) {
    if (!state || !(dayFraction > 0)) return 0;
    const c = state.wallet && state.wallet.credit;
    if (!c || !(c.balance > 0)) return 0;
    state._creditInterestDrift = (state._creditInterestDrift || 0) + c.balance * CREDIT_INTEREST_PER_DAY * dayFraction;
    const add = Math.floor(state._creditInterestDrift);
    if (add < 1) return 0;
    state._creditInterestDrift -= add;
    mutate(s => { s.wallet.credit.balance += add; s.wallet._lastCreditEvent = { kind: 'interest', amount: add, at: Date.now() }; });
    return add;
  }

  // Dirty-Cop Payroll tier (arrest.js owns the tier table + raid/decay effects).
  function getCopPayrollTier() { return (state && state.wallet && typeof state.wallet.copPayrollTier === 'number') ? state.wallet.copPayrollTier : 0; }
  function setCopPayrollTier(n) { mutate(s => { s.wallet.copPayrollTier = Math.max(0, Math.round(n || 0)); }); }

  // the queued-jobs list. gigs.js owns the catalog/resolution; state owns the queue.
  function pushGig(id) { mutate(s => { if (!Array.isArray(s.gigQueue)) s.gigQueue = []; s.gigQueue.push(id); }); }
  function removeGigAt(idx) { mutate(s => { if (Array.isArray(s.gigQueue) && idx >= 0 && idx < s.gigQueue.length) s.gigQueue.splice(idx, 1); }); }
  function clearGigs() { mutate(s => { s.gigQueue = []; }); }

  // the shark loan ledger. loanshark.js owns the terms/interest; state owns the records.
  function addLoan(loan) {
    mutate(s => { if (!Array.isArray(s.wallet.loans)) s.wallet.loans = []; s.wallet.loans.push(loan); });
  }
  // Pay `amount` toward this shark's loans, oldest first; drop any loan paid to zero.
  function payDownLoans(sharkId, amount) {
    mutate(s => {
      let rem = Math.round(amount || 0);
      const mine = (s.wallet.loans || []).filter(l => l.sharkId === sharkId).sort((a, b) => (a.takenMin || 0) - (b.takenMin || 0));
      for (const l of mine) { if (rem <= 0) break; const cut = Math.min(rem, l.owed || 0); l.owed = (l.owed || 0) - cut; rem -= cut; }
      s.wallet.loans = (s.wallet.loans || []).filter(l => (l.owed || 0) > 0.5);
    });
  }

  // VAULT (= wallet.money: all income + at-home spends) vs POCKET (cash carried for
  // field buys). withdrawFromVault runs home to crack the vault (a game-time round trip when
  // opts.travel); depositToVault stashes pocket cash back; spendPocket spends carried cash (cash-
  // ledgered). Internal vault↔pocket moves aren't ledgered (relocating your own cash, not income/
  // expense). vaultTier (store-bought bigger-vault upgrades) is read by the finance tab.
  const VAULT_RUNHOME_GAME_MIN = 60;   // a round trip home to get into the vault
  // Player-sex-aware "you're broke" line — filthy + in-character, NEVER the limp "insufficient
  // funds" / "vault is empty". Reads the player's chosen sex from his avatar.
  function brokeLine() {
    const sex = (state && state.settings && state.settings.playerCharacter && state.settings.playerCharacter.sex) || 'male';
    return sex === 'female' ? "you're a broke bitch — not a dollar to your name" : "you're a broke motherfucker — not a dollar to your name";
  }
  // the SHORT form for tight button labels (was "Too poor" / "Insufficient funds").
  function brokeShort() {
    const sex = (state && state.settings && state.settings.playerCharacter && state.settings.playerCharacter.sex) || 'male';
    return sex === 'female' ? 'broke bitch' : 'broke motherfucker';
  }
  function getVault() { return (state && state.wallet && typeof state.wallet.money === 'number') ? state.wallet.money : 0; }
  function getPocket() { return (state && state.wallet && typeof state.wallet.pocket === 'number') ? state.wallet.pocket : 0; }
  function depositToVault(amount) {
    amount = Math.min(Math.round(amount || 0), getPocket());
    if (amount <= 0) return { ok: false, reason: 'no pocket cash to stash' };
    mutate(s => { s.wallet.pocket -= amount; s.wallet.money += amount; });
    return { ok: true, amount, pocket: getPocket(), vault: getVault() };
  }
  function withdrawFromVault(amount, opts = {}) {
    amount = Math.min(Math.round(amount || 0), getVault());
    if (amount <= 0) return { ok: false, reason: brokeLine() };
    mutate(s => { s.wallet.money -= amount; s.wallet.pocket += amount; });
    // "run home, access vault, come back" — the trip burns game time + reconciles the world.
    if (opts.travel && window.DMTHGame.gameClock && window.DMTHGame.gameClock.advanceBy) {
      window.DMTHGame.gameClock.advanceBy(VAULT_RUNHOME_GAME_MIN);
      if (window.DMTHGame.tick && window.DMTHGame.tick.reconcileSpan) window.DMTHGame.tick.reconcileSpan(VAULT_RUNHOME_GAME_MIN);
    }
    return { ok: true, amount, pocket: getPocket(), vault: getVault() };
  }
  function spendPocket(amount, reason) {
    amount = Math.round(amount || 0);
    if (!state || getPocket() < amount) return false;
    mutate(s => { s.wallet.pocket -= amount; s._lastTxn = { amount: -amount, reason, at: Date.now() }; recordLedger(s, -amount, reason); });
    return true;
  }

  // inventory
  // Per-item max is basically-unlimited  — 9999 of each. The sandbox / everything-
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
  // `speaker` is optional — used by the multi-girl scene  to mirror a partner
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

  // per-girl ACTIVITY history (distinct from the chat `turns` log). A running list of
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

  // per-friend-archetype CREEP level 0-10. A friend levels up on successful visits
  // with a TRIANGULAR cost ("first fuck success 1 levle up next level 2 fucks next level 3
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

  // body parts — harvested via the dismember disposal path ; sold in the body-part market.
  function addBodyPart(part) { mutate(s => { if (!s.bodyParts) s.bodyParts = []; s.bodyParts.push(part); }); }
  function getBodyParts() { return (state && state.bodyParts) || []; }
  function removeBodyPart(id) { mutate(s => { if (s.bodyParts) s.bodyParts = s.bodyParts.filter(p => p.id !== id); }); }

  // unlocked hunting grounds — bought private access . Never removed.
  function addUnlockedLocation(locId) { mutate(s => { if (!s.unlockedLocations) s.unlockedLocations = []; if (!s.unlockedLocations.includes(locId)) s.unlockedLocations.push(locId); }); }
  // locations BOUGHT OUT (you own the turf → perks). Never removed.
  function addOwnedLocation(locId) { mutate(s => { if (!s.ownedLocations) s.ownedLocations = []; if (!s.ownedLocations.includes(locId)) s.ownedLocations.push(locId); }); }
  // merge a patch into the logistics config (unlock / enable / target sliders).
  function setLogistics(patch) { mutate(s => { s.logistics = { ...(s.logistics || { unlocked: false, enabled: false, targets: { food: 20, water: 20, condoms: 10 } }), ...patch }; }); }
  // purchased early-access action unlocks . Never removed.
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

  // the player's own avatar (sex / age / race / build / hair / start-clothing /
  // one custom write-in), chosen in the new-game character creator. Merged onto the current value so
  // a partial patch (e.g. just new clothing from the player clothing store) keeps the other fields.
  function setPlayerCharacter(patch) {
    mutate(s => {
      if (!s.settings) s.settings = {};
      s.settings.playerCharacter = Object.assign({}, DEFAULT_PLAYER_CHARACTER, s.settings.playerCharacter || {}, patch || {});
    });
  }
  function getPlayerCharacter() {
    return Object.assign({}, DEFAULT_PLAYER_CHARACTER, (state && state.settings && state.settings.playerCharacter) || {});
  }

  // player/scene image toggles ({playerInShot, pov, watchVisitors}). Merge-patch.
  function getSceneToggles() {
    return Object.assign({ playerInShot: false, pov: false, watchVisitors: false },
      (state && state.settings && state.settings.sceneToggles) || {});
  }
  function setSceneToggles(patch) {
    mutate(s => {
      if (!s.settings) s.settings = {};
      s.settings.sceneToggles = Object.assign({ playerInShot: false, pov: false, watchVisitors: false }, s.settings.sceneToggles || {}, patch || {});
    });
  }

  //   — every
  // PLAYTHROUGH names its hunting grounds differently. Each location keeps its THEME (a club is
  // still a club) but draws a fresh filthy name from a per-id pool, picked deterministically from a
  // one-time per-save seed — so two playthroughs prowl "Neon Cunt Lounge" vs "The Wet Hole" for the
  // same club. Names match the game's extreme register . Pure read (the seed is
  // assigned once, directly, so it never triggers a render cascade); persists on the next save.
  // Locations with no pool fall back to the catalog displayName.
  const LOCATION_NAME_POOLS = {
    street:           ['Cunt Alley', 'The Meat Strip', 'Slit Street', 'Dead-Hooker Boulevard', 'The Gash Mile'],
    club:             ['The Pink Slit', 'Neon Cunt Lounge', 'The Wet Hole', 'Throatfuck Lounge', 'Velvet Gash'],
    'strip-club':     ['The Spread Eagle', 'Wetworks', 'The Cum Dungeon', 'Pole & Hole', 'The Glory Pit'],
    library:          ['The Quiet Hole', 'Stacks & Cracks', 'The Hush Cunt', 'Dewey Decimal Hole', 'The Reading Pit'],
    park:             ['The Bushes', 'Rape Meadow', 'Snatch Park', 'The Tree-Line', 'The Dog-Run'],
    gym:              ['Sweat & Holes', 'The Meat Locker', 'Iron & Cunt', 'The Squat Rack', 'Flesh Gym'],
    mall:             ['The Flesh Mall', 'Dead-Mall Holes', 'Food-Court Cunt', 'Retail Meat', 'The Atrium Pit'],
    'coffee-shop':    ['Cream & Sugar', 'The Wet Cup', 'Grind & Hole', 'The Foam Slit', 'Bean & Gash'],
    sorority:         ['Greek Holes', 'The Pledge Pit', 'Sigma Slut House', 'The Hazing Hole', 'Coed Meat Row'],
    remote:           ['The Kill Roads', 'Nowhere Holes', 'Shallow-Grave Lane', 'The Backwoods Pit', 'The Sticks'],
    'hotel-lobby':    ['The Velvet Vacancy', 'Room 69', 'The Checkout Hole', 'Lobby Meat', 'The Suite Pit'],
    'private-party':  ['The After-Hours Hole', 'VIP Meat', 'The Back-Room Pit', 'Bottle & Cunt', 'The Lock-In'],
    'school-campus':  ['The Quad Holes', 'Freshman Meat', 'The Lecture Pit', 'Coed Cunt Row', 'The Dorm Run'],
    'family-reunion': ['The Kin Pit', 'Bloodline Holes', 'The Backyard Snatch', 'Reunion Meat', 'The Cul-de-sac Cunt'],
    'prenatal-clinic':['The Brood Ward', 'The Swollen Hole', 'Womb & Co.', 'The Breeding Wing', 'Maternity Meat']
  };
  function rollLocationName(locId, seed) {
    const pool = LOCATION_NAME_POOLS[locId];
    if (!pool || !pool.length) return null;
    let h = (seed >>> 0) || 1;
    for (let i = 0; i < locId.length; i++) h = (h * 31 + locId.charCodeAt(i)) >>> 0;
    return pool[h % pool.length];
  }
  function locationName(locId) {
    if (!locId) return '';
    const loc = (window.DMTHAssets && window.DMTHAssets.getById) ? window.DMTHAssets.getById('location', locId) : null;
    const fallback = loc ? loc.displayName : locId;
    if (!state || !state.settings) return fallback;
    // one-time per-save seed — direct assign (NOT mutate) so reading a name never triggers a render
    // cascade; the scalar rides along on the next regular save.
    if (state.settings.locationSeed == null) state.settings.locationSeed = Math.floor(Math.random() * 1e9) + 1;
    return rollLocationName(locId, state.settings.locationSeed) || fallback;
  }

  // pre-capture item-request daily cooldown. `key` = `${locationId}|${archetype}`.
  function noteItemRequest(key, day) { mutate(s => { if (!s.itemRequestLog) s.itemRequestLog = {}; s.itemRequestLog[key] = day; }); }
  function lastItemRequestDay(key) { return (state && state.itemRequestLog && state.itemRequestLog[key]) || null; }

  // register a full name as used so no future girl reuses it this game.
  function noteUsedName(name) {
    if (!name) return;
    mutate(s => {
      if (!Array.isArray(s.usedNames)) s.usedNames = [];
      const lc = String(name).toLowerCase();
      if (!s.usedNames.some(n => String(n).toLowerCase() === lc)) s.usedNames.push(name);
    });
  }

  // persistent per-location spawn sets. read/write the whole record for a location.
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
    getCredit, creditAvailable, chargeCredit, payCredit, CREDIT_LIMIT_MAX, accrueCreditInterest,
    addLoan, payDownLoans,
    pushGig, removeGigAt, clearGigs,
    getCopPayrollTier, setCopPayrollTier,
    getVault, getPocket, withdrawFromVault, depositToVault, spendPocket, VAULT_RUNHOME_GAME_MIN, brokeLine, brokeShort,
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
    addUnlockedLocation, addOwnedLocation, setLogistics, addPurchasedUnlock,
    getLedger: () => (state && state.ledger) || [],
    categorizeLedger,
    enqueuePropositioner, acceptPropositioner, completePropositioner, rejectPropositioner,
    listGirlForSale, unlistGirl,
    bumpTick,
    setGameOver, isGameOver,
    setPlayerName, getPlayerName,
    setPlayerCharacter, getPlayerCharacter,
    getSceneToggles, setSceneToggles,
    locationName,
    noteItemRequest, lastItemRequestDay,
    noteUsedName,
    getLocationSpawns, setLocationSpawns, updateLocationSpawns
  };
})();
