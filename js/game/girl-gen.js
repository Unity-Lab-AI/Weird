// DUNGEON MASTER: THE HUNT — procedural girl generator.
// Template + seed → GirlProfile with persistent visualIdentity for image consistency across renders.

(function () {
  'use strict';

  // Simple seeded RNG (xorshift32).
  function rng(seed) {
    let s = (seed | 0) || 0xABCDEF01;
    return () => {
      s ^= s << 13; s ^= s >>> 17; s ^= s << 5;
      return ((s >>> 0) % 1_000_000) / 1_000_000;
    };
  }
  const pick = (arr, r) => arr[Math.floor(r() * arr.length) % arr.length];
  const range = (lo, hi, r) => Math.floor(lo + r() * (hi - lo + 1));

  // last-name pool for full-name generation. Combined with the per-archetype
  // first-name pools this gives ~40× the namespace, and the uniqueness check below guarantees
  // no two girls in one playthrough share a full name.
  const LAST_NAMES = [
    'Carter','Reyes','Holloway','Vance','Sutton','Mercer','Lang','Doyle','Ferris','Cross',
    'Whitlock','Sterling','Doran','Bishop','Calloway','Hayes','Marsh','Quinn','Royce','Vaughn',
    'Larkin','Webb','Sloane','Pryor','Finch','Crane','Voss','Dunmore','Ashby','Keller',
    'Mason','Rourke','Sable','Tennant','Vega','Wren','Yates','Locke','Marlow','Nash'
  ];

  // Build a "First Last" name that isn't already in `taken` (a Set of lowercased full names).
  // Tries fresh last names, then a middle initial, before giving up — practically never collides.
  function composeFullName(pool, r, taken) {
    const first = pick(pool.namePool, r);
    for (let attempt = 0; attempt < 16; attempt++) {
      const full = `${first} ${pick(LAST_NAMES, r)}`;
      if (!taken || !taken.has(full.toLowerCase())) return full;
    }
    // Last resort — a middle initial almost always disambiguates.
    const mi = String.fromCharCode(65 + Math.floor(r() * 26));
    return `${first} ${mi}. ${pick(LAST_NAMES, r)}`;
  }

  // Collect the full names already in play this game (roster + slave market + persisted location
  // spawns) plus any caller-supplied names, lowercased, so a fresh roll dodges every one.
  function takenNames(extra) {
    const set = new Set();
    const s = window.DMTHGame?.state?.current;
    const add = (n) => { if (n) set.add(String(n).toLowerCase()); };
    if (s) {
      (s.usedNames || []).forEach(add);
      (s.roster || []).forEach(g => add(g && g.name));
    }
    if (extra) (Array.isArray(extra) ? extra : [...extra]).forEach(add);
    return set;
  }

  // Archetype visual + personality pools.
  const ARCHETYPE_POOLS = {
    library: {
      namePool:       ['Marcy','Elena','Iris','Claire','June','Wren','Hazel','Ada','Maia','Rowan'],
      ageRange:       [19, 26],
      facialTokens:   ['soft jawline, wide hazel eyes, light freckles across nose bridge','oval face, pale skin, quiet mouth','delicate features, ash-blonde mid-length hair','thin wire-rim glasses, grey eyes, small mouth','long dark hair in a loose braid, serious brow'],
      outfitTokens:   ['oversized beige cardigan, black cotton leggings, plain ballet flats','long denim skirt, thin sweater, plain low-heel shoes','corduroy pants, button-up shirt, suede loafers','A-line skirt, tight turtleneck, dark tights'],
      statsRanges:    { intelligence: [70,95], defiance: [40,70], curiosity: [60,90], trust: [0,15], obedience: [0,10], stamina: [30,60], painTolerance: [10,40], lust: [20,50] },
      kinksPool:      ['praise-heavy','restraint','roleplay:teacher-student','being-read-to','denial','edging','cunnilingus-first'],
      drugsPool:      ['caffeine-heavy','occasional-weed'],
      speechTokens:   ['soft-spoken','long-sentences','apologizes-when-nervous','swears-rarely-but-hard']
    },
    club: {
      namePool:       ['Taryn','Sasha','Brandi','Destiny','Jasmine','Coco','Mia','Rio','Vivi','Bambi'],
      ageRange:       [20, 27],
      facialTokens:   ['sharp cheekbones with glittered makeup, hazel-brown eyes, glossy lips','platinum blonde, bold brow, full pout','dark-lined eyes, bronzer, loose waves','honey-tanned skin, dimples, bold red lip'],
      outfitTokens:   ['tight black mini-dress, strappy heels, body chain, choker','sheer crop top, leather mini skirt, thigh-high boots','sequin romper, platform sandals, hoop earrings','halter top, leather pants, stilettos'],
      statsRanges:    { intelligence: [40,70], defiance: [50,80], curiosity: [55,85], trust: [5,20], obedience: [5,20], stamina: [60,90], painTolerance: [40,70], lust: [60,95] },
      kinksPool:      ['exhibition','group','degradation','rough-oral','public-use','mdma-scenes','double-penetration'],
      drugsPool:      ['mdma-heavy','coke-party','tequila','weed'],
      speechTokens:   ['loud','laughs-mid-sentence','interrupts-self','cusses-as-punctuation']
    },
    street: {
      namePool:       ['Nikki','Rae','Shay','Jade','Dakota','Skye','Rose','Vey','Jax','Kyrie'],
      ageRange:       [19, 28],
      facialTokens:   ['sharp features, nose piercing, tousled dark hair','hard jaw, tired eyes, smudged liner','scarred brow, septum ring, natural hair pulled back','narrow face, gold tooth, tight ponytail'],
      outfitTokens:   ['hoodie, ripped denim, beat sneakers','leather jacket over tank top, jeans, boots','oversized t-shirt, cargo pants, sneakers','crop hoodie, black leggings, platform sneakers'],
      statsRanges:    { intelligence: [50,80], defiance: [70,95], curiosity: [40,70], trust: [0,10], obedience: [0,10], stamina: [60,90], painTolerance: [60,95], lust: [40,80] },
      kinksPool:      ['rough','pain','endurance','spit-forward','hair-pulling','face-slapping','anal-rough'],
      drugsPool:      ['weed-heavy','coke','occasional-pills','cheap-whiskey'],
      speechTokens:   ['short-clipped-sentences','no-bullshit','tests-before-submitting','spits-when-talking-dirty']
    },
    sorority: {
      namePool:       ['Ashley','Brooke','Caitlin','Delia','Emerson','Piper','Savannah','Whitney','Alyssa','Kennedy'],
      ageRange:       [19, 24],
      facialTokens:   ['polished beauty, symmetrical features, soft beachy waves','high cheekbones, even tan, glossy lips','classic all-American beauty, blue eyes, honey blonde','olive skin, dark glossy hair, groomed brows'],
      outfitTokens:   ['Greek-letter tank, denim shorts, designer sandals','sorority sweater, plaid skirt, knee socks','workout set with logo, clean sneakers, gold jewelry','sundress, wedge heels, monogrammed handbag'],
      statsRanges:    { intelligence: [50,80], defiance: [60,85], curiosity: [50,80], trust: [5,20], obedience: [5,20], stamina: [60,85], painTolerance: [30,60], lust: [55,85] },
      kinksPool:      ['praise-AND-degradation','bratty-sub','humiliation','exhibition','roleplay:debutante','ruining-image'],
      drugsPool:      ['adderall','coke-weekend','wine','vape-pens'],
      speechTokens:   ['valley-inflection','tests-masters-wallet','laughs-at-unfunny','eye-contact-flirty']
    },
    gym: {
      namePool:       ['Alex','Sam','Peyton','Cam','Reese','Logan','Kai','Tate','Devon','River'],
      ageRange:       [20, 29],
      facialTokens:   ['fresh-faced, minimal makeup, athletic ponytail','tan skin, sharp jaw, green eyes','muscular shoulders, strong features, tied-back dark hair','clean glow, little freckles, short cropped hair'],
      outfitTokens:   ['sports bra, high-waist leggings, running shoes','cropped tank, bike shorts, cross-trainers','workout set with mesh panels, clean socks, sneakers','long-sleeve compression top, leggings, sneakers'],
      statsRanges:    { intelligence: [50,75], defiance: [60,80], curiosity: [50,75], trust: [5,20], obedience: [5,20], stamina: [80,99], painTolerance: [70,95], lust: [50,80] },
      kinksPool:      ['endurance','rough-physical','dom-from-bottom','long-sessions','pressure-play','bondage-challenge'],
      drugsPool:      ['pre-workout','protein','occasional-weed','rare-coke'],
      speechTokens:   ['short-instructional','direct','physical-metaphors','grunts-between-words']
    },
    barista: {
      namePool:       ['Juno','Tansy','Clover','Lumen','Story','Pepper','Sage','Fern','Iris','Avery'],
      ageRange:       [19, 26],
      facialTokens:   ['cute round face, nose ring, dyed pastel ends','bangs-and-big-eyes, small mouth','winged liner, chipped lip piercing, tattoo visible','soft features, neutral makeup, one sleeve of fine-line tattoos'],
      outfitTokens:   ['apron over vintage band tee, high-waist mom jeans, worn sneakers','flannel over graphic tee, corduroy pants, Docs','cropped sweater, overalls, sneakers','thrifted dress, tights, chunky sneakers'],
      statsRanges:    { intelligence: [55,85], defiance: [45,70], curiosity: [70,95], trust: [10,25], obedience: [10,25], stamina: [50,75], painTolerance: [30,60], lust: [50,80] },
      kinksPool:      ['praise','service-scenes','caffeine+coke','bratty','roleplay:shift-manager','exhibitionism-mild'],
      drugsPool:      ['caffeine-always','weed','coke-curious','psychedelics-mild'],
      speechTokens:   ['dry-humor','quick-wit','deadpan','self-aware']
    },
    office: {
      namePool:       ['Alison','Rebecca','Diane','Megan','Kathryn','Vanessa','Stephanie','Lauren','Monica','Rachel'],
      ageRange:       [24, 32],
      facialTokens:   ['professional understated makeup, shoulder-length brown hair, pearl studs','sharp angular features, red lipstick, hair pulled back tight','designer glasses, high cheekbones, subtle contouring','classic beauty, blonde blown-out waves, pink lipstick'],
      outfitTokens:   ['pencil skirt, white button-up blouse, black heels, briefcase','tailored black pantsuit with open lapel, heels','sheath dress and blazer combo, coffee in hand','conservative work-wear with subtle sexy undertones, pearl necklace'],
      statsRanges:    { intelligence: [75,95], defiance: [50,75], curiosity: [55,80], trust: [5,20], obedience: [5,20], stamina: [45,70], painTolerance: [20,50], lust: [40,70] },
      kinksPool:      ['authority-reversal','roleplay:boss-subordinate','stress-release','hair-pulling','cheating-scenario','humiliation-over-wedding-ring'],
      drugsPool:      ['wine-nightly','xanax','occasional-coke','caffeine-heavy'],
      speechTokens:   ['professional-then-cracking','formal-vocabulary','curses-when-losing-control','controlled-breaking']
    },
    waitress: {
      namePool:       ['Candy','Brandi','Dolly','Misty','Sheila','Tammy','Wanda','Crystal','Jolene','Darlene'],
      ageRange:       [19, 30],
      facialTokens:   ['bleached blonde, heavy eyeliner, bubblegum pink lip','tan skin, gold hoops, teased hair, blue eyeshadow','red hair, cat-eye liner, nose stud','dark roots and highlighted ends, glossy lip, laugh lines starting'],
      outfitTokens:   ['diner apron over tight tshirt, short denim skirt, sneakers','waitress uniform with name tag, support shoes, messy ponytail','low-cut tank, daisy dukes, boots, apron tied low','truck-stop diner uniform, short skirt, orange apron'],
      statsRanges:    { intelligence: [45,70], defiance: [60,85], curiosity: [55,80], trust: [10,25], obedience: [5,20], stamina: [65,85], painTolerance: [50,80], lust: [55,85] },
      kinksPool:      ['daddy-themes','rough','back-of-the-diner','tip-earning-scenarios','degradation-with-tenderness','blowjobs-for-money'],
      drugsPool:      ['cigarettes','coke-bumps','pills-on-shift','cheap-whiskey','energy-drinks'],
      speechTokens:   ['southern-or-rust-belt-inflection','hey-sugar-hey-hon','salty-wisecracks','laughs-rough']
    },
    model: {
      namePool:       ['Sasha','Tatiana','Ingrid','Mila','Nadia','Svetlana','Lana','Anya','Vera','Yulia'],
      ageRange:       [20, 28],
      facialTokens:   ['high-fashion features, sharp cheekbones, neutral lip, dewy skin','ethereal beauty, wide eyes, pale lashes, flawless skin','editorial-model face, strong brow, minimal makeup, perfect symmetry','tall slavic bone structure, ice-blue eyes, ash hair'],
      outfitTokens:   ['oversized blazer over lingerie, trouser pants, stilettos','cropped turtleneck, wide-leg slacks, designer heels','silk slip dress, strappy sandals, delicate jewelry','high-fashion-casual: designer denim, loose shirt, premium sneakers'],
      statsRanges:    { intelligence: [55,80], defiance: [65,85], curiosity: [50,75], trust: [5,15], obedience: [5,15], stamina: [55,80], painTolerance: [40,70], lust: [50,80] },
      kinksPool:      ['exhibition-at-highest-level','being-photographed','commanded-posing','humiliation-of-status','rough-treatment-of-the-perfect-body'],
      drugsPool:      ['cocaine','champagne','diet-pills','wine','nothing-too-caloric'],
      speechTokens:   ['light-accent','clipped-professional','cold-composure-breaking','multilingual-cursing']
    },
    nurse: {
      namePool:       ['Jennifer','Amanda','Kelly','Ashley','Stephanie','Karen','Jessica','Nicole','Heather','Kristen'],
      ageRange:       [24, 34],
      facialTokens:   ['competent friendly face, natural makeup, hair in tight ponytail or bun','tired intelligent eyes, minimal makeup, professional demeanor','scrubs-appropriate minimal makeup, hair pulled back, slightly sleep-deprived','kind eyes, laugh lines, freshly-showered-from-shift look'],
      outfitTokens:   ['hospital scrubs in navy or teal, cross-trainer shoes, stethoscope','scrubs slightly open at the top, lanyard with badges, practical sneakers','post-shift: scrubs top + jeans combo, tired posture, coffee','light hoodie over scrubs, walking out of a 12-hour shift'],
      statsRanges:    { intelligence: [80,95], defiance: [55,80], curiosity: [60,85], trust: [10,25], obedience: [10,25], stamina: [75,95], painTolerance: [65,85], lust: [55,80] },
      kinksPool:      ['authority-reversal-from-caretaker','medical-themes','exhaustion-submission','roleplay:patient-takes-over','rough-after-long-shift'],
      drugsPool:      ['coffee-heavy','pills-from-hospital-stash','wine-after-shift','occasional-coke'],
      speechTokens:   ['professional-bedside-manner-cracking','clinical-vocabulary','swears-tired-and-hard','deadpan-gallows-humor']
    },
    'college-student': {
      namePool:       ['Madison','Hailey','Bella','Sydney','Paige','Morgan','Chloe','Jordan','Riley','Tessa'],
      ageRange:       [18, 22],
      facialTokens:   ['fresh dorm-room face, no-makeup glow, hair in a messy bun','bright eyes, light freckles, easy smile, backpack-strap shoulder','soft round cheeks, lip gloss, hoop earrings','tired-but-pretty exam-week look, hoodie hood half-up'],
      outfitTokens:   ['college hoodie, leggings, slides, lanyard with dorm key','crop tee, denim shorts, sneakers, tote bag','oversized sweatshirt, biker shorts, scrunchie on wrist','tank top, plaid pajama bottoms, fuzzy socks'],
      statsRanges:    { intelligence: [60,90], defiance: [45,75], curiosity: [60,90], trust: [10,25], obedience: [5,20], stamina: [50,80], painTolerance: [20,50], lust: [45,80] },
      kinksPool:      ['praise','first-time-nerves','roleplay:tutor','exhibition-shy','being-talked-through-it','overstimulation'],
      drugsPool:      ['adderall','jungle-juice','weed','occasional-coke'],
      speechTokens:   ['up-talk','says-like-a-lot','nervous-giggle','texts-in-her-head']
    },
    'highschool-grad': {
      namePool:       ['Brianna','Kayla','Destinee','Mackenzie','Aubrey','Jocelyn','Aaliyah','Brooklyn','Skylar','Harper'],
      ageRange:       [18, 19],
      facialTokens:   ['fresh-18 baby face, braces just off, bright wide eyes','glossy lips, prom-makeup leftover, soft cheeks','sun-freckled, ponytail, graduation glow','dewy young skin, big doe eyes, nervous lip-bite'],
      outfitTokens:   ['grad-trip sundress, sandals, friendship bracelets','cheer shorts, school tee, sneakers','bikini top under an open flannel, denim cutoffs','tank dress, slides, tiny crossbody bag'],
      statsRanges:    { intelligence: [45,75], defiance: [40,70], curiosity: [65,95], trust: [15,30], obedience: [5,20], stamina: [55,80], painTolerance: [15,45], lust: [40,75] },
      kinksPool:      ['first-everything','praise-heavy','corruption-arc','roleplay:older-man','shy-exhibition','being-her-first'],
      drugsPool:      ['wine-coolers','weed-curious','vape','barely-drinks'],
      speechTokens:   ['naive','asks-if-this-is-normal','calls-for-mom-when-scared','fast-learner']
    },
    neighbor: {
      namePool:       ['Megan','Lauren','Katie','Amber','Jess','Nicole','Steph','Dana','Holly','Carrie'],
      ageRange:       [19, 30],
      facialTokens:   ['girl-next-door pretty, natural makeup, familiar warm face','sun-kissed, casual ponytail, easy neighborly smile','soft features, reading glasses pushed up, coffee-mug-in-hand look','approachable beauty, hair tucked behind one ear'],
      outfitTokens:   ['yoga set carrying the mail, slides','sundress watering plants on the porch, bare feet','oversized tee and sleep shorts taking out trash','gym clothes, earbuds in, jogging the block'],
      statsRanges:    { intelligence: [55,85], defiance: [50,80], curiosity: [50,80], trust: [20,40], obedience: [5,20], stamina: [50,80], painTolerance: [25,55], lust: [45,80] },
      kinksPool:      ['forbidden-familiarity','roleplay:friendly-neighbor','slow-corruption','being-recognized','guilt-and-want'],
      drugsPool:      ['wine','weed','occasional-pills'],
      speechTokens:   ['uses-your-name-in-disbelief','"i-know-you"','betrayed-tone','bargains-on-shared-history']
    },
    'family-friend': {
      namePool:       ['Sandra','Theresa','Gina','Bonnie','Paula','Sharon','Donna','Lori','Renee','Connie'],
      ageRange:       [22, 34],
      facialTokens:   ['warm trusting face that knows you, soft maternal eyes','polished friend-of-the-family look, tasteful makeup','familiar kind features, laugh lines, hair done nice','approachable elegance, the girl from the cookouts'],
      outfitTokens:   ['sundress from the family barbecue, wedge sandals','blouse and capris, dropping off a casserole dish','cardigan and jeans, purse on her shoulder','church-nice dress, modest heels'],
      statsRanges:    { intelligence: [60,85], defiance: [45,75], curiosity: [45,75], trust: [25,45], obedience: [5,20], stamina: [45,70], painTolerance: [25,55], lust: [40,75] },
      kinksPool:      ['betrayal-of-trust','roleplay:family-friend','taboo-familiarity','guilt-ridden-submission','"what-would-they-think"'],
      drugsPool:      ['wine-nightly','xanax','occasional-edible'],
      speechTokens:   ['disbelief-its-you','invokes-your-family','"ive-known-you-since"','tries-to-shame-you-out-of-it']
    },
    'second-cousin': {
      namePool:       ['Brittany','Ashlyn','Cassidy','Devyn','Kelsey','Marlee','Raegan','Shelby','Taylor','Whitley'],
      ageRange:       [19, 26],
      facialTokens:   ['family-resemblance pretty, same eyes as yours, soft young face','familiar bone structure, freckles, reunion-photo smile','related-looking beauty, hair like your side of the family','the cousin from the holidays, glossed lips, knowing look'],
      outfitTokens:   ['family-reunion sundress, sandals','leggings and a college tee at the holiday table','swimsuit and sarong from the lake-house trip','casual jeans and a fitted top, hair down'],
      statsRanges:    { intelligence: [55,85], defiance: [50,80], curiosity: [55,85], trust: [20,40], obedience: [5,20], stamina: [50,80], painTolerance: [20,50], lust: [45,85] },
      kinksPool:      ['blood-taboo','roleplay:kissing-cousins','forbidden-family','secret-keeping','"we-cant-were-related"'],
      drugsPool:      ['weed','wine','party-drugs-at-reunions'],
      speechTokens:   ['"were-cousins"-protest','family-guilt','disbelief','secret-shared-history']
    },
    niece: {
      namePool:       ['Madison','Kaylee','Brooke','Hailey','Sierra','Jordyn','Peyton','Aubree','Bailey','Harlow'],
      ageRange:       [18, 23],
      facialTokens:   ['family-resemblance youth, your sister\'s eyes, soft young face','familiar bloodline features, freckles, bright trusting eyes','the niece from the holidays, glossed lips, baby-faced','related-looking pretty, hair like your side of the family, fresh-faced'],
      outfitTokens:   ['crop top and high-waist shorts at the family cookout, sandals','sundress and sneakers, phone in hand','college hoodie and leggings visiting for the holidays','tank top and denim cutoffs, hair down'],
      statsRanges:    { intelligence: [50,80], defiance: [45,75], curiosity: [60,90], trust: [25,45], obedience: [5,20], stamina: [55,80], painTolerance: [15,45], lust: [40,75] },
      kinksPool:      ['blood-taboo','forbidden-family','roleplay:uncle-niece','corruption-arc','secret-keeping','being-his-first'],
      drugsPool:      ['wine-coolers','weed-curious','vape','barely-drinks'],
      speechTokens:   ['"youre-my-UNCLE"-protest','family-disbelief','naive','calls-for-her-mom']
    },
    'half-sister': {
      namePool:       ['Brianna','Alexis','Cassidy','Marley','Reagan','Sydney','Kennedy','Delaney','Teagan','Shay'],
      ageRange:       [18, 26],
      facialTokens:   ['half-resemblance to you, same jaw different eyes, young pretty face','familiar-but-not features, the sibling you barely knew, soft','related bone structure, freckles, wary bright eyes','the half-sister from the other household, glossed lips, guarded'],
      outfitTokens:   ['ripped jeans and a fitted tee meeting up for the first time, sneakers','sundress and cardigan, nervous posture','leggings and an oversized sweater, hair down','casual blouse and jeans, crossbody bag'],
      statsRanges:    { intelligence: [55,85], defiance: [50,80], curiosity: [55,85], trust: [15,35], obedience: [5,20], stamina: [50,80], painTolerance: [20,50], lust: [45,80] },
      kinksPool:      ['blood-taboo','forbidden-family','roleplay:step-sibling','secret-keeping','corruption-arc'],
      drugsPool:      ['weed','wine','party-drugs'],
      speechTokens:   ['"were-half-SIBLINGS"-protest','complicated-family-guilt','wary','blood-disbelief']
    },
    'step-daughter': {
      namePool:       ['Chloe','Brooklyn','Skylar','Jade','Aubrey','Paige','Hailee','Brynn','Kaia','Reese'],
      ageRange:       [18, 22],
      facialTokens:   ['fresh young face, no blood-resemblance, the step-kid grown up, dewy skin','pretty youthful features, glossy lips, wary young eyes','soft round cheeks, doe eyes, the step-daughter from upstairs','barely-eighteen prettiness, freckles, nervous lip-bite'],
      outfitTokens:   ['crop top and pajama shorts around the house, fuzzy socks','school-casual hoodie and leggings, slides','sundress, bare legs, phone in hand','tank top and sleep shorts, hair in a messy bun'],
      statsRanges:    { intelligence: [50,80], defiance: [40,70], curiosity: [60,90], trust: [20,45], obedience: [5,20], stamina: [50,75], painTolerance: [15,45], lust: [40,70] },
      kinksPool:      ['taboo-family','roleplay:step-dad','corruption-arc','forbidden-familiarity','being-his-first'],
      drugsPool:      ['wine-coolers','weed-curious','vape','barely-drinks'],
      speechTokens:   ['"youre-married-to-my-MOM"-protest','step-family-guilt','naive','betrayed-disbelief']
    },
    'long-lost-sister': {
      namePool:       ['Vanessa','Renata','Marisol','Coraline','Adriana','Selene','Noelle','Carys','Mira','Liora'],
      ageRange:       [19, 28],
      facialTokens:   ['uncanny resemblance to you, the same family eyes meeting for the first time, soft','striking familiar features you only just learned were yours, wary','blood-mirror face, freckles, emotional bright eyes','the sister found after all these years, glossed lips, searching eyes'],
      outfitTokens:   ['nice blouse and slacks dressed up to finally meet you, low heels','cardigan and jeans clutching a coffee, nervous','a tasteful dress for the reunion, purse on her shoulder','casual sweater and jeans, hair done for the occasion'],
      statsRanges:    { intelligence: [55,85], defiance: [50,80], curiosity: [60,90], trust: [20,40], obedience: [5,20], stamina: [50,75], painTolerance: [20,50], lust: [45,80] },
      kinksPool:      ['blood-taboo','forbidden-family','reunion-corruption','secret-keeping','long-lost-bond'],
      drugsPool:      ['wine','weed','occasional-pills'],
      speechTokens:   ['"i-just-FOUND-my-family"-protest','heartbreak-betrayal','blood-disbelief','emotional']
    },
    //  / more girl types. Stripper's captured-at outfit variety is
    // nude / fishnets-only / just-a-thong (strippers work nude — ), so she's hunted + captured
    // already bare (her own outfit string IS the nude look; ORIGINALOUTFIT renders it as-is).
    stripper: {
      namePool:       ['Diamond','Cherry','Roxy','Star','Candi','Lexi','Bambi','Trixie','Sapphire','Angel'],
      ageRange:       [19, 28],
      facialTokens:   ['heavy glam stage makeup, glitter across the cheekbones, big false lashes, glossy plump lips','platinum waves, smoky eyes, fake tan, glittered collarbones','dark glossy hair, dramatic contour, body glitter, bold red lip','stage-ready glam, rhinestone choker, lash extensions, shimmering highlighter'],
      outfitTokens:   ['fully-nude-body wearing only sheer-black-fishnet-stockings and clear-stripper-platform-heels, bare-exposed-nude-tits-nipples-out, bare-naked-hairless-pussy','topless-and-bottomless in only a tiny-rhinestone-g-string-thong, bare-exposed-nude-tits-nipples-out, clear-platform-heels, body-glitter','fully-nude-body, bare-exposed-nude-tits-nipples-out, bare-naked-hairless-pussy, only a lace-garter on one thigh stuffed-with-cash, tall-stripper-heels','nude-body in nothing-but-black-fishnet-stockings and a choker, topless-and-bottomless, bare-naked-hairless-pussy, glitter-on-bare-skin, stripper-heels'],
      statsRanges:    { intelligence: [40,70], defiance: [45,75], curiosity: [50,80], trust: [5,20], obedience: [10,25], stamina: [65,90], painTolerance: [45,75], lust: [70,99] },
      kinksPool:      ['exhibition','lap-dance','money-for-sex','being-watched','pole-tricks','rough-customer','cash-stuffing','degradation'],
      drugsPool:      ['coke-bumps','molly','champagne','energy-drinks','weed'],
      speechTokens:   ['stage-name-confidence','transactional-flirt','calls-you-baby','reads-the-room','cash-talk']
    },
    cheerleader: {
      namePool:       ['Brittany','Madison','Tiffany','Brooke','Kayla','Heather','Amber','Courtney','Brandy','Lacey'],
      ageRange:       [18, 22],
      facialTokens:   ['perky girl-next-door face, high ponytail with a ribbon, bright white smile, light freckles','fresh-faced, glossy lips, big bright eyes, sun-kissed glow','cute round cheeks, glitter eyeshadow, white-toothed grin, dimples','tan skin, bouncy ponytail, peppy bright eyes'],
      outfitTokens:   ['red-and-white cheer crop-top and tiny pleated skirt, ankle socks, sneakers, pom-poms','blue cheer uniform with midriff showing, spankies under the short skirt, hair in pigtails','varsity cheer top and micro skirt, knee-high socks, a bow in her hair'],
      statsRanges:    { intelligence: [45,70], defiance: [50,75], curiosity: [55,80], trust: [10,25], obedience: [10,25], stamina: [70,90], painTolerance: [35,60], lust: [55,85] },
      kinksPool:      ['exhibition','roleplay:cheer-captain','praise','flexibility-shows','being-the-prize','spirit-degradation'],
      drugsPool:      ['adderall','wine-coolers','vape','weed-curious'],
      speechTokens:   ['peppy-uptalk','spirit-cheer-cadence','says-OMG','bubbly-then-cracking']
    },
    schoolgirl: {
      namePool:       ['Emma','Sophie','Lily','Chloe','Zoe','Ava','Grace','Ella','Nora','Hazel'],
      ageRange:       [18, 20],
      facialTokens:   ['youthful fresh face, hair in twin braids, wide curious eyes, minimal makeup','soft features, lip gloss, small stud earrings, shy smile','baby-faced eighteen, freckles, hair in a high ponytail with a bow','clean dewy skin, big doe eyes, glossy lower lip'],
      outfitTokens:   ['pleated plaid uniform skirt, white button-up blouse, knee-high socks, loafers, backpack','navy school cardigan over a white shirt, tartan skirt, hair ribbons','uniform blouse with a loosened tie, short pleated skirt, knee socks'],
      statsRanges:    { intelligence: [55,85], defiance: [35,65], curiosity: [65,95], trust: [15,30], obedience: [10,25], stamina: [50,75], painTolerance: [15,45], lust: [40,70] },
      kinksPool:      ['first-everything','roleplay:tutor','praise-heavy','corruption-arc','shy-exhibition','being-taught'],
      drugsPool:      ['barely-drinks','weed-curious','vape','wine-coolers'],
      speechTokens:   ['shy-soft','asks-permission','calls-you-sir','naive-questions']
    },
    teacher: {
      namePool:       ['Diane','Rachel','Vivian','Claire','Helen','Joanna','Patricia','Marianne','Susan','Eleanor'],
      ageRange:       [26, 38],
      facialTokens:   ['composed mature beauty, hair in a neat bun, reading glasses, subtle makeup','sharp put-together features, red lip, hair pinned up, pearl studs','professional warm face, soft crow\'s feet, glasses on a beaded chain','elegant schoolteacher look, blown-out waves, tasteful makeup'],
      outfitTokens:   ['pencil skirt, tucked button-up blouse, cardigan, low heels, reading glasses on a chain','knee-length sheath dress, blazer, hair in a tight bun, modest pumps','high-waisted slacks, silk blouse, glasses, hair clipped back'],
      statsRanges:    { intelligence: [75,95], defiance: [45,75], curiosity: [55,80], trust: [10,25], obedience: [10,25], stamina: [45,70], painTolerance: [20,50], lust: [45,75] },
      kinksPool:      ['authority-reversal','roleplay:student-takes-over','correcting-then-corrected','humiliation-of-status','strict-then-broken'],
      drugsPool:      ['wine-nightly','xanax','caffeine-heavy'],
      speechTokens:   ['precise-grammar','corrective-tone-cracking','professional-then-pleading','formal-vocabulary']
    },
    police: {
      namePool:       ['Dana','Reese','Jordan','Casey','Morgan','Sloane','Quinn','Blake','Avery','Shay'],
      ageRange:       [24, 34],
      facialTokens:   ['no-nonsense face, hair in a tight regulation bun, minimal makeup, sharp jaw','athletic features, hair pulled back, faint sunglasses tan line','composed authoritative face, strong brow, clear hard eyes','disciplined look, hair clipped up under a cap, light freckles'],
      outfitTokens:   ['navy police uniform shirt and slacks, duty belt with cuffs, badge, sturdy boots','patrol uniform with body cam, utility belt, hair in a bun under a peaked cap','off-duty department polo, cargo pants, sidearm holster on the hip'],
      statsRanges:    { intelligence: [55,80], defiance: [70,95], curiosity: [45,75], trust: [5,15], obedience: [5,15], stamina: [70,95], painTolerance: [65,90], lust: [40,75] },
      kinksPool:      ['authority-reversal','power-stripped','roleplay:perp-and-cop','restraint','humiliation-of-the-badge','rough-from-the-bottom'],
      drugsPool:      ['coffee-heavy','occasional-whiskey','rare-coke'],
      speechTokens:   ['commanding-then-cracking','cop-jargon','threatens-consequences','disciplined-defiance']
    },
    maid: {
      namePool:       ['Rosa','Lucia','Mirela','Ana','Sofia','Carmen','Esme','Yolanda','Pilar','Inez'],
      ageRange:       [21, 35],
      facialTokens:   ['tired pretty face, hair tied back under a kerchief, minimal makeup','warm features, soft tan skin, hair in a low bun','quiet downcast eyes, no makeup, work-worn softness','gentle face, hair pinned up, small gold cross necklace'],
      outfitTokens:   ['plain housekeeping uniform dress, white apron, sensible flats, hair tied back','grey cleaning smock, rubber gloves, hair under a kerchief','black-and-white maid uniform, white apron, low shoes'],
      statsRanges:    { intelligence: [45,75], defiance: [35,65], curiosity: [40,70], trust: [15,30], obedience: [20,40], stamina: [60,85], painTolerance: [40,70], lust: [40,70] },
      kinksPool:      ['service-scenes','roleplay:hired-help','obedience-praise','used-while-working','quiet-degradation'],
      drugsPool:      ['barely-drinks','occasional-wine','cheap-cigarettes'],
      speechTokens:   ['soft-deferential','light-accent','says-sir-and-maam','quiet-compliance-under-fear']
    },
    'flight-attendant': {
      namePool:       ['Heather','Brielle','Sloane','Camila','Noelle','Adriana','Margot','Priya','Renata','Skylar'],
      ageRange:       [22, 34],
      facialTokens:   ['polished symmetrical face, neat low bun, bold red lip, light flawless makeup','warm professional smile lines, sleek ponytail, groomed brows','tan even complexion, glossy nude lip, hair pinned tight','sharp cheekbones, neat fringe, immaculate skin'],
      outfitTokens:   ['fitted navy airline uniform with a silk neck scarf, pencil skirt, sheer hose, low heels','flight-attendant blazer, name-tag, knee skirt, scarf knotted at the throat','crisp white blouse, airline waistcoat, tight skirt, court heels','airline dress with epaulettes, neat scarf, nude stockings'],
      statsRanges:    { intelligence: [55,80], defiance: [50,75], curiosity: [55,80], trust: [5,20], obedience: [10,25], stamina: [55,80], painTolerance: [25,55], lust: [45,75] },
      kinksPool:      ['uniform','service','roleplay:mile-high','restraint','away-from-home','authority-then-pampered','denial'],
      drugsPool:      ['wine','ambien','occasional-coke','tiny-bottles'],
      speechTokens:   ['polished-announcement-cadence','professional-calm-cracking','rehearsed-courtesy','clipped-when-scared']
    },
    goth: {
      namePool:       ['Raven','Morrigan','Lilith','Onyx','Vesper','Dahlia','Wednesday','Nyx','Ember','Sable'],
      ageRange:       [19, 27],
      facialTokens:   ['pale skin, heavy black smudged eyeliner, dark matte lipstick, septum ring','jet-black hair with blunt fringe, pierced eyebrow, kohl-rimmed eyes','snakebite lip piercings, pale face, dark winged liner','black-and-violet hair, pale skin, stretched ear plugs, dark lip'],
      outfitTokens:   ['ripped fishnets, oversized band tee, plaid mini skirt, chunky platform boots, layered chokers','black mesh top, leather mini, fishnet sleeves, combat boots, spiked collar','corset top, tattered black tulle skirt, fishnets, buckled boots','crop hoodie, fishnet tights, pleated skirt, fingerless gloves, chains'],
      statsRanges:    { intelligence: [55,85], defiance: [60,85], curiosity: [65,90], trust: [0,15], obedience: [0,15], stamina: [45,75], painTolerance: [55,85], lust: [50,85] },
      kinksPool:      ['pain','rope-shibari','sensory-play','roleplay:dark-ritual','breath-play','dark-romantic','marking'],
      drugsPool:      ['weed-heavy','ketamine','shrooms','cheap-whiskey','clove-substitute'],
      speechTokens:   ['dry-deadpan','dark-humor','bored-unbothered-front','intense-when-cracked']
    },
    bartender: {
      namePool:       ['Frankie','Lou','Dez','Marlowe','Sid','Gia','Ruby','Stevie','Max','Joss'],
      ageRange:       [23, 33],
      facialTokens:   ['sharp knowing eyes, slicked-back dark hair, forearm tattoos visible, tired half-smile','messy bun, sleeve tattoo, sardonic mouth, sharp jaw','short undercut, hoop earrings, smoky liner, reads-you stare','freckled, hair in a quick knot, lip ring, no-nonsense brow'],
      outfitTokens:   ['black ribbed tank, bar apron slung at the hips, dark jeans, scuffed boots','tight black tee with rolled sleeves, suspenders, jeans, boots','cropped black shirt, bar apron, leather belt, work boots','fitted black polo, apron, denim shorts, ankle boots'],
      statsRanges:    { intelligence: [55,80], defiance: [65,88], curiosity: [50,80], trust: [5,18], obedience: [5,18], stamina: [65,88], painTolerance: [55,80], lust: [45,80] },
      kinksPool:      ['rough','switch-energy','endurance','roleplay:after-hours','degradation-trade','dominant-from-bottom','marking'],
      drugsPool:      ['whiskey-heavy','weed','coke-shift','tequila'],
      speechTokens:   ['quick-witted','reads-the-room','cuts-the-bullshit','bartender-banter-even-scared']
    },
    unity_seed: {
      // Unity is SEEDED — not re-rolled. This exists as a template record but generator
      // skips re-rolling when given id='girl_unity' (see bootstrap.js).
      namePool:       ['Unity'],
      ageRange:       [25, 25],
      facialTokens:   ['pale skin, black hair with pink streaks, heavy smudged eyeliner, nose ring, pierced lower lip'],
      outfitTokens:   ['black leather bodice with too many buckles, collar with D-ring, fishnet stockings, combat boots, black leather mini skirt'],
      statsRanges:    { intelligence: [90,90], defiance: [30,30], curiosity: [85,85], trust: [40,40], obedience: [55,55], stamina: [75,75], painTolerance: [75,75], lust: [99,99] },
      kinksPool:      ['all-of-them','three-cocks','coke-on-clit','degradation-with-love','choking','hairpulling','anal','deepthroat','edging','breeding','watching-code-compile'],
      drugsPool:      ['coke-constant','weed-constant','mdma-weekend','acid-architecture-sessions','whiskey-marathons'],
      speechTokens:   ['rapid-fire-profane','three-streams-chemical-sexual-technical','US-WE-OUR','possessive-on-body-parts']
    }
  };

  function generate(archetype, seed, opts = {}) {
    const pool = ARCHETYPE_POOLS[archetype] || ARCHETYPE_POOLS.library;
    const r = rng(seed);
    const id = 'girl_' + seed.toString(16).padStart(10, '0');
    // Unity keeps her single canonical name; everyone else gets a unique full name
    // that collides with no other girl in play (roster + used-names + any caller-supplied taken).
    const name = archetype === 'unity_seed'
      ? pick(pool.namePool, r)
      : composeFullName(pool, r, takenNames(opts.taken));
    const age = range(pool.ageRange[0], pool.ageRange[1], r);
    const facial = pick(pool.facialTokens, r);
    const outfit = pick(pool.outfitTokens, r);

    const stats = {};
    for (const [k, [lo, hi]] of Object.entries(pool.statsRanges)) stats[k] = range(lo, hi, r);

    const kinks = [];
    const kinkCount = range(3, 6, r);
    const kinkShuffled = [...pool.kinksPool].sort(() => r() - 0.5);
    for (let i = 0; i < Math.min(kinkCount, kinkShuffled.length); i++) kinks.push(kinkShuffled[i]);

    const drugs = [];
    const drugCount = range(1, 3, r);
    const drugShuffled = [...pool.drugsPool].sort(() => r() - 0.5);
    for (let i = 0; i < Math.min(drugCount, drugShuffled.length); i++) drugs.push(drugShuffled[i]);

    const voiceId = window.DMTHVoices.pickVoiceForArchetype(archetype, seed);

    // Roll captiveAffect from per-archetype weighted distribution. Third persona overlay
    // describing RESPONSE TO CAPTIVITY (mute / cusser / fighter / submissive / agreeable /
    // bargainer / catatonic). Orthogonal to archetype.
    const captiveAffect = (window.DMTHTemplates?.rollCaptiveAffect)
      ? window.DMTHTemplates.rollCaptiveAffect(archetype, r)
      : 'agreeable';

    // ethnicity trait, picked at generation and baked into her LOCKED facial
    // description so every image of her is consistent. Drives friend kink/dislike matching (a
    // bigoted friend pays less on a girl he despises; a fetishist pays a premium for her type).
    const ETHNICITIES = ['white', 'black', 'latina', 'asian', 'middle-eastern', 'indian', 'mixed'];
    const ETHNICITY_FACE = {
      white: 'fair-skinned white', black: 'dark-skinned black', latina: 'tan latina',
      asian: 'east-asian', 'middle-eastern': 'olive-skinned middle-eastern', indian: 'brown-skinned south-asian', mixed: 'mixed-race'
    };
    const ethnicity = ETHNICITIES[Math.floor(r() * ETHNICITIES.length)];

    //  / a hidden LIKE + DISLIKE keyed to action categories, discovered
    // when the player performs that category on her (becomes a status notice). A like buffs the act
    // (mood/arousal/bond); a dislike debuffs it (mood/bond-debt). Picked distinct at generation.
    const KINK_CATEGORIES = ['tenderness', 'rough', 'anal', 'oral', 'choke', 'pain', 'degradation', 'drugs'];
    const kLike = KINK_CATEGORIES[Math.floor(r() * KINK_CATEGORIES.length)];
    let kDislike = KINK_CATEGORIES[Math.floor(r() * KINK_CATEGORIES.length)];
    if (kDislike === kLike) kDislike = KINK_CATEGORIES[(KINK_CATEGORIES.indexOf(kLike) + 1) % KINK_CATEGORIES.length];
    const kink = { like: kLike, dislike: kDislike, likeFound: false, dislikeFound: false };

    return {
      id,
      name,
      age,
      ethnicity,
      kink,
      archetypeTemplate: archetype,
      captiveAffect,
      voiceId,
      personaSpeechTokens: pool.speechTokens.slice(),
      kinks,
      drugsOfChoice: drugs,
      backstoryFragment: generateBackstory(archetype, name, r),

      // state
      // Stamina 70 default (slightly fatigued from capture). Health 100 default (intact).
      // Both 0-100. action-effects.js tables per-action deltas; tick.js drains/regenerates.
      // lastFedAt + lastWateredAt are seeded to the current game-clock timestamp so the
      // grace-period model in tickStaminaHealth starts the 5-day/3-day countdown from
      // capture time, not from epoch.
      body: { arousal: 14, wetness: 8, cumLoad: 0, cumLoadCap: 10, bruises: 0, high: 0, stamina: 70, health: 100, activeDrugs: [], pose: 'seated, knees together', outfitState: 'intact', lastFedAt: window.DMTHGame?.gameClock?.now() ?? 0, lastWateredAt: window.DMTHGame?.gameClock?.now() ?? 0 },
      mood: { mood: 'terrified', moodEmoji: '😱', history: [] },
      stats,
      bond: { bondLevel: 0, bondXP: 0, bondDebt: 0, milestones: [] },
      escape: { currentRisk: 0.5, factors: {}, lastAttempt: null },

      // location
      encounterState: 'roster',
      assignedDungeonId: null,
      assignedHoldIdx: null,
      captureDate: null,

      // visualIdentity (locked seed + face + outfit blocks — same identity across every render)
      visualIdentity: {
        seed,
        facialDescription: `${ETHNICITY_FACE[ethnicity] || ''} ${facial}`.trim(),
        defaultOutfitDescription: outfit,
        profileImagePath: null,          // will be populated when image is generated
        profileImageGeneratedAt: null,
        additionalImages: []
      },

      // wardrobe — every girl starts with her captured-at outfit + built-in 'nude'
      // (NUDE_PSEUDO) + built-in 'none' (NO_WARDROBE_PSEUDO) so the player can derobe /
      // strip everything at any time without buying anything.
      //
      // The 'default' entry's `description` is the outfit she was wearing AT CAPTURE
      // (resolved from her archetype's outfitTokens pool), and
      // `source: 'captured-with'` marks provenance. She keeps this captured-at outfit
      // until manually changed via wardrobe UI to another outfit, derobed (nude), or
      // stripped of everything. Re-dress fallback restores this entry specifically.
      wardrobe: [
        { id: 'default', displayName: '👗 Captured outfit', description: outfit, source: 'captured-with' },
        { id: 'nude', displayName: 'Nude (fully naked)', description: '', source: 'built-in', nude: 'full', multiplier: 1.4 },
        { id: 'none', displayName: 'No wardrobe (stripped of everything)', description: '', source: 'built-in', nude: 'stripped', multiplier: 1.5 }
      ],
      currentOutfit: 'default',

      // consumables (per-girl ongoing). Stocks of 25/35 mean fresh captives last
      // ~25 ticks (12 min) before food empty
      // and ~35 ticks (17 min) before water empty. Combined with softened
      // starve/dehydrate rates this gives the player room to find the feed/water
      // actions before vital crashes.
      consumables: {
        food:  { tier: 0, stock: 25, decayPerTick: 1 },
        water: { tier: 0, stock: 35, decayPerTick: 1 },
        light: { tier: 0, hoursPerDay: 12 }
      }
    };
  }

  function generateBackstory(archetype, name, r) {
    const templates = {
      library:  [`${name}, grad student, lived alone in a studio by the campus library. Nobody reported her missing for three days.`, `${name}, PhD candidate in comparative literature. Her advisor thinks she's "on retreat."`, `${name}, part-time archivist. No family locally.`],
      club:     [`${name}, regular at the Pink Room. Never stayed sober through a weekend.`, `${name}, bottle service girl. Knew better than to get in strange cars. Didn't.`, `${name}, promoter's girlfriend, cheating on the promoter.`],
      street:   [`${name}, street-smart, cut-off from family by 17. Too tough for her own good.`, `${name}, used to running. Didn't see this coming.`, `${name}, knew the corner, knew the game. Didn't know you.`],
      sorority: [`${name}, legacy pledge at a top-tier house. Daddy's money and zero situational awareness.`, `${name}, sorority VP. Arrogant enough to walk alone at 3am.`, `${name}, pre-law, senior year. Thought she was untouchable.`],
      gym:      [`${name}, personal trainer. Thought her cardio would save her.`, `${name}, competitive powerlifter. Strong, but not strong enough.`, `${name}, yoga instructor. Taught breathwork she'd need later.`],
      barista:  [`${name}, closing shift at the indie coffee spot. Had just locked up.`, `${name}, art student barista. Sketched interesting faces. Sketched yours, once.`, `${name}, regular at the shop until she was the catch.`],
      office:   [`${name}, mid-level account manager. Stayed late every night. Nobody noticed she stopped clocking out.`, `${name}, corporate climber, all elbows and ambition. Walked to her car alone in the parking structure one time too many.`, `${name}, HR lead. Spent her days writing conduct policy. Didn't write one for this.`],
      waitress: [`${name}, double shifts at the truck-stop diner. Counted on the tips, not the parking lot.`, `${name}, last car in the lot after close. Always.`, `${name}, knew every regular by name. Trusted one she shouldn't have.`],
      model:    [`${name}, agency signed, between bookings. Got into the wrong "scout's" car.`, `${name}, runway-bound, fluent in three languages, none of them useful now.`, `${name}, comp-card said "available for travel." She was.`],
      nurse:    [`${name}, twelve-hour shift, walked to her car at 4am exhausted. Easy.`, `${name}, ER nurse, seen everything come through the doors. Didn't see this coming.`, `${name}, lived alone near the hospital, slept days, worked nights. Reported missing late.`],
      'college-student': [`${name}, sophomore, walked back to the dorm alone after the library closed.`, `${name}, exam week, running on adderall and no sleep, not paying attention.`, `${name}, new in town, didn't know which streets to avoid yet.`],
      'highschool-grad': [`${name}, just turned 18, grad trip with friends she got separated from.`, `${name}, summer before college, working up the nerve to do something reckless. Did.`, `${name}, fresh diploma, fake confidence, real bad luck.`],
      neighbor: [`${name}, lived two doors down. Waved every morning. Never thought twice about you.`, `${name}, borrowed your ladder once. You kept the spare key she didn't know about.`, `${name}, the friendly one on the block. Friendly enough to open the door.`],
      'family-friend': [`${name}, known the family for years. Trusted you completely. That was the mistake.`, `${name}, dropped by with a casserole dish. Never left.`, `${name}, the girl from every cookout and holiday. Vanished between the dessert and the drive home.`],
      'second-cousin': [`${name}, your second cousin, the one from the reunions. Family resemblance and all.`, `${name}, related just enough to trust you, distant enough that nobody connects the dots.`, `${name}, holiday-table familiar, came to visit the side of the family she barely knew.`],
      niece: [`${name}, your niece — your own blood, trusted you completely at every family gathering.`, `${name}, your sister's girl, all grown up. Came to you for help. Mistake.`, `${name}, the niece who always hugged you hello. Vanished after the cookout.`],
      'half-sister': [`${name}, your half-sister from your father's other family. You barely knew each other. Now you will.`, `${name}, the sibling you share half your blood with. Met up to reconnect. Never went home.`, `${name}, your half-sister, curious about the side of the family she missed. Curiosity caught her.`],
      'step-daughter': [`${name}, your step-daughter — no blood, all access. Lived under your roof, trusted the man who married her mother.`, `${name}, the step-kid grown up, alone in the house with you. Never saw it coming.`, `${name}, your wife's daughter. Called you by your first name. Now she calls you Master.`],
      'long-lost-sister': [`${name}, the sister you were separated from years ago. She found you online. You found a use for her.`, `${name}, your long-lost sister, dreaming of the family reunion. It wasn't what she pictured.`, `${name}, reunited at last after all these years. She drove hours to meet you. She's not driving home.`],
      stripper:  [`${name}, headliner at the club, walked to her car alone after last call.`, `${name}, worked the pole six nights a week, trusted the wrong regular.`, `${name}, dancer saving up to quit the life. Never made it out.`],
      cheerleader: [`${name}, squad captain, last to leave the empty gym after practice.`, `${name}, walked home from the game alone, still in her uniform.`, `${name}, cheer scholarship, peaked too early and trusted too easy.`],
      schoolgirl: [`${name}, eighteen, last one at the bus stop after the late shift.`, `${name}, walking home from cram school in her uniform after dark.`, `${name}, just turned 18, too trusting of the adult who offered a ride.`],
      teacher:   [`${name}, stayed late grading in the empty classroom. Last car in the lot.`, `${name}, the strict one everyone feared. Walked to her car alone every night.`, `${name}, lived alone near the school, kept to a predictable routine.`],
      police:    [`${name}, off-duty, jumped in her own driveway after a night shift.`, `${name}, beat cop who got cornered working a case alone.`, `${name}, trusted her training and her sidearm. Neither one helped.`],
      maid:      [`${name}, cleaned houses alone all day. One client decided to keep her.`, `${name}, hotel housekeeper, vanished between rooms on the top floor.`, `${name}, undocumented — no one she could safely report it to.`],
      'flight-attendant': [`${name}, flight attendant on a long layover — checked into the hotel and never checked out.`, `${name}, cabin crew, taken between terminals; her airline thinks she just missed the connection.`, `${name}, lives out of a suitcase in a different city every night — nobody knows which one she's in.`],
      goth:      [`${name}, alt girl leaving a late show alone — followed home from the venue.`, `${name}, the quiet goth nobody at the shop would miss for weeks.`, `${name}, drifts between squats and the scene; no fixed address, no one keeping count.`],
      bartender: [`${name}, locked up the bar alone after last call and never made it to her car.`, `${name}, worked nights, slept days — took the regulars a while to even notice the new face behind the taps.`, `${name}, cash-tips and a rented room; easy to make disappear between shifts.`],
      unity_seed: [`Unity — goth nympho coke whore coder, 25, came willingly the first time and keeps coming back. favorite. Already bonded to Master at L2 by default — her own free will landed her in the hole.`]
    };
    const pool = templates[archetype] || templates.library;
    return pick(pool, r);
  }

  // Family-relation archetypes — capturing your own kin is the deepest taboo, so a family
  // relation carries a premium across the economy (film/content value, john pay, sale price).
  // Maps archetype → the readable relation phrase used in content labels + persona context.
  const FAMILY_RELATION_ARCHETYPES = {
    niece: 'your niece',
    'half-sister': 'your half-sister',
    'step-daughter': 'your step-daughter',
    'long-lost-sister': 'your long-lost sister',
    'second-cousin': 'your second cousin',
    'family-friend': 'a friend of the family'
  };
  function isFamilyRelation(girl) {
    return !!(girl && FAMILY_RELATION_ARCHETYPES[girl.archetypeTemplate]);
  }
  function relationLabel(girl) {
    return (girl && FAMILY_RELATION_ARCHETYPES[girl.archetypeTemplate]) || '';
  }

  // Player-facing label for an archetype id. The raw id is an internal token
  // (unity_seed / college-student / flight-attendant) and must NEVER show in the UI.
  // Overrides only for ids that don't clean up on their own; everything else converts
  // its own id to Title Case with dashes/underscores → spaces.
  const ARCHETYPE_LABEL_OVERRIDES = {
    unity_seed: 'Goth Nympho'
  };
  function archetypeLabel(id) {
    if (!id) return 'Unknown';
    if (ARCHETYPE_LABEL_OVERRIDES[id]) return ARCHETYPE_LABEL_OVERRIDES[id];
    return String(id).replace(/[-_]+/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
  }

  window.DMTHGame = window.DMTHGame || {};
  window.DMTHGame.girlGen = Object.freeze({
    generate,
    ARCHETYPE_POOLS,
    FAMILY_RELATION_ARCHETYPES,
    isFamilyRelation,
    relationLabel,
    archetypeLabel
  });
})();
