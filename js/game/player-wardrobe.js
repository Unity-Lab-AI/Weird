// DUNGEON MASTER: THE HUNT — PLAYER wardrobe .
// The player's OWN clothes — bought in his clothing store, worn on his avatar, threaded into
// every image he appears in ( reads playerCharacter.startClothing as the
// rendered clothing descriptor). Buy → owned in playerCharacter.wardrobe; Wear → sets the active
// clothingId + copies that outfit's image descriptor into startClothing so it renders on him.
//
// Per the standing menagerie rule (full range of selections, never skimpy) the catalog is broad.
// Each entry's `desc` is an image-ready clothing phrase (positive-only, ) dropped
// straight into the captor / POV prompt block.

(function () {
  'use strict';

  // tier is just a rough price/quality band; `desc` is the literal image clothing phrase.
  const PLAYER_OUTFITS = [
    { id: 'pc-tee',        emoji: '👕', name: 'Plain tee + jeans',        price: 0,    tier: 1, desc: 'a plain dark t-shirt and jeans' },
    { id: 'pc-wifebeater', emoji: '🥢', name: 'Wifebeater + work jeans',  price: 40,   tier: 1, desc: 'a dirty white tank top and grimy work jeans' },
    { id: 'pc-hoodie',     emoji: '🧥', name: 'Black hoodie + sweats',    price: 80,   tier: 1, desc: 'a black hoodie and dark sweatpants' },
    { id: 'pc-tracksuit',  emoji: '🏃', name: 'Zip tracksuit',            price: 120,  tier: 1, desc: 'a zip-up shell tracksuit and sneakers' },
    { id: 'pc-flannel',    emoji: '🪵', name: 'Flannel + boots',          price: 140,  tier: 1, desc: 'an open flannel shirt over a tank top, jeans and work boots' },
    { id: 'pc-leather',    emoji: '🏍️', name: 'Leather jacket, bare chest', price: 260, tier: 2, desc: 'a black leather jacket worn open over a bare muscular chest and dark jeans' },
    { id: 'pc-biker',      emoji: '⛓️', name: 'Studded biker leathers',   price: 340,  tier: 2, desc: 'studded black biker leathers and heavy boots' },
    { id: 'pc-suit',       emoji: '🕴️', name: 'Tailored black suit',      price: 500,  tier: 3, desc: 'a sharp tailored black suit, white shirt and dark tie' },
    { id: 'pc-cop',        emoji: '👮', name: 'Police uniform',           price: 420,  tier: 3, desc: 'a dark police uniform with utility belt' },
    { id: 'pc-military',   emoji: '🎖️', name: 'Military fatigues',        price: 460,  tier: 3, desc: 'military camo fatigues and combat boots' },
    { id: 'pc-doctor',     emoji: '🩺', name: 'Surgical gown + gloves',   price: 380,  tier: 3, desc: 'a white surgical gown, scrub cap and blue latex gloves' },
    { id: 'pc-priest',     emoji: '✝️', name: 'Clergy cassock',           price: 360,  tier: 3, desc: 'a black clergy cassock and white collar' },
    { id: 'pc-butcher',    emoji: '🔪', name: "Butcher's apron, bare",    price: 300,  tier: 3, desc: "a blood-stained rubber butcher's apron over a bare chest" },
    { id: 'pc-hazmat',     emoji: '☣️', name: 'Black rubber hazmat suit', price: 640,  tier: 4, desc: 'a black rubber hazmat suit with hood and gloves' },
    { id: 'pc-gimp',       emoji: '🖤', name: 'Black gimp leather',       price: 720,  tier: 4, desc: 'a full black leather gimp suit, zippered' },
    { id: 'pc-naked',      emoji: '🍆', name: 'Fully nude',               price: 200,  tier: 2, desc: 'completely nude, fully naked grown adult body' }
  ];
  const BY_ID = Object.fromEntries(PLAYER_OUTFITS.map(o => [o.id, o]));

  function pc() {
    return (window.DMTHGame.state && window.DMTHGame.state.getPlayerCharacter)
      ? window.DMTHGame.state.getPlayerCharacter() : null;
  }
  function catalog() { return PLAYER_OUTFITS.slice(); }
  function getById(id) { return BY_ID[id] || null; }
  function owned() { const p = pc(); return (p && Array.isArray(p.wardrobe)) ? p.wardrobe.slice() : []; }
  function ownsOutfit(id) { return owned().includes(id); }
  function currentId() { const p = pc(); return (p && p.clothingId) || null; }

  // Buy an outfit into the player's wardrobe (one-time purchase; can't re-buy what you own).
  function buy(id) {
    const o = BY_ID[id];
    if (!o) return { ok: false, reason: 'unknown outfit' };
    if (ownsOutfit(id)) return { ok: false, reason: 'already owned' };
    if (o.price > 0) {
      const paid = window.DMTHGame.state.spendMoney(o.price, `player-clothing:${id}`);
      if (!paid) return { ok: false, reason: (window.DMTHGame.state.brokeLine ? window.DMTHGame.state.brokeLine() : 'broke') };
    }
    const p = pc() || {};
    const wardrobe = Array.isArray(p.wardrobe) ? p.wardrobe.slice() : [];
    if (!wardrobe.includes(id)) wardrobe.push(id);
    window.DMTHGame.state.setPlayerCharacter({ wardrobe });
    return { ok: true, id, price: o.price };
  }

  // Wear an owned outfit — sets the active clothingId AND copies its descriptor into
  // startClothing so the image pipeline renders him in it.
  function wear(id) {
    const o = BY_ID[id];
    if (!o) return { ok: false, reason: 'unknown outfit' };
    if (!ownsOutfit(id)) return { ok: false, reason: 'you do not own that' };
    window.DMTHGame.state.setPlayerCharacter({ clothingId: id, startClothing: o.desc });
    return { ok: true, id, desc: o.desc };
  }

  window.DMTHGame = window.DMTHGame || {};
  window.DMTHGame.playerWardrobe = Object.freeze({
    catalog, getById, owned, ownsOutfit, currentId, buy, wear
  });
})();
