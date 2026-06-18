// DUNGEON MASTER: THE HUNT — whore-out passive-income subsystem.
// Captives generate passive income through john encounters; the ledger tracks every john
// (act / payment / time / quirks) so the captive can reference them in chat.
//
// Distinct from Propositioner (bespoke single deals, player-approval gated, upmarket
// clientele). Whore-out is continuous passive general-public flow with batch resolution
// per tick. Both systems coexist.
//
// Schema on `girl.whoreOut`:
//   {
//     enabled:           bool
//     enabledAt:         ts | null
//     rate:              'low' | 'standard' | 'premium' | 'all-comers'
//     condomRequired:    bool
//     permittedActs:     string[]   // act IDs the player has whitelisted; empty = john's pick
//     blockedJohnTypes:  string[]   // archetype IDs the player blacklists
//     johnLedger:        JohnEncounter[]
//     sessionTotals: { encounters, gross, tips, bruisesAdded, cumLoadAdded }
//     unclaimedEarnings: number     // accrues per encounter; cashout transfers to wallet
//   }
//
// JohnEncounter shape:
//   {
//     id, ts, johnArchetype, johnDescription, acts, duration_min,
//     payment, tip, totalPaid, condomUsed,
//     girlMoodBefore, girlMoodAfter, bondDeltaApplied, bondDebtAdded,
//     bruisesAdded, cumLoadAdded, staminaDrained, notes,
//     pregnancyHookFired   // true if vaginal-cum gate + !condomUsed → attemptConception called
//   }

