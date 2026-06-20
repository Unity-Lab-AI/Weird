// DUNGEON MASTER: THE HUNT — hunting mechanic. Location roll → encounter → approach → capture attempt.

(function () {
  'use strict';

  // Location archetype affinity — which girl archetypes spawn where, weighted.
  const LOCATION_SPAWNS = {
    street:        [{ arche: 'street', w: 0.55 }, { arche: 'barista', w: 0.2 }, { arche: 'club', w: 0.25 }],
    club:          [{ arche: 'club', w: 0.45 }, { arche: 'sorority', w: 0.2 }, { arche: 'stripper', w: 0.15 }, { arche: 'street', w: 0.2 }],
    'strip-club':  [{ arche: 'stripper', w: 0.62 }, { arche: 'club', w: 0.18 }, { arche: 'street', w: 0.1 }, { arche: 'model', w: 0.1 }],
    library:       [{ arche: 'library', w: 0.6 }, { arche: 'barista', w: 0.25 }, { arche: 'sorority', w: 0.15 }],
    park:          [{ arche: 'gym', w: 0.25 }, { arche: 'barista', w: 0.2 }, { arche: 'college-student', w: 0.2 }, { arche: 'neighbor', w: 0.15 }, { arche: 'library', w: 0.12 }, { arche: 'street', w: 0.08 }],
    gym:           [{ arche: 'gym', w: 0.7 }, { arche: 'sorority', w: 0.15 }, { arche: 'street', w: 0.15 }],
    mall:          [{ arche: 'sorority', w: 0.22 }, { arche: 'college-student', w: 0.2 }, { arche: 'family-friend', w: 0.16 }, { arche: 'club', w: 0.16 }, { arche: 'barista', w: 0.16 }, { arche: 'library', w: 0.1 }],
    'coffee-shop': [{ arche: 'barista', w: 0.4 }, { arche: 'college-student', w: 0.22 }, { arche: 'highschool-grad', w: 0.18 }, { arche: 'library', w: 0.12 }, { arche: 'club', w: 0.08 }],
    sorority:      [{ arche: 'sorority', w: 0.55 }, { arche: 'cheerleader', w: 0.2 }, { arche: 'club', w: 0.12 }, { arche: 'model', w: 0.08 }, { arche: 'gym', w: 0.05 }],
    remote:        [{ arche: 'street', w: 0.4 }, { arche: 'waitress', w: 0.25 }, { arche: 'gym', w: 0.2 }, { arche: 'library', w: 0.15 }],
    'hotel-lobby': [{ arche: 'sorority', w: 0.3 }, { arche: 'model', w: 0.25 }, { arche: 'office', w: 0.2 }, { arche: 'club', w: 0.15 }, { arche: 'library', w: 0.1 }],
    'private-party':[{ arche: 'sorority', w: 0.3 }, { arche: 'club', w: 0.22 }, { arche: 'college-student', w: 0.18 }, { arche: 'second-cousin', w: 0.12 }, { arche: 'model', w: 0.1 }, { arche: 'street', w: 0.08 }],
    'school-campus':[{ arche: 'college-student', w: 0.24 }, { arche: 'sorority', w: 0.16 }, { arche: 'cheerleader', w: 0.14 }, { arche: 'schoolgirl', w: 0.12 }, { arche: 'teacher', w: 0.12 }, { arche: 'highschool-grad', w: 0.12 }, { arche: 'library', w: 0.1 }],
    'neighborhood': [{ arche: 'neighbor', w: 0.45 }, { arche: 'family-friend', w: 0.25 }, { arche: 'second-cousin', w: 0.15 }, { arche: 'college-student', w: 0.15 }],
    // The family gathering — your own relations within reach. Each is its own relation type.
    'family-reunion': [{ arche: 'niece', w: 0.22 }, { arche: 'second-cousin', w: 0.2 }, { arche: 'half-sister', w: 0.18 }, { arche: 'step-daughter', w: 0.16 }, { arche: 'long-lost-sister', w: 0.14 }, { arche: 'family-friend', w: 0.1 }],
    // the only place to catch an already-pregnant girl. Spawns "normal girls"
    // archetypes; rollFreshSet flags every girl here PREGNANT after generation.
    'prenatal-clinic': [{ arche: 'neighbor', w: 0.28 }, { arche: 'family-friend', w: 0.22 }, { arche: 'office', w: 0.18 }, { arche: 'college-student', w: 0.16 }, { arche: 'sorority', w: 0.16 }]
  };

  // Additional archetype locations for new archetypes
  const ARCHETYPE_EXTRA_LOCATIONS = {
    office:   ['mall', 'coffee-shop', 'hotel-lobby'],
    waitress: ['street', 'club', 'remote'],
    nurse:    ['street', 'coffee-shop', 'mall'],
    model:    ['club', 'hotel-lobby', 'private-party', 'mall']
  };

  // the girls at a location PERSIST. The same set stays put for a randomized
  // 2-4 game-day window so you can return and work the same girl across days (lott farming /
  // mood-building) without capturing her. Captured girls drop out of the set; the window expires
  // and a fresh set rolls in. Falls back to a one-off roll if state isn't ready.
  function currentDay() {
    const c = window.DMTHGame.gameClock;
    return c ? Math.floor(c.now() / (c.MIN_PER_DAY || 1440)) + 1 : 1;
  }
  function rollFreshSet(locationId, count) {
    const spawns = LOCATION_SPAWNS[locationId] || LOCATION_SPAWNS.street;
    const girls = [];
    const taken = new Set();   // keep names distinct WITHIN this set too
    for (let i = 0; i < count; i++) {
      const arche = weightedPick(spawns);
      const seed = Math.floor(Math.random() * 0x7FFFFFFF);
      const girl = window.DMTHGame.girlGen.generate(arche, seed, { taken });
      taken.add(String(girl.name).toLowerCase());
      girl.encounterState = 'encountered';
      girl.encounteredAt = { locationId, ts: Date.now() };
      // girls at the prenatal clinic are ALREADY PREGNANT: stamp a real pregnancy
      // (random gestation day → trimester) so she arrives breeding, captured belly-and-all.
      if (locationId === 'prenatal-clinic') {
        const gd = 40 + Math.floor(Math.random() * 200);   // ~day 40-240
        girl.pregnancy = {
          status: 'pregnant', gestationDays: gd,
          trimester: gd < 94 ? 1 : gd < 187 ? 2 : 3,
          conceptionSource: 'pre-capture', outcomeHistory: []
        };
      }
      girls.push(girl);
    }
    return girls;
  }
  function rollEncounters(locationId, count = 3) {
    const st = window.DMTHGame.state;
    if (!st || !st.getLocationSpawns) return rollFreshSet(locationId, count);   // pre-state fallback
    const day = currentDay();
    const rec = st.getLocationSpawns(locationId);
    if (rec && Array.isArray(rec.girls) && day <= (rec.expiresDay || 0)) {
      // Still within the window — same girls, minus any already captured.
      const captured = rec.captured || {};
      const live = rec.girls.filter(g => g && !captured[g.id]);
      if (live.length) return live;
      // everyone here got taken — fall through and roll a fresh set early
    }
    const girls = rollFreshSet(locationId, count);
    const expiresDay = day + 2 + Math.floor(Math.random() * 3);   // persists 2-4 days
    if (st.setLocationSpawns) st.setLocationSpawns(locationId, { girls, rolledDay: day, expiresDay, captured: {} });
    return girls;
  }

  // mark an encountered girl as captured so she stops appearing at that location.
  function markEncounterCaptured(locationId, girlId) {
    const st = window.DMTHGame.state;
    if (!st || !st.getLocationSpawns) return;
    const rec = st.getLocationSpawns(locationId);
    if (!rec) return;
    const captured = { ...(rec.captured || {}) };
    captured[girlId] = true;
    if (st.updateLocationSpawns) st.updateLocationSpawns(locationId, { captured });
  }

  function weightedPick(entries) {
    const total = entries.reduce((s, e) => s + e.w, 0);
    let r = Math.random() * total;
    for (const e of entries) { r -= e.w; if (r <= 0) return e.arche; }
    return entries[0].arche;
  }

  // --- Tool power table ---
  const TOOL_POWER = {
    pipe:       0.18,              // starter blunt weapon — cheap, unreliable, suspicion-heavy
    rohypnol:   0.35,  chloroform: 0.40,  ether: 0.50,  ketamine: 0.60,
    'duct-tape':0.15,  rope: 0.12, 'zip-ties': 0.20, handcuffs: 0.28, shackles: 0.35, harness: 0.40
  };

  // --- Tool narrative flavor — used by scene-template builders ---
  const TOOL_FLAVOR = {
    pipe:       { verb: 'pipe',       action: 'swings a lead pipe at her head from behind',          aftermath: 'she drops instantly, hard impact sound, head ringing, blood at the temple' },
    rohypnol:   { verb: 'sedative',   action: 'slips a vial into her drink when she looks away',     aftermath: 'she sways within minutes, words slurring, eyes unfocused' },
    chloroform: { verb: 'solvent',    action: 'presses a soaked cloth over her mouth and nose',      aftermath: 'she struggles hard for ten seconds then goes limp' },
    ether:      { verb: 'anesthetic', action: 'presses an ether-soaked rag against her face',        aftermath: 'she fades fast, eyes rolling back' },
    ketamine:   { verb: 'k-shot',     action: 'jabs a syringe into her neck',                        aftermath: 'she freezes mid-motion, dissociates, collapses wordless' },
    'duct-tape':{ verb: 'tape',       action: 'grabs her from behind and tapes her wrists together', aftermath: 'she fights, gets her ankles taped too, muffled behind a strip across her mouth' },
    rope:       { verb: 'rope',       action: 'throws a loop around her and cinches her arms down',  aftermath: 'she struggles in the coils, gets thrown to the ground, bound' },
    'zip-ties': { verb: 'zip-tie',    action: 'catches her wrists and zip-ties them tight',          aftermath: 'she yanks, the ties bite in deep, she has to stop' },
    handcuffs:  { verb: 'cuffs',      action: 'cuffs her wrist before she can pull away',            aftermath: 'the second cuff clicks around her other wrist, metal cold' },
    shackles:   { verb: 'shackles',   action: 'drops heavy steel shackles on her ankles',            aftermath: 'she tries to step away, stumbles, the weight pins her' },
    harness:    { verb: 'harness',    action: 'wraps a harness rig around her torso from behind',    aftermath: 'buckles click shut, the straps find every pressure point' }
  };

  // --- Archetype reaction flavor — how she reacts when acquired ---
  const ARCHETYPE_REACTION = {
    library:  'freezes, shock, tries to rationalize this is happening, small frightened sounds',
    club:     'screams loud but the music swallows it, flailing, arms grabbing at nothing',
    street:   'fights dirty, bites, kicks hard at the shins, curses nonstop',
    sorority: 'tries to bargain — offers money, father\'s name, anything — voice sharp and incredulous',
    gym:      'throws a clean elbow back, tries to grapple out, strong but caught off-balance',
    barista:  'plays confused at first then clicks into it too late, tries to grab something from her apron',
    office:   'tries to reason with him — lists consequences, professional-voice-cracking, then panic',
    waitress: 'throws a punch, swears loud, tries to scream for the cook, the regular, anybody',
    nurse:    'clinical first — tries de-escalation language — then the panic hits and she fights efficiently',
    model:    'shocked stillness then a burst of strength, thinks about her face the whole time',
    stripper: 'thinks it\'s a customer crossing a line at first — practiced brush-off, then real fear when the grip doesn\'t let go',
    cheerleader: 'shrieks a cheer-loud scream, kicks with athletic legs, calls for her squad',
    schoolgirl: 'freezes wide-eyed, drops her bag, small terrified whimpers, asks what\'s happening',
    teacher:  'tries to take control with a stern command voice, then the composure shatters into panic',
    police:   'goes for her training — strikes, reaches for a weapon that isn\'t there, barks orders that mean nothing now',
    maid:     'drops what she\'s holding, backs into a corner pleading in a low frightened voice, doesn\'t fight much',
    niece:    'freezes in family-trust shock — "you\'re my UNCLE" — disbelief before the fear, small betrayed sounds',
    'half-sister': 'recoils in blood-disbelief — "we\'re half-RELATED, you can\'t" — wary fight, betrayed and confused',
    'step-daughter': 'frozen betrayal — "you\'re married to my MOM" — disbelief then panic, backs away',
    'long-lost-sister': 'heartbroken shock — "I just FOUND you" — the reunion curdling to horror, emotional collapse then fight',
    unity_seed: 'laughs — she came here on purpose'
  };

  // --- Location environmental flavor ---
  const LOCATION_FLAVOR = {
    street:        'under a flickering sodium streetlight in an alley mouth, nobody in sight',
    club:          'in the narrow hallway behind the bar between storage and the bathrooms, bass thumping through the wall',
    library:       'at the back of the stacks in the reference section, dusty shelves and green-shaded lamps',
    park:          'past the tree line where the path gets dark and the joggers don\'t come',
    gym:           'in the empty side of the locker room after hours, fluorescent hum',
    mall:          'in the service corridor behind the food court, cleaning carts parked along the wall',
    'coffee-shop': 'at closing time after the last customer left, chairs up on tables',
    sorority:      'at the side of the house by the laundry door, the front porch still loud',
    remote:        'on the shoulder of a back road with headlights pointed at her, no traffic for miles',
    'hotel-lobby': 'in the service elevator bay, the lobby piano playing on the other side',
    'private-party': 'upstairs in a bedroom while the party thumps downstairs',
    'school-campus': 'behind the science building where the security cameras don\'t reach',
    'strip-club':  'in the back hallway past the dressing rooms, mirror bulbs and discarded heels, bass thudding through the wall from the main floor',
    'prenatal-clinic': 'in the clinic parking lot at dusk as she waddles to her car after an appointment, nobody else around, one hand on her swollen belly',
    'family-reunion': 'slipping away from the backyard reunion into the quiet of the house, the rest of the family still out by the potluck tables, just the two of you alone for a moment'
  };

  // --- Destination hideout flavor ---
  const HIDEOUT_ARRIVAL = {
    'hole-in-the-desert':    'you lower her down the rope ladder, she hits the plywood floor of the pit, the tarp closes over the top',
    'woods-container':       'the container door swings shut behind her, moss dust falling from the top, welded eyebolts visible in the far wall',
    'basement-hidden-room':  'the false-wall panel clicks back into place, sealing the ordinary basement on the far side, bare bulb humming',
    'subway-service-room':   'the steel door scrapes shut and the padlock goes on, sodium bulb buzzing overhead',
    'sewer-tunnel-locked':   'the bulkhead seals with a clang, green-tinged lamp washing the brick arches, standing water at her boots',
    'coldwar-bunker':        'the blast door wheels home, fluorescent tubes flickering on one at a time down the corridor',
    'abandoned-mine-shaft':  'the cage elevator stops with a lurch at the first level, timber cribbing all around, oil lamp in the distance',
    'remote-compound':       'the outbuilding door swings shut, miles of dirt road visible through the last sliver before it closes',
    'underground-complex':   'the security door seals behind her with a professional hiss, recessed lighting, polished concrete reflecting'
  };

  // --- Archetype capture-stage resistance ---
  // Per-archetype per-stage resistance weights (0-50) for the 4-stage capture mechanic
  // (Approach → Engage → Subdue → Secure). Read by `js/game/capture.js` via
  // `window.DMTHGame.hunt.ARCHETYPE_CAPTURE_RESISTANCE`. Library/barista = low across the
  // board (easy captures). Street/gym = high subdue (fights dirty / physical strength).
  // Sorority = high engage (alerts others). Club/model = high approach (crowded + public).
  // Higher number = harder stage for that archetype.
  const ARCHETYPE_CAPTURE_RESISTANCE = {
    library:  { approach: 10, engage: 10, subdue: 15, secure: 15 },
    club:     { approach: 35, engage: 30, subdue: 20, secure: 20 },
    street:   { approach: 25, engage: 25, subdue: 40, secure: 30 },
    sorority: { approach: 25, engage: 40, subdue: 25, secure: 20 },
    gym:      { approach: 30, engage: 30, subdue: 50, secure: 35 },
    barista:  { approach: 15, engage: 15, subdue: 15, secure: 15 },
    office:   { approach: 20, engage: 25, subdue: 20, secure: 20 },
    waitress: { approach: 25, engage: 25, subdue: 30, secure: 25 },
    nurse:    { approach: 25, engage: 30, subdue: 25, secure: 25 },
    model:    { approach: 35, engage: 35, subdue: 30, secure: 25 },
    stripper: { approach: 30, engage: 20, subdue: 25, secure: 20 },   // used to handsy customers (low engage), bouncers nearby (mid approach)
    cheerleader: { approach: 25, engage: 30, subdue: 30, secure: 20 },// athletic + screams for the squad
    schoolgirl: { approach: 15, engage: 15, subdue: 15, secure: 15 }, // small, naive, easy
    teacher:  { approach: 20, engage: 25, subdue: 20, secure: 20 },
    police:   { approach: 30, engage: 35, subdue: 45, secure: 35 },   // trained + fights hard
    maid:     { approach: 15, engage: 15, subdue: 20, secure: 20 },   // isolated + compliant
    niece:    { approach: 12, engage: 12, subdue: 18, secure: 18 },   // trusts family — won't alert
    'half-sister': { approach: 15, engage: 18, subdue: 22, secure: 20 },
    'step-daughter': { approach: 12, engage: 12, subdue: 16, secure: 16 }, // trusts him, lives close
    'long-lost-sister': { approach: 15, engage: 15, subdue: 20, secure: 20 },
    unity_seed: { approach: 5, engage: 5, subdue: 5, secure: 5 }
  };

  // --- Archetype difficulty (GIRL TYPE factor) — 0=easy, 1=very hard ---
  const ARCHETYPE_DIFFICULTY = {
    barista: 0.25,
    library: 0.30,
    park:    0.30,
    street:  0.45,
    gym:     0.50,
    club:    0.55,
    mall:    0.50,
    'coffee-shop': 0.30,
    sorority: 0.70,      // vibrant + well-connected + cameras-aware
    'school-campus': 0.55,
    'hotel-lobby': 0.75,
    'private-party': 0.80,
    remote: 0.35,        // isolation helps hunter
    office:   0.55,
    waitress: 0.40,
    nurse:    0.60,
    model:    0.72,
    stripper: 0.45,      // works half-naked already + drug-loose, but bouncers + cameras
    'strip-club': 0.5,
    cheerleader: 0.50,
    schoolgirl: 0.30,    // naive, easy
    teacher:  0.55,
    police:   0.78,      // trained, armed, connected — the hardest grab
    maid:     0.35,      // isolated + compliant
    niece:    0.35,      // trusting blood, but family will notice
    'half-sister': 0.40,
    'step-daughter': 0.30, // lives under his roof, trusts him
    'long-lost-sister': 0.40,
    'family-reunion': 0.55,    // the gathering — kin within reach, but everyone knows you
    'prenatal-clinic': 0.55,   // pregnant girls — slower, but the clinic's watched
    unity_seed: 0.10     // Unity wants it
  };

  // --- Location exposure penalty (independent of suspicion) ---
  const LOCATION_EXPOSURE = {
    'hotel-lobby': 0.20,
    'private-party': 0.18,
    mall: 0.15,
    'school-campus': 0.14,
    sorority: 0.12,
    club: 0.10,
    'coffee-shop': 0.06,
    park: 0.08,
    gym: 0.08,
    library: 0.05,
    street: 0.06,
    remote: -0.10        // remote helps the hunter (negative = bonus)
  };

  // --- Success-probability preview using the GAME'S actual stats ---
  // Factors = tool power, archetype difficulty, girl's defiance, girl's intelligence,
  //           player notoriety, location exposure, location suspicion.
  function previewCaptureOdds({ girl, toolId, locationId }) {
    const toolPower = TOOL_POWER[toolId] ?? 0.10;
    const archDiff = ARCHETYPE_DIFFICULTY[girl.archetypeTemplate] ?? 0.50;
    const defiance = girl.stats?.defiance || 50;
    const intelligence = girl.stats?.intelligence || 50;
    const notoriety = window.DMTHGame.state.current?.wallet?.notoriety || 0;
    const suspicion = (window.DMTHGame.state.current.wallet.suspicionByLocation[locationId] || 0);
    const suspicionPenalty = Math.min(0.45, suspicion * 0.08);
    let exposure = LOCATION_EXPOSURE[locationId] || 0;
    // OWNING the turf means the witnesses look away (lower exposure) and prey
    // can't run far (home-turf capture boost). Perks come from progression.ownedLocationPerks.
    const ownPerks = window.DMTHGame.progression?.ownedLocationPerks ? window.DMTHGame.progression.ownedLocationPerks(locationId) : null;
    if (ownPerks) exposure = exposure * (1 - (ownPerks.witnessReduction || 0));
    const ownedTurfBonus = ownPerks ? (ownPerks.captureBoost || 0) : 0;

    // Player satisfaction hunting bonus — fuck enough captives, the next catch is easier.
    // Center at 50 → 0 swing; full 100 → +0.20; floor 0 → -0.10.
    const playerSat = window.DMTHGame.state.current?.wallet?.playerSatisfaction ?? 50;
    const satisfactionBonus = ((playerSat - 50) / 50) * (playerSat >= 50 ? 0.20 : 0.10);

    // WANTED is a pure hunting liability — the hotter you are, the harder the catch (cops
    // watching, targets warier). Scales by tier (js/game/wanted.js). The legacy
    // `notorietyBonus` stays for back-compat, but WANTED is the real heat pressure.
    const wantedPenalty = window.DMTHGame.wanted ? window.DMTHGame.wanted.huntPenalty() : 0;
    // Trophy perks — disposal trophies grant stacking hunt bonuses (some archetype-targeted).
    const trophyBonus = window.DMTHGame.trophies ? window.DMTHGame.trophies.huntBonusFor(girl.archetypeTemplate) : 0;
    // a maxed sexual drive sharpens the hunt; a deprived one dulls it.
    const sexDriveBonus = window.DMTHGame.sexdrive ? window.DMTHGame.sexdrive.huntBonus() : 0;

    const breakdown = {
      baseline:            0.40,
      toolPower:           +toolPower,
      archetypeDifficulty: -archDiff * 0.35,
      defiance:            -(defiance / 100) * 0.20,
      intelligence:        -(intelligence / 100) * 0.12,
      notorietyBonus:      +Math.min(0.12, notoriety * 0.004),
      wantedPenalty:       -wantedPenalty,
      trophyBonus:         +trophyBonus,
      suspicionPenalty:    -suspicionPenalty,
      exposurePenalty:     -exposure,
      satisfactionBonus:   +satisfactionBonus,
      sexDriveBonus:       +sexDriveBonus,
      ownedTurfBonus:      +ownedTurfBonus
    };
    const sumRaw =
      breakdown.baseline +
      breakdown.toolPower +
      breakdown.archetypeDifficulty +
      breakdown.defiance +
      breakdown.intelligence +
      breakdown.notorietyBonus +
      breakdown.wantedPenalty +
      breakdown.trophyBonus +
      breakdown.suspicionPenalty +
      breakdown.exposurePenalty +
      breakdown.satisfactionBonus +
      breakdown.sexDriveBonus +
      breakdown.ownedTurfBonus;

    const successP = Math.max(0.05, Math.min(0.95, sumRaw));

    return {
      successP,
      breakdown,
      factors: {
        toolPower,
        archetypeDifficulty: archDiff,
        defiance,
        intelligence,
        notoriety,
        suspicion
      }
    };
  }

  // Resolve a single-tool capture attempt.
  // SUPERSEDED by `window.DMTHGame.capture.runAttempt()` — the 4-stage progress-bar
  // mechanic. This function is retained for backward compatibility
  // (external callers / debug utilities) but the hunt UI no longer calls it. New game code
  // should use `DMTHGame.capture.runAttempt({girl, toolPerStage, locationId})` instead.
  // Returns { outcome: 'success'|'partial-fail'|'fail'|'critical-fail', ... }
  function attemptCapture({ girl, toolId, locationId }) {
    const tool = window.DMTHAssets.getById('item', toolId);
    if (!tool) return { outcome: 'fail', reason: 'unknown-tool' };
    const inv = window.DMTHGame.state.current.inventory;
    if (!inv[toolId] || inv[toolId] < 1) return { outcome: 'fail', reason: 'no-tool' };

    // Consume the tool
    window.DMTHGame.state.consumeItem(toolId, 1);

    const { successP } = previewCaptureOdds({ girl, toolId, locationId });

    const roll = Math.random();
    const s = window.DMTHGame.state.current;
    const suspicion = s.wallet.suspicionByLocation[locationId] || 0;
    if (roll < successP) {
      return { outcome: 'success', successP, toolUsed: toolId };
    } else if (roll < successP + 0.15) {
      // partial fail — suspicion up but no cops
      s.wallet.suspicionByLocation[locationId] = suspicion + 1;
      return { outcome: 'partial-fail', successP, toolUsed: toolId, suspicionDelta: 1 };
    } else if (roll < successP + 0.35) {
      s.wallet.suspicionByLocation[locationId] = suspicion + 2;
      window.DMTHGame.state.addNotoriety(1);
      return { outcome: 'fail', successP, toolUsed: toolId, suspicionDelta: 2 };
    } else {
      s.wallet.suspicionByLocation[locationId] = suspicion + 4;
      window.DMTHGame.state.addNotoriety(3);
      return { outcome: 'critical-fail', successP, toolUsed: toolId, suspicionDelta: 4, notorietyDelta: 3 };
    }
  }

  // Every empty hold across EVERY dungeon you own — [{ dungeonId, dungeonName, holdIdx, holdLabel }].
  // Powers the no-empty-hold capture lockout and the on-capture "which cell does she wake up in" picker.
  function openHolds() {
    const s = window.DMTHGame.state && window.DMTHGame.state.current;
    if (!s || !Array.isArray(s.dungeons)) return [];
    const out = [];
    for (const d of s.dungeons) {
      const tpl = window.DMTHAssets && window.DMTHAssets.getById ? window.DMTHAssets.getById('dungeon', d.templateId) : null;
      const dName = (tpl && tpl.displayName) || d.id;
      (d.holds || []).forEach((h, idx) => {
        if (!h.captiveGirlId) out.push({ dungeonId: d.id, dungeonName: dName, holdIdx: idx, holdLabel: `Cell ${idx + 1}` });
      });
    }
    return out;
  }
  // True if there's at least one empty hold anywhere — the gate for starting a new grab.
  function hasOpenHold() { return openHolds().length > 0; }

  // Escort a captured girl to an open hold. Targets a specific dungeon + hold when given
  // (the on-capture cell picker); otherwise falls back to the first empty hold in the active dungeon.
  function escortToHold(girl, dungeonId, holdIdx) {
    const dungeon = window.DMTHGame.state.getDungeon(dungeonId || window.DMTHGame.state.current.settings.activeDungeonId);
    if (!dungeon) throw new Error('no dungeon to escort to');
    const wantsIdx = (typeof holdIdx === 'number' && holdIdx >= 0
      && dungeon.holds[holdIdx] && !dungeon.holds[holdIdx].captiveGirlId);
    const openIdx = wantsIdx ? holdIdx : dungeon.holds.findIndex(h => !h.captiveGirlId);
    if (openIdx < 0) throw new Error('no open holds in dungeon');
    girl.encounterState = 'captive';
    girl.assignedDungeonId = dungeon.id;
    girl.assignedHoldIdx = openIdx;
    girl.captureDate = Date.now();
    // Seed dungeon-occupancy history for the death dossier's "held longest at" stat .
    girl.dungeonHistory = [...(girl.dungeonHistory || []), { dungeonId: dungeon.id, at: Date.now() }];
    // log the capture as the first entry in her LIVE activity history.
    if (window.DMTHGame.state.appendActivity) {
      const loc = (girl.encounteredAt && girl.encounteredAt.locationId) || 'the streets';
      window.DMTHGame.state.appendActivity(girl.id, { kind: 'capture', label: `⛓️ captured at ${loc}`, detail: `dragged into the dungeon` });
    }
    girl.mood.mood = 'terrified';
    girl.mood.moodEmoji = '😱';
    // new captives start at Stockholm 1-3 (internal bond 0-2) depending on the
    // location they came from (easy grounds = more pliable) + the operator's DEPRAVITY level (a
    // seasoned hunter breaks them in faster). Never overrides a higher seeded bond (e.g. Unity).
    const EASY_START_LOCS = new Set(['street', 'library', 'park', 'coffee-shop', 'mall', 'gym', 'neighborhood']);
    let startTier = 0;
    if (girl.encounteredAt && EASY_START_LOCS.has(girl.encounteredAt.locationId)) startTier += 1;
    if (window.DMTHGame.progression && window.DMTHGame.progression.getLevel() >= 5) startTier += 1;
    startTier = Math.min(2, startTier);
    if (startTier > 0) {
      girl.bond = girl.bond || { bondLevel: 0, bondXP: 0, bondDebt: 0, milestones: [] };
      if ((girl.bond.bondLevel || 0) < startTier) {
        girl.bond.bondLevel = startTier;
        const xp = window.DMTHGame.balancing ? window.DMTHGame.balancing.xpForLevel(startTier) : startTier * 50;
        girl.bond.bondXP = Math.max(girl.bond.bondXP || 0, xp);
      }
    }
    window.DMTHGame.state.addGirl(girl);
    // lock her full name out of future generation now that she's in the collection.
    if (window.DMTHGame.state.noteUsedName) window.DMTHGame.state.noteUsedName(girl.name);
    const newHolds = dungeon.holds.slice();
    newHolds[openIdx] = { ...newHolds[openIdx], captiveGirlId: girl.id };
    window.DMTHGame.state.updateDungeon(dungeon.id, { holds: newHolds });
    //   — RARE: she comes with her own slutty special outfit stashed (type-matched
    // when possible, else any skimpy). The special outfits are also buyable in the Carcass Closet;
    // this is the rare-loot-find path. ~10% on capture.
    if (window.DMTHGame.wardrobe?.grantOutfit && Math.random() < 0.10) {
      const ids = window.DMTHGame.wardrobe.skimpyOutfitIds ? window.DMTHGame.wardrobe.skimpyOutfitIds() : [];
      const oid = window.DMTHGame.wardrobe.skimpyForArchetype(girl.archetypeTemplate)
        || (ids.length ? ids[Math.floor(Math.random() * ids.length)] : null);
      if (oid) {
        const r = window.DMTHGame.wardrobe.grantOutfit(girl.id, oid);
        if (r && r.ok && window.DMTHLootPopup) window.DMTHLootPopup.show(`👗 Rare find — ${girl.name} had a ${r.outfit.displayName} stashed. It's hers now.`);
      }
    }
    // Fire-and-forget capture memorial + profile image — Pollinations overlay, silent if unavailable.
    if (window.DMTHGame.imaging && window.DMTHGame.imaging.isAvailable()) {
      window.DMTHGame.imaging.generateFor(girl.id, { situation: 'capture' }).catch(() => {});
      window.DMTHGame.imaging.profileImageFor(girl.id).catch(() => {});
    }
    return { dungeonId: dungeon.id, holdIdx: openIdx };
  }

  // --- Compose scene-vars for a capture beat based on tool × girl × location × hideout ---
  function composeSceneVars({ girl, toolId, locationId, dungeonId, beat }) {
    const tool = TOOL_FLAVOR[toolId] || { verb: toolId, action: 'uses the tool on her', aftermath: 'she goes down' };
    const loc  = window.DMTHAssets.getById('location', locationId);
    const dungeon = dungeonId ? window.DMTHGame.state.getDungeon(dungeonId) : null;
    const dungeonTpl = dungeon ? window.DMTHAssets.getById('dungeon', dungeon.templateId) : null;
    return {
      GIRL_NAME:      girl.name,
      GIRL_ARCHETYPE: girl.archetypeTemplate,
      GIRL_REACTION:  ARCHETYPE_REACTION[girl.archetypeTemplate] || ARCHETYPE_REACTION.library,
      TOOL:           tool.verb,
      TOOL_ACTION:    tool.action,
      TOOL_AFTERMATH: tool.aftermath,
      LOCATION:       loc?.displayName || locationId,
      LOCATION_FLAVOR: LOCATION_FLAVOR[locationId] || 'in a quiet spot where nobody is watching',
      HIDEOUT_NAME:   dungeonTpl?.displayName || 'your hideout',
      HIDEOUT_ARRIVAL: HIDEOUT_ARRIVAL[dungeon?.templateId] || 'the door closes behind her',
      BEAT:           beat || 'subdue'
    };
  }

  window.DMTHGame = window.DMTHGame || {};
  window.DMTHGame.hunt = Object.freeze({
    rollEncounters,
    markEncounterCaptured,
    attemptCapture,
    previewCaptureOdds,
    escortToHold,
    openHolds,
    hasOpenHold,
    composeSceneVars,
    LOCATION_SPAWNS,
    TOOL_POWER,
    TOOL_FLAVOR,
    ARCHETYPE_DIFFICULTY,
    ARCHETYPE_REACTION,
    ARCHETYPE_CAPTURE_RESISTANCE,
    LOCATION_EXPOSURE,
    LOCATION_FLAVOR,
    HIDEOUT_ARRIVAL
  });
})();
