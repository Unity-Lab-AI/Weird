// DUNGEON MASTER: THE HUNT — milk / lactation economy (DEP-EXP.5 + DEP-EXP.4 lactation).
// Buy a milk-sucker → passively farm "girl milk" from lactating (preggo) captives into
// inventory. Girl-milk can be DRUNK by a girl (acts like a soothing drug — calms her, makes
// her pliable) or by the player (stat boost), sold instantly at the market, or sold passively
// to black-market / john buyers when stock exists. All balanced. 18+ fiction.
//
// milk-sucker + girl-milk live as plain inventory keys (NOT catalog ITEMS), so they never
// pollute the shop/hunt tool lists — they're surfaced only through the market milk panel +
// the quick-actions "feed girl-milk" button. girl-milk is capped at 9999 by the ITEMCAP clamp.

(function () {
  'use strict';

  const MILK_SUCKER_ITEM = 'milk-sucker';
  const MILK_ITEM = 'girl-milk';
  const MILK_SUCKER_COST = 600;
  const MILK_PER_TICK = 1;                 // liters farmed per lactating girl per tick
  const MILK_PRICE = 18;                   // $ per liter at instant market sale
  const MILK_PASSIVE_SELL_CHANCE = 0.30;   // chance/tick a john / black-market buyer takes some
  const LACTATION_MIN_DAY = 94;            // 2nd trimester+ = her body is producing milk

  function inv() { return window.DMTHGame.state.current?.inventory || {}; }
  function hasMilkSucker() { return (inv()[MILK_SUCKER_ITEM] || 0) > 0; }
  function milkStock() { return inv()[MILK_ITEM] || 0; }

  function buyMilkSucker() {
    if (hasMilkSucker()) return { ok: false, reason: 'you already own a milk-sucker' };
    const ok = window.DMTHGame.state.spendMoney(MILK_SUCKER_COST, 'buy:milk-sucker');
    if (!ok) return { ok: false, reason: 'insufficient funds' };
    window.DMTHGame.state.addItem(MILK_SUCKER_ITEM, 1);
    if (window.DMTHNotify) window.DMTHNotify.show('🍼 Milk-sucker installed — your pregnant captives now passively produce girl-milk into inventory.', { type: 'success', durationMs: 5000 });
    return { ok: true };
  }

  // A captive lactates once she's far enough along (2nd trimester+). Preggo girls are the milk source.
  function isLactating(girl) {
    const p = girl && girl.pregnancy;
    return !!(p && p.status === 'pregnant' && (p.gestationDays || 0) >= LACTATION_MIN_DAY);
  }
  function lactatingCount() {
    const s = window.DMTHGame.state.current;
    if (!s) return 0;
    return s.roster.filter(g => g.encounterState === 'captive' && isLactating(g)).length;
  }

  // Passive farm + passive sale — called from tick.js once per tick.
  function tickMilk() {
    const s = window.DMTHGame.state.current;
    if (!s) return;
    if (hasMilkSucker()) {
      let produced = 0;
      for (const g of s.roster) {
        if (g.encounterState !== 'captive' || !isLactating(g)) continue;
        produced += MILK_PER_TICK;
        // Being milked is a small ongoing degradation for a non-indoctrinated girl (it never
        // touches health — non-killer). A bonded one weathers it fine.
        if ((g.bond?.bondLevel || 0) <= 3) {
          window.DMTHGame.state.updateGirl(g.id, { bond: { ...g.bond, bondDebt: (g.bond?.bondDebt || 0) + 0.5 } });
        }
      }
      if (produced > 0) window.DMTHGame.state.addItem(MILK_ITEM, produced);
    }
    // Passive sale — johns / black-market buyers take some milk when there's stock.
    const stock = milkStock();
    if (stock > 0 && Math.random() < MILK_PASSIVE_SELL_CHANCE) {
      const qty = Math.min(stock, 1 + Math.floor(Math.random() * 3));
      window.DMTHGame.state.consumeItem(MILK_ITEM, qty);
      const price = Math.round(qty * MILK_PRICE * (0.9 + Math.random() * 0.4));
      window.DMTHGame.state.addMoney(price, 'milk-sale:passive');
      if (window.DMTHGame.state.addBuzz) window.DMTHGame.state.addBuzz(0.3, 'milk-sale');
      if (window.DMTHNotify) window.DMTHNotify.show(`🥛 Sold ${qty}L of girl-milk to a buyer — $${price.toLocaleString()}.`, { type: 'info', durationMs: 4000 });
    }
  }

  // Instant market sale of a quantity of girl-milk.
  function sellMilk(qty) {
    qty = Math.max(1, Math.min(milkStock(), Math.floor(qty || 1)));
    if (qty < 1) return { ok: false, reason: 'no girl-milk to sell' };
    window.DMTHGame.state.consumeItem(MILK_ITEM, qty);
    const price = Math.round(qty * MILK_PRICE);
    window.DMTHGame.state.addMoney(price, 'milk-sale:market');
    return { ok: true, qty, price };
  }

  // A girl drinks girl-milk — acts like a soothing drug: calms her (escape-risk down), small
  // arousal + mood lift + a little stamina. Consumes 1L. Makes her more pliable.
  function drinkGirl(girlId) {
    if (milkStock() < 1) return { ok: false, reason: 'no girl-milk in inventory' };
    const girl = window.DMTHGame.state.getGirl(girlId);
    if (!girl) return { ok: false, reason: 'no such girl' };
    window.DMTHGame.state.consumeItem(MILK_ITEM, 1);
    const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
    const body = { ...girl.body };
    body.arousal = clamp((body.arousal || 0) + 6, 0, 100);
    body.stamina = clamp((body.stamina || 70) + 4, 0, body.health ?? 100);
    const escape = { ...(girl.escape || { currentRisk: 0.1, factors: {}, lastAttempt: null }) };
    escape.currentRisk = clamp((escape.currentRisk ?? 0.1) - 0.04, 0, 1);
    const mood = { ...girl.mood, moodPressure: clamp((girl.mood?.moodPressure || 0) + 3, -60, 60) };
    window.DMTHGame.state.updateGirl(girlId, { body, escape, mood });
    return { ok: true };
  }

  // Suck milk DIRECTLY from her breast (MILK.2) — a bigger "for fun" bonus than bottled
  // girl-milk. Needs NO milk-sucker rig (always available on a lactating captive); still
  // works for the bonus boost even when you own the rig. Intimate for her (small arousal +
  // bond nudge). Refused if she isn't lactating.
  function suckFromBreast(girlId) {
    const girl = window.DMTHGame.state.getGirl(girlId);
    if (!girl) return { ok: false, reason: 'no such girl' };
    if (!isLactating(girl)) return { ok: false, reason: "she's not lactating — only a pregnant captive (2nd trimester+) has milk in her breasts" };
    const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
    if (window.DMTHGame.state.addSatisfaction) window.DMTHGame.state.addSatisfaction(8, 'suck-breast');
    if (window.DMTHGame.state.addBuzz) window.DMTHGame.state.addBuzz(3, 'suck-breast');
    const body = { ...girl.body, arousal: clamp((girl.body?.arousal || 0) + 5, 0, 100) };
    const bond = { ...girl.bond, bondXP: (girl.bond?.bondXP || 0) + 1 };
    window.DMTHGame.state.updateGirl(girlId, { body, bond });
    if (window.DMTHNotify) window.DMTHNotify.show(`🤱 You suckle ${girl.name}'s breast — warm milk straight from the source. Satisfaction + buzz boosted.`, { type: 'success', durationMs: 4500 });
    return { ok: true };
  }

  // The player drinks girl-milk — stat boost: player satisfaction (feeds hunting bonus) + buzz.
  function drinkPlayer() {
    if (milkStock() < 1) return { ok: false, reason: 'no girl-milk in inventory' };
    window.DMTHGame.state.consumeItem(MILK_ITEM, 1);
    if (window.DMTHGame.state.addSatisfaction) window.DMTHGame.state.addSatisfaction(5, 'drink-milk');
    if (window.DMTHGame.state.addBuzz) window.DMTHGame.state.addBuzz(2, 'drink-milk');
    // PLAYERSTAM.2 — warm girl-milk also tops up your Nut Reserve.
    if (window.DMTHGame.playerStamina) window.DMTHGame.playerStamina.refill(30);
    if (window.DMTHNotify) window.DMTHNotify.show('🥛 You drink a glass of warm girl-milk — satisfaction, buzz + Nut Reserve boosted.', { type: 'success', durationMs: 4000 });
    return { ok: true };
  }

  window.DMTHGame = window.DMTHGame || {};
  window.DMTHGame.milk = Object.freeze({
    MILK_SUCKER_ITEM, MILK_ITEM, MILK_SUCKER_COST, MILK_PRICE, LACTATION_MIN_DAY,
    hasMilkSucker, milkStock, buyMilkSucker, isLactating, lactatingCount,
    tickMilk, sellMilk, drinkGirl, drinkPlayer, suckFromBreast
  });
})();