(function () {
  'use strict';

  // Cadence-based arrival params. Replaces the prior % per-tick rate enum so the player
  // can SEE when the next john is coming. Each tick (= 30 game minutes) advances a
  // per-girl `pendingArrivals` accumulator by `30 / cadenceMinutes * buzzMul`. Whole-
  // number portion fires that many arrivals; fractional carries forward.
  //
  //   rapid    — 1 john / 10 game min  (every tick fires ~3, ~6 at BUZZ 100)
  //   steady   — 1 john / 30 game min  (every tick fires 1, 2 at BUZZ 100)
  //   casual   — 1 john / 60 game min  (every 2 ticks fires 1)
  //   trickle  — 1 john / 120 game min (every 4 ticks fires 1)
  //   off      — no arrivals
  //
  // Legacy `rate` values (low/standard/premium/all-comers) map onto the new cadence so
  // old saves keep working without a migration pass.
  const RATE_PARAMS = {
    off:         { cadenceMinutes: Infinity, displayName: 'off' },
    trickle:     { cadenceMinutes: 120,      displayName: '1 john / 120 game min' },
    casual:      { cadenceMinutes: 60,       displayName: '1 john / 60 game min' },
    steady:      { cadenceMinutes: 30,       displayName: '1 john / 30 game min' },
    rapid:       { cadenceMinutes: 10,       displayName: '1 john / 10 game min' },
    // Legacy alias map — old saves with these values fall through to the closest cadence
    low:         { cadenceMinutes: 120, displayName: '1 john / 120 game min (legacy)', alias: 'trickle' },
    standard:    { cadenceMinutes: 30,  displayName: '1 john / 30 game min (legacy)',  alias: 'steady' },
    premium:     { cadenceMinutes: 20,  displayName: '1 john / 20 game min (legacy)',  alias: 'steady' },
    'all-comers':{ cadenceMinutes: 10,  displayName: '1 john / 10 game min (legacy)',  alias: 'rapid' }
  };
  // BUZZ multiplier on the cadence — BUZZ 100 doubles the arrival rate.
  function buzzMultiplier() {
    const buzz = window.DMTHGame.state?.getBuzz ? window.DMTHGame.state.getBuzz() : 0;
    return 1 + (buzz / 100);
  }
  // Expected fractional arrivals per tick (30 game minutes) at the current cadence + BUZZ.
  // For UI countdown + per-tick accumulator.
  function expectedArrivalsPerTick(rateId) {
    const r = RATE_PARAMS[rateId] || RATE_PARAMS.steady;
    if (!Number.isFinite(r.cadenceMinutes)) return 0;
    return (30 / r.cadenceMinutes) * buzzMultiplier();
  }
  // Game-minutes until next arrival from the per-girl `pendingArrivals` accumulator.
  // Used for the visible "next john in 8m 24s" countdown in the whore-out panel.
  function gameMinutesToNextArrival(girl) {
    const wo = getWhoreOut(girl);
    if (!wo.enabled) return null;
    const r = RATE_PARAMS[wo.rate] || RATE_PARAMS.steady;
    if (!Number.isFinite(r.cadenceMinutes)) return null;
    const pending = wo.pendingArrivals || 0;
    const buzzMul = buzzMultiplier();
    if (buzzMul <= 0) return null;
    // Minutes to climb from pending → 1.0 at the current effective arrival rate.
    const remaining = Math.max(0, 1 - pending);
    return remaining * r.cadenceMinutes / buzzMul;
  }

  // Acts that count as vaginal-cum delivery for pregnancy conception (matches the
  // VAGINAL_CUM_TAGS set in delta.js).
  const VAGINAL_CUM_ACTS = new Set(['creampie', 'breeding', 'cum-in-pussy', 'cum-inside', 'vaginal-cum']);

  // Stamina-floor below which the girl refuses further johns and rest is forced.
  const STAMINA_FLOOR_JOHN_GATE = 10;

  // Bond-debt threshold above which she protests / escape risk spikes.
  const BONDDEBT_EXCESS = 60;

  function defaultWhoreOut() {
    return {
      enabled: false,
      enabledAt: null,
      rate: 'steady',
      condomRequired: false,
      permittedActs: [],
      blockedJohnTypes: [],
      // FRIENDS.1 — when ON, a slice of arrivals become "friends": rare, extreme, near-kill
      // visitors (see FRIEND_ARCHETYPES). Off by default — the player opts a girl into it.
      friendsAllowed: false,
      johnLedger: [],
      sessionTotals: { encounters: 0, gross: 0, tips: 0, bruisesAdded: 0, cumLoadAdded: 0 },
      unclaimedEarnings: 0,
      // Cadence accumulator — each tick advances by `expectedArrivalsPerTick`. Whole-number
      // portion fires that many arrivals; fractional carries forward so cadence is
      // deterministic across ticks rather than dice-rolled per tick.
      pendingArrivals: 0,
      // Game-minutes timestamp of the most recent john arrival. Used for ledger context
      // and for the countdown display in the room UI.
      lastJohnArrivalAt: null
    };
  }

  function getWhoreOut(girl) {
    const wo = (girl && girl.whoreOut) || defaultWhoreOut();
    // Legacy rate normalization — old saves persisted low/standard/premium/all-comers.
    // Resolve via alias so the UI dropdown selects a valid canonical option and the
    // cadence math hits a single canonical row instead of the legacy aliases.
    const r = RATE_PARAMS[wo.rate];
    if (r && r.alias) return { ...wo, rate: r.alias };
    return wo;
  }

  function toggle(girlId, on) {
    const girl = window.DMTHGame.state.getGirl(girlId);
    if (!girl) throw new Error('no such girl');
    const wo = { ...getWhoreOut(girl) };
    wo.enabled = !!on;
    if (on) wo.enabledAt = Date.now();
    window.DMTHGame.state.updateGirl(girlId, { whoreOut: wo });
    return wo;
  }

  function updateSettings(girlId, patch) {
    const girl = window.DMTHGame.state.getGirl(girlId);
    if (!girl) throw new Error('no such girl');
    const wo = { ...getWhoreOut(girl), ...patch };
    window.DMTHGame.state.updateGirl(girlId, { whoreOut: wo });
    return wo;
  }

  // -----------------------------------------------------------------------
  // Per-tick john arrivals
  // -----------------------------------------------------------------------

  // Fire a single john encounter for one whored-out girl. Caller has already decided that
  // an arrival is due (per the cadence accumulator). Returns null when arrival is blocked
  // (stamina floor, bond-debt overflow, blocked archetype with no fallback) — otherwise
  // returns the resolved JohnEncounter.
  //
  // Postmortem branch: when girl.encounterState === 'dead', skip the alive-only gates
  // (stamina/bond-debt are irrelevant) and force the postmortem-john archetype.
  function tryArrival(girl) {
    const wo = getWhoreOut(girl);
    if (!wo.enabled) return null;

    // Postmortem branch — body is dead but whore-out continues. Always uses postmortem-john.
    if (girl.encounterState === 'dead') {
      // Corpse clientele is niche AND risky. A share of arrivals are disgusted and balk —
      // no service, and a disgusted client talks (WANTED bump). Disgust rises with decay.
      const decayDays = (girl.body?.decayedMinutes || 0) / 1440;
      const disgustChance = Math.min(0.6, 0.15 + decayDays * 0.06);
      if (Math.random() < disgustChance) {
        if (window.DMTHGame.wanted) window.DMTHGame.wanted.accrue('john-disgust');
        return null;
      }
      return resolveEncounter(girl, 'postmortem-john');
    }

    const stamina = girl.body?.stamina ?? 70;
    if (stamina <= STAMINA_FLOOR_JOHN_GATE) return null;  // she's too tired

    // Bond-debt overflow — girl protests, no more johns until debt clears
    if ((girl.bond?.bondDebt || 0) > BONDDEBT_EXCESS) return null;

    // FRIENDS.1 — if the player has let "friends" in for this girl, a slice of arrivals is a
    // friend instead of a john (rarer, extreme, near-kill). ~15% of arrivals when allowed.
    if (wo.friendsAllowed && window.DMTHJohnArchetypes.rollFriendArchetype && Math.random() < 0.15) {
      return resolveFriendEncounter(girl, window.DMTHJohnArchetypes.rollFriendArchetype(Math.random));
    }

    const isPregnant = girl.pregnancy?.status === 'pregnant';
    let archetypeId = window.DMTHJohnArchetypes.rollJohnArchetype(Math.random, { isPregnant });

    // Player blocks this archetype? Re-roll once; if still blocked, skip.
    if (wo.blockedJohnTypes.includes(archetypeId)) {
      archetypeId = window.DMTHJohnArchetypes.rollJohnArchetype(Math.random, { isPregnant });
      if (wo.blockedJohnTypes.includes(archetypeId)) return null;
    }

    return resolveEncounter(girl, archetypeId);
  }

  function resolveEncounter(girl, archetypeId) {
    const arc = window.DMTHJohnArchetypes.JOHN_ARCHETYPES[archetypeId];
    if (!arc) return null;
    const wo = getWhoreOut(girl);
    // NPC-IDENT.1 — mint this john a name so she can reference him + a multi-party scene can address him.
    const npc = window.DMTHJohnArchetypes.mintNpcIdentity ? window.DMTHJohnArchetypes.mintNpcIdentity(archetypeId) : null;

    // Pick acts — intersection of john's preferences + player's permittedActs (if non-empty)
    // When player has a non-empty permittedActs whitelist and no
    // john preference matches, the john leaves without service (whitelist is binding now,
    // not "john gets his preferences anyway"). Prevents the player's whitelist from being
    // silently ignored.
    let acts = window.DMTHJohnArchetypes.rollJohnActs(archetypeId);
    if (wo.permittedActs.length > 0) {
      const filtered = acts.filter(a => wo.permittedActs.includes(a));
      if (filtered.length === 0) {
        // Whitelist couldn't match — john leaves dissatisfied. No encounter persisted,
        // no pay, no stamina drain. Light mood/notoriety blip from declining work.
        return null;
      }
      acts = filtered;
    }

    // Condom use (CONDOM-STOCK.1) — a john can only glove up if her hold / the dungeon POOL is
    // actually STOCKED with condoms. "Condom required" enforces it ONLY when stock exists; with
    // no condoms stocked the john goes RAW regardless (so an unstocked room = pregnancy risk).
    // Each used condom consumes one from the supply (hold first, then dungeon pool).
    let condomUsed = false;
    if (girl.encounterState !== 'dead') {
      const wantsCondom = wo.condomRequired || Math.random() < (arc.condomCompliance || 0);
      if (wantsCondom && window.DMTHGame.supply?.draw && window.DMTHGame.supply.draw(girl, 'condoms', 1) > 0) {
        condomUsed = true;
      }
    }

    // Compute pay. Alive girls scale by johnHappinessForGirl (service quality). A CORPSE
    // pays a steep necro PREMIUM instead (the degenerate-content money tier) — happiness is
    // irrelevant to a corpse john, so we bypass it and apply a decay-scaled premium: fresh
    // bodies command ~2.8×, declining toward a 1.4× floor as they rot. The matching law-heat
    // (WANTED corpse-content-sale) is accrued below.
    const isPostmortem = girl.encounterState === 'dead';
    const basePay = arc.payRange[0] + Math.floor(Math.random() * (arc.payRange[1] - arc.payRange[0]));
    let necroMult = 1;
    if (isPostmortem) {
      const decayDays = (girl.body?.decayedMinutes || 0) / 1440;
      // CORPSE-TIMER.1 — fresh pays the most, near-rotten very little. Steeper falloff so
      // across the ~5-day window the premium slides from 2.8× (fresh) toward the 1.2× floor.
      necroMult = Math.max(1.2, 2.8 - decayDays * 0.32);
    }
    const happiness = isPostmortem
      ? { multiplier: 1.0, breakdown: { postmortem: true, necroMult } }
      : (window.DMTHGame.actionEffects?.johnHappinessForGirl(girl) || { multiplier: 1.0, breakdown: {} });
    // Player-satisfaction cash bonus — a satisfied operator runs a tighter, higher-earning
    // house. Centered at 50 (neutral); full 100 → +12%, floor 0 → -12%. This is the "cash
    // gains" half of the satisfaction loop (hunting bonus lives in hunt.js).
    const sat = window.DMTHGame.state.getSatisfaction ? window.DMTHGame.state.getSatisfaction() : 50;
    const satMul = 1 + ((sat - 50) / 50) * 0.12;
    // CUMCAP.2 — a filled-up girl (cumLoad near her trained capacity) is premium content: johns
    // pay more the closer she is to maxed (up to +35% at cap).
    const cumRatio = Math.min(1, (girl.body?.cumLoad || 0) / (girl.body?.cumLoadCap || 10));
    const cumMul = 1 + 0.35 * cumRatio;
    const payment = Math.round(basePay * happiness.multiplier * necroMult * satMul * cumMul);
    const tipRoll = Math.random() < arc.tipChance;
    const tip = tipRoll ? Math.round(payment * (arc.tipMul - 1.0)) : 0;

    // Apply the john action (drains stamina + health + mood per archetype intensity)
    // Capture bond before+after so encounter ledger records the ACTUAL bond delta applied,
    // not hardcoded 0.
    const moodBefore = girl.mood?.mood || 'neutral';
    const bondDebtBefore = girl.bond?.bondDebt || 0;
    const bondXPBefore = girl.bond?.bondXP || 0;
    if (window.DMTHGame.actionEffects?.applyAction) {
      const strain = (girl.body?.stamina ?? 70) <= window.DMTHGame.actionEffects.STAMINA_THRESHOLD_FOR_STRAIN;
      window.DMTHGame.actionEffects.applyAction(girl.id, arc.johnActionId, { strain });
    }
    // Re-read girl after applyAction mutations
    const refreshed = window.DMTHGame.state.getGirl(girl.id);
    const moodAfter = refreshed?.mood?.mood || moodBefore;
    const bondDebtAfter = refreshed?.bond?.bondDebt || 0;
    const bondXPAfter = refreshed?.bond?.bondXP || 0;

    // FRIENDKILL.1 / SNUFFBONUS.1 — a normal john kills her only on the RARE occurrence that his
    // use crossed her death floor (she was already at ~0 — i.e. a poorly-maintained, over-whored
    // girl). A managed girl's tiny per-john debuff never gets there. Snuff bonus folds into his pay.
    let johnKillBonus = 0;
    if (!isPostmortem && (refreshed?.body?.health ?? 100) <= 0 && window.DMTHGame.lifespan?.killDuringAct) {
      try {
        const k = window.DMTHGame.lifespan.killDuringAct(girl.id, { cause: 'john-kill:' + archetypeId, corpse: 'used-up', byLabel: arc.displayName, baseBonus: 450 });
        johnKillBonus = (k && k.snuffBonus) || 0;
      } catch (e) { /* non-fatal */ }
    }

    // Determine cum delivery: vaginal-cum acts trigger pregnancy hook unless condomUsed
    const hasVaginalCum = acts.some(a => VAGINAL_CUM_ACTS.has(a));
    let pregnancyHookFired = false;
    if (hasVaginalCum && !condomUsed && window.DMTHGame.pregnancy?.addVaginalCum) {
      try {
        // CUMFILL.1 — a john's vaginal load raises her vaginal cum-fill; sustained fill (the
        // preggo timer in pregnancy.tickCumFill) is what conceives, not a per-john roll.
        window.DMTHGame.pregnancy.addVaginalCum(girl.id, 1.2, { conceptionSource: 'whore-out' });
        pregnancyHookFired = true;
      } catch (err) {
        console.debug('[whore-out] vaginal cum-fill failed:', err);
      }
    }

    // JOHN-VARIETY.1 — a depraved john (intensity ≥ 3) helps himself to what's in the room:
    // a TOY mounted in her hold and/or a hit of DRUGS from the dungeon pool, used on/around her
    // (smoke her weed and blacken her eye). Draws from the same supply the player stocks; applies
    // the toy's real damage/effect; pays a depravity premium on top. Alive girls only.
    let johnExtraPay = 0;
    const johnExtraActs = [];
    if (!isPostmortem && (arc.intensity || 0) >= 3) {
      const heldToys = window.DMTHGame.toys?.holdToys ? window.DMTHGame.toys.holdToys(girl) : [];
      if (heldToys.length && Math.random() < ((arc.intensity >= 4) ? 0.5 : 0.25)) {
        const tid = heldToys[Math.floor(Math.random() * heldToys.length)];
        try { const r = window.DMTHGame.toys.use(tid, girl.id, { byJohn: true }); if (r && r.ok) { johnExtraActs.push('toy:' + tid); johnExtraPay += 40; } } catch (e) { /* non-fatal */ }
      }
      if (window.DMTHGame.supply?.drawDrug && Math.random() < 0.4) {
        const drg = window.DMTHGame.supply.drawDrug(girl);
        if (drg) { johnExtraActs.push('drug:' + drg); johnExtraPay += 15; }
      }
    }
    const totalPaid = payment + tip + johnExtraPay + johnKillBonus;

    // For repeat-eligible archetypes, persist a stable johnId so
    // subsequent encounters can match against prior visits. Repeat clients build cumulative
    // rep + the girl can reference them by name in dialogue ("the regular from Tuesday").
    const isRepeatable = !!arc.repeatable;
    let johnId = null;
    if (isRepeatable) {
      const refreshedWo = getWhoreOut(girl);
      const priorRepeats = (refreshedWo.johnLedger || []).filter(e => e.johnArchetype === archetypeId && e.johnId);
      // 60% chance to match a prior repeat-client if one exists; else mint a new ID
      if (priorRepeats.length > 0 && Math.random() < 0.6) {
        johnId = priorRepeats[priorRepeats.length - 1].johnId;
      } else {
        johnId = 'john_' + archetypeId + '_' + Date.now().toString(36).slice(-4);
      }
    }

    const encounter = {
      id: 'enc_' + Date.now().toString(36) + '_' + Math.floor(Math.random() * 0xffff).toString(36),
      johnId,
      ts: Date.now(),
      johnArchetype: archetypeId,
      johnDescription: arc.displayName,
      johnName: npc ? npc.name : null,
      johnHandle: npc ? npc.handle : arc.displayName,
      acts: johnExtraActs.length ? [...acts, ...johnExtraActs] : acts,
      duration_min: arc.intensity * 5 + Math.floor(Math.random() * 10),
      payment,
      tip,
      johnExtraPay,
      totalPaid,
      condomUsed,
      girlMoodBefore: moodBefore,
      girlMoodAfter: moodAfter,
      bondDeltaApplied: bondXPAfter - bondXPBefore,
      bondDebtAdded: bondDebtAfter - bondDebtBefore,
      bruisesAdded: arc.bruisesAdded || 0,
      cumLoadAdded: hasVaginalCum ? 1.2 : (acts.includes('oral') ? 1.0 : 0),
      staminaDrained: Math.abs(window.DMTHGame.actionEffects?.ACTIONS?.[arc.johnActionId]?.stamina || 5),
      notes: `${arc.displayName} — ${arc.dialogueTone}. Acts: ${acts.join(', ')}.${condomUsed ? ' [condom used]' : ' [no condom]'}`,
      pregnancyHookFired
    };

    // Persist to ledger + session totals + unclaimed earnings + cadence timestamp
    const newWo = { ...getWhoreOut(refreshed || girl) };
    newWo.johnLedger = [...(newWo.johnLedger || []), encounter].slice(-200);
    newWo.sessionTotals = {
      encounters: (newWo.sessionTotals?.encounters || 0) + 1,
      gross: (newWo.sessionTotals?.gross || 0) + payment,
      tips: (newWo.sessionTotals?.tips || 0) + tip,
      bruisesAdded: (newWo.sessionTotals?.bruisesAdded || 0) + encounter.bruisesAdded,
      cumLoadAdded: (newWo.sessionTotals?.cumLoadAdded || 0) + encounter.cumLoadAdded
    };
    newWo.unclaimedEarnings = (newWo.unclaimedEarnings || 0) + totalPaid;
    // Stamp the arrival time in game-minutes for the room UI countdown display.
    if (window.DMTHGame.gameClock) {
      newWo.lastJohnArrivalAt = window.DMTHGame.gameClock.now();
    }

    // Notoriety bump per encounter — 1 per 4 encounters
    if (window.DMTHGame.state.addNotoriety && (newWo.johnLedger.length % 4 === 0)) {
      window.DMTHGame.state.addNotoriety(1);
    }

    // BUZZ feed — every successful john bumps the operator's underground reputation. Word
    // spreads; more johns find their way to the dungeon over time. Postmortem encounters
    // bump LESS (niche clientele doesn't broadcast as widely) — half the alive rate.
    if (window.DMTHGame.state.addBuzz) {
      const buzzGain = archetypeId === 'postmortem-john' ? 0.25 : 0.5;
      window.DMTHGame.state.addBuzz(buzzGain, `john-completed: ${archetypeId}`);
    }

    // Corpse content draws the worst law-heat — every postmortem sale spikes WANTED.
    if (isPostmortem && window.DMTHGame.wanted) {
      window.DMTHGame.wanted.accrue('corpse-content-sale');
    }

    // FRIENDGIFT.1 — a satisfied john sometimes leaves a high-tier gift (generous types more often).
    if (!isPostmortem && window.DMTHGame.loot && window.DMTHGame.loot.grantNpcGift
        && Math.random() < (0.05 + (arc.intensity || 0) * 0.02)) {
      window.DMTHGame.loot.grantNpcGift({ from: npc ? npc.handle : arc.displayName, generous: (arc.tipChance || 0) > 0.4 });
    }

    window.DMTHGame.state.updateGirl(girl.id, { whoreOut: newWo });
    return encounter;
  }

  // FRIENDS.1/.2 — resolve a "friend" visit: the friend's EXTREME act + a direct near-kill
  // health drop (~40-60), a fortune in pay, logged to her ledger + a friendVisits counter so the
  // death-dossier / trophy reflects how hard she was used. Alive captives only.
  function resolveFriendEncounter(girl, friendId) {
    const arc = window.DMTHJohnArchetypes.FRIEND_ARCHETYPES[friendId];
    if (!arc || girl.encounterState === 'dead') return null;
    // NPC-IDENT.1 — mint the friend an identity (title + name) for chat memory + multi-party scenes.
    const npc = window.DMTHJohnArchetypes.mintNpcIdentity ? window.DMTHJohnArchetypes.mintNpcIdentity(friendId, { isFriend: true }) : null;

    const moodBefore = girl.mood?.mood || 'neutral';
    const bondXPBefore = girl.bond?.bondXP || 0;
    const bondDebtBefore = girl.bond?.bondDebt || 0;

    // The friend's extreme act — credited to johns (byJohn) so the PLAYER isn't paid/leveled for it.
    if (window.DMTHGame.actionEffects?.applyAction) {
      try { window.DMTHGame.actionEffects.applyAction(girl.id, arc.johnActionId, { byJohn: true, strain: true }); } catch (e) { /* non-fatal */ }
    }
    // Near-kill ability — a direct extra health drop on top of the act.
    const r0 = window.DMTHGame.state.getGirl(girl.id) || girl;
    const drop = arc.healthDrop[0] + Math.floor(Math.random() * (arc.healthDrop[1] - arc.healthDrop[0] + 1));
    const curHealth = r0.body?.health ?? 100;

    // FRIENDKILL.1 gate (Gee) — the LETHAL outcome only fires when her remaining health is NOT
    // greater than his debuff (health <= drop). A healthy girl just gets wrecked down; one already
    // on the edge gets finished on camera. The Executioner's huge drop makes him the one most
    // likely to cross it — leave a girl whored-out to friends unmonitored and she can come back dead.
    const killed = drop >= curHealth;
    let snuffBonus = 0;
    let newHealth = curHealth;
    if (killed) {
      const k = window.DMTHGame.lifespan.killDuringAct(girl.id, {
        cause: 'friend-kill:' + friendId, corpse: arc.corpse || 'bled-out',
        byLabel: arc.displayName, baseBonus: 700
      });
      snuffBonus = (k && k.snuffBonus) || 0;
      newHealth = 0;
    } else {
      // Gee: a friend can take "as much as 50% health for all the sadistic acts in totality" —
      // a survivor never loses more than 50 HP in one visit (the lethal finish is the separate
      // gated path above). The raw `drop` still drives the kill gate; the WRECK is capped here.
      const wreck = Math.min(drop, 50);
      const body = { ...(r0.body || {}) };
      newHealth = Math.max(1, curHealth - wreck);
      body.health = newHealth;
      body.bruises = (body.bruises || 0) + (arc.bruisesAdded || 0);
      body.recentActTag = 'beaten';
      if (window.DMTHGame.gameClock) body.recentActAt = window.DMTHGame.gameClock.now();
      window.DMTHGame.state.updateGirl(girl.id, { body });
    }

    const refreshed = window.DMTHGame.state.getGirl(girl.id) || girl;
    const actTags = [...(arc.permittedActsPreference || []).slice(0, 2), killed ? 'snuff' : 'friend-extreme'];
    const basePay = arc.payRange[0] + Math.floor(Math.random() * (arc.payRange[1] - arc.payRange[0]));
    const sat = window.DMTHGame.state.getSatisfaction ? window.DMTHGame.state.getSatisfaction() : 50;
    // SNUFFBONUS.1 — if he finished her, the snuff bonus folds into his payout.
    const payment = Math.round(basePay * (1 + ((sat - 50) / 50) * 0.12)) + snuffBonus;

    const encounter = {
      id: 'frnd_' + Date.now().toString(36) + '_' + Math.floor(Math.random() * 0xffff).toString(36),
      ts: Date.now(),
      isFriend: true,
      johnArchetype: friendId,
      johnDescription: 'FRIEND — ' + arc.displayName,
      acts: actTags,
      duration_min: 30 + Math.floor(Math.random() * 30),
      payment, tip: 0, johnExtraPay: 0, totalPaid: payment,
      condomUsed: false,
      girlMoodBefore: moodBefore,
      girlMoodAfter: refreshed.mood?.mood || moodBefore,
      bondDeltaApplied: (refreshed.bond?.bondXP || 0) - bondXPBefore,
      bondDebtAdded: (refreshed.bond?.bondDebt || 0) - bondDebtBefore,
      bruisesAdded: arc.bruisesAdded || 0,
      cumLoadAdded: 0,
      healthDropped: killed ? curHealth : drop,
      killed, snuffBonus,
      staminaDrained: 0,
      notes: killed
        ? `FRIEND ${arc.displayName} KILLED her — ${arc.killLine || arc.ability}. Snuff content +$${snuffBonus}. ${arc.dialogueTone}.`
        : `FRIEND ${arc.displayName} — ${arc.ability}. Health −${drop}. ${arc.dialogueTone}.`,
      pregnancyHookFired: false
    };

    const newWo = { ...getWhoreOut(refreshed) };
    newWo.johnLedger = [...(newWo.johnLedger || []), encounter].slice(-200);
    newWo.sessionTotals = {
      encounters: (newWo.sessionTotals?.encounters || 0) + 1,
      gross: (newWo.sessionTotals?.gross || 0) + payment,
      tips: newWo.sessionTotals?.tips || 0,
      bruisesAdded: (newWo.sessionTotals?.bruisesAdded || 0) + (arc.bruisesAdded || 0),
      cumLoadAdded: newWo.sessionTotals?.cumLoadAdded || 0
    };
    newWo.unclaimedEarnings = (newWo.unclaimedEarnings || 0) + payment;
    newWo.friendVisits = (newWo.friendVisits || 0) + 1;   // FRIENDS.2 — history for the dossier/trophy
    if (window.DMTHGame.gameClock) newWo.lastJohnArrivalAt = window.DMTHGame.gameClock.now();
    window.DMTHGame.state.updateGirl(girl.id, { whoreOut: newWo });

    if (window.DMTHGame.state.addBuzz) window.DMTHGame.state.addBuzz(killed ? 0.5 : 1.0, 'friend-visit: ' + friendId);
    if (!killed) { try { if (window.DMTHGame.wanted) window.DMTHGame.wanted.accrue('captive-death'); } catch (e) { /* heat bump — key-safe */ } }
    if (window.DMTHNotify) {
      if (killed) {
        window.DMTHNotify.show(`☠️ ${arc.displayName} FINISHED ${girl.name} — ${arc.killLine || 'she didn\'t survive him'}. Paid $${payment} (incl. snuff bonus). Her body's in the hold until you dispose of it.`, { type: 'error', durationMs: 9000 });
      } else {
        window.DMTHNotify.show(`🩸 ${arc.displayName} paid $${payment} to wreck ${girl.name} — she's at ${newHealth} HP.`, { type: 'warn', durationMs: 6000 });
        if (newHealth <= 8) window.DMTHNotify.show(`⚠️ ${girl.name} is barely alive (${newHealth} HP) — heal her now or lose her.`, { type: 'danger', durationMs: 8000 });
      }
    }
    // FRIENDGIFT.1 — friends are generous: ~50% leave a high-tier gift (gear/toys/drugs) for the use.
    if (window.DMTHGame.loot && window.DMTHGame.loot.grantNpcGift && Math.random() < 0.5) {
      window.DMTHGame.loot.grantNpcGift({ from: (npc ? npc.handle : arc.displayName), generous: true });
    }
    return encounter;
  }

  // GANGBANG.1 — fire N johns on one girl back-to-back as a single gangbang. Each resolves like a
  // normal arrival (re-reading her so stamina/health/pay/cum-fill stack), summed into one notify.
  // Ends early if she hits the stamina floor / bond-debt wall. Player-triggered from the room.
  function resolveGangbang(girlId, n = 3) {
    const girl0 = window.DMTHGame.state.getGirl(girlId);
    if (!girl0) return { ok: false, reason: 'no such girl' };
    if (!getWhoreOut(girl0).enabled) return { ok: false, reason: 'whore-out is off for her' };
    const count = Math.max(2, Math.min(8, n));
    const encs = [];
    for (let i = 0; i < count; i++) {
      const enc = tryArrival(window.DMTHGame.state.getGirl(girlId));
      if (enc) encs.push(enc); else break;
    }
    const gross = encs.reduce((t, e) => t + (e.totalPaid || 0), 0);
    if (window.DMTHNotify) {
      window.DMTHNotify.show(`💦 Gangbang on ${girl0.name}: ${encs.length} john${encs.length === 1 ? '' : 's'} took turns — $${gross}.`, { type: encs.length ? 'success' : 'info', durationMs: 6000 });
    }
    return { ok: true, count: encs.length, gross };
  }

  // -----------------------------------------------------------------------
  // Tick wiring
  // -----------------------------------------------------------------------

  // Cadence-based tick. Each enabled whored-out girl accumulates `expectedArrivalsPerTick`
  // into her `pendingArrivals` field; whole-number portion fires that many arrivals this
  // tick, fractional carries forward to the next tick. BUZZ multiplier folded into the
  // accumulator, so higher BUZZ literally adds more pending arrivals per tick.
  //
  // Dead girls (encounterState === 'dead') keep accumulating arrivals as long as their
  // whoreOut.enabled is true and decay hasn't passed the forced-disposal threshold — but
  // only fire postmortem-john arrivals (handled in tryArrival).
  function runJohnTick() {
    const s = window.DMTHGame.state.current;
    if (!s) return;
    for (const girl of s.roster) {
      // Captive (alive) OR dead-but-not-yet-disposed
      const eligible = girl.encounterState === 'captive' || girl.encounterState === 'dead';
      if (!eligible) continue;
      const wo = getWhoreOut(girl);
      if (!wo.enabled) continue;

      // Accumulate fractional arrivals for this tick. BUZZ folded in.
      const perTick = expectedArrivalsPerTick(wo.rate);
      let pending = (wo.pendingArrivals || 0) + perTick;
      const toFire = Math.floor(pending);
      pending -= toFire;

      // Persist accumulator update before firing any arrivals — every encounter re-reads
      // girl from state, so we update the carrier first so subsequent reads see fresh.
      window.DMTHGame.state.updateGirl(girl.id, {
        whoreOut: { ...wo, pendingArrivals: pending }
      });

      let arrivals = 0;
      for (let i = 0; i < toFire; i++) {
        const enc = tryArrival(window.DMTHGame.state.getGirl(girl.id));
        if (enc) arrivals++;
      }
      if (arrivals > 0 && window.DMTHNotify && arrivals >= 2) {
        window.DMTHNotify.show(`💰 ${girl.name}: ${arrivals} johns this tick`, { type: 'info', durationMs: 2000 });
      }
    }
  }

  // -----------------------------------------------------------------------
  // Cashout + ledger helpers
  // -----------------------------------------------------------------------

  function cashout(girlId) {
    const girl = window.DMTHGame.state.getGirl(girlId);
    if (!girl) throw new Error('no such girl');
    const wo = getWhoreOut(girl);
    const amount = wo.unclaimedEarnings || 0;
    if (amount <= 0) return { ok: false, reason: 'nothing to cash out', amount: 0 };
    window.DMTHGame.state.addMoney(amount, `whore-out:cashout:${girlId}`);
    const newWo = { ...wo, unclaimedEarnings: 0 };
    window.DMTHGame.state.updateGirl(girlId, { whoreOut: newWo });
    return { ok: true, amount };
  }

  // Summarize the last N encounters for Ollama context block / memory injection so the
  // captive can talk about her johns in chat.
  function summarizeLedger(girlId, opts = {}) {
    const girl = window.DMTHGame.state.getGirl(girlId);
    if (!girl) return [];
    const wo = getWhoreOut(girl);
    const n = opts.last || 5;
    return (wo.johnLedger || []).slice(-n).map(e => ({
      ts: e.ts,
      archetype: e.johnArchetype,
      description: e.johnDescription,
      handle: e.johnHandle || e.johnName || e.johnDescription,   // NPC-IDENT.1 — name she can reference
      acts: e.acts.join(', '),
      paid: e.totalPaid,
      notes: e.notes
    }));
  }

  // Compact one-line ledger entries for Ollama context.
  function contextBlockText(girlId) {
    const summary = summarizeLedger(girlId, { last: 5 });
    if (!summary.length) return '';
    const lines = summary.map(e => {
      const ago = Math.max(0, Math.round((Date.now() - e.ts) / 60000));
      return `  - ${ago}min ago: ${e.handle} (${e.acts}) — $${e.paid}. ${e.notes}`;
    });
    return `RECENT JOHNS/FRIENDS (last 5 — she remembers them BY NAME and may reference them):\n${lines.join('\n')}`;
  }

  window.DMTHGame = window.DMTHGame || {};
  window.DMTHGame.whoreOut = Object.freeze({
    RATE_PARAMS,
    STAMINA_FLOOR_JOHN_GATE,
    BONDDEBT_EXCESS,
    defaultWhoreOut,
    getWhoreOut,
    toggle,
    updateSettings,
    tryArrival,
    resolveEncounter,
    resolveFriendEncounter,
    resolveGangbang,
    runJohnTick,
    cashout,
    summarizeLedger,
    contextBlockText,
    buzzMultiplier,
    expectedArrivalsPerTick,
    gameMinutesToNextArrival
  });
})();
