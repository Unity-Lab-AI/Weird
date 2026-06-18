// DUNGEON MASTER: THE HUNT — two-tier supply pool (POOL-SUPPLY.1).
// Supplies live in TWO places: a per-HOLD reserve (targeted to one girl) and a per-DUNGEON
// POOL that every hold in that dungeon shares. A girl draws from her own hold reserve FIRST,
// then falls back to the dungeon pool — so stocking the pool feeds every captive evenly with
// no real cap. Covers food, water, condoms (for johns), and drugs (self-serve).
//
// Shapes (lazily created, migrate-safe):
//   dungeon.pool          = { food, water, condoms, drugs: { [drugKey]: n } }
//   hold.foodReserve / hold.waterReserve / hold.condomReserve  (numbers)
//   hold.drugReserve      = { [drugKey]: n }

(function () {
  'use strict';

  const KINDS = ['food', 'water', 'condoms'];   // simple scalar pooled kinds

  function getDungeonOfGirl(girl) {
    return girl ? window.DMTHGame.state.getDungeon(girl.assignedDungeonId) : null;
  }
  function holdOf(girl, dungeon) {
    const d = dungeon || getDungeonOfGirl(girl);
    return d?.holds?.[girl?.assignedHoldIdx ?? 0] || null;
  }

  function ensurePool(dungeon) {
    const p = dungeon.pool || {};
    return { food: p.food || 0, water: p.water || 0, condoms: p.condoms || 0, drugs: { ...(p.drugs || {}) } };
  }

  // ── Stocking ────────────────────────────────────────────────────────────────
  // Stock the dungeon-wide pool (shared by every hold) for a scalar kind.
  function stockPool(dungeonId, kind, n) {
    const d = window.DMTHGame.state.getDungeon(dungeonId);
    if (!d || !KINDS.includes(kind) || n <= 0) return false;
    const pool = ensurePool(d);
    pool[kind] += n;
    window.DMTHGame.state.updateDungeon(dungeonId, { pool });
    return true;
  }
  // Stock the dungeon pool with a drug.
  function stockPoolDrug(dungeonId, drugKey, n) {
    const d = window.DMTHGame.state.getDungeon(dungeonId);
    if (!d || n <= 0) return false;
    const pool = ensurePool(d);
    pool.drugs[drugKey] = (pool.drugs[drugKey] || 0) + n;
    window.DMTHGame.state.updateDungeon(dungeonId, { pool });
    return true;
  }
  // Stock one hold's own reserve (a scalar kind).
  function stockHold(dungeonId, holdIdx, kind, n) {
    const d = window.DMTHGame.state.getDungeon(dungeonId);
    if (!d || !d.holds?.[holdIdx] || !KINDS.includes(kind) || n <= 0) return false;
    const key = kind + 'Reserve';
    const newHolds = d.holds.map((h, i) => i === holdIdx ? { ...h, [key]: (h[key] || 0) + n } : h);
    window.DMTHGame.state.updateDungeon(dungeonId, { holds: newHolds });
    return true;
  }

  // ── Availability + draw ───────────────────────────────────────────────────────
  // Total available to a girl = her hold reserve + the dungeon pool.
  function available(girl, kind) {
    const d = getDungeonOfGirl(girl); if (!d) return 0;
    const hold = holdOf(girl, d);
    const holdAmt = kind === 'drugs' ? 0 : (hold?.[kind + 'Reserve'] || 0);
    const pool = ensurePool(d);
    const poolAmt = kind === 'drugs' ? Object.values(pool.drugs).reduce((a, b) => a + b, 0) : (pool[kind] || 0);
    return holdAmt + poolAmt;
  }

  // Draw n of a scalar kind: hold reserve first, then the dungeon pool. Returns amount drawn.
  function draw(girl, kind, n = 1) {
    const d = getDungeonOfGirl(girl); if (!d || !KINDS.includes(kind)) return 0;
    const holdIdx = girl.assignedHoldIdx ?? 0;
    const hold = d.holds?.[holdIdx]; if (!hold) return 0;
    const key = kind + 'Reserve';
    let need = n, drawn = 0;
    let newHolds = d.holds, pool = ensurePool(d), holdsDirty = false, poolDirty = false;

    const fromHold = Math.min(need, hold[key] || 0);
    if (fromHold > 0) {
      newHolds = d.holds.map((h, i) => i === holdIdx ? { ...h, [key]: (h[key] || 0) - fromHold } : h);
      drawn += fromHold; need -= fromHold; holdsDirty = true;
    }
    if (need > 0) {
      const fromPool = Math.min(need, pool[kind] || 0);
      if (fromPool > 0) { pool[kind] -= fromPool; drawn += fromPool; need -= fromPool; poolDirty = true; }
    }
    if (holdsDirty || poolDirty) {
      const patch = {};
      if (holdsDirty) patch.holds = newHolds;
      if (poolDirty) patch.pool = pool;
      window.DMTHGame.state.updateDungeon(d.id, patch);
    }
    return drawn;
  }

  // Draw one drug for a girl — her hold drugReserve first, then the dungeon pool's drugs.
  // Returns the drugKey drawn, or null. `prefer` (optional) tries that drug first.
  function drawDrug(girl, prefer) {
    const d = getDungeonOfGirl(girl); if (!d) return null;
    const holdIdx = girl.assignedHoldIdx ?? 0;
    const hold = d.holds?.[holdIdx]; if (!hold) return null;
    const holdDrugs = { ...(hold.drugReserve || {}) };
    const pool = ensurePool(d);
    const pickFrom = (map) => {
      if (prefer && (map[prefer] || 0) > 0) return prefer;
      const k = Object.keys(map).find(x => map[x] > 0);
      return k || null;
    };
    // hold first
    let k = pickFrom(holdDrugs);
    if (k) {
      holdDrugs[k] -= 1; if (holdDrugs[k] <= 0) delete holdDrugs[k];
      const newHolds = d.holds.map((h, i) => i === holdIdx ? { ...h, drugReserve: holdDrugs } : h);
      window.DMTHGame.state.updateDungeon(d.id, { holds: newHolds });
      return k;
    }
    // pool fallback
    k = pickFrom(pool.drugs);
    if (k) {
      pool.drugs[k] -= 1; if (pool.drugs[k] <= 0) delete pool.drugs[k];
      window.DMTHGame.state.updateDungeon(d.id, { pool });
      return k;
    }
    return null;
  }

  // Stock a hold's drug reserve (used by the room "stock drugs" control).
  function stockHoldDrug(dungeonId, holdIdx, drugKey, n) {
    const d = window.DMTHGame.state.getDungeon(dungeonId);
    if (!d || !d.holds?.[holdIdx] || n <= 0) return false;
    const newHolds = d.holds.map((h, i) => {
      if (i !== holdIdx) return h;
      const dr = { ...(h.drugReserve || {}) };
      dr[drugKey] = (dr[drugKey] || 0) + n;
      return { ...h, drugReserve: dr };
    });
    window.DMTHGame.state.updateDungeon(dungeonId, { holds: newHolds });
    return true;
  }

  function poolOf(dungeonId) {
    const d = window.DMTHGame.state.getDungeon(dungeonId);
    return d ? ensurePool(d) : { food: 0, water: 0, condoms: 0, drugs: {} };
  }

  window.DMTHGame = window.DMTHGame || {};
  window.DMTHGame.supply = Object.freeze({
    KINDS, available, draw, drawDrug, stockPool, stockPoolDrug, stockHold, stockHoldDrug, poolOf
  });
})();
