// DUNGEON MASTER: THE HUNT — dungeon ops: room upgrades + capacity expansions.
// Wires the 10 per-room upgrade tracks + the per-dungeon capacityUpgrades chain.

(function () {
  'use strict';

  // Per-room 12-track upgrade definitions with per-tier costs. feedAutomation +
  // waterSupply gate consumable decay in tick.js. Plumbed toilet (tier 2) OR plumbed
  // waterSupply (tier 2) zeroes water decay; auto-feeder (tier 2) or IV-line (tier 3)
  // zeroes food decay. The intent is an upgradable feed/water automation path that
  // becomes hands-off once plumbed.
  const UPGRADE_TRACKS = {
    security:       { label: '🔒 Security',       maxTier: 4, tierCosts: [0, 60,  250, 800, 2400], tierNames: ['basic latch','deadbolt','steel+combo','biometric','vault-grade'] },
    restraints:     { label: '⛓️ Restraints',      maxTier: 5, tierCosts: [0, 80,  220, 600, 1400, 3000], tierNames: ['bare','floor ring + chain','bed cuffs','full harness rig','wall spread-eagle rig','institution-grade'] },
    lights:         { label: '💡 Lights',          maxTier: 4, tierCosts: [0, 20,  80,  220, 600], tierNames: ['bare bulb','warm lamp','dimmable LED','mood LED strips','theatrical'] },
    toys:           { label: '🧸 Toys',            maxTier: 4, tierCosts: [0, 60,  200, 600, 1500], tierNames: ['empty drawer','basic','varied chest','deluxe kit','institution-grade'] },
    food:           { label: '🍱 Food quality',    maxTier: 4, tierCosts: [0, 30,  100, 300, 800], tierNames: ['slop','basic meals','varied','gourmet','whatever-she-wants'] },
    feedAutomation: { label: '🍽️ Feed automation', maxTier: 3, tierCosts: [0, 80, 280, 900], tierNames: ['manual','auto-bowl (timer)','auto-feeder (dispenser)','IV-line continuous'] },
    toilet:         { label: '🚽 Toilet',          maxTier: 2, tierCosts: [0, 45, 300], tierNames: ['can','bucket','full plumbing'] },
    waterSupply:    { label: '🚰 Water supply',    maxTier: 3, tierCosts: [0, 50, 200, 600], tierNames: ['manual bottle','wall jug w/ straw','plumbed faucet','recirculating IV'] },
    bedding:        { label: '🛏️ Bedding',         maxTier: 4, tierCosts: [0, 20, 100, 300, 700], tierNames: ['bare floor','foam mat','mattress','real bed','canopy bed'] },
    entertainment:  { label: '📺 Entertainment',   maxTier: 4, tierCosts: [0, 40, 180, 400, 900], tierNames: ['none','radio','TV','screen + library','full streaming'] },
    decor:          { label: '🎨 Decor',            maxTier: 4, tierCosts: [0, 30, 120, 400, 1000], tierNames: ['bare concrete','minimal','themed','luxury','fetish-themed'] },
    climate:        { label: '🌡️ Climate',         maxTier: 3, tierCosts: [0, 40, 180, 500], tierNames: ['none','fan','AC','full climate control'] }
  };

  // --- Dungeon-level security facilities (escape containment counters) ---
  // Purchased per-dungeon (not per-hold). Each installed facility adds its `containment`
  // to the escape-containment math (tick.js holdContainment) and a small `wantedReduction`
  // (a hardened, guarded property draws less attention). Guard dog is ONE of the set — the
  // player buys whatever mix fits the dungeon. One-time purchase each, persists on the dungeon.
  const SECURITY_FACILITIES = {
    'reinforced-door':  { displayName: '🚪 Reinforced Door + Vault Locks', cost: 350,  containment: 0.10, wantedReduction: 0.02, notes: 'Steel-core door, multi-point deadbolts. Slows any break for the exit.' },
    'guard-dog':        { displayName: '🐕 Guard Dog',                      cost: 500,  containment: 0.14, wantedReduction: 0.03, notes: 'Trained attack dog patrols the approach. Runners think twice.' },
    'motion-sensors':   { displayName: '📡 Motion Sensors + Alarm',         cost: 650,  containment: 0.12, wantedReduction: 0.01, notes: 'Trips the instant she moves for an exit — you get the jump on a break.' },
    'soundproofing':    { displayName: '🔇 Soundproofing',                  cost: 800,  containment: 0.08, wantedReduction: 0.06, notes: 'Screams don\'t carry. Big WANTED-heat reduction, modest containment.' },
    'electric-fence':   { displayName: '⚡ Electrified Perimeter',          cost: 1400, containment: 0.18, wantedReduction: 0.02, notes: 'Hot wire on every exit. The hardest physical deterrent.' },
    'sedation-collar':  { displayName: '💉 Auto-Sedation Collar',           cost: 2200, containment: 0.22, wantedReduction: 0.04, notes: 'Detects an escape spike and doses her down automatically. Near-total containment.' }
  };

  // Dungeon-level DISPOSAL facilities — gate the "involved" disposal methods (disposal.js
  // requirementError reads dungeon.facilities[id]). One-time build per dungeon.
  const DISPOSAL_FACILITIES = {
    incinerator: { displayName: '🔥 Incinerator', cost: 1800, facilityKey: 'incinerator', notes: 'Unlocks the Incinerate disposal method — cleanest removal, no body to find.' },
    boat:        { displayName: '⛵ Boat + coastal access', cost: 1200, facilityKey: 'boat', notes: 'Unlocks Lose at Sea — weighted, deep-water disposal.' }
  };

  function hasFacility(dungeon, facilityKey) {
    return !!(dungeon?.facilities && dungeon.facilities[facilityKey]);
  }

  function buyDisposalFacility(dungeonId, facilityId) {
    const fac = DISPOSAL_FACILITIES[facilityId];
    if (!fac) throw new Error('unknown disposal facility: ' + facilityId);
    const dungeon = window.DMTHGame.state.getDungeon(dungeonId);
    if (!dungeon) throw new Error('no such dungeon');
    if (hasFacility(dungeon, fac.facilityKey)) throw new Error('already built');
    const ok = window.DMTHGame.state.spendMoney(fac.cost, `disposal-facility:${facilityId}:${dungeonId}`);
    if (!ok) throw new Error('insufficient funds');
    window.DMTHGame.state.updateDungeon(dungeonId, {
      facilities: { ...(dungeon.facilities || {}), [fac.facilityKey]: true }
    });
    return { ok: true, facilityId, cost: fac.cost };
  }

  function hasSecurity(dungeon, facilityId) {
    return !!(dungeon?.security && dungeon.security[facilityId]);
  }

  function buySecurityFacility(dungeonId, facilityId) {
    const fac = SECURITY_FACILITIES[facilityId];
    if (!fac) throw new Error('unknown security facility: ' + facilityId);
    const dungeon = window.DMTHGame.state.getDungeon(dungeonId);
    if (!dungeon) throw new Error('no such dungeon');
    if (hasSecurity(dungeon, facilityId)) throw new Error('already installed');
    const ok = window.DMTHGame.state.spendMoney(fac.cost, `security:${facilityId}:${dungeonId}`);
    if (!ok) throw new Error('insufficient funds');
    window.DMTHGame.state.updateDungeon(dungeonId, {
      security: { ...(dungeon.security || {}), [facilityId]: true }
    });
    return { ok: true, facilityId, cost: fac.cost };
  }

  // Total passive WANTED reduction per tick from all installed facilities across all dungeons.
  function totalWantedReduction() {
    const s = window.DMTHGame.state.current;
    if (!s) return 0;
    let total = 0;
    for (const d of s.dungeons || []) {
      const sec = d.security || {};
      for (const id of Object.keys(sec)) {
        if (sec[id] && SECURITY_FACILITIES[id]) total += SECURITY_FACILITIES[id].wantedReduction || 0;
      }
    }
    return total;
  }

  function getHold(dungeonId, holdIdx) {
    const d = window.DMTHGame.state.getDungeon(dungeonId);
    if (!d) throw new Error('no such dungeon');
    const h = d.holds[holdIdx];
    if (!h) throw new Error('no such hold');
    return { dungeon: d, hold: h };
  }

  function getUpgradeLevel(hold, trackKey) {
    return hold.upgrades?.[trackKey] || 0;
  }

  function upgrade(dungeonId, holdIdx, trackKey) {
    const track = UPGRADE_TRACKS[trackKey];
    if (!track) throw new Error('unknown track: ' + trackKey);
    const { dungeon, hold } = getHold(dungeonId, holdIdx);
    const currentTier = getUpgradeLevel(hold, trackKey);
    if (currentTier >= track.maxTier) throw new Error('already at max');
    const nextTier = currentTier + 1;
    const cost = track.tierCosts[nextTier];

    const ok = window.DMTHGame.state.spendMoney(cost, `upgrade:${trackKey}:${dungeonId}:${holdIdx}:L${nextTier}`);
    if (!ok) throw new Error('insufficient funds');

    const newHolds = dungeon.holds.slice();
    newHolds[holdIdx] = {
      ...hold,
      upgrades: { ...(hold.upgrades || {}), [trackKey]: nextTier }
    };
    window.DMTHGame.state.updateDungeon(dungeonId, { holds: newHolds });
    return { ok: true, track: trackKey, newTier: nextTier, cost };
  }

  // --- Capacity expansion ---
  function nextCapacityUpgrade(dungeon) {
    const tpl = window.DMTHAssets.getById('dungeon', dungeon.templateId);
    if (!tpl || !Array.isArray(tpl.capacityUpgrades)) return null;
    return tpl.capacityUpgrades.find(u => u.atSlots > dungeon.capacity) || null;
  }

  function expandCapacity(dungeonId) {
    const dungeon = window.DMTHGame.state.getDungeon(dungeonId);
    if (!dungeon) throw new Error('no such dungeon');
    const next = nextCapacityUpgrade(dungeon);
    if (!next) throw new Error('dungeon already at max capacity for this template');
    const ok = window.DMTHGame.state.spendMoney(next.cost, `expand-capacity:${dungeonId}:${next.atSlots}`);
    if (!ok) throw new Error('insufficient funds');

    const tpl = window.DMTHAssets.getById('dungeon', dungeon.templateId);
    const newHolds = dungeon.holds.slice();
    while (newHolds.length < next.atSlots) {
      newHolds.push({
        id: `${dungeonId}_hold_${newHolds.length}`,
        captiveGirlId: null,
        holdType: tpl.holdType,
        restraintStatus: 'standard',
        upgrades: {},
        expansionNote: next.describedAs
      });
    }
    window.DMTHGame.state.updateDungeon(dungeonId, {
      capacity: next.atSlots,
      holds: newHolds,
      lastExpansion: { at: next.atSlots, cost: next.cost, describedAs: next.describedAs, ts: Date.now() }
    });
    return { ok: true, newCapacity: next.atSlots, cost: next.cost, note: next.describedAs };
  }

  window.DMTHGame = window.DMTHGame || {};
  window.DMTHGame.dungeonOps = Object.freeze({
    UPGRADE_TRACKS, getUpgradeLevel, upgrade,
    nextCapacityUpgrade, expandCapacity,
    SECURITY_FACILITIES, hasSecurity, buySecurityFacility, totalWantedReduction,
    DISPOSAL_FACILITIES, hasFacility, buyDisposalFacility
  });
})();
