// DUNGEON MASTER: THE HUNT — milk / lactation economy (MILKBAL.1 + TITSUCKER.1 + SPECIALIZE.1).
//
// Lactation model (Gee 2026-06-18 — "dont make it so ill have littearly 1000000 liters of milk"):
//   • Every LACTATING captive (preggo 2nd-trimester+ OR inside her postpartum window) slowly
//     refills a PER-GIRL breast-fill (`body.breastMilk`, liters) over game-time, bounded by her
//     breast capacity. No fill = no milk → no endless supply. Real abundance only kicks in once
//     you keep 5+ preggos lactating at once.
//   • Suck a tit DIRECTLY ("suck her milk", love tab) — requires FULL breasts, empties her dry,
//     and grants ONE TIMED player buff (warm-milk high: Nut Reserve regen + satisfaction trickle).
//     The buff runs SHORTER than the time her breasts take to refill enough to suck again, so a
//     single girl can't keep it up — stagger sucks across multiple preggos for continuous uptime.
//   • The TIT SUCKER (TITSUCKER.1) — a machine, lootable + buyable, attachable ONE PER HOLD. A
//     rigged hold passively BOTTLES whole liters of her fill into the `girl-milk` inventory over
//     time (slow, capped by what she actually produces — never a flood). Bottled milk sells at
//     the market or auto-sells a little each tick to black-market / john buyers, gets drunk by a
//     girl (soothing drug) or by the player (Nut Reserve + satisfaction).
//   • SPECIALIZE.1 — a 🍈 Cow Tits (big-tits) girl produces + stores DOUBLE the milk and lactates
//     a few extra days postpartum (read live from js/game/specialize.js).
//
// girl-milk + tit-sucker live as plain inventory keys (NOT catalog ITEMS) so they never pollute
// the shop/hunt tool lists. girl-milk is capped at 9999 by the ITEMCAP clamp.

