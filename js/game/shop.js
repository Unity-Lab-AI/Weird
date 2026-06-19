// DUNGEON MASTER: THE HUNT — "The Back Alley" purchasing + daily stock.
//
// The back alley does NOT carry unlimited everything. Cheap STAPLES (condoms, food,
// water, anything ≤ $30) are endless. High-tier tools / equipment / toys / chems are LEVEL-LOCKED
// (your DEPRAVITY level) and only a HANDFUL appear in stock each game-day, with the variety + amounts
// refreshing daily. Not so scarce you wait weeks — roughly half the high-tier catalog shows each day.

(function () {
  'use strict';

  function currentDay() {
    const c = window.DMTHGame.gameClock;
    return c ? Math.floor(c.now() / (c.MIN_PER_DAY || 1440)) + 1 : 1;
  }

  // Cheap staples are always available in unlimited supply.
  function isStaple(item) {
    return (item.cost || 0) <= 30 || item.subcategory === 'contraception' || item.subcategory === 'food';
  }

  // Tier the player is allowed to buy at his DEPRAVITY level (cheat/sandbox bypasses).
  // (Kept for back-compat; the real gate is the multi-dimension requirement engine below.)
  function allowedTier() {
    const p = window.DMTHGame.progression;
    if (!p) return 99;
    if (p.isCheatUnlocked && p.isCheatUnlocked()) return 99;
    return 1 + Math.floor((p.getLevel ? p.getLevel() : 0) / 2);   // L0→t1, L2→t2, L4→t3 … L8→t5
  }
  // An item is locked unless its multi-dimension requirement (player level + girls
  // held + dungeons owned + stockpile prereq, derived from tier by the progression ladder) is met.
  function isLevelLocked(item) {
    const p = window.DMTHGame.progression;
    if (p && p.isItemLocked) return p.isItemLocked(item);
    return !isCheat() && (item.tier || 0) > allowedTier();   // fallback if progression missing
  }
  // The unmet requirement text for a locked item, e.g. "DEPRAVITY L3 + 2 girls held".
  function lockReason(item) {
    const p = window.DMTHGame.progression;
    return (p && p.itemGateText) ? p.itemGateText(item) : 'raise your DEPRAVITY level';
  }

  // Per-day stock map. Staples aren't tracked (always ∞). High-tier items: ~half appear each day
  // with a small quantity (1-3). Persisted so it's stable within the day, fresh across days.
  function regenStock(day) {
    const items = window.DMTHAssets.ITEMS || [];
    const stock = {};
    for (const it of items) {
      if (isStaple(it)) continue;
      if (Math.random() < 0.5) stock[it.id] = 1 + Math.floor(Math.random() * 3);
    }
    return { day, stock };
  }
  function dailyStock() {
    const s = window.DMTHGame.state.current;
    if (!s) return { day: 0, stock: {} };
    if (!s.shopStock || s.shopStock.day !== currentDay()) {
      s.shopStock = regenStock(currentDay());
      try { window.DMTHGame.state.save(); } catch (e) { /* non-fatal */ }
    }
    return s.shopStock;
  }
  // True when the player chose the "everything unlocked" / sandbox start.
  function isCheat() {
    const p = window.DMTHGame.progression;
    if (p && p.isCheatUnlocked && p.isCheatUnlocked()) return true;
    const s = window.DMTHGame.state.current;
    return !!(s && s.mode === 'sandbox');
  }

  // Infinity for staples; otherwise today's remaining count (0 = sold out / not stocked today).
  // Cheat / everything-unlocked start = the whole back alley is fully stocked, always.
  function availableOf(itemId) {
    const it = window.DMTHAssets.getById('item', itemId);
    if (!it) return 0;
    if (isCheat() || isStaple(it)) return Infinity;
    const ds = dailyStock();
    return ds.stock[itemId] || 0;
  }

  // Items on offer — everything in catalog, priced per entry, annotated with stock + lock state.
  function listings() {
    return window.DMTHAssets.ITEMS.map(item => ({
      id: item.id,
      displayName: item.displayName,
      emoji: item.emoji,
      subcategory: item.subcategory,
      tier: item.tier || 0,
      price: item.cost || 0,
      notes: item.notes || '',
      prompt: item.prompt,
      staple: isStaple(item),
      locked: isLevelLocked(item),
      lockReason: lockReason(item),
      available: availableOf(item.id)
    }));
  }

  function listingsBySubcategory(subcat) {
    return listings().filter(l => l.subcategory === subcat);
  }

  function buy(itemId, qty = 1) {
    const item = window.DMTHAssets.getById('item', itemId);
    if (!item) throw new Error(`unknown item: ${itemId}`);
    if (isLevelLocked(item)) throw new Error('locked — needs ' + lockReason(item));
    const avail = availableOf(itemId);
    if (avail < qty) throw new Error(avail <= 0 ? 'the fence is out of these today — check back tomorrow' : `the fence only has ${avail} today`);
    const total = (item.cost || 0) * qty;
    const ok = window.DMTHGame.state.spendMoney(total, `buy:${itemId}x${qty}`);
    if (!ok) throw new Error('insufficient funds');
    window.DMTHGame.state.addItem(itemId, qty);
    // Decrement limited (non-staple) stock for the day.
    if (avail !== Infinity) {
      const s = window.DMTHGame.state.current;
      if (s && s.shopStock && s.shopStock.stock) {
        s.shopStock.stock[itemId] = Math.max(0, (s.shopStock.stock[itemId] || 0) - qty);
        try { window.DMTHGame.state.save(); } catch (e) { /* non-fatal */ }
      }
    }
    return { ok: true, itemId, qty, paid: total };
  }

  function use(itemId, context) {
    const item = window.DMTHAssets.getById('item', itemId);
    if (!item) throw new Error(`unknown item: ${itemId}`);
    const ok = window.DMTHGame.state.consumeItem(itemId, 1);
    if (!ok) throw new Error('not in inventory');
    // Context-specific effect handled by caller (capture / feed / etc.)
    return { ok: true, itemId, context };
  }

  window.DMTHGame = window.DMTHGame || {};
  window.DMTHGame.shop = Object.freeze({
    listings, listingsBySubcategory, buy, use,
    dailyStock, availableOf, isStaple, isLevelLocked, lockReason, allowedTier
  });
})();
