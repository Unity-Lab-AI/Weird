// DUNGEON MASTER: THE HUNT — multi-stage capture engine.
// Replaces the prior single-tool-single-roll capture model with a 4-stage progress-bar
// attempt sequence (Approach → Engage → Subdue → Secure) where each stage has its own
// 0-100% progress meter driven by the selected tool's per-stage stats vs the girl-archetype's
// per-stage resistance. Tools become stage-specific (rohypnol fills Engage; duct-tape fills
// Secure; pipe spans Approach+Subdue; ketamine is heavy Subdue). Spam dies as a play pattern
// because mashing one tool advances ONE meter — the other three stages still need their own
// qualifying tool to clear.

(function () {
  'use strict';

  const STAGES = ['approach', 'engage', 'subdue', 'secure'];
  const STAGE_LABELS = {
    approach: '🔍 Approach',
    engage:   '✋ Engage',
    subdue:   '💤 Subdue',
    secure:   '⛓️ Secure'
  };
  const STAGE_DESCRIPTIONS = {
    approach: 'Close distance, stealth, set up the action',
    engage:   'Apply the active subduing tool — social, chemical, or grapple-distance',
    subdue:   'Wear her down until incapacitated — per-tick subdue rate',
    secure:   'Bind and restrain so transport is possible'
  };

  // Stage-clear threshold — stages clear at this progress % or above.
  const STAGE_CLEAR_THRESHOLD = 60;

  // Default stage stats / resistance when an item or archetype is missing the field.
  const DEFAULT_TOOL_STAGES = { approach: 0, engage: 0, subdue: 0, secure: 0 };
  const DEFAULT_RESISTANCE  = { approach: 25, engage: 25, subdue: 25, secure: 25 };

  // Single-use tools (consumed per-stage they're activated in). Multi-use tools (pipe,
  // handcuffs, shackles, harness) survive the attempt. Cross-referenced against catalog
  // so adding new tools doesn't break the consumption logic.
  const SINGLE_USE_TOOLS = new Set([
    'rohypnol', 'chloroform', 'ether', 'ketamine', 'tranquilizer',
    'duct-tape', 'rope', 'zip-ties'
  ]);

  // Canonical list of capture-loop tools. UI dropdowns filter inventory against this.
  // Tranquilizer (Subdue 50 single-use, mirrors ketamine in the capture
  // path; distinct behavior only in the in-dungeon administered drug path via drug-scheduler).
  const CAPTURE_TOOL_IDS = [
    'pipe', 'rohypnol', 'chloroform', 'ether', 'ketamine', 'tranquilizer',
    'duct-tape', 'rope', 'zip-ties', 'handcuffs', 'shackles', 'harness'
  ];

  // --- Lookups ---

  function getToolStages(toolId) {
    if (!toolId) return DEFAULT_TOOL_STAGES;
    const item = window.DMTHAssets.getById('item', toolId);
    return item?.captureStages || DEFAULT_TOOL_STAGES;
  }

  function getArchetypeResistance(archetypeId) {
    const reg = window.DMTHGame.hunt.ARCHETYPE_CAPTURE_RESISTANCE;
    return reg?.[archetypeId] || DEFAULT_RESISTANCE;
  }

  // Tools in player inventory that have non-zero stat for the given stage.
  function eligibleToolsForStage(stageKey) {
    const inv = window.DMTHGame.state.current.inventory || {};
    return CAPTURE_TOOL_IDS.filter(id => {
      if (!inv[id] || inv[id] < 1) return false;
      const stages = getToolStages(id);
      return (stages[stageKey] || 0) > 0;
    });
  }

  // Player skill scales with notoriety (experience proxy) — same as existing previewCaptureOdds
  // notorietyBonus pattern. 0-30 cap so player skill never dominates the math.
  function getPlayerSkill() {
    const notoriety = window.DMTHGame.state.current?.wallet?.notoriety || 0;
    return Math.min(30, Math.round(notoriety * 0.4));
  }

  // Witness roll fires ONCE per attempt (before the first stage). Higher exposure +
  // higher location suspicion = more likely. Witness flag carries through every stage
  // as a flat -30 progress penalty (makes the attempt much harder once spotted).
  function rollWitness({ locationId }) {
    const exposure = window.DMTHGame.hunt.LOCATION_EXPOSURE?.[locationId] || 0;
    const suspicion = window.DMTHGame.state.current?.wallet?.suspicionByLocation?.[locationId] || 0;
    const chance = Math.max(0, Math.min(0.6, exposure + suspicion * 0.04));
    return Math.random() < chance;
  }

  // Per-stage resolution math:
  //   stageProgress = toolStageBonus * 2 + playerSkill - resistance - locDifficulty
  //                 - witnessPenalty + RNG
  // Where:
  //   toolStageBonus: 0-50 (tool's stat for this stage). Doubled → 0-100 contribution.
  //   playerSkill:    0-30 (notoriety experience).
  //   resistance:     0-50 (archetype's stage resistance).
  //   locDifficulty:  exposure proxy * 100, 0-20 typical.
  //   witnessPenalty: 30 flat if witness present, 0 otherwise.
  //   RNG:            -5 to +15 (slight upward bias to keep play forgiving).
  // Clamped to 0-100. Stage clears at progress >= STAGE_CLEAR_THRESHOLD (60%).
  function resolveStage({ stageKey, toolId, girl, locationId, playerSkill, witness }) {
    if (!toolId) {
      return {
        stageKey,
        toolId: null,
        toolBonus: 0,
        resistance: getArchetypeResistance(girl.archetypeTemplate)[stageKey] || 0,
        progress: 0,
        cleared: false,
        reason: 'no tool assigned for this stage'
      };
    }
    const stages = getToolStages(toolId);
    const toolBonus = stages[stageKey] || 0;
    const resistance = getArchetypeResistance(girl.archetypeTemplate)[stageKey] || 25;
    const exposure = window.DMTHGame.hunt.LOCATION_EXPOSURE?.[locationId] || 0;
    const locDifficulty = exposure * 100;
    const witnessPenalty = witness ? 30 : 0;
    const rng = Math.random() * 20 - 5;
    const raw = toolBonus * 2 + (playerSkill || 0) - resistance - locDifficulty + rng - witnessPenalty;
    const progress = Math.max(0, Math.min(100, Math.round(raw)));
    const cleared = progress >= STAGE_CLEAR_THRESHOLD;
    return {
      stageKey,
      toolId,
      toolBonus,
      resistance,
      progress,
      cleared,
      reason: cleared
        ? null
        : `tool too weak for stage (progress ${progress}%, needed ${STAGE_CLEAR_THRESHOLD}%, resistance ${resistance}${witness ? ', witness present' : ''})`
    };
  }

  // Run the full 4-stage attempt. `toolPerStage` is `{ approach, engage, subdue, secure }`
  // mapping stage key → tool ID (or null/undefined for unassigned stages).
  //
  // Returns:
  //   {
  //     outcome:       'success' | 'failed',
  //     stages:        [{ stageKey, toolId, toolBonus, resistance, progress, cleared, reason }],
  //     failedAtStage: stageKey | null,
  //     witness:       bool,
  //     playerSkill:   number,
  //     consumed:      [{ toolId, count }],
  //     consequences:  { suspicionDelta, notorietyDelta, warinessDelta }
  //   }
  //
  // Side effects on failure: bumps location suspicion + adds wariness flag to girl + adds
  // notoriety if a witness saw it. Side effects on success: per-stage single-use tool
  // consumption only (escortToHold + capture-flow narrative handled by caller).
  function runAttempt({ girl, toolPerStage, locationId }) {
    const playerSkill = getPlayerSkill();
    const witness = rollWitness({ locationId });

    // Pre-validate every assigned single-use tool against
    // inventory BEFORE resolution math fires. Guards against UI-engine desync race
    // (state mutated between render and attempt-fire). For non-single-use tools the
    // engine relies on UI eligibleToolsForStage filtering, which is render-time-only.
    const inv = window.DMTHGame.state.current?.inventory || {};
    const required = {};
    for (const stageKey of STAGES) {
      const tid = toolPerStage?.[stageKey];
      if (tid && SINGLE_USE_TOOLS.has(tid)) {
        required[tid] = (required[tid] || 0) + 1;
      }
    }
    for (const [tid, count] of Object.entries(required)) {
      if ((inv[tid] || 0) < count) {
        return {
          outcome: 'failed',
          failedAtStage: STAGES.find(s => toolPerStage?.[s] === tid) || 'approach',
          witness: false,
          playerSkill,
          stages: [],
          consumed: [],
          consequences: { suspicionDelta: 0, notorietyDelta: 0, warinessDelta: 0 },
          reason: `inventory desync — need ${count}× ${tid} but only ${inv[tid] || 0} in inventory`
        };
      }
    }

    const stages = [];
    let failedAtStage = null;

    for (const stageKey of STAGES) {
      const toolId = toolPerStage?.[stageKey];
      const result = resolveStage({ stageKey, toolId, girl, locationId, playerSkill, witness });
      stages.push(result);
      if (!result.cleared) {
        failedAtStage = result.stageKey;
        break;   // stop running stages once one fails — girl escapes
      }
    }

    // Per-stage single-use inventory consumption. Reusable tools (pipe / handcuffs /
    // shackles / harness) survive. Only stages that actually executed consume their tool.
    const consumed = [];
    const consumeCounts = {};
    for (const stage of stages) {
      if (!stage.toolId || !SINGLE_USE_TOOLS.has(stage.toolId)) continue;
      consumeCounts[stage.toolId] = (consumeCounts[stage.toolId] || 0) + 1;
    }
    for (const [toolId, count] of Object.entries(consumeCounts)) {
      const ok = window.DMTHGame.state.consumeItem(toolId, count);
      if (ok) consumed.push({ toolId, count });
    }

    const outcome = failedAtStage ? 'failed' : 'success';
    const s = window.DMTHGame.state.current;
    const consequences = { suspicionDelta: 0, notorietyDelta: 0, warinessDelta: 0 };

    if (outcome === 'failed') {
      const sus = s.wallet.suspicionByLocation[locationId] || 0;
      let susBump = 2;
      if (witness) {
        susBump = 5;
        consequences.notorietyDelta = 2;
        window.DMTHGame.state.addNotoriety(2);
      }
      consequences.suspicionDelta = susBump;
      s.wallet.suspicionByLocation[locationId] = sus + susBump;
      consequences.warinessDelta = 1;
      girl.wariness = (girl.wariness || 0) + 1;
    }

    return {
      outcome,
      stages,
      failedAtStage,
      witness,
      playerSkill,
      consumed,
      consequences
    };
  }

  // --- Simple single-tool capture path ---
  //
  // Pick one item, click, roll vs a flat per-tool success chance. 50% for cheapest
  // tools, scaling up to 100% guaranteed for the heaviest sedatives. No per-stage
  // dropdowns, no resistance math, no witness penalty stack — just one die roll.
  //
  // Tools NOT in this table can't be used to capture. The shop sells everything
  // here under "Hunting tools".
  const SIMPLE_CAPTURE_CHANCE = Object.freeze({
    'duct-tape':    0.50,
    'zip-ties':     0.55,
    'rope':         0.55,
    'pipe':         0.60,
    'handcuffs':    0.70,
    'shackles':     0.75,
    'harness':      0.80,
    'rohypnol':     0.85,
    'chloroform':   0.90,
    'tranquilizer': 0.95,
    'ether':        0.95,
    'ketamine':     1.00
  });

  function getSimpleCaptureChance(toolId) {
    return SIMPLE_CAPTURE_CHANCE[toolId] || 0;
  }

  function eligibleSimpleTools() {
    const inv = window.DMTHGame.state.current?.inventory || {};
    return Object.entries(SIMPLE_CAPTURE_CHANCE)
      .filter(([id]) => (inv[id] || 0) > 0)
      .map(([id, chance]) => ({ id, chance, owned: inv[id] }))
      .sort((a, b) => a.chance - b.chance);
  }

  // --- DESPERATION model (REVERSES the old tightening escalation) ---
  //
  // the grab must NOT be the boring stuck part — no endless missing, no getting stuck. Each
  // failed grab makes the PLAYER more desperate and the NEXT attempt EASIER (an additive bonus),
  // so two misses in a row means the third grab is basically a guaranteed win. She no longer
  // "escapes" from repeated attempts — you always run her down, it just takes a beat or two.
  //
  //   tier 0 (steady)     — no bonus, first move
  //   tier 1 (rattled)    — +0.22 after 1 miss
  //   tier 2 (desperate)  — +0.45 after 2 misses → even a 50% tool ≈ 95% on the 3rd grab
  //   tier 3+ (frenzied)  — +0.90 → effectively guaranteed
  const DESPERATION_BONUS  = [0, 0.22, 0.45, 0.90, 0.90];
  const DESPERATION_LABELS = ['steady', 'rattled', 'desperate', 'frenzied', 'frenzied'];
  const DESPERATION_NARRATION = [
    null,
    "the miss makes you reckless — you close back in, hungrier, harder for her to shake",
    "you're past caring who sees now — desperate, grabbing, and she's running out of room",
    "you're frenzied, all teeth and grip — there's no getting away from you now",
    "you're frenzied, all teeth and grip — there's no getting away from you now"
  ];
  const DESP_MAX_TIER = DESPERATION_BONUS.length - 1;

  function desperationBonus(tier) { return DESPERATION_BONUS[Math.min(tier || 0, DESP_MAX_TIER)] || 0; }
  function desperationLabel(tier) { return DESPERATION_LABELS[Math.min(tier || 0, DESP_MAX_TIER)] || 'frenzied'; }
  function desperationNarration(tier) { return DESPERATION_NARRATION[Math.min(tier || 0, DESP_MAX_TIER)]; }

  // per-tool debuff applied to the girl AT the grab. the COMBINED effects of
  // every drug/tool/equipment you used (consciousness, mood, health, etc.) debuff her starting
  // captive stats in TOTALITY — a rohi + pipe + cuffs grab leaves her bruised, dazed, sedated and
  // bound at the start of captivity. Blunt tools do real health damage + bruises; chemicals leave
  // her groggy/sedated (high↑ = doped, mood↓, stamina↓); restraints suppress escape-risk + small
  // marks. Health floors at 1 — a grab never insta-kills. Healing is the rest/heal/feed/love loop.
  const CAPTURE_INJURY = Object.freeze({
    pipe:         { health: -25, bruises: 6, mood: -8, stamina: -10, tag: 'beaten' },
    handcuffs:    { health: -2,  bruises: 2, escapeRisk: -0.10 },
    shackles:     { health: -3,  bruises: 2, escapeRisk: -0.14 },
    'zip-ties':   { health: -2,  bruises: 1, escapeRisk: -0.08 },
    rope:         { health: -1,  bruises: 1, escapeRisk: -0.06 },
    'duct-tape':  { health: -1,  bruises: 1, escapeRisk: -0.05 },
    harness:      { health: -2,  bruises: 1, escapeRisk: -0.10 },
    rohypnol:     { health: -4,  bruises: 0, mood: -6,  high: 35, stamina: -25, escapeRisk: -0.12 },
    chloroform:   { health: -5,  bruises: 0, mood: -8,  high: 45, stamina: -35, escapeRisk: -0.18 },
    ether:        { health: -5,  bruises: 0, mood: -8,  high: 45, stamina: -35, escapeRisk: -0.18 },
    ketamine:     { health: -6,  bruises: 0, mood: -10, high: 50, stamina: -40, escapeRisk: -0.20 },
    tranquilizer: { health: -4,  bruises: 0, mood: -6,  high: 55, stamina: -45, escapeRisk: -0.22 }
  });

  // Apply the COMBINED debuff from EVERY tool in the loadout (summed + clamped) to the fresh
  // captive — the "in totality" debuff on first capture. Mutates girl.body in place (caller
  // escorts her right after, so the debuffed stats persist into her starting captive state).
  function applyCaptureDebuffs(girl, toolIds) {
    if (!girl.body) return;
    const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
    let tag = null;
    for (const id of (toolIds || [])) {
      const inj = CAPTURE_INJURY[id];
      if (!inj) continue;
      girl.body.health  = Math.max(1, (girl.body.health ?? 100) + (inj.health || 0));
      girl.body.bruises = Math.min(99, (girl.body.bruises ?? 0) + (inj.bruises || 0));
      if (inj.high)    girl.body.high    = clamp((girl.body.high ?? 0) + inj.high, 0, 100);
      if (inj.stamina) girl.body.stamina = clamp((girl.body.stamina ?? 70) + inj.stamina, 0, girl.body.health);
      if (inj.mood && girl.mood) girl.mood.moodPressure = clamp((girl.mood.moodPressure || 0) + inj.mood, -60, 60);
      if (inj.escapeRisk && girl.escape) girl.escape.currentRisk = clamp((girl.escape.currentRisk ?? 0.1) + inj.escapeRisk, 0, 1);
      if (inj.tag) tag = inj.tag;
    }
    if (tag) {
      girl.body.recentActTag = tag;
      if (window.DMTHGame.gameClock) girl.body.recentActAt = window.DMTHGame.gameClock.now();
    }
  }

  // heat from a grab scales by the BEST tool tier used. Higher-tier gear is cleaner
  // (quiet sedatives, pro restraints) → far less WANTED heat + suspicion; crude low-tier grabs
  // (a pipe in the open, tape) draw the most. "higher teir items have less negatives more positives."
  function bestToolTier(toolIds) {
    let max = 0;
    for (const id of (toolIds || [])) {
      const it = window.DMTHAssets && window.DMTHAssets.getById ? window.DMTHAssets.getById('item', id) : null;
      if (it && typeof it.tier === 'number' && it.tier > max) max = it.tier;
    }
    return max;   // 0-5
  }
  // Heat for a successful grab — 0..~3, shrinking with tier. Tier 4+ = a clean, quiet snatch.
  function captureHeat(toolIds) { return Math.max(0, 3 - bestToolTier(toolIds) * 0.7); }

  // combine MULTIPLE selected drugs+tools into one grab. Each one stacks toward the
  // snatch (probabilistic OR — every tool is an independent shot at landing her, so more gear =
  // higher chance), then the CAPEASE desperation bonus is added on top. Clamped 5-98%.
  function stackedChance(toolIds, desperationTier) {
    const ids = (toolIds || []).filter(id => SIMPLE_CAPTURE_CHANCE[id] != null);
    if (!ids.length) return 0;
    let miss = 1;
    for (const id of ids) miss *= (1 - SIMPLE_CAPTURE_CHANCE[id]);
    const combined = 1 - miss;                                    // stacked base from every tool
    return Math.max(0.05, Math.min(0.98, combined + desperationBonus(desperationTier || 0)));
  }

  // Fire a grab with a loadout of selected tools/drugs. On success, escort her to the active
  // dungeon's first open hold via hunt.js. On a miss, bump location suspicion + the player's
  // DESPERATION tier (the next grab gets EASIER) — she never "escapes" from repeated attempts,
  // so the player never gets stuck . Single-use tools in the loadout are consumed per
  // attempt; reusable ones (pipe / handcuffs / shackles / harness) survive.
  function stackedAttempt({ girl, toolIds, locationId, desperationTier = 0, holdChoice = null }) {
    const ids = (toolIds || []).filter(id => SIMPLE_CAPTURE_CHANCE[id] != null);
    if (!ids.length) return { outcome: 'fail', reason: 'no-tools-selected', desperationTier };
    // You can't drag a girl home with nowhere to put her — block the grab before any gear is spent
    // when every hold is full, so the player gets a clean "go get another hold/dungeon" lockout.
    const holdsBefore = window.DMTHGame.hunt && window.DMTHGame.hunt.openHolds ? window.DMTHGame.hunt.openHolds() : [];
    if (!holdsBefore.length) return { outcome: 'no-hold', reason: 'no-free-hold', desperationTier };
    // stamp hunting activity so "time off from hunting" cools WANTED faster.
    if (window.DMTHGame.wanted?.noteHunt) window.DMTHGame.wanted.noteHunt();
    const inv = window.DMTHGame.state.current.inventory || {};
    for (const id of ids) {
      if ((inv[id] || 0) < 1) return { outcome: 'fail', reason: 'no-tool:' + id, desperationTier };
    }
    // Consume single-use tools (1 each). Reusable tools survive the grab.
    const consumed = [];
    for (const id of ids) {
      if (SINGLE_USE_TOOLS.has(id) && window.DMTHGame.state.consumeItem(id, 1)) consumed.push(id);
    }
    const chance = stackedChance(ids, desperationTier);
    const roll = Math.random();
    if (roll < chance) {
      try {
        // the COMBINED debuff from the whole loadout hits her starting captive stats
        // (health/bruises/dazed/sedated/mood/escape) in totality. Apply BEFORE escort so it persists.
        applyCaptureDebuffs(girl, ids);
        // heat from the grab scales by tool tier (higher tier = cleaner = less heat).
        let heat = captureHeat(ids);
        // owning this turf (greased badges) cuts the WANTED heat from a grab here.
        const op = window.DMTHGame.progression?.ownedLocationPerks ? window.DMTHGame.progression.ownedLocationPerks(locationId) : null;
        if (op && op.wantedReduction) heat = heat * (1 - op.wantedReduction);
        if (heat > 0 && window.DMTHGame.state.addWanted) window.DMTHGame.state.addWanted(heat, 'snatch:' + bestToolTier(ids));
        // Placement: the player chooses which dungeon/cell she wakes up in. If an explicit
        // holdChoice was passed (the picker), use it. With exactly ONE empty hold there's no
        // choice to make — auto-escort. With MORE than one, defer placement so the UI can ask.
        const holds = window.DMTHGame.hunt.openHolds ? window.DMTHGame.hunt.openHolds() : [];
        let escort = null;
        let needsHoldPick = false;
        if (holdChoice && holdChoice.dungeonId != null) {
          escort = window.DMTHGame.hunt.escortToHold(girl, holdChoice.dungeonId, holdChoice.holdIdx);
        } else if (holds.length === 1) {
          escort = window.DMTHGame.hunt.escortToHold(girl, holds[0].dungeonId, holds[0].holdIdx);
        } else if (holds.length > 1) {
          needsHoldPick = true;   // UI prompts which cell, then re-fires placement via placeCaptured()
        } else {
          escort = window.DMTHGame.hunt.escortToHold(girl);   // safety net (shouldn't reach — guarded)
        }
        // a successful grab drops location-aware loot (a tool from the scene, or cash).
        let loot = null;
        if (window.DMTHGame.loot) { try { loot = window.DMTHGame.loot.rollCaptureLoot(locationId); } catch (e) { /* non-fatal */ } }
        // strip her stash on the grab: 2-5 of EACH item her girl-type offered.
        let haul = null;
        if (window.DMTHGame.loot && window.DMTHGame.loot.grantCaptureHaul) { try { haul = window.DMTHGame.loot.grantCaptureHaul(girl); } catch (e) { /* non-fatal */ } }
        // DEPRAVITY XP  — a successful snatch is a big level boost.
        if (window.DMTHGame.progression) window.DMTHGame.progression.grantXp(25, 'snatch');
        return { outcome: 'success', toolIds: ids, chance, roll, escort, needsHoldPick, openHolds: holds, desperationTier, loot, haul, consumed };
      } catch (err) {
        return { outcome: 'success-no-room', toolIds: ids, chance, roll, error: err.message, desperationTier, consumed };
      }
    }
    // Miss — desperation rises (next grab easier), a little location heat. NO escape .
    // a clean high-tier loadout botches QUIETLY: tier 3+ adds no suspicion/heat,
    // crude low-tier grabs draw the usual blip.
    const s = window.DMTHGame.state.current;
    const tier = bestToolTier(ids);
    const susBump = tier >= 3 ? 0 : 1;
    s.wallet.suspicionByLocation[locationId] = (s.wallet.suspicionByLocation[locationId] || 0) + susBump;
    if (susBump > 0 && window.DMTHGame.wanted) window.DMTHGame.wanted.accrue('botched-capture');
    return { outcome: 'miss', toolIds: ids, chance, roll, suspicionDelta: susBump, desperationTier: (desperationTier || 0) + 1, consumed };
  }

  // Back-compat single-tool wrapper — delegates to the stacked engine. No escape end-state.
  function simpleAttempt({ girl, toolId, locationId, escalationTier = 0 }) {
    const r = stackedAttempt({ girl, toolIds: [toolId], locationId, desperationTier: escalationTier });
    return { ...r, toolId, escalationTier: r.desperationTier };
  }

  // Compose a human-readable summary of one stage outcome — used by UI for inline feedback.
  function summarizeStage(stageResult) {
    if (!stageResult) return '(no result)';
    if (!stageResult.toolId) return `${STAGE_LABELS[stageResult.stageKey]}: ${stageResult.reason}`;
    const tool = window.DMTHAssets.getById('item', stageResult.toolId);
    const toolName = tool?.displayName || stageResult.toolId;
    const status = stageResult.cleared ? '✓ cleared' : '✗ failed';
    return `${STAGE_LABELS[stageResult.stageKey]} — ${tool?.emoji || ''}${toolName} → ${stageResult.progress}% ${status}`;
  }

  window.DMTHGame = window.DMTHGame || {};
  window.DMTHGame.capture = Object.freeze({
    STAGES,
    STAGE_LABELS,
    STAGE_DESCRIPTIONS,
    STAGE_CLEAR_THRESHOLD,
    SINGLE_USE_TOOLS,
    CAPTURE_TOOL_IDS,
    DEFAULT_TOOL_STAGES,
    DEFAULT_RESISTANCE,
    getToolStages,
    getArchetypeResistance,
    eligibleToolsForStage,
    getPlayerSkill,
    rollWitness,
    resolveStage,
    runAttempt,
    summarizeStage,
    SIMPLE_CAPTURE_CHANCE,
    DESPERATION_BONUS,
    DESPERATION_LABELS,
    getSimpleCaptureChance,
    eligibleSimpleTools,
    simpleAttempt,
    stackedAttempt,
    stackedChance,
    desperationLabel,
    desperationBonus,
    desperationNarration
  });
})();
