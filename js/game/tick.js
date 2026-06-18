// DUNGEON MASTER: THE HUNT — maintenance tick. Runs on interval while game page is open.

(function () {
  'use strict';

  let timer = null;

  const INTERVAL_MS = 30_000;    // 30 seconds between ticks

  function start() {
    if (timer) return;
    timer = setInterval(runTick, INTERVAL_MS);
  }
  function stop() { if (timer) { clearInterval(timer); timer = null; } }

  function runTick() {
    const s = window.DMTHGame.state.current;
    if (!s || !s.createdAt) return;
    // Run's over — halt the loop, the game-over screen has taken over.
    if (s.gameOver) { stop(); return; }

    // PAUSE.1 — game paused: freeze everything (clock / escapes / decay / johns / raids).
    // The interval keeps spinning but does nothing until resumed.
    if (window.DMTHGame.gameClock && window.DMTHGame.gameClock.isPaused()) return;

    window.DMTHGame.state.bumpTick();

    // 0. Advance the game clock. 1 real second = 1 game minute, so each 30-second
    // tick advances game time by 30 game minutes.
    // Computed from the real-clock delta so the clock stays continuous even if
    // ticks miss/throttle (browser tab backgrounded, etc).
    if (window.DMTHGame.gameClock) window.DMTHGame.gameClock.advanceFromTick();

    // 1. Consumable decay per girl
    for (const girl of s.roster) {
      if (girl.encounterState !== 'captive') continue;
      decayConsumables(girl);
    }

    // 2. Escape rolls per captive
    for (const girl of s.roster) {
      if (girl.encounterState !== 'captive') continue;
      runEscapeRoll(girl);
    }

    // 3. Market sale pass (films) + body-part black-market pass (DEP-EXP.3)
    window.DMTHGame.market.runSaleTick();
    if (window.DMTHGame.market.runBodyPartSaleTick) window.DMTHGame.market.runBodyPartSaleTick();

    // 4. Propositioner arrivals
    if (window.DMTHGame.propositioner.shouldArriveThisTick()) {
      const p = window.DMTHGame.propositioner.rollPropositioner();
      window.DMTHGame.state.enqueuePropositioner(p);
    }

    // 5. Slave-market buyer tick
    window.DMTHGame.slaveMarket.runBuyerTick();

    // 6. Drug scheduler — captives first self-dose from hold/pool drugs to survive
    // (DRUG-SELFSERVE.1, never self-OD), THEN pharmacokinetic curves + withdrawal resolve.
    if (window.DMTHGame.drugs?.tickSelfServe) window.DMTHGame.drugs.tickSelfServe();
    if (window.DMTHGame.drugs) window.DMTHGame.drugs.tickAll();

    // 7. Notoriety slow decay — heat cools over time
    if (window.DMTHGame.balancing) window.DMTHGame.balancing.decayTick();
    if (window.DMTHGame.wanted) window.DMTHGame.wanted.decayTick();
    // Installed dungeon security facilities (soundproofing etc.) bleed extra WANTED heat —
    // a hardened, quiet property draws less attention.
    if (window.DMTHGame.dungeonOps && window.DMTHGame.state.addWanted) {
      let red = window.DMTHGame.dungeonOps.totalWantedReduction();
      // Trophy perks — stacking passive WANTED decay bonus.
      if (window.DMTHGame.trophies) red += window.DMTHGame.trophies.perk('wantedDecayBonus');
      if (red > 0 && window.DMTHGame.state.getWanted() > 0) window.DMTHGame.state.addWanted(-red, 'security-facilities+trophies');
    }

    // 9. Achievements check
    if (window.DMTHGame.achievements) {
      const unlocks = window.DMTHGame.achievements.check();
      if (unlocks.length && window.DMTHNotify) {
        unlocks.forEach(u => window.DMTHNotify.show(`${u.emoji} ${u.title} — ${u.description}`));
      }
    }

    // 10. Escape-recovery window expiration
    if (window.DMTHGame.escapeRecovery) window.DMTHGame.escapeRecovery.expireTick();

    // 11. Lifespan system — days-captive aging + neglect/care evaluation + terminal state transitions
    if (window.DMTHGame.lifespan) window.DMTHGame.lifespan.tickAll();

    // 12. Pregnancy — advance gestation by GESTATION_DAYS_PER_TICK
    // for every pregnant captive; auto-resolve at day 280 (birthed / sold / lost branches).
    if (window.DMTHGame.pregnancy) window.DMTHGame.pregnancy.tickPregnancies();
    // 12a. Vaginal cum-fill drain + sustained-fill preggo timer (CUMFILL.1).
    if (window.DMTHGame.pregnancy?.tickCumFill) window.DMTHGame.pregnancy.tickCumFill();
    // 12a-2. Condom wear-off (CONDOM-TIMED.1) — revert any expired condoms to raw.
    if (window.DMTHGame.condoms?.tickExpiry) window.DMTHGame.condoms.tickExpiry();

    // 12b. Milk / lactation economy — refill every lactating captive's breast-fill, bottle
    // milk from any Tit-Sucker-rigged hold, run the warm-milk player buff, + passive milk sales.
    if (window.DMTHGame.milk) window.DMTHGame.milk.tickMilk();

    // 12c. Per-archetype passive loot gifts (ARCHGIFT.1) — every held girl-type quietly
    // produces its own gift over time (nurse → free scripts, sorority → allowance, etc.).
    if (window.DMTHGame.loot?.tickArchetypeGifts) window.DMTHGame.loot.tickArchetypeGifts();

    // 13. Stamina + health drain/regen. Starvation/dehydration/
    // chronic-bruise penalties + passive rest regen when no negative pressure is active.
    if (window.DMTHGame.actionEffects) window.DMTHGame.actionEffects.tickStaminaHealth();
    // DEATHWARN.1 — non-intrusive low-health alert for held captives (throttled per girl).
    if (window.DMTHGame.actionEffects && window.DMTHGame.actionEffects.lowHealthAlertSweep) window.DMTHGame.actionEffects.lowHealthAlertSweep();

    // Player satisfaction slow decay — without intimacy this tick, the meter drifts down.
    // 0.5/tick = full decay (50 → 0) over ~100 ticks (~50 real minutes). Sex acts via
    // applyAction bump it back up; balance is tuned for "stop hunting and fuck for a bit"
    // to be a real strategic choice.
    if (window.DMTHGame.state?.current?.wallet) {
      const w = window.DMTHGame.state.current.wallet;
      const cur = typeof w.playerSatisfaction === 'number' ? w.playerSatisfaction : 50;
      if (cur > 0) w.playerSatisfaction = Math.max(0, cur - 0.5);

      // BUZZ decay — passive drift down between income events. -0.3/tick = full decay
      // (100 → 0) over ~333 ticks (~167 real minutes / ~3 game days at the tick rate).
      // Film sales (market.js) + successful john completions (whore-out.js) bump it back
      // up. Balance is tuned so the player must keep income flowing to keep the john
      // multiplier high; idle dungeons quietly lose word-of-mouth.
      const curBuzz = typeof w.buzz === 'number' ? w.buzz : 0;
      if (curBuzz > 0) w.buzz = Math.max(0, curBuzz - 0.3);
    }

    // Player sexual-drive deprivation drift (SEXDRIVE.1) — falls without intimacy.
    if (window.DMTHGame.sexdrive) window.DMTHGame.sexdrive.decayTick();

    // Player Nut Reserve regen (PLAYERSTAM.1) — rebuilds briskly each tick so you're never just
    // sitting and waiting; refill items (viagra / girl's-milk) top it instantly.
    if (window.DMTHGame.playerStamina) window.DMTHGame.playerStamina.regenTick();

    // 14. Whore-out john arrivals. Per-rate arrival rolls per
    // whored-out captive; each arrival resolves the encounter, drains stamina via action-
    // effects, accrues unclaimedEarnings, persists to johnLedger, fires pregnancy hook on
    // vaginal-cum + !condomUsed.
    if (window.DMTHGame.whoreOut) window.DMTHGame.whoreOut.runJohnTick();

    // 15. Arrest system — raid roll scaled by the current WANTED tier. A raid → pay a fine,
    // or jail → GAME OVER if you can't (or instant arrest if a body's in a hold).
    if (window.DMTHGame.arrest) window.DMTHGame.arrest.runRaidTick();
  }

  // Decay food + water per tick, GATED by the hold's automation tiers.
  // Gating rules:
  //   - Water decay zeroes if hold's `toilet` tier >= 2 (full plumbing) OR
  //                            hold's `waterSupply` tier >= 2 (plumbed faucet+).
  //     A captive with a toilet no longer needs a manual water supply — plumbed sources
  //     draw their own water, so no manual stock burn.
  //   - Food decay zeroes if hold's `feedAutomation` tier >= 2 (auto-feeder dispenser+).
  //     Auto-feeder + IV-line draw from their own reservoir of stocked feed (game-abstract);
  //     player still buys food via the shop to bump the food.tier quality multiplier, but
  //     the per-tick stock decay stops.
  // Bond-debt accrues only when manual decay actually runs the stock to zero.
  function decayConsumables(girl) {
    const dungeon = window.DMTHGame.state.getDungeon(girl.assignedDungeonId);
    const hold = dungeon?.holds?.[girl.assignedHoldIdx ?? 0];
    const toiletTier = hold?.upgrades?.toilet ?? 0;
    const waterSupplyTier = hold?.upgrades?.waterSupply ?? 0;
    const feedAutomationTier = hold?.upgrades?.feedAutomation ?? 0;

    const waterPlumbed = toiletTier >= 2 || waterSupplyTier >= 2;
    const foodAutomated = feedAutomationTier >= 2;

    const c = girl.consumables || {};
    const newC = JSON.parse(JSON.stringify(c));
    let moodPenalty = 0;

    if (newC.food && !foodAutomated) {
      newC.food.stock = Math.max(0, (newC.food.stock || 0) - (newC.food.decayPerTick || 1));
      if (newC.food.stock === 0) moodPenalty += 1;
    }
    if (newC.water && !waterPlumbed) {
      newC.water.stock = Math.max(0, (newC.water.stock || 0) - (newC.water.decayPerTick || 1));
      if (newC.water.stock === 0) moodPenalty += 1;
    }

    const patch = { consumables: newC };
    if (moodPenalty > 0) {
      const newBond = { ...girl.bond, bondDebt: (girl.bond.bondDebt || 0) + moodPenalty };
      patch.bond = newBond;
    }
    window.DMTHGame.state.updateGirl(girl.id, patch);
  }

  // Containment strength (0-1) for a captive's hold — how well the dungeon physically holds
  // her. Built from the purchased security + restraint upgrade TIERS (the player's active
  // lever), the dungeon template's concealment/isolation, and ANY dungeon-level security
  // facilities the player has installed (guard dog, reinforced door, motion sensors,
  // electrified fence, soundproofing, sedation collar — see dungeon-ops SECURITY_FACILITIES;
  // guard dog is just ONE of the set). High containment both SUPPRESSES the escape-risk
  // bar's rise AND makes a maxed-out bar near-certain to be auto-contained — so once you've
  // invested in containment, escapes stop being something you manage by hand.
  function holdContainment(girl) {
    const dungeon = window.DMTHGame.state.getDungeon(girl.assignedDungeonId);
    const dungeonTpl = dungeon && window.DMTHAssets.getById('dungeon', dungeon.templateId);
    const hold = dungeon?.holds?.[girl.assignedHoldIdx ?? 0];
    const security   = hold?.upgrades?.security ?? 0;     // 0-4
    const restraints = hold?.upgrades?.restraints ?? 0;   // 0-5
    const concealment = dungeonTpl?.concealment || 0.5;
    const isolation   = dungeonTpl?.isolation || 0.5;
    // Sum the containment bonus of every installed dungeon-level security facility.
    const facilities = dungeon?.security || {};
    const facDefs = window.DMTHGame.dungeonOps?.SECURITY_FACILITIES || {};
    let facilityBonus = 0;
    for (const id of Object.keys(facilities)) {
      if (facilities[id] && facDefs[id]) facilityBonus += facDefs[id].containment || 0;
    }
    return {
      containment: Math.min(0.98,
        (security / 4) * 0.30 +
        (restraints / 5) * 0.25 +
        concealment * 0.10 +
        isolation * 0.10 +
        Math.min(0.38, facilityBonus) +
        (window.DMTHGame.trophies ? window.DMTHGame.trophies.perk('escapeContainmentBonus') : 0)),
      facilities
    };
  }

  // Escape-risk BAR model (Gee 2026-06-18). Each tick the bar RISES — fast when she's
  // defiant/terrified and carrying bond-debt, suppressed by containment and by Stockholm
  // bond (an indoctrinated captive stops trying). The player's active counter-lever is
  // care/loving acts (action-effects.js escapeRisk derive) which push the bar back down.
  // When the bar MAXES (>=1) she makes a break for it; containment decides caught vs out.
  function runEscapeRoll(girl) {
    if (!girl.escape) return;
    if (girl.body?.isNugget) return;   // a nugget has no limbs — she can't run, ever.
    const { containment } = holdContainment(girl);

    const mood = girl.mood?.mood || '';
    // BAL.2 — escape pacing. Rates ~halved + containment weighted heavier so a MANAGED captive
    // (fed/watered + the odd care act, or any locks/restraints) stays put and escapes are an
    // occasional real event, not a daily one. A fully-neglected, unsecured fresh captive still
    // works the bar up over ~25+ real minutes; care acts + containment push it back down.
    const moodDrive = /defiant|terrified|wary|broken|catatonic/.test(mood) ? 0.030
                    : /acclimating|subdued|ambivalent/.test(mood) ? 0.014
                    : 0.006;
    const bondDebtDrive = Math.min(0.04, (girl.bond?.bondDebt || 0) * 0.0008);
    const bondCalm      = Math.min(0.09, (girl.bond?.bondLevel || 0) * 0.011); // high Stockholm = stops trying
    // Net per-tick rise. Containment shaves the rise hard; a well-secured + bonded girl can
    // even drift downward on her own (rise goes negative).
    const rise = moodDrive + bondDebtDrive - bondCalm - containment * 0.12;

    const prevRisk = girl.escape.currentRisk ?? 0.1;
    let risk = Math.max(0, Math.min(1, prevRisk + rise));
    const escapeBase = { ...girl.escape, currentRisk: risk, containment };

    // Warn once when the bar climbs into the danger band so the player knows to intervene.
    if (risk >= 0.8 && prevRisk < 0.8 && window.DMTHNotify) {
      window.DMTHNotify.show(`⚠️ ${girl.name}'s escape risk is critical — calm her down (care/love) or tighten containment.`, { type: 'error', durationMs: 6000 });
    }

    if (risk < 1) {
      window.DMTHGame.state.updateGirl(girl.id, { escape: escapeBase });
      return;
    }

    // BAR MAXED → break for it. Containment decides the outcome (locks + dog ≈ auto-contain).
    const caught = Math.random() < Math.max(0.4, 0.4 + containment * 0.58);
    if (caught) {
      const newBody = { ...girl.body, bruises: (girl.body.bruises || 0) + 2 };
      const newBond = { ...girl.bond, bondDebt: (girl.bond.bondDebt || 0) + 3 };
      const newMood = { mood: 'defiant', moodEmoji: '😤', history: [...(girl.mood.history || []), { shift: 'escape-caught', ts: Date.now() }] };
      window.DMTHGame.state.updateGirl(girl.id, {
        body: newBody, bond: newBond, mood: newMood,
        // Contained — bar drops back but not to zero; she'll build again unless calmed/secured.
        escape: { ...escapeBase, currentRisk: 0.45, lastAttempt: { outcome: 'caught', ts: Date.now() } }
      });
      if (window.DMTHNotify) {
        window.DMTHNotify.show(`🔒 ${girl.name} tried to run — contained${containment >= 0.8 ? ' (security held)' : ''}.`, { type: 'info', durationMs: 5000 });
      }
    } else {
      window.DMTHGame.state.updateGirl(girl.id, {
        encounterState: 'escaped',
        escape: { ...escapeBase, currentRisk: 1, lastAttempt: { outcome: 'escaped', ts: Date.now() } }
      });
      window.DMTHGame.state.addNotoriety(4);
      // A captive loose in public is heat. The big spike comes later if she's never
      // recaptured (escape-recovery → 'escape-ratted'); this is the initial bump.
      if (window.DMTHGame.wanted) window.DMTHGame.wanted.accrue('escape');
      if (window.DMTHNotify) window.DMTHNotify.show(`🏃 ${girl.name} ESCAPED — recapture her before she's gone for good.`, { type: 'error', durationMs: 8000 });
    }
  }

  window.DMTHGame = window.DMTHGame || {};
  window.DMTHGame.tick = Object.freeze({ start, stop, runTick });
})();
