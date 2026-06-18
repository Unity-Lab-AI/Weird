// DUNGEON MASTER: THE HUNT — death dossier (DEATHSTATS.1 / DEATHIMG.1 / TROPHYSTATS.1).
// When a girl dies — by ANY path (neglect, snuff, overdose, transit) — we snapshot a full
// DEATH RECORD: her final stats, her history (where captured, where held longest, films,
// johns, pregnancies, chat turns), and her final living likeness. It's built ONCE (idempotent),
// persisted on the girl, surfaced as a popup dossier, and later attached to her trophy at
// disposal so the keepsake carries who she was and everything done to her.

(function () {
  'use strict';

  function gm() { return window.DMTHGame.gameClock ? window.DMTHGame.gameClock.now() : 0; }

  // Where she was held the LONGEST — summed from her dungeonHistory segments (pushed on
  // capture + transport). Falls back to her current/last dungeon for saves with no history.
  function longestHeldDungeon(girl) {
    const hist = Array.isArray(girl.dungeonHistory) ? girl.dungeonHistory : [];
    const nameOf = (id) => {
      const d = window.DMTHGame.state.getDungeon(id);
      const tpl = d && window.DMTHAssets.getById('dungeon', d.templateId);
      return tpl?.displayName || (id ? 'an unknown hold' : '—');
    };
    if (!hist.length) return nameOf(girl.assignedDungeonId);
    const now = Date.now();
    const totals = {};
    for (let i = 0; i < hist.length; i++) {
      const seg = hist[i];
      const end = (i + 1 < hist.length) ? hist[i + 1].at : now;
      totals[seg.dungeonId] = (totals[seg.dungeonId] || 0) + Math.max(0, end - seg.at);
    }
    let bestId = null, best = -1;
    for (const id in totals) if (totals[id] > best) { best = totals[id]; bestId = id; }
    return nameOf(bestId);
  }

  // Her last LIVING portrait — the most recent non-postmortem image in her history. Captures
  // her current features (outfit / marks / level) as she was, since the room auto-regenerates
  // the profile on every meaningful state shift. (A fresh generate post-death would render the
  // corpse, not her — so we keep the last living likeness for the dossier + trophy.)
  // Returns the most recent living-portrait history ENTRY ({ url, cacheKey, ... }) — we keep
  // both: `url` for the same-session popup (works immediately) and `cacheKey` so the image can
  // be re-resolved durably after a reload (a blob: url dies on reload — resolveCached rebuilds it).
  function lastLivingImageEntry(girl) {
    const hist = girl.visualIdentity?.imageHistory || [];
    for (let i = hist.length - 1; i >= 0; i--) {
      const e = hist[i];
      if (/postmortem|corpse|dead/i.test(e.situation || '')) continue;
      if (e.url || e.cacheKey) return e;
    }
    return hist.length ? hist[hist.length - 1] : null;
  }
  function lastLivingImage(girl) { const e = lastLivingImageEntry(girl); return e ? (e.url || null) : null; }

  function captureLocationName(girl) {
    const id = girl.encounteredAt?.locationId || girl.capturedAtLocation || null;
    if (!id) return '—';
    const loc = window.DMTHAssets.getById('location', id);
    return loc?.displayName || id;
  }

  function buildDeathRecord(girl, cause) {
    const b = girl.body || {};
    const films = (window.DMTHGame.state.current?.films || []).filter(f => f.girlId === girl.id);
    const wo = girl.whoreOut?.sessionTotals || {};
    // FRIENDKILL.1 / trophy-history — count the sadistic FRIEND visits + how hard she was used so
    // her death record (and the trophy chosen at corpse disposal) carries what was done to her.
    const friendVisits = girl.whoreOut?.friendVisits || 0;
    const friendActs = (girl.whoreOut?.johnLedger || []).filter(e => e.isFriend).length;
    const preg = girl.pregnancy || {};
    const ls = window.DMTHGame.lifespan;
    const turns = window.DMTHGame.state.getTurns ? window.DMTHGame.state.getTurns(girl.id, 200).length : 0;
    return {
      name: girl.name,
      archetype: girl.archetypeTemplate,
      affect: girl.captiveAffect || null,
      ageAtDeath: ls ? ls.currentAge(girl) : (girl.age || 22),
      cause: cause || girl.deceasedCause || 'unknown',
      diedAtGameMin: b.diedAt ?? gm(),
      diedAtReal: Date.now(),
      daysHeld: ls ? ls.daysCaptive(girl) : 0,
      captureLocation: captureLocationName(girl),
      longestHeld: longestHeldDungeon(girl),
      finalStats: {
        bondLevel: girl.bond?.bondLevel || 0,
        bondXP: girl.bond?.bondXP || 0,
        health: b.health ?? 0, stamina: b.stamina ?? 0,
        arousal: b.arousal ?? 0, wetness: b.wetness ?? 0,
        cumLoad: +((b.cumLoad || 0).toFixed ? (b.cumLoad || 0).toFixed(1) : b.cumLoad || 0),
        bruises: b.bruises || 0, high: b.high || 0,
        mood: girl.mood?.mood || '—',
        stats: { ...(girl.stats || {}) },
        ownershipMarks: (b.ownershipMarks || []).length,
        addicted: Object.values(b.addiction || {}).some(v => v >= 30),
        limbsRemoved: b.limbs ? Object.values(b.limbs).filter(x => x === 'removed').length : 0,
        isNugget: !!b.isNugget
      },
      tally: (() => {
        const filmEarnings = films.reduce((t, f) => t + (f.passiveEarnings || 0) + (f.saleRecord?.price || 0), 0);
        const johnGross = (wo.gross || 0) + (wo.tips || 0);
        const births = (preg.outcomeHistory || []).filter(o => o.status === 'delivered' || o.status === 'birthed').length;
        const milkProduced = Math.round(girl.body?.milkProducedTotal || 0);
        return {
          films: films.length,
          filmEarnings,
          johns: wo.encounters || 0,
          friendVisits,
          friendActs,
          playerActs: girl.body?.actsCommitted || 0,
          totalEarned: filmEarnings + johnGross,   // everything she earned you (films + johns/friends)
          pregnancies: (preg.outcomeHistory || []).length + (preg.status === 'pregnant' ? 1 : 0),
          births,
          milkProduced,
          chatTurns: turns
        };
      })(),
      finalImageUrl: (lastLivingImageEntry(girl) || {}).url || null,
      finalImageCacheKey: (lastLivingImageEntry(girl) || {}).cacheKey || null
    };
  }

  // Idempotent — builds + persists the death record + fires the dossier popup the FIRST time a
  // girl is found dead, regardless of which death path killed her. Safe to call from every path
  // (snuff / overdose / transit) for immediacy AND from the lifespan dead-branch as a backstop.
  function ensureDeathRecord(girlId, cause) {
    const girl = window.DMTHGame.state.getGirl(girlId);
    if (!girl) return null;
    if (girl.deathRecord) return girl.deathRecord;
    if (girl.encounterState !== 'dead') return null;
    const rec = buildDeathRecord(girl, cause);
    window.DMTHGame.state.updateGirl(girlId, { deathRecord: rec });
    if (window.DMTHDeathDossier) { try { window.DMTHDeathDossier.show(rec, girlId); } catch (e) { /* non-fatal */ } }
    return rec;
  }

  window.DMTHGame = window.DMTHGame || {};
  window.DMTHGame.death = Object.freeze({ buildDeathRecord, ensureDeathRecord, longestHeldDungeon, lastLivingImage });
})();
