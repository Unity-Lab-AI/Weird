// DUNGEON MASTER: THE HUNT — central per-action stat-impact spec.
// Every actionable button (sex, drugs, violence, care) carries its own stamina/health/
// mood/arousal/bondXP delta envelope. Some heal, some hurt, some drain stamina, some
// rebuild it. This file is the single source of truth for those deltas.
//
// Every actionable button or in-dungeon event consults this table to learn its per-stat
// delta envelope. Keys are action IDs; values are signed integer deltas applied to body
// fields. Negative = drains, positive = boosts. UI tooltips can preview costs by reading
// the entry directly.
//
// Schema (all fields optional, default 0):
//   {
//     stamina:   -100..+100   // 0-100 capped, drains or boosts
//     health:    -100..+100   // 0-100 capped, harder to refill than stamina
//     mood:      -20..+20     // mood-shift word selection
//     arousal:   -30..+30     // 0-100 capped
//     wetness:   -30..+30
//     bruises:   -10..+15     // 0-99 capped
//     cumLoad:   -2..+2       // float, no upper cap
//     bondXP:    -20..+20
//     bondDebt:  -20..+20
//     notoriety: -5..+5       // bumps the wallet, not the body
//     escapeRisk: -0.12..+0.12 // explicit override on the 0-1 escape-risk bar. When omitted,
//                              // applyAction DERIVES it from the act's nature: loving /
//                              // indoctrinating acts (bondXP↑, mood↑, forgiveness) lower her
//                              // fighting spirit + the bar; violence / degradation (bondDebt↑,
//                              // bruises↑) raise it. Set explicitly only where physical
//                              // suppression isn't captured by bond/mood (restraint, sedation).
//     notes:     string       // human-readable label, used in tooltip previews
//   }

