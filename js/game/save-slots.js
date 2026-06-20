// DUNGEON MASTER: THE HUNT — named save slots.

(function () {
  'use strict';

  const SLOT_KEYS = ['slot_a', 'slot_b', 'slot_c'];
  const ACTIVE_SLOT_LS = 'dmth_active_slot';

  function activeSlot() {
    return localStorage.getItem(ACTIVE_SLOT_LS) || 'main';
  }

  function setActiveSlot(slotId) {
    localStorage.setItem(ACTIVE_SLOT_LS, slotId);
  }

  async function listSlots() {
    const slots = [];
    for (const slotId of ['main', ...SLOT_KEYS]) {
      const data = await window.DMTHStorage.save.get(slotId);
      slots.push({
        id: slotId,
        exists: !!(data && data.createdAt),
        createdAt: data?.createdAt || null,
        captiveCount: (data?.roster || []).filter(g => g.encounterState === 'captive').length,
        money: data?.wallet?.money || 0,
        notoriety: data?.wallet?.notoriety || 0,
        tickCount: data?.tickCount || 0,
        isActive: slotId === activeSlot()
      });
    }
    return slots;
  }

  async function saveTo(slotId) {
    const s = window.DMTHGame.state.current;
    if (!s) throw new Error('no game state');
    await window.DMTHStorage.save.put(slotId, s);
    return { ok: true };
  }

  async function loadFrom(slotId) {
    const data = await window.DMTHStorage.save.get(slotId);
    if (!data || !data.createdAt) throw new Error('empty slot');
    await window.DMTHStorage.save.put('main', data);   // copy to main for runtime
    setActiveSlot(slotId);
    // Force a reload to re-boot from the restored state
    return { ok: true };
  }

  async function copySlot(fromId, toId) {
    const data = await window.DMTHStorage.save.get(fromId);
    if (!data) throw new Error('source slot empty');
    await window.DMTHStorage.save.put(toId, data);
    return { ok: true };
  }

  async function wipeSlot(slotId) {
    // Hard-delete the record (not a null tombstone) so the slot is genuinely gone + reads empty.
    if (window.DMTHStorage.save.del) await window.DMTHStorage.save.del(slotId);
    else await window.DMTHStorage.save.put(slotId, null);   // fallback for older storage builds
    // If we just wiped the active pointer, fall back to 'main' so nothing dangles.
    if (activeSlot() === slotId) setActiveSlot('main');
    return { ok: true };
  }

  window.DMTHGame = window.DMTHGame || {};
  window.DMTHGame.saveSlots = Object.freeze({
    SLOT_KEYS, activeSlot, setActiveSlot, listSlots, saveTo, loadFrom, copySlot, wipeSlot
  });
})();
