// DUNGEON MASTER: THE HUNT — john archetype catalog.
// Captives generate passive income through john encounters; the ledger tracks every john
// (act / payment / quirks) so the captive can talk about her johns in chat.
//
// Distinct from Propositioner archetypes (bespoke single deals, upmarket clientele):
// johns are general-public flow, batch-resolved per tick. 10 archetypes representing the
// johns who show up for the whored-out girl.
//
// Each archetype carries:
//   arrivalWeight       relative chance of arrival per tick-roll
//   payRange            [min, max] base pay before johnHappiness multiplier
//   tipChance           0..1 chance of an extra tip
//   tipMul              tip-multiplier on top of base pay when tip rolls
//   permittedActsPreference  preferred act tags this john emits — drives the JohnEncounter.acts array
//   intensity           1..5 scaling for stamina drain via action-effects.js john-* entries
//   moodImpact          ±N mood shift inflicted on the girl
//   bruisesAdded        per-encounter bruise count (negative = no bruise risk)
//   condomCompliance    0..1 chance the john uses a condom IF girl.whoreOut.condomRequired
//   dialogueTone        flavor word for memory recall (Ollama context can use this)
//   pregnantWantBias    ±N multiplier when girl is pregnant — some johns avoid, some seek

(function () {
  'use strict';

  const JOHN_ARCHETYPES = Object.freeze({
    regular: {
      displayName: 'Regular',
      arrivalWeight: 25,
      payRange: [40, 80],
      tipChance: 0.20,
      tipMul: 1.25,
      permittedActsPreference: ['sex-gentle', 'oral'],
      intensity: 2,
      moodImpact: -2,
      bruisesAdded: 0,
      condomCompliance: 0.85,
      dialogueTone: 'polite, transactional, quick',
      pregnantWantBias: 0.85,
      johnActionId: 'john-gentle'
    },
    rough: {
      displayName: 'Rough Trade',
      arrivalWeight: 15,
      payRange: [55, 110],
      tipChance: 0.10,
      tipMul: 1.15,
      permittedActsPreference: ['sex-rough', 'anal', 'creampie'],
      intensity: 4,
      moodImpact: -8,
      bruisesAdded: 1,
      condomCompliance: 0.50,
      dialogueTone: 'aggressive, demanding, leaves her shaking',
      pregnantWantBias: 0.50,
      johnActionId: 'john-rough'
    },
    cheap: {
      displayName: 'Cheap-skate',
      arrivalWeight: 18,
      payRange: [20, 40],
      tipChance: 0.05,
      tipMul: 1.10,
      permittedActsPreference: ['oral', 'sex-gentle'],
      intensity: 2,
      moodImpact: -3,
      bruisesAdded: 0,
      condomCompliance: 0.70,
      dialogueTone: 'haggling, sweaty, looks her up and down',
      pregnantWantBias: 0.80,
      johnActionId: 'john-gentle'
    },
    generous: {
      displayName: 'Big Tipper',
      arrivalWeight: 8,
      payRange: [100, 200],
      tipChance: 0.65,
      tipMul: 1.60,
      permittedActsPreference: ['sex-gentle', 'oral', 'foreplay'],
      intensity: 2,
      moodImpact: +2,
      bruisesAdded: 0,
      condomCompliance: 0.90,
      dialogueTone: 'wealthy, complimentary, leaves cash on the bedside',
      pregnantWantBias: 1.10,
      johnActionId: 'john-gentle'
    },
    repeat: {
      displayName: 'Repeat Client',
      arrivalWeight: 10,
      payRange: [60, 120],
      tipChance: 0.30,
      tipMul: 1.30,
      permittedActsPreference: ['sex-gentle', 'oral'],
      intensity: 2,
      moodImpact: -1,
      bruisesAdded: 0,
      condomCompliance: 0.80,
      dialogueTone: 'familiar, knows her name, asks how she\'s been',
      pregnantWantBias: 1.20,
      johnActionId: 'john-gentle',
      repeatable: true
    },
    weirdo: {
      displayName: 'Weirdo Kink',
      arrivalWeight: 8,
      payRange: [80, 150],
      tipChance: 0.25,
      tipMul: 1.40,
      permittedActsPreference: ['fetish', 'roleplay', 'toys'],
      intensity: 3,
      moodImpact: -5,
      bruisesAdded: 0,
      condomCompliance: 0.65,
      dialogueTone: 'specific kink demand, unsettling specificity, lingering',
      pregnantWantBias: 1.00,
      johnActionId: 'john-gentle'
    },
    quick: {
      displayName: 'Quick Visit',
      arrivalWeight: 12,
      payRange: [50, 90],
      tipChance: 0.15,
      tipMul: 1.20,
      permittedActsPreference: ['oral', 'sex-gentle'],
      intensity: 1,
      moodImpact: -1,
      bruisesAdded: 0,
      condomCompliance: 0.80,
      dialogueTone: 'in and out, doesn\'t even take his shoes off',
      pregnantWantBias: 0.90,
      johnActionId: 'john-quick'
    },
    talkative: {
      displayName: 'Talker',
      arrivalWeight: 6,
      payRange: [70, 130],
      tipChance: 0.35,
      tipMul: 1.25,
      permittedActsPreference: ['sex-gentle', 'oral', 'foreplay'],
      intensity: 2,
      moodImpact: 0,
      bruisesAdded: 0,
      condomCompliance: 0.85,
      dialogueTone: 'overshares his life story, wants her to listen, takes forever',
      pregnantWantBias: 1.00,
      johnActionId: 'john-gentle'
    },
    'pregnant-want': {
      displayName: 'Breeder',
      arrivalWeight: 4,
      payRange: [120, 250],
      tipChance: 0.40,
      tipMul: 1.50,
      permittedActsPreference: ['sex-rough', 'creampie', 'breeding'],
      intensity: 3,
      moodImpact: -6,
      bruisesAdded: 0,
      condomCompliance: 0.05,                  // breeder almost never uses condom
      dialogueTone: 'fetish for breeding, wants to cum inside, talks about it explicitly',
      pregnantWantBias: 1.80,                   // strongly drawn to already-pregnant
      johnActionId: 'john-rough'
    },
    sadist: {
      displayName: 'Sadist',
      arrivalWeight: 5,
      payRange: [130, 260],
      tipChance: 0.25,
      tipMul: 1.50,
      permittedActsPreference: ['sex-rough', 'anal', 'choke', 'humiliation', 'toys'],
      intensity: 5,
      moodImpact: -18,
      bruisesAdded: 4,
      condomCompliance: 0.30,
      dialogueTone: 'cruel and methodical — wants to hurt her, uses whatever\'s in the room on her, pays for the privilege',
      pregnantWantBias: 0.60,
      johnActionId: 'john-rough'
    },
    degrader: {
      displayName: 'Degrader',
      arrivalWeight: 6,
      payRange: [90, 180],
      tipChance: 0.20,
      tipMul: 1.30,
      permittedActsPreference: ['sex-rough', 'oral', 'humiliation'],
      intensity: 4,
      moodImpact: -15,
      bruisesAdded: 1,
      condomCompliance: 0.40,
      dialogueTone: 'verbal abuse, calls her names, leaves her crying',
      pregnantWantBias: 0.70,
      johnActionId: 'john-degrader'
    },
    // Postmortem-only archetype — never appears in the normal arrival pool. Forced into
    // play by whore-out tryArrival when girl.encounterState === 'dead'. Premium niche
    // clientele paying for the use of a preserved corpse. arrivalWeight=0 keeps it off
    // the live-girl rotation; rollJohnArchetype skips zero-weight entries.
    'postmortem-john': {
      displayName: 'Postmortem Client',
      arrivalWeight: 0,
      payRange: [220, 420],
      tipChance: 0.30,
      tipMul: 1.40,
      permittedActsPreference: ['necrophilia', 'sex-rough', 'cum-on-corpse', 'cum-inside'],
      intensity: 3,
      moodImpact: 0,
      bruisesAdded: 0,
      condomCompliance: 0.05,
      dialogueTone: 'silent, methodical, pays premium for the niche',
      pregnantWantBias: 1.0,
      johnActionId: 'john-postmortem'
    }
  });

  // /.2 — "friends" are special recurring visitors, RARER and FAR more extreme than
  // normal johns. When the player toggles them on for a girl, a slice of arrivals become a
  // friend who uses an EXTREME act and a unique near-kill ability — a direct ~40-60 health drop
  // (he'll nearly kill her). Pays a fortune. Every friend visit is logged to her history for the
  // death-dossier / trophy. Friends are gated to held captives (never corpses).
  const FRIEND_ARCHETYPES = Object.freeze({
    'the-butcher': {
      displayName: 'The Butcher', arrivalWeight: 10, payRange: [400, 700],
      healthDrop: [40, 55], bruisesAdded: 6, johnActionId: 'extreme-beatdown',
      permittedActsPreference: ['sex-rough', 'choke', 'humiliation'],
      chamberToy: 'cattle-prod',
      ability: 'works her over until she\'s a broken, bleeding heap — and pays a fortune for the privilege',
      dialogueTone: 'methodical and merciless, no rush, no mercy'
    },
    'the-surgeon': {
      displayName: 'The Surgeon', arrivalWeight: 8, payRange: [450, 800],
      healthDrop: [35, 50], bruisesAdded: 3, johnActionId: 'masochist-overload',
      permittedActsPreference: ['toys', 'pain', 'humiliation'],
      chamberToy: 'breast-ripper',   // brings his own chamber-grade implement
      ability: 'brings his own instruments and opens her up clinical and slow',
      dialogueTone: 'cold, invasive, talks her through every cut'
    },
    'the-pack': {
      displayName: 'The Pack', arrivalWeight: 7, payRange: [500, 950],
      healthDrop: [45, 60], bruisesAdded: 5, johnActionId: 'extreme-rough-anal',
      permittedActsPreference: ['sex-rough', 'anal', 'creampie', 'bukkake'],
      chamberToy: 'fucking-machine',
      ability: 'a whole crew at once — they take turns wrecking every hole until she can\'t stand',
      dialogueTone: 'a baying pack, egging each other on'
    },
    'the-strangler': {
      displayName: 'The Strangler', arrivalWeight: 6, payRange: [450, 850],
      healthDrop: [40, 55], bruisesAdded: 2, johnActionId: 'extreme-choke-out',
      permittedActsPreference: ['choke', 'sex-rough'],
      chamberToy: 'cattle-prod',
      ability: 'fucks her right to the edge of death and drags her back, over and over',
      dialogueTone: 'gets off on the moment her eyes roll back, pays to chase it'
    },
    'the-collector': {
      displayName: 'The Collector', arrivalWeight: 6, payRange: [500, 900],
      healthDrop: [30, 45], bruisesAdded: 4, johnActionId: 'extreme-degrade',
      permittedActsPreference: ['humiliation', 'sex-rough', 'toys'],
      chamberToy: 'pear-of-anguish',   // brings the worst chamber implement
      ability: 'marks and ruins her like he\'s claiming a trophy, wants a piece of her to keep',
      dialogueTone: 'collector\'s patience, cataloguing every part of her out loud as he wrecks it'
    },
    'the-priest': {
      displayName: 'The Defrocked Priest', arrivalWeight: 5, payRange: [450, 800],
      healthDrop: [32, 48], bruisesAdded: 3, johnActionId: 'masochist-overload',
      permittedActsPreference: ['humiliation', 'pain', 'sex-rough'],
      chamberToy: 'monster-dildo',
      ability: 'turns her ruin into a ritual — slow, reverent, obscene, sermonizing as he defiles her',
      dialogueTone: 'mock-holy cadence, calls it penance, savors her shame'
    },
    'the-twins': {
      displayName: 'The Twins', arrivalWeight: 5, payRange: [550, 1000],
      healthDrop: [42, 58], bruisesAdded: 5, johnActionId: 'extreme-rough-anal',
      permittedActsPreference: ['sex-rough', 'anal', 'creampie', 'bukkake'],
      chamberToy: 'fucking-machine',
      ability: 'two of them at once, never giving her a second\'s rest between holes',
      dialogueTone: 'finishing each other\'s sentences, egging each other on over her'
    },
    // the snuff specialist. The rarest, highest-paying friend, and the only one
    // who comes to FINISH her: if she's already low enough that his debuff crosses her remaining
    // health, he kills her on camera (the lethal-finish gate in whore-out resolves it). `lethal`
    // marks him as a deliberate executioner; `killLine` is his signature end. A massive payout +
    // snuff bonus; use him only when you're ready to lose her (the friends opt-in warning covers it).
    'the-executioner': {
      displayName: 'The Executioner', arrivalWeight: 3, payRange: [700, 1300],
      healthDrop: [55, 75], bruisesAdded: 4, johnActionId: 'extreme-choke-out',
      permittedActsPreference: ['choke', 'sex-rough', 'snuff'],
      lethal: true, corpse: 'bled-out', chamberToy: 'pear-of-anguish',
      killLine: 'gouges his cock into her eye socket until it pops and floods down her cheek, then saws her throat open mid-thrust and fucks the wound while she gurgles and kicks out',
      ability: 'comes to gut her like meat — chokes her out, splits her open from cunt to sternum, fists the wound and keeps pumping while she bleeds out twitching on his cock, films the whole thing for the buyers who pay for a real death',
      dialogueTone: 'calm, surgical, almost bored — he\'s carved up more girls than he can count'
    }
  });
  //   — each friend has a UNIQUE kink + dislike matched against the GIRL's traits
  // that swing his payment + loot: "u dont want to put a nazi frined in with a black person, or hell
  // maybe the nazi guy has a kink for dark meat". A kink-match → premium pay + extra loot; a
  // dislike-hit → slashed pay + worse loot (and some bigots will outright refuse). One of MANY — add
  // more freely. Tags match the tokens from girlTraitTokens (ethnicity / archetype / age / spec /
  // condition). payMult multiplies his pay; lootBonus shifts his gift-drop count.
  const FRIEND_KINKS = Object.freeze({
    'the-butcher':     { kink: { tags: ['big-tits', 'busty'], payMult: 1.4, lootBonus: 1, note: 'gets off on big tits' }, dislike: { tags: ['preggo'], payMult: 0.7, lootBonus: -1, note: 'put off by a pregnant belly' } },
    'the-surgeon':     { kink: { tags: ['nugget', 'broken'], payMult: 1.5, lootBonus: 1, note: 'a clinical taste for the helpless + broken' }, dislike: { tags: ['fighter'], payMult: 0.75, lootBonus: 0, note: 'hates one that still fights' } },
    'the-pack':        { kink: { tags: ['sorority', 'teen'], payMult: 1.4, lootBonus: 1, note: 'a pack-hunger for fresh young meat' }, dislike: { tags: ['milf'], payMult: 0.8, lootBonus: 0, note: 'not interested in an older one' } },
    'the-strangler':   { kink: { tags: ['fighter'], payMult: 1.45, lootBonus: 1, note: 'lives for the struggle of one that fights' }, dislike: { tags: ['broken', 'nugget'], payMult: 0.7, lootBonus: -1, note: 'bored by one with no fight left' } },
    'the-collector':   { kink: { tags: ['black', 'asian', 'indian', 'middle-eastern', 'mixed'], payMult: 1.5, lootBonus: 2, note: 'a collector\'s fetish for exotic + dark meat' }, dislike: { tags: ['white'], payMult: 0.85, lootBonus: 0, note: 'a plain white one bores his collection' } },
    'the-priest':      { kink: { tags: ['library', 'innocent'], payMult: 1.45, lootBonus: 1, note: 'a defrocked hunger to ruin the innocent + pure' }, dislike: { tags: ['high-bond', 'whore'], payMult: 0.7, lootBonus: -1, note: 'no thrill in one already corrupted' } },
    'the-twins':       { kink: { tags: ['teen', 'sorority'], payMult: 1.4, lootBonus: 1, note: 'both of them want the youngest, freshest one' }, dislike: { tags: ['milf', 'preggo'], payMult: 0.75, lootBonus: 0, note: 'pass on an older or pregnant one' } },
    // The Executioner is a bigot  — he pays POORLY on a non-white girl and will
    // often REFUSE to touch her; he pays a premium for a white/blonde one. Putting him on a black or
    // latina girl is a costly mistake.
    'the-executioner': { kink: { tags: ['white'], payMult: 1.3, lootBonus: 1, note: 'a supremacist preference for a white girl' }, dislike: { tags: ['black', 'latina', 'middle-eastern', 'indian', 'mixed', 'asian'], payMult: 0.5, lootBonus: -2, refuseChance: 0.45, note: 'a vicious bigot — he despises a non-white girl, pays scraps, often refuses outright' } }
  });

  //   — each friend has a PERSISTENT visual BUILD so he renders as the SAME man
  // every time he crawls back, feeding both image-prompt injection (the secondary figure in her
  // whore-out / gangbang pic) and chat-prompt injection (the model voices him knowing his look).
  // Deterministic per archetype = persistent by construction (no per-instance storage needed). Kept
  // CONCISE (the image model fixates if overloaded) + dash-grouped per the DASHGROUP rule + EXTREME/
  // taboo per the game. NO genital focus — men crop waist-out / implied (the biological-male image
  // rule); the menace is face / build / marks / what he wears + carries.
  const FRIEND_APPEARANCE = Object.freeze({
    'the-butcher':      'a hulking shaven-headed brute, dead-flat eyes, a blood-stained rubber butcher-apron over a bare scarred barrel-chest, thick meat-cutter forearms',
    'the-surgeon':      'a gaunt tall pale man in blood-flecked surgical scrubs, latex gloves, a surgical mask pulled down under cold clinical eyes, wire-rimmed glasses',
    'the-pack':         'a crew of rough unshaven men in stained wifebeaters, prison-ink crawling up their necks, crowding in jeering and grinning',
    'the-strangler':    'a wiry sinewy man in tight black leather gloves, hollow fixated stare, a thin cruel mouth, propane-veined forearms flexed',
    'the-collector':    'a lean fastidious older man in a tweed-and-leather coat, gloved hands, predatory patient eyes cataloguing her, a trophy-hunter\'s calm',
    'the-priest':       'a gaunt sweating defrocked priest, a black cassock hanging open over a bare bony chest, an upside-down crucifix, fevered hollow eyes',
    'the-twins':        'two identical broad shaven-headed men, matching cold flat grins, moving in mirrored sync',
    'the-executioner':  'a massive man in a blood-slick rubber apron and a blank black gas-mask, heavy gloved hands, a bonesaw and a long blade hung at his belt, utterly calm dead eyes'
  });
  // Generic john builds — a small pool so a NAMED john ("Marcus") renders consistently within a
  // scene (deterministic by his name). Plain, seedy, forgettable men — the girl stays the subject.
  const JOHN_BUILDS = Object.freeze([
    'a heavyset balding middle-aged man, sweat-sheened, gut hanging over his belt',
    'a wiry twitchy man with greasy thinning hair and a patchy beard, darting eyes',
    'a lean older man in a rumpled cheap suit, wedding ring, nervous jowls',
    'a stocky tattooed trucker in a grease-stained flannel, three-day stubble',
    'a soft pudgy office-drone with glasses and a damp comb-over, pasty skin',
    'a tall gaunt rough-handed laborer, leathery sunburnt neck, dead tired eyes',
    'a young cocky gym-rat in a tight tank, backwards cap, smirking',
    'a grizzled grey-bearded biker, leather vest, scarred knuckles'
  ]);
  // Resolve an NPC's persistent appearance. Friend → his archetype build; john → a deterministic
  // pick from JOHN_BUILDS by his name (so the same name looks the same). creepLevel (friends) adds
  // a scaled menace suffix so a high-creep regular looks more battle-worn + marked the more he returns.
  function appearanceFor(npc, creepLevel) {
    if (!npc) return '';
    let base;
    if (npc.isFriend) base = FRIEND_APPEARANCE[npc.archetype] || 'a hulking masked man in blood-stained gear';
    else {
      const nm = String(npc.name || 'john');
      let h = 0; for (let i = 0; i < nm.length; i++) h = (h * 31 + nm.charCodeAt(i)) >>> 0;
      base = JOHN_BUILDS[h % JOHN_BUILDS.length];
    }
    const cl = creepLevel || 0;
    if (npc.isFriend && cl >= 7) base += ', scarred and grizzled from a long body-count, utterly unhurried';
    else if (npc.isFriend && cl >= 4) base += ', visibly hardened, marked from repeat visits';
    return base;
  }

  // Derive the trait tokens a girl exposes for friend-kink matching.
  function girlTraitTokens(girl) {
    const t = new Set();
    if (!girl) return t;
    if (girl.ethnicity) t.add(String(girl.ethnicity).toLowerCase());
    if (girl.archetypeTemplate) t.add(String(girl.archetypeTemplate).toLowerCase());
    const age = girl.age || 21;
    if (age <= 20) t.add('teen');
    if (age >= 30) t.add('milf');
    (girl.specializations || []).forEach(s => t.add(String(s).toLowerCase()));
    if ((girl.specializations || []).includes('big-tits')) t.add('busty');
    if (girl.pregnancy && girl.pregnancy.status === 'pregnant') t.add('preggo');
    if (girl.body && girl.body.isNugget) t.add('nugget');
    if (girl.captiveAffect === 'fighter') t.add('fighter');
    const mood = (girl.mood && girl.mood.mood) || '';
    if (/broken|catatonic|traumatized/.test(mood)) t.add('broken');
    const bl = (girl.bond && girl.bond.bondLevel) || 0;
    if (bl >= 7) { t.add('high-bond'); t.add('whore'); }
    if (bl <= 1 || girl.archetypeTemplate === 'library') t.add('innocent');
    return t;
  }

  // Resolve a friend's kink/dislike against a girl → { payMult, lootDelta, refused, reason }.
  function friendMatch(friendId, girl) {
    const out = { payMult: 1.0, lootDelta: 0, refused: false, reason: '' };
    const spec = FRIEND_KINKS[friendId];
    const arc = FRIEND_ARCHETYPES[friendId];
    if (!spec || !girl) return out;
    const tokens = girlTraitTokens(girl);
    const label = (arc && arc.displayName) || 'He';
    if (spec.kink && (spec.kink.tags || []).some(tag => tokens.has(tag))) {
      out.payMult *= (spec.kink.payMult || 1.3);
      out.lootDelta += (spec.kink.lootBonus != null ? spec.kink.lootBonus : 1);
      out.reason = `${label}: ${spec.kink.note || 'has a kink for her type'} (+pay, +loot)`;
    }
    if (spec.dislike && (spec.dislike.tags || []).some(tag => tokens.has(tag))) {
      out.payMult *= (spec.dislike.payMult || 0.7);
      out.lootDelta += (spec.dislike.lootBonus != null ? spec.dislike.lootBonus : -1);
      if (spec.dislike.refuseChance && (Math.random() < spec.dislike.refuseChance)) out.refused = true;
      out.reason = `${label}: ${spec.dislike.note || 'is disgusted by her type'}${out.refused ? ' — REFUSED' : ' (−pay, −loot)'}`;
    }
    return out;
  }

  //   — NPC TRAITS. The rare, high-powered ones are what keep a DECAYING
  // corpse in service: as she rots, ordinary clients refuse outright, and only a trait-bearer will
  // still use her — the deeper the rot, the bigger the premium that rare trait commands. JOHNS
  // RARELY roll a high-powered trait; FRIENDS carry them far more often (some are masochists/
  // necrophiles by nature). A fresh body anyone uses; a pile of bones is cents to a stray degenerate
  // but HIGH DOLLAR to the very rare necrophile/masochist.
  const NPC_TRAITS = Object.freeze(['degenerate', 'masochist', 'necrophile']);   // escalating corpse-tolerance
  // Friends with an innate corpse-tolerant trait, by archetype — the sickest of the set.
  const FRIEND_TRAITS = Object.freeze({
    'the-surgeon':     ['necrophile', 'masochist'],   // a clinical taste for the helpless + the dead
    'the-priest':      ['masochist', 'degenerate'],
    'the-collector':   ['necrophile', 'degenerate'],
    'the-butcher':     ['degenerate'],
    'the-executioner': ['necrophile']
  });
  // Roll the traits an NPC carries. A JOHN rarely has a high-powered trait (~8% degenerate, ~3%
  // masochist, ~1% necrophile). A FRIEND uses his archetype's innate set + a small extra degenerate
  // chance. These gate corpse-use willingness + pricing (corpseUseWillingness below).
  function rollNpcTraits(archetypeId, isFriend, rng) {
    const r = rng || Math.random;
    if (isFriend) {
      const innate = (FRIEND_TRAITS[archetypeId] || []).slice();
      if (r() < 0.2 && !innate.includes('degenerate')) innate.push('degenerate');
      return innate;
    }
    const t = [];
    if (r() < 0.08) t.push('degenerate');
    if (r() < 0.03) t.push('masochist');
    if (r() < 0.01) t.push('necrophile');
    return t;
  }
  // Will this NPC fuck a corpse at this decay stage, and at what pay multiplier? Stages: fresh (<2
  // game days) anyone the corpse-use toggle allows; ripe (2-8) + rotted (8-16) only a trait-bearer
  // (ordinary clients balk), the rot itself commanding a premium for the rare trait; bones (16+) a
  // stray degenerate pays CENTS while the very rare necrophile/masochist pays HIGH DOLLAR.
  function corpseUseWillingness(traits, decayDays) {
    traits = traits || [];
    const has = t => traits.includes(t);
    if (decayDays < 2) return { willing: true, payMult: 1.0, note: 'fresh — anyone' };
    if (decayDays < 8) {
      if (has('necrophile')) return { willing: true, payMult: 1.4, note: 'ripe — necrophile premium' };
      if (has('masochist') || has('degenerate')) return { willing: true, payMult: 1.15, note: 'ripe — trait client' };
      return { willing: false, payMult: 0, note: 'ripe — balks' };
    }
    if (decayDays < 16) {
      if (has('necrophile')) return { willing: true, payMult: 2.2, note: 'rotted — necrophile pays for the rot' };
      if (has('masochist')) return { willing: true, payMult: 1.8, note: 'rotted — masochist pays for the rot' };
      return { willing: false, payMult: 0, note: 'rotted — only a trait fiend will touch it' };
    }
    // bones
    if (has('necrophile')) return { willing: true, payMult: 3.0, note: 'bones — rare high-dollar necrophile' };
    if (has('masochist')) return { willing: true, payMult: 2.4, note: 'bones — rare high-dollar masochist' };
    if (has('degenerate')) return { willing: true, payMult: 0.08, note: 'bones — a stray degenerate pays cents' };
    return { willing: false, payMult: 0, note: 'bones — no one' };
  }

  function rollFriendArchetype(rng) {
    const entries = Object.entries(FRIEND_ARCHETYPES);
    const total = entries.reduce((t, [, a]) => t + (a.arrivalWeight || 0), 0);
    let roll = (rng || Math.random)() * total;
    for (const [id, a] of entries) { roll -= (a.arrivalWeight || 0); if (roll <= 0) return id; }
    return entries[entries.length - 1][0];
  }

  // johns + friends need an identity so a multi-party scene can name them and the
  // model knows WHO the player is addressing ("tell Marcus to..."). Mint a name + pronouns per
  // encounter. Johns get a first name; friends keep their archetype title ("The Butcher") as the
  // recognizable handle but still carry a name + pronouns for dialogue.
  const JOHN_NAMES = [
    'Marcus', 'Vince', 'Dale', 'Roy', 'Gus', 'Hank', 'Sal', 'Eddie', 'Frank', 'Otis',
    'Cyrus', 'Bruno', 'Lou', 'Wade', 'Carl', 'Moe', 'Rex', 'Dom', 'Saul', 'Karl'
  ];
  // All johns/friends are male NPCs in this content; pronouns kept as a field so the prompt + UI
  // can address them unambiguously and the model never confuses them with the girl ("she").
  const NPC_PRONOUNS = { subject: 'he', object: 'him', possessive: 'his' };
  function pickFrom(arr, rng) { return arr[Math.floor((rng || Math.random)() * arr.length) % arr.length]; }
  function mintNpcIdentity(archetypeId, opts = {}) {
    const isFriend = !!opts.isFriend;
    const arc = isFriend ? FRIEND_ARCHETYPES[archetypeId] : JOHN_ARCHETYPES[archetypeId];
    const name = pickFrom(JOHN_NAMES, opts.rng);
    const title = arc ? arc.displayName : (isFriend ? 'Friend' : 'John');
    return {
      name,
      pronouns: NPC_PRONOUNS,
      archetype: archetypeId,
      isFriend,
      // What the player + model SEE/address him by — a friend leads with his title, a john by name.
      handle: isFriend ? `${title} (${name})` : `${name} the ${title.toLowerCase()}`,
      // his PERSISTENT visual build, carried on the minted identity so image + chat
      // injection render the same man every time. Friend → archetype build; john → name-deterministic.
      appearance: appearanceFor({ archetype: archetypeId, isFriend, name }, opts.creepLevel),
      // the traits he carries, gating his corpse-use willingness + pricing.
      traits: rollNpcTraits(archetypeId, isFriend, opts.rng)
    };
  }

  // Pick a john archetype weighted by arrivalWeight + pregnantWantBias if applicable.
  // Zero-weight archetypes (postmortem-john) are excluded from the rotation — they get
  // forced into play by direct lookup in whore-out when the girl's encounterState matches.
  function rollJohnArchetype(rng, opts = {}) {
    const isPregnant = !!opts.isPregnant;
    const entries = Object.entries(JOHN_ARCHETYPES).filter(([, a]) => (a.arrivalWeight || 0) > 0);
    const weighted = entries.map(([id, a]) => {
      const w = isPregnant
        ? a.arrivalWeight * (a.pregnantWantBias || 1.0)
        : a.arrivalWeight;
      return [id, w];
    });
    const total = weighted.reduce((t, [, w]) => t + w, 0);
    let roll = (rng || Math.random)() * total;
    for (const [id, w] of weighted) {
      roll -= w;
      if (roll <= 0) return id;
    }
    return weighted[weighted.length - 1][0];
  }

  // Pick acts from this john's preferences — returns an array of 1-3 act tags.
  function rollJohnActs(archetypeId, rng) {
    const a = JOHN_ARCHETYPES[archetypeId];
    if (!a) return ['sex-gentle'];
    const r = rng || Math.random;
    const preferred = a.permittedActsPreference;
    const count = 1 + Math.floor(r() * Math.min(3, preferred.length));
    const shuffled = [...preferred].sort(() => r() - 0.5);
    return shuffled.slice(0, count);
  }

  window.DMTHTemplates = window.DMTHTemplates || {};
  // Note: DMTHTemplates is frozen elsewhere — this is a sibling registry.
  window.DMTHJohnArchetypes = Object.freeze({
    JOHN_ARCHETYPES,
    FRIEND_ARCHETYPES,
    FRIEND_KINKS,
    FRIEND_APPEARANCE,
    JOHN_BUILDS,
    JOHN_NAMES,
    NPC_PRONOUNS,
    mintNpcIdentity,
    appearanceFor,
    rollJohnArchetype,
    rollFriendArchetype,
    rollJohnActs,
    girlTraitTokens,
    friendMatch,
    NPC_TRAITS,
    FRIEND_TRAITS,
    rollNpcTraits,
    corpseUseWillingness
  });
})();
