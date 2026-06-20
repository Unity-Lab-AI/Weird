// DUNGEON MASTER: THE HUNT — pregnancy subsystem.
// Captives can be knocked up; abortion methods are shop-purchasable; outcomes branch
// based on which method (or no method) is used.
//
// Schema (lives on `girl.pregnancy`):
//   {
//     status: 'none' | 'pregnant' | 'aborted' | 'miscarried' | 'birthed' | 'lost',
//     conceivedAtTick: number | null,           // tick.now() at conception
//     gestationDays:   number,                  // 0-280 — advanced by tickPregnancies()
//     trimester:       1 | 2 | 3 | null,        // computed; cached for prompt-hash stability
//     conceptionSource:'organic' | 'whore-out' | null,
//     johnEncounterId: string | null,           // wires into the john-ledger when present
//     outcomeHistory:  Array<{ status, day, method, ts, notes }>,
//     lastAbortMethod: string | null            // surfaced on dispose/UI
//   }
//
// Conception: fired from delta.applyDelta() when cumLoad crosses ~1.0 in a turn (semen
// delivery proxy) AND no blocking condom is on AND she is NOT covered by a stocked birth-control
// pill (a captive auto-takes one when pills are stocked in her hold / the dungeon pool — one pill
// = two game-days of protection, re-taken the instant it lapses, no gap). Conception chance is
// modulated by a fertility curve (simplified to a flat base + per-drug protection factor).
//
// Abortion methods (catalog items, see catalog.js entries shipped with this milestone):
//   - condom            $2/stack  — preventive (worn as wardrobe; not technically abort)
//   - plan-b            $25       — works only in days 0-3 (post-coital window)
//   - abortion-pill-medical $120   — works in days 4-93 (1st trimester, clinical)
//   - surgical-kit-back-alley $200 — works in days 94-186 (2nd trimester, RISK of complication)
//   - obgyn-referral-clean $600    — works any time before day 200 (clean, no risk, lower notoriety)
//
// Full-term outcome (day 280): roll one of three branches —
//   - birthed (40%) — flag set; child NOT yet added to roster (multi-girl spawning deferred)
//   - sold-to-market (35%) — notoriety bump; cash from black-market broker
//   - lost-to-authorities (25%) — notoriety spike; girl gains 'lost-to-authorities' permanent tag
//
// Tick advancement: pregnancy.js exposes tickPregnancies(state) — tick.js calls it once per
// engine tick. One in-game gestation day per tick (~5 min full-term at 1-sec ticks — game
// pacing meaningful inside a single session). Player can adjust later via balancing.js.

