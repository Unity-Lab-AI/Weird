// DUNGEON MASTER: THE HUNT — dungeon ops: room upgrades + capacity expansions.
// Wires the 10 per-room upgrade tracks + the per-dungeon capacityUpgrades chain.

(function () {
  'use strict';

  // Per-room 12-track upgrade definitions with per-tier costs. feedAutomation +
  // waterSupply gate consumable decay in tick.js. Plumbed toilet (tier 2) OR plumbed
  // waterSupply (tier 2) zeroes water decay; auto-feeder (tier 2) or IV-line (tier 3)
  // zeroes food decay. The intent is an upgradable feed/water automation path that
  // becomes hands-off once plumbed.
  // Each track carries a `bonus` — a plain-language line of WHAT it gives (👤 her / 🎮 you /
  // 🏠 the hold), shown in the upgrade panel so every hold-installable upgrade states its payoff.
  // Wired-to-mechanics tracks (security/restraints/feedAutomation/waterSupply/toilet) describe
  // their real effect. The comfort/ambience tracks (lights/toys/food/bedding/entertainment/
  // decor/climate) ALSO pull real weight now: each one feeds the per-hold "comfort score"
  // (tick.js holdComfort), and a comfortable hold eases her escape-will (escape-bar suppression)
  // + passively forgives bond-debt + trickles Stockholm bondXP — on top of staying the image/film
  // setting. Stack the comfort tracks and she settles in and stops fighting on her own.
  const UPGRADE_TRACKS = {
    security:       { label: '🔒 Security',       maxTier: 4, tierCosts: [0, 60,  250, 800, 2400], tierNames: ['basic latch','deadbolt','steel+combo','biometric','vault-grade'], bonus: '🏠 Hold — the top escape-containment lever: each tier suppresses her escape-risk bar (up to ~−30% at max). Stacks with restraints + dungeon security facilities.' },
    restraints:     { label: '⛓️ Restraints',      maxTier: 5, tierCosts: [0, 80,  220, 600, 1400, 3000], tierNames: ['bare','floor ring + chain','bed cuffs','full harness rig','wall spread-eagle rig','institution-grade'], bonus: '🏠 Hold + 👤 her — restraint-grade containment (up to ~−25% escape) and a more restrained captive to use.' },
    lights:         { label: '💡 Lights',          maxTier: 4, tierCosts: [0, 20,  80,  220, 600], tierNames: ['bare bulb','warm lamp','dimmable LED','mood LED strips','theatrical'], bonus: '👤 Her + 🎮 you — scene lighting + image/film setting, AND a comfort track: feeds her hold-comfort score (eases escape-will + forgives bond-debt + trickles Stockholm).' },
    toys:           { label: '🧸 Toys',            maxTier: 4, tierCosts: [0, 60,  200, 600, 1500], tierNames: ['empty drawer','basic','varied chest','deluxe kit','institution-grade'], bonus: '👤 Her + 🎮 you — built-in toy-chest for the hold (the toys you MOUNT in Toys & Implements are what get used on her), AND a comfort track: feeds her hold-comfort score (eases escape-will + forgives bond-debt + trickles Stockholm).' },
    food:           { label: '🍱 Food quality',    maxTier: 4, tierCosts: [0, 30,  100, 300, 800], tierNames: ['slop','basic meals','varied','gourmet','whatever-she-wants'], bonus: '👤 Her — food-quality comfort track: feeds her hold-comfort score (eases escape-will + forgives bond-debt + trickles Stockholm). The Feed-automation + Water tracks below are what stop hunger/thirst decay.' },
    feedAutomation: { label: '🍽️ Feed automation', maxTier: 3, tierCosts: [0, 80, 280, 900], tierNames: ['manual','auto-bowl (timer)','auto-feeder (dispenser)','IV-line continuous'], bonus: '🏠 Hold + 👤 her — tier 2+ auto-feeds her: her food never decays to zero, so no hunger mood-hit and no hand-feeding.' },
    toilet:         { label: '🚽 Toilet',          maxTier: 2, tierCosts: [0, 45, 300], tierNames: ['can','bucket','full plumbing'], bonus: '👤 Her — hygiene/comfort; tier 2 (full plumbing) ALSO plumbs her water so it never runs dry (no thirst decay).' },
    waterSupply:    { label: '🚰 Water supply',    maxTier: 3, tierCosts: [0, 50, 200, 600], tierNames: ['manual bottle','wall jug w/ straw','plumbed faucet','recirculating IV'], bonus: '🏠 Hold + 👤 her — tier 2+ plumbs her water: it never decays to zero, so no thirst mood-hit and no hand-watering.' },
    bedding:        { label: '🛏️ Bedding',         maxTier: 4, tierCosts: [0, 20, 100, 300, 700], tierNames: ['bare floor','foam mat','mattress','real bed','canopy bed'], bonus: '👤 Her — image/film setting AND a comfort track: feeds her hold-comfort score (eases escape-will + forgives bond-debt + trickles Stockholm).' },
    entertainment:  { label: '📺 Entertainment',   maxTier: 4, tierCosts: [0, 40, 180, 400, 900], tierNames: ['none','radio','TV','screen + library','full streaming'], bonus: '👤 Her — comfort track: feeds her hold-comfort score (eases escape-will + forgives bond-debt + trickles Stockholm).' },
    decor:          { label: '🎨 Decor',            maxTier: 4, tierCosts: [0, 30, 120, 400, 1000], tierNames: ['bare concrete','minimal','themed','luxury','fetish-themed'], bonus: '👤 Her + 🎮 you — room theme + image/film backdrop AND a comfort track: feeds her hold-comfort score (eases escape-will + forgives bond-debt + trickles Stockholm).' },
    climate:        { label: '🌡️ Climate',         maxTier: 3, tierCosts: [0, 40, 180, 500], tierNames: ['none','fan','AC','full climate control'], bonus: '👤 Her — temperature comfort track: feeds her hold-comfort score (eases escape-will + forgives bond-debt + trickles Stockholm).' }
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
    if (!ok) throw new Error(window.DMTHGame.state.brokeLine ? window.DMTHGame.state.brokeLine() : 'broke');
    window.DMTHGame.state.updateDungeon(dungeonId, {
      facilities: { ...(dungeon.facilities || {}), [fac.facilityKey]: true }
    });
    return { ok: true, facilityId, cost: fac.cost };
  }

  function hasSecurity(dungeon, facilityId) {
    return !!(dungeon?.security && dungeon.security[facilityId]);
  }

  //  (a)  — facilities are now BOUGHT INTO INVENTORY at the shop, then INSTALLED
  // to a specific dungeon here (just like toys / clothing: buy → your hands → install where you
  // want it). Inventory is keyed by the facility id. These replace the old inline buy-with-money
  // buttons that used to live in dungeon-view.
  function facilitySpec(facilityId) { return SECURITY_FACILITIES[facilityId] || DISPOSAL_FACILITIES[facilityId] || null; }
  function facilityOwnedQty(facilityId) { return (window.DMTHGame.state.current && window.DMTHGame.state.current.inventory && window.DMTHGame.state.current.inventory[facilityId]) || 0; }
  function buyFacilityToInventory(facilityId) {
    const fac = facilitySpec(facilityId);
    if (!fac) return { ok: false, reason: 'unknown facility' };
    if (!window.DMTHGame.state.spendMoney(fac.cost, `facility-buy:${facilityId}`)) {
      return { ok: false, reason: window.DMTHGame.state.brokeLine ? window.DMTHGame.state.brokeLine() : 'broke' };
    }
    window.DMTHGame.state.addItem(facilityId, 1);
    return { ok: true, facilityId, cost: fac.cost, qty: facilityOwnedQty(facilityId) };
  }
  function installSecurityFacility(dungeonId, facilityId) {
    const fac = SECURITY_FACILITIES[facilityId];
    if (!fac) return { ok: false, reason: 'unknown security facility' };
    const dungeon = window.DMTHGame.state.getDungeon(dungeonId);
    if (!dungeon) return { ok: false, reason: 'no such dungeon' };
    if (hasSecurity(dungeon, facilityId)) return { ok: false, reason: 'already installed in this dungeon' };
    if (facilityOwnedQty(facilityId) < 1) return { ok: false, reason: `no ${fac.displayName} in inventory — buy one at 🏴 The Defilers' Bloc first` };
    if (!window.DMTHGame.state.consumeItem(facilityId, 1)) return { ok: false, reason: 'none in inventory' };
    window.DMTHGame.state.updateDungeon(dungeonId, { security: { ...(dungeon.security || {}), [facilityId]: true } });
    return { ok: true, facilityId };
  }
  function installDisposalFacility(dungeonId, facilityId) {
    const fac = DISPOSAL_FACILITIES[facilityId];
    if (!fac) return { ok: false, reason: 'unknown disposal facility' };
    const dungeon = window.DMTHGame.state.getDungeon(dungeonId);
    if (!dungeon) return { ok: false, reason: 'no such dungeon' };
    if (hasFacility(dungeon, fac.facilityKey)) return { ok: false, reason: 'already built in this dungeon' };
    if (facilityOwnedQty(facilityId) < 1) return { ok: false, reason: `no ${fac.displayName} in inventory — buy one at 🏴 The Defilers' Bloc first` };
    if (!window.DMTHGame.state.consumeItem(facilityId, 1)) return { ok: false, reason: 'none in inventory' };
    window.DMTHGame.state.updateDungeon(dungeonId, { facilities: { ...(dungeon.facilities || {}), [fac.facilityKey]: true } });
    return { ok: true, facilityId };
  }

  function buySecurityFacility(dungeonId, facilityId) {
    const fac = SECURITY_FACILITIES[facilityId];
    if (!fac) throw new Error('unknown security facility: ' + facilityId);
    const dungeon = window.DMTHGame.state.getDungeon(dungeonId);
    if (!dungeon) throw new Error('no such dungeon');
    if (hasSecurity(dungeon, facilityId)) throw new Error('already installed');
    const ok = window.DMTHGame.state.spendMoney(fac.cost, `security:${facilityId}:${dungeonId}`);
    if (!ok) throw new Error(window.DMTHGame.state.brokeLine ? window.DMTHGame.state.brokeLine() : 'broke');
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
    if (!ok) throw new Error(window.DMTHGame.state.brokeLine ? window.DMTHGame.state.brokeLine() : 'broke');

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
    if (!ok) throw new Error(window.DMTHGame.state.brokeLine ? window.DMTHGame.state.brokeLine() : 'broke');

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
    DISPOSAL_FACILITIES, hasFacility, buyDisposalFacility,
    facilitySpec, facilityOwnedQty, buyFacilityToInventory, installSecurityFacility, installDisposalFacility
  });
})();
