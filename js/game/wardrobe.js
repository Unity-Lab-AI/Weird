// DUNGEON MASTER: THE HUNT — wardrobe system. Buy outfits from shop, equip/unequip, content-value multiplier.

(function () {
  'use strict';

  // Special built-in pseudo-outfit ID for "fully nude" — every girl can equip this without
  // buying it. Detected by imaging.js to front-load explicit nudity tokens at position 2 of
  // the prompt (right after the prefix), suppressing the outfit block entirely. The
  // front-load matters: image models drop trailing tokens, so a nudity token at the end
  // of a long prompt gets "melted in" and rendered weakly or not at all.
  const NUDE_PSEUDO_ID = 'nude';
  const NUDE_PSEUDO = {
    id: NUDE_PSEUDO_ID,
    displayName: 'Nude (fully naked)',
    emoji: '🍑',
    price: 0,
    tier: 1,
    description: '',                        // <<INTENTIONAL EMPTY — DO NOT FILL IN>> imaging.js suppresses the outfit block entirely when nude:full, replacing it with the front-loaded nudeTokens() block at prompt position 2. Filling this in would force the suppressed-outfit string back into composition and break the position-2 front-load contract for nudity.
    multiplier: 1.4,
    roleplay: 'naked',
    nude: 'full',                           // 'full' | 'accessories' | 'stripped'
    builtIn: true                            // always available, no purchase
  };

  // NO_WARDROBE_PSEUDO — distinct from NUDE_PSEUDO: NUDE is "fully naked, no clothing"
  // (accessories like collar/cuffs are STILL allowed if equipped). NO_WARDROBE is "stripped
  // of EVERYTHING — no garments, no accessories, no jewelry, no collar, no restraints,
  // no anything on her body". Raw nakedness, more aggressive nudity prompt-block in imaging.js.
  const NO_WARDROBE_PSEUDO_ID = 'none';
  const NO_WARDROBE_PSEUDO = {
    id: NO_WARDROBE_PSEUDO_ID,
    displayName: 'No wardrobe (stripped of everything)',
    emoji: '🚫',
    price: 0,
    tier: 1,
    description: '',                        // <<INTENTIONAL EMPTY — DO NOT FILL IN>> imaging.js suppresses the outfit block entirely when nude:'stripped', replacing it with the more-aggressive no-wardrobe block at prompt position 2 (which explicitly bans accessories/jewelry/collar/restraints). Filling this would break the position-2 front-load contract.
    multiplier: 1.5,                        // slightly higher than NUDE since it's more extreme
    roleplay: 'stripped',
    nude: 'stripped',                       // NEW value — distinct from 'full' / 'accessories'
    builtIn: true                            // always available, no purchase
  };

  // Condom-on wardrobe pseudo-outfit. When equipped, pregnancy
  // conception gate suppresses the conception roll (matches the existing `currentOutfit
  // !== 'condom-on'` check in pregnancy.js attemptConception). Free + always available.
  // Doesn't change image-prompt rendering (it's "wearing a condom" — invisible).
  // Consumes one `condom` from inventory when equipped to enforce supply economy.
  const CONDOM_PSEUDO_ID = 'condom-on';
  const CONDOM_PSEUDO = {
    id: CONDOM_PSEUDO_ID,
    displayName: 'Condom equipped',
    emoji: '🎈',
    price: 0,
    tier: 1,
    description: 'wearing a condom (not visible in image)',  // invisible — imaging.js renders her in her PREVIOUS outfit; this is a state flag for the pregnancy gate
    multiplier: 1.0,
    roleplay: 'protected-sex',
    builtIn: true,
    blocksConception: true                    // pregnancy.js reads this flag
  };

  // Outfit catalog — these become item catalog entries too, but the descriptions live here
  // (so we can have detailed prompt blocks per outfit). The shop reads from this catalog when
  // user browses the 'outfits' subcategory.
  //
  // Nudity-aware fields per outfit (read by imaging.js):
  //   nude: 'full' | 'accessories' | undefined
  //         - 'full'        → completely naked, no accessories
  //         - 'accessories' → nude body + listed accessories (collar, cuffs, harness, etc.)
  //   accessoriesOnly: string — the accessory description for 'accessories'-tier nude outfits.
  //         The imaging composer will build: "FULLY NUDE, naked, bare body, ... wearing only <accessoriesOnly>"
  const OUTFITS = [
    {
      id: 'school-uniform-preppy',
      displayName: 'Preppy School Uniform',
      emoji: '🎒',
      price: 120,
      tier: 2,
      description: 'pleated plaid mini-skirt, white button-up shirt half-tucked, knee-high socks, black loafers, small leather satchel',
      multiplier: 1.1,
      roleplay: 'schoolgirl'
    },
    {
      id: 'nurse-outfit',
      displayName: 'Nurse Outfit',
      emoji: '💉',
      price: 180,
      tier: 2,
      description: 'tight white nurse dress with red cross detail, white thigh-highs, white nurse cap, stethoscope around neck',
      multiplier: 1.15,
      roleplay: 'nurse'
    },
    {
      id: 'maid-outfit',
      displayName: 'French Maid',
      emoji: '🧹',
      price: 150,
      tier: 2,
      description: 'classic black and white French maid dress, frilly white apron, lace stockings, small white maid headpiece, black Mary Janes',
      multiplier: 1.15,
      roleplay: 'maid'
    },
    {
      id: 'lingerie-red',
      displayName: 'Red Lingerie Set',
      emoji: '🌹',
      price: 220,
      tier: 3,
      description: 'red lace balconette bra, matching thong, red garter belt, sheer black stockings, red stilettos',
      multiplier: 1.2,
      roleplay: 'seduction'
    },
    {
      id: 'lingerie-black',
      displayName: 'Black Lingerie Set',
      emoji: '🖤',
      price: 220,
      tier: 3,
      description: 'black lace bralette, matching high-cut panties, black garter belt, black sheer thigh-highs, black heels',
      multiplier: 1.2,
      roleplay: 'seduction'
    },
    {
      id: 'latex-fetish',
      displayName: 'Latex Catsuit',
      emoji: '🖤',
      price: 450,
      tier: 4,
      description: 'shiny black latex catsuit clinging to every curve, strategic zipper detailing, knee-high black stiletto boots',
      multiplier: 1.35,
      roleplay: 'fetish'
    },
    {
      id: 'bondage-harness',
      displayName: 'Leather Bondage Harness',
      emoji: '⛓️',
      price: 380,
      tier: 4,
      description: 'intricate black leather body harness crossing chest and hips, matching collar and cuffs, high-cut black briefs, bare feet',
      multiplier: 1.4,
      roleplay: 'bondage'
    },
    {
      id: 'schoolgirl-cosplay',
      displayName: 'Anime Schoolgirl Cosplay',
      emoji: '🌸',
      price: 200,
      tier: 3,
      description: 'stylized sailor-style school uniform in navy and white, short pleated skirt, oversized red bow, knee-high white socks, black Mary Janes',
      multiplier: 1.25,
      roleplay: 'cosplay'
    },
    {
      id: 'sundress-innocent',
      displayName: 'Innocent Sundress',
      emoji: '🌻',
      price: 90,
      tier: 2,
      description: 'light yellow cotton sundress with small floral print, thin straps, bare legs, plain white Keds',
      multiplier: 1.05,
      roleplay: 'girl-next-door'
    },
    {
      id: 'bikini-string',
      displayName: 'String Bikini',
      emoji: '👙',
      price: 85,
      tier: 2,
      description: 'tiny black string bikini, minimal coverage, barefoot',
      multiplier: 1.1,
      roleplay: 'beach'
    },
    {
      id: 'collar-only',
      displayName: 'Collar Only',
      emoji: '🔗',
      price: 55,
      tier: 3,
      description: 'nothing but a thick black leather collar with metal D-ring',
      multiplier: 1.3,
      roleplay: 'ownership',
      nude: 'accessories',
      accessoriesOnly: 'a thick black leather collar with metal D-ring around her neck'
    },
    {
      id: 'gag-harness-full',
      displayName: 'Full Bondage + Gag',
      emoji: '😶',
      price: 520,
      tier: 5,
      description: 'full leather body harness with O-rings, spreader bar between ankles, ball-gag with drool guard, blindfold on her forehead ready to pull down',
      multiplier: 1.5,
      roleplay: 'full-bondage',
      nude: 'accessories',
      accessoriesOnly: 'a full leather body harness with O-rings crossing bare breasts and hips, a spreader bar between her ankles, a ball-gag with drool guard in her mouth, a blindfold pushed up on her forehead'
    },
    {
      id: 'teacher-outfit',
      displayName: 'Strict Teacher',
      emoji: '📐',
      price: 160,
      tier: 2,
      description: 'tight pencil skirt, crisp white button-up shirt, reading glasses, hair in tight bun, low heels',
      multiplier: 1.15,
      roleplay: 'teacher'
    },
    {
      id: 'cheerleader-outfit',
      displayName: 'Cheerleader',
      emoji: '📣',
      price: 140,
      tier: 2,
      description: 'short pleated cheerleader skirt in red and white, matching crop-top, white ankle socks, sneakers, pigtails with red ribbons',
      multiplier: 1.2,
      roleplay: 'cheerleader'
    },

    // SKIMPYWEAR.1 (Gee) — per-girl-type SKIMPY / MAX-NUDITY outfits: "office worker a long male-suit-
    // tie only all nude and nothing but a tie ... police woman ... as skimpy and as much nudity ... as
    // is possible". Each is a `nude:'accessories'` outfit so imaging front-loads full nudity and renders
    // ONLY the one scrap named in accessoriesOnly. `syncArchetype` tags the girl-type it's made for (OUTFITSYNC).
    // NOTE (Gee): POSITIVE prompts only — NEVER write "no bra / no panties" (this gen latches onto
    // the negated noun and renders it). Push affirmative nudity words: topless, bottomless, bare
    // exposed breasts, nipples out, bare naked pussy, bare ass, fully nude.
    {
      id: 'skimpy-office-necktie', displayName: 'Office: Necktie Only', emoji: '👔', price: 160, tier: 3,
      description: 'fully nude, topless, bottomless, only a long loosened man\'s silk necktie around her bare neck dangling between her bare exposed breasts with nipples out, bare naked pussy, high heels', multiplier: 1.4, roleplay: 'office',
      nude: 'accessories', accessoriesOnly: 'only a long loosened man\'s silk necktie around her bare neck dangling between her bare exposed breasts, nipples out, topless, bottomless, bare naked pussy, fully nude, black high heels', syncArchetype: 'office'
    },
    {
      id: 'skimpy-police', displayName: 'Police: Open Shirt', emoji: '👮', price: 175, tier: 3,
      description: 'a police uniform shirt hanging wide open off her shoulders, topless, bare exposed breasts with nipples out, utility belt low on bare hips with handcuffs, bottomless, bare naked pussy, peaked cap', multiplier: 1.4, roleplay: 'police',
      nude: 'accessories', accessoriesOnly: 'a police uniform shirt hanging wide open off her shoulders, topless with bare exposed breasts and nipples out, a utility belt low on her bare hips with handcuffs, bottomless, bare naked pussy, a peaked police cap', syncArchetype: 'police'
    },
    {
      id: 'skimpy-nurse', displayName: 'Nurse: Open Smock', emoji: '🩺', price: 165, tier: 3,
      description: 'a nurse smock hanging wide open off her shoulders, topless, bare exposed breasts with nipples out, white thigh-high stockings, nurse cap, stethoscope between her bare tits, bottomless, bare naked pussy', multiplier: 1.4, roleplay: 'nurse',
      nude: 'accessories', accessoriesOnly: 'a nurse smock hanging open off her shoulders, topless with bare exposed breasts and nipples out, white thigh-high stockings, a nurse cap, a stethoscope between her bare tits, bottomless, bare naked pussy', syncArchetype: 'nurse'
    },
    {
      id: 'skimpy-teacher', displayName: 'Teacher: Bare Under Blazer', emoji: '📐', price: 160, tier: 3,
      description: 'an open blazer off her shoulders, topless, bare exposed breasts with nipples out, reading glasses, hair in a tight bun, pencil skirt shoved up around her waist, bottomless, bare ass and bare naked pussy', multiplier: 1.35, roleplay: 'teacher',
      nude: 'accessories', accessoriesOnly: 'an open blazer hanging off her shoulders, topless with bare exposed breasts and nipples out, reading glasses, hair in a tight bun, a pencil skirt shoved up around her waist, bottomless, bare ass and bare naked pussy', syncArchetype: 'teacher'
    },
    {
      id: 'skimpy-cheer', displayName: 'Cheer: Top Up, Skirt Up', emoji: '📣', price: 150, tier: 3,
      description: 'a cheer crop-top shoved up above her bare exposed bouncing tits with nipples out, a tiny pleated skirt flipped up baring her bare ass and bare naked pussy, pom-poms, ankle socks, pigtails', multiplier: 1.35, roleplay: 'cheerleader',
      nude: 'accessories', accessoriesOnly: 'a cheer crop-top shoved up above her bare exposed tits with nipples out, a tiny pleated skirt flipped up over her bare ass and bare naked pussy, pom-poms, ankle socks, pigtails', syncArchetype: 'sorority'
    },
    {
      id: 'skimpy-maid', displayName: 'Maid: Apron Only', emoji: '🧹', price: 150, tier: 3,
      description: 'only a frilly white maid apron tied at the waist, otherwise fully nude, bare exposed breasts and nipples at the sides, completely bare ass exposed from behind, bare naked pussy, lace choker, maid headpiece', multiplier: 1.35, roleplay: 'maid',
      nude: 'accessories', accessoriesOnly: 'only a frilly white maid apron tied at the waist, otherwise fully nude, bare exposed breasts and nipples at the sides, completely bare ass exposed from behind, bare naked pussy, a lace choker and maid headpiece', syncArchetype: 'maid'
    },
    {
      id: 'skimpy-schoolgirl', displayName: 'Schoolgirl: Tied Blouse', emoji: '🎒', price: 150, tier: 3,
      description: 'a school blouse knotted up high under her bare exposed breasts with nipples out, topless, a micro pleated skirt, bottomless, bare naked pussy underneath, knee-high socks, pigtails', multiplier: 1.35, roleplay: 'schoolgirl',
      nude: 'accessories', accessoriesOnly: 'a school blouse knotted up high under her bare exposed breasts and nipples out, topless, a micro pleated skirt, bottomless, bare naked pussy underneath, knee-high socks, pigtails', syncArchetype: 'college'
    },
    {
      id: 'skimpy-waitress', displayName: 'Waitress: Bare Under Apron', emoji: '☕', price: 145, tier: 3,
      description: 'a tiny diner half-apron over an otherwise fully nude body, topless, bare exposed tits with nipples out, a short skirt hiked up over bare hips, bottomless, bare naked pussy', multiplier: 1.3, roleplay: 'waitress',
      nude: 'accessories', accessoriesOnly: 'a tiny diner half-apron over an otherwise fully nude body, topless with bare exposed tits and nipples out, a name tag by a bare nipple, a short skirt hiked up over bare hips, bottomless, bare naked pussy', syncArchetype: 'barista'
    },
    // PREGOUTFIT.1 (Gee) — a preggo "simi need" half-nude outfit that accentuates her swollen belly +
    // milk-heavy tits. Positive nudity prompt; meant for a pregnant captive (belly/milk show). The soft
    // bonus while pregnant is the OUTFITSYNC sync match (roleplay 'pregnant' / archetype-agnostic).
    {
      id: 'preggo-belly-harness', displayName: 'Breeder: Belly + Milk Harness', emoji: '🤰', price: 170, tier: 3,
      description: 'an open strappy harness framing a heavily pregnant swollen belly and huge milk-swollen tits, bare exposed breasts with leaking nipples out, bottomless, bare naked pussy under the bump, barefoot', multiplier: 1.4, roleplay: 'pregnant',
      nude: 'accessories', accessoriesOnly: 'an open strappy harness framing her heavily pregnant swollen belly and milk-swollen tits, bare exposed breasts with fat leaking nipples out, topless, bottomless, bare naked pussy below the bump, barefoot', syncArchetype: 'pregnant'
    },
    {
      id: 'goth-outfit',
      displayName: 'Goth Fit',
      emoji: '🖤',
      price: 175,
      tier: 3,
      description: 'black corset, black ripped fishnets, leather mini-skirt, heavy combat boots, chunky silver jewelry, heavy eyeliner',
      multiplier: 1.2,
      roleplay: 'goth'
    },
    {
      id: 'latex-red',
      displayName: 'Red Latex',
      emoji: '🔴',
      price: 420,
      tier: 4,
      description: 'shiny red latex bodysuit with strategic cutouts, matching red latex gloves, red stiletto boots',
      multiplier: 1.35,
      roleplay: 'fetish'
    },
    {
      id: 'yoga-pants',
      displayName: 'Yoga Set',
      emoji: '🧘',
      price: 95,
      tier: 2,
      description: 'high-waist black leggings, cropped white sports bra, bare feet, hair in messy bun, light sweat glow',
      multiplier: 1.1,
      roleplay: 'yoga'
    },
    {
      id: 'maid-modern',
      displayName: 'Modern Maid',
      emoji: '🧺',
      price: 170,
      tier: 3,
      description: 'short black dress with white apron, thigh-high white stockings with black garter, black low heels, white headband',
      multiplier: 1.2,
      roleplay: 'maid-modern'
    },
    {
      id: 'cop-outfit',
      displayName: 'Sexy Officer',
      emoji: '👮',
      price: 210,
      tier: 3,
      description: 'tight blue police-style uniform shirt, short black skirt, black belt with toy handcuffs on hip, patent black heels, aviators',
      multiplier: 1.25,
      roleplay: 'cop'
    },
    {
      id: 'hospital-gown',
      displayName: 'Hospital Gown (back open)',
      emoji: '🏥',
      price: 65,
      tier: 2,
      description: 'thin pastel hospital gown tied loose at the back, bare feet, hospital wristband, nothing under',
      multiplier: 1.3,
      roleplay: 'medical-patient'
    },
    {
      id: 'ballerina',
      displayName: 'Ballerina',
      emoji: '🩰',
      price: 155,
      tier: 3,
      description: 'white tutu, nude leotard, pale pink tights, ballet pointe shoes, hair in a tight topknot, neck exposed',
      multiplier: 1.2,
      roleplay: 'ballerina'
    },
    {
      id: 'pony-play',
      displayName: 'Pony Play Harness',
      emoji: '🐴',
      price: 480,
      tier: 5,
      description: 'leather pony-play harness with reins, bit-gag, knee-high leather boots, pony-tail plug, hair in matching pony-tail',
      multiplier: 1.5,
      roleplay: 'pony-play',
      nude: 'accessories',
      accessoriesOnly: 'a leather pony-play harness with reins crossing bare skin, a bit-gag in her mouth, knee-high leather riding boots, a pony-tail plug, and her hair tied in a matching pony-tail'
    },
    {
      id: 'cuffed-naked',
      displayName: 'Just Cuffs',
      emoji: '🔗',
      price: 80,
      tier: 3,
      description: 'completely nude except for steel wrist cuffs, matching ankle cuffs, and a thin chain connecting them',
      multiplier: 1.35,
      roleplay: 'restraint-only',
      nude: 'accessories',
      accessoriesOnly: 'steel wrist cuffs, matching ankle cuffs, and a thin chain connecting them — nothing else on her body'
    }
  ];

  function catalog() { return OUTFITS.slice(); }

  function getById(id) {
    if (id === NUDE_PSEUDO_ID) return NUDE_PSEUDO;
    if (id === NO_WARDROBE_PSEUDO_ID) return NO_WARDROBE_PSEUDO;
    if (id === CONDOM_PSEUDO_ID) return CONDOM_PSEUDO;
    return OUTFITS.find(o => o.id === id);
  }

  // Built-in outfits every girl can equip without buying (NUDE_PSEUDO + NO_WARDROBE_PSEUDO + CONDOM_PSEUDO).
  function builtIns() {
    return [NUDE_PSEUDO, NO_WARDROBE_PSEUDO, CONDOM_PSEUDO];
  }

  // Is this outfit a nude variant?  Returns 'full' | 'accessories' | 'stripped' | false.
  function isNude(outfitOrId) {
    if (!outfitOrId) return false;
    const o = typeof outfitOrId === 'string' ? getById(outfitOrId) : outfitOrId;
    return o?.nude || false;
  }

  // Buy an outfit for a specific girl — adds to her wardrobe.
  function buyForGirl(girlId, outfitId) {
    const girl = window.DMTHGame.state.getGirl(girlId);
    if (!girl) throw new Error('no such girl');
    const outfit = getById(outfitId);
    if (!outfit) throw new Error('no such outfit');
    if ((girl.wardrobe || []).some(w => w.id === outfitId)) {
      throw new Error('she already owns this outfit');
    }
    const ok = window.DMTHGame.state.spendMoney(outfit.price, `wardrobe:${outfitId}:${girlId}`);
    if (!ok) throw new Error('insufficient funds');
    const newWardrobe = [...(girl.wardrobe || []), {
      id: outfit.id,
      displayName: outfit.displayName,
      description: outfit.description,
      source: 'purchased',
      price: outfit.price,
      multiplier: outfit.multiplier,
      acquiredAt: Date.now()
    }];
    window.DMTHGame.state.updateGirl(girlId, { wardrobe: newWardrobe });
    return { ok: true, outfit };
  }

  function equip(girlId, outfitId) {
    const girl = window.DMTHGame.state.getGirl(girlId);
    if (!girl) throw new Error('no such girl');
    // Built-in pseudo-outfits (NUDE_PSEUDO + NO_WARDROBE_PSEUDO + CONDOM_PSEUDO) are
    // always equippable without buying. Auto-add to wardrobe array if missing so legacy
    // saves get the option.
    const isBuiltIn = outfitId === NUDE_PSEUDO_ID
      || outfitId === NO_WARDROBE_PSEUDO_ID
      || outfitId === CONDOM_PSEUDO_ID;
    if (!isBuiltIn && !(girl.wardrobe || []).some(w => w.id === outfitId)) {
      throw new Error('outfit not in her wardrobe');
    }
    // Condom-on requires consuming one `condom` from inventory at equip time so
    // the catalog item drives a real supply economy. Without a condom in inventory, fail.
    if (outfitId === CONDOM_PSEUDO_ID) {
      const ok = window.DMTHGame.state.consumeItem('condom', 1);
      if (!ok) throw new Error('no condom in inventory — buy from shop');
    }
    let wardrobe = girl.wardrobe || [];
    if (isBuiltIn && !wardrobe.some(w => w.id === outfitId)) {
      const builtIn = outfitId === NUDE_PSEUDO_ID ? NUDE_PSEUDO
        : outfitId === NO_WARDROBE_PSEUDO_ID ? NO_WARDROBE_PSEUDO
        : CONDOM_PSEUDO;
      wardrobe = [...wardrobe, { ...builtIn, source: 'built-in' }];
    }
    // Condom-on is a STATE OVERLAY, not a visible
    // outfit. Track previousOutfit at equip time so the image-prompt path can render
    // her in her real outfit while the conception gate reads the condom-on flag.
    const patch = { currentOutfit: outfitId, wardrobe };
    if (outfitId === CONDOM_PSEUDO_ID) {
      patch.previousOutfit = girl.currentOutfit || 'default';
    }
    window.DMTHGame.state.updateGirl(girlId, patch);
    return { ok: true };
  }

  // Convenience: equip the built-in nude pseudo-outfit. Always succeeds.
  function derobe(girlId) {
    return equip(girlId, NUDE_PSEUDO_ID);
  }

  // Convenience: equip the built-in no-wardrobe pseudo-outfit (strips
  // EVERYTHING including accessories). Always succeeds.
  function stripEverything(girlId) {
    return equip(girlId, NO_WARDROBE_PSEUDO_ID);
  }

  // Get content-value multiplier for what she's currently wearing
  function currentMultiplier(girl) {
    const current = (girl.wardrobe || []).find(w => w.id === girl.currentOutfit);
    return current?.multiplier || 1.0;
  }

  // Stat bonuses from the equipped outfit (CLOTHING.1). Derived from the outfit's content
  // multiplier + nude/roleplay flags so we don't have to hand-author a bonus block per outfit:
  //   - johnPayMul:         multiplier already applied to john pay via johnHappinessForGirl
  //   - playerSatisfaction: a lewder/nuder outfit gives the player a bigger satisfaction hit per sex act
  //   - girlArousal:        skin/lewd outfits leave her more exposed + worked-up
  //   - escapeSuppress:     restraint-flavored outfits physically hold her (lowers escape risk)
  // OUTFITSYNC.1 (Gee: "put a nurese in a nurse outfit its a major buff, a sority girl in a cheer
  // outfit a big buff") — does the equipped outfit's type match her girl-type? Matches the outfit's
  // syncArchetype OR roleplay against her archetypeTemplate (loose contains-match so nurse↔nurse,
  // cheer↔sorority, office↔office-worker all land). Returns the matched outfit or null.
  function syncMatch(girl) {
    const o = getById(girl?.currentOutfit);
    if (!o) return null;
    const tags = [o.syncArchetype, o.roleplay].filter(Boolean).map(s => String(s).toLowerCase());
    // PREGOUTFIT.1 — a 'pregnant'-tagged outfit (the belly/milk harness) syncs while she's pregnant.
    if (tags.includes('pregnant') && girl?.pregnancy?.status === 'pregnant') return o;
    const arc = String(girl?.archetypeTemplate || '').toLowerCase();
    if (!arc) return null;
    return tags.some(t => t === arc || arc.includes(t) || t.includes(arc)) ? o : null;
  }
  // Synergy multiplier applied to sale price + film value when she's dressed in her matching type.
  function syncMultiplier(girl) { return syncMatch(girl) ? 1.25 : 1.0; }

  function outfitBonuses(girl) {
    const o = getById(girl?.currentOutfit) || {};
    const mult = ((girl?.wardrobe || []).find(w => w.id === girl.currentOutfit)?.multiplier) || o.multiplier || 1.0;
    const restraintFlavored = /restraint|cuff|harness|bondage|latex|catsuit|chain/i.test(`${o.roleplay || ''} ${o.id || ''} ${o.description || ''}`);
    // OUTFITSYNC.1 — a TYPE-MATCHED outfit is a major buff: +25% john pay, more satisfaction + arousal.
    const synced = !!syncMatch(girl);
    const syncPay = synced ? 1.25 : 1.0;
    return {
      synced,
      johnPayMul: mult * syncPay,
      playerSatisfaction: Math.max(0, Math.round((mult - 1) * 6)) + (synced ? 3 : 0),
      girlArousal: (o.nude ? 4 : Math.max(0, Math.round((mult - 1) * 8))) + (synced ? 5 : 0),
      escapeSuppress: restraintFlavored ? 0.03 : 0
    };
  }

  window.DMTHGame = window.DMTHGame || {};
  window.DMTHGame.wardrobe = Object.freeze({
    OUTFITS, catalog, getById, buyForGirl, equip, derobe, stripEverything,
    currentMultiplier, outfitBonuses, builtIns, isNude,
    NUDE_PSEUDO_ID, NUDE_PSEUDO,
    NO_WARDROBE_PSEUDO_ID, NO_WARDROBE_PSEUDO,
    CONDOM_PSEUDO_ID, CONDOM_PSEUDO
  });
})();
