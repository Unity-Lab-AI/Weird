// DUNGEON MASTER: THE HUNT — disposal. Bury / incinerate / release / trade / finalization-film / lose-at-sea.

(function () {
  'use strict';

  const METHODS = {
    bury: {
      displayName: 'Bury',
      emoji: '⚱️',
      moneyCost: 0,
      notorietyFactor: (girl, dungeonTpl) => {
        const isolation = dungeonTpl?.isolation || 0.5;
        return isolation > 0.9 ? 0 : isolation > 0.7 ? 1 : 3;
      },
      suspicionSpike: 0,
      notes: 'Dig a hole on the property and drop her in the dirt. Safest when the dungeon\'s isolated — nobody to hear the shovel.'
    },
    'lose-at-sea': {
      displayName: 'Lose at Sea',
      emoji: '🌊',
      moneyCost: 200,
      notorietyFactor: () => 1,
      suspicionSpike: 0,
      notes: 'Chain a weight to her ankles and feed her to the deep — boat + coastal access required. No body, no case.'
    },
    incinerate: {
      displayName: 'Incinerate',
      emoji: '🔥',
      moneyCost: 300,
      notorietyFactor: () => 0,
      suspicionSpike: 0,
      requiresFacility: 'incinerator',
      notes: 'Feed her to the furnace and watch her cook down to ash — needs an incinerator. Nothing left to find.'
    },
    trade: {
      displayName: 'Trade Away',
      emoji: '🤝',
      moneyCost: 0,
      refundOnGirl: true,                    // wired to slave-market listing
      notorietyFactor: () => 0,
      suspicionSpike: 0,
      notes: 'Sell her off down the slave-market pipeline — used meat, someone else\'s problem now.'
    },
    release: {
      displayName: 'Release',
      emoji: '🕊️',
      moneyCost: 0,
      notorietyFactor: (girl) => girl.bond.bondLevel >= 9 ? 0 : 10,
      suspicionSpike: 5,
      notes: 'Dump her back on the street. Only a fully-broken L9 keeps her mouth shut — anything less and she runs straight to the cops (major heat + suspicion).'
    },
    'finalization-film': {
      displayName: 'Snuff Film',
      emoji: '🎬',
      moneyCost: 0,
      generatesFilm: true,
      notorietyFactor: () => 2,
      suspicionSpike: 0,
      notes: 'Roll the camera and film her last breath — premium snuff content, sells at 3–5× base. One per girl: it\'s the last thing she ever does.'
    },
    dismember: {
      displayName: 'Dismember + Harvest',
      emoji: '🪓',
      moneyCost: 0,
      harvests: true,
      notorietyFactor: () => 4,
      suspicionSpike: 4,
      notes: 'Butcher her for parts — organs + limbs go to the body-part market and sell passively. The MESSIEST method: leaves the most evidence (big WANTED risk). Works on a live captive or a corpse. Mints a visceral mounted trophy.'
    }
  };

  // Methods only valid on a LIVING captive — you can't release / trade / film-finalize a
  // corpse. Terminal methods (bury / lose-at-sea / incinerate) work on either (on a living
  // captive they kill + dispose in one).
  const ALIVE_ONLY_METHODS = new Set(['release', 'trade', 'finalization-film']);

  // Terminal methods that retire the girl for good → mint a trophy. Trade/release let her
  // leave alive, so no trophy.
  const TERMINAL_TROPHY_METHODS = new Set(['bury', 'incinerate', 'lose-at-sea', 'finalization-film', 'dismember']);

  // Per-method cleanliness — how little forensic trace it leaves (0-1). Folds into the
  // evidence roll along with dungeon isolation + installed security facilities. Dismemberment
  // is the messiest (blood, parts moving through a market) → lowest cleanliness.
  const METHOD_CLEANLINESS = { incinerate: 0.95, trade: 0.92, 'lose-at-sea': 0.80, 'finalization-film': 0.55, bury: 0.55, dismember: 0.30, release: 0.20 };

  // DEP-EXP.3 — body-part harvest. Dismemberment yields organs + intact limbs, each listed
  // in the body-part market (market.runBodyPartSaleTick). Value scales with archetype rarity +
  // her Stockholm bond (a trained, prime body fetches more). Limbs already taken as a nugget
  // (body.limbs[x] === 'removed') aren't harvestable — they're already gone.
  const HARVEST_RARITY_MUL = { unity_seed: 2.0, sorority: 1.5, model: 1.5, club: 1.2, nurse: 1.2 };
  const HARVEST_PARTS = [
    { key: 'heart',    name: 'heart',           base: 220, emoji: '🫀' },
    { key: 'kidneys',  name: 'pair of kidneys', base: 180, emoji: '🥩' },
    { key: 'liver',    name: 'liver',           base: 140, emoji: '🥩' },
    { key: 'corneas',  name: 'pair of corneas', base: 120, emoji: '👁️' },
    { key: 'skin',     name: 'tanned skin',     base: 160, emoji: '🧴' },
    { key: 'scalp',    name: 'scalp + hair',    base: 70,  emoji: '💇' },
    { key: 'leftArm',  name: 'left arm',  base: 80, emoji: '💪', limb: 'leftArm' },
    { key: 'rightArm', name: 'right arm', base: 80, emoji: '💪', limb: 'rightArm' },
    { key: 'leftLeg',  name: 'left leg',  base: 95, emoji: '🦵', limb: 'leftLeg' },
    { key: 'rightLeg', name: 'right leg', base: 95, emoji: '🦵', limb: 'rightLeg' }
  ];
  function harvestBodyParts(girl) {
    const limbs = girl.body?.limbs || {};
    const rarityMul = HARVEST_RARITY_MUL[girl.archetypeTemplate] || 1.0;
    const bondMul = 0.8 + (girl.bond?.bondLevel || 0) * 0.04;
    const out = [];
    for (const p of HARVEST_PARTS) {
      if (p.limb && limbs[p.limb] === 'removed') continue;   // already a nugget here — nothing to take
      const variance = 0.85 + Math.random() * 0.3;
      const value = Math.max(10, Math.round(p.base * rarityMul * bondMul * variance));
      const part = {
        id: 'part_' + (girl.id || 'x') + '_' + p.key + '_' + Date.now().toString(36) + Math.floor(Math.random() * 1000),
        girlName: girl.name,
        archetype: girl.archetypeTemplate,
        partKey: p.key,
        name: p.name,
        emoji: p.emoji,
        value,
        listed: true,
        harvestedAt: Date.now()
      };
      if (window.DMTHGame.state.addBodyPart) window.DMTHGame.state.addBodyPart(part);
      out.push(part);
    }
    return out;
  }

  // requirementError — returns a human string if a method's prerequisites aren't met, else
  // null. D.2: the requiresFacility flag is now ENFORCED (it was decorative before).
  function requirementError(method, dungeon) {
    const facilities = dungeon?.facilities || {};
    if (method === 'incinerate' && !facilities.incinerator) return 'Requires an Incinerator facility — build it in the dungeon first.';
    if (method === 'lose-at-sea' && !facilities.boat) return 'Requires a Boat + coastal access — acquire it first.';
    // DEPRAVITY gate (PLVL.1) — dismemberment is the highest-tier disposal; locked until level.
    if (method === 'dismember' && window.DMTHGame.progression && !window.DMTHGame.progression.isUnlocked('dismember')) {
      return `Dismemberment is locked — reach DEPRAVITY level ${window.DMTHGame.progression.requiredLevel('dismember')} first.`;
    }
    return null;
  }

  function dispose(girlId, method, keepsakeId) {
    const girl = window.DMTHGame.state.getGirl(girlId);
    if (!girl) throw new Error('no such girl');
    const m = METHODS[method];
    if (!m) throw new Error('unknown method');

    const dungeon = window.DMTHGame.state.getDungeon(girl.assignedDungeonId);
    const dungeonTpl = dungeon && window.DMTHAssets.getById('dungeon', dungeon.templateId);

    // D.3 — state gating: a corpse can't be released / traded / film-finalized.
    if (girl.encounterState === 'dead' && ALIVE_ONLY_METHODS.has(method)) {
      throw new Error(`Can't ${m.displayName} a corpse — she's already dead. Use bury / incinerate / lose-at-sea.`);
    }

    // D.2 — enforce facility prerequisites.
    const reqErr = requirementError(method, dungeon);
    if (reqErr) throw new Error(reqErr);

    // Cost check
    if (m.moneyCost > 0) {
      const ok = window.DMTHGame.state.spendMoney(m.moneyCost, `dispose:${method}`);
      if (!ok) throw new Error('insufficient funds for disposal method');
    }

    // Trade route — list on slave market instead of delete
    if (method === 'trade') {
      const price = Math.round(50 + (girl.bond.bondLevel * 30) + (girl.stats.obedience || 0) * 1.5);
      window.DMTHGame.state.listGirlForSale(girl.id, price);
      return { ok: true, method, listedPrice: price };
    }

    // Finalization film — record, then dispose. D.5: NO silent swallow — if the premium
    // film fails to record, abort the disposal so the player doesn't lose both the girl AND
    // the film with no feedback.
    let generatedFilmId = null;
    if (m.generatesFilm) {
      try {
        window.DMTHGame.film.startRecording(girl.id, ['finalization']);
        const film = window.DMTHGame.film.stopRecording({ title: `${girl.name}: The End`, basePrice: 500 });
        generatedFilmId = film.id;
      } catch (err) {
        throw new Error(`Finalization film failed to record (${err?.message || 'unknown'}). Disposal aborted so you don't lose the premium film — try again.`);
      }
    }

    // Free the hold
    if (dungeon) {
      const newHolds = dungeon.holds.map(h => h.captiveGirlId === girl.id ? { ...h, captiveGirlId: null } : h);
      window.DMTHGame.state.updateDungeon(dungeon.id, { holds: newHolds });
    }

    // Log the disposal
    const notorietyDelta = m.notorietyFactor(girl, dungeonTpl);
    window.DMTHGame.state.addNotoriety(notorietyDelta);

    // D.4 — evidence roll → WANTED. How cleanly the trace is handled: method cleanliness +
    // dungeon isolation + installed security facilities. A release of a non-bonded captive
    // is special-cased (she rats regardless of how "clean" the handoff was).
    let leftEvidence = false;
    if (window.DMTHGame.wanted) {
      if (method === 'release') {
        window.DMTHGame.wanted.accrue(girl.bond.bondLevel >= 9 ? 'clean-disposal' : 'release-low-bond');
      } else {
        const isolation = dungeonTpl?.isolation ?? 0.5;
        const cleanliness = METHOD_CLEANLINESS[method] ?? 0.5;
        const secCount = dungeon?.security ? Object.keys(dungeon.security).filter(k => dungeon.security[k]).length : 0;
        const cleanP = Math.min(0.97, cleanliness * 0.6 + isolation * 0.3 + secCount * 0.04);
        leftEvidence = Math.random() > cleanP;
        window.DMTHGame.wanted.accrue(leftEvidence ? 'sloppy-disposal' : 'clean-disposal');
      }
    }
    const log = {
      girlId: girl.id,
      girlNameAtDisposal: girl.name,
      method,
      dungeonId: dungeon?.id || null,
      dungeonTemplateAtDisposal: dungeon?.templateId || null,
      disposalDate: Date.now(),
      notorietyImpact: notorietyDelta,
      suspicionHeatSpike: m.suspicionSpike || 0,
      finalBondLevel: girl.bond.bondLevel,
      generatedFilmId
    };
    window.DMTHGame.state.addDisposal(log);

    // DEP-EXP.3 — dismemberment harvests sellable body parts into the body-part market.
    let harvested = [];
    if (method === 'dismember') {
      harvested = harvestBodyParts(girl);
      if (harvested.length && window.DMTHNotify) {
        const tot = harvested.reduce((t, p) => t + p.value, 0);
        window.DMTHNotify.show(`🪓 ${girl.name} butchered — ${harvested.length} parts harvested (≈$${tot.toLocaleString()} listed in the body-part market).`, { type: 'error', durationMs: 7000 });
      }
    }

    // G — a TERMINAL disposal mints a unique trophy (her type + personality + stacking perks).
    // Trade/release route her out alive → no trophy.
    let trophy = null;
    if (TERMINAL_TROPHY_METHODS.has(method) && window.DMTHGame.trophies) {
      try { trophy = window.DMTHGame.trophies.mint(girl, method, keepsakeId); } catch (err) { console.debug('[disposal] trophy mint failed:', err); }
    }

    // Remove from roster
    window.DMTHGame.state.removeGirl(girl.id);

    // DEPRAVITY XP (PLVL.2) — retiring a girl feeds the level; dismemberment the most.
    if (window.DMTHGame.progression) window.DMTHGame.progression.grantXp(method === 'dismember' ? 20 : 15, 'dispose:' + method);

    return { ok: true, method, log, generatedFilmId, leftEvidence, trophy, harvested };
  }

  // Ollama narration of a disposal scene — called by UI after dispose() returns.
  async function narrateDisposal(girl, method) {
    const sceneKey = {
      bury: 'disposal_bury',
      incinerate: 'disposal_incinerate',
      release: 'disposal_release',
      'finalization-film': 'disposal_finalization'
    }[method];
    if (!sceneKey) return null;
    try {
      const system = window.DMTHTemplates.buildSystemPrompt(girl, 'sexy', sceneKey, {
        BOND_LEVEL: girl.bond.bondLevel
      });
      const { raw, parsed } = await window.DMTHGame.ollama.chatStream({
        system,
        messages: [{ role: 'user', content: '(final beat — narrate from first-person POV)' }]
      });
      return (parsed.cleanText || raw).trim();
    } catch {
      return null;
    }
  }

  // Method keys valid for a girl's current state (D.3) — corpses lose the alive-only methods.
  function availableMethodsFor(girl) {
    const dead = girl && girl.encounterState === 'dead';
    return Object.keys(METHODS).filter(k => !(dead && ALIVE_ONLY_METHODS.has(k)));
  }

  window.DMTHGame = window.DMTHGame || {};
  window.DMTHGame.disposal = Object.freeze({
    METHODS, dispose, narrateDisposal,
    requirementError, availableMethodsFor, ALIVE_ONLY_METHODS
  });
})();