(function () {
  'use strict';

  const ACTIONS = Object.freeze({
    // -----------------------------------------------------------------
    // CARETAKING — generally restore stamina/health/bond
    // -----------------------------------------------------------------
    'feed-basic': {
      stamina: +6, health: +2, mood: +3, bondXP: +1, satisfaction: +1,
      notes: 'Hand-feed your pet a basic meal — light stamina + health restore, modest bond. A fed thing learns to crave the hand that feeds it.'
    },
    'feed-gourmet': {
      stamina: +12, health: +5, mood: +6, bondXP: +3, satisfaction: +1,
      notes: 'Gourmet meal — stronger restore + bond bump. She remembers who fed her well.'
    },
    'water-bottled': {
      stamina: +4, health: +2, mood: +2, bondXP: +1, satisfaction: 0,
      notes: 'Bottled water — hydration restore.'
    },
    'water-filtered': {
      stamina: +6, health: +3, mood: +3, bondXP: +2, satisfaction: 0,
      notes: 'Filtered water — better hydration + small bond bump.'
    },
    'heal': {
      stamina: +10, health: +20, mood: +6, bruises: -10, satisfaction: +1,
      notes: 'Patch your broken toy back up — major bruise wipe + real health restore, so she\'s fresh and unmarked to ruin all over again.'
    },
    'rest-tick': {                  // passive, fired from tick.js when no scene happens
      stamina: +8, health: +2, satisfaction: 0,
      notes: 'Passive rest — quiet tick, mild stamina regen.'
    },

    // -----------------------------------------------------------------
    // LOVE / SENSUAL — gentle care + bond restoration. Rebuilds stamina/health/Stockholm
    // when she's low. Reduces accumulated bondDebt — past harshness can be forgiven.
    // -----------------------------------------------------------------
    'love-kiss-gentle': {
      stamina: +4, health: +2, mood: +5, bondXP: +3, bondDebt: -1, satisfaction: +1,
      notes: 'Kiss her soft and slow until she kisses back — the grooming that melts a captive into thinking she wants you. Small stamina + a bond bump, mood lift.'
    },
    'love-cuddle': {
      stamina: +8, health: +4, mood: +6, bondXP: +4, bondDebt: -2, satisfaction: +2,
      notes: 'Pull her trembling body into yours and hold her like you love her — the warmth that makes her forgive what you did. Stronger stamina restore + bond bump + bond-debt forgiven.'
    },
    'love-praise': {
      stamina: +2, health: +1, mood: +8, bondXP: +5, bondDebt: -1, satisfaction: +1,
      notes: 'Whisper how good she is, what a perfect little thing she\'s becoming for you — the praise that hooks deep into a broken girl. Heavy mood + bond, minor body restore.'
    },
    'love-massage': {
      stamina: +12, health: +6, mood: +5, bondXP: +3, bondDebt: -2, satisfaction: +2,
      notes: 'Work your hands down her bare body till the fight drains out of her muscles — major stamina + health restore, modest bond. She hates how good it feels.'
    },
    'love-bathe-her': {
      stamina: +10, health: +8, mood: +6, bondXP: +4, bondDebt: -2, cumLoad: -3, satisfaction: +2,
      notes: 'Strip her down and wash every inch of your property by hand — strong health + stamina rebuild, real grooming intimacy, and it rinses the cum-load out of her in the water.'
    },
    'wipe-down': {
      stamina: +2, health: +1, mood: +3, bondXP: +1, bondDebt: -1, cumLoad: -2, satisfaction: +1,
      notes: 'Wipe her down — drains accumulated cum. Faster than a full bath, less recovery.'
    },
    'love-feed-by-hand': {
      stamina: +8, health: +5, mood: +7, bondXP: +5, bondDebt: -2, satisfaction: +2,
      notes: 'Feed her by hand — caretaking intimacy. Strong bond gain.'
    },
    'love-hair-brush': {
      stamina: +4, health: +2, mood: +5, bondXP: +4, bondDebt: -1, satisfaction: +1,
      notes: 'Brush her hair — slow, intimate, rebuilds trust.'
    },
    'love-lullaby': {
      stamina: +6, health: +2, mood: +8, bondXP: +5, bondDebt: -2, satisfaction: +1,
      notes: 'Lullaby — sing or hum her to sleep. Big mood + bond.'
    },
    'love-hold-her': {
      stamina: +5, health: +3, mood: +6, bondXP: +4, bondDebt: -1, satisfaction: +1,
      notes: 'Just hold her — quiet, no demands. Steady bond gain.'
    },
    'love-aftercare': {
      stamina: +15, health: +10, mood: +10, bondXP: +6, bondDebt: -4, bruises: -2, satisfaction: +3,
      notes: 'After you\'ve wrecked her — water, a blanket, salve on the bruises, hold her shaking body till she sleeps. The tenderness after the cruelty is what truly breaks her into needing you.'
    },
    'love-forehead-kiss': {
      stamina: +2, health: +1, mood: +4, bondXP: +3, bondDebt: -1, satisfaction: +1,
      notes: 'Forehead kiss — small but emotionally weighted.'
    },
    'love-promise-sweet': {
      stamina: +1, health: 0, mood: +6, bondXP: +5, bondDebt: -2, satisfaction: +1,
      notes: 'Whispered promise — even if hollow, she\'ll cling to it. Big bond gain.'
    },

    // -----------------------------------------------------------------
    // DRUGS — artificial stamina bumps + health hits
    // -----------------------------------------------------------------
    'drug-coke': {
      stamina: +20, health: -2, mood: +5, arousal: +5, satisfaction: +2,
      notes: 'Cocaine — artificial stamina spike, small health cost.'
    },
    'drug-weed': {
      stamina: +3, health: 0, mood: +4, arousal: +3, satisfaction: +1,
      notes: 'Weed — mild stamina boost, no health cost. Relaxes her.'
    },
    'drug-mdma': {
      stamina: +15, health: -3, mood: +12, bondXP: +2, arousal: +12, wetness: +15, satisfaction: +2,
      notes: 'MDMA — euphoric stamina lift + arousal flood. Small health hit.'
    },
    'drug-acid': {
      stamina: +5, health: -2, mood: +8, arousal: +5, satisfaction: +2,
      notes: 'Acid — long curve. Mind-altering more than body-altering.'
    },
    'drug-whiskey': {
      stamina: -3, health: -3, mood: +5, arousal: +6, satisfaction: +1,
      notes: 'Whiskey — actually drops stamina (depressant) but loosens her up.'
    },
    'drug-ketamine': {
      stamina: -15, health: -4, mood: -5, escapeRisk: -0.06, satisfaction: +2,
      notes: 'Ketamine — heavy stamina drain (dissociation), health hit. Dissociated = can\'t plan an escape (lowers escape risk).'
    },
    'drug-tranquilizer': {
      stamina: -30, health: -2, mood: -8, escapeRisk: -0.12, satisfaction: +3,
      notes: 'Tranquilizer dart — knocks her out cold. Heavy stamina drain. Unconscious = escape risk craters.'
    },

    // -----------------------------------------------------------------
    // SEXUAL — drain stamina + arousal/wetness/cumLoad shifts
    // -----------------------------------------------------------------
    'sex-gentle': {
      stamina: -8, health: 0, mood: +2, arousal: +12, wetness: +15, cumLoad: +0.6, bondXP: +2, satisfaction: +3,
      notes: 'Gentle sex — moderate stamina cost, positive mood + bond.'
    },
    'sex-rough': {
      stamina: -18, health: -3, mood: -4, arousal: +18, wetness: +20, cumLoad: +0.9, bruises: +2, bondDebt: +3, satisfaction: +5,
      notes: 'Rough sex — bigger stamina hit + bruise accumulation + bond-debt.'
    },
    'sex-anal': {
      stamina: -15, health: -2, mood: -2, arousal: +12, wetness: +10, cumLoad: +0.7, bondDebt: +2, satisfaction: +4,
      notes: 'Anal — high stamina cost, some bond debt.'
    },
    'sex-oral': {
      stamina: -6, health: -1, mood: 0, arousal: +8, wetness: +8, cumLoad: +0.5, satisfaction: +2,
      notes: 'Oral — lower stamina cost, no breeding risk (vag-only gate).'
    },
    'sex-cum-inside': {              // vaginal cum delivery — fires pregnancy conception roll
      stamina: -3, health: 0, mood: -2, cumLoad: +1.2, bondDebt: +2, satisfaction: +6,
      notes: 'Cum inside her pussy — adds bondDebt, fires pregnancy conception roll.'
    },
    // bloody-fucking acts (surfaced in the room only while she's ON her period). A taboo
    // PREMIUM — appropriately balanced : a notch above rough sex on
    // satisfaction, heavier humiliation, no health wreck.
    'period-fuck': {
      stamina: -16, health: -2, mood: -6, arousal: +16, wetness: +18, cumLoad: +0.9, bondDebt: +2, satisfaction: +8,
      notes: 'Bloody fuck — taking her while she bleeds. Depraved premium; she\'s sore + humiliated, you\'re thrilled.'
    },
    'period-oral': {
      stamina: -8, health: -1, mood: -7, arousal: +9, bondDebt: +2, satisfaction: +7,
      notes: 'Make her clean you off bloody with her mouth — degrading period oral. Strong satisfaction, real humiliation.'
    },
    // more on-the-rag (ragging) options . Balanced premiums.
    'period-creampie': {
      stamina: -15, health: -2, mood: -6, arousal: +14, wetness: +12, cumLoad: +1.0, bondDebt: +3, satisfaction: +9,
      notes: 'Breed her bloody — cum deep inside her while she\'s on the rag. Filthiest premium; fires the conception hook.'
    },
    'period-finger': {
      stamina: -5, health: -1, mood: -5, arousal: +12, wetness: +10, bondDebt: +1, satisfaction: +6,
      notes: 'Finger her bloody and smear it up her belly + over her tits — degrading, marks her red.'
    },

    // -----------------------------------------------------------------
    // VIOLENCE / HURTME — bruise accumulation + health hits
    // -----------------------------------------------------------------
    'slap': {
      stamina: -2, health: -3, mood: -8, bruises: +1, bondDebt: +3, satisfaction: +3,
      notes: 'Slap — small physical cost, mood hit, bruise.'
    },
    'choke': {
      stamina: -8, health: -5, mood: -6, arousal: +6, bruises: +2, bondDebt: +4, satisfaction: +5,
      notes: 'Choke — stamina drain + health hit + bond debt. Arousal spike for kink fit.'
    },
    'whip': {
      stamina: -10, health: -8, mood: -10, bruises: +4, bondDebt: +6, satisfaction: +6,
      notes: 'Whip — heavy bruise count + health hit. Bond-debt accumulates.'
    },
    'punch': {
      stamina: -5, health: -6, mood: -10, bruises: +3, bondDebt: +5, satisfaction: +4,
      notes: 'Punch — meaningful health hit + bruise + mood + bond debt.'
    },

    // -----------------------------------------------------------------
    // EXTREME / DEPRAVED — vile, disturbing acts. HEAVY tolls on the girl (health/stamina/
    // bruises/mood) but the biggest player-satisfaction payouts + the strongest film-value
    // markers (cumLoad + bruises + aftermath). Stacking these on ONE girl drains her health
    // toward death fast — the satisfaction the player wants has to be spread across the
    // roster or it kills her.    // -----------------------------------------------------------------
    'extreme-facefuck': {
      stamina: -12, health: -6, mood: -12, arousal: +10, cumLoad: +0.8, bruises: +2, bondDebt: +6, satisfaction: +7,
      notes: 'Brutal face-fuck — throat trauma, ruined makeup, gagging. Big satisfaction + film value, real health toll.'
    },
    'extreme-rough-anal': {
      stamina: -20, health: -8, mood: -14, arousal: +8, wetness: +6, cumLoad: +1.0, bruises: +3, bondDebt: +8, satisfaction: +8,
      notes: 'Tearing rough anal — heavy stamina + health hit, big bond-debt, premium film markers.'
    },
    'extreme-breeding-rape': {
      stamina: -10, health: -5, mood: -14, arousal: +6, cumLoad: +1.6, bruises: +3, bondDebt: +9, satisfaction: +9,
      notes: 'Forced breeding — max cum delivery + bond-debt. Huge satisfaction + film value. Pregnancy risk via scene tags.'
    },
    'extreme-degrade': {
      stamina: -4, health: -3, mood: -16, arousal: +5, bruises: +1, bondDebt: +8, satisfaction: +6,
      notes: 'Total degradation — piss, spit, slurs, filming her ruin. Destroys mood + bond, strong humiliation film value.'
    },
    'extreme-beatdown': {
      stamina: -10, health: -18, mood: -16, bruises: +8, bondDebt: +10, satisfaction: +6,
      notes: 'Full beatdown — massive bruising + health crater. Brutal film content. Will kill a low-health captive.'
    },
    'extreme-choke-out': {
      stamina: -8, health: -12, mood: -10, arousal: +12, wetness: +6, bruises: +4, bondDebt: +7, satisfaction: +9,
      notes: 'Choke her to the edge of blackout — erotic asphyxiation. Huge satisfaction + film value. REAL death risk at low health.'
    },
    // Psycho-masochist tier — for a girl who CRAVES the pain (masochist affect / high lust):
    // arousal floods, bond actually RISES, she begs for more. On anyone else it's pure trauma.
    'masochist-overload': {
      stamina: -12, health: -8, mood: -2, arousal: +18, wetness: +18, cumLoad: +0.6, bruises: +5, bondXP: +4, satisfaction: +8,
      notes: 'Psycho-masochist overload — she begs for the pain. Arousal + wetness flood, bruises stack, bond RISES (for a masochist). Big satisfaction. On a non-masochist it is just damage.'
    },

    // -----------------------------------------------------------------
    // TORTURE  — straight-up evil, NON-sexual torture. SEVERE health damage + huge
    // bond-debt + mood crater + premium film/satisfaction value. These are the acts that wreck a
    // girl fast — spread across the roster or heal her between, or they kill her (several are
    // ACT_CAN_KILL). Distinct from the sexual Extreme tab.    // -----------------------------------------------------------------
    'torture-rack': {
      stamina: -14, health: -14, mood: -16, bruises: +5, bondDebt: +9, satisfaction: +7,
      notes: 'The rack — winch her joints apart until tendons tear and shoulders pop. Agonizing, crippling, premium content.'
    },
    'torture-flay': {
      stamina: -16, health: -20, mood: -20, bruises: +8, bondDebt: +12, satisfaction: +9,
      notes: 'Flay strips of skin off her back and thighs — needs a blade. Massive health crater, top-tier gore film value. Can kill a low-health girl.'
    },
    'torture-burn': {
      stamina: -10, health: -12, mood: -16, bruises: +6, bondDebt: +9, satisfaction: +7,
      notes: 'Iron, lighter, cigarettes — cook her skin until it blisters and weeps. Lasting burns, big bond-debt.'
    },
    'torture-break': {
      stamina: -10, health: -10, mood: -14, bruises: +6, bondDebt: +8, satisfaction: +6,
      notes: 'Break her fingers and toes one joint at a time — slow, methodical, crippling.'
    },
    'torture-waterboard': {
      stamina: -12, health: -8, mood: -18, bondDebt: +9, satisfaction: +6,
      notes: 'Waterboard her to the edge of drowning over and over — terror + helplessness, low marks, huge mood + bond-debt toll.'
    },
    'torture-electro': {
      stamina: -10, health: -12, mood: -14, bruises: +4, bondDebt: +9, escapeRisk: -0.10, satisfaction: +7,
      notes: 'Live current to the wet parts — convulsions, scorch marks, instant compliance. Lowers her escape will.'
    },
    'torture-nail': {
      stamina: -10, health: -10, mood: -15, bruises: +5, bondDebt: +9, satisfaction: +7,
      notes: 'Drive nails and pins under her nails and through soft tissue — precise, excruciating, leaves her shaking.'
    },
    'torture-acid': {
      stamina: -14, health: -16, mood: -18, bruises: +6, bondDebt: +11, satisfaction: +8,
      notes: 'Caustic splashed across her skin — eats down to the meat, scars forever. Can kill a low-health girl.'
    },

    // -----------------------------------------------------------------
    // RESTRAINT — low stamina, mood drop
    // -----------------------------------------------------------------
    'restrain': {
      stamina: -1, health: 0, mood: -3, bondDebt: +1, escapeRisk: -0.05, satisfaction: +1,
      notes: 'Restrain her — minimal physical cost, mood drop, bond-debt blip. Tighter restraint physically suppresses escape risk.'
    },

    // -----------------------------------------------------------------
    // PASSIVE STARVATION / DEHYDRATION — applied by tick.js when supplies hit 0
    // -----------------------------------------------------------------
    // Drain rates are intentionally soft. Previous combined starve+dehydrate drain
    // (-8 health/tick) plus 30-second ticks meant a captive went from 100 health to
    // terminal in ~10 real minutes even with regular feeding. New rates give the player
    // a meaningful window to react (~30-40 min from healthy to critical if completely
    // neglected) while still rewarding attention.
    'starve-tick': {
      stamina: -1, health: -1, mood: -3,
      notes: 'Food at 0 — gentle starvation drain. Mood hits harder than health.'
    },
    'dehydrate-tick': {
      stamina: -2, health: -2, mood: -4,
      notes: 'Water at 0 — dehydration drains slightly faster than starvation but still gentle.'
    },
    'chronic-bruise-tick': {
      stamina: -1, health: -1, mood: -2,
      notes: 'Bruises ≥ 15 — chronic injury drain per tick. Soft.'
    },

    // -----------------------------------------------------------------
    // WHORE-OUT — johns drain stamina per encounter
    // -----------------------------------------------------------------
    'john-gentle': {
      stamina: -5, health: 0, mood: -2, cumLoad: +0.5, bondDebt: +2,
      notes: 'Gentle john — moderate stamina cost, light bond debt.'
    },
    'john-rough': {
      stamina: -15, health: -3, mood: -8, cumLoad: +1.0, bruises: +1, bondDebt: +5,
      notes: 'Rough john — heavy stamina cost + health hit + bond debt.'
    },
    'john-quick': {
      stamina: -3, health: 0, mood: -1, cumLoad: +0.3, bondDebt: +1,
      notes: 'Quick john — minimal stamina cost, premium per-minute pay.'
    },
    'john-degrader': {
      stamina: -10, health: -2, mood: -15, cumLoad: +0.8, bondDebt: +8,
      notes: 'Degrader john — mood and bond destruction.'
    },
    // Postmortem-john — no body shifts apply meaningfully to a corpse (stamina/health/
    // mood are already terminal). cumLoad still accrues so recordings still get the
    // "ruined" multiplier; satisfaction registers for the player.
    'john-postmortem': {
      stamina: 0, health: 0, mood: 0, cumLoad: +1.0, bondDebt: 0, satisfaction: +1,
      notes: 'Postmortem use — body inert. cumLoad accrues; no other vital shifts apply on a corpse.'
    }
  });

  // Maps an action to the recent-act aftermath tag stamped on the body. imaging.js
  // actAftermathTokens() reads body.recentActTag (+ recentActAt game-min, TTL-faded) and
  // renders the fresh aftermath of what was just done to her in her next image. Only acts
  // that visibly mark the body are tagged; the latest tagged act wins.
  const AFTERMATH_TAGS = Object.freeze({
    'sex-rough':       'rough',
    'sex-anal':        'anal',
    'sex-cum-inside':  'creampied',
    'sex-oral':        'throated',
    'sex-gentle':      'used',
    'choke':           'choked',
    'whip':            'whipped',
    'punch':           'beaten',
    'slap':            'slapped',
    'john-rough':      'rough',
    'john-degrader':   'used',
    'extreme-facefuck':      'throated',
    'extreme-rough-anal':    'anal',
    'extreme-breeding-rape': 'creampied',
    'extreme-degrade':       'used',
    'extreme-beatdown':      'beaten',
    'extreme-choke-out':     'choked',
    'masochist-overload':    'rough',
    'love-kiss-gentle':      'kissed',
    'love-forehead-kiss':    'kissed',
    'love-praise':           'kissed',
    'love-cuddle':           'caressed',
    'love-massage':          'caressed',
    'love-hold-her':         'caressed',
    'love-hair-brush':       'caressed',
    // fill the appearance-changing gaps so EVERY such act marks her next image.
    'love-aftercare':        'cleaned',   // water + blanket + bruises treated → cleaned-up look
    'love-bathe-her':        'cleaned',
    'wipe-down':             'cleaned',
    'heal':                  'cleaned',   // patched up + bruises reset → fresh, cared-for
    'love-lullaby':          'caressed',
    'love-feed-by-hand':     'caressed',
    'love-promise-sweet':    'kissed',
    'john-gentle':           'used',
    'john-quick':            'used',
    // torture leaves visible damage on her next image (battered / welted-raw).
    'torture-rack':          'beaten',
    'torture-burn':          'beaten',
    'torture-break':         'beaten',
    'torture-electro':       'beaten',
    'torture-nail':          'beaten',
    'torture-flay':          'whipped',
    'torture-acid':          'whipped',
    'torture-waterboard':    'beaten',
    //  / bloody-fuck acts mark her next image (blood smear), TTL-faded.
    'period-fuck':           'bloody-fucked',
    'period-oral':           'bloodied-mouth',
    'period-creampie':       'bloody-fucked',
    'period-finger':         'bloody-fucked'
  });

  // classify an action into the broad category her hidden kink like/dislike keys on.
  // Returns null for acts that don't map to a kink category (feed/water/heal/rest/drug-curve admin).
  function actionCategory(actionId) {
    if (!actionId) return null;
    if (/^drug-/.test(actionId)) return 'drugs';
    if (/^love-|^heal$|^wipe-down$|^sex-gentle$/.test(actionId)) return 'tenderness';
    if (/rough|masochist/.test(actionId)) return 'rough';
    if (/anal/.test(actionId)) return 'anal';
    if (/oral|facefuck/.test(actionId)) return 'oral';
    if (/choke/.test(actionId)) return 'choke';
    if (/^slap$|^whip$|^punch$|beatdown|^torture-/.test(actionId)) return 'pain';
    if (/degrad/.test(actionId)) return 'degradation';
    return null;
  }

  // Threshold below which actions become gated. Returns the minimum stamina required
  // for the action to land cleanly. Stamina < required = action still runs but takes
  // a bigger health hit + bigger mood penalty.
  const STAMINA_THRESHOLD_FOR_STRAIN = 20;

  // a girl absorbs ~XTOL_LIMIT extreme acts before she's spent and needs recovery
  // (heal / caress / love / feed / water / time). Care acts + rest walk the streak back down;
  // pushing past the limit piles extra damage on top.
  const XTOL_LIMIT = 10;
  const EXTREME_ACTS_FOR_TOL = new Set(['extreme-facefuck', 'extreme-rough-anal', 'extreme-breeding-rape', 'extreme-degrade', 'extreme-beatdown', 'extreme-choke-out', 'masochist-overload']);
  // the dedicated evil-torture acts. They count toward extreme-act tolerance too.
  const TORTURE_ACTS = new Set(['torture-rack', 'torture-flay', 'torture-burn', 'torture-break', 'torture-waterboard', 'torture-electro', 'torture-nail', 'torture-acid']);
  for (const t of TORTURE_ACTS) EXTREME_ACTS_FOR_TOL.add(t);

  //  / acts that CAN finish a captive when they cross her death floor.
  // The kill only lands when her remaining health <= the act's damage (the player already got the
  // DEATHWARN confirm), so a managed/healed girl never dies to a routine act — death is a risk you
  // choose, not attrition. A girl corpsing under the player's own hands pays a snuff bonus too.
  const ACT_CAN_KILL = new Set([...EXTREME_ACTS_FOR_TOL, 'whip', 'punch', 'choke']);

  // CRIMEPERK  — the more fucked-up the crime, the BIGGER the player's stat gains. This
  // multiplier scales satisfaction + sex-drive + DEPRAVITY XP by how depraved the act is, so
  // torture/extreme acts pump the player's stats far harder than vanilla use. Rewards going dark.
  function crimeMultiplier(actionId) {
    if (TORTURE_ACTS.has(actionId)) return 1.6;             // straight-up torture — the worst, the best stats
    if (EXTREME_ACTS_FOR_TOL.has(actionId)) return 1.35;     // extreme/depraved sexual acts
    if (actionId === 'whip' || actionId === 'punch' || actionId === 'choke' || actionId === 'slap') return 1.15;
    return 1;                                                // vanilla care/sex — baseline
  }

  // the ONLY way Stockholm degrades: the most extreme BRUTAL acts traumatize her
  // and subtract bond XP (recomputed into a possible level drop). Routine use never degrades it.
  const STOCKHOLM_SETBACK = { 'extreme-beatdown': -30, 'extreme-choke-out': -22 };
  // trauma bonding: a rough act that isn't a brutal setback grants a sliver of
  // bond XP, so REGULAR ABUSE (alongside loving/care acts) slowly indoctrinates over game-weeks.
  const STOCKHOLM_TRAUMA_XP = 1;

  // higher Stockholm lifts her MAX health ceiling above 100 (a fully-bonded captive
  // is hardier; heal/rest can carry her up to ~130 at L9). Used everywhere health is clamped at top.
  function maxHealthFor(girl) {
    const lvl = (girl && girl.bond && girl.bond.bondLevel) || 0;
    // a 🩹 pain-proof girl carries a higher max-health ceiling so she survives more.
    const specBonus = window.DMTHGame.specialize ? window.DMTHGame.specialize.maxHealthBonus(girl) : 0;
    return 100 + Math.min(30, lvl * 3) + specBonus;
  }

  // game-minutes each physical act consumes. anchors: a kiss ~1 min, a
  // marathon-to-death torture session ~hours (the longest single acts here run ~2 hrs; chaining
  // them is how you burn a whole night). Exact-id lookup first, then prefix/category, then a
  // short default. These are GAME minutes (1 real second = 1 game minute, 1440 = a game day).
  const ACTION_DURATION_MIN = {
    // featherweight — a moment of tenderness
    'love-forehead-kiss': 1, 'love-kiss-gentle': 2, 'love-praise': 2, 'love-promise-sweet': 3,
    'wipe-down': 8, 'love-lullaby': 12, 'love-hair-brush': 15, 'love-feed-by-hand': 15,
    'love-hold-her': 20, 'love-cuddle': 25, 'love-massage': 30, 'love-bathe-her': 35,
    'love-aftercare': 45, 'heal': 30,
    // sex
    'sex-oral': 15, 'sex-cum-inside': 20, 'sex-rough': 25, 'sex-gentle': 30, 'sex-anal': 30,
    'period-finger': 10, 'period-oral': 15, 'period-creampie': 22, 'period-fuck': 25,
    // restraint / quick violence — brutal but fast
    'restrain': 5, 'slap': 1, 'punch': 2, 'choke': 3, 'whip': 10,
    // extreme — long, heavy sessions
    'extreme-choke-out': 20, 'extreme-beatdown': 25, 'extreme-facefuck': 30, 'extreme-degrade': 35,
    'extreme-breeding-rape': 40, 'extreme-rough-anal': 45,
    // torture — methodical, runs into the hours
    'torture-electro': 45, 'torture-burn': 60, 'torture-waterboard': 60, 'torture-nail': 70,
    'torture-break': 75, 'torture-acid': 80, 'torture-rack': 90, 'torture-flay': 120,
    // johns (proxy acts) — whore-out owns john pacing; keep these modest
    'john-quick': 8, 'john-gentle': 20, 'john-postmortem': 20, 'john-rough': 25, 'john-degrader': 30
  };
  const ACTION_DURATION_PREFIX = [
    ['feed-', 10], ['water-', 5], ['love-', 15], ['sex-', 25], ['period-', 18],
    ['extreme-', 35], ['torture-', 75], ['john-', 20]
  ];
  function actionDurationMin(actionId) {
    if (ACTION_DURATION_MIN[actionId] != null) return ACTION_DURATION_MIN[actionId];
    for (const [pfx, mins] of ACTION_DURATION_PREFIX) {
      if (String(actionId).startsWith(pfx)) return mins;
    }
    return 5;   // any unlisted act burns a short default
  }

  // Apply an action's deltas to a girl. Optional opts:
  //   { strain: true } — applies a strain multiplier (1.5x cost on negative effects)
  function applyAction(girlId, actionId, opts = {}) {
    const action = ACTIONS[actionId];
    if (!action) {
      console.warn(`[action-effects] unknown action: ${actionId}`);
      return { ok: false, reason: 'unknown action' };
    }
    const girl = window.DMTHGame.state.getGirl(girlId);
    if (!girl) return { ok: false, reason: 'no such girl' };

    const strainMul = opts.strain ? 1.5 : 1.0;
    const body = { ...girl.body };
    const bond = { ...girl.bond };
    const mood = { ...girl.mood };

    if (action.health) {
      const d = action.health < 0 ? action.health * strainMul : action.health;
      body.health = clamp((body.health ?? 100) + d, 0, maxHealthFor(girl));   //  ceiling
    }
    if (action.stamina) {
      const d = action.stamina < 0 ? action.stamina * strainMul : action.stamina;
      // Stamina capped by current health. Low health pulls down the stamina
      // ceiling so a half-dead captive can't run at full stamina.
      const ceiling = body.health ?? 100;
      body.stamina = clamp((body.stamina ?? 70) + d, 0, ceiling);
    }

    // Feed/water actions reset the corresponding "last fed at" / "last watered at"
    // game-clock timestamps so the grace-period
    // model in tickStaminaHealth resets. Any action id starting with 'feed-'
    // touches lastFedAt; any starting with 'water-' touches lastWateredAt.
    if (window.DMTHGame.gameClock) {
      const now = window.DMTHGame.gameClock.now();
      if (actionId.startsWith('feed-')) body.lastFedAt = now;
      if (actionId.startsWith('water-')) body.lastWateredAt = now;
    }
    if (action.arousal) body.arousal = clamp((body.arousal ?? 0) + action.arousal, 0, 100);
    if (action.wetness) body.wetness = clamp((body.wetness ?? 0) + action.wetness, 0, 100);
    if (action.bruises) body.bruises = clamp((body.bruises ?? 0) + (action.bruises < 0 ? action.bruises : action.bruises * strainMul), 0, 99);
    // clamp cumLoad to her storage capacity (trained cap + any temporary modifier bonus).
    if (action.cumLoad) { const _cc = (window.DMTHGame.cumtool && window.DMTHGame.cumtool.effectiveCap) ? window.DMTHGame.cumtool.effectiveCap(body) : (body.cumLoadCap ?? 10); body.cumLoad = Math.max(0, Math.min(_cc, (body.cumLoad ?? 0) + action.cumLoad)); }

    // Mood was previously declared in 30+ ACTIONS entries but never applied. moodPressure
    // tracks cumulative drift so the model name reclassifies
    // at threshold boundaries. johnHappinessForGirl already reads mood.mood; this gives
    // the action-effects layer a way to push mood meaningfully.
    if (action.mood) {
      const moodDelta = action.mood < 0 ? action.mood * strainMul : action.mood;
      // Clamp cumulative pressure so it can't run away in either direction.
      mood.moodPressure = clamp((mood.moodPressure || 0) + moodDelta, -60, 60);
      // Monotonic ladder — the pressure band ALONE determines the action-driven mood, so there
      // are no dead-ends (acclimating/reciprocated can keep climbing or fall back cleanly).
      // The bond system owns the top moods (devoted/partner/dependent/fully-bonded); don't
      // stomp those — only reclassify when the current mood is action-driven.
      const BOND_OWNED = ['devoted', 'partner', 'dependent', 'fully-bonded'];
      if (!BOND_OWNED.includes(mood.mood)) {
        const p = mood.moodPressure;
        let m, e;
        if      (p <= -45) { m = 'broken';      e = '😵'; }
        else if (p <= -25) { m = 'traumatized'; e = '😞'; }
        else if (p <= -12) { m = 'subdued';     e = '😔'; }
        else if (p <=  -4) { m = 'wary';        e = '😐'; }
        else if (p <    6) { m = 'ambivalent';  e = '😶'; }
        else if (p <   16) { m = 'acclimating'; e = '🙂'; }
        else if (p <   30) { m = 'curious';     e = '😏'; }
        else               { m = 'reciprocated';e = '😍'; }
        mood.mood = m; mood.moodEmoji = e;
      }
      mood.history = [...(mood.history || []), { actionId, deltaPressure: moodDelta, ts: Date.now() }].slice(-30);
    }

    if (action.bondXP) bond.bondXP = Math.max(0, (bond.bondXP ?? 0) + action.bondXP);
    if (action.bondDebt) {
      const d = action.bondDebt < 0 ? action.bondDebt : action.bondDebt * strainMul;
      bond.bondDebt = Math.max(0, (bond.bondDebt ?? 0) + d);
    }
    // trauma bonding: a rough act (positive bondDebt) that ISN'T a brutal setback
    // and carries no explicit bondXP still grants a sliver, so regular abuse slowly indoctrinates.
    if (!STOCKHOLM_SETBACK[actionId] && action.bondDebt > 0 && !action.bondXP) {
      bond.bondXP = (bond.bondXP ?? 0) + STOCKHOLM_TRAUMA_XP;
    }
    // the most extreme brutal acts SET BACK indoctrination (the only degrade path).
    if (STOCKHOLM_SETBACK[actionId]) {
      bond.bondXP = Math.max(0, (bond.bondXP ?? 0) + STOCKHOLM_SETBACK[actionId]);
    }
    // Recompute the level from XP (up from the climb, down from a setback) so it stays in sync
    // without waiting for the next Ollama delta.
    if (window.DMTHGame.balancing && window.DMTHGame.balancing.bondLevelForXp) {
      bond.bondLevel = window.DMTHGame.balancing.bondLevelForXp(bond.bondXP);
    }

    if (action.notoriety && window.DMTHGame.state.addNotoriety) {
      window.DMTHGame.state.addNotoriety(action.notoriety);
    }

    // Player satisfaction — every action sexualizes; the meter reads action.satisfaction.
    // John actions intentionally have satisfaction=0 in their spec (proxied service, not
    // direct intimacy). Mercy / passive ticks have 0 too. Hunting bonus draws from this
    // meter via hunt.previewCaptureOdds.
    // the PLAYER spends Nut Reserve + earns satisfaction/sex-drive on his OWN acts.
    // Proxy acts performed BY a john or a "friend" (john-* ids OR opts.byJohn) must NOT credit or
    // charge the player — a friend wrecking her doesn't fill the player's tank or drain it.
    const isProxyAct = String(actionId).startsWith('john-') || opts.byJohn === true;
    // NUGGETPERF  — performing on a NUGGET (limbless, can never escape) pays a kink + personal
    // stat bonus: she's the ultimate helpless fuck-object, so every act on her hits +50% satisfaction
    // + sex-drive. The reward for committing to the slow saw-work of nuggeting her.
    const nuggetMul = girl.body?.isNugget ? 1.5 : 1;
    // CRIMEPERK — the more fucked-up the act, the bigger the player's stat gains (torture > extreme > vanilla).
    const crimeMul = crimeMultiplier(actionId);
    const perfMul = ((!isProxyAct && window.DMTHGame.playerStamina)
      ? window.DMTHGame.playerStamina.performanceMul() : 1) * nuggetMul * crimeMul;
    if (action.satisfaction && !isProxyAct && window.DMTHGame.state.addSatisfaction) {
      window.DMTHGame.state.addSatisfaction(action.satisfaction * perfMul, actionId);
    }
    // sex acts feed the player's sexual-drive need (clamped to its scaling cap,
    // so one girl can't push it into the maxed boost band — you need a roster).
    if (action.satisfaction && !isProxyAct && window.DMTHGame.sexdrive) {
      // pass girl + act so fill scales by variety (distinct girls/day) and decays
      // when the same act is spammed on the same girl.
      try { window.DMTHGame.sexdrive.feed(action.satisfaction * perfMul, { girlId, actId: actionId }); } catch (e) { /* non-fatal */ }
    }
    // Spend the reserve AFTER reading performance, so this act used the current level.
    if (!isProxyAct && window.DMTHGame.playerStamina) {
      try { window.DMTHGame.playerStamina.drainForAction(actionId); } catch (e) { /* non-fatal */ }
    }
    // TENDERNESS cools heat a little : caring for a captive (love-/feed-/
    // water-/heal — keeping her cared-for, alive, unmarked) quietly bleeds a sliver of WANTED off,
    // so heat is a managed stat, not a wait-it-out timer.
    if (!isProxyAct && window.DMTHGame.wanted && (/^(love-|feed-|water-)/.test(actionId) || actionId === 'heal')) {
      window.DMTHGame.wanted.reduce(0.6, 'tenderness:' + actionId);
    }

    // Stamp the recent-act aftermath tag so the NEXT image of her renders what was just
    // done (imaging.js actAftermathTokens — TTL-faded). Latest tagged act wins.
    const aftermathTag = AFTERMATH_TAGS[actionId];
    if (aftermathTag) {
      body.recentActTag = aftermathTag;
      if (window.DMTHGame.gameClock) body.recentActAt = window.DMTHGame.gameClock.now();
    }

    // Escape-risk bar — the captive's drive to get out (0-1; she escapes if it maxes). Acts
    // shift it: loving / indoctrinating acts lower her fighting spirit + the bar; violence /
    // degradation stoke defiance + raise it. Explicit action.escapeRisk overrides the derive
    // (used where physical suppression isn't captured by bond/mood — restraint, sedation).
    // The bar's passive rise + containment counters (security / restraints / guard dog) live
    // in tick.js; this is the player's active lever to manage it through care.
    const escape = { ...(girl.escape || { currentRisk: 0.1, factors: {}, lastAttempt: null }) };
    const escapeRiskDelta = (typeof action.escapeRisk === 'number') ? action.escapeRisk : (
      -(action.bondXP || 0) * 0.006                       // indoctrination calms her
      - Math.max(0, action.mood || 0) * 0.003             // a lifted mood softens the fight
      + (action.bondDebt || 0) * 0.005                    // forgiveness (−) lowers, harshness (+) raises
      + Math.max(0, action.bruises || 0) * 0.004          // fresh pain stokes desperation
      - Math.max(0, action.health || 0) * 0.002           // healing settles her
    );
    escape.currentRisk = clamp((escape.currentRisk ?? 0.1) + escapeRiskDelta, 0, 1);
    escape.lastRiskDelta = escapeRiskDelta;

    // Clothing stat bonuses  — on a SEXUAL act, the equipped outfit boosts the
    // player's satisfaction + her arousal; a restraint-flavored outfit also suppresses escape.
    if ((action.arousal || action.cumLoad) && window.DMTHGame.wardrobe?.outfitBonuses) {
      const ob = window.DMTHGame.wardrobe.outfitBonuses(girl);
      if (ob.girlArousal) body.arousal = clamp((body.arousal ?? 0) + ob.girlArousal, 0, 100);
      if (ob.escapeSuppress) escape.currentRisk = clamp(escape.currentRisk - ob.escapeSuppress, 0, 1);
      if (ob.playerSatisfaction && window.DMTHGame.state.addSatisfaction) {
        window.DMTHGame.state.addSatisfaction(ob.playerSatisfaction, `outfit-bonus:${girl.currentOutfit}`);
      }
    }

    // extreme-act tolerance. Extreme acts stack a streak; care/rest walk it back.
    // Past the limit she's spent → extra health/stamina toll until she's recovered.
    const isExtremeAct = EXTREME_ACTS_FOR_TOL.has(actionId);
    const isRecoveryAct = actionId === 'heal' || actionId.startsWith('love-') || actionId.startsWith('feed-') || actionId.startsWith('water-');
    let xStreak = body.extremeStreak || 0;
    if (isExtremeAct) {
      xStreak += 1;
      if (xStreak > XTOL_LIMIT) {
        body.health = clamp((body.health ?? 100) - 6, 0, 100);
        body.stamina = clamp((body.stamina ?? 70) - 8, 0, body.health);
        if (window.DMTHNotify && xStreak === XTOL_LIMIT + 1) {
          window.DMTHNotify.show(`⚠️ ${girl.name} is spent (${XTOL_LIMIT}+ extreme acts) — heal / caress / feed / rest her before she breaks.`, { type: 'error', durationMs: 6000 });
        }
      } else if (xStreak === XTOL_LIMIT && window.DMTHNotify) {
        window.DMTHNotify.show(`⚠️ ${girl.name} is at her extreme-act limit — she needs recovery now.`, { type: 'warn', durationMs: 5000 });
      }
    } else if (isRecoveryAct) {
      xStreak = Math.max(0, xStreak - 2);
    }
    body.extremeStreak = xStreak;

    // Trophy-history tally — count PLAYER acts committed against her (non-proxy only; johns/friends
    // are counted separately in the whore-out ledger). Persists into her death record + trophy.
    if (!isProxyAct) body.actsCommitted = (body.actsCommitted || 0) + 1;

    //  / her hidden like/dislike modifies the act + is DISCOVERED on it.
    // A like buffs (mood/arousal/bond + satisfaction); a dislike debuffs (mood −, bond-debt +). The
    // first time each fires, it's revealed as a status notice. Skipped for proxy (john/friend) acts.
    let kinkPatch = null;
    if (!isProxyAct && girl.kink) {
      const cat = actionCategory(actionId);
      if (cat && cat === girl.kink.like) {
        //  (finishing the deferred part) — a PREGNANT girl gets a BIGGER kink payoff
        // ("pregoo girls ... get bonius to kink"): hornier + more satisfaction on her loved act.
        const preg = girl.pregnancy && girl.pregnancy.status === 'pregnant';
        mood.moodPressure = clamp((mood.moodPressure || 0) + (preg ? 9 : 6), -60, 60);
        body.arousal = clamp((body.arousal ?? 0) + (preg ? 13 : 8), 0, 100);
        bond.bondXP = (bond.bondXP || 0) + 2;
        if (window.DMTHGame.state.addSatisfaction) window.DMTHGame.state.addSatisfaction(preg ? 3 : 2, 'kink-like:' + cat);
        if (!girl.kink.likeFound) {
          kinkPatch = { ...girl.kink, likeFound: true };
          if (window.DMTHNotify) window.DMTHNotify.show(`💖 Discovered — ${girl.name} secretly LOVES ${cat}: it turns her on and bonds her faster.`, { type: 'success', durationMs: 5500 });
        }
      } else if (cat && cat === girl.kink.dislike) {
        mood.moodPressure = clamp((mood.moodPressure || 0) - 8, -60, 60);
        body.arousal = clamp((body.arousal ?? 0) - 5, 0, 100);
        bond.bondDebt = (bond.bondDebt || 0) + 3;
        if (!girl.kink.dislikeFound) {
          kinkPatch = { ...girl.kink, dislikeFound: true };
          if (window.DMTHNotify) window.DMTHNotify.show(`💢 Discovered — ${girl.name} HATES ${cat}: it sets her back and piles on bond-debt.`, { type: 'warn', durationMs: 5500 });
        }
      }
    }

    window.DMTHGame.state.updateGirl(girlId, kinkPatch ? { body, bond, mood, escape, kink: kinkPatch } : { body, bond, mood, escape });

    // record this act into her LIVE activity history (player acts only; johns/friends
    // log themselves via the whore-out ledger + their own activity entries). Compact label + the
    // buff/debuff deltas it carried, so the running list shows what was done + how it moved her.
    if (!isProxyAct && window.DMTHGame.state.appendActivity) {
      const niceLabel = String(action.notes || actionId).split(/[—.]/)[0].trim() || actionId;
      const bits = [];
      for (const k of ['health', 'stamina', 'mood', 'arousal', 'wetness', 'cumLoad', 'bruises', 'bondXP', 'bondDebt']) {
        const v = action[k];
        if (v) bits.push(`${k}${v > 0 ? '+' : ''}${v}`);
      }
      window.DMTHGame.state.appendActivity(girlId, { kind: 'action', label: niceLabel, detail: bits.join(' · ') });
    }

    //  / the player's OWN extreme act finishes her when it crosses her
    // death floor (health hit 0 on a kill-capable act she wasn't already too healthy to survive).
    // She got the DEATHWARN confirm first, so a confirmed lethal act SHOULD kill her — and a girl
    // corpsing under your own hands still pays a snuff bonus (premium content, not pure loss).
    if (!isProxyAct && ACT_CAN_KILL.has(actionId) && (body.health ?? 100) <= 0
        && girl.encounterState === 'captive' && window.DMTHGame.lifespan?.killDuringAct) {
      try {
        const k = window.DMTHGame.lifespan.killDuringAct(girlId, { cause: 'player-act:' + actionId, byLabel: 'your own hands', baseBonus: 500 });
        if (k && k.snuffBonus && window.DMTHGame.state.addMoney) window.DMTHGame.state.addMoney(k.snuffBonus, 'snuff-bonus:' + actionId);
        if (k && k.ok && window.DMTHGame.state.addSatisfaction) window.DMTHGame.state.addSatisfaction(6, 'snuff:' + actionId);
      } catch (e) { /* non-fatal — she stays at 0 HP and the lifespan tick will catch it */ }
    }

    // Breeding / cum-inside ACTIONS raise her VAGINAL cum-fill  — sustained fill is
    // what conceives (pregnancy.tickCumFill timer), not this single event. Skipped when a
    // condom is equipped. Only these vaginal-cum acts feed the fill — anal/oral don't.
    const CUM_INSIDE_ACTIONS = new Set(['sex-cum-inside', 'extreme-breeding-rape', 'period-creampie']);
    const condomBlocks = window.DMTHGame.condoms ? window.DMTHGame.condoms.blocks(girl) : (girl.currentOutfit === 'condom-on');
    const holed = window.DMTHGame.condoms?.isHoled ? window.DMTHGame.condoms.isHoled(girl) : false;
    if (CUM_INSIDE_ACTIONS.has(actionId) && !condomBlocks && window.DMTHGame.pregnancy?.addVaginalCum) {
      // the player's cum-wad scales with his DEPRAVITY level (L1 ×1.0 → L12 ×1.88).
      const cumWad = window.DMTHGame.progression?.cumWadMultiplier ? window.DMTHGame.progression.cumWadMultiplier() : 1;
      const amt = (actionId === 'extreme-breeding-rape' ? 1.6 : 1.2) * cumWad;
      try { window.DMTHGame.pregnancy.addVaginalCum(girlId, amt, { conceptionSource: 'master:' + actionId }); } catch (e) { /* non-fatal */ }
      // A SABOTAGED (holed) condom breeds her INSTANTLY — one vaginal load conceives outright,
      // no sustained-fill timer needed (she thinks she's protected). Guaranteed conception.
      if (holed && window.DMTHGame.pregnancy?.attemptConception) {
        try { window.DMTHGame.pregnancy.attemptConception(girlId, { conceptionSource: 'holed-condom:' + actionId, guaranteed: true }); } catch (e) { /* non-fatal */ }
      }
    }
    // Condom wear-effect  — on a sex act, the equipped condom type's pleasure +
    // indoctrination bump (e.g. french-tickler). No-op when she's not wearing one.
    if ((action.arousal || action.cumLoad) && window.DMTHGame.condoms?.applyWearEffect) {
      try { window.DMTHGame.condoms.applyWearEffect(girlId); } catch (e) { /* non-fatal */ }
    }

    // DEPRAVITY XP  — every successful act feeds the player's level, weighted by how
    // depraved it is: a gentle kiss a sliver, an extreme act a lot. satisfaction is the proxy.
    // CRIMEPERK — depraved acts also level the player's DEPRAVITY faster (scaled by crimeMul).
    if (window.DMTHGame.progression && !isProxyAct) window.DMTHGame.progression.grantXp(Math.max(1, Math.round((action.satisfaction || 1) * crimeMul)), 'action:' + actionId);

    // the act consumes GAME TIME. Burn the clock forward by the act's duration,
    // then reconcile the deterministic per-tick accruals (consumable decay + owned-location skim +
    // wallet meter drift) across the skipped span. Time-based systems (drug curves, lifespan aging,
    // pregnancy gestation) self-reconcile off the now-advanced clock on the next real tick; random
    // events (johns, raids, propositioners, market sales) intentionally do NOT fire mid-act.
    const durMin = actionDurationMin(actionId);
    if (durMin > 0 && window.DMTHGame.gameClock?.advanceBy) {
      window.DMTHGame.gameClock.advanceBy(durMin);
      if (window.DMTHGame.tick?.reconcileSpan) {
        try { window.DMTHGame.tick.reconcileSpan(durMin); } catch (e) { /* non-fatal */ }
      }
      // Make a long session FELT — surface a time-passed notice for anything 45+ minutes
      // (kisses/slaps stay silent so routine acts don't spam the player).
      if (durMin >= 45 && window.DMTHNotify && window.DMTHGame.gameClock.formatDuration) {
        window.DMTHNotify.show(`⏱️ ${window.DMTHGame.gameClock.formatDuration(durMin)} passed — ${window.DMTHGame.gameClock.formatNow()}`, { type: 'info', durationMs: 3500 });
      }
    }

    return { ok: true, action, strain: !!opts.strain, escapeRiskDelta, durationMin: durMin };
  }

  // -----------------------------------------------------------------
  // NUGGET / DELIMBING — masochist body-horror. Take her limbs one at a time. Each
  // amputation is EXTREME damage; she must HEAL back up before the next can be taken (can't
  // just delimb all four at once). A full nugget (all 4 gone) CANNOT escape and CANNOT fight,
  // is premium film content, and renders as a limbless torso.  // -----------------------------------------------------------------
  const LIMB_KEYS = ['leftArm', 'rightArm', 'leftLeg', 'rightLeg'];
  const LIMB_LABEL = { leftArm: 'left arm', rightArm: 'right arm', leftLeg: 'left leg', rightLeg: 'right leg' };
  const LIMB_EMOJI = { leftArm: '💪', rightArm: '💪', leftLeg: '🦵', rightLeg: '🦵' };
  const LIMB_BASE  = { leftArm: 80, rightArm: 80, leftLeg: 95, rightLeg: 95 };
  const LIMB_DMG = 50;           // HP cost of taking one limb — manage her HP or she bleeds out

  // Major organs harvestable for sale. Vital ones (liver / heart / lungs) kill a living girl
  // outright; a kidney is survivable while she still has the other (taking BOTH is fatal). A
  // corpse can be harvested freely. Each extracted organ drops into the harvested-parts inventory.
  const HARVEST_ORGANS = {
    'left-kidney':  { name: 'left kidney',  emoji: '🫘', base: 180, vital: false },
    'right-kidney': { name: 'right kidney', emoji: '🫘', base: 180, vital: false },
    'liver':        { name: 'liver',        emoji: '🫀', base: 200, vital: true },
    'heart':        { name: 'heart',        emoji: '🫀', base: 280, vital: true },
    'lungs':        { name: 'lungs',        emoji: '🫁', base: 240, vital: true }
  };
  const HARVEST_RARITY_MUL = { unity_seed: 2.0, sorority: 1.5, model: 1.5, club: 1.2, nurse: 1.2 };
  const ORGAN_DMG = 40;          // HP cost of a survivable organ extraction (a kidney)

  // Push a severed limb / extracted organ into the harvested-parts inventory (sold to the organ vendor).
  function harvestPartToInventory(girl, key, name, emoji, base) {
    if (!window.DMTHGame.state.addBodyPart) return null;
    const rarityMul = HARVEST_RARITY_MUL[girl.archetypeTemplate] || 1.0;
    const bondMul = 0.8 + (girl.bond?.bondLevel || 0) * 0.04;
    const value = Math.max(10, Math.round((base || 80) * rarityMul * bondMul * (0.85 + Math.random() * 0.3)));
    const part = {
      id: 'part_' + (girl.id || 'x') + '_' + key + '_' + Date.now().toString(36) + Math.floor(Math.random() * 1000),
      girlName: girl.name, archetype: girl.archetypeTemplate, partKey: key,
      name, emoji, value, listed: true, harvestedAt: Date.now()
    };
    window.DMTHGame.state.addBodyPart(part);
    return part;
  }
  function organsRemoved(girl) { return girl.body?.organs || {}; }

  function limbState(girl) {
    return girl.body?.limbs || { leftArm: 'attached', rightArm: 'attached', leftLeg: 'attached', rightLeg: 'attached' };
  }
  function limbsRemoved(girl) {
    const l = limbState(girl);
    return LIMB_KEYS.filter(k => (l[k] || 'attached') === 'removed').length;
  }
  function isNugget(girl) { return limbsRemoved(girl) >= 4 || !!girl.body?.isNugget; }

  function delimb(girlId, limbKey) {
    const girl = window.DMTHGame.state.getGirl(girlId);
    if (!girl) return { ok: false, reason: 'no such girl' };
    if (!LIMB_KEYS.includes(limbKey)) return { ok: false, reason: 'invalid limb' };
    // DEPRAVITY gate  — nugget-making is high-tier; locked until level (cheat bypasses).
    if (window.DMTHGame.progression && !window.DMTHGame.progression.isUnlocked('nugget')) {
      return { ok: false, reason: `nugget-making is locked — reach DEPRAVITY level ${window.DMTHGame.progression.requiredLevel('nugget')} first` };
    }
    // TORTURE/SAWGATE  — you can't take a limb bare-handed; nuggeting needs a 🪚 Bone Saw.
    // It's slow, methodical, multi-day work — the NUGGET_HEAL_GATE below makes her heal between
    // each amputation, so the whole nugget is an operation of damage + healing across game-days.
    if ((window.DMTHGame.state.current?.inventory?.['bone-saw'] || 0) < 1) {
      return { ok: false, reason: 'you need a 🪚 Bone Saw to take her limbs — buy one first' };
    }
    const limbs = { ...limbState(girl) };
    if (limbs[limbKey] === 'removed') return { ok: false, reason: 'that limb is already gone' };
    // No heal-gate between amputations — the player just has to manage her HP. Each limb is heavy
    // damage; if she's too weak to survive the saw she bleeds out on the table (then dispose/harvest).
    const startHealth = girl.body?.health ?? 100;
    limbs[limbKey] = 'removed';
    // The severed limb drops into your harvested-parts inventory to sell to the organ vendor.
    harvestPartToInventory(girl, limbKey, LIMB_LABEL[limbKey], LIMB_EMOJI[limbKey], LIMB_BASE[limbKey]);
    if ((startHealth - LIMB_DMG) <= 0) {
      // Too weak — she dies during the amputation. The limb is already taken.
      if (window.DMTHGame.lifespan?.killDuringAct) window.DMTHGame.lifespan.killDuringAct(girlId, { cause: 'bled-out-during-amputation', corpse: 'bled-out', byLabel: 'amputation' });
      const dead = window.DMTHGame.state.getGirl(girlId);
      window.DMTHGame.state.updateGirl(girlId, { body: { ...dead.body, limbs } });
      if (window.DMTHNotify) window.DMTHNotify.show(`☠️ ${girl.name} bled out as you took her ${LIMB_LABEL[limbKey]} — she was too weak for the saw. The ${LIMB_LABEL[limbKey]} is in your inventory to sell.`, { type: 'error', durationMs: 7500 });
      return { ok: true, limbKey, died: true };
    }
    const body = { ...girl.body, limbs };
    body.health = Math.max(1, startHealth - LIMB_DMG);
    body.bruises = Math.min(99, (body.bruises ?? 0) + 15);
    body.stamina = Math.max(0, Math.min(body.health, (body.stamina ?? 70) - 30));
    body.recentActTag = 'beaten';
    if (window.DMTHGame.gameClock) body.recentActAt = window.DMTHGame.gameClock.now();
    const nowRemoved = LIMB_KEYS.filter(k => limbs[k] === 'removed').length;
    body.isNugget = nowRemoved >= 4;
    const escape = { ...(girl.escape || { currentRisk: 0.1, factors: {}, lastAttempt: null }) };
    escape.currentRisk = body.isNugget ? 0 : clamp((escape.currentRisk ?? 0.1) - 0.25, 0, 1);
    const bond = { ...girl.bond, bondDebt: (girl.bond?.bondDebt || 0) + 15 };
    const mood = { ...girl.mood, mood: body.isNugget ? 'broken' : 'traumatized', moodEmoji: '😵' };
    if (window.DMTHGame.state.addSatisfaction) window.DMTHGame.state.addSatisfaction(5, 'delimb');
    if (window.DMTHGame.progression) window.DMTHGame.progression.grantXp(10, 'delimb');
    window.DMTHGame.state.updateGirl(girlId, { body, escape, bond, mood });
    if (window.DMTHNotify) {
      window.DMTHNotify.show(
        body.isNugget
          ? `🪓 ${girl.name} is now a NUGGET — all four limbs gone, all four in your inventory to sell. She can't run, she can't fight, she's nothing but a hole now.`
          : `🪓 ${girl.name}'s ${LIMB_LABEL[limbKey]} taken (${nowRemoved}/4) and in your inventory to sell. Keep her HP up or the next one kills her.`,
        { type: 'error', durationMs: 7000 });
    }
    return { ok: true, limbKey, removed: nowRemoved, isNugget: body.isNugget };
  }

  // -----------------------------------------------------------------
  // ORGAN HARVESTING — cut out her major organs to sell. Needs a 🔪 Harvest Knife in inventory.
  // A vital organ (liver / heart / lungs) kills a living girl outright. A kidney is survivable
  // while she still has the other — taking BOTH kidneys is fatal. No heal-gate: the player just
  // manages her HP. Each organ drops into the harvested-parts inventory to sell to the organ vendor.
  // A corpse can be harvested freely (nothing left to kill).  // -----------------------------------------------------------------
  function harvestOrgan(girlId, organKey) {
    const girl = window.DMTHGame.state.getGirl(girlId);
    if (!girl) return { ok: false, reason: 'no such girl' };
    const spec = HARVEST_ORGANS[organKey];
    if (!spec) return { ok: false, reason: 'invalid organ' };
    if (girl.encounterState !== 'captive' && girl.encounterState !== 'dead') {
      return { ok: false, reason: 'she has to be a captive or a corpse for that' };
    }
    // Organ harvesting is the highest-tier butchery — gated behind the dismember unlock (cheat bypasses).
    if (window.DMTHGame.progression && !window.DMTHGame.progression.isUnlocked('dismember')) {
      return { ok: false, reason: `organ harvesting is locked — reach DEPRAVITY level ${window.DMTHGame.progression.requiredLevel('dismember')} first` };
    }
    // A 🔪 Harvest Knife is required to cut out organs (the 🪚 Bone Saw is for limbs).
    if ((window.DMTHGame.state.current?.inventory?.['harvest-knife'] || 0) < 1) {
      return { ok: false, reason: 'you need a 🔪 Harvest Knife to cut out organs — buy one first' };
    }
    const organs = { ...organsRemoved(girl) };
    if (organs[organKey] === 'removed') return { ok: false, reason: 'that organ is already gone' };
    const alive = girl.encounterState === 'captive';
    // Lethality: vital organs always kill a living girl; the SECOND kidney (none left) is fatal.
    let fatal = false;
    if (alive) {
      if (spec.vital) fatal = true;
      else if (organKey.endsWith('kidney')) {
        const other = organKey === 'left-kidney' ? 'right-kidney' : 'left-kidney';
        if (organs[other] === 'removed') fatal = true;   // both kidneys gone → death
      }
    }
    // Harvest the organ into inventory regardless of outcome.
    harvestPartToInventory(girl, organKey, spec.name, spec.emoji, spec.base);
    organs[organKey] = 'removed';
    if (alive && fatal) {
      if (window.DMTHGame.lifespan?.killDuringAct) window.DMTHGame.lifespan.killDuringAct(girlId, { cause: 'organ-harvest', corpse: 'gutted', byLabel: 'organ harvest' });
      const dead = window.DMTHGame.state.getGirl(girlId);
      window.DMTHGame.state.updateGirl(girlId, { body: { ...dead.body, organs } });
      if (window.DMTHNotify) window.DMTHNotify.show(`☠️ You cut out ${girl.name}'s ${spec.name} — a vital organ. She died on the table; it's in your inventory to sell.`, { type: 'error', durationMs: 7500 });
      return { ok: true, organKey, died: true };
    }
    // Survivable removal (a kidney while she still has the other, or harvesting a corpse).
    const body = { ...girl.body, organs };
    if (alive) {
      body.health = Math.max(1, (body.health ?? 100) - ORGAN_DMG);
      body.bruises = Math.min(99, (body.bruises ?? 0) + 10);
      body.stamina = Math.max(0, Math.min(body.health, (body.stamina ?? 70) - 25));
      body.recentActTag = 'beaten';
      if (window.DMTHGame.gameClock) body.recentActAt = window.DMTHGame.gameClock.now();
    }
    const patch = { body };
    if (alive) {
      patch.bond = { ...girl.bond, bondDebt: (girl.bond?.bondDebt || 0) + 12 };
      patch.mood = { ...girl.mood, mood: 'traumatized', moodEmoji: '😵' };
      if (window.DMTHGame.state.addSatisfaction) window.DMTHGame.state.addSatisfaction(5, 'organ-harvest');
      if (window.DMTHGame.progression) window.DMTHGame.progression.grantXp(12, 'organ-harvest');
    }
    window.DMTHGame.state.updateGirl(girlId, patch);
    if (window.DMTHNotify) window.DMTHNotify.show(`🔪 You cut out ${girl.name}'s ${spec.name}${alive ? " — she survived (one kidney's enough)" : ' from the corpse'}. It's in your inventory to sell.`, { type: 'error', durationMs: 6000 });
    return { ok: true, organKey, died: false };
  }

  // -----------------------------------------------------------------
  // OWNERSHIP MARKS — permanent, irreversible PROPERTY marks. Brand her, tattoo your
  // name into her, lock piercings through her flesh. Each mark persists for the rest of
  // her existence (never removed — it follows her into films, disposal, the trophy record),
  // renders in EVERY image of her (no TTL fade — see imaging.ownershipMarkTokens), deepens
  // the owned-property psychology in her voice (ollama-templates.ownershipMarkBlock), and
  // adds a possessiveness premium to recordings (film.analyzeRecording). One of each type
  // can be applied. The owner name is baked in at marking time so a later rename never
  // rewrites an old tattoo.  // -----------------------------------------------------------------
  function ownerNameNow() {
    return (window.DMTHGame.state && window.DMTHGame.state.getPlayerName)
      ? window.DMTHGame.state.getPlayerName() : 'Master';
  }
  const MARK_SPECS = Object.freeze({
    brand: {
      type: 'brand', label: 'PROPERTY brand',
      health: -14, bruises: +7, mood: -10, bondDebt: +8, satisfaction: +6,
      location: 'seared into the skin low on her belly, just above the pubic mound',
      render: () => 'a deep PROPERTY brand seared and scarred permanently into the skin low on her belly above the pubic mound, raised keloid scar-letters spelling the word "PROPERTY", owner\'s mark burned into her flesh forever',
      notes: 'Brand "PROPERTY" into her flesh — permanent scar. Heavy pain + bondDebt; she carries it forever.'
    },
    tattoo: {
      type: 'tattoo', label: "owner's-name tattoo",
      health: -6, bruises: +2, mood: -8, bondDebt: +6, satisfaction: +5,
      location: 'inked in bold script across her lower belly above the pubic mound',
      render: () => `a permanent black-ink tattoo reading "PROPERTY OF ${ownerNameNow().toUpperCase()}" inked in bold script across her lower belly above the pubic mound, fresh sharp lettering, owner's name marked permanently on her body`,
      notes: "Tattoo your name into her skin permanently. Lasting humiliation + bondDebt."
    },
    piercing: {
      type: 'piercing', label: 'locked ownership piercings',
      health: -5, bruises: +1, mood: -6, arousal: +4, bondDebt: +4, satisfaction: +5,
      location: 'locked rings through both nipples, the clit hood, and the navel',
      render: () => 'permanent metal ownership piercings — both nipples pierced with locked steel rings, a pierced clit hood, a pierced navel, each ring hung with a tiny engraved owner\'s tag and a small padlock, captive-jewelry locked through her flesh',
      notes: 'Pierce her and lock your tags through her flesh. She can never take them off.'
    }
  });
  function ownershipMarksOf(girl) { return (girl && girl.body && girl.body.ownershipMarks) || []; }
  function hasMark(girl, type) { return ownershipMarksOf(girl).some(m => m.type === type); }

  // Apply a permanent ownership mark. Irreversible; refuses a duplicate of the same type.
  function applyMark(girlId, markType) {
    const girl = window.DMTHGame.state.getGirl(girlId);
    if (!girl) return { ok: false, reason: 'no such girl' };
    const spec = MARK_SPECS[markType];
    if (!spec) return { ok: false, reason: 'invalid mark' };
    if (hasMark(girl, markType)) {
      return { ok: false, reason: `she already bears a ${spec.label} — ownership marks are permanent, you can't put the same one on her twice` };
    }
    // DEPRAVITY gate  — permanent marking is high-tier; locked until level (cheat bypasses).
    if (window.DMTHGame.progression && !window.DMTHGame.progression.isUnlocked('own')) {
      return { ok: false, reason: `marking her is locked — reach DEPRAVITY level ${window.DMTHGame.progression.requiredLevel('own')} first` };
    }
    const owner = ownerNameNow();
    const mark = {
      id: 'mark_' + markType + '_' + Date.now().toString(36),
      type: markType,
      label: spec.label,
      location: spec.location,
      render: spec.render(),
      ownerName: owner,
      appliedAt: Date.now()
    };
    const marks = [...ownershipMarksOf(girl), mark];
    const body = { ...girl.body, ownershipMarks: marks };
    body.health = clamp((body.health ?? 100) + spec.health, 0, 100);
    if (spec.bruises) body.bruises = clamp((body.bruises ?? 0) + spec.bruises, 0, 99);
    if (spec.arousal) body.arousal = clamp((body.arousal ?? 0) + spec.arousal, 0, 100);
    body.stamina = clamp((body.stamina ?? 70) - 6, 0, body.health);
    body.recentActTag = 'marked';
    if (window.DMTHGame.gameClock) body.recentActAt = window.DMTHGame.gameClock.now();
    // Mood drops (the marking is a violation) — moodPressure feeds the next action's
    // banded reclassify, so a low-bond girl trends toward traumatized while a devoted one
    // weathers it.
    const mood = { ...girl.mood, moodPressure: clamp((girl.mood?.moodPressure || 0) + spec.mood, -60, 60) };
    // Permanently marking her is something she has to forgive over time — bondDebt up.
    const bond = { ...girl.bond, bondDebt: (girl.bond?.bondDebt || 0) + spec.bondDebt };
    // Fresh marking trauma nudges escape-risk up — except a masochist, who is wired to
    // crave being claimed, so it settles her instead.
    const escape = { ...(girl.escape || { currentRisk: 0.1, factors: {}, lastAttempt: null }) };
    const masochist = girl.captiveAffect === 'masochist';
    escape.currentRisk = clamp((escape.currentRisk ?? 0.1) + (masochist ? -0.03 : 0.05), 0, 1);
    if (spec.satisfaction && window.DMTHGame.state.addSatisfaction) {
      window.DMTHGame.state.addSatisfaction(spec.satisfaction, 'mark:' + markType);
    }
    window.DMTHGame.state.updateGirl(girlId, { body, mood, bond, escape });
    if (window.DMTHNotify) {
      const msg = markType === 'brand'
        ? `🔥 ${girl.name} BRANDED — "PROPERTY" seared into her flesh forever. She'll carry your mark to the grave.`
        : markType === 'tattoo'
          ? `🖋️ ${girl.name} TATTOOED — "PROPERTY OF ${owner}" inked into her skin permanently.`
          : `💍 ${girl.name} PIERCED — locked owner's tags through her nipples and clit. She wears your locks now.`;
      window.DMTHNotify.show(msg, { type: 'error', durationMs: 7000 });
    }
    if (window.DMTHGame.progression) window.DMTHGame.progression.grantXp(8, 'mark:' + markType);
    return { ok: true, markType, mark };
  }

  // Lookup the compact cost summary for tooltip rendering. Returns a short tight
  // string suitable for hover tooltips:
  //   "ST-8 · MD+3 · AR+12 · WT+15 · CL+0.6 · BX+2 · SAT+3"
  // Codes:
  //   ST=stamina, HP=health, MD=mood, AR=arousal, WT=wetness, BR=bruises, CL=cumLoad,
  //   BX=bondXP, BD=bondDebt, NT=notoriety, SAT=satisfaction
  const COST_CODES = {
    stamina: 'ST', health: 'HP', mood: 'MD', arousal: 'AR', wetness: 'WT',
    bruises: 'BR', cumLoad: 'CL', bondXP: 'BX', bondDebt: 'BD',
    escapeRisk: 'ER', notoriety: 'NT', satisfaction: 'SAT'
  };
  // ── lethality prediction + low-health alerts ──────────────────────────────
  // Depraved are-you-sure lines (NOT literal examples). Rotated when an act would kill her.
  const LETHAL_WARNINGS = [
    'she\'s hanging by a thread — do this and you\'ll feel her go limp and cold while you\'re still inside her. finish her off?',
    'one more and her heart quits mid-scream — you want to be balls-deep when the light goes out of her eyes?',
    'push this and she flatlines under you, wet and wrecked and gone. ride her out the door?',
    'this is the one that kills her — she dies on your cock if you do it. do it anyway?',
    'her body can\'t take this — she\'ll seize, go slack, and stop breathing beneath you. send her off?'
  ];
  function lethalWarningLine() { return LETHAL_WARNINGS[Math.floor(Math.random() * LETHAL_WARNINGS.length)]; }

  // Would this action likely KILL her right now? Compares her health to the action's health cost
  // (strain-amplified when she's already low) against the death floor. Used by the UI to throw a
  // confirm BEFORE the act lands — so the player gets a noticeable warning, not a surprise corpse.
  function wouldBeLethal(girlId, actionId) {
    const girl = window.DMTHGame.state.getGirl(girlId);
    if (!girl || girl.encounterState === 'dead') return false;
    const a = ACTIONS[actionId];
    const cost = a && typeof a.health === 'number' ? a.health : 0;
    if (cost >= 0) return false;
    const hp = girl.body?.health ?? 100;
    const strained = (girl.body?.stamina ?? 70) <= STAMINA_THRESHOLD_FOR_STRAIN;
    const effective = strained ? cost * 1.5 : cost;
    return (hp + effective) <= 1;   // would hit the death floor (lifespan kills at health <= 0)
  }

  // Per-tick low-health sweep — fires ONE non-intrusive alert when a held captive drops to/below
  // the warn band (she needs loving / drugs / healing to recover), throttled via a per-girl flag
  // so it never nags. Re-arms once she climbs back out. Called from tick.js after the vitals step.
  const LOW_HEALTH_WARN_BAND = 20;
  function lowHealthAlertSweep() {
    const s = window.DMTHGame.state.current;
    if (!s) return;
    for (const girl of (s.roster || [])) {
      if (girl.encounterState !== 'captive') continue;
      const hp = girl.body?.health ?? 100;
      const flagged = !!(girl.body && girl.body._lowHpAlerted);
      if (hp <= LOW_HEALTH_WARN_BAND && !flagged) {
        if (window.DMTHNotify) window.DMTHNotify.show(`🩹 ${girl.name} is broken down (${Math.round(hp)} HP) — love her, dose her, let her rest, or she'll die on you.`, { type: 'danger', durationMs: 7000 });
        window.DMTHGame.state.updateGirl(girl.id, { body: { ...(girl.body || {}), _lowHpAlerted: true } });
      } else if (hp > LOW_HEALTH_WARN_BAND + 12 && flagged) {
        window.DMTHGame.state.updateGirl(girl.id, { body: { ...(girl.body || {}), _lowHpAlerted: false } });
      }
    }
  }

  // train her cum-load STORAGE capacity with the Ben Wa balls (kegel trainer). Requires
  // owning 'ben-wa-balls'. Each session raises cumLoadCap +2 up to a trained max of 30. Net-positive
  // (bigger payouts later); the downside lives in the economy (a full girl gets moody/restless).
  const CUMCAP_MAX = 30;
  function trainCumCapacity(girlId) {
    const girl = window.DMTHGame.state.getGirl(girlId);
    if (!girl) return { ok: false, reason: 'no such girl' };
    const inv = (window.DMTHGame.state.current && window.DMTHGame.state.current.inventory) || {};
    // any owned vaginal trainer works (Ben Wa balls / plug / expander). Strongest wins.
    const items = (window.DMTHAssets && window.DMTHAssets.ITEMS) || [];
    const owned = items.filter(it => it.cumTrainer && (inv[it.id] > 0));
    if (!owned.length) return { ok: false, reason: 'you need a vaginal trainer (Ben Wa balls / plug / expander) — buy one in the shop' };
    const gain = Math.max(...owned.map(it => Number(it.cumTrainer) || 2));
    const body = { ...(girl.body || {}) };
    const cur = body.cumLoadCap ?? 10;
    if (cur >= CUMCAP_MAX) return { ok: false, reason: 'her storage capacity is already maxed' };
    body.cumLoadCap = Math.min(CUMCAP_MAX, cur + gain);
    window.DMTHGame.state.updateGirl(girlId, { body });
    if (window.DMTHNotify) window.DMTHNotify.show(`⚪ ${girl.name} trained — cum-load capacity ${body.cumLoadCap}/${CUMCAP_MAX} (+${gain}).`, { type: 'success', durationMs: 3500 });
    return { ok: true, cap: body.cumLoadCap };
  }

  function previewCost(actionId) {
    const a = ACTIONS[actionId];
    if (!a) return '';
    const parts = [];
    for (const k of Object.keys(COST_CODES)) {
      if (a[k] != null && a[k] !== 0) {
        const sign = a[k] > 0 ? '+' : '';
        parts.push(`${COST_CODES[k]}${sign}${a[k]}`);
      }
    }
    return parts.join(' · ');
  }

  // Build a complete tooltip line combining a human-readable label + the cost preview.
  // Used by every UI surface that needs "what does this button do + what stats it shifts"
  // hover info. Returns just the label when the action isn't in the ACTIONS catalog.
  function tooltipForAction(actionId, label) {
    const cost = previewCost(actionId);
    if (!label) return cost ? `📊 ${cost}` : '';
    return cost ? `${label}\n📊 ${cost}` : label;
  }

  // THOROUGH non-truncated tooltip ("tool tips and shit need to be
  // thourough ie drug types need to show theri modifiers, actions need to show there buffs and
  // debuffs for bothe the girl and the player"). Lays the full effect out in plain language,
  // split into a 👤 HER line (her body/bond buffs+debuffs) and a 🎮 YOU line (the PLAYER's gains
  // + cost: satisfaction, sex-drive fill, DEPRAVITY XP, Nut Reserve spend, crime multiplier).
  // No truncation — the DMTHTooltips bubble pre-wraps. Falls back to the bare label off-catalog.
  const GIRL_FIELD_LABELS = {
    health: 'Health', stamina: 'Stamina', mood: 'Mood', arousal: 'Arousal', wetness: 'Wetness',
    cumLoad: 'Cum-load', bruises: 'Bruises', bondXP: 'Stockholm', bondDebt: 'Bond-debt',
    escapeRisk: 'Escape-risk', notoriety: 'Notoriety'
  };
  const GIRL_FIELD_ORDER = ['health', 'stamina', 'mood', 'arousal', 'wetness', 'cumLoad', 'bruises', 'bondXP', 'bondDebt', 'escapeRisk', 'notoriety'];

  // Signed delta, integer or float (escapeRisk is a 0-1 float).
  function fmtSignedDelta(v) {
    if (Number.isInteger(v)) return (v > 0 ? '+' : '') + v;
    return (v > 0 ? '+' : '') + (Math.round(v * 100) / 100);
  }

  // HER side — every non-zero body/bond delta the act carries, in plain language.
  function girlEffectLine(a) {
    const parts = [];
    for (const k of GIRL_FIELD_ORDER) {
      const v = a[k];
      if (v == null || v === 0) continue;
      parts.push(`${GIRL_FIELD_LABELS[k]} ${fmtSignedDelta(v)}`);
    }
    return parts.join(' · ');
  }

  // YOU side — the PLAYER's personal gains + cost for performing this act himself. Proxy acts
  // (a john servicing her — john-* ids) credit the player NOTHING personal: he just gets paid.
  function playerEffectLine(actionId, a) {
    if (String(actionId).startsWith('john-')) {
      return 'paid per-encounter · no personal stat gain (he services her for you)';
    }
    const sat = a.satisfaction || 0;
    const crime = crimeMultiplier(actionId);
    const ps = window.DMTHGame.playerStamina;
    const nut = (ps && ps.costFor) ? ps.costFor(actionId) : 0;
    const depXp = Math.max(1, Math.round((sat || 1) * crime));
    const bits = [];
    if (sat) { bits.push(`Satisfaction +${sat}`); bits.push(`Sex-drive +${sat}`); }
    bits.push(`Depravity XP ~${depXp}`);
    if (nut) bits.push(`Nut Reserve −${nut}`);
    if (crime > 1) bits.push(`crime ×${crime}`);
    return bits.join(' · ');
  }

  // The full thorough tooltip: headline label + full notes + 👤 HER line + 🎮 YOU line.
  function actionTooltip(actionId, label) {
    const a = ACTIONS[actionId];
    if (!a) return label || '';
    const lines = [];
    if (label) lines.push(label);
    if (a.notes && a.notes !== label) lines.push(a.notes);
    const her = girlEffectLine(a);
    if (her) lines.push('👤 HER: ' + her);
    const you = playerEffectLine(actionId, a);
    if (you) lines.push('🎮 YOU: ' + you);
    return lines.join('\n');
  }

  // Thorough tooltip for a permanent OWNERSHIP MARK (brand / tattoo / piercing) — these live in
  // MARK_SPECS, not ACTIONS, so they need their own builder. Leads with the PERMANENT flag.
  function markTooltip(markKey, label) {
    const s = MARK_SPECS[markKey];
    if (!s) return label || '';
    const lines = [];
    lines.push(label || s.label);
    lines.push('⛓️ PERMANENT · IRREVERSIBLE — ' + (s.notes || ''));
    const her = girlEffectLine(s);
    if (her) lines.push('👤 HER: ' + her);
    const sat = s.satisfaction || 0;
    lines.push('🎮 YOU: ' + (sat ? `Satisfaction +${sat} · Sex-drive +${sat} · ` : '') + 'Depravity XP ~8');
    return lines.join('\n');
  }

  function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }

  // Defensive helper for any subsystem that needs to advance the body fields per-tick.
  // Used by tick.js to evaluate health-decline factors + passive rest regen.
  // Grace-period model + stamina-capped-by-health: a captive goes 3 game days without
  // water and 5 game days without food before health starts dropping. Below grace,
  // health drains; max stamina falls in lockstep, so if health is lower
  // the maximum stamina can reach is reduced also".
  //
  // Health drain ONLY kicks in once the grace period expires:
  //   - Water grace: 3 game days (body.lastWateredAt vs gameClock.now())
  //   - Food grace:  5 game days (body.lastFedAt vs gameClock.now())
  // Before the grace expires, the captive sits in passive-rest regen even
  // when her consumable stocks are 0.
  //
  // Stamina max-cap = body.health. Low health pulls down the stamina ceiling,
  // so a half-dead captive can't run at full stamina even when rested.
  // Stress-state bonus. The player earns a payout for keeping a captive in a
  // visibly-stressed health band — a bonus
  // or super bonus if a certain range is maintained".
  //
  // Stress range: body.health 25-55 (above terminal, below comfortable — she's
  // alive but visibly struggling, the cinematic "tense" zone). Streak counter
  // accumulates game-MINUTES while in range; resets when she leaves the band.
  // Two reward tiers per girl (one-time award each, persists for life):
  //   Tier 1 at  5 game days =  7200 stress-minutes — $500  + stressFilmMultiplier 1.15
  //   Tier 2 at 15 game days = 21600 stress-minutes — $2000 + stressFilmMultiplier 1.35
  //
  // stressFilmMultiplier is consumed by js/game/film.js stopRecording when listing
  // a film, mirroring the wardrobe multiplier pattern.
  const STRESS_RANGE_MIN = 25;
  const STRESS_RANGE_MAX = 55;
  const STRESS_TIER_1_MIN = 5 * 1440;   // 7200 stress game-minutes (5 game days)
  const STRESS_TIER_2_MIN = 15 * 1440;  // 21600 stress game-minutes (15 game days)
  const STRESS_TIER_1_PAYOUT = 500;
  const STRESS_TIER_2_PAYOUT = 2000;
  const STRESS_TIER_1_FILM_MUL = 1.15;
  const STRESS_TIER_2_FILM_MUL = 1.35;

  const WATER_GRACE_DAYS = 3;
  const FOOD_GRACE_DAYS = 5;
  // Captives self-serve from the hold's reserve when their
  // grace timer gets halfway low. Set well before the grace expires so a fresh
  // captive with reserve in her hold doesn't even approach starvation.
  const FOOD_AUTOCONSUME_DAYS = 2.5;    // half the 5-day food grace
  const WATER_AUTOCONSUME_DAYS = 1.5;   // half the 3-day water grace
  function tickStaminaHealth() {
    const s = window.DMTHGame.state.current;
    if (!s) return;
    const clock = window.DMTHGame.gameClock;
    for (const girl of s.roster) {
      if (girl.encounterState !== 'captive') continue;
      const body = { ...(girl.body || {}) };
      const bruises = body.bruises || 0;

      // Look up the hold once — used for self-serve consumption + plumbing check.
      const dungeon = window.DMTHGame.state.getDungeon(girl.assignedDungeonId);
      const holdIdx = girl.assignedHoldIdx ?? 0;
      const hold = dungeon?.holds?.[holdIdx];
      const toiletTier = hold?.upgrades?.toilet ?? 0;
      const waterSupplyTier = hold?.upgrades?.waterSupply ?? 0;
      const waterPlumbed = toiletTier >= 2 || waterSupplyTier >= 2;

      // ── Self-serve auto-consumption ──────────────────────────────────────
      // Captive pulls from the hold reserve when she's getting hungry/thirsty.
      // Plumbed water means she auto-refreshes the water timestamp without
      // consuming any reserve at all (toilet-fed faucet / drainback supply).
      let daysSinceFed = clock ? clock.daysSince(body.lastFedAt) : 0;
      let daysSinceWatered = clock ? clock.daysSince(body.lastWateredAt) : 0;
      let holdDirty = false;
      const holdPatch = hold ? { ...hold } : null;

      // STARVEDAY  — the starve / deny-water punishments cut off her eating / drinking for a
      // full game day. While the timer's live she can't auto-consume (even from a plumbed faucet) —
      // her hunger/thirst clock keeps climbing. One day never kills (food grace 5 days / water 3).
      const nowMin = clock ? clock.now() : 0;
      const blockEat = (body.starveUntil || 0) > nowMin;
      const blockDrink = (body.thirstUntil || 0) > nowMin;

      if (waterPlumbed && !blockDrink) {
        // Auto-drinks from plumbed source — never needs reserve, never dehydrates.
        if (clock) body.lastWateredAt = clock.now();
        daysSinceWatered = 0;
      } else if (!blockDrink && holdPatch && daysSinceWatered > WATER_AUTOCONSUME_DAYS && (holdPatch.waterReserve || 0) > 0) {
        holdPatch.waterReserve = (holdPatch.waterReserve || 0) - 1;
        if (clock) body.lastWateredAt = clock.now();
        daysSinceWatered = 0;
        holdDirty = true;
      }

      if (!blockEat && holdPatch && daysSinceFed > FOOD_AUTOCONSUME_DAYS && (holdPatch.foodReserve || 0) > 0) {
        holdPatch.foodReserve = (holdPatch.foodReserve || 0) - 1;
        if (clock) body.lastFedAt = clock.now();
        daysSinceFed = 0;
        holdDirty = true;
      }

      if (holdDirty && dungeon) {
        const newHolds = dungeon.holds.map((h, i) => i === holdIdx ? holdPatch : h);
        window.DMTHGame.state.updateDungeon(dungeon.id, { holds: newHolds });
      }

      // if her own hold reserve couldn't cover it, fall back to the dungeon
      // POOL (shared evenly across holds). Only fires when she's still hungry/thirsty after the
      // hold pass above (supply.draw tries hold-first, which is already empty here, then pool).
      if (!blockDrink && !waterPlumbed && daysSinceWatered > WATER_AUTOCONSUME_DAYS && window.DMTHGame.supply?.draw) {
        if (window.DMTHGame.supply.draw(girl, 'water', 1) > 0) { if (clock) body.lastWateredAt = clock.now(); daysSinceWatered = 0; }
      }
      if (!blockEat && daysSinceFed > FOOD_AUTOCONSUME_DAYS && window.DMTHGame.supply?.draw) {
        if (window.DMTHGame.supply.draw(girl, 'food', 1) > 0) { if (clock) body.lastFedAt = clock.now(); daysSinceFed = 0; }
      }

      // ── Drain evaluation ────────────────────────────────────────────────
      const starving = daysSinceFed > FOOD_GRACE_DAYS;
      const dehydrated = !waterPlumbed && daysSinceWatered > WATER_GRACE_DAYS;

      let staminaDelta = 0;
      let healthDelta = 0;
      const reasons = [];

      if (starving) {
        staminaDelta += ACTIONS['starve-tick'].stamina;
        healthDelta += ACTIONS['starve-tick'].health;
        reasons.push('starving');
      }
      if (dehydrated) {
        staminaDelta += ACTIONS['dehydrate-tick'].stamina;
        healthDelta += ACTIONS['dehydrate-tick'].health;
        reasons.push('dehydrated');
      }
      if (bruises >= 15) {
        staminaDelta += ACTIONS['chronic-bruise-tick'].stamina;
        healthDelta += ACTIONS['chronic-bruise-tick'].health;
        reasons.push('chronic-injury');
      }
      // a girl stuffed near her cum-load capacity is uncomfortable: small stamina +
      // health drain (the escape + mood cost is applied to the patch below).
      const cumRatio = (body.cumLoad || 0) / ((window.DMTHGame.cumtool && window.DMTHGame.cumtool.effectiveCap ? window.DMTHGame.cumtool.effectiveCap(body) : (body.cumLoadCap || 10)) || 10);
      const overfull = cumRatio >= 0.85;
      if (overfull) {
        staminaDelta += -1;
        healthDelta += -1;
        reasons.push('overfull-cum');
      }

      // Passive rest regen — when no negative pressure this tick.
      if (staminaDelta === 0 && healthDelta === 0) {
        staminaDelta += ACTIONS['rest-tick'].stamina;
        healthDelta += ACTIONS['rest-tick'].health;
      }

      // higher Stockholm makes her MORE ROBUST: negative health drain (neglect /
      // chronic injury) is softened by her bond level. A fully-bonded captive (L9) endures ~50%
      // less; a fresh terrified one takes the full hit. Positive regen is left untouched.
      if (healthDelta < 0) {
        const robustness = 1 - Math.min(0.5, (girl.bond?.bondLevel || 0) * 0.055);
        healthDelta *= robustness;
      }

      // Apply deltas. Note `body` was already shallow-cloned at the top of the
      // loop and may carry self-serve updates to lastFedAt / lastWateredAt — so
      // we always persist the body, even if both deltas are zero, so those
      // timestamp resets aren't lost.
      const newHealth = clamp((body.health ?? 100) + healthDelta, 0, maxHealthFor(girl));   //  ceiling
      // Stamina capped by health — low health pulls down the stamina ceiling.
      body.health = newHealth;
      body.stamina = clamp((body.stamina ?? 70) + staminaDelta, 0, newHealth);

      // Stress-state streak tracking. Increment counter while in band;
      // reset out of band. Each tick adds ~30 game-minutes (one tick of game time).
      const inStressBand = newHealth >= STRESS_RANGE_MIN && newHealth <= STRESS_RANGE_MAX;
      const prevStreak = body.stressStreakMin || 0;
      if (inStressBand) {
        body.stressStreakMin = prevStreak + 30;
      } else {
        body.stressStreakMin = 0;
      }

      // Milestone award checks. bonuses block is created lazily.
      const bonuses = { ...(girl.bonuses || { stressBonusTier: 0, stressFilmMultiplier: 1.0 }) };
      let payout = 0;
      let unlockedTier = null;
      if (bonuses.stressBonusTier < 1 && body.stressStreakMin >= STRESS_TIER_1_MIN) {
        bonuses.stressBonusTier = 1;
        bonuses.stressFilmMultiplier = STRESS_TIER_1_FILM_MUL;
        payout = STRESS_TIER_1_PAYOUT;
        unlockedTier = 1;
      }
      if (bonuses.stressBonusTier < 2 && body.stressStreakMin >= STRESS_TIER_2_MIN) {
        bonuses.stressBonusTier = 2;
        bonuses.stressFilmMultiplier = STRESS_TIER_2_FILM_MUL;
        payout = STRESS_TIER_2_PAYOUT;
        unlockedTier = 2;
      }

      // the extreme-act streak heals down over time (rest / food / water / time).
      if ((body.extremeStreak || 0) > 0) body.extremeStreak = Math.max(0, body.extremeStreak - 0.5);

      // overfull also makes her restless + moody: small escape bump + mood dip.
      const tickPatch = { body, bonuses, _lastStaminaReasons: reasons };
      if (overfull) {
        const escape = { ...(girl.escape || {}) };
        escape.currentRisk = clamp((escape.currentRisk ?? 0.1) + 0.02, 0, 1);
        const mood = { ...(girl.mood || {}) };
        mood.moodPressure = Math.max(-60, (mood.moodPressure || 0) - 2);
        tickPatch.escape = escape;
        tickPatch.mood = mood;
      }
      window.DMTHGame.state.updateGirl(girl.id, tickPatch);

      if (payout > 0) {
        window.DMTHGame.state.addMoney(payout);
        if (window.DMTHNotify) {
          const label = unlockedTier === 2 ? '⚡ SUPER STRESS BONUS' : '💢 STRESS BONUS';
          const mul = unlockedTier === 2 ? STRESS_TIER_2_FILM_MUL : STRESS_TIER_1_FILM_MUL;
          window.DMTHNotify.show(`${label} — ${girl.name} kept tense for ${unlockedTier === 2 ? 15 : 5} days. +$${payout.toLocaleString()} + ${mul}× film multiplier on her recordings.`, { type: 'success', durationMs: 6000 });
        }
      }
    }
  }

  // Better-trained girls earn more — computes a 0..1.5 happiness multiplier for a girl,
  // suitable for multiplying basePay in the john-resolver. Inputs: Stockholm bond
  // (trained = bigger payout), stamina + health (above threshold = good service),
  // mood (happy mood = happy john), outfit multiplier. Returns the multiplier + a
  // diagnostic breakdown for tooltip display.
  //
  // The john-resolver should call this when computing per-encounter pay:
  //   const { multiplier } = DMTHGame.actionEffects.johnHappinessForGirl(girl);
  //   const finalPay = basePay * multiplier;
  function johnHappinessForGirl(girl) {
    if (!girl) return { multiplier: 1.0, breakdown: {} };
    const body = girl.body || {};
    const bond = girl.bond || {};
    const stamina = body.stamina ?? 70;
    const health = body.health ?? 100;
    const mood = girl.mood?.mood || 'neutral';
    const currentOutfit = (girl.wardrobe || []).find(w => w.id === girl.currentOutfit);
    const outfitMul = currentOutfit?.multiplier || 1.0;

    // Stockholm bond — every level multiplies pay by ~10%. Cap at 1.9 (L9).
    const bondFactor = 1 + (bond.bondLevel || 0) * 0.10;

    //  ("no one wants a fresh sority girl they want a half dead one that can
    // barily move") — stamina is NEAR-NEUTRAL now: a limp, barely-moving, used-up girl is what the
    // clientele wants, so low stamina is no longer punished (floor 0.85, full ~1.0). Spent ≠ cheap.
    const staminaFactor = stamina >= STAMINA_THRESHOLD_FOR_STRAIN
      ? 1.0
      : Math.max(0.85, 0.85 + stamina / STAMINA_THRESHOLD_FOR_STRAIN * 0.15);

    // earnings PEAK on a half-dead girl, NOT a fresh one. Health is a sweet-spot
    // curve: the premium "half-dead, can barely move" zone (~15-40% HP) tops out at 1.30×; a fresh
    // full-health girl is worth LESS (~0.85×, nobody wants the untouched sorority girl); and a girl
    // teetering at death's door (<8%) tapers back (buyers get wary of a corpse-in-waiting).
    let healthFactor;
    if (health >= 70)      healthFactor = 0.85 + (100 - health) / 30 * 0.10;   // 100 → 0.85, 70 → 0.95 (fresh = less)
    else if (health >= 40) healthFactor = 0.95 + (70 - health) / 30 * 0.20;    // 70 → 0.95, 40 → 1.15 (warming up)
    else if (health >= 15) healthFactor = 1.30;                                // SWEET SPOT — half-dead premium
    else if (health >= 8)  healthFactor = 1.10;                                // wrecked but still sellable
    else                   healthFactor = 0.70;                                // near-death — buyers wary

    // Mood — happy moods multiply, broken moods penalize
    const moodTable = {
      'fully-bonded': 1.20, 'devoted': 1.15, 'partner': 1.10, 'dependent': 1.05,
      'reciprocated': 1.05, 'ambivalent': 1.00, 'curious': 1.02, 'acclimating': 0.95,
      'wary': 0.85, 'terrified': 0.75, 'broken': 0.60, 'catatonic': 0.50,
      'aroused': 1.10, 'needy': 1.08, 'playful': 1.05,
      'defiant': 0.70, 'traumatized': 0.55, 'subdued': 0.85
    };
    let moodFactor = 1.0;
    for (const [k, v] of Object.entries(moodTable)) {
      if (mood.includes(k)) { moodFactor = v; break; }
    }

    // Family / incest taboo premium — clients pay extra to use the operator's own blood/kin.
    const familyFactor = (window.DMTHGame.girlGen?.isFamilyRelation?.(girl)) ? 1.25 : 1.0;

    const multiplier = clamp(bondFactor * staminaFactor * healthFactor * moodFactor * outfitMul * familyFactor, 0.2, 3.5);
    return {
      multiplier,
      breakdown: {
        bondFactor, staminaFactor, healthFactor, moodFactor, outfitMul, familyFactor,
        stamina, health, mood, bondLevel: bond.bondLevel || 0
      }
    };
  }

  // -------------------------------------------------------------------------
  // COMMONALITY ENGINE — sync a free-typed directed act to the closest existing action.
  // A directed NPC act ("face fuck her", "stick it in her ass", "choke her out") is free text;
  // it has no stat spec of its own. This matches it to the most similar EXISTING ACTIONS entry so
  // the directed encounter inherits that action's stat modifiers. Scores token overlap (directive
  // tokens + synonym expansion) against each candidate's id-tokens (weighted heaviest) + notes.
  // Returns { actionId, action, score, matched }.
  // -------------------------------------------------------------------------
  const DIRECTED_STOPWORDS = new Set(['the','her','a','an','to','him','on','in','it','his','my','your','and','with','of','do','make','have','get','that','this','then','some','for','at','up','off','out','into','while','as','is','are','be','give','let','go']);
  // Synonym → canonical tokens that appear in action ids / notes, so colloquial directives reach
  // the right spec: "face fuck" → 'extreme-facefuck', "in her ass" → 'sex-anal', "choke" → 'choke'.
  const DIRECTED_SYNONYMS = {
    face: ['facefuck','oral','throat'], facefuck: ['facefuck','oral','throat'], throat: ['facefuck','oral','throat'],
    mouth: ['oral','facefuck'], suck: ['oral'], blow: ['oral'], blowjob: ['oral'], deepthroat: ['facefuck','oral','throat'],
    ass: ['anal'], asshole: ['anal'], anal: ['anal'], sodom: ['anal'], sodomize: ['anal'], butt: ['anal'],
    pussy: ['gentle'], cunt: ['gentle'], vaginal: ['gentle'],
    choke: ['choke'], strangle: ['choke','out'], throttle: ['choke'], choking: ['choke'], asphyxiate: ['choke','out'],
    slap: ['slap'], spank: ['slap'],
    punch: ['punch','beatdown'], hit: ['punch'], beat: ['beatdown','punch'], beating: ['beatdown'], beatdown: ['beatdown'],
    whip: ['whip'], flog: ['whip'], lash: ['whip'],
    rough: ['rough'], pound: ['rough'], wreck: ['rough'], hard: ['rough'], rape: ['rough'], destroy: ['rough'], ravage: ['rough'],
    gentle: ['gentle'], soft: ['gentle'], slow: ['gentle'], tender: ['gentle'],
    breed: ['breeding','cum','inside'], creampie: ['cum','inside'], knock: ['breeding'], cum: ['cum','inside'], inside: ['inside','cum'], seed: ['breeding','cum'], impregnate: ['breeding','cum'],
    degrade: ['degrade'], humiliate: ['degrade'], humiliation: ['degrade'], demean: ['degrade'],
    burn: ['burn'], rack: ['rack'], stretch: ['rack'], flay: ['flay'], skin: ['flay'],
    break: ['break'], waterboard: ['waterboard'], drown: ['waterboard'], electro: ['electro'], shock: ['electro'], nail: ['nail'], acid: ['acid'],
    tie: ['restrain'], bind: ['restrain'], cuff: ['restrain'], restrain: ['restrain'],
    fuck: ['sex','rough'], sex: ['sex'], use: ['rough'], ride: ['sex'],
    // care/affection synonyms so a typed player line ("let me wash you", "kiss her")
    // matches the corresponding care act. Only consulted when matchDirectedAction is called with
    // { includeCare: true } (the typed-chat path), never for a directed JOHN.
    wash: ['bathe'], bathe: ['bathe'], clean: ['bathe'], rinse: ['bathe'], shower: ['bathe'], wipe: ['wipe'],
    kiss: ['kiss'], cuddle: ['cuddle'], snuggle: ['cuddle'], hug: ['hold'], hold: ['hold'],
    massage: ['massage'], rub: ['massage'], praise: ['praise'], compliment: ['praise'],
    brush: ['hair'], hair: ['hair'], lullaby: ['lullaby'], sing: ['lullaby'],
    feed: ['feed'], water: ['water'], heal: ['heal'], bandage: ['heal'], comfort: ['hold','caress']
  };
  function tokenizeDirected(text) {
    const toks = String(text || '').toLowerCase().match(/[a-z]+/g) || [];
    const out = new Set();
    for (const t of toks) {
      if (DIRECTED_STOPWORDS.has(t) || t.length < 2) continue;
      out.add(t);
      const syn = DIRECTED_SYNONYMS[t];
      if (syn) for (const s of syn) out.add(s);
    }
    return out;
  }
  // Candidate pool — acts an NPC can actually be DIRECTED to perform on her (sexual / violence /
  // extreme / torture / john-*). Caretaking, drugs, and love acts are excluded: a john doesn't get
  // told to brush her hair. Built once from the ACTIONS keys.
  const DIRECTED_CANDIDATES = Object.keys(ACTIONS).filter(id =>
    /^(sex-|extreme-|torture-|john-)/.test(id) || ['slap','choke','whip','punch','restrain'].includes(id)
  );
  // care/affection acts are matchable too, but ONLY for a typed PLAYER line (a john
  // never gets directed to "wash" her). matchDirectedAction(text, {includeCare:true}) widens the pool.
  const CARE_CANDIDATES = Object.keys(ACTIONS).filter(id =>
    /^(love-|feed-|water-)/.test(id) || ['heal', 'wipe-down'].includes(id)
  );
  // opts.includeCare → also score the care pool (typed-chat path). The caller decides whether the
  // result is strong enough to register (TYPEDACT gates on score; a directed NPC always acts).
  function matchDirectedAction(text, opts = {}) {
    const want = tokenizeDirected(text);
    const pool = opts.includeCare ? DIRECTED_CANDIDATES.concat(CARE_CANDIDATES) : DIRECTED_CANDIDATES;
    let best = null;
    for (const id of pool) {
      const action = ACTIONS[id];
      if (!action) continue;
      const idToks = id.split('-').filter(t => t.length >= 2);
      const noteToks = (action.notes || '').toLowerCase().match(/[a-z]+/g) || [];
      let score = 0;
      for (const t of want) {
        if (idToks.includes(t)) score += 3;          // id-token match weighted heaviest
        else if (noteToks.includes(t)) score += 1;   // notes-token match
      }
      if (!best || score > best.score) best = { actionId: id, action, score };
    }
    // No token hit → a directed act is almost always aggressive; default to rough sex.
    if (!best || best.score === 0) {
      const fallback = ACTIONS['sex-rough'] ? 'sex-rough' : DIRECTED_CANDIDATES[0];
      return { actionId: fallback, action: ACTIONS[fallback], score: 0, matched: false };
    }
    return { actionId: best.actionId, action: best.action, score: best.score, matched: true };
  }

  // -------------------------------------------------------------------------
  // johns/friends do (nearly) ALL the player's actions, gated by trait + creep.
  // An NPC no longer fires one fixed john-* act forever; he picks a REAL action from a tier pool
  // gated by his nature — a JOHN by his archetype INTENSITY (1-5), a FRIEND by his CREEP level
  // (0-10). A quiet low-intensity john might just bathe or kiss her (incl. the tame care acts);
  // a sadist runs the extreme tier; a creep-grown friend climbs from extreme into torture. ALWAYS
  // resolved with {byJohn:true} (the caller passes it) so the PLAYER is never credited or charged —
  // but the GIRL still takes the act's full body/bond/mood/escape shift. A john has NO health cap,
  // so johns top out at the bounded extreme tier (≤8 HP/act); the explicit kill-tier (beatdown /
  // choke-out) + all torture are FRIEND-ONLY, where the ≤HP visit-cap stops an accidental snuff.
  const NPC_TAME_ACTS    = ['love-kiss-gentle', 'love-bathe-her', 'wipe-down', 'love-cuddle', 'love-massage', 'love-hold-her', 'love-praise', 'sex-gentle', 'sex-oral'];
  const NPC_STD_ACTS     = ['sex-gentle', 'sex-oral', 'sex-anal', 'sex-cum-inside'];
  const NPC_ROUGH_ACTS   = ['sex-rough', 'sex-anal', 'slap', 'choke', 'extreme-facefuck'];
  const NPC_EXTREME_ACTS = ['extreme-facefuck', 'extreme-rough-anal', 'extreme-degrade', 'extreme-breeding-rape', 'whip', 'punch', 'choke'];
  const NPC_SNUFF_ACTS   = ['extreme-beatdown', 'extreme-choke-out', 'masochist-overload'];   // FRIEND-ONLY (HP-capped)
  const NPC_TORTURE_ACTS = ['torture-burn', 'torture-electro', 'torture-nail', 'torture-break', 'torture-waterboard', 'torture-rack', 'torture-flay', 'torture-acid'];   // FRIEND-ONLY
  function npcPickOne(arr) { return arr[Math.floor(Math.random() * arr.length)]; }
  function chooseNpcAction(arc, opts = {}) {
    const isFriend = !!opts.isFriend;
    const fallback = (arc && arc.johnActionId) || 'john-gentle';
    if (isFriend) {
      const creep = Math.max(0, Math.min(10, opts.creep || 0));
      let pool = NPC_EXTREME_ACTS.concat(NPC_ROUGH_ACTS);   // friends are extreme by nature
      if (creep >= 3) pool = pool.concat(NPC_SNUFF_ACTS);
      if (creep >= 6) pool = pool.concat(NPC_TORTURE_ACTS.slice(0, 4));
      if (creep >= 9) pool = pool.concat(NPC_TORTURE_ACTS);
      return pool.length ? npcPickOne(pool) : fallback;
    }
    // ~30% of johns just do their archetype's signature act (keeps quick/postmortem johns one-note
    // + the ledger cheap); the rest pick from their intensity-gated pool.
    if (Math.random() < 0.3) return fallback;
    const intensity = arc ? (arc.intensity || 2) : 2;
    let pool;
    if (intensity <= 1)       pool = NPC_TAME_ACTS;                                  // quick john — tame
    else if (intensity === 2) pool = NPC_TAME_ACTS.concat(NPC_STD_ACTS);             // a gentle john may wash/kiss her
    else if (intensity === 3) pool = NPC_STD_ACTS.concat(NPC_ROUGH_ACTS, ['love-bathe-her']);
    else if (intensity === 4) pool = NPC_ROUGH_ACTS.concat(NPC_EXTREME_ACTS);
    else                      pool = NPC_EXTREME_ACTS.concat(NPC_ROUGH_ACTS);        // sadist — bounded extreme, no kill-tier
    return pool.length ? npcPickOne(pool) : fallback;
  }

  window.DMTHGame = window.DMTHGame || {};
  window.DMTHGame.actionEffects = Object.freeze({
    ACTIONS,
    chooseNpcAction,
    STAMINA_THRESHOLD_FOR_STRAIN,
    XTOL_LIMIT,
    COST_CODES,
    applyAction,
    matchDirectedAction,
    previewCost,
    tooltipForAction,
    actionTooltip,
    markTooltip,
    girlEffectLine,
    playerEffectLine,
    tickStaminaHealth,
    johnHappinessForGirl,
    LIMB_KEYS, LIMB_LABEL,
    limbState, limbsRemoved, isNugget, delimb,
    HARVEST_ORGANS, organsRemoved, harvestOrgan, harvestPartToInventory,
    MARK_SPECS, ownershipMarksOf, hasMark, applyMark,
    wouldBeLethal, lethalWarningLine, lowHealthAlertSweep,
    trainCumCapacity, CUMCAP_MAX, maxHealthFor
  });
})();
