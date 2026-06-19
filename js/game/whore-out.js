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

    // FRIENDDIRECT.1 — corrected (Gee): *"johns can be passive but for a gang bang and same with
    // friends i dont need to tell them what to do unless its a gangbang"*. So passive friends ARE
    // back: a friend visits AUTONOMOUSLY (does his own extreme thing — the player doesn't tell him
    // what to do) on a girl whose `friendsAllowed` is ON. The per-girl toggle IS how the player
    // "directs" which girls receive friends (so they don't "willy neely choose there own girl"
    // across the whole roster); DIRECTION OF THE ACT / participant selection is gangbang-only.
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

  // `opts` (NPCDIRECT-PAID.1) lets the caller force a DIRECTED encounter:
  //   opts.npc           reuse an already-minted identity (the SAME named man from the scene)
  //   opts.forcedActs    ledger act tags to use verbatim (bypasses the rolled-acts + whitelist path)
  //   opts.forcedActionId  the COMMONALITY-ENGINE-matched action whose stat spec applyAction uses
  //   opts.directiveNote   the player's raw typed directive, appended to the history-event notes
  function resolveEncounter(girl, archetypeId, opts = {}) {
    const arc = window.DMTHJohnArchetypes.JOHN_ARCHETYPES[archetypeId];
    if (!arc) return null;
    const wo = getWhoreOut(girl);
    // NPC-IDENT.1 — mint this john a name so she can reference him + a multi-party scene can address him.
    // NPCDIRECT-PAID.1 — reuse the passed identity so a directed john is the SAME man, not a fresh name.
    const npc = opts.npc || (window.DMTHJohnArchetypes.mintNpcIdentity ? window.DMTHJohnArchetypes.mintNpcIdentity(archetypeId) : null);

    // Pick acts — intersection of john's preferences + player's permittedActs (if non-empty).
    // When player has a non-empty permittedActs whitelist and no john preference matches, the john
    // leaves without service (whitelist is binding). A DIRECTED encounter (opts.forcedActs) is the
    // player's explicit order — it uses the forced acts verbatim and bypasses the whitelist entirely.
    let acts;
    if (opts.forcedActs && opts.forcedActs.length) {
      acts = opts.forcedActs.slice();
    } else {
      acts = window.DMTHJohnArchetypes.rollJohnActs(archetypeId);
      if (wo.permittedActs.length > 0) {
        const filtered = acts.filter(a => wo.permittedActs.includes(a));
        if (filtered.length === 0) {
          // Whitelist couldn't match — john leaves dissatisfied. No encounter persisted,
          // no pay, no stamina drain. Light mood/notoriety blip from declining work.
          return null;
        }
        acts = filtered;
      }
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
    const cumRatio = Math.min(1, (girl.body?.cumLoad || 0) / ((window.DMTHGame.cumtool && window.DMTHGame.cumtool.effectiveCap ? window.DMTHGame.cumtool.effectiveCap(girl.body) : (girl.body?.cumLoadCap || 10)) || 10));
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
      // NPCDIRECT-PAID.1 — a directed encounter applies the COMMONALITY-ENGINE-matched action's stat
      // spec (so "face fuck her" → extreme-facefuck deltas) instead of the john's default act.
      window.DMTHGame.actionEffects.applyAction(girl.id, opts.forcedActionId || arc.johnActionId, { strain });
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
      npc,                                    // NPCDIRECT-PAID.1 — exposed so a gangbang/scene can voice the actual man
      directed: !!opts.directiveNote,         // NPCDIRECT-PAID.1 — flags a player-directed history event
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
      notes: `${arc.displayName} — ${arc.dialogueTone}. Acts: ${acts.join(', ')}.${condomUsed ? ' [condom used]' : ' [no condom]'}${opts.directiveNote ? ` [directed: ${opts.directiveNote}]` : ''}`,
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
    // A KILL is an EPIC WIN for him (Gee) — he ALWAYS leaves loot + tips bigger when she dies on him.
    if (window.DMTHGame.loot && window.DMTHGame.loot.grantNpcGift) {
      if (johnKillBonus > 0) {
        window.DMTHGame.loot.grantNpcGift({ from: npc ? npc.handle : arc.displayName, generous: true, kill: true, girlId: girl.id });
      } else if (!isPostmortem && Math.random() < (0.05 + (arc.intensity || 0) * 0.02)) {
        window.DMTHGame.loot.grantNpcGift({ from: npc ? npc.handle : arc.displayName, generous: (arc.tipChance || 0) > 0.4, girlId: girl.id });
      }
    }

    window.DMTHGame.state.updateGirl(girl.id, { whoreOut: newWo });
    // GIRLHIST.1/.2 — log the john into her LIVE activity history (+ the cash he paid, itemized).
    if (window.DMTHGame.state.appendActivity) {
      window.DMTHGame.state.appendActivity(girl.id, { kind: 'john', label: (npc ? npc.handle : arc.displayName), detail: `${acts.join(', ')} · +$${totalPaid}${condomUsed ? ' · 🎈' : ''}` });
    }
    return encounter;
  }

  // FRIENDS.1/.2 — resolve a "friend" visit: the friend's EXTREME act + a direct near-kill
  // health drop (~40-60), a fortune in pay, logged to her ledger + a friendVisits counter so the
  // death-dossier / trophy reflects how hard she was used. Alive captives only.
  // `opts` (NPCDIRECT-PAID.1) — "same for friends": a directed friend reuses opts.npc, records the
  // forced act tags (opts.forcedActs) + the raw directive (opts.directiveNote) into her history event,
  // and otherwise resolves exactly like a normal extreme friend visit (near-kill, fortune, can corpse).
  function resolveFriendEncounter(girl, friendId, opts = {}) {
    const arc = window.DMTHJohnArchetypes.FRIEND_ARCHETYPES[friendId];
    if (!arc || girl.encounterState === 'dead') return null;
    // NPC-IDENT.1 — mint the friend an identity (title + name) for chat memory + multi-party scenes.
    // NPCDIRECT-PAID.1 — reuse the passed identity so a directed friend is the SAME man from the scene.
    const npc = opts.npc || (window.DMTHJohnArchetypes.mintNpcIdentity ? window.DMTHJohnArchetypes.mintNpcIdentity(friendId, { isFriend: true }) : null);

    // FRIENDCREEP.1 — his current creep level 0-10 scales how hard he hits, how much he pays, and how
    // good/plentiful his loot is. A maxed L10 creep is a guaranteed kill on a girl under 60% health.
    const creep = (window.DMTHGame.state.getFriendCreep ? window.DMTHGame.state.getFriendCreep(friendId).level : 0) || 0;

    // FRIENDKINK.1 — his unique kink/dislike vs THIS girl's traits swings his pay + loot, and a
    // bigot may flat-out REFUSE her (Gee: don't put a racist friend on a girl he despises). Refusal
    // aborts the visit entirely — no act, no pay, no creep — with a notify so the player learns.
    const match = window.DMTHJohnArchetypes.friendMatch
      ? window.DMTHJohnArchetypes.friendMatch(friendId, girl) : { payMult: 1.0, lootDelta: 0, refused: false, reason: '' };
    if (match.refused) {
      if (window.DMTHNotify) window.DMTHNotify.show(`🚫 ${arc.displayName} took one look at ${girl.name} and walked — ${match.reason || 'she\'s not his type'}.`, { type: 'warn', durationMs: 5000 });
      return null;
    }

    const moodBefore = girl.mood?.mood || 'neutral';
    const bondXPBefore = girl.bond?.bondXP || 0;
    const bondDebtBefore = girl.bond?.bondDebt || 0;

    // Her health the MOMENT the friend arrives — the kill gate AND the per-visit damage cap are
    // both measured from this. So a girl already low (e.g. ~20%) servicing a friend is near-certain
    // to come back a corpse; a healthy one survives, wrecked but capped (Gee).
    const startHealth = (window.DMTHGame.state.getGirl(girl.id)?.body?.health) ?? 100;

    // The friend's extreme act — credited to johns (byJohn) so the PLAYER isn't paid/leveled for it.
    if (window.DMTHGame.actionEffects?.applyAction) {
      try { window.DMTHGame.actionEffects.applyAction(girl.id, arc.johnActionId, { byJohn: true, strain: true }); } catch (e) { /* non-fatal */ }
    }

    // FRIENDCREEP.1 — base drop scaled by creep level (L0 ×1 → L10 ×1.8): higher creep does MORE damage.
    let drop = arc.healthDrop[0] + Math.floor(Math.random() * (arc.healthDrop[1] - arc.healthDrop[0] + 1));
    drop = Math.round(drop * (1 + creep * 0.08));

    // FRIENDKILL.1 gate (Gee) — LETHAL when her ARRIVAL health is not greater than his intended damage
    // (drop >= startHealth). A girl at ~20% servicing a friend is almost certainly a corpse; a healthy
    // girl just gets wrecked. FRIENDCREEP.1 — a MAXED L10 creep is a GUARANTEED kill on any girl under
    // 60% of her max health (Gee: "a maxed out 10 creep should kill any girl under 60% health garanteed").
    const maxH = (window.DMTHGame.actionEffects && window.DMTHGame.actionEffects.maxHealthFor) ? window.DMTHGame.actionEffects.maxHealthFor(girl) : 100;
    const killed = drop >= startHealth || (creep >= 10 && startHealth < maxH * 0.6);
    let snuffBonus = 0;
    let newHealth = startHealth;
    let chamberToyName = null;
    let chamberPremium = 0;
    if (killed) {
      const k = window.DMTHGame.lifespan.killDuringAct(girl.id, {
        cause: 'friend-kill:' + friendId, corpse: arc.corpse || 'bled-out',
        byLabel: arc.displayName, baseBonus: 700
      });
      snuffBonus = (k && k.snuffBonus) || 0;
      newHealth = 0;
    } else {
      // FRIENDTOY.1 (Gee correction) — a friend can only use a toy ALREADY MOUNTED in THIS girl's
      // hold (no bring-your-own, no cross-hold/dungeon). If the hold has toys he'll most likely grab
      // one — favouring his signature `chamberToy` if it happens to be mounted, else a random mounted
      // one — and use it on her (byJohn, hold-gated, same as a john). Its negatives land on her; the
      // health hit is folded into the ≤50-HP visit cap below.
      const mounted = window.DMTHGame.toys?.holdToys ? window.DMTHGame.toys.holdToys(girl) : [];
      if (mounted.length && window.DMTHGame.toys?.use) {
        const pick = (arc.chamberToy && mounted.includes(arc.chamberToy)) ? arc.chamberToy : mounted[Math.floor(Math.random() * mounted.length)];
        try {
          const tr = window.DMTHGame.toys.use(pick, girl.id, { byJohn: true });
          if (tr && tr.ok) { chamberToyName = (window.DMTHGame.toys.TOYS?.[pick]?.name) || pick; chamberPremium = 150; }
        } catch (e) { /* non-fatal */ }
      }
      // Gee: NO single friend takes more than ~50% from one girl in one visit, no matter how many
      // random acts + the chamber toy he piles on. The friend's WHOLE-visit health damage is capped
      // at 50 HP (and at least 1 HP, never to 0 — that's the lethal path) — recomputed from her
      // arrival health, OVERRIDING whatever applyAction + the toy independently subtracted.
      // FRIENDACTS.1 cap (≤50 HP/visit) raised by creep (L10 → up to 80) — higher creep hits harder.
      const loss = Math.min(50 + creep * 3, Math.max(1, drop), startHealth - 1);
      newHealth = Math.max(1, startHealth - loss);
      const g1 = window.DMTHGame.state.getGirl(girl.id) || girl;
      const body = { ...(g1.body || {}), health: newHealth, bruises: (g1.body?.bruises || 0) + (arc.bruisesAdded || 0), recentActTag: 'beaten' };
      if (window.DMTHGame.gameClock) body.recentActAt = window.DMTHGame.gameClock.now();
      window.DMTHGame.state.updateGirl(girl.id, { body });
    }

    // FRIENDCUMWAD.1 (Gee: "a frinde have a much large cum wad for cum fill than normal johns") —
    // a friend busts a MUCH bigger load than a john (~3.5 vs a john's ~1.2), and never gloves up,
    // so it floods her raw: heavy vaginal cum-fill toward breeding + a cum-load bump. Alive girls only.
    const FRIEND_CUM_WAD = 3.5;
    if (!killed) {
      if (window.DMTHGame.pregnancy?.addVaginalCum) {
        try { window.DMTHGame.pregnancy.addVaginalCum(girl.id, FRIEND_CUM_WAD, { conceptionSource: 'friend:' + friendId }); } catch (e) { /* non-fatal */ }
      }
      const gC = window.DMTHGame.state.getGirl(girl.id);
      if (gC && gC.body) {
        const cap = (window.DMTHGame.cumtool && window.DMTHGame.cumtool.effectiveCap) ? window.DMTHGame.cumtool.effectiveCap(gC.body) : (gC.body.cumLoadCap ?? 10);
        window.DMTHGame.state.updateGirl(girl.id, { body: { ...gC.body, cumLoad: Math.min(cap, (gC.body.cumLoad || 0) + FRIEND_CUM_WAD) } });
      }
    }

    const refreshed = window.DMTHGame.state.getGirl(girl.id) || girl;
    // Gee — a friend does a WIDE RANGE of random act types per visit (he's not one-note). Roll a
    // varied 2-4 act subset from his + a shared depraved pool. (Damage is still capped above, so
    // "more acts" reads as variety in the ledger, never extra health loss.)
    const FRIEND_ACT_POOL = ['sex-rough', 'anal', 'choke', 'humiliation', 'spit', 'slap', 'hair-pull', 'degrade', 'piss', 'bukkake', 'pain', 'gag'];
    const actPool = [...new Set([...(arc.permittedActsPreference || []), ...FRIEND_ACT_POOL])];
    const nActs = 2 + Math.floor(Math.random() * 3);   // 2-4 random acts
    const actTags = [];
    for (let i = 0; i < nActs && actPool.length; i++) {
      actTags.push(actPool.splice(Math.floor(Math.random() * actPool.length), 1)[0]);
    }
    actTags.push(killed ? 'snuff' : 'friend-extreme');
    if (chamberToyName) actTags.push('chamber-toy');
    // NPCDIRECT-PAID.1 — a directed friend records the player's order (verbatim) + matched action up front.
    if (opts.forcedActs && opts.forcedActs.length) actTags.unshift(...opts.forcedActs);
    const basePay = arc.payRange[0] + Math.floor(Math.random() * (arc.payRange[1] - arc.payRange[0]));
    const sat = window.DMTHGame.state.getSatisfaction ? window.DMTHGame.state.getSatisfaction() : 50;
    // SNUFFBONUS.1 snuff bonus + FRIENDTOY.1 chamber-toy premium both fold into his payout.
    // FRIENDCREEP.1 — higher creep PAYS MORE (L0 ×1 → L10 ×2). FRIENDKINK.1 — his kink/dislike vs
    // this girl swings it further (premium for a fetish-match, scraps for one he's bigoted against).
    // FRIENDLOOT.1 (Gee) — a friend ALWAYS pays cash at a minimum (a floor of $40), even a bigoted
    // kink-mismatch or a cheap visit; a kill stacks the snuff bonus on top.
    const payment = Math.max(40, Math.round(basePay * (1 + ((sat - 50) / 50) * 0.12) * (1 + creep * 0.1) * match.payMult)) + snuffBonus + chamberPremium;

    const encounter = {
      id: 'frnd_' + Date.now().toString(36) + '_' + Math.floor(Math.random() * 0xffff).toString(36),
      ts: Date.now(),
      isFriend: true,
      johnArchetype: friendId,
      johnDescription: 'FRIEND — ' + arc.displayName,
      johnName: npc ? npc.name : null,            // NPC-IDENT.1 — name she can reference in chat
      johnHandle: npc ? npc.handle : arc.displayName,
      npc,                                        // NPCDIRECT-PAID.1 — exposed so a scene can voice the actual friend
      directed: !!opts.directiveNote,             // NPCDIRECT-PAID.1 — flags a player-directed history event
      acts: actTags,
      duration_min: 30 + Math.floor(Math.random() * 30),
      payment, tip: 0, johnExtraPay: 0, totalPaid: payment,
      condomUsed: false,
      girlMoodBefore: moodBefore,
      girlMoodAfter: refreshed.mood?.mood || moodBefore,
      bondDeltaApplied: (refreshed.bond?.bondXP || 0) - bondXPBefore,
      bondDebtAdded: (refreshed.bond?.bondDebt || 0) - bondDebtBefore,
      bruisesAdded: arc.bruisesAdded || 0,
      cumLoadAdded: killed ? 0 : FRIEND_CUM_WAD,   // FRIENDCUMWAD.1 — friends bust a big raw load
      // healthDropped — on a kill she dropped her whole arrival health; otherwise the rolled drop.
      // (Was a latent ReferenceError: `curHealth` never existed; a friend KILL would throw here.)
      healthDropped: killed ? startHealth : drop,
      killed, snuffBonus,
      staminaDrained: 0,
      notes: (killed
        ? `FRIEND ${arc.displayName} KILLED her — ${arc.killLine || arc.ability}. Snuff content +$${snuffBonus}. ${arc.dialogueTone}.`
        : `FRIEND ${arc.displayName} — ${arc.ability}. Health −${drop}. ${arc.dialogueTone}.`)
        + (opts.directiveNote ? ` [directed: ${opts.directiveNote}]` : ''),
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
    // FRIENDGIFT.1 + FRIENDCREEP.1 — friends always leave loot; higher creep drops BETTER + MORE of it
    // (generous gift + one extra per ~3 creep levels, L10 ≈ 4 drops). A KILL is an epic win on top.
    if (window.DMTHGame.loot && window.DMTHGame.loot.grantNpcGift) {
      // FRIENDKINK.1 + FRIENDLOOT.1 (Gee) — friends ALMOST ALWAYS leave loot: floor at 1 drop even
      // on a kink-mismatch (kink-match still drops MORE). A MURDER guarantees GOOD loot — the i===0
      // drop fires grantNpcGift{kill} (tier-5 best haul).
      const drops = Math.max(1, 1 + Math.floor(creep / 3) + (match.lootDelta || 0));
      for (let i = 0; i < drops; i++) {
        window.DMTHGame.loot.grantNpcGift({ from: (npc ? npc.handle : arc.displayName), generous: true, kill: killed && i === 0, girlId: girl.id });
      }
    }
    // FRIENDCREEP.1 — a successful visit advances his creep level (triangular). Higher creep = he
    // returns harder, pays more, drops better loot, and at L10 guarantees a kill under 60% health.
    const creepAfter = window.DMTHGame.state.noteFriendCreepSuccess
      ? window.DMTHGame.state.noteFriendCreepSuccess(friendId) : { level: creep, leveled: false };
    if (creepAfter.leveled && window.DMTHNotify) {
      window.DMTHNotify.show(`😈 ${arc.displayName} is now CREEP ${creepAfter.level}/10 — hits harder, pays more, better loot${creepAfter.level >= 10 ? ', GUARANTEED kill under 60% HP' : ''}.`, { type: 'info', durationMs: 5000 });
    }
    // GIRLHIST.1/.2 — log the friend visit into her LIVE activity history (with his creep level).
    if (window.DMTHGame.state.appendActivity) {
      window.DMTHGame.state.appendActivity(girl.id, { kind: 'friend', label: `FRIEND — ${arc.displayName} (creep ${creepAfter.level}/10)`, detail: `${killed ? 'KILLED her' : `wrecked her −${drop} HP`} · +$${payment}${match.reason ? ` · ${match.payMult >= 1 ? '😍' : '🤢'} ${match.reason}` : ''}` });
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
    // GANGSCALE.1 (Gee) — a bigger dungeon + more girls held throws a BIGGER gangbang. The crowd
    // ceiling scales with the active dungeon's hold count + total captives, so a fledgling
    // hole-in-the-wall draws a few johns while a full operation packs the room.
    const dungeon = window.DMTHGame.state.getDungeon(girl0.assignedDungeonId);
    const holdCount = dungeon?.holds?.length || 1;
    const captives = (window.DMTHGame.state.current?.roster || []).filter(g => g.encounterState === 'captive').length;
    const scaledMax = Math.max(2, Math.min(10, 2 + Math.floor(holdCount / 2) + Math.floor(captives / 3)));
    const count = Math.max(2, Math.min(scaledMax, n || scaledMax));
    const encs = [];
    for (let i = 0; i < count; i++) {
      const enc = tryArrival(window.DMTHGame.state.getGirl(girlId));
      if (enc) encs.push(enc); else break;
    }
    let gross = encs.reduce((t, e) => t + (e.totalPaid || 0), 0);
    // GANGSCALE.1 — a bigger gangbang = better satisfaction (the crowd is the thrill). Scales
    // with how many johns actually took her this session.
    if (encs.length >= 2 && window.DMTHGame.state.addSatisfaction) {
      window.DMTHGame.state.addSatisfaction(Math.min(20, encs.length * 2.5), 'gangbang-scale');
    }

    // GANGBUKKAKE.1 — a gangbang ends in a stacked bukkake / cum-fill finale: every john empties
    // onto/into her at once. Floods her cum-load toward her cap, stamps the bukkake aftermath so
    // her next image renders her glazed, and pays a premium that scales with the crowd size.
    let bukkake = null;
    const gAfter = window.DMTHGame.state.getGirl(girlId);
    if (encs.length >= 2 && gAfter && gAfter.encounterState === 'captive') {
      const cap = (window.DMTHGame.cumtool && window.DMTHGame.cumtool.effectiveCap) ? window.DMTHGame.cumtool.effectiveCap(gAfter.body) : (gAfter.body?.cumLoadCap ?? 10);
      const body = { ...gAfter.body };
      body.cumLoad = Math.min(cap, (body.cumLoad || 0) + encs.length * 0.6);
      body.recentActTag = 'bukkake';
      if (window.DMTHGame.gameClock) body.recentActAt = window.DMTHGame.gameClock.now();
      const bukkakePay = encs.length * 45;
      const wo = getWhoreOut(gAfter);
      window.DMTHGame.state.updateGirl(girlId, {
        body,
        whoreOut: { ...wo, unclaimedEarnings: (wo.unclaimedEarnings || 0) + bukkakePay }
      });
      gross += bukkakePay;
      bukkake = { pay: bukkakePay, count: encs.length };
    }

    if (window.DMTHNotify) {
      window.DMTHNotify.show(`💦 Gangbang on ${girl0.name}: ${encs.length} john${encs.length === 1 ? '' : 's'} took turns${bukkake ? ` and finished in a bukkake — glazed, dripping, cum-filled (+$${bukkake.pay})` : ''} — $${gross}.`, { type: encs.length ? 'success' : 'info', durationMs: 6500 });
    }
    // GANGSEL / GANGVOICE — expose the ACTUAL men who took her this session so the room can voice
    // the real participants (each named NPC speaks in his own voice) instead of inventing a crowd.
    const npcs = encs.map(e => e.npc).filter(Boolean);
    return { ok: true, count: encs.length, gross, bukkake, npcs };
  }

  // NPCDIRECT-PAID.1 (Gee: a directed NPC "needs to do that action and have that action be paid for
  // when done with its stat changes take effect on the girl and into her history as an event" +
  // "same for friends"). The player types a directive at a NAMED man in a voiced scene; this resolves
  // it as a REAL encounter — he performs the act, gets paid, her stats shift, it logs to her ledger.
  // The COMMONALITY-ENGINE syncs the free-typed directive to the closest existing action for its spec.
  function resolveDirectedEncounter(girlId, opts = {}) {
    const girl = window.DMTHGame.state.getGirl(girlId);
    if (!girl) return { ok: false, reason: 'no such girl' };
    const npc = opts.npc;
    const directive = String(opts.directive || '').trim();
    if (!npc || !npc.archetype) return { ok: false, reason: 'no NPC to direct' };
    if (!directive) return { ok: false, reason: 'type what to make him do' };
    // Sync the directive to the closest existing action so it inherits real stat modifiers.
    const match = (window.DMTHGame.actionEffects && window.DMTHGame.actionEffects.matchDirectedAction)
      ? window.DMTHGame.actionEffects.matchDirectedAction(directive) : null;
    const forcedActionId = match ? match.actionId : null;
    // Both the verbatim directive AND the matched action land in her history event.
    const forcedActs = [`directed:${directive}`].concat(forcedActionId ? [forcedActionId] : []);
    const encounter = npc.isFriend
      ? resolveFriendEncounter(girl, npc.archetype, { npc, forcedActs, directiveNote: directive })
      : resolveEncounter(girl, npc.archetype, { npc, forcedActs, forcedActionId, directiveNote: directive });
    if (!encounter) return { ok: false, reason: 'he balked — nothing happened' };
    return { ok: true, encounter, match, killed: !!encounter.killed, paid: encounter.totalPaid || encounter.payment || 0 };
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
    // GIRLHIST.2 — itemized cash she made, into her LIVE activity history.
    if (window.DMTHGame.state.appendActivity) {
      window.DMTHGame.state.appendActivity(girlId, { kind: 'cash', label: `cashed out $${amount.toLocaleString()}`, detail: 'whore-out earnings → treasury' });
    }
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
    resolveDirectedEncounter,
    runJohnTick,
    cashout,
    summarizeLedger,
    contextBlockText,
    buzzMultiplier,
    expectedArrivalsPerTick,
    gameMinutesToNextArrival
  });
})();
