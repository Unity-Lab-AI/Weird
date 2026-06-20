// DUNGEON MASTER: THE HUNT — maintenance tick. Runs on interval while game page is open.

(function () {
  'use strict';

  let timer = null;

  const INTERVAL_MS = 30_000;    // 30 seconds between ticks
  // One tick advances the game clock by this many game-minutes (30 real sec × 1 game-min/sec).
  //  reconcileSpan uses it to convert an action's burned game-minutes into a
  // tick-equivalent factor for the deterministic per-tick accruals.
  const TICK_GAME_MINUTES = 30;

  function start() {
    if (timer) return;
    timer = setInterval(runTick, INTERVAL_MS);
  }
  function stop() { if (timer) { clearInterval(timer); timer = null; } }

  // ── ESCAPE GOVERNOR — escapes are a RARE, managed event, NEVER a daily one ──────────────
  // Without these rails a fresh fully-neglected captive (or 50 of them) could all work the bar up
  // and bolt the same day — exactly the "unity escaped first day wtf" cheat-mode break. The rails:
  //   - no bolt in her first few game-days held (no first-day / daily escapes)
  //   - a weekly per-girl cooldown after any attempt (even low Stockholm = weekly at worst)
  //   - a GLOBAL cap on how many captives can bolt per game-day (can't have the whole roster run)
  //   - sandbox / cheat mode: she seethes at the bar but NEVER breaks.
  const ESCAPE_GRACE_MIN              = 1200;  // B9: 10× the old 120 — plenty of time to rush in + calm her
  const MIN_HELD_DAYS_BEFORE_BOLT     = 3;     // no first-day / daily escape — she must be held a few days first
  const PER_GIRL_ESCAPE_COOLDOWN_DAYS = 7;     // after any attempt, ~weekly before she can try to bolt again
  const GLOBAL_BOLTS_PER_DAY          = 1;     // at most ~1 bolt per game-day across the WHOLE roster

  function currentGameDay() {
    const m = window.DMTHGame.gameClock ? window.DMTHGame.gameClock.now() : 0;
    return Math.floor(m / (window.DMTHGame.gameClock?.MIN_PER_DAY || 1440));
  }
  // Global per-game-day bolt counter, reset when the day rolls over. Lives on state so it persists.
  function escapeGovernor() {
    const s = window.DMTHGame.state.current;
    const d = currentGameDay();
    if (!s.escapeGovernor || s.escapeGovernor.day !== d) s.escapeGovernor = { day: d, boltsToday: 0 };
    return s.escapeGovernor;
  }

  function runTick() {
    const s = window.DMTHGame.state.current;
    if (!s || !s.createdAt) return;
    // Run's over — halt the loop, the game-over screen has taken over.
    if (s.gameOver) { stop(); return; }

    // Game paused: freeze everything (clock / escapes / decay / johns / raids).
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

    // 2. Comfort payoff + escape rolls per captive. Comfort runs FIRST so the bond-debt it
    // forgives this tick feeds straight into the same-tick escape-bar math (both mutate the
    // live roster object, different keys — no clobber).
    for (const girl of s.roster) {
      if (girl.encounterState !== 'captive') continue;
      runComfortTick(girl);
      runFighterTrash(girl);
      runEscapeRoll(girl);
    }

    // 3. Market sale pass (films) + body-part black-market pass
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
    // (drug self-serve, never self-OD), THEN pharmacokinetic curves + withdrawal resolve.
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
    // 12a. Vaginal cum-fill drain + sustained-fill preggo timer.
    if (window.DMTHGame.pregnancy?.tickCumFill) window.DMTHGame.pregnancy.tickCumFill();
    // 12a-2. Condom wear-off — revert any expired condoms to raw.
    if (window.DMTHGame.condoms?.tickExpiry) window.DMTHGame.condoms.tickExpiry();
    // 12a-3. Birth-control pills — every captive auto-takes one the instant her two-day window
    // lapses if any are stocked, so protection stays gapless while pills are in the hold/pool.
    if (window.DMTHGame.pregnancy?.tickBirthControl) window.DMTHGame.pregnancy.tickBirthControl();

    // 12b. Milk / lactation economy — refill every lactating captive's breast-fill, bottle
    // milk from any Tit-Sucker-rigged hold, run the warm-milk player buff, + passive milk sales.
    if (window.DMTHGame.milk) window.DMTHGame.milk.tickMilk();
    // 12b-2. Complete any insertable hold-in plug whose timer has elapsed (capacity upgrade).
    if (window.DMTHGame.cumtool) window.DMTHGame.cumtool.tick();
    // 12b-3. Advance every captive's menstrual cycle (~1 game day bleed every ~5 days).
    if (window.DMTHGame.period) window.DMTHGame.period.tick();

    // 12c. Per-archetype passive loot gifts — every held girl-type quietly
    // produces its own gift over time (nurse → free scripts, sorority → allowance, etc.).
    if (window.DMTHGame.loot?.tickArchetypeGifts) window.DMTHGame.loot.tickArchetypeGifts();

    // Auto-distribute supplies from inventory into every dungeon pool (if the
    // upgrade is installed + enabled). No-op otherwise.
    if (window.DMTHGame.supply?.autoDistribute) { try { window.DMTHGame.supply.autoDistribute(); } catch (e) { /* non-fatal */ } }

    // "The Skim": each BOUGHT-OUT location bleeds you a passive cut every tick.
    if (window.DMTHGame.progression?.OWNERSHIP_PERKS && window.DMTHGame.state.addMoney) {
      const owned = window.DMTHGame.state.current?.ownedLocations || [];
      if (owned.length) {
        const skim = owned.length * (window.DMTHGame.progression.OWNERSHIP_PERKS.passiveIncome || 0);
        if (skim > 0) window.DMTHGame.state.addMoney(skim, 'owned-location-skim');
      }
    }

    // the sharks' vig compounds every tick, and an overdue loan bleeds collection heat.
    if (window.DMTHGame.loanshark) { try { window.DMTHGame.loanshark.accrue(TICK_GAME_MINUTES / 1440); } catch (e) { /* non-fatal */ } }

    // interest claws onto a carried credit-card balance every tick (debt spirals if
    // you don't pay it down). One tick = TICK_GAME_MINUTES of game-day.
    if (window.DMTHGame.state.accrueCreditInterest) {
      const owed = window.DMTHGame.state.accrueCreditInterest(TICK_GAME_MINUTES / 1440);
      if (owed > 0 && window.DMTHNotify) {
        const c = window.DMTHGame.state.getCredit ? window.DMTHGame.state.getCredit() : null;
        if (c && c.balance > c.limit) window.DMTHNotify.show(`💳 Credit interest +$${owed} — you owe $${c.balance.toLocaleString()}, OVER your $${c.limit.toLocaleString()} limit. Pay it down.`, { type: 'error', durationMs: 5000 });
      }
    }

    // 13. Stamina + health drain/regen. Starvation/dehydration/
    // chronic-bruise penalties + passive rest regen when no negative pressure is active.
    if (window.DMTHGame.actionEffects) window.DMTHGame.actionEffects.tickStaminaHealth();
    // Non-intrusive low-health alert for held captives (throttled per girl).
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

    // Player sexual-drive deprivation drift — falls without intimacy.
    if (window.DMTHGame.sexdrive) window.DMTHGame.sexdrive.decayTick();

    // Player Nut Reserve regen — rebuilds briskly each tick so you're never just
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
  // factor scales the decay to a span of ticks — 1 = a single 30-min tick (the default), 10 = a
  // 5-hour action that burned 10 ticks' worth of time at once ( reconcileSpan).
  function decayConsumables(girl, factor = 1) {
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
      newC.food.stock = Math.max(0, (newC.food.stock || 0) - (newC.food.decayPerTick || 1) * factor);
      if (newC.food.stock === 0) moodPenalty += 1;
    }
    if (newC.water && !waterPlumbed) {
      newC.water.stock = Math.max(0, (newC.water.stock || 0) - (newC.water.decayPerTick || 1) * factor);
      if (newC.water.stock === 0) moodPenalty += 1;
    }

    const patch = { consumables: newC };
    if (moodPenalty > 0) {
      const newBond = { ...girl.bond, bondDebt: (girl.bond.bondDebt || 0) + moodPenalty };
      patch.bond = newBond;
    }
    window.DMTHGame.state.updateGirl(girl.id, patch);
  }

  // Safety cap on catch-up ticks. The longest single act is ~120 game-min (~4 ticks); this leaves
  // generous headroom for any future marathon act without ever spinning a runaway loop.
  const MAX_CATCHUP_TICKS = 12;

  // reconcile the per-tick accruals across a span of game-time burned by an action
  // (kiss ~1 min → torture ~hours). `factor` = how many normal 30-min ticks the span covers
  // (spanMinutes / 30). Reconciles in two passes:
  //   (A) Smoothly-scaled deterministic accruals — consumable food/water decay, the owned-location
  //       money skim, and the wallet meter drift (player-satisfaction + buzz) — scaled by the full
  //       fractional factor so even a 1-min kiss bleeds a sliver.
  //   (B) Whole catch-up ticks (round(factor), capped) of the other deterministic per-tick systems
  //       that don't take a scale arg — stamina/health regen+drain, milk production/bottling,
  //       inventory→pool supply auto-distribute, and per-archetype passive loot gifts.
  // Time-based systems (drug pharmacokinetics, lifespan aging, pregnancy + period clocks) read the
  // game-clock directly, so the advanced clock auto-reconciles them on the next real tick — they're
  // deliberately NOT re-run here. Random / discrete events (escape rolls, john arrivals, raid rolls,
  // propositioner arrivals, market sales) intentionally do NOT fire mid-action — a single click must
  // never spawn an escape, a john, or a GAME-OVER raid; those stay on the real-time tick.
  // Called from action-effects.applyAction after the clock is advanced.
  function reconcileSpan(spanMinutes) {
    const s = window.DMTHGame.state.current;
    if (!s || !s.createdAt || s.gameOver) return;
    const factor = spanMinutes / TICK_GAME_MINUTES;
    if (!(factor > 0)) return;

    // --- (A) Smoothly-scaled accruals ---
    // Consumable food/water decay, scaled to the span.
    for (const girl of s.roster) {
      if (girl.encounterState !== 'captive') continue;
      decayConsumables(girl, factor);
    }
    // "The Skim" — owned-location passive income, scaled to the span.
    if (window.DMTHGame.progression?.OWNERSHIP_PERKS && window.DMTHGame.state.addMoney) {
      const owned = s.ownedLocations || [];
      if (owned.length) {
        const skim = owned.length * (window.DMTHGame.progression.OWNERSHIP_PERKS.passiveIncome || 0) * factor;
        if (skim >= 1) window.DMTHGame.state.addMoney(Math.round(skim), 'owned-location-skim:action-span');
      }
    }
    // Wallet meter drift — player satisfaction (-0.5/tick) + buzz (-0.3/tick), scaled. Mirrors the
    // per-tick drift in runTick so a long session bleeds these the same way idle time does.
    if (s.wallet) {
      const w = s.wallet;
      const cur = typeof w.playerSatisfaction === 'number' ? w.playerSatisfaction : 50;
      if (cur > 0) w.playerSatisfaction = Math.max(0, cur - 0.5 * factor);
      const curBuzz = typeof w.buzz === 'number' ? w.buzz : 0;
      if (curBuzz > 0) w.buzz = Math.max(0, curBuzz - 0.3 * factor);
    }
    // credit interest for the skipped span too (debt keeps clawing while you're away).
    if (window.DMTHGame.state.accrueCreditInterest) window.DMTHGame.state.accrueCreditInterest(spanMinutes / 1440);
    // the vig + overdue collection heat keep running across a skipped span too.
    if (window.DMTHGame.loanshark) { try { window.DMTHGame.loanshark.accrue(spanMinutes / 1440); } catch (e) { /* non-fatal */ } }

    // --- (B) Whole catch-up ticks of the no-arg deterministic systems ---
    const wholeTicks = Math.min(MAX_CATCHUP_TICKS, Math.round(factor));
    for (let i = 0; i < wholeTicks; i++) {
      if (window.DMTHGame.actionEffects?.tickStaminaHealth) { try { window.DMTHGame.actionEffects.tickStaminaHealth(); } catch (e) { /* non-fatal */ } }
      if (window.DMTHGame.milk?.tickMilk) { try { window.DMTHGame.milk.tickMilk(); } catch (e) { /* non-fatal */ } }
      if (window.DMTHGame.supply?.autoDistribute) { try { window.DMTHGame.supply.autoDistribute(); } catch (e) { /* non-fatal */ } }
      if (window.DMTHGame.loot?.tickArchetypeGifts) { try { window.DMTHGame.loot.tickArchetypeGifts(); } catch (e) { /* non-fatal */ } }
    }
  }

  // Comfort score (0-1) for a captive's hold, summed from the seven comfort/ambience upgrade
  // tracks (lights, toys, food quality, bedding, entertainment, decor, climate). These tracks
  // used to be pure setting flavor; now they earn a real mechanical payoff — a comfortable hold
  // eases the captivity, so she fights the hold less (escape-bar suppression in runEscapeRoll)
  // AND acclimates faster (passive bond-debt forgiveness + a slow Stockholm bondXP trickle in
  // runComfortTick). Each track is normalized to its own maxTier and averaged, so a bare cell
  // reads ~0 and a fully kitted-out hold reads ~1.0.
  const COMFORT_TRACK_KEYS = ['lights', 'toys', 'food', 'bedding', 'entertainment', 'decor', 'climate'];
  function holdComfort(girl) {
    const dungeon = window.DMTHGame.state.getDungeon(girl.assignedDungeonId);
    const hold = dungeon?.holds?.[girl.assignedHoldIdx ?? 0];
    if (!hold) return 0;
    const tracks = window.DMTHGame.dungeonOps?.UPGRADE_TRACKS || {};
    let sum = 0, n = 0;
    for (const key of COMFORT_TRACK_KEYS) {
      const def = tracks[key];
      if (!def || !def.maxTier) continue;
      const tier = hold.upgrades?.[key] ?? 0;
      sum += Math.min(1, tier / def.maxTier);
      n++;
    }
    return n ? sum / n : 0;
  }

  // Passive comfort payoff per tick — a kitted-out hold slowly FORGIVES accumulated bond-debt
  // (comfort eases her resentment the way care acts do, just slower) and TRICKLES Stockholm
  // bondXP (comfort acclimates her toward the bond on its own). Scaled by the hold's comfort
  // score; a barely-furnished hold (< 0.25) gives nothing, so the player has to actually invest
  // in the comfort tracks to earn it. bondLevel is recomputed from XP via balancing so a
  // comfort-driven level-up fires its milestone like any other.
  function runComfortTick(girl) {
    const comfort = holdComfort(girl);
    if (comfort < 0.25) return;
    const bond = { ...girl.bond };
    if ((bond.bondDebt || 0) > 0) {
      bond.bondDebt = Math.max(0, bond.bondDebt - comfort * 0.5);
    }
    bond.bondXP = (bond.bondXP || 0) + comfort * 0.3;
    const prevLevel = bond.bondLevel;
    if (window.DMTHGame.balancing && window.DMTHGame.balancing.bondLevelForXp) {
      bond.bondLevel = window.DMTHGame.balancing.bondLevelForXp(bond.bondXP);
    }
    if (bond.bondLevel > prevLevel) {
      bond.milestones = [...(bond.milestones || []), `comfort-bond-up-L${bond.bondLevel}-${new Date().toISOString()}`];
    }
    window.DMTHGame.state.updateGirl(girl.id, { bond });
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

  //  (lose-rations) — a defiant LOW-BOND fighter/refuser sometimes hurls + smashes her
  // rations in a rage; the food she throws is DESTROYED and the player LOSES it. This is the
  // matching mechanic to the fighter-resistance imaging (her arm whipping a thrown object). It only ever
  // decrements her food STOCK (the thrown rations) — it does NOT touch the feeding MECHANISM
  // (decayConsumables, auto-feeder gating, watering all keep working; she just lost what she
  // threw). Gated: fighter/cusser/bargainer affect + bond <= 2; chance scales with her escape
  // risk (angrier = more likely); needs food stock to throw + a real toilet receptacle nearby
  // (a girl with full plumbing has no bucket/can to fling slop from, so the rage-throw is rarer).
  const TRASH_AFFECTS = ['fighter', 'cusser', 'bargainer'];
  function runFighterTrash(girl) {
    if (!TRASH_AFFECTS.includes(girl.captiveAffect)) return;
    if ((girl.bond?.bondLevel || 0) > 2) return;                 // only defiant low-bond
    const c = girl.consumables || {};
    const foodStock = c.food?.stock || 0;
    if (foodStock < 1) return;                                   // nothing to hurl
    const risk = girl.escape?.currentRisk ?? 0.1;
    const chance = 0.04 + risk * 0.10;                           // ~4% calm → ~14% at max risk, per tick
    if (Math.random() > chance) return;
    const lost = Math.min(foodStock, 2 + Math.floor(Math.random() * 2));   // 2-3 rations destroyed
    const newC = JSON.parse(JSON.stringify(c));
    newC.food.stock = Math.max(0, foodStock - lost);
    // Throwing her food in a rage is also a small bond-debt blip (she's defiant), but NO feeding-
    // system change beyond the lost stock.
    const patch = { consumables: newC, bond: { ...girl.bond, bondDebt: (girl.bond?.bondDebt || 0) + 1 } };
    window.DMTHGame.state.updateGirl(girl.id, patch);
    if (window.DMTHNotify) {
      window.DMTHNotify.show(`🍽️ ${girl.name} hurled her rations across the cell in a rage — ${lost} food destroyed.`, { type: 'warn', durationMs: 5000 });
    }
  }

  // Escape-risk BAR model. Each tick the bar RISES — fast when she's
  // defiant/terrified and carrying bond-debt, suppressed by containment and by Stockholm
  // bond (an indoctrinated captive stops trying). The player's active counter-lever is
  // care/loving acts (action-effects.js escapeRisk derive) which push the bar back down.
  // When the bar MAXES (>=1) she makes a break for it; containment decides caught vs out.
  // the human-readable ROOT issues driving her to run, so the warning popup tells the
  // player exactly what to go fix in her hold (mood / bond-debt / comfort / pain / neglect / no bond).
  function escapeReasons(girl) {
    const out = [];
    const mood = girl.mood?.mood || '';
    if (/defiant|terrified|fighter/.test(mood)) out.push('she\'s fighting it');
    else if (/wary|subdued|traumatized|broken|catatonic/.test(mood)) out.push(`her mood is ${mood}`);
    if ((girl.bond?.bondDebt || 0) > 20) out.push('heavy bond-debt (harshness unforgiven)');
    if (typeof holdComfort === 'function' && holdComfort(girl) < 0.4) out.push('her hold is bleak');
    if ((girl.body?.bruises || 0) >= 10) out.push('she\'s bruised + in pain');
    if ((girl.body?.health ?? 100) < 40) out.push('she\'s neglected + run-down');
    if ((girl.bond?.bondLevel || 0) <= 1) out.push('barely any Stockholm bond yet');
    return out;
  }

  function runEscapeRoll(girl) {
    if (!girl.escape) return;
    if (girl.body?.isNugget) return;   // a nugget has no limbs — she can't run, ever.
    const { containment } = holdContainment(girl);

    const mood = girl.mood?.mood || '';
    // Escape pacing. Rates ~halved + containment weighted heavier so a MANAGED captive
    // (fed/watered + the odd care act, or any locks/restraints) stays put and escapes are an
    // occasional real event, not a daily one. A fully-neglected, unsecured fresh captive still
    // works the bar up over ~25+ real minutes; care acts + containment push it back down.
    const moodDrive = /defiant|terrified|wary|broken|catatonic/.test(mood) ? 0.030
                    : /acclimating|subdued|ambivalent/.test(mood) ? 0.014
                    : 0.006;
    const bondDebtDrive = Math.min(0.04, (girl.bond?.bondDebt || 0) * 0.0008);
    const bondCalm      = Math.min(0.09, (girl.bond?.bondLevel || 0) * 0.011); // high Stockholm = stops trying
    const comfortCalm   = holdComfort(girl) * 0.03; // a comfortable hold eases her will to run (max ~−0.03/tick)
    // Net per-tick rise. Containment shaves the rise hard; comfort + Stockholm bond shave it
    // softer; a well-secured + comfortable + bonded girl can even drift downward on her own.
    const rise = moodDrive + bondDebtDrive - bondCalm - comfortCalm - containment * 0.12;

    const prevRisk = girl.escape.currentRisk ?? 0.1;
    let risk = Math.max(0, Math.min(1, prevRisk + rise));
    const escapeBase = { ...girl.escape, currentRisk: risk, containment };

    const day = currentGameDay();
    // First time we ever evaluate her, stamp the game-day she entered the hold so the
    // "no escape in the first few days" rule has an anchor. No bolt on this stamping pass.
    if (girl.escape.heldSinceDay == null) {
      window.DMTHGame.state.updateGirl(girl.id, { escape: { ...escapeBase, heldSinceDay: day } });
      return;
    }

    const now = window.DMTHGame.gameClock ? window.DMTHGame.gameClock.now() : 0;
    const fmtDur = (m) => (window.DMTHGame.gameClock && window.DMTHGame.gameClock.formatDuration) ? window.DMTHGame.gameClock.formatDuration(m) : `${m} min`;

    // a RECTIFIABLE warning, not a surprise. When the bar climbs into the danger
    // band, fire a sticky popup naming WHY she wants out + a link to her hold so the player can go
    // fix the root issues (calm her mood, ease the hold, treat/dose her) BEFORE she bolts.
    if (risk >= 0.8 && prevRisk < 0.8 && window.DMTHNotify) {
      const why = escapeReasons(girl);
      window.DMTHNotify.show(
        `⚠️ ${girl.name} is working up to run — ${why.length ? why.join('; ') : 'she wants out'}. Go fix it in her hold (love/calm her, ease her hold, treat or dose her) before the bar maxes.`,
        { type: 'error', sticky: true, action: { label: `→ ${girl.name}'s hold`, href: `#room?girl=${girl.id}` } }
      );
    }

    // Not maxed yet. If a bolt was already pending but she's since been calmed below the danger
    // band, the player rectified it in time → cancel the pending escape.
    if (risk < 1) {
      if (girl.escape.pendingEscapeUntil && risk < 0.8) {
        if (window.DMTHNotify) window.DMTHNotify.show(`🫦 You settled ${girl.name} before she ran — bolt cancelled. For now.`, { type: 'success', durationMs: 5000 });
        window.DMTHGame.state.updateGirl(girl.id, { escape: { ...escapeBase, pendingEscapeUntil: null } });
      } else {
        window.DMTHGame.state.updateGirl(girl.id, { escape: escapeBase });
      }
      return;
    }

    // ── BAR MAXED — but the GOVERNOR decides whether she's even allowed to bolt ──────────────
    // Cheat/sandbox: she seethes at the cap but NEVER breaks (you came here to play god, not babysit).
    if (window.DMTHGame.state.current.mode === 'sandbox') {
      window.DMTHGame.state.updateGirl(girl.id, { escape: { ...escapeBase, currentRisk: 0.9, pendingEscapeUntil: null } });
      return;
    }
    const gov = escapeGovernor();
    const heldDays   = day - (girl.escape.heldSinceDay ?? day);
    const onCooldown = girl.escape.cooldownUntilDay != null && day < girl.escape.cooldownUntilDay;
    const globalFull = gov.boltsToday >= GLOBAL_BOLTS_PER_DAY;
    // No first-day/daily escape, weekly per-girl cooldown, global daily cap. When a rule blocks her,
    // she SEETHES pinned at the cap (0.97) — the player still got the danger popup to go calm her, and
    // care acts can still push the bar back down — but she physically can't break the hold right now.
    if (heldDays < MIN_HELD_DAYS_BEFORE_BOLT || onCooldown || globalFull) {
      window.DMTHGame.state.updateGirl(girl.id, { escape: { ...escapeBase, currentRisk: 0.97, pendingEscapeUntil: null } });
      return;
    }

    // She doesn't vanish instantly: a grace TIMER runs while she pries at the hold. A sticky popup
    // shows the countdown + the hold link; rush there and drop her risk below the danger band (care
    // acts) and the bolt is cancelled. Let it run out → she breaks for it.
    if (!girl.escape.pendingEscapeUntil) {
      const until = now + ESCAPE_GRACE_MIN;
      window.DMTHGame.state.updateGirl(girl.id, { escape: { ...escapeBase, currentRisk: 1, pendingEscapeUntil: until } });
      if (window.DMTHNotify) {
        const why = escapeReasons(girl);
        window.DMTHNotify.show(
          `🏃 ${girl.name} is BOLTING — she's at the door (${why.length ? why.join('; ') : 'she wants out'}). Get to her hold NOW and calm her or she's GONE in ~${fmtDur(ESCAPE_GRACE_MIN)}.`,
          { type: 'danger', sticky: true, action: { label: `→ STOP HER (${girl.name}'s hold)`, href: `#room?girl=${girl.id}` } }
        );
      }
      return;
    }
    if (now < girl.escape.pendingEscapeUntil) {
      // still clawing at the door — hold the maxed state, wait for the player or the deadline.
      window.DMTHGame.state.updateGirl(girl.id, { escape: { ...escapeBase, currentRisk: 1 } });
      return;
    }

    // Grace expired + still maxed → she breaks for it. Containment decides caught vs gone.
    // Count this bolt against the global daily cap + start her weekly cooldown either way.
    gov.boltsToday += 1;
    const cooldownUntilDay = day + PER_GIRL_ESCAPE_COOLDOWN_DAYS;
    const caught = Math.random() < Math.max(0.4, 0.4 + containment * 0.58);
    if (caught) {
      const newBody = { ...girl.body, bruises: (girl.body.bruises || 0) + 2 };
      const newBond = { ...girl.bond, bondDebt: (girl.bond.bondDebt || 0) + 3 };
      const newMood = { mood: 'defiant', moodEmoji: '😤', history: [...(girl.mood.history || []), { shift: 'escape-caught', ts: Date.now() }] };
      window.DMTHGame.state.updateGirl(girl.id, {
        body: newBody, bond: newBond, mood: newMood,
        // Contained — bar drops back but not to zero; she'll build again unless calmed/secured.
        // Weekly cooldown: she just tried + got slammed back, she won't try again for days.
        escape: { ...escapeBase, currentRisk: 0.45, pendingEscapeUntil: null, cooldownUntilDay, lastAttempt: { outcome: 'caught', ts: Date.now() } }
      });
      if (window.DMTHNotify) {
        window.DMTHNotify.show(`🔒 ${girl.name} tried to run — contained${containment >= 0.8 ? ' (security held)' : ''}.`, { type: 'info', durationMs: 5000 });
      }
    } else {
      window.DMTHGame.state.updateGirl(girl.id, {
        encounterState: 'escaped',
        escape: { ...escapeBase, currentRisk: 1, pendingEscapeUntil: null, cooldownUntilDay, lastAttempt: { outcome: 'escaped', ts: Date.now() } }
      });
      window.DMTHGame.state.addNotoriety(4);
      // A captive loose in public is heat. The big spike comes later if she's never recaptured
      // (escape-recovery → 'escape-ratted'); this is the initial bump.
      if (window.DMTHGame.wanted) window.DMTHGame.wanted.accrue('escape');
      // a loose captive while you're ALREADY at/near MOST-WANTED is a real LAW
      // problem: she runs straight to a force already hunting you → extra heat (she rats now, not
      // later) which feeds the arrest system's raid roll. Lie low / recapture FAST.
      let lawHeat = false;
      if (window.DMTHGame.wanted && window.DMTHGame.wanted.get && window.DMTHGame.wanted.get() >= 78) {
        try { window.DMTHGame.wanted.accrue('escape-ratted'); } catch (e) { /* key-safe */ }
        lawHeat = true;
      }
      if (window.DMTHNotify) {
        window.DMTHNotify.show(
          lawHeat
            ? `🚨 ${girl.name} ESCAPED while you're MOST WANTED — she's running to a force already hunting you. The law is closing in — recapture her or lie low FAST.`
            : `🏃 ${girl.name} ESCAPED — recapture her before she's gone for good.`,
          { type: 'error', durationMs: 9000, action: { label: '→ hunt to recapture', href: '#town' } }
        );
      }
    }
  }

  window.DMTHGame = window.DMTHGame || {};
  window.DMTHGame.tick = Object.freeze({ start, stop, runTick, reconcileSpan });
})();
