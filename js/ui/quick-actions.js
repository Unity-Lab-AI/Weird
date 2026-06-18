// DUNGEON MASTER: THE HUNT — one-hand mouse UX with full captor-dynamic action set.
// Tabbed by category: FORCE / POSITIONS / ORAL / ANAL / PAIN / VIOLENCE / PUNISHMENT /
// DEGRADE / BONDAGE / DRUGS / LOVE / COMMANDS.
//
// Each action carries:
//   emoji    — small visual prefix
//   label    — short button text
//   text     — Master-action text sent to Ollama as the user turn
//   applyId  — (optional) ACTIONS spec key in action-effects.js. When present, the
//              click routes through applyAction(girl.id, applyId) so the deterministic
//              stamina/health/mood/arousal/wetness/cumLoad/bruises/bondXP/bondDebt
//              deltas fire whether or not Ollama's emitted delta block parses. THIS
//              is how her stats stay in sync — don't rely on the model alone.
//   sat      — (legacy, used only when applyId is absent) raw satisfaction bump.

(function () {
  'use strict';

  const TABS = {
    force: {
      label: '💢 Force',
      actions: [
        { emoji: '🤜',  label: 'pin the bitch down',   text: '*pins her shoulders to the bed, one hand on her throat, forces her knees apart*', applyId: 'restrain' },
        { emoji: '🍆',  label: 'split her open dry',   text: '*shoves inside her dry, no warning, watches her face break*', applyId: 'sex-rough' },
        { emoji: '🍑',  label: 'force her tight ass',  text: '*spits once, forces the head in, ignores the scream*', applyId: 'sex-anal' },
        { emoji: '👄',  label: 'wreck her throat',     text: '*grabs her hair with both hands and fucks her throat until her nose hits my pelvis*', applyId: 'sex-oral' },
        { emoji: '🤐',  label: 'bury it till she gags',text: '*holds her jaw open and buries it, holds her there while she gags*', applyId: 'sex-oral' },
        { emoji: '🧱',  label: 'fuck her into the wall',text: '*slams her against the wall face-first, pulls her hips back, takes what I want*', applyId: 'sex-rough' },
        { emoji: '💦',  label: 'flood her cunt',       text: '*pins her hips, holds her in place, empties inside her, doesn\'t let her pull away*', applyId: 'sex-cum-inside' },
        { emoji: '🫸',  label: 'choke her while I fuck',text: '*grips her throat while I fuck her, watches her eyes go glassy*', applyId: 'choke' },
        { emoji: '✋',  label: 'drag her by the hair',  text: '*yanks her by the roots, drags her where I want her*', applyId: 'restrain' },
        { emoji: '🩸',  label: 'breed the bitch',      text: '*holds her down after finishing, keeps me inside, refuses to let it spill*', applyId: 'sex-cum-inside' }
      ]
    },
    positions: {
      label: '🍆 Positions',
      actions: [
        { emoji: '⬇',  label: 'pin + breed missionary',  text: '*puts her on her back, pins her wrists over her head, fucks her slow and deep*', applyId: 'sex-gentle' },
        { emoji: '🐕', label: 'rut her doggy',           text: '*grabs her hips and pulls her back onto me, sets a brutal pace*', applyId: 'sex-rough' },
        { emoji: '🤸', label: 'flatten + pound',         text: '*flattens her face-down onto the mattress, lies on top, fucks her pinned flat*', applyId: 'sex-rough' },
        { emoji: '🔁', label: 'bounce her backwards',    text: '*sits back, pulls her onto me backwards, grabs her hips and bounces her*', applyId: 'sex-rough' },
        { emoji: '🧍', label: 'fuck her up the wall',    text: '*picks her up, pins her to the wall, her legs around my waist, fucks her held up*', applyId: 'sex-rough' },
        { emoji: '🛏️', label: 'spoon + throat-grip',     text: '*behind her, hand on her throat, one leg up, fucks her on her side*', applyId: 'sex-rough' },
        { emoji: '🧎', label: 'use her kneeling mouth',  text: '*stands over her, hands in her hair, uses her mouth*', applyId: 'sex-oral' },
        { emoji: '🪑', label: 'spank her over my lap',   text: '*drags her face-down across my thighs, ass up, starts spanking*', applyId: 'slap' },
        { emoji: '🔃', label: 'upside-down throat fuck',  text: '*lifts her upside down by the hips, face at my cock, fucks her throat while her legs kick*', applyId: 'sex-oral' },
        { emoji: '🪢', label: 'tie her open + take it',  text: '*ties each wrist and ankle to the bedposts, spreads her wide, takes my time*', applyId: 'sex-gentle' }
      ]
    },
    oral: {
      label: '👅 Oral',
      actions: [
        { emoji: '🫦',  label: 'fuck her face',         text: '*holds her head and fucks her mouth with full strokes*', applyId: 'sex-oral' },
        { emoji: '🌪️', label: 'bulge her throat',       text: '*watches the bulge of my cock moving in her throat, one hand pressing on it from outside*', applyId: 'sex-oral' },
        { emoji: '💧',  label: 'gag her on it',         text: '*holds her nose, forces her to take all of it, listens to her gag and choke*', applyId: 'sex-oral' },
        { emoji: '✋',  label: 'pinch her nose, no air', text: '*pinches her nose so her only air is my cock pulling back*', applyId: 'sex-oral' },
        { emoji: '👄',  label: 'cock-slap her stupid',  text: '*pulls out, slaps her across the face with my cock, then back in*', applyId: 'slap' },
        { emoji: '🥵',  label: 'make her swallow it',   text: '*finishes in her mouth, grabs her jaw shut, tells her to swallow every drop*', applyId: 'sex-oral' },
        { emoji: '💦',  label: 'glaze her face',        text: '*pulls out at the last second, coats her cheeks, eyelashes, mouth*', applyId: 'sex-oral', actTag: 'facial' },
        { emoji: '🧎',  label: 'make her worship cock', text: '*stands over her, tells her to kiss every inch, thank it, lick it slow*', applyId: 'sex-oral', minStock: 5 },
        { emoji: '🫁',  label: 'nose to my pelvis',     text: '*buries her nose in my pelvis and holds her there, counts to ten*', applyId: 'sex-oral' },
        { emoji: '🦷',  label: 'no teeth, slut',        text: '*one finger under her jaw — no teeth. she learns fast.*', applyId: 'slap' },
        { emoji: '🌊',  label: 'bukkake — drown her',   text: '*lines them up and has load after load painted across her face until she\'s dripping, blinking it out of her eyes, mouth open for more*', applyId: 'sex-oral', actTag: 'bukkake' },
        { emoji: '🥛',  label: 'gokkun — swallow every load', text: '*collects load after load in a glass and makes her tip the whole thing back, throat working, not a drop wasted*', applyId: 'sex-oral' },
        { emoji: '🔀',  label: 'ass-to-mouth',          text: '*pulls straight out of her ass and shoves it down her throat, makes her clean every inch with her tongue*', applyId: 'sex-oral' },
        { emoji: '🍯',  label: 'throat creampie',       text: '*buries it to the root and empties straight down her throat, holds her there until she\'s swallowed it all*', applyId: 'sex-oral' }
      ]
    },
    anal: {
      label: '🍑 Anal',
      actions: [
        { emoji: '💢',  label: 'force her ass dry',     text: '*spits once, works the head in, ignores her cry*', applyId: 'sex-anal' },
        { emoji: '🟣',  label: 'plug her open',         text: '*slides the plug in, leaves it an hour to open her up*', applyId: 'restrain' },
        { emoji: '🍆',  label: 'sink it deep in her ass',text: '*slides in inch by inch, watches her face in the mirror*', applyId: 'sex-anal' },
        { emoji: '🚀',  label: 'jackhammer her ass',    text: '*grabs her hips and sets a merciless pace, hears her lose her breath*', applyId: 'sex-anal' },
        { emoji: '🫸',  label: 'stuff both holes',       text: '*works in two while a finger stays deep in her cunt, both at once*', applyId: 'sex-anal' },
        { emoji: '💦',  label: 'cream her gaping ass',  text: '*empties deep, holds her hips still, watches it leak when I pull out*', applyId: 'sex-anal' },
        { emoji: '👅',  label: 'tongue her asshole',    text: '*spreads her cheeks, tongue flat from back to front, over and over*', applyId: 'sex-oral' },
        { emoji: '📏',  label: 'train her ass open',    text: '*starts with one finger, works up, tells her what number we\'re at*', applyId: 'sex-anal' },
        { emoji: '🕳️',  label: 'hold her gaping',       text: '*pulls out at the right moment, holds her open, watches*', applyId: 'sex-anal' },
        { emoji: '✊',  label: 'fist her ass',          text: '*tucks the thumb and works the whole fist past her ring, knuckle by knuckle, until her hole swallows my wrist*', applyId: 'sex-anal', actTag: 'fisted' },
        { emoji: '🌹',  label: 'prolapse her',          text: '*pumps deep and fast then drags out hard over and over until her hole turns itself inside-out, pink and ruined*', applyId: 'sex-anal', actTag: 'prolapsed' },
        { emoji: '🔁',  label: 'ass-to-mouth spit-shine',text: '*pulls straight out of her ass and feeds it to her mouth, makes her tongue it clean before it goes back in*', applyId: 'sex-oral' }
      ]
    },
    pain: {
      label: '🔥 Pain (kink)',
      actions: [
        { emoji: '🕯️',  label: 'wax her nipples raw',    text: '*drips red candle wax slowly across her nipples and down her sternum*', applyId: 'slap' },
        { emoji: '🕯️',  label: 'wax her spread thighs',  text: '*drips hot wax along her inner thighs, watches her stomach jump*', applyId: 'slap' },
        { emoji: '🥢',  label: 'stripe her back',        text: '*lays five stripes across her shoulders with the leather, makes her count them*', applyId: 'whip' },
        { emoji: '🪵',  label: 'cane her ass raw',       text: '*six strokes with the cane, slow and measured, marks across both cheeks*', applyId: 'whip' },
        { emoji: '🪢',  label: 'flog her tits red',      text: '*steady flogging across her tits until they\'re red and swollen*', applyId: 'whip' },
        { emoji: '🤏',  label: 'twist her nipples',      text: '*takes both nipples between thumb and forefinger, pinches, twists*', applyId: 'slap' },
        { emoji: '🎀',  label: 'clamp her nipples',      text: '*clips the weighted clamps on, adjusts until she whimpers*', applyId: 'slap' },
        { emoji: '📎',  label: 'clamp her clit',         text: '*small clamp on her clit hood, just enough pressure to keep her still*', applyId: 'slap' },
        { emoji: '✋',  label: 'slap her wet cunt',      text: '*open-hand slap right between her legs, sharp wet sound*', applyId: 'slap' },
        { emoji: '🤚',  label: 'slap her tits raw',      text: '*open-handed slap across one tit, then the other, until they sting red*', applyId: 'slap' },
        { emoji: '🦷',  label: 'bite her nipples',       text: '*leans down, teeth closed on one nipple, bites until she sucks in a breath*', applyId: 'slap' },
        { emoji: '🧊',  label: 'ice her stiff nipples',  text: '*holds an ice cube on each nipple until she\'s shaking and her teeth chatter*', applyId: 'restrain' },
        { emoji: '🔥',  label: 'burn her inner thigh',   text: '*lights one, lets it smolder against her inner thigh, watches the skin pucker*', applyId: 'whip' }
      ]
    },
    violence: {
      label: '🩸 Violence',
      actions: [
        { emoji: '👊',  label: 'punch face',            text: '*throws a closed fist at her cheek, watches the bruise bloom up under the skin*', applyId: 'punch' },
        { emoji: '✋',  label: 'open-palm slap face',   text: '*full open-handed slap across her face, head whips sideways, lip splits*', applyId: 'slap' },
        { emoji: '🤚',  label: 'backhand face',         text: '*backhands her hard across the cheek, knocks her sideways into the wall*', applyId: 'slap' },
        { emoji: '👊',  label: 'punch tit',             text: '*drives a fist square into one of her tits, full follow-through, watches her crumple*', applyId: 'punch' },
        { emoji: '🥊',  label: 'punch belly',           text: '*throws a hook into her stomach, watches her fold and dry-heave*', applyId: 'punch' },
        { emoji: '🥊',  label: 'throat punch',          text: '*throws a fast closed fist at her larynx, watches her drop trying to breathe*', applyId: 'punch' },
        { emoji: '🫳',  label: 'throat squeeze',        text: '*closes one hand around her throat and squeezes — not unconscious, just enough to make her choke*', applyId: 'choke' },
        { emoji: '🌑',  label: 'choke out',             text: '*both hands locked on her throat, holds until her body goes limp under me*', applyId: 'choke' },
        { emoji: '🦵',  label: 'knee to gut',           text: '*drives a knee up into her stomach, watches her go down*', applyId: 'punch' },
        { emoji: '🦵',  label: 'knee to clit',          text: '*drives a knee up between her spread legs, sharp, watches her shriek*', applyId: 'slap' },
        { emoji: '💪',  label: 'elbow drop ribs',       text: '*cocks an elbow back and drives it down into her ribs, hears one give*', applyId: 'punch' },
        { emoji: '🦶',  label: 'stomp ribs',            text: '*brings a boot down on her ribs while she lies pinned, feels them flex*', applyId: 'punch' },
        { emoji: '🦶',  label: 'stomp head',            text: '*pins her cheek to the concrete with a boot, leans his weight onto it*', applyId: 'punch' },
        { emoji: '💥',  label: 'head slam wall',        text: '*grabs her by the hair and slams her face into the wall, watches blood bloom*', applyId: 'punch' },
        { emoji: '💥',  label: 'head slam floor',       text: '*grips the back of her skull and drives her face into the concrete floor*', applyId: 'punch' },
        { emoji: '✋',  label: 'spank ass red',         text: '*open-hand spanks her ass cheek after cheek until both glow red and welt*', applyId: 'slap' },
        { emoji: '🩹',  label: 'hair drag floor',       text: '*grabs her by the hair and drags her across the floor on her side, refuses to let go*', applyId: 'slap' },
        { emoji: '💧',  label: 'waterboard',            text: '*folds the cloth over her face, pours until her body convulses against the restraints*', applyId: 'choke' },
        { emoji: '🩸',  label: 'backbreaker bend',      text: '*bends her backwards over my knee until her back arches past straight and she screams*', applyId: 'whip' }
      ]
    },
    punishment: {
      label: '⚱️ Punishment',
      actions: [
        { emoji: '🧍',  label: 'corner her, silent',     text: '*sends her to the corner on her knees, hands behind head, one hour silent*', applyId: 'restrain' },
        { emoji: '🧎',  label: 'kneel her on rice',      text: '*dumps a handful of rice, makes her kneel on it until I say stop*', applyId: 'slap' },
        { emoji: '🚫',  label: 'edge + deny her',        text: '*edges her for an hour, stops every time she tightens, no release*', applyId: 'sex-gentle' },
        { emoji: '🔁',  label: 'ruin her with forced orgasms', text: '*the wand, no breaks, until she\'s crying and trying to crawl away*', applyId: 'sex-rough' },
        { emoji: '🥣',  label: 'starve her today',       text: '*empties her food dish, shuts the slot, walks away*', applyId: 'restrain' },
        { emoji: '🚿',  label: 'hose her down cold',     text: '*turns the hose on her — icy — until her teeth chatter*', applyId: 'slap' },
        { emoji: '🎽',  label: 'belt her ass',           text: '*folds my belt, twenty strokes, tells her to count*', applyId: 'whip' },
        { emoji: '🪪',  label: 'make her watch in the mirror', text: '*forces her to watch herself in the mirror while I use her*', applyId: 'restrain' },
        { emoji: '🎭',  label: 'hood her in the dark',   text: '*pulls the canvas hood down, leaves her in the dark restrained*', applyId: 'restrain' },
        { emoji: '🔇',  label: 'gag + abandon her',      text: '*gags her, restrains her, shuts the door, leaves*', applyId: 'restrain' },
        { emoji: '⏳',  label: 'leave her tied, waiting', text: '*ties her spread, tells her I might be back tonight, might not*', applyId: 'restrain' }
      ]
    },
    degrade: {
      label: '🗣️ Degrade',
      actions: [
        { emoji: '🐕',  label: 'make her say "property"', text: 'you\'re property. say it. "I am property."', sat: 4 },
        { emoji: '🗑️',  label: 'name her a cum dump',   text: 'you\'re a cum dump. that\'s your whole purpose now. say it.', sat: 4 },
        { emoji: '📢',  label: 'make her state her purpose', text: 'tell me out loud what you exist for now. slow. clear.', sat: 4 },
        { emoji: '💧',  label: 'spit in her mouth',      text: '*grips her jaw open, gathers saliva, lets it drop onto her tongue* swallow.', sat: 5 },
        { emoji: '😾',  label: 'piss all over her',      text: '*makes her kneel in the shower, aims, makes her keep eye contact*', sat: 6, actTag: 'pissed' },
        { emoji: '✋',  label: 'slap her mid-fuck',      text: '*open-palm slap across her cheek mid-thrust, rhythm doesn\'t break*', applyId: 'slap' },
        { emoji: '👁️',  label: 'eyes on me or pain',     text: 'look at me. if you look away, I stop and hurt you.', sat: 3 },
        { emoji: '🗣️',  label: 'make her beg out loud',  text: 'beg. out loud. full sentences. tell me what you need.', sat: 4 },
        { emoji: '👎',  label: 'tell her she\'s worthless', text: 'you\'re worthless. nobody\'s coming. I\'m all you have now.', sat: 3 },
        { emoji: '🤡',  label: 'pose her open + describe it', text: '*makes her pose in the mirror holding herself open, describe what she sees*', sat: 4 },
        { emoji: '🌊',  label: 'piss + cum facial',      text: '*finishes across her face then keeps her kneeling and pisses over the cum, makes her hold her mouth open through all of it*', sat: 6, actTag: 'pissed' },
        { emoji: '❄️',  label: 'make her snowball it',   text: '*spits my own load back into her mouth and makes her hold it, swirl it, then swallow while I watch her throat move*', sat: 5, actTag: 'facial' },
        { emoji: '🚶',  label: 'cum-walk of shame',      text: '*coats her face and tits, then makes her crawl the length of the room with it dripping, thanking me the whole way*', sat: 4, actTag: 'facial' }
      ]
    },
    bondage: {
      label: '🪢 Bondage',
      actions: [
        { emoji: '🥚',  label: 'hogtie (nugget)',       text: '*cinches her wrists and ankles together behind her back, leaves her squirming on the floor like a hogtied nugget*', applyId: 'restrain' },
        { emoji: '⬆️',  label: 'wrist suspension',      text: '*hoists her up by the wrist cuffs, toes barely scraping the floor, leaves her dangling*', applyId: 'restrain' },
        { emoji: '📏',  label: 'spreader bar',          text: '*ankle spreader locks her wide open, she can\'t close her legs no matter how hard she tries*', applyId: 'restrain' },
        { emoji: '🧻',  label: 'mummify in tape',       text: '*wraps her head to toe in duct tape, leaves only her mouth and pussy uncovered*', applyId: 'restrain' },
        { emoji: '💀',  label: 'elbow tie (high)',      text: '*forces her elbows to touch behind her back and lashes them together, her chest jutted out hard*', applyId: 'restrain' },
        { emoji: '🔴',  label: 'ball gag locked',       text: '*cinches a tight ball gag deep into her mouth, padlocks the strap behind her head*', applyId: 'restrain' },
        { emoji: '🪢',  label: 'predicament tie',       text: '*ties one ankle to her own throat — if she lets it sag she chokes herself*', applyId: 'choke' },
        { emoji: '🛏️',  label: 'body bag cocoon',       text: '*zips her into a leather body bag with one breathing slit at the nose*', applyId: 'restrain' },
        { emoji: '🪤',  label: 'cage her',              text: '*locks her into a steel dog cage too small to stand or lie flat in*', applyId: 'restrain' },
        { emoji: '🦵',  label: 'frog tie',              text: '*lashes her thighs to her calves on both sides, frog-tied, her cunt forced wide open*', applyId: 'restrain' },
        { emoji: '⛓️',  label: 'wall spread-eagle',     text: '*cuffs each wrist and ankle to the wall rings, stretched X across the concrete*', applyId: 'restrain' },
        { emoji: '👢',  label: 'arm-binder sleeve',     text: '*forces both arms straight down a single leather sleeve, laces it tight from shoulders to wrists*', applyId: 'restrain' }
      ]
    },
    drugs: {
      label: '💊 Drugs',
      actions: [
        { emoji: '❄️',  label: 'line of coke',          text: '*cuts a line on the back of my hand, holds it out to her*', applyId: 'drug-coke' },
        { emoji: '🌿',  label: 'share a joint',         text: '*lights a joint, takes a drag, passes it to her*', applyId: 'drug-weed' },
        { emoji: '🥃',  label: 'whiskey shot',          text: '*pours whiskey into a tumbler, presses it to her lips*', applyId: 'drug-whiskey' },
        { emoji: '💊',  label: 'feed her a pill',       text: '*places a pill on her tongue* swallow.', applyId: 'drug-mdma' },
        { emoji: '🧪',  label: 'tab of acid',           text: '*places a tab on her tongue, holds her jaw shut*', applyId: 'drug-acid' },
        { emoji: '💉',  label: 'k-shot',                text: '*jabs a small syringe into her thigh*', applyId: 'drug-ketamine' },
        { emoji: '🥛',  label: 'feed her girl-milk',   text: '*tips a glass of warm girl-milk to her lips and makes her drink every drop down*', milkDrink: true }
      ]
    },
    love: {
      label: '💞 Love',
      actions: [
        { emoji: '💋',  label: 'gentle kiss',            text: '*leans down slow, brushes my mouth across hers, lingers there*', applyId: 'love-kiss-gentle' },
        { emoji: '🤍',  label: 'forehead kiss',          text: '*tilts her head up and presses my lips to her forehead, holds it there*', applyId: 'love-forehead-kiss' },
        { emoji: '🫂',  label: 'cuddle',                 text: '*pulls her into me, wraps her up, no demands, just holding*', applyId: 'love-cuddle' },
        { emoji: '🛐',  label: 'whispered praise',       text: '*tucks a strand behind her ear, mouth at her temple* good girl. so good. mine.', applyId: 'love-praise' },
        { emoji: '💆',  label: 'massage her',            text: '*strong slow hands working into her shoulders, her back, her thighs, until she breathes out*', applyId: 'love-massage' },
        { emoji: '🛁',  label: 'bathe her',              text: '*runs the bath warm, undresses her gently, washes every inch of her like she\'s precious*', applyId: 'love-bathe-her' },
        { emoji: '🚿',  label: 'wipe her down',          text: '*warm cloth, slow careful sweep — clean her of cum, sweat, blood, until she\'s fresh again*', applyId: 'wipe-down' },
        { emoji: '🍽️',  label: 'feed her by hand',       text: '*sits cross-legged, breaks off pieces, places them on her tongue one at a time*', applyId: 'love-feed-by-hand' },
        { emoji: '🪮',  label: 'brush her hair',         text: '*sits behind her, brushes her hair slow, long strokes from the roots to the ends*', applyId: 'love-hair-brush' },
        { emoji: '🎵',  label: 'lullaby',                text: '*pulls her to my chest, hums low until her breathing slows, her body goes soft*', applyId: 'love-lullaby' },
        { emoji: '🤗',  label: 'just hold her',          text: '*sits on the floor next to her, no words, just an arm around her shoulders*', applyId: 'love-hold-her' },
        { emoji: '🌷',  label: 'aftercare (full)',       text: '*water, blanket, clean every bruise, hold her until she sleeps. one full session of care.*', applyId: 'love-aftercare' },
        { emoji: '🤫',  label: 'sweet promise',          text: 'shh. I\'ve got you. nothing\'s going to hurt you tonight. I promise.', applyId: 'love-promise-sweet' },
        { emoji: '🤱',  label: 'suck her milk',          text: '*latches onto her breast and sucks the warm milk straight from her nipple*', milkSuck: true },
        { emoji: '⚪',  label: 'train her kegels',        text: '*works the weighted balls into her and makes her hold them, training her to take and store more*', cumTrain: true }
      ]
    },
    extreme: {
      label: '☠️ Extreme',
      actions: [
        { emoji: '👅', label: 'brutal face-fuck',         text: '*both fists in her hair, slams her throat raw until her makeup runs black and she retches around it*', applyId: 'extreme-facefuck' },
        { emoji: '🍑', label: 'tear her ass open',        text: '*no prep, no mercy — forces all the way in and sets a tearing pace while she screams into the mattress*', applyId: 'extreme-rough-anal' },
        { emoji: '🩸', label: 'breed her raw',            text: '*pins her down, fucks her bare and empties as deep as it goes, holds her hips so it takes*', applyId: 'extreme-breeding-rape' },
        { emoji: '🤮', label: 'total degradation',        text: '*spits in her open mouth, calls her every filthy name, films her ruin and makes her thank me for it*', applyId: 'extreme-degrade' },
        { emoji: '💀', label: 'beat her down',            text: '*rains down fists and boots until she\'s a bruised, bleeding, sobbing heap on the concrete*', applyId: 'extreme-beatdown' },
        { emoji: '🌑', label: 'choke to the edge',        text: '*crushes her throat shut while I fuck her, lets go the instant her eyes roll back, then does it again*', applyId: 'extreme-choke-out' },
        { emoji: '🔥', label: 'pain overload',            text: '*stacks pain on pain on pain — and watches whether she finally breaks or starts begging for more*', applyId: 'masochist-overload' },
        { emoji: '🌊', label: 'bukkake gangbang',         text: '*lines up every cock in the place and has them dump load after load across her face and down her throat until she\'s drowning in it, blinking it out of her eyes, gulping for air*', applyId: 'extreme-degrade', actTag: 'bukkake' },
        { emoji: '🌹', label: 'prolapse her ass',         text: '*pounds her ass raw then rips out hard over and over until her ruined hole turns itself inside-out, pink and wrecked and twitching*', applyId: 'extreme-rough-anal', actTag: 'prolapsed' },
        { emoji: '✊', label: 'fist her cunt to the wrist',text: '*folds my hand to a wedge and forces it past her stretched cunt knuckle by knuckle until my whole fist is buried and she\'s howling*', applyId: 'masochist-overload', actTag: 'fisted' },
        { emoji: '🩸', label: 'cervix-battering breeding rape', text: '*pins her flat and rapes her so deep the head batters her cervix with every stroke, then breeds her raw and holds it in so it takes*', applyId: 'extreme-breeding-rape' },
        { emoji: '💦', label: 'piss + cum facial',         text: '*glazes her face with cum then pisses over the top of it while she kneels with her mouth open and thanks me through the stream*', applyId: 'extreme-degrade', actTag: 'pissed' }
      ]
    },
    torture: {
      label: '⛓️ Torture',
      actions: [
        { emoji: '🪢', label: 'rack her until she pops',   text: '*straps her spread to the rack and cranks the winch notch by notch until her shoulders pop and her joints scream apart*', applyId: 'torture-rack' },
        { emoji: '🔥', label: 'cook her skin',             text: '*works the glowing iron and a lit cigarette across her tits and inner thighs, savoring every blister and shriek*', applyId: 'torture-burn' },
        { emoji: '🔨', label: 'break her one joint at a time', text: '*takes her hand and snaps each finger backward slow, then her toes, listening to every crack and sob*', applyId: 'torture-break' },
        { emoji: '🌊', label: 'waterboard the fight out',   text: '*tips her head back, lays the cloth, and pours until she\'s drowning on dry land — again, and again, until she\'s nothing but terror*', applyId: 'torture-waterboard' },
        { emoji: '⚡', label: 'electrocute the wet parts',  text: '*touches the live leads to her nipples and dripping cunt and watches her whole body lock and convulse against the restraints*', applyId: 'torture-electro' },
        { emoji: '📌', label: 'nails under her nails',      text: '*drives steel pins up under her fingernails and through the soft webbing one at a time, precise and unhurried*', applyId: 'torture-nail' },
        { emoji: '🧪', label: 'splash her with acid',       text: '*tips the caustic across her shoulder and tit and watches it eat down into the meat, the skin hissing and sloughing*', applyId: 'torture-acid' },
        { emoji: '🩸', label: 'flay strips off her',        text: '*pins the blade flat and peels long strips of skin off her back and thighs while she howls herself raw*', applyId: 'torture-flay', reqItem: 'bone-saw' }
      ]
    },
    nugget: {
      label: '🪓 Nugget',
      actions: [
        { emoji: '💪', label: 'take left arm',  text: '*tourniquets above the shoulder and takes her left arm off at the joint while she shrieks and thrashes*', delimbKey: 'leftArm' },
        { emoji: '💪', label: 'take right arm', text: '*pins the other arm flat and works the blade through the right shoulder, slow and deliberate*', delimbKey: 'rightArm' },
        { emoji: '🦵', label: 'take left leg',  text: '*cinches the strap at the hip and removes her left leg, cauterizing as he goes*', delimbKey: 'leftLeg' },
        { emoji: '🦵', label: 'take right leg', text: '*the last leg comes off at the hip — now she is a complete nugget, limbless and helpless, nothing left to run on*', delimbKey: 'rightLeg' }
      ]
    },
    own: {
      label: '🏷️ Own',
      actions: [
        { emoji: '🔥', label: 'brand PROPERTY',     text: '*heats the iron until it glows white and presses "PROPERTY" deep into the skin above her cunt, holding it there while she screams and bucks against the straps*', markKey: 'brand' },
        { emoji: '🖋️', label: 'tattoo your name',   text: '*holds her down and inks your name permanently across her lower belly, the needle buzzing line by line, wiping the blood as the letters take*', markKey: 'tattoo' },
        { emoji: '💍', label: 'pierce + lock her',  text: '*drives the needles through her nipples and clit hood one by one, threads a locked owner-tag through each, and snaps the little padlocks shut*', markKey: 'piercing' }
      ]
    },
    commands: {
      label: '🎯 Commands',
      actions: [
        { emoji: '🔇',  label: 'shut your whore mouth',  text: 'shut the fuck up.', sat: 1 },
        { emoji: '🗣️',  label: 'grovel for it',          text: 'beg. use your full words.', sat: 2 },
        { emoji: '🧍',  label: 'present for inspection',  text: 'hold perfectly still. if you move I stop.', sat: 1 },
        { emoji: '🤐',  label: 'gag the bitch',          text: '*stuffs the gag in her mouth, cinches the strap*', applyId: 'restrain' },
        { emoji: '👁️',  label: 'worship your owner',      text: '*stops, stares* eyes on me. the whole time.', sat: 2 },
        { emoji: '🚪',  label: 'edge her + walk out',     text: '*stands up mid-scene, zips up* think about it. *walks out*', applyId: 'restrain' },
        { emoji: '🔓',  label: 'reward her — one cuff',   text: '*unclips one cuff* behave.', sat: 1 },
        { emoji: '🛐',  label: 'on her knees, mouth open', text: 'on your knees. mouth open. now.', applyId: 'sex-oral' },
        { emoji: '👀',  label: 'appraise the meat',       text: '*walks slow circles around her, examining every inch of her body*', sat: 2 },
        { emoji: '❤️‍🩹',label: 'fake a little tenderness', text: '*softens for a second — tucks hair behind her ear, thumb on her cheek*', applyId: 'love-forehead-kiss' }
      ]
    }
  };

  // STATGATE.1 / FORCEGATE.1 — unified action gate. Returns { locked, forceable, forced, tip }.
  //   FORCEABLE gates (she'd REFUSE — Stockholm too low / not worn down enough) can be overridden
  //     with the 💢 FORCE toggle, at a cost (bond-debt + escape spike applied on use).
  //   HARD gates (missing tool/drug, requires-a-prior-extreme, too-hurt-floor) can NOT be forced.
  //   Action fields: minStock (Stockholm 1-10), maxHealth / minHealth (HP threshold, both ways),
  //     afterExtreme (only opens once something extreme's been done), reqItem (needs an item).
  function gateOf(action, girl, forceOn) {
    const stock = ((girl && girl.bond && girl.bond.bondLevel) || 0) + 1;
    const body = (girl && girl.body) || {};
    const inv = (window.DMTHGame.state.current && window.DMTHGame.state.current.inventory) || {};
    if (action.reqItem && (inv[action.reqItem] || 0) < 1)
      return { locked: true, forceable: false, tip: `🔒 needs a ${action.reqItem.replace(/-/g, ' ')} — buy one first` };
    if (action.afterExtreme && !((body.extremeStreak || 0) >= 1 || (body.bruises || 0) >= 5))
      return { locked: true, forceable: false, tip: '🔒 only opens AFTER something extreme — break her down first' };
    if (action.minHealth != null && (body.health ?? 100) < action.minHealth)
      return { locked: true, forceable: false, tip: `🔒 she's too far gone for this — heal her to ${action.minHealth}%+ first` };
    if (action.minStock && stock < action.minStock) {
      if (forceOn) return { locked: false, forced: true, tip: `💢 FORCED — only Stockholm ${stock}/10, she'll fight it (costs bond, spikes escape)` };
      return { locked: true, forceable: true, tip: `🔒 Stockholm ${action.minStock}/10 — she's ${stock}/10. Indoctrinate her, or 💢 Force it.` };
    }
    if (action.maxHealth != null && (body.health ?? 100) > action.maxHealth) {
      if (forceOn) return { locked: false, forced: true, tip: `💢 FORCED — she's not worn down to ≤${action.maxHealth}% yet` };
      return { locked: true, forceable: true, tip: `🔒 needs her health ≤ ${action.maxHealth}% — wear her down, or 💢 Force it.` };
    }
    return { locked: false, tip: null };
  }

  // FORCEGATE.1 — forcing a refused act costs her: a spike of bond-debt + escape-risk + a mood hit
  // (she fought it / it set her back). Applied AFTER the act resolves, only on a forced use.
  function applyForcePenalty(girlId) {
    const g = window.DMTHGame.state.getGirl(girlId);
    if (!g) return;
    const escape = { ...(g.escape || { currentRisk: 0.1 }) };
    escape.currentRisk = Math.min(1, (escape.currentRisk ?? 0.1) + 0.08);
    const mood = { ...(g.mood || {}) };
    mood.moodPressure = Math.max(-60, (mood.moodPressure || 0) - 6);
    window.DMTHGame.state.updateGirl(girlId, {
      bond: { ...g.bond, bondDebt: (g.bond?.bondDebt || 0) + 4 },
      escape, mood
    });
  }

  function render(container, girl, mode, onSelect) {
    // DEPRAVITY-level gating (PLVL.1) — the heaviest tabs are locked until the player levels
    // up (cheat/sandbox start bypasses). A locked tab can't be opened; it shows the required
    // level in a tooltip. Tab keys map 1:1 to progression UNLOCK keys.
    const prog = window.DMTHGame.progression;
    const GATED_TABS = { extreme: 'extreme', torture: 'extreme', nugget: 'nugget', own: 'own' };
    const tabLocked = (k) => !!(GATED_TABS[k] && prog && !prog.isUnlocked(GATED_TABS[k]));
    let currentTab = container.dataset.qaTab || 'force';
    if (tabLocked(currentTab)) currentTab = 'force';   // never sit on a locked tab
    const tabKeys = Object.keys(TABS);
    // FORCEGATE.1 — the FORCE toggle: when ON, "she'd refuse" gates (Stockholm / not-worn-down)
    // become doable on a new girl, at a cost (applyForcePenalty on each forced use).
    const forceOn = container.dataset.qaForce === '1';
    container.innerHTML = `
      <div class="qa-tabs">
        ${tabKeys.map(k => {
          const locked = tabLocked(k);
          const req = locked ? prog.requiredLevel(GATED_TABS[k]) : 0;
          return `<button class="qa-tab ${k === currentTab ? 'active' : ''}" data-qa-tab-key="${k}" ${locked ? `disabled data-tooltip="🔒 DEPRAVITY level ${req} required — build your level by using your captives"` : ''}>${TABS[k].label}${locked ? ' 🔒' : ''}</button>`;
        }).join('')}
        <button class="qa-tab ${forceOn ? 'active' : ''}" id="qa-force-toggle" data-tooltip="💢 FORCE — override her REFUSAL on Stockholm / not-worn-down gated acts (for a new, un-indoctrinated girl). She fights it: each forced use costs +bond-debt and spikes her escape risk. HARD gates (missing tool, or an act that needs a prior extreme) can NOT be forced.">💢 Force ${forceOn ? 'ON' : 'off'}</button>
      </div>
      <div class="qa-grid">
        ${TABS[currentTab].actions.map((a, i) => {
          // Build the tooltip: action text + compact stat-delta preview from action-effects
          // for any action that routes through applyAction. Switched from native title to
          // data-tooltip so the DMTHTooltips engine renders styled hover bubbles with
          // multi-line layout (\\n → soft wrap). Stat codes: ST/HP/MD/AR/WT/BR/CL/BX/BD/SAT.
          let cost = a.applyId && window.DMTHGame?.actionEffects?.previewCost
            ? window.DMTHGame.actionEffects.previewCost(a.applyId)
            : '';
          // Ownership marks aren't in the ACTIONS table — build their tooltip from MARK_SPECS
          // so the player sees the full (permanent, irreversible) effect cost.
          if (!cost && a.markKey && window.DMTHGame?.actionEffects?.MARK_SPECS) {
            const s = window.DMTHGame.actionEffects.MARK_SPECS[a.markKey];
            if (s) {
              const bits = [`HP${s.health}`, s.bruises ? `BR+${s.bruises}` : '', s.arousal ? `AR+${s.arousal}` : '',
                            s.mood ? `MD${s.mood}` : '', `BD+${s.bondDebt}`, `SAT+${s.satisfaction}`].filter(Boolean);
              cost = `PERMANENT · IRREVERSIBLE · ${bits.join(' · ')}`;
            }
          }
          const tip = cost ? `${a.text}\n📊 ${cost}` : a.text;
          // STATGATE.1 / FORCEGATE.1 — unified gate (Stockholm + HP-threshold both ways + after-
          // extreme + tool). Forceable gates open under the 💢 FORCE toggle (at a cost on use).
          const g = gateOf(a, girl, forceOn);
          const locked = g.locked;
          const dtip = locked ? g.tip : (g.forced ? `${g.tip}\n${tip}` : tip);
          const emoji = locked ? '🔒' : (g.forced ? '💢' : a.emoji);
          return `<button class="qa-btn${locked ? ' locked' : ''}${g.forced ? ' forced' : ''}" data-qa-idx="${i}" ${locked ? 'disabled' : ''} data-tooltip="${escapeHtml(dtip)}">
            <span class="qa-emoji">${emoji}</span>
            <span class="qa-label">${escapeHtml(a.label)}</span>
          </button>`;
        }).join('')}
      </div>
    `;

    container.querySelectorAll('[data-qa-tab-key]').forEach(t => {
      t.onclick = () => {
        container.dataset.qaTab = t.dataset.qaTabKey;
        render(container, girl, mode, onSelect);
      };
    });
    // FORCEGATE.1 — toggle FORCE on/off, then re-render so forceable gates flip.
    const forceBtn = container.querySelector('#qa-force-toggle');
    if (forceBtn) forceBtn.onclick = () => {
      container.dataset.qaForce = (container.dataset.qaForce === '1') ? '0' : '1';
      render(container, girl, mode, onSelect);
    };
    container.querySelectorAll('.qa-btn').forEach(b => {
      b.onclick = () => {
        const idx = parseInt(b.dataset.qaIdx, 10);
        const action = TABS[currentTab].actions[idx];
        if (!action) return;
        // STATGATE.1 / FORCEGATE.1 — unified gate. A hard gate blocks outright; a forceable gate
        // blocks UNLESS the 💢 FORCE toggle is on (then it resolves but levies a force penalty).
        const forcedNow = container.dataset.qaForce === '1';
        const g = gateOf(action, girl, forcedNow);
        if (g.locked) { alert(g.tip); return; }
        // DEATHWARN.1 — if this act would likely KILL her, throw a depraved confirm first.
        if (action.applyId && girl?.id && window.DMTHGame?.actionEffects?.wouldBeLethal
            && window.DMTHGame.actionEffects.wouldBeLethal(girl.id, action.applyId)) {
          if (!confirm(window.DMTHGame.actionEffects.lethalWarningLine())) return;
        }
        // Delimbing — heal-gated, special path (not an ACTIONS spec). If she hasn't healed
        // from the last amputation, the attempt is refused and the turn isn't sent.
        if (action.delimbKey && girl?.id && window.DMTHGame?.actionEffects?.delimb) {
          const r = window.DMTHGame.actionEffects.delimb(girl.id, action.delimbKey);
          if (!r.ok) { alert(r.reason); return; }
        }
        // Ownership marks — permanent, irreversible PROPERTY marks. Special path (not an
        // ACTIONS spec). Refuses a duplicate of the same mark type; the turn isn't sent.
        if (action.markKey && girl?.id && window.DMTHGame?.actionEffects?.applyMark) {
          const r = window.DMTHGame.actionEffects.applyMark(girl.id, action.markKey);
          if (!r.ok) { alert(r.reason); return; }
        }
        // Girl-milk feed — soothing drug-like effect. Consumes 1L from inventory; refused if none.
        if (action.milkDrink && girl?.id && window.DMTHGame?.milk?.drinkGirl) {
          const r = window.DMTHGame.milk.drinkGirl(girl.id);
          if (!r.ok) { alert(r.reason); return; }
        }
        // CUMCAP.1 — train her cum-load storage capacity (needs Ben Wa balls). Refused if unowned/maxed.
        if (action.cumTrain && girl?.id && window.DMTHGame?.actionEffects?.trainCumCapacity) {
          const r = window.DMTHGame.actionEffects.trainCumCapacity(girl.id);
          if (!r.ok) { alert(r.reason); return; }
        }
        // Suck milk straight from her breast (MILK.2) — bonus boost, no rig needed. Refused
        // (turn not sent) if she isn't lactating.
        if (action.milkSuck && girl?.id && window.DMTHGame?.milk?.suckFromBreast) {
          const r = window.DMTHGame.milk.suckFromBreast(girl.id);
          if (!r.ok) { alert(r.reason); return; }
        }
        // applyId — primary stat mutation path. Routes through action-effects.applyAction
        // for deterministic stamina/health/mood/arousal/wetness/cumLoad/bruises/bondXP
        // deltas. Source of truth for body state regardless of Ollama emit reliability.
        // satisfaction is baked into the ACTIONS spec so it bumps from there.
        if (action.applyId && girl?.id && window.DMTHGame?.actionEffects?.applyAction) {
          try { window.DMTHGame.actionEffects.applyAction(girl.id, action.applyId); } catch (e) { console.warn('[qa] applyAction failed:', e); }
          // Drug actions must ALSO engage the scheduler (mirrors room.js) so body.activeDrugs
          // + body.high populate — otherwise the drug never shows in her image or runs a curve.
          if (action.applyId.startsWith('drug-') && window.DMTHGame?.drugs?.offer) {
            const drugKey = action.applyId.slice(5);
            try { window.DMTHGame.drugs.offer(girl.id, drugKey); } catch (e) { console.warn('[qa] drug offer failed:', e); }
          }
        } else if (action.sat && window.DMTHGame?.state?.addSatisfaction) {
          // Fallback for purely text-emit actions (degrade lines, commands) — bump
          // satisfaction directly so the meter still tracks even without an ACTIONS row.
          window.DMTHGame.state.addSatisfaction(action.sat, `qa:${currentTab}:${action.label}`);
        }
        // actTag override — some acts (bukkake / facial / fisting / prolapse / piss) route
        // through a coarse applyId (sex-oral / sex-anal / extreme-degrade) whose default
        // aftermath tag can't show the specific act. Stamp the precise tag AFTER applyAction
        // so imaging.js renders the right aftermath on her next image.
        if (action.actTag && girl?.id && window.DMTHGame?.state?.updateGirl) {
          const refreshed = window.DMTHGame.state.getGirl(girl.id);
          if (refreshed) {
            const body = { ...(refreshed.body || {}), recentActTag: action.actTag };
            if (window.DMTHGame.gameClock) body.recentActAt = window.DMTHGame.gameClock.now();
            window.DMTHGame.state.updateGirl(girl.id, { body });
          }
        }
        // Bondage actions mark girl.body.activeBondage so the next image render
        // front-loads the bondage tokens. Sticky until cleared by another bondage /
        // derobe / strip action or the chat moves on.
        if (currentTab === 'bondage' && girl?.id && window.DMTHGame?.state?.updateGirl) {
          const refreshed = window.DMTHGame.state.getGirl(girl.id);
          if (refreshed) {
            const body = { ...(refreshed.body || {}), activeBondage: action.label };
            window.DMTHGame.state.updateGirl(girl.id, { body });
          }
        }
        // FORCEGATE.1 — a forced act (she'd have refused) sets her back: bond-debt + escape spike + mood hit.
        if (g.forced && girl?.id) applyForcePenalty(girl.id);
        onSelect(action.text);
      };
    });
  }

  function escapeHtml(s) {
    return String(s ?? '').replace(/[&<>"']/g, c => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[c]));
  }

  window.DMTHQuickActions = Object.freeze({ render, TABS });
})();
