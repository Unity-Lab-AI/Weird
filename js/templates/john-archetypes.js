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

  // FRIENDS.1/.2 — "friends" are special recurring visitors, RARER and FAR more extreme than
  // normal johns. When the player toggles them on for a girl, a slice of arrivals become a
  // friend who uses an EXTREME act and a unique near-kill ability — a direct ~40-60 health drop
  // (he'll nearly kill her). Pays a fortune. Every friend visit is logged to her history for the
  // death-dossier / trophy. Friends are gated to held captives (never corpses).
  const FRIEND_ARCHETYPES = Object.freeze({
    'the-butcher': {
      displayName: 'The Butcher', arrivalWeight: 10, payRange: [400, 700],
      healthDrop: [40, 55], bruisesAdded: 6, johnActionId: 'extreme-beatdown',
      permittedActsPreference: ['sex-rough', 'choke', 'humiliation'],
      ability: 'works her over until she\'s a broken, bleeding heap — and pays a fortune for the privilege',
      dialogueTone: 'methodical and merciless, no rush, no mercy'
    },
    'the-surgeon': {
      displayName: 'The Surgeon', arrivalWeight: 8, payRange: [450, 800],
      healthDrop: [35, 50], bruisesAdded: 3, johnActionId: 'masochist-overload',
      permittedActsPreference: ['toys', 'pain', 'humiliation'],
      ability: 'brings his own instruments and opens her up clinical and slow',
      dialogueTone: 'cold, invasive, talks her through every cut'
    },
    'the-pack': {
      displayName: 'The Pack', arrivalWeight: 7, payRange: [500, 950],
      healthDrop: [45, 60], bruisesAdded: 5, johnActionId: 'extreme-rough-anal',
      permittedActsPreference: ['sex-rough', 'anal', 'creampie', 'bukkake'],
      ability: 'a whole crew at once — they take turns wrecking every hole until she can\'t stand',
      dialogueTone: 'a baying pack, egging each other on'
    },
    'the-strangler': {
      displayName: 'The Strangler', arrivalWeight: 6, payRange: [450, 850],
      healthDrop: [40, 55], bruisesAdded: 2, johnActionId: 'extreme-choke-out',
      permittedActsPreference: ['choke', 'sex-rough'],
      ability: 'fucks her right to the edge of death and drags her back, over and over',
      dialogueTone: 'gets off on the moment her eyes roll back, pays to chase it'
    },
    'the-collector': {
      displayName: 'The Collector', arrivalWeight: 6, payRange: [500, 900],
      healthDrop: [30, 45], bruisesAdded: 4, johnActionId: 'extreme-degrade',
      permittedActsPreference: ['humiliation', 'sex-rough', 'toys'],
      ability: 'marks and ruins her like he\'s claiming a trophy, wants a piece of her to keep',
      dialogueTone: 'collector\'s patience, cataloguing every part of her out loud as he wrecks it'
    },
    'the-priest': {
      displayName: 'The Defrocked Priest', arrivalWeight: 5, payRange: [450, 800],
      healthDrop: [32, 48], bruisesAdded: 3, johnActionId: 'masochist-overload',
      permittedActsPreference: ['humiliation', 'pain', 'sex-rough'],
      ability: 'turns her ruin into a ritual — slow, reverent, obscene, sermonizing as he defiles her',
      dialogueTone: 'mock-holy cadence, calls it penance, savors her shame'
    },
    'the-twins': {
      displayName: 'The Twins', arrivalWeight: 5, payRange: [550, 1000],
      healthDrop: [42, 58], bruisesAdded: 5, johnActionId: 'extreme-rough-anal',
      permittedActsPreference: ['sex-rough', 'anal', 'creampie', 'bukkake'],
      ability: 'two of them at once, never giving her a second\'s rest between holes',
      dialogueTone: 'finishing each other\'s sentences, egging each other on over her'
    }
  });
  function rollFriendArchetype(rng) {
    const entries = Object.entries(FRIEND_ARCHETYPES);
    const total = entries.reduce((t, [, a]) => t + (a.arrivalWeight || 0), 0);
    let roll = (rng || Math.random)() * total;
    for (const [id, a] of entries) { roll -= (a.arrivalWeight || 0); if (roll <= 0) return id; }
    return entries[entries.length - 1][0];
  }

  // NPC-IDENT.1 — johns + friends need an identity so a multi-party scene can name them and the
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
      handle: isFriend ? `${title} (${name})` : `${name} the ${title.toLowerCase()}`
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
    JOHN_NAMES,
    NPC_PRONOUNS,
    mintNpcIdentity,
    rollJohnArchetype,
    rollFriendArchetype,
    rollJohnActs
  });
})();
