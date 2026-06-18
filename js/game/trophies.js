// DUNGEON MASTER: THE HUNT — disposal trophies.
// When a girl is disposed of by a TERMINAL method (bury / incinerate / lose-at-sea /
// finalization-film), she leaves behind a unique trophy keyed to her TYPE (archetype) and
// her PERSONALITY (captive-affect). Each trophy grants a persistent player perk; perks STACK
// across the whole collection. Displayed in the trophy room (trophy-room-view.js).
//
// (Catalog lives here rather than a separate trophy-catalog.js to keep it one script + one
// source of truth — G.4's archetype×affect table is the ARCHETYPE_TROPHY + AFFECT_BONUS maps.)

(function () {
  'use strict';

  // Per-archetype base trophy (TROPHYLOOT.1) — a CONCRETE keepsake taken off her body, themed
  // to her type (panties, bra, driver license, library card, sorority flag, prescription pad,
  // jewelry, etc.). perk = { key, value, target? } — the stacking bonus the keepsake grants.
  const ARCHETYPE_TROPHY = {
    library:    { name: 'Her Library Card',     emoji: '📇', flavor: 'Her dog-eared library card, still warm.',          perk: { key: 'huntBonus', target: 'library', value: 0.05 } },
    club:       { name: 'Her Lace Panties',     emoji: '🩲', flavor: 'The panties she was wearing the night you took her.', perk: { key: 'johnCadenceBonus', value: 0.06 } },
    street:     { name: 'Her Switchblade',      emoji: '🔪', flavor: 'The blade she pulled on you — yours now.',          perk: { key: 'escapeContainmentBonus', value: 0.04 } },
    sorority:   { name: 'Her Sorority Flag',    emoji: '🏳️', flavor: 'The Greek-letter flag off her dorm wall.',          perk: { key: 'shopDiscount', value: 0.04 } },
    gym:        { name: 'Her Sports Bra',       emoji: '🎽', flavor: 'Her sweat-damp sports bra, snapped at the strap.',   perk: { key: 'huntBonus', target: 'gym', value: 0.05 } },
    barista:    { name: 'Her Name Tag',         emoji: '🏷️', flavor: 'A name-tag: HI MY NAME IS ___.',                    perk: { key: 'wantedDecayBonus', value: 0.06 } },
    office:     { name: "Her Driver License",   emoji: '🪪', flavor: 'Her license — name, address, the works. Leverage.',  perk: { key: 'filmPriceMul', value: 0.05 } },
    waitress:   { name: 'Her Order Pad',        emoji: '🧾', flavor: 'A grease-stained order pad, last ticket unfilled.',  perk: { key: 'johnCadenceBonus', value: 0.05 } },
    model:      { name: 'Her Diamond Earrings', emoji: '💎', flavor: 'The jewelry off her ears — she modeled them once.',  perk: { key: 'filmPriceMul', value: 0.07 } },
    nurse:      { name: 'Her Prescription Pad', emoji: '💊', flavor: 'Her scrip pad — signed blanks worth their weight.',  perk: { key: 'healBonus', value: 0.06 } },
    unity_seed: { name: 'Her Studded Collar',   emoji: '🖤', flavor: 'She came on her own two leather-booted feet. She stayed. Flagship.', perk: { key: 'wantedDecayBonus', value: 0.12 } }
  };

  // Per-affect modifier — the PERSONALITY. Adds a tag to the name + a secondary perk.
  const AFFECT_BONUS = {
    fighter:    { tag: 'Hard-Won',    perk: { key: 'escapeContainmentBonus', value: 0.03 } },
    cusser:     { tag: 'Foul-Mouthed',perk: { key: 'filmPriceMul', value: 0.03 } },
    mute:       { tag: 'Silent',      perk: { key: 'wantedDecayBonus', value: 0.04 } },
    submissive: { tag: 'Obedient',    perk: { key: 'johnCadenceBonus', value: 0.04 } },
    agreeable:  { tag: 'Easy',        perk: { key: 'shopDiscount', value: 0.03 } },
    bargainer:  { tag: 'Dealmaker',   perk: { key: 'shopDiscount', value: 0.04 } },
    catatonic:  { tag: 'Vacant',      perk: { key: 'huntBonus', value: 0.03 } },
    masochist:  { tag: 'Pain-Slut',   perk: { key: 'filmPriceMul', value: 0.04 } },
    timid:      { tag: 'Trembling',   perk: { key: 'huntBonus', value: 0.02 } }
  };

  function rarityFor(bondAtEnd, daysHeld) {
    const score = (bondAtEnd || 0) + Math.min(9, (daysHeld || 0) / 20);
    if (score >= 14) return { tier: 'legendary', emoji: '🌟', mult: 1.6 };
    if (score >= 9)  return { tier: 'rare',      emoji: '💎', mult: 1.3 };
    if (score >= 4)  return { tier: 'uncommon',  emoji: '✨', mult: 1.15 };
    return { tier: 'common', emoji: '·', mult: 1.0 };
  }

  // ── Personal keepsakes (TROPHYLOOT.1) ──────────────────────────────────────────────
  // Beyond her archetype keepsake, each girl has items ON her person at disposal — a 1-3 option
  // set you pick ONE from. Most are clothing / jewelry; some are FUCKED body-part trophies (a
  // nipple, a finger, a tooth, her tongue). Each grants a small PERMANENT stacking buff. The
  // option set is deterministic per girl (seeded by her id) so it's stable across re-opens.
  const GENERIC_KEEPSAKES = [
    { id: 'panties',   name: 'Her Panties',        emoji: '🩲', flavor: 'Still warm — you kept them.',          perk: 'johnCadenceBonus' },
    { id: 'bra',       name: 'Her Bra',            emoji: '👙', flavor: 'Cups stretched to her shape.',         perk: 'johnCadenceBonus' },
    { id: 'thong',     name: 'Her Thong',          emoji: '🩲', flavor: 'A torn scrap of lace.',                perk: 'filmPriceMul' },
    { id: 'ring',      name: 'Her Ring',           emoji: '💍', flavor: 'Slid off a limp finger.',              perk: 'shopDiscount' },
    { id: 'necklace',  name: 'Her Necklace',       emoji: '📿', flavor: 'Unclasped from her throat.',           perk: 'shopDiscount' },
    { id: 'earrings',  name: 'Her Earrings',       emoji: '💎', flavor: 'The jewelry off her ears.',            perk: 'filmPriceMul' },
    { id: 'anklet',    name: 'Her Anklet',         emoji: '🦶', flavor: 'A thin chain off her ankle.',          perk: 'huntBonus' },
    { id: 'scrunchie', name: 'Her Scrunchie',      emoji: '🎀', flavor: 'Still smells like her hair.',         perk: 'wantedDecayBonus' },
    { id: 'barrette',  name: 'Her Barrette',       emoji: '📎', flavor: 'A little hair-clip.',                  perk: 'wantedDecayBonus' },
    { id: 'skirt',     name: 'Her Skirt',          emoji: '👗', flavor: 'The skirt she was taken in.',          perk: 'johnCadenceBonus' },
    { id: 'choker',    name: 'Her Choker',         emoji: '🖤', flavor: 'The collar she wore for you.',         perk: 'escapeContainmentBonus' },
    { id: 'lipstick',  name: 'Her Lipstick',       emoji: '💄', flavor: 'Worn down to a nub on your cock.',     perk: 'filmPriceMul' },
    // fucked body-part trophies — rarer, gorier, premium film-value buff (Gee).
    { id: 'finger',    name: 'Her Severed Finger', emoji: '🦴', flavor: 'Bone, the nail polish still on it.',   perk: 'filmPriceMul', gore: true },
    { id: 'nipple',    name: 'Her Nipple',         emoji: '🌸', flavor: 'Bitten off and kept in a little jar.', perk: 'filmPriceMul', gore: true },
    { id: 'tooth',     name: 'Her Tooth',          emoji: '🦷', flavor: 'Knocked loose, strung on a chain.',    perk: 'escapeContainmentBonus', gore: true },
    { id: 'tongue',    name: 'Her Tongue',         emoji: '👅', flavor: 'It never talked back again.',          perk: 'healBonus', gore: true },
    { id: 'hair-lock', name: 'A Lock of Her Hair', emoji: '✂️', flavor: 'Cut close to the scalp.',             perk: 'wantedDecayBonus' },
    // TROPHYVAR.1 — wide variety, simple → gore. More clothing / jewelry / personal effects…
    { id: 'stockings', name: 'Her Stockings',      emoji: '🧦', flavor: 'Laddered, peeled off her legs.',       perk: 'johnCadenceBonus' },
    { id: 'garter',    name: 'Her Garter Belt',    emoji: '🎀', flavor: 'Snapped off her thigh.',               perk: 'filmPriceMul' },
    { id: 'heels',     name: 'Her Heels',          emoji: '👠', flavor: 'The shoes she couldn\'t run in.',       perk: 'shopDiscount' },
    { id: 'glasses',   name: 'Her Glasses',        emoji: '👓', flavor: 'One lens cracked.',                    perk: 'huntBonus' },
    { id: 'bracelet',  name: 'Her Bracelet',       emoji: '📿', flavor: 'Slid off a thin wrist.',               perk: 'shopDiscount' },
    { id: 'bikini',    name: 'Her Bikini Top',     emoji: '👙', flavor: 'String-tie, still knotted.',           perk: 'johnCadenceBonus' },
    { id: 'diary',     name: 'Her Diary',          emoji: '📔', flavor: 'Every secret she had, now yours.',     perk: 'wantedDecayBonus' },
    { id: 'phone',     name: 'Her Phone',          emoji: '📱', flavor: 'Dead battery, full of her life.',      perk: 'wantedDecayBonus' },
    { id: 'navel-ring',name: 'Her Navel Ring',     emoji: '💠', flavor: 'Unscrewed from her belly.',            perk: 'filmPriceMul' },
    { id: 'toe-ring',  name: 'Her Toe Ring',       emoji: '🦶', flavor: 'A little band off her toe.',           perk: 'huntBonus' },
    { id: 'watch',     name: 'Her Watch',          emoji: '⌚', flavor: 'Stopped at the hour you took her.',    perk: 'shopDiscount' },
    { id: 'perfume',   name: 'Her Perfume',        emoji: '🧴', flavor: 'One spray and she\'s in the room.',    perk: 'johnCadenceBonus' },
    { id: 'cum-rag',   name: 'Her Cum Rag',        emoji: '🧻', flavor: 'Stiff with everything she swallowed and didn\'t.', perk: 'filmPriceMul' },
    // …and more FUCKED body-part trophies (gore).
    { id: 'clit',      name: 'Her Clit',           emoji: '🌷', flavor: 'Snipped and kept on ice in a jar.',    perk: 'filmPriceMul', gore: true },
    { id: 'labia',     name: 'Her Labia',          emoji: '🥩', flavor: 'Pinned and dried like a butterfly.',   perk: 'filmPriceMul', gore: true },
    { id: 'ear',       name: 'Her Ear',            emoji: '👂', flavor: 'Taken off clean, still wearing the earring.', perk: 'escapeContainmentBonus', gore: true },
    { id: 'eye',       name: 'Her Eye',            emoji: '👁️', flavor: 'Floating in a jar — still watching you.', perk: 'escapeContainmentBonus', gore: true },
    { id: 'pinky-toe', name: 'Her Pinky Toe',      emoji: '🦴', flavor: 'The little one, nail polish intact.',  perk: 'huntBonus', gore: true },
    { id: 'nails',     name: 'A Jar of Her Nails', emoji: '💅', flavor: 'Pulled one by one, lacquer and all.',  perk: 'filmPriceMul', gore: true },
    { id: 'scalp',     name: 'Her Scalp-Lock',     emoji: '🩸', flavor: 'Hair and skin both — taken together.', perk: 'wantedDecayBonus', gore: true },
    { id: 'nipple-pair',name: 'Both Her Nipples',  emoji: '🌸', flavor: 'A matched pair in the jar this time.', perk: 'filmPriceMul', gore: true },
    { id: 'rib',       name: 'One of Her Ribs',    emoji: '🦴', flavor: 'Cracked out and scrimshawed.',         perk: 'healBonus', gore: true }
  ];

  function hashId(s) { let h = 0; const str = String(s || 'x'); for (let i = 0; i < str.length; i++) h = (h * 31 + str.charCodeAt(i)) | 0; return Math.abs(h); }

  // Build one keepsake candidate (near-complete trophy minus method/mint/deathRecord). Rarity
  // (+ a gore bump) scales the perk; the captive-affect adds a secondary perk + a name tag.
  function makeKeepsake(kid, name, emoji, flavor, perkSpec, rarity, gore, girl) {
    const affect = AFFECT_BONUS[girl.captiveAffect] || null;
    const mult = rarity.mult * (gore ? 1.25 : 1);
    const perks = [{ key: perkSpec.key, target: perkSpec.target, value: +(perkSpec.value * mult).toFixed(3) }];
    if (affect) perks.push({ ...affect.perk, value: +(affect.perk.value * mult).toFixed(3) });
    return {
      keepsakeId: kid,
      name: `${name}${affect ? ` (${affect.tag})` : ''}`,
      emoji, gore: !!gore, flavor,
      rarity: rarity.tier, rarityEmoji: rarity.emoji,
      perks
    };
  }

  // The 1-3 keepsake OPTIONS for a girl (deterministic per girl). Option 0 is always her
  // archetype keepsake; the rest are seeded picks from the generic + body-part pool.
  function personalKeepsakes(girl) {
    const arch = ARCHETYPE_TROPHY[girl.archetypeTemplate] || ARCHETYPE_TROPHY.library;
    const bondAtEnd = girl.bond?.bondLevel || 0;
    const daysHeld = girl.captureDate ? Math.max(0, Math.round((Date.now() - girl.captureDate) / 86400000)) : 0;
    const rarity = rarityFor(bondAtEnd, daysHeld);
    const seed = hashId(girl.id || girl.name);
    const count = 1 + (seed % 3);   // 1, 2, or 3 options
    const out = [makeKeepsake('arch', arch.name, arch.emoji, arch.flavor, arch.perk, rarity, false, girl)];
    const pool = GENERIC_KEEPSAKES.slice();
    let s = seed;
    for (let i = 1; i < count && pool.length; i++) {
      s = (s * 1103515245 + 12345) & 0x7fffffff;
      const g = pool.splice(s % pool.length, 1)[0];
      out.push(makeKeepsake(g.id, g.name, g.emoji, g.flavor, { key: g.perk, value: g.gore ? 0.05 : 0.03 }, rarity, g.gore, girl));
    }
    return out;
  }

  // Finalize a chosen keepsake into a persisted trophy, carrying her death dossier (TROPHYSTATS.1).
  function finalizeTrophy(girl, method, keepsake) {
    const bondAtEnd = girl.bond?.bondLevel || 0;
    const daysHeld = girl.captureDate ? Math.max(0, Math.round((Date.now() - girl.captureDate) / 86400000)) : 0;
    // Death dossier — saved on the girl by death.js; build fresh if she's disposed straight from
    // alive (e.g. finalization film) so the trophy always carries her final record + likeness.
    let deathRecord = girl.deathRecord || null;
    if (!deathRecord && window.DMTHGame.death) {
      try { deathRecord = window.DMTHGame.death.buildDeathRecord(girl, 'disposal:' + method); } catch (e) { deathRecord = null; }
    }
    return {
      id: 'trophy_' + (girl.id || 'x') + '_' + Date.now().toString(36),
      girlId: girl.id, girlName: girl.name,
      archetype: girl.archetypeTemplate, affect: girl.captiveAffect || null,
      method, keepsakeId: keepsake.keepsakeId,
      name: keepsake.name, emoji: keepsake.emoji, gore: !!keepsake.gore, visceral: !!keepsake.gore,
      rarity: keepsake.rarity, rarityEmoji: keepsake.rarityEmoji,
      flavor: keepsake.flavor, perks: keepsake.perks,
      bondAtEnd, daysHeld,
      seed: girl.visualIdentity?.seed || null,
      facialDescription: girl.visualIdentity?.facialDescription || null,
      finalImageUrl: deathRecord?.finalImageUrl || null,
      finalImageCacheKey: deathRecord?.finalImageCacheKey || null,
      deathRecord,
      mintedAt: Date.now()
    };
  }

  // Back-compat — the DEFAULT (archetype, first-option) trophy without an explicit choice.
  function buildTrophy(girl, method) {
    return finalizeTrophy(girl, method, personalKeepsakes(girl)[0]);
  }

  // Mint + persist. keepsakeId picks WHICH of her personalKeepsakes to keep (defaults to her
  // archetype keepsake / first option). Trophies never leave the collection — they only stack.
  function mint(girl, method, keepsakeId) {
    if (!girl) return null;
    const candidates = personalKeepsakes(girl);
    const chosen = candidates.find(c => c.keepsakeId === keepsakeId) || candidates[0];
    const trophy = finalizeTrophy(girl, method, chosen);
    window.DMTHGame.state.addTrophy(trophy);
    if (window.DMTHNotify) {
      window.DMTHNotify.show(`${trophy.rarityEmoji} TROPHY KEPT — "${trophy.emoji} ${trophy.name}" (${trophy.rarity}). Small permanent buff stacked.`, { type: 'success', durationMs: 7000 });
    }
    return trophy;
  }

  // Aggregate every trophy's perks into a single stacking perk-set the rest of the game reads.
  // huntBonus carries an `all` plus per-archetype `byArchetype` map (target perks).
  function activePerks() {
    const out = {
      huntBonus: { all: 0, byArchetype: {} },
      wantedDecayBonus: 0,
      filmPriceMul: 0,
      johnCadenceBonus: 0,
      escapeContainmentBonus: 0,
      shopDiscount: 0,
      healBonus: 0
    };
    const trophies = window.DMTHGame.state.getTrophies ? window.DMTHGame.state.getTrophies() : [];
    for (const t of trophies) {
      for (const p of (t.perks || [])) {
        if (p.key === 'huntBonus') {
          if (p.target) out.huntBonus.byArchetype[p.target] = (out.huntBonus.byArchetype[p.target] || 0) + p.value;
          else out.huntBonus.all += p.value;
        } else if (p.key in out) {
          out[p.key] += p.value;
        }
      }
    }
    return out;
  }

  // Convenience scalar getters for consumers.
  function huntBonusFor(archetype) {
    const p = activePerks();
    return p.huntBonus.all + (p.huntBonus.byArchetype[archetype] || 0);
  }
  function perk(key) { return activePerks()[key] || 0; }

  window.DMTHGame = window.DMTHGame || {};
  window.DMTHGame.trophies = Object.freeze({
    ARCHETYPE_TROPHY, AFFECT_BONUS, GENERIC_KEEPSAKES,
    buildTrophy, mint, personalKeepsakes, finalizeTrophy, activePerks, huntBonusFor, perk, rarityFor
  });
})();
