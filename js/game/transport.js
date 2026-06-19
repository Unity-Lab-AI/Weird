// DUNGEON MASTER: THE HUNT — inter-dungeon transport (TRANSPORT.1).
// Moving a captive between your dungeons is a RISKY operation, not a free teleport. You pick
// a method — stuffing her in a duffel bag is free but rough and likely to hurt her, draw heat,
// or let her wriggle loose; a private medical transport costs real money but is fast, discreet,
// and gentle enough she barely registers the move. Higher-tier methods = better perks + less
// risk. Some are level-gated (the heaviest discretion is late-game). Some consume a sedative.
//
// Outcomes on a transport roll (graded, worst-first):
//   death   — only the most reckless methods carry any chance (suffocation in a sealed bag).
//   escape  — she gets loose in transit → encounterState 'escaped' (a WANTED liability).
//   injury  — she arrives but battered (health/bruises hit) — still transported.
//   clean   — uneventful; tier perks apply (mood/bond/escape-risk).
// Risk scales DOWN with tier. The transport ALWAYS frees the source hold + occupies a dest
// hold on a non-escape outcome.

(function () {
  'use strict';

  // tier 1 = cheap/rough/risky → tier 4 = expensive/discreet/safe. cost is per-use cash.
  // requiresItem (optional) = an inventory item consumed by the method (a sedative).
  // death/escape/injury are the probabilities of each bad outcome (checked worst-first).
  // wanted = WANTED heat added on a NON-clean move (sloppy handling draws eyes).
  // mood/bond/escapeRisk = deltas applied to the girl on a SUCCESSFUL (non-escape) move.
  // levelReq = DEPRAVITY level gate (0 = always available).
  const TRANSPORT_METHODS = Object.freeze({
    'duffel-bag': {
      displayName: 'Duffel Bag', emoji: '🎒', tier: 1, cost: 0, levelReq: 0,
      death: 0.05, escape: 0.16, injury: 0.45,
      wanted: 5, mood: -14, bond: -3, escapeRisk: +0.10,
      notes: 'Free — stuff her folded into a gym bag and carry her out. Cramped, airless, terrifying. High chance she gets hurt or panics loose; a real chance she suffocates. Cheapest and nastiest.'
    },
    'suitcase': {
      displayName: 'Rolling Suitcase', emoji: '🧳', tier: 1, cost: 60, levelReq: 0,
      death: 0.02, escape: 0.12, injury: 0.35,
      wanted: 4, mood: -11, bond: -2, escapeRisk: +0.07,
      notes: 'Wheel her out in a hard-shell case. Still cramped + jostling, but a shell beats a bag. Moderate injury risk, small suffocation risk.'
    },
    'car-trunk': {
      displayName: 'Car Trunk', emoji: '🚗', tier: 2, cost: 120, levelReq: 0,
      death: 0.0, escape: 0.10, injury: 0.22,
      wanted: 3, mood: -8, bond: -1, escapeRisk: +0.05,
      notes: 'Bound in the trunk for the drive. Room to breathe; she can still kick + thump for attention. Middle-of-the-road risk + cost.'
    },
    'drugged-ride': {
      displayName: 'Drugged Back-Seat', emoji: '💊', tier: 2, cost: 80, levelReq: 0,
      requiresItem: 'rohypnol', requiresItemAny: ['rohypnol', 'ketamine', 'chloroform', 'ether', 'tranquilizer'],
      death: 0.01, escape: 0.02, injury: 0.08,
      wanted: 1, mood: -5, bond: 0, escapeRisk: 0,
      notes: 'Dose her limp and drive her propped in the back like a passed-out friend. Consumes one sedative. She\'s out cold — almost no escape risk, low heat. The smart cheap option if you have a vial.'
    },
    'shipping-crate': {
      displayName: 'Freight Crate', emoji: '📦', tier: 3, cost: 350, levelReq: 3,
      death: 0.0, escape: 0.04, injury: 0.12,
      wanted: 1, mood: -6, bond: -1, escapeRisk: +0.02,
      notes: 'Crated as freight with air holes + padding. Slow, but discreet and routed like cargo — barely any heat. Some bruising from the haul.'
    },
    'private-van': {
      displayName: 'Unmarked Van', emoji: '🚐', tier: 3, cost: 800, levelReq: 4,
      death: 0.0, escape: 0.03, injury: 0.03,
      wanted: 0, mood: -2, bond: 0, escapeRisk: -0.03,
      notes: 'Padded, restraint-rigged van with a driver. Fast, controlled, near-zero heat. She arrives intact and a touch more resigned — the smooth handling reads as inevitability.'
    },
    'medical-transport': {
      displayName: 'Fake Medical Transport', emoji: '🚑', tier: 4, cost: 1600, levelReq: 6,
      death: 0.0, escape: 0.01, injury: 0.0,
      wanted: 0, mood: +2, bond: +2, escapeRisk: -0.08,
      notes: 'Staged ambulance + "caregivers." She thinks she\'s being rescued — then the doors lock. Flawless discretion, zero injury, and the false hope deepens the Stockholm bond. The late-game flex.'
    }
  });

  function method(id) { return TRANSPORT_METHODS[id]; }

  function depLevel() { return window.DMTHGame.progression ? window.DMTHGame.progression.getLevel() : 1; }
  function cheat() { return window.DMTHGame.progression ? window.DMTHGame.progression.isCheatUnlocked() : false; }
  function isMethodUnlocked(id) {
    const m = TRANSPORT_METHODS[id];
    if (!m) return false;
    return cheat() || depLevel() >= (m.levelReq || 0);
  }

  // The sedative item a drugged method will consume (first match in inventory), or null.
  function sedativeInInventory(m) {
    const inv = window.DMTHGame.state.current?.inventory || {};
    const pool = m.requiresItemAny || (m.requiresItem ? [m.requiresItem] : []);
    return pool.find(id => (inv[id] || 0) > 0) || null;
  }

  // Other dungeons (not the girl's current one) that have at least one open hold — valid
  // transport destinations. Returns [{ id, templateId, displayName, openHolds }].
  // Valid destinations with an open hold. For a CORPSE (CORPSE-MOVE.1) the CURRENT dungeon is
  // also a valid destination (hold-to-hold repositioning) as long as a different hold is open.
  function destinationsFor(girl) {
    const s = window.DMTHGame.state.current;
    if (!s || !girl) return [];
    const isCorpse = girl.encounterState === 'dead';
    return (s.dungeons || [])
      .filter(d => isCorpse ? true : d.id !== girl.assignedDungeonId)
      .map(d => {
        const tpl = window.DMTHAssets.getById('dungeon', d.templateId);
        const openHolds = (d.holds || []).filter(h => !h.captiveGirlId).length;
        const sameDungeon = d.id === girl.assignedDungeonId;
        return { id: d.id, templateId: d.templateId, displayName: (tpl?.displayName || d.templateId) + (sameDungeon ? ' (this dungeon)' : ''), openHolds, sameDungeon };
      })
      .filter(d => d.openHolds > 0);
  }

  // Validate without mutating — used by the UI to enable/disable + explain. Works for both a
  // living captive (full risk move) and a corpse (clean body haul, incl. same-dungeon reposition).
  function canTransport(girlId, destDungeonId, methodId) {
    const girl = window.DMTHGame.state.getGirl(girlId);
    if (!girl) return { ok: false, reason: 'no such captive' };
    const isCorpse = girl.encounterState === 'dead';
    if (girl.encounterState !== 'captive' && !isCorpse) return { ok: false, reason: 'only a living captive or a corpse can be moved' };
    const m = TRANSPORT_METHODS[methodId];
    if (!m) return { ok: false, reason: 'unknown transport method' };
    if (!isMethodUnlocked(methodId)) return { ok: false, reason: `locked — reach DEPRAVITY level ${m.levelReq}` };
    // A live captive can't be "moved" to the dungeon she's already in; a corpse CAN (reposition).
    if (destDungeonId === girl.assignedDungeonId && !isCorpse) return { ok: false, reason: 'she is already in that dungeon' };
    const dest = window.DMTHGame.state.getDungeon(destDungeonId);
    if (!dest) return { ok: false, reason: 'no such destination dungeon' };
    if ((dest.holds || []).findIndex(h => !h.captiveGirlId) < 0) return { ok: false, reason: 'destination has no open hold' };
    // Sedation only matters for a LIVE move — a corpse needs no drugging.
    if (!isCorpse && (m.requiresItem || m.requiresItemAny) && !sedativeInInventory(m)) {
      const pool = m.requiresItemAny || [m.requiresItem];
      return { ok: false, reason: `needs a sedative (${pool.join(' / ')})` };
    }
    if ((window.DMTHGame.state.current?.wallet?.money || 0) < m.cost) return { ok: false, reason: 'insufficient funds' };
    return { ok: true };
  }

  // Execute the move. Returns { ok, outcome: 'clean'|'injury'|'escape'|'death', ... }.
  function transport(girlId, destDungeonId, methodId) {
    const pre = canTransport(girlId, destDungeonId, methodId);
    if (!pre.ok) return pre;
    const girl = window.DMTHGame.state.getGirl(girlId);
    const m = TRANSPORT_METHODS[methodId];
    const isCorpse = girl.encounterState === 'dead';
    const srcDungeon = window.DMTHGame.state.getDungeon(girl.assignedDungeonId);
    const destDungeon = window.DMTHGame.state.getDungeon(destDungeonId);

    // Pay the toll up front (cash + — for a LIVE move only — a sedative).
    if (m.cost > 0 && !window.DMTHGame.state.spendMoney(m.cost, `transport:${methodId}:${girlId}`)) {
      return { ok: false, reason: 'insufficient funds' };
    }
    if (!isCorpse && (m.requiresItem || m.requiresItemAny)) {
      const sed = sedativeInInventory(m);
      if (sed) window.DMTHGame.state.consumeItem(sed, 1);
    }

    // Free the source hold (function declaration — hoisted, usable in the corpse branch below).
    function freeSourceHoldEarly() {
      if (!srcDungeon) return;
      const nh = (srcDungeon.holds || []).map(h => h.captiveGirlId === girl.id ? { ...h, captiveGirlId: null } : h);
      window.DMTHGame.state.updateDungeon(srcDungeon.id, { holds: nh });
    }

    // ── CORPSE MOVE (CORPSE-MOVE.1) — no risk roll, she's already dead. Clean body haul to
    // another hold (same or different dungeon). Costs cash + a little WANTED (moving a body
    // draws eyes; rougher/cheaper methods more). Preserves the corpse + its decay timer. ──
    if (isCorpse) {
      const openIdx = (destDungeon.holds || []).findIndex(h => !h.captiveGirlId);
      if (openIdx < 0) return { ok: false, reason: 'destination hold filled mid-move' };
      freeSourceHoldEarly();
      const destHolds = destDungeon.holds.slice();
      destHolds[openIdx] = { ...destHolds[openIdx], captiveGirlId: girl.id };
      window.DMTHGame.state.updateDungeon(destDungeon.id, { holds: destHolds });
      window.DMTHGame.state.updateGirl(girl.id, { assignedDungeonId: destDungeon.id, assignedHoldIdx: openIdx });
      const heat = Math.max(1, Math.round((m.wanted || 0) * 0.6) + 1);
      if (window.DMTHGame.wanted) window.DMTHGame.wanted.accrue(heat);
      if (window.DMTHNotify) {
        const destTpl = window.DMTHAssets.getById('dungeon', destDungeon.templateId);
        window.DMTHNotify.show(`${m.emoji} ${girl.name}'s body moved to ${destTpl?.displayName || 'another hold'} via ${m.displayName}. (+${heat} WANTED for hauling a corpse.)`, { type: 'warn', durationMs: 5000 });
      }
      return { ok: true, outcome: 'corpse-moved', method: methodId, destDungeonId: destDungeon.id, destHoldIdx: openIdx };
    }

    // Roll the outcome — worst-first. Tier already baked into the per-method probabilities.
    const roll = Math.random();
    let outcome = 'clean';
    if (roll < m.death) outcome = 'death';
    else if (roll < m.death + m.escape) outcome = 'escape';
    else if (roll < m.death + m.escape + m.injury) outcome = 'injury';

    // Free the source hold in all non-clean-stay cases (she leaves it regardless).
    function freeSourceHold() {
      if (!srcDungeon) return;
      const newHolds = (srcDungeon.holds || []).map(h => h.captiveGirlId === girl.id ? { ...h, captiveGirlId: null } : h);
      window.DMTHGame.state.updateDungeon(srcDungeon.id, { holds: newHolds });
    }

    // --- DEATH in transit: she suffocates / panics fatally. Body is lost on the road (no
    // corpse to use — she didn't make it to a hold). Heavy heat. ---
    if (outcome === 'death') {
      freeSourceHold();
      window.DMTHGame.state.updateGirl(girl.id, {
        encounterState: 'dead',
        assignedDungeonId: null,
        assignedHoldIdx: null,
        body: { ...girl.body, diedAt: window.DMTHGame.gameClock?.now?.() ?? 0, causeOfDeath: 'suffocated in transit', decayedMinutes: 0, corpseMarker: 'choked' }
      });
      if (window.DMTHGame.death) window.DMTHGame.death.ensureDeathRecord(girl.id, 'transit-suffocation:' + methodId);
      if (window.DMTHGame.wanted) window.DMTHGame.wanted.accrue(m.wanted + 6);
      if (window.DMTHNotify) window.DMTHNotify.show(`☠️ ${girl.name} suffocated in the ${m.displayName.toLowerCase()} in transit. You pulled a corpse out the other end.`, { type: 'error', durationMs: 7000 });
      return { ok: true, outcome: 'death', method: methodId };
    }

    // --- ESCAPE in transit: she works loose mid-move and bolts. ---
    if (outcome === 'escape') {
      freeSourceHold();
      window.DMTHGame.state.updateGirl(girl.id, {
        encounterState: 'escaped',
        assignedDungeonId: null,
        assignedHoldIdx: null,
        escape: { ...(girl.escape || {}), currentRisk: 1, escapedAt: Date.now(), escapedFrom: 'transit' }
      });
      if (window.DMTHGame.wanted) window.DMTHGame.wanted.accrue('escape');
      if (window.DMTHNotify) window.DMTHNotify.show(`🏃 ${girl.name} broke loose during the ${m.displayName.toLowerCase()} transfer and ran. She's on the streets.`, { type: 'error', durationMs: 7000 });
      return { ok: true, outcome: 'escape', method: methodId };
    }

    // --- Survived (clean OR injured): she arrives at the destination hold. ---
    const openIdx = (destDungeon.holds || []).findIndex(h => !h.captiveGirlId);
    if (openIdx < 0) {
      // Shouldn't happen (validated), but never strand her — refund-ish: leave her put.
      return { ok: false, reason: 'destination hold filled mid-transfer — move aborted' };
    }
    freeSourceHold();
    const destHolds = destDungeon.holds.slice();
    destHolds[openIdx] = { ...destHolds[openIdx], captiveGirlId: girl.id };
    window.DMTHGame.state.updateDungeon(destDungeon.id, { holds: destHolds });

    // Build the girl patch — relocation + method mood/bond/escape effects + injury if rolled.
    const body = { ...girl.body };
    let injuryNote = '';
    if (outcome === 'injury') {
      body.health = Math.max(1, (body.health ?? 100) - 18);
      body.bruises = Math.min(99, (body.bruises ?? 0) + 6);
      body.recentActTag = 'battered';
      if (window.DMTHGame.gameClock) body.recentActAt = window.DMTHGame.gameClock.now();
      injuryNote = ' She arrived battered — bruised and hurting from the haul.';
    }
    const patch = {
      assignedDungeonId: destDungeon.id,
      assignedHoldIdx: openIdx,
      // Track the move for the death dossier's "held longest at" stat (DEATHSTATS.1).
      dungeonHistory: [...(girl.dungeonHistory || []), { dungeonId: destDungeon.id, at: Date.now() }],
      body,
      // A rough move adds bond-debt (resentment); the gentle med-transport pays a little down.
      bond: { ...girl.bond, bondDebt: Math.max(0, (girl.bond?.bondDebt || 0) + (m.bond < 0 ? -m.bond : (m.bond > 0 ? -m.bond : 0))) },
      escape: { ...(girl.escape || {}), currentRisk: Math.max(0, Math.min(1, (girl.escape?.currentRisk || 0) + (m.escapeRisk || 0))) }
    };
    // Mood string follows the method's mood sign (model is qualitative, like escortToHold sets).
    if (m.mood <= -8) patch.mood = { ...girl.mood, mood: 'terrified', moodEmoji: '😱' };
    else if (m.mood < 0) patch.mood = { ...girl.mood, mood: 'shaken', moodEmoji: '😨' };
    window.DMTHGame.state.updateGirl(girl.id, patch);
    if (m.bond > 0) {
      const g2 = window.DMTHGame.state.getGirl(girl.id);
      window.DMTHGame.state.updateGirl(girl.id, { bond: { ...g2.bond, bondXP: (g2.bond?.bondXP || 0) + m.bond * 3 } });
    }

    // Heat for a non-clean move (injury draws a little attention; clean discreet moves none).
    if (m.wanted > 0 && window.DMTHGame.wanted) window.DMTHGame.wanted.accrue(outcome === 'injury' ? m.wanted : Math.ceil(m.wanted / 2));
    // A successful relocation is a small DEPRAVITY beat (running the operation).
    if (window.DMTHGame.progression) window.DMTHGame.progression.grantXp(3, 'transport');

    if (window.DMTHNotify) {
      const destTpl = window.DMTHAssets.getById('dungeon', destDungeon.templateId);
      window.DMTHNotify.show(`${m.emoji} ${girl.name} moved to ${destTpl?.displayName || 'the other dungeon'} via ${m.displayName}.${injuryNote}`, { type: outcome === 'injury' ? 'warn' : 'success', durationMs: 5000 });
    }
    return { ok: true, outcome, method: methodId, destDungeonId: destDungeon.id, destHoldIdx: openIdx };
  }

  window.DMTHGame = window.DMTHGame || {};
  window.DMTHGame.transport = Object.freeze({
    TRANSPORT_METHODS, method, isMethodUnlocked, sedativeInInventory,
    destinationsFor, canTransport, transport
  });
})();
