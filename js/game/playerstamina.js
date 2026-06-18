// DUNGEON MASTER: THE HUNT — PLAYERSTAM.1: the player's "💦 Nut Reserve".
//
// A depraved-named player resource (NOT "stamina"): every act you perform on a girl spends it,
// it regenerates each tick at a brisk rate (no sitting-and-waiting), and refill items (viagra /
// girl's-milk / etc.) top it back up instantly. When it bottoms out you're "running on fumes" —
// you can still act, but acts pay reduced satisfaction + sex-drive fill until you recover or pop
// a pill. Backed by wallet.nutReserve (0-100) in state.js.

(function () {
  'use strict';

  const MAX = 100;
  const REGEN_PER_TICK = 7;     // ticks fire ~every 30 game-min; full recovery in ~14 ticks
  const LOW_BAND = 20;          // at/below this you're "running on fumes" (soft debuff)

  // Per-action drain. Heavier/more-extreme acts cost more reserve. Keyed by applyId; resolved
  // by longest-matching prefix so every sex/violence act is covered without listing all of them.
  const DRAIN = {
    'extreme-':        16,   // every extreme-* act
    'masochist-overload': 16,
    'sex-cum-inside':  12,
    'sex-anal':        9,
    'sex-rough':       9,
    'sex-oral':        7,
    'sex-gentle':      7,
    'sex-':            8,     // any other sex-* fallback
    'choke':           5,
    'punch':           5,
    'whip':            5,
    'slap':            4,
    'restrain':        1,
    'wipe-down':       0,
    'love-':           1,    // care barely costs you anything
    'drug-':           0     // dosing her doesn't drain you
  };

  function get() { return window.DMTHGame.state.getNutReserve ? window.DMTHGame.state.getNutReserve() : MAX; }
  function set(v) { if (window.DMTHGame.state.setNutReserve) window.DMTHGame.state.setNutReserve(v); }

  // Resolve the drain cost for an action id (longest prefix wins). Defaults to a light 3.
  function costFor(actionId) {
    if (!actionId) return 3;
    if (Object.prototype.hasOwnProperty.call(DRAIN, actionId)) return DRAIN[actionId];
    let best = null, bestLen = -1;
    for (const k of Object.keys(DRAIN)) {
      if (actionId.startsWith(k) && k.length > bestLen) { best = DRAIN[k]; bestLen = k.length; }
    }
    return best == null ? 3 : best;
  }

  // Spend reserve for an action. Never blocks the act (no dead-end frustration) — it just drops
  // toward zero. Returns the amount actually drained.
  function drainForAction(actionId) {
    const cost = costFor(actionId);
    if (cost <= 0) return 0;
    set(Math.max(0, get() - cost));
    return cost;
  }

  function refill(amount) { set(Math.min(MAX, get() + (amount || 0))); }
  function refillFull() { set(MAX); }

  // PLAYERSTAM.2 — refill items. Any catalog item with a numeric `playerRefill` tops up the
  // reserve (999 = full). Owned ones surface as quick "pop" buttons by the dashboard bar.
  function refillItemDefs() {
    const items = (window.DMTHAssets && window.DMTHAssets.ITEMS) || [];
    return items.filter(it => typeof it.playerRefill === 'number');
  }
  function ownedRefillItems() {
    const inv = (window.DMTHGame.state.current && window.DMTHGame.state.current.inventory) || {};
    return refillItemDefs().filter(it => (inv[it.id] || 0) > 0);
  }
  function popRefill(itemId) {
    const it = window.DMTHAssets && window.DMTHAssets.getById('item', itemId);
    if (!it || typeof it.playerRefill !== 'number') return { ok: false, reason: 'not a refill item' };
    if (!window.DMTHGame.state.consumeItem(itemId, 1)) return { ok: false, reason: 'you don\'t have one' };
    const before = get();
    if (it.playerRefill >= 999) refillFull(); else refill(it.playerRefill);
    const gained = Math.round(get() - before);
    if (window.DMTHNotify) window.DMTHNotify.show(`${it.emoji || '💊'} ${it.displayName} — Nut Reserve +${gained}.`, { type: 'success', durationMs: 3500 });
    return { ok: true, itemId, gained };
  }

  // Per-tick regeneration (called from tick.js).
  function regenTick() {
    const cur = get();
    if (cur >= MAX) return;
    set(Math.min(MAX, cur + REGEN_PER_TICK));
  }

  function status() {
    const value = get();
    return { value: Math.round(value), max: MAX, pct: value / MAX, low: value <= LOW_BAND, empty: value <= 0 };
  }
  // Soft multiplier applied to satisfaction / sex-drive fill when you're running low — spent
  // men perform worse. 1.0 normal, down to 0.5 at empty.
  function performanceMul() {
    const v = get();
    if (v > LOW_BAND) return 1.0;
    return 0.5 + 0.5 * (v / LOW_BAND);   // 0.5 at empty → 1.0 at the low-band edge
  }
  function describe() {
    const s = status();
    return `💦 Nut Reserve ${s.value}/${s.max}${s.empty ? ' · RUNNING ON FUMES' : s.low ? ' · running low' : ''}`;
  }

  window.DMTHGame = window.DMTHGame || {};
  window.DMTHGame.playerStamina = Object.freeze({
    MAX, LOW_BAND, DRAIN,
    get, costFor, drainForAction, refill, refillFull, regenTick, status, performanceMul, describe,
    refillItemDefs, ownedRefillItems, popRefill
  });
})();