(function () {
  'use strict';

  // -----------------------------------------------------------------------
  // Schema defaults
  // -----------------------------------------------------------------------
  const DEFAULT_PREGNANCY = Object.freeze({
    status: 'none',
    conceivedAtTick: null,
    gestationDays: 0,
    trimester: null,
    breedingExposure: 0,            // accumulates per cum-inside event → consistency-based conception
    conceptionSource: null,
    johnEncounterId: null,
    outcomeHistory: [],
    lastAbortMethod: null
  });

  function getPregnancy(girl) {
    return (girl && girl.pregnancy) || DEFAULT_PREGNANCY;
  }

  function isPregnant(girl) {
    return getPregnancy(girl).status === 'pregnant';
  }

  // Trimester boundaries (days). 1st: 0-93, 2nd: 94-186, 3rd: 187-280.
  function trimesterFromDays(days) {
    if (days < 0) return null;
    if (days <= 93) return 1;
    if (days <= 186) return 2;
    return 3;
  }

  // -----------------------------------------------------------------------
  // Birth-control pill — stock it in a hold / the dungeon pool and a captive takes one
  // AUTOMATICALLY whenever she isn't already covered. One pill keeps her off the breeding
  // track for exactly two game-days; the instant that window lapses she takes another (if any
  // are stocked) so there is never a tick-gap to conceive in. Max one pill per girl per two days.
  // -----------------------------------------------------------------------
  const BIRTH_CONTROL_DURATION_MIN = 2 * 24 * 60;   // two game-days = 2880 game-minutes
  function gameMin() { return window.DMTHGame.gameClock ? window.DMTHGame.gameClock.now() : 0; }

  // Is she currently covered by a pill (still inside its two-day window)?
  function isOnBirthControl(girl) {
    return !!(girl && girl.birthControlUntil != null && gameMin() < girl.birthControlUntil);
  }

  // She takes a pill the instant she needs one if any are stocked. Returns true if she ends up
  // covered (already-covered OR just took one). Consumes one pill (hold first, then pool) and
  // sets her two-day window. Mutates the passed `girl` object too so a caller re-checking the
  // same object immediately sees the new coverage (no wiggle room at the conception roll).
  function takeBirthControlIfNeeded(girl) {
    if (!girl) return false;
    if (isOnBirthControl(girl)) return true;            // still covered — no second pill, no waste
    if (!window.DMTHGame.supply || window.DMTHGame.supply.available(girl, 'birthControl') <= 0) return false;
    if (window.DMTHGame.supply.draw(girl, 'birthControl', 1) <= 0) return false;
    const until = gameMin() + BIRTH_CONTROL_DURATION_MIN;
    girl.birthControlUntil = until;                     // mutate local copy for same-tick re-checks
    window.DMTHGame.state.updateGirl(girl.id, { birthControlUntil: until });
    return true;
  }

  // Per-tick top-up — keep every captive covered the moment her window lapses (if pills stocked),
  // so her status reads "on the pill" and the protection is continuous with no gap.
  function tickBirthControl() {
    const s = window.DMTHGame.state.current;
    if (!s || !Array.isArray(s.roster)) return;
    for (const g of s.roster) {
      if (g.encounterState && g.encounterState !== 'captive') continue;
      if (isPregnant(g)) continue;                      // pointless on an already-pregnant girl
      if (isOnBirthControl(g)) continue;
      takeBirthControlIfNeeded(g);
    }
  }

  // -----------------------------------------------------------------------
  // Conception
  // -----------------------------------------------------------------------

  // Base conception chance (per qualifying turn).
  const BASE_CONCEPTION_CHANCE = 0.30;

  // Per-drug protection / hostility factors (multiplicative on base chance).
  // MDMA slightly suppresses fertility per literature; coke marginally too.
  function drugProtectionFactor(girl) {
    const active = girl?.body?.activeDrugs || [];
    let factor = 1.0;
    for (const d of active) {
      const name = (d?.name || d || '').toLowerCase();
      if (name === 'mdma') factor *= 0.85;
      if (name === 'coke') factor *= 0.95;
      if (name === 'tranquilizer') factor *= 1.0;  // no effect
      if (name === 'ketamine') factor *= 0.95;
    }
    return factor;
  }

  // Returns:
  //   { rolled: true, conceived: bool, chance: number, reason?: string }
  //   { rolled: false, reason: '...' }   — gate failed
  function attemptConception(girlId, opts) {
    const girl = window.DMTHGame.state.getGirl(girlId);
    if (!girl) return { rolled: false, reason: 'no such girl' };

    // Pregnancy lifecycle assumes captive context. A girl in
    // 'roster' / 'escaped' / 'listed-on-slave-market' state must not receive a conception
    // roll, else tick.js gestation advance fires on a non-captive girl creating
    // downstream weirdness.
    if (girl.encounterState && girl.encounterState !== 'captive') {
      return { rolled: false, reason: 'not in captive state — no conception' };
    }

    const preg = getPregnancy(girl);
    if (preg.status === 'pregnant') {
      return { rolled: false, reason: 'already pregnant' };
    }
    if (preg.status === 'birthed' && preg.outcomeHistory?.some(o => o.day && (Date.now() - o.ts) < 24 * 60 * 60 * 1000)) {
      // Postpartum cooldown — can't conceive within ~24h real-time of birth
      return { rolled: false, reason: 'postpartum cooldown' };
    }

    // Gate: outfit must not be a condom wardrobe entry (none ship in catalog yet — leave
    // open hook for the 'condom-equipped' wardrobe item to land later).
    // Contraception gate — a BLOCKING condom stops conception; a holed/sabotaged
    // one (blocks:false) does NOT, so breeding still takes.
    const condomBlocks = window.DMTHGame.condoms
      ? window.DMTHGame.condoms.blocks(girl)
      : (girl.currentOutfit === 'condom-on');
    if (condomBlocks) {
      return { rolled: false, reason: 'condom equipped' };
    }

    // Gate: birth-control pill. If pills are stocked in her hold / the dungeon pool she takes one
    // the instant she isn't already covered — so the moment a prior pill's two-day window lapses,
    // a new one is taken right here before any breeding roll. No wiggle room: stocked pills = no
    // pregnancy, with zero gap. (No off-screen Stockholm/bond contraception — that was never asked
    // for and is gone; only an actual stocked pill protects her.)
    if (takeBirthControlIfNeeded(girl)) {
      return { rolled: false, reason: 'on birth control' };
    }

    // Consistency-based conception: 3-4 game-days of consistent cum-inside should
    // reliably breed her. Each qualifying cum-inside event raises a persistent breedingExposure
    // counter; the chance escalates with it so sustained breeding becomes near-certain, while a
    // one-off is far from guaranteed. Exposure persists across misses, resets on conception.
    const exposure = (preg.breedingExposure || 0) + 1;
    // A 🐎 brood-mare conceives more readily.
    const fertility = window.DMTHGame.specialize ? window.DMTHGame.specialize.fertilityMultiplier(girl) : 1;
    const chance = Math.min(0.95, (0.16 + exposure * 0.12) * drugProtectionFactor(girl) * fertility);
    const roll = Math.random();
    // The sustained vaginal cum-fill timer (tickCumFill) calls this with
    // guaranteed:true once she's been kept filled long enough, so conception is the payoff of
    // maintained breeding rather than a per-event dice roll. The condom / L9 / already-pregnant
    // gates above still apply regardless.
    const conceived = opts?.guaranteed ? true : (roll < chance);

    if (!conceived) {
      window.DMTHGame.state.updateGirl(girlId, { pregnancy: { ...preg, breedingExposure: exposure } });
      return { rolled: true, conceived: false, chance, roll, breedingExposure: exposure };
    }

    // Conception confirmed.
    const newPreg = {
      status: 'pregnant',
      conceivedAtTick: Date.now(),
      gestationDays: 0,
      trimester: 1,
      conceptionSource: opts?.conceptionSource || 'organic',
      johnEncounterId: opts?.johnEncounterId || null,
      outcomeHistory: [
        ...(preg.outcomeHistory || []),
        {
          status: 'conceived',
          day: 0,
          method: null,
          ts: Date.now(),
          notes: opts?.conceptionSource === 'whore-out' ? 'conceived during whore-out session' : 'conceived'
        }
      ],
      lastAbortMethod: null
    };
    window.DMTHGame.state.updateGirl(girlId, { pregnancy: newPreg });
    if (window.DMTHNotify) {
      window.DMTHNotify.show(`🤰 ${girl.name} is pregnant.`, { type: 'warn', durationMs: 3500 });
    }
    return { rolled: true, conceived: true, chance, roll };
  }

  // -----------------------------------------------------------------------
  // Vaginal cum-fill → sustained-fill preggo timer
  // -----------------------------------------------------------------------
  // ONLY cum deposited in the vagina raises this meter (anal / oral / ass-rape don't), so only
  // vaginal breeding can make her pregnant. The fill LEAKS over time, so she has to be kept
  // topped up. While it stays at/above PREGGO_FILL_MIN, a maintain-timer counts up; held long
  // enough → guaranteed conception (the payoff of sustained breeding). Generic body.cumLoad is
  // a SEPARATE meter (film value + image + john profit); this one drives pregnancy only.
  const VAGINAL_CUM_MAX = 10;
  const PREGGO_FILL_MIN = 3.0;          // vaginal-cum units to sit in "preggo territory"
  const PREGGO_MAINTAIN_TICKS = 16;     // ticks kept filled before she takes (BAL-tunable)
  const VAGINAL_CUM_DRAIN = 0.5;        // leaks per tick — must be re-topped to stay in the zone

  function addVaginalCum(girlId, amount, opts) {
    const girl = window.DMTHGame.state.getGirl(girlId);
    if (!girl) return;
    if (girl.encounterState && girl.encounterState !== 'captive') return;
    const body = { ...girl.body };
    body.vaginalCum = Math.max(0, Math.min(VAGINAL_CUM_MAX, (body.vaginalCum || 0) + (amount || 0)));
    body._lastVaginalCumSource = (opts && opts.conceptionSource) || 'organic';
    window.DMTHGame.state.updateGirl(girlId, { body });
  }

  // Called from tick.js each tick: drain the vaginal fill, run the maintain-timer, and fire a
  // guaranteed conception once she's been kept filled long enough.
  function tickCumFill() {
    const s = window.DMTHGame.state.current;
    if (!s) return;
    for (const girl of s.roster) {
      if (girl.encounterState !== 'captive') continue;
      const cur = girl.body?.vaginalCum || 0;
      const maintained = girl.body?.preggoFillMaintained || 0;
      if (cur <= 0 && maintained <= 0) continue;
      const body = { ...girl.body };
      body.vaginalCum = Math.max(0, cur - VAGINAL_CUM_DRAIN);
      const eligible = getPregnancy(girl).status !== 'pregnant';
      if (eligible && body.vaginalCum >= PREGGO_FILL_MIN) {
        body.preggoFillMaintained = maintained + 1;
      } else {
        body.preggoFillMaintained = Math.max(0, maintained - 1);
      }
      let conceive = false;
      if (eligible && body.preggoFillMaintained >= PREGGO_MAINTAIN_TICKS) {
        conceive = true;
        body.preggoFillMaintained = 0;
      }
      window.DMTHGame.state.updateGirl(girl.id, { body });
      if (conceive) {
        attemptConception(girl.id, { conceptionSource: body._lastVaginalCumSource || 'organic', guaranteed: true });
      }
    }
  }

  // -----------------------------------------------------------------------
  // Abortion methods + outcome
  // -----------------------------------------------------------------------

  // Method specs — keyed by catalog item ID.
  //   windowDays:    [minDay, maxDay] inclusive — works only inside this gestation window
  //   complications: 0..1 chance of a complication (health hit, may abort+miscarry, may inflict lifespan damage)
  //   notorietyHit:  flat +N notoriety when used (back-alley higher, clean lower)
  //   moodPenalty:   -N mood points
  //   bondImpact:    -N bondXP / +N bondDebt
  const ABORT_METHODS = Object.freeze({
    'plan-b': {
      windowDays: [0, 3],
      complications: 0.05,
      notorietyHit: 0,
      moodPenalty: 4,
      bondImpact: -2,
      itemId: 'plan-b',
      label: 'Plan B (post-coital)',
      emoji: '💊'
    },
    'abortion-pill-medical': {
      windowDays: [4, 93],
      complications: 0.10,
      notorietyHit: 1,
      moodPenalty: 8,
      bondImpact: -4,
      itemId: 'abortion-pill-medical',
      label: 'Medical Abortion Pill',
      emoji: '💊'
    },
    'surgical-kit-back-alley': {
      windowDays: [94, 186],
      complications: 0.30,
      notorietyHit: 3,
      moodPenalty: 18,
      bondImpact: -10,
      itemId: 'surgical-kit-back-alley',
      label: 'Back-alley Surgical Kit',
      emoji: '🔪'
    },
    'obgyn-referral-clean': {
      windowDays: [0, 200],
      complications: 0.03,
      notorietyHit: 0,
      moodPenalty: 6,
      bondImpact: -3,
      itemId: 'obgyn-referral-clean',
      label: 'Clean OB-GYN Referral',
      emoji: '🏥'
    }
  });

  // applyAbortion(girlId, methodId) — attempts the abortion. Returns:
  //   { ok: true, status: 'aborted'|'miscarried-from-complication', notesAdded, complicationRolled }
  //   { ok: false, reason: '...' }
  function applyAbortion(girlId, methodId) {
    const girl = window.DMTHGame.state.getGirl(girlId);
    if (!girl) return { ok: false, reason: 'no such girl' };
    const preg = getPregnancy(girl);
    if (preg.status !== 'pregnant') return { ok: false, reason: 'not pregnant' };
    const method = ABORT_METHODS[methodId];
    if (!method) return { ok: false, reason: 'unknown method' };

    const [minD, maxD] = method.windowDays;
    if (preg.gestationDays < minD || preg.gestationDays > maxD) {
      return { ok: false, reason: `outside ${method.label} window (gestation day ${preg.gestationDays}, requires ${minD}-${maxD})` };
    }

    // Consume the item from inventory.
    const consumed = window.DMTHGame.state.consumeItem(method.itemId, 1);
    if (!consumed) return { ok: false, reason: `no ${method.itemId} in inventory` };

    const complicationRolled = Math.random() < method.complications;
    const resultStatus = complicationRolled ? 'miscarried' : 'aborted';

    // Apply side-effects on the girl.
    const moodPenalty = method.moodPenalty + (complicationRolled ? 12 : 0);
    const bondImpact = method.bondImpact + (complicationRolled ? -6 : 0);
    const lifespanHit = complicationRolled ? 8 : 0;

    const newPreg = {
      status: resultStatus,
      conceivedAtTick: preg.conceivedAtTick,
      gestationDays: preg.gestationDays,
      trimester: preg.trimester,
      conceptionSource: preg.conceptionSource,
      johnEncounterId: preg.johnEncounterId,
      outcomeHistory: [
        ...(preg.outcomeHistory || []),
        {
          status: resultStatus,
          day: preg.gestationDays,
          method: methodId,
          ts: Date.now(),
          notes: complicationRolled ? `complication during ${method.label}` : `clean abortion via ${method.label}`
        }
      ],
      lastAbortMethod: methodId
    };

    const patch = { pregnancy: newPreg };

    // Mood + bond patches
    const newMood = { ...girl.mood, mood: complicationRolled ? 'traumatized' : 'subdued', moodEmoji: complicationRolled ? '😨' : '😔' };
    patch.mood = newMood;
    const newBond = { ...girl.bond };
    newBond.bondXP = Math.max(0, (newBond.bondXP || 0) + bondImpact);
    newBond.bondDebt = (newBond.bondDebt || 0) + Math.abs(bondImpact);
    patch.bond = newBond;

    // Defensively initialize girl.lifespan before patching so
    // back-alley complication health damage still bites on legacy saves missing the field.
    if (lifespanHit > 0) {
      const lifespan = girl.lifespan || { healthDamage: 0, daysCaptive: 0 };
      patch.lifespan = { ...lifespan, healthDamage: (lifespan.healthDamage || 0) + lifespanHit };
    }

    window.DMTHGame.state.updateGirl(girlId, patch);

    // Notoriety bump
    if (method.notorietyHit > 0 && window.DMTHGame.state.addNotoriety) {
      window.DMTHGame.state.addNotoriety(method.notorietyHit);
    }

    if (window.DMTHNotify) {
      window.DMTHNotify.show(
        complicationRolled
          ? `🩸 Complication during ${method.label} — ${girl.name} miscarried with damage.`
          : `${method.emoji} ${girl.name}'s pregnancy ended via ${method.label}.`,
        { type: complicationRolled ? 'error' : 'warn', durationMs: 4500 }
      );
    }

    return { ok: true, status: resultStatus, complicationRolled, notesAdded: 1 };
  }

  // -----------------------------------------------------------------------
  // Full-term outcome resolver
  // -----------------------------------------------------------------------

  // The "mass" can't join the harem, so the player CHOOSES how to get rid of it.
  // Each method has unique trade-offs: money / WANTED / notoriety / the mother's mind / DEPRAVITY
  // XP / facility + level gates (dumpster / firehouse / trafficking / incinerator)
  // PLUS expanded depraved options. money is a [min,max] range ([0,0] = none).
  const NEWBORN_METHODS = Object.freeze({
    'dumpster':      { displayName: 'Dumpster Drop',               emoji: '🗑️', money: [0, 0],       wanted: 2,  notoriety: 1, motherMood: -2,  xp: 4,  notes: 'Quick and cold — out with the trash. No benefit, low heat. The auto-default if you dawdle.' },
    'safe-haven':    { displayName: 'Firehouse / Safe-Haven Drop', emoji: '🚒', money: [0, 0],       wanted: -3, notoriety: 0, motherMood: +2,  xp: 3,  notes: 'Anonymous legal drop-off — actually LOWERS your wanted heat; the mother takes it a little easier.' },
    'church-step':   { displayName: 'Leave on a Church Step',      emoji: '⛪', money: [0, 0],       wanted: -1, notoriety: 0, motherMood: +1,  xp: 3,  notes: 'A basket at dawn. Slight heat relief; she clings to the mercy of it.' },
    'bury':          { displayName: 'Bury on the Property',        emoji: '⚱️', money: [0, 0],       wanted: 1,  notoriety: 1, motherMood: -3,  xp: 5,  notes: 'Shallow grave on the grounds. Low heat when the dungeon is isolated, no paper trail.' },
    'traffick':      { displayName: 'Sell to Traffickers',         emoji: '💸', money: [800, 2000],  wanted: 5,  notoriety: 3, motherMood: -6,  xp: 8,  notes: 'Black-market baby broker. Real cash, real heat, the mother crashes hard.' },
    'incinerate':    { displayName: 'Incinerate',                  emoji: '🔥', money: [0, 0],       wanted: 0,  notoriety: 0, motherMood: 0,   xp: 6,  requiresFacility: 'incinerator', notes: 'Cleanest removal — needs an incinerator. No trace, no morale loss from the mother.' },
    'feed-to-dog':   { displayName: 'Feed to the Guard Dog',       emoji: '🐕', money: [0, 0],       wanted: 1,  notoriety: 1, motherMood: -15, xp: 10, requiresSecurity: 'guard-dog', notes: 'No body, no trace — needs a guard dog on the property. Annihilates the mother\'s mind.' },
    'organ-harvest': { displayName: 'Black-Market Organ Harvest',  emoji: '🫀', money: [1500, 3500], wanted: 8,  notoriety: 5, motherMood: -12, xp: 12, levelReq: 6, notes: 'Sell it for parts. Top dollar, maximum heat, shatters the mother. DEPRAVITY-gated.' },
    'disposal-film': { displayName: 'Dark-Web Disposal Reel',      emoji: '📹', money: [600, 1400],  wanted: 9,  notoriety: 6, motherMood: -14, xp: 14, levelReq: 7, notes: 'Film getting rid of the mass for a sick collector black-market — disposal footage, not a sex tape. Big cash + DEPRAVITY, brutal heat. Top-tier gated.' },
    'occult':        { displayName: 'Occult Sacrifice',           emoji: '🕯️', money: [0, 0],       wanted: 4,  notoriety: 3, motherMood: -10, xp: 16, levelReq: 8, notes: 'A rite in the dark. No money, but the most DEPRAVITY XP of any method. High heat. End-tier gated.' }
  });

  // Methods with their lock state for a given mother (level / facility / security gates).
  function availableNewbornMethods(girl) {
    const dungeon = girl ? window.DMTHGame.state.getDungeon(girl.assignedDungeonId) : null;
    const p = window.DMTHGame.progression;
    const cheat = p && p.isCheatUnlocked && p.isCheatUnlocked();
    const lvl = p ? p.getLevel() : 1;
    const ops = window.DMTHGame.dungeonOps;
    return Object.entries(NEWBORN_METHODS).map(([id, m]) => {
      let locked = false, reason = '';
      if (m.levelReq && !cheat && lvl < m.levelReq) { locked = true; reason = `DEPRAVITY L${m.levelReq} required`; }
      else if (m.requiresFacility && !(ops && ops.hasFacility(dungeon, m.requiresFacility))) { locked = true; reason = `needs an ${m.requiresFacility} facility`; }
      else if (m.requiresSecurity && !(ops && ops.hasSecurity(dungeon, m.requiresSecurity))) { locked = true; reason = `needs a ${m.requiresSecurity}`; }
      return { id, ...m, locked, reason };
    });
  }

  // Execute a chosen newborn disposal. opts.auto skips the gates (auto-fallback path).
  function disposeNewborn(girlId, methodId, opts = {}) {
    const girl = window.DMTHGame.state.getGirl(girlId);
    if (!girl) return { ok: false, reason: 'no such girl' };
    const preg = getPregnancy(girl);
    if (preg.status !== 'delivered' || !preg.pendingNewbornDisposal) {
      return { ok: false, reason: 'no newborn awaiting disposal' };
    }
    const m = NEWBORN_METHODS[methodId];
    if (!m) return { ok: false, reason: 'unknown method' };
    if (!opts.auto) {
      const p = window.DMTHGame.progression;
      const cheat = p && p.isCheatUnlocked && p.isCheatUnlocked();
      if (m.levelReq && !cheat && p && p.getLevel() < m.levelReq) return { ok: false, reason: `locked — reach DEPRAVITY level ${m.levelReq}` };
      const dungeon = window.DMTHGame.state.getDungeon(girl.assignedDungeonId);
      const ops = window.DMTHGame.dungeonOps;
      if (m.requiresFacility && !(ops && ops.hasFacility(dungeon, m.requiresFacility))) return { ok: false, reason: `needs an ${m.requiresFacility} facility` };
      if (m.requiresSecurity && !(ops && ops.hasSecurity(dungeon, m.requiresSecurity))) return { ok: false, reason: `needs a ${m.requiresSecurity}` };
    }
    let moneyGain = 0;
    if (m.money && m.money[1] > 0) {
      moneyGain = m.money[0] + Math.floor(Math.random() * (m.money[1] - m.money[0] + 1));
      window.DMTHGame.state.addMoney(moneyGain, `newborn:${methodId}:${girl.id}`);
    }
    if (m.wanted && window.DMTHGame.state.addWanted) window.DMTHGame.state.addWanted(m.wanted, `newborn:${methodId}`);
    if (m.notoriety && window.DMTHGame.state.addNotoriety) window.DMTHGame.state.addNotoriety(m.notoriety);
    // The mother's mind — a bonded mother who wanted to keep it crashes harder than a hostile one.
    const bond = girl.bond?.bondLevel || 0;
    const moodHit = m.motherMood + (m.motherMood < 0 && bond >= 6 ? -4 : 0);
    const mood = { ...(girl.mood || {}) };
    mood.moodPressure = Math.max(-60, Math.min(60, (mood.moodPressure || 0) + moodHit));
    const bondPatch = moodHit < 0 ? { ...girl.bond, bondDebt: (girl.bond?.bondDebt || 0) + Math.abs(moodHit) } : { ...girl.bond };
    if (m.xp && window.DMTHGame.progression) window.DMTHGame.progression.grantXp(m.xp, 'newborn:' + methodId);
    const newPreg = {
      ...preg,
      status: 'birthed',
      pendingNewbornDisposal: false,
      newbornDisposalMethod: methodId,
      outcomeHistory: [...(preg.outcomeHistory || []), { status: 'newborn-disposed', method: methodId, day: preg.gestationDays, ts: Date.now(), notes: `newborn disposed via ${m.displayName}${moneyGain ? ` (+$${moneyGain})` : ''}${opts.auto ? ' (auto)' : ''}` }]
    };
    window.DMTHGame.state.updateGirl(girlId, { pregnancy: newPreg, mood, bond: bondPatch });
    if (window.DMTHNotify) window.DMTHNotify.show(`${m.emoji} ${girl.name}'s newborn — ${m.displayName}${moneyGain ? ` · +$${moneyGain.toLocaleString()}` : ''}.`, { type: 'warn', durationMs: 6000 });
    return { ok: true, methodId, moneyGain };
  }

  // Auto-fallback grace before the newborn is dumpstered for you if you ignore it (ms).
  const NEWBORN_AUTO_MS = 5 * 60 * 1000;

  // Day 280 — she delivers. The newborn can't join the harem, so it goes to a PENDING-DISPOSAL
  // state and the player chooses a method (disposeNewborn). Auto-dumpstered if ignored too long.
  function resolveFullTerm(girlId) {
    const girl = window.DMTHGame.state.getGirl(girlId);
    if (!girl) return { ok: false, reason: 'no such girl' };
    const preg = getPregnancy(girl);
    if (preg.status !== 'pregnant' || preg.gestationDays < 280) {
      return { ok: false, reason: 'not at full term' };
    }
    const newPreg = {
      ...preg,
      status: 'delivered',
      trimester: 3,
      pendingNewbornDisposal: true,
      deliveredAt: Date.now(),
      outcomeHistory: [...(preg.outcomeHistory || []), { status: 'delivered', day: preg.gestationDays, method: null, ts: Date.now(), notes: `${girl.name} delivered — newborn awaiting disposal` }]
    };
    window.DMTHGame.state.updateGirl(girlId, { pregnancy: newPreg });
    // Delivery opens her postpartum lactation window ("a few days after birth",
    // extended for a big-tits girl), so her breasts keep producing milk after she's birthed.
    if (window.DMTHGame.milk?.startPostpartum) window.DMTHGame.milk.startPostpartum(girlId);
    if (window.DMTHNotify) {
      window.DMTHNotify.show(`🍼 ${girl.name} has given birth. The newborn can't join the harem — choose how to dispose of the mass (her room → pregnancy panel).`, { type: 'warn', durationMs: 7000 });
    }
    return { ok: true, delivered: true };
  }

  // -----------------------------------------------------------------------
  // Tick advancement
  // -----------------------------------------------------------------------

  // Days-per-tick for gestation advancement. Pace target: 2 GAME DAYS per trimester →
  // 6 game days to full term. 48 ticks per game day → 288 ticks per full term. Full term is
  // 280 gestation-days, so per-tick advance is 280/288 ≈ 0.972. The internal 0-280 scale is
  // kept (it drives the fine-grained abortion windows + the trimester image tiers); only the
  // real-time PACE changes. Trimester boundaries (93/186/280) land at game-day 2 / 4 / 6.
  const GESTATION_DAYS_PER_TICK = 280 / 288;

  // Called from tick.js once per engine tick. Advances gestation by GESTATION_DAYS_PER_TICK.
  // For each pregnant girl: increment gestationDays; recompute trimester; auto-resolve at 280.
  function tickPregnancies() {
    const s = window.DMTHGame.state.current;
    if (!s) return;
    for (const girl of s.roster) {
      if (girl.encounterState !== 'captive') continue;
      const preg = getPregnancy(girl);
      // A delivered newborn awaiting disposal auto-dumpsters if ignored too long.
      if (preg.status === 'delivered' && preg.pendingNewbornDisposal) {
        if (preg.deliveredAt && (Date.now() - preg.deliveredAt) > NEWBORN_AUTO_MS) {
          disposeNewborn(girl.id, 'dumpster', { auto: true });
        }
        continue;
      }
      if (preg.status !== 'pregnant') continue;

      const newDays = (preg.gestationDays || 0) + GESTATION_DAYS_PER_TICK;
      const newTrimester = trimesterFromDays(newDays);

      // Bond-split preggo feelings: an INDOCTRINATED captive (high Stockholm) wants to carry
      // and raise it, to be part of the harem — pregnancy deepens her bond. A NON-indoctrinated
      // one is horrified by it — being bred against her will rots her mood + spikes bond-debt.
      const bond = girl.bond?.bondLevel || 0;
      const patch = { pregnancy: { ...preg, gestationDays: newDays, trimester: newTrimester } };
      // A pregnant girl eats for two: extra food drain on top of the normal
      // consumable tick (neglect her food and the starvation penalty bites faster while preggo).
      if (girl.consumables && girl.consumables.food) {
        const cons = JSON.parse(JSON.stringify(girl.consumables));
        cons.food.stock = Math.max(0, (cons.food.stock || 0) - 1);
        patch.consumables = cons;
      }
      if (bond >= 6) {
        patch.bond = { ...girl.bond, bondXP: (girl.bond?.bondXP || 0) + 1 };
        patch.mood = { ...girl.mood, mood: bond >= 8 ? 'devoted' : 'dependent', moodEmoji: '🥰' };
      } else if (bond <= 3) {
        patch.bond = { ...girl.bond, bondDebt: (girl.bond?.bondDebt || 0) + 1 };
        const mp = { ...(girl.mood || {}) };
        mp.moodPressure = Math.max(-60, (mp.moodPressure || 0) - 1);
        patch.mood = mp;
      }
      window.DMTHGame.state.updateGirl(girl.id, patch);

      // Auto-resolve at full term.
      if (newDays >= 280) {
        resolveFullTerm(girl.id);
      }
    }
  }

  // -----------------------------------------------------------------------
  // UI helpers
  // -----------------------------------------------------------------------

  function describePregnancy(girl) {
    const preg = getPregnancy(girl);
    if (preg.status === 'none') return null;
    const lines = [];
    if (preg.status === 'pregnant') {
      lines.push(`🤰 PREGNANT · day ${preg.gestationDays}/280 · trimester ${preg.trimester}`);
    } else {
      const last = (preg.outcomeHistory || []).slice(-1)[0];
      const tag = preg.status.toUpperCase();
      lines.push(`${tag}${last?.method ? ` via ${last.method}` : ''}${last?.day != null ? ` · day ${last.day}` : ''}`);
    }
    return lines.join(' · ');
  }

  // Methods currently usable on a given girl (within window, item in inventory, status pregnant).
  function eligibleAbortionMethods(girl) {
    const preg = getPregnancy(girl);
    if (preg.status !== 'pregnant') return [];
    const inv = window.DMTHGame.state.current?.inventory || {};
    return Object.entries(ABORT_METHODS)
      .filter(([id, m]) => {
        if (!inv[id] || inv[id] < 1) return false;
        const [minD, maxD] = m.windowDays;
        return preg.gestationDays >= minD && preg.gestationDays <= maxD;
      })
      .map(([id, m]) => ({ id, ...m }));
  }

  function allAbortionMethodsForDisplay(girl) {
    const preg = getPregnancy(girl);
    const inv = window.DMTHGame.state.current?.inventory || {};
    return Object.entries(ABORT_METHODS).map(([id, m]) => {
      const [minD, maxD] = m.windowDays;
      const inWindow = preg.status === 'pregnant' && preg.gestationDays >= minD && preg.gestationDays <= maxD;
      const inStock = (inv[id] || 0) >= 1;
      return { id, ...m, inWindow, inStock, owned: inv[id] || 0 };
    });
  }

  window.DMTHGame = window.DMTHGame || {};
  window.DMTHGame.pregnancy = Object.freeze({
    DEFAULT_PREGNANCY,
    ABORT_METHODS,
    BASE_CONCEPTION_CHANCE,
    GESTATION_DAYS_PER_TICK,
    getPregnancy,
    isPregnant,
    trimesterFromDays,
    isOnBirthControl,
    takeBirthControlIfNeeded,
    tickBirthControl,
    attemptConception,
    addVaginalCum,
    tickCumFill,
    PREGGO_FILL_MIN,
    PREGGO_MAINTAIN_TICKS,
    applyAbortion,
    resolveFullTerm,
    NEWBORN_METHODS,
    availableNewbornMethods,
    disposeNewborn,
    tickPregnancies,
    describePregnancy,
    eligibleAbortionMethods,
    allAbortionMethodsForDisplay
  });
})();