(function () {
  'use strict';

  const MILK_ITEM = 'girl-milk';
  const TIT_SUCKER_ITEM = 'tit-sucker';
  const TIT_SUCKER_NAME = 'Tit Sucker';
  const TIT_SUCKER_COST = 600;
  const MILK_PRICE = 18;                   // $ per liter at instant market sale
  const MILK_PASSIVE_SELL_CHANCE = 0.30;   // chance/tick a john / black-market buyer takes some
  const LACTATION_MIN_DAY = 94;            // 2nd trimester+ = her body is producing milk

  // Breast-fill balance. cap = liters a full lactating girl holds (×2 for big-tits). She refills
  // empty→full over ~1 game day (48 ticks); the refill rate scales WITH cap so a big-tits girl
  // fills to double the volume in the same time (= 2× milk/day). A direct suck needs her breasts
  // near-FULL (SUCK_FULL_FRAC) and the buff lasts fewer ticks than the refill-to-full takes, so
  // one girl can never keep the buff up alone.
  const BREAST_CAP_BASE = 4;
  const BREAST_REFILL_TICKS = 48;          // empty → full over one game day at base cap
  const SUCK_FULL_FRAC = 0.75;             // breasts must be ≥75% full to suck for the buff
  const MILK_BUFF_TICKS = 20;              // < the ~36 ticks it takes to refill back to suckable
  const MILK_BUFF_REGEN = 3;               // Nut Reserve regen/tick while the warm-milk high runs
  const TIT_SUCKER_DRAW_WHOLE = 1;         // whole liters the machine bottles per tick (capped by fill)
  const POSTPARTUM_TICKS = 144;            // ~3 game days of postpartum lactation (big-tits extends)

  function st() { return window.DMTHGame.state.current; }
  function tickNow() { return st()?.tickCount || 0; }
  function inv() { return st()?.inventory || {}; }
  function milkStock() { return inv()[MILK_ITEM] || 0; }
  function ownedTitSuckers() { return inv()[TIT_SUCKER_ITEM] || 0; }

  // --- Tit Sucker rig (per-hold attachment) ---------------------------------

  function holdOf(girl) {
    const d = window.DMTHGame.state.getDungeon(girl?.assignedDungeonId);
    return d && d.holds ? d.holds[girl.assignedHoldIdx ?? 0] : null;
  }
  function holdHasTitSucker(girl) { return !!holdOf(girl)?.titSucker; }

  function buyTitSucker() {
    const ok = window.DMTHGame.state.spendMoney(TIT_SUCKER_COST, 'buy:tit-sucker');
    if (!ok) return { ok: false, reason: 'insufficient funds' };
    window.DMTHGame.state.addItem(TIT_SUCKER_ITEM, 1);
    if (window.DMTHNotify) window.DMTHNotify.show(`🍼 Bought a ${TIT_SUCKER_NAME} — attach it to a hold to bottle that girl's milk over time.`, { type: 'success', durationMs: 5000 });
    return { ok: true };
  }

  // Attach an owned Tit Sucker to a girl's hold (one per hold). Consumes 1 from inventory.
  function attachTitSucker(girlId) {
    const girl = window.DMTHGame.state.getGirl(girlId);
    if (!girl) return { ok: false, reason: 'no such girl' };
    const dungeon = window.DMTHGame.state.getDungeon(girl.assignedDungeonId);
    const idx = girl.assignedHoldIdx ?? 0;
    const hold = dungeon?.holds?.[idx];
    if (!hold) return { ok: false, reason: 'she has no hold' };
    if (hold.titSucker) return { ok: false, reason: 'this hold already has a Tit Sucker' };
    if (ownedTitSuckers() < 1) return { ok: false, reason: 'no Tit Sucker in inventory — buy or loot one first' };
    window.DMTHGame.state.consumeItem(TIT_SUCKER_ITEM, 1);
    const holds = dungeon.holds.map((h, i) => i === idx ? { ...h, titSucker: true } : h);
    window.DMTHGame.state.updateDungeon(dungeon.id, { holds });
    if (window.DMTHNotify) window.DMTHNotify.show(`🍼 ${TIT_SUCKER_NAME} rigged to ${girl.name}'s hold — it'll bottle her milk while she lactates.`, { type: 'success', durationMs: 4500 });
    return { ok: true };
  }

  // Pull the Tit Sucker off a girl's hold — returns it to inventory.
  function detachTitSucker(girlId) {
    const girl = window.DMTHGame.state.getGirl(girlId);
    if (!girl) return { ok: false, reason: 'no such girl' };
    const dungeon = window.DMTHGame.state.getDungeon(girl.assignedDungeonId);
    const idx = girl.assignedHoldIdx ?? 0;
    const hold = dungeon?.holds?.[idx];
    if (!hold || !hold.titSucker) return { ok: false, reason: 'no Tit Sucker on this hold' };
    const holds = dungeon.holds.map((h, i) => i === idx ? { ...h, titSucker: false } : h);
    window.DMTHGame.state.updateDungeon(dungeon.id, { holds });
    window.DMTHGame.state.addItem(TIT_SUCKER_ITEM, 1);
    return { ok: true };
  }

  // --- Lactation + breast-fill ----------------------------------------------

  // A captive lactates once she's far enough along (2nd trimester+) OR while inside her
  // postpartum window (set on delivery, a few game days, extended by big-tits).
  function isLactating(girl) {
    const p = girl && girl.pregnancy;
    if (p && p.status === 'pregnant' && (p.gestationDays || 0) >= LACTATION_MIN_DAY) return true;
    const until = girl?.body?.lactatingUntil || 0;
    return until > 0 && tickNow() < until;
  }
  function lactatingCount() {
    const s = st();
    if (!s) return 0;
    return s.roster.filter(g => g.encounterState === 'captive' && isLactating(g)).length;
  }

  // Her breast capacity in liters — doubled by the 🍈 big-tits specialization.
  function breastCapFor(girl) {
    const mul = window.DMTHGame.specialize ? window.DMTHGame.specialize.milkMultiplier(girl) : 1;
    return BREAST_CAP_BASE * mul;
  }
  function breastFill(girl) { return girl?.body?.breastMilk || 0; }
  // Can she be sucked right now? Lactating AND breasts near-full.
  function canSuck(girl) { return isLactating(girl) && breastFill(girl) >= breastCapFor(girl) * SUCK_FULL_FRAC; }

  // --- Player warm-milk buff (timed) ----------------------------------------

  function buffActive() {
    const b = st()?.wallet?.milkBuff;
    return !!(b && tickNow() < b.untilTick);
  }
  function buffTicksLeft() {
    const b = st()?.wallet?.milkBuff;
    return b ? Math.max(0, b.untilTick - tickNow()) : 0;
  }

  // --- Tick — refill every lactating girl, bottle from rigged holds, run the buff ----------

  function tickMilk() {
    const s = st();
    if (!s) return;
    let produced = 0;
    for (const g of s.roster) {
      if (g.encounterState !== 'captive') continue;
      const lactating = isLactating(g);
      let bm = breastFill(g);
      if (lactating) {
        const cap = breastCapFor(g);
        // Refill scales with cap so big-tits fills to double the volume in the same game-day.
        bm = Math.min(cap, bm + cap / BREAST_REFILL_TICKS);
        const patch = { body: { breastMilk: bm } };
        // Tit Sucker on her hold bottles WHOLE liters — bounded by what she's actually holding,
        // so it can never exceed her production (no flood; ~4 L/game-day base, 8 with big-tits).
        if (holdHasTitSucker(g)) {
          const draw = Math.min(Math.floor(bm), TIT_SUCKER_DRAW_WHOLE);
          if (draw >= 1) {
            bm -= draw; produced += draw; patch.body.breastMilk = bm;
            // Trophy-history — running total of milk she's produced for you.
            patch.body.milkProducedTotal = (g.body?.milkProducedTotal || 0) + draw;
          }
          // Being machine-milked is a small ongoing degradation for a non-indoctrinated girl
          // (never touches health). A bonded one weathers it fine.
          if ((g.bond?.bondLevel || 0) <= 3) {
            patch.bond = { ...g.bond, bondDebt: (g.bond?.bondDebt || 0) + 0.5 };
          }
        }
        window.DMTHGame.state.updateGirl(g.id, patch);
      } else if (bm > 0) {
        // Dried up — she's no longer lactating, leftover milk slowly reabsorbs.
        window.DMTHGame.state.updateGirl(g.id, { body: { breastMilk: Math.max(0, bm - 0.5) } });
      }
    }
    if (produced > 0) window.DMTHGame.state.addItem(MILK_ITEM, produced);

    // Warm-milk player buff — while active, Nut Reserve regen + a satisfaction trickle.
    if (buffActive()) {
      if (window.DMTHGame.playerStamina) window.DMTHGame.playerStamina.refill(MILK_BUFF_REGEN);
      if (window.DMTHGame.state.addSatisfaction) window.DMTHGame.state.addSatisfaction(0.5, 'milk-buff');
    } else if (s.wallet && s.wallet.milkBuff) {
      // Expired this tick — clear it + a quiet note.
      s.wallet.milkBuff = null;
      window.DMTHGame.state.save();
      if (window.DMTHNotify) window.DMTHNotify.show('🥛 The warm-milk high fades — suck a full tit to chase it again.', { type: 'info', durationMs: 3500 });
    }

    // Passive sale — johns / black-market buyers take some bottled milk when there's stock.
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

  // Instant market sale of a quantity of bottled girl-milk.
  function sellMilk(qty) {
    qty = Math.max(1, Math.min(milkStock(), Math.floor(qty || 1)));
    if (qty < 1) return { ok: false, reason: 'no girl-milk to sell' };
    window.DMTHGame.state.consumeItem(MILK_ITEM, qty);
    const price = Math.round(qty * MILK_PRICE);
    window.DMTHGame.state.addMoney(price, 'milk-sale:market');
    return { ok: true, qty, price };
  }

  // A girl drinks bottled girl-milk — acts like a soothing drug: calms her (escape-risk down),
  // small arousal + mood lift + a little stamina. Consumes 1L. Makes her more pliable.
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

  // Suck milk DIRECTLY from her breast (MILKBAL.1) — needs FULL breasts (≥75%), empties her dry,
  // and grants the timed warm-milk player buff. Refused if she isn't lactating or isn't full
  // enough yet (her tits need time to fill back up between sucks).
  function suckFromBreast(girlId) {
    const girl = window.DMTHGame.state.getGirl(girlId);
    if (!girl) return { ok: false, reason: 'no such girl' };
    if (!isLactating(girl)) return { ok: false, reason: "she's not lactating — only a pregnant captive (2nd trimester+) or one freshly postpartum has milk" };
    if (!canSuck(girl)) {
      const pct = Math.round((breastFill(girl) / breastCapFor(girl)) * 100);
      return { ok: false, reason: `her tits aren't full yet (${pct}%) — give them time to swell back up` };
    }
    const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
    // Suck her dry.
    const sucked = breastFill(girl);
    const body = { ...girl.body, breastMilk: 0, arousal: clamp((girl.body?.arousal || 0) + 5, 0, 100), milkProducedTotal: (girl.body?.milkProducedTotal || 0) + sucked };
    const bond = { ...girl.bond, bondXP: (girl.bond?.bondXP || 0) + 1 };
    window.DMTHGame.state.updateGirl(girlId, { body, bond });
    // Set / refresh the timed buff, then bump satisfaction + buzz (those persist the buff).
    const s = st();
    if (s && s.wallet) s.wallet.milkBuff = { untilTick: tickNow() + MILK_BUFF_TICKS, sucked: Math.round(sucked * 10) / 10 };
    if (window.DMTHGame.state.addSatisfaction) window.DMTHGame.state.addSatisfaction(8, 'suck-breast');
    if (window.DMTHGame.state.addBuzz) window.DMTHGame.state.addBuzz(3, 'suck-breast');
    if (window.DMTHNotify) window.DMTHNotify.show(`🤱 You drain ${girl.name}'s swollen tits dry — warm-milk high on (Nut Reserve regen + satisfaction). It fades in ${MILK_BUFF_TICKS} ticks; her tits need time to refill.`, { type: 'success', durationMs: 5000 });
    return { ok: true };
  }

  // The player drinks bottled girl-milk — stat boost: satisfaction + buzz + Nut Reserve top-up.
  function drinkPlayer() {
    if (milkStock() < 1) return { ok: false, reason: 'no girl-milk in inventory' };
    window.DMTHGame.state.consumeItem(MILK_ITEM, 1);
    if (window.DMTHGame.state.addSatisfaction) window.DMTHGame.state.addSatisfaction(5, 'drink-milk');
    if (window.DMTHGame.state.addBuzz) window.DMTHGame.state.addBuzz(2, 'drink-milk');
    if (window.DMTHGame.playerStamina) window.DMTHGame.playerStamina.refill(30);
    if (window.DMTHNotify) window.DMTHNotify.show('🥛 You drink a glass of warm girl-milk — satisfaction, buzz + Nut Reserve boosted.', { type: 'success', durationMs: 4000 });
    return { ok: true };
  }

  // Set/extend a girl's postpartum lactation window — called by pregnancy.js on delivery.
  function startPostpartum(girlId) {
    const girl = window.DMTHGame.state.getGirl(girlId);
    if (!girl) return;
    const bonus = window.DMTHGame.specialize ? Math.round(window.DMTHGame.specialize.postpartumBonusTicks(girl)) : 0;
    const until = tickNow() + POSTPARTUM_TICKS + bonus;
    window.DMTHGame.state.updateGirl(girlId, { body: { ...girl.body, lactatingUntil: until } });
  }

  window.DMTHGame = window.DMTHGame || {};
  window.DMTHGame.milk = Object.freeze({
    MILK_ITEM, TIT_SUCKER_ITEM, TIT_SUCKER_NAME, TIT_SUCKER_COST, MILK_PRICE, LACTATION_MIN_DAY,
    milkStock, ownedTitSuckers, buyTitSucker, attachTitSucker, detachTitSucker, holdHasTitSucker,
    isLactating, lactatingCount, breastCapFor, breastFill, canSuck,
    buffActive, buffTicksLeft, MILK_BUFF_TICKS,
    tickMilk, sellMilk, drinkGirl, drinkPlayer, suckFromBreast, startPostpartum
  });
})();
