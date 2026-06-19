// DUNGEON MASTER: THE HUNT — drug scheduler with pharmacokinetic curves.
// Each intake creates a curve on the girl's body.activeDrugs; tick recomputes current effect.

(function () {
  'use strict';

  // Curve table — all times in ms.
  // Effect peaks at `peakAt`, lingers, then wears off by `wearOffAt`.
  // highContribution is the max amount added to girl.body.high.
  // canOD — whether too much KILLS her (weed never; coke/K/molly/etc. yes). instant — the
  // immediate stat shift on FORCED dosing that makes her more pliable + menial to being
  // fucked (arousal/wetness up, escape-risk down). Applied in administer() the moment it hits.
  const DRUG_CURVES = {
    coke:    { onsetMs: 60_000,   peakMs: 8 * 60_000,  wearOffMs: 45 * 60_000,  highContribution: 60, speechEffect: 'high_coke',  stackable: true,  itemId: 'coke-bumps', canOD: true,  instant: { arousal: +6, escapeRisk: -0.03 } },
    weed:    { onsetMs: 90_000,   peakMs: 30 * 60_000, wearOffMs: 120 * 60_000, highContribution: 40, speechEffect: 'high_weed',  stackable: true,  itemId: 'weed',       canOD: false, instant: { arousal: +3, escapeRisk: -0.05 } },
    mdma:    { onsetMs: 30 * 60_000, peakMs: 90 * 60_000, wearOffMs: 4 * 60 * 60_000, highContribution: 70, speechEffect: 'aroused', stackable: false, itemId: 'mdma',    canOD: true,  instant: { arousal: +15, wetness: +15, escapeRisk: -0.08 } },
    acid:    { onsetMs: 45 * 60_000, peakMs: 4 * 60 * 60_000, wearOffMs: 10 * 60 * 60_000, highContribution: 55, speechEffect: 'curious', stackable: false, itemId: 'acid', canOD: true,  instant: { arousal: +4, escapeRisk: -0.05 } },
    whiskey: { onsetMs: 5 * 60_000,  peakMs: 20 * 60_000, wearOffMs: 90 * 60_000, highContribution: 45, speechEffect: 'drunk',     stackable: true,  itemId: 'wine',       canOD: true,  instant: { arousal: +6, escapeRisk: -0.06 } },
    alcohol: { onsetMs: 5 * 60_000,  peakMs: 20 * 60_000, wearOffMs: 90 * 60_000, highContribution: 45, speechEffect: 'drunk',     stackable: true,  itemId: 'wine',       canOD: true,  instant: { arousal: +6, escapeRisk: -0.06 } },
    ketamine:{ onsetMs: 2 * 60_000,  peakMs: 8 * 60_000,  wearOffMs: 40 * 60_000, highContribution: 75, speechEffect: 'broken',    stackable: false, itemId: 'ketamine',   canOD: true,  instant: { arousal: +2, escapeRisk: -0.10 } },
    // Tranquilizer — 4 real minutes of total knockout. In game-time terms that's
    // 4 real-min × 60 game-min/real-min = 240 game-minutes = 4 game hours (since
    // 1 real sec = 1 game minute). Hard binary effect — see curveMagnitude special-
    // case below. 5-sec onset for the inject-to-down transition, then full knockout
    // until wearOffAt, then she snaps awake. Distinct from ketamine (dissociation)
    // — this is total unresponsiveness. While active, isUnconscious(girl) returns
    // truthy, gating chat / consensual actions in room.js and front-loading
    // unconscious markers in the image prompt.
    tranquilizer: { onsetMs: 5_000, peakMs: 10_000, wearOffMs: 240_000, highContribution: 100, speechEffect: 'unconscious', stackable: false, itemId: 'tranquilizer' }
  };

  // ---- FORCED ADDICTION + WITHDRAWAL (DEP-EXP.2) ----
  // Per-dose addiction gain. Forced dosing racks up body.addiction[drug] (0-100). Weed
  // barely hooks; coke/mdma/ketamine hook hard. tranquilizer is a medical knockout, not a
  // recreational hook → 0. When addiction is high AND she's cut off from that drug she goes
  // into WITHDRAWAL (tickAll): escape-risk spikes, mood crashes, she gets dope-sick + begs
  // for a fix. Keep her dosed = pliable; cut her off = a desperate control lever.
  const ADDICTIVENESS = Object.freeze({ coke: 12, weed: 4, mdma: 14, acid: 7, whiskey: 8, alcohol: 8, ketamine: 16, tranquilizer: 0 });
  const WITHDRAWAL_THRESHOLD = 30;       // addiction must exceed this for that drug to bite
  const ADDICTION_DECAY_PER_TICK = 0.5;  // slow clear — toughing out withdrawal eventually works

  // ---- OVERDOSE TOXICITY (ODSPAM.1) ----
  // Spamming a hard drug in a row kills (Gee 2026-06-18: "10 x molly in a row shes dead for
  // sure then u got a corpse to make extra money"). Each canOD dose stacks body.odLoad; the
  // death roll uses it (minus a small free allowance) so the first dose or two are survivable
  // but rapid repeats ramp to a guaranteed kill. odLoad decays while sober (tickAll), so it's
  // RAPID "in a row" dosing that's lethal, not doses spaced across the day.
  // Tuned to Gee's example: mdma 0.12/dose, free 0.2 → 10th molly = odLoad 1.2 → certain death.
  const OD_POTENCY = Object.freeze({ coke: 0.10, mdma: 0.12, acid: 0.10, whiskey: 0.07, alcohol: 0.07, ketamine: 0.15 });
  const OD_LOAD_FREE = 0.2;        // first dose or two are survivable
  const OD_LOAD_DECAY = 0.10;      // toxicity clears while sober (per tick) — must be dosed "in a row"

  // Return the active tranquilizer entry on the girl if she's still within
  // its wearOffAt window, else null. Used by UI to gate buttons + drive the live mm:ss
  // countdown, and by image-prompt path to front-load unconscious markers.
  function isUnconscious(girl) {
    const now = Date.now();
    const active = Array.isArray(girl?.body?.activeDrugs) ? girl.body.activeDrugs : [];
    for (const d of active) {
      if (typeof d !== 'object') continue;
      if ((d.name || '') !== 'tranquilizer') continue;
      if (now < (d.wearOffAt || 0)) return d;
    }
    return null;
  }

  function unconsciousRemainingMs(girl) {
    const d = isUnconscious(girl);
    if (!d) return 0;
    return Math.max(0, (d.wearOffAt || 0) - Date.now());
  }

  // Administer a drug — consumes an inventory item if available, starts a curve on the girl.
  function administer(girlId, drugKey, { forFree = false, selfServe = false } = {}) {
    const curve = DRUG_CURVES[drugKey];
    if (!curve) throw new Error('unknown drug: ' + drugKey);
    const girl = window.DMTHGame.state.getGirl(girlId);
    if (!girl) throw new Error('no such girl');

    if (!forFree && curve.itemId) {
      const ok = window.DMTHGame.state.consumeItem(curve.itemId, 1);
      if (!ok) throw new Error(`no ${curve.itemId} in inventory`);
    }

    const now = Date.now();
    const active = Array.isArray(girl.body.activeDrugs) ? girl.body.activeDrugs.slice() : [];

    if (!curve.stackable) {
      const existing = active.findIndex(d => (d.name || d) === drugKey);
      if (existing >= 0) active.splice(existing, 1);
    }
    active.push({
      name: drugKey,
      administeredAt: now,
      onsetAt: now + curve.onsetMs,
      peakAt: now + curve.peakMs,
      wearOffAt: now + curve.wearOffMs,
      highContribution: curve.highContribution,
      speechEffect: curve.speechEffect
    });

    // Instant pliability — forced dosing immediately makes her more pliable + menial to being
    // fucked: arousal/wetness up, escape-risk (fighting spirit) down. Applied the moment it hits.
    const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
    const inst = curve.instant || {};
    const newBody = { ...girl.body, activeDrugs: active };
    if (inst.arousal) newBody.arousal = clamp((newBody.arousal || 0) + inst.arousal, 0, 100);
    if (inst.wetness) newBody.wetness = clamp((newBody.wetness || 0) + inst.wetness, 0, 100);
    const escape = { ...(girl.escape || { currentRisk: 0.1, factors: {}, lastAttempt: null }) };
    if (inst.escapeRisk) escape.currentRisk = clamp((escape.currentRisk ?? 0.1) + inst.escapeRisk, 0, 1);

    // Forced dosing builds chemical dependency (DEP-EXP.2). Each addictive drug racks up
    // body.addiction[drugKey]; high enough + then cut off → withdrawal in tickAll().
    const addGain = ADDICTIVENESS[drugKey] || 0;
    if (addGain) {
      const addiction = { ...(newBody.addiction || {}) };
      addiction[drugKey] = Math.min(100, (addiction[drugKey] || 0) + addGain);
      newBody.addiction = addiction;
    }

    // Overdose toxicity (ODSPAM.1) — each hard-drug dose stacks; decays while sober (tickAll).
    // A girl SELF-DOSING to survive (DRUG-SELFSERVE.1) never stacks toxicity — she paces herself
    // and will not OD on her own; only the player force-dosing builds odLoad toward death.
    if (curve.canOD && !selfServe) newBody.odLoad = (newBody.odLoad || 0) + (OD_POTENCY[drugKey] || 0.10);

    window.DMTHGame.state.updateGirl(girlId, { body: newBody, escape });

    // OVERDOSE — hard drugs only (weed can NOT kill). Death chance combines two sources:
    //   (a) current `high` over the OD threshold — stacking stackable drugs (coke etc.), and
    //   (b) cumulative odLoad toxicity from rapid repeat dosing (ODSPAM.1) — this is what makes
    //       "10 x molly in a row = dead for sure" work even though molly is non-stackable and
    //       its single-dose high never crosses the threshold.
    if (curve.canOD && !selfServe) {
      const eff = currentEffect(window.DMTHGame.state.getGirl(girlId));
      const highComponent = eff.high >= OD_THRESHOLD ? ((eff.high - OD_THRESHOLD) / (100 - OD_THRESHOLD)) * 0.5 : 0;
      const odChance = Math.min(1.0, highComponent + Math.max(0, (newBody.odLoad || 0) - OD_LOAD_FREE));
      if (odChance > 0 && Math.random() < odChance) {
        overdoseDeath(girlId, drugKey, eff.high);
        return { ok: true, curve, activeCount: active.length, overdosed: true };
      }
    }
    return { ok: true, curve, activeCount: active.length };
  }

  const OD_THRESHOLD = 80;

  // Drug overdose death — body stays in the hold for postmortem use until disposal (mirrors
  // the lifespan death path). Weed never reaches here (canOD:false).
  function overdoseDeath(girlId, drugKey, high) {
    const girl = window.DMTHGame.state.getGirl(girlId);
    if (!girl) return;
    window.DMTHGame.state.updateGirl(girlId, {
      encounterState: 'dead',
      deceasedAt: Date.now(),
      deceasedCause: 'overdose:' + drugKey,
      body: { ...girl.body, diedAt: window.DMTHGame.gameClock?.now?.() ?? 0, decayedMinutes: 0 }
    });
    if (window.DMTHGame.death) window.DMTHGame.death.ensureDeathRecord(girlId, 'overdose:' + drugKey);
    if (window.DMTHGame.state.addBuzz) window.DMTHGame.state.addBuzz(-3, `od-death:${drugKey}`);
    if (window.DMTHGame.wanted) window.DMTHGame.wanted.accrue('captive-death');
    if (window.DMTHNotify) window.DMTHNotify.show(`☠️ ${girl.name} OVERDOSED on ${drugKey} (high ${high}) and died — body in her hold until disposal.`, { type: 'error', durationMs: 8000 });
  }

  // Compute current effect per-girl from active curves.
  // Returns { high: 0..100, strongestEffect: 'high_coke' | 'drunk' | ..., activeList: [...] }
  function currentEffect(girl) {
    const now = Date.now();
    const active = Array.isArray(girl.body?.activeDrugs) ? girl.body.activeDrugs : [];
    let highTotal = 0;
    let strongest = null;
    let strongestMag = 0;
    const stillActive = [];

    for (const d of active) {
      if (typeof d !== 'object' || !d.administeredAt) continue;
      if (now >= d.wearOffAt) continue;
      stillActive.push(d);
      const mag = curveMagnitude(d, now);
      highTotal += mag;
      if (mag > strongestMag) {
        strongestMag = mag;
        strongest = d.speechEffect || 'neutral';
      }
    }

    return {
      high: Math.max(0, Math.min(100, Math.round(highTotal))),
      strongestEffect: strongest || 'neutral',
      activeList: stillActive
    };
  }

  // Bell-ish curve — ramps up to peak, holds briefly, decays to wear-off.
  // Tranquilizer is a special case — flat hard knockout from administration to wearOff
  // with zero decay, so she stays fully unconscious for the entire 4-real-minute window
  // instead of gradually "waking up" as the magnitude tapers off.
  function curveMagnitude(d, now) {
    if (now < d.administeredAt) return 0;
    if (now >= d.wearOffAt) return 0;
    if (d.name === 'tranquilizer') {
      return d.highContribution;
    }
    if (now < d.onsetAt) {
      const p = (now - d.administeredAt) / Math.max(1, d.onsetAt - d.administeredAt);
      return p * d.highContribution * 0.5;
    }
    if (now < d.peakAt) {
      const p = (now - d.onsetAt) / Math.max(1, d.peakAt - d.onsetAt);
      return d.highContribution * (0.5 + 0.5 * p);
    }
    const p = (now - d.peakAt) / Math.max(1, d.wearOffAt - d.peakAt);
    return d.highContribution * (1 - p);
  }

  // Called by tick — updates every captive girl's body.high + drug list, AND runs the
  // addiction-decay + withdrawal pass (DEP-EXP.2). Withdrawal symptoms spike escape-risk,
  // crash mood, and make her dope-sick + begging (voice + image) — the control lever.
  function tickAll() {
    const s = window.DMTHGame.state.current;
    if (!s) return;
    const cl = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
    for (const girl of s.roster) {
      if (girl.encounterState !== 'captive') continue;
      const eff = currentEffect(girl);
      const body = { ...girl.body, high: eff.high, activeDrugs: eff.activeList };

      // --- Addiction decay + withdrawal evaluation ---
      const addiction = { ...(body.addiction || {}) };
      const activeNames = new Set(eff.activeList.map(d => d && d.name).filter(Boolean));
      let worstSeverity = 0;
      const withdrawingFrom = [];
      for (const key of Object.keys(addiction)) {
        let lvl = Math.max(0, (addiction[key] || 0) - ADDICTION_DECAY_PER_TICK);  // slow clear
        addiction[key] = lvl;
        // Hooked but cut off from that drug → withdrawal for it.
        if (lvl > WITHDRAWAL_THRESHOLD && !activeNames.has(key)) {
          const sev = cl((lvl - WITHDRAWAL_THRESHOLD) / (100 - WITHDRAWAL_THRESHOLD), 0, 1);
          if (sev > worstSeverity) worstSeverity = sev;
          withdrawingFrom.push(key);
        }
      }
      body.addiction = addiction;

      // Overdose toxicity clears while sober (ODSPAM.1) — so the kill comes from RAPID repeat
      // dosing within a session, not doses spread out across the day.
      if (body.odLoad > 0) body.odLoad = Math.max(0, body.odLoad - OD_LOAD_DECAY);

      let mood = girl.mood;
      let escape = girl.escape;
      const wasWithdrawing = !!(girl.body && girl.body.withdrawalState && girl.body.withdrawalState.severity > 0);

      if (worstSeverity > 0) {
        body.withdrawalState = { drugs: withdrawingFrom, severity: +worstSeverity.toFixed(2) };
        // Withdrawal hits MOOD + STATS but is NEVER a killer (Gee 2026-06-18): it does NOT
        // touch health (the death/survival bar — owned by lifespan/starvation). It only
        // drains stamina (a recoverable stat) so dope-sickness saps her without risking death.
        body.stamina = cl((body.stamina ?? 70) - 2 * worstSeverity, 0, body.health ?? 100);
        // Mood crash via moodPressure (action-effects banded ladder reads it).
        mood = { ...girl.mood, moodPressure: cl((girl.mood?.moodPressure || 0) - 4 * worstSeverity, -60, 60) };
        // Escape-risk spike — agitated, desperate, scanning for a way out / a fix.
        escape = { ...(girl.escape || { currentRisk: 0.1, factors: {}, lastAttempt: null }) };
        escape.currentRisk = cl((escape.currentRisk ?? 0.1) + 0.03 * worstSeverity, 0, 1);
        if (!wasWithdrawing && window.DMTHNotify) {
          window.DMTHNotify.show(`🤢 ${girl.name} is going into withdrawal from ${withdrawingFrom.join(', ')} — dose her to keep her pliable, or let her get dope-sick and desperate.`, { type: 'error', durationMs: 7000 });
        }
      } else if (body.withdrawalState) {
        body.withdrawalState = null;   // null (not delete) so deepMerge actually clears it
      }

      window.DMTHGame.state.updateGirl(girl.id, { body, mood, escape });
    }
  }

  // Per-girl addiction summary (UI / voice). Returns [{ drug, level }] with level > 0.
  function addictionState(girl) {
    const a = (girl && girl.body && girl.body.addiction) || {};
    return Object.entries(a).filter(([, v]) => v > 0).map(([drug, v]) => ({ drug, level: Math.round(v) }));
  }
  // Current withdrawal state ({ drugs, severity } | null).
  function withdrawalState(girl) { return (girl && girl.body && girl.body.withdrawalState) || null; }

  // Offer/share drug (user-initiated, consent-flavored)
  function offer(girlId, drugKey) {
    return administer(girlId, drugKey, { forFree: false });
  }

  // Get a readable remaining-time summary
  function summarize(girl) {
    const active = Array.isArray(girl.body?.activeDrugs) ? girl.body.activeDrugs : [];
    const now = Date.now();
    return active.filter(d => typeof d === 'object' && d.wearOffAt > now).map(d => ({
      name: d.name,
      mag: Math.round(curveMagnitude(d, now)),
      remainingMin: Math.max(0, Math.round((d.wearOffAt - now) / 60000))
    }));
  }

  // Inventory-item id → drug curve key (reverse of DRUG_CURVES.itemId). Used by the supply
  // pool + the room "stock drugs" control so a stocked drug ITEM maps to a self-serve curve.
  const ITEM_TO_DRUG = (() => { const m = {}; for (const k of Object.keys(DRUG_CURVES)) { if (DRUG_CURVES[k].itemId) m[DRUG_CURVES[k].itemId] = k; } return m; })();

  // DRUG-SELFSERVE.1 — captives passively self-dose from their hold / the dungeon drug pool to
  // stave off withdrawal and stay functional. They PACE themselves: a self-dose never stacks
  // toxicity and never ODs (selfServe flag) — only the player force-dosing can kill her. One
  // maintenance dose per needy girl per tick, drawn from supply.
  function tickSelfServe() {
    const s = window.DMTHGame.state.current;
    if (!s || !window.DMTHGame.supply) return;
    for (const girl of s.roster || []) {
      if (girl.encounterState !== 'captive') continue;
      const add = girl.body?.addiction || {};
      const activeNames = (girl.body?.activeDrugs || []).map(d => d.name || d);
      // A drug she's hooked on (past the withdrawal threshold) and isn't currently riding.
      const needKey = Object.keys(add).find(k => (add[k] || 0) >= WITHDRAWAL_THRESHOLD && DRUG_CURVES[k] && !activeNames.includes(k));
      if (!needKey) continue;
      const drawn = window.DMTHGame.supply.drawDrug(girl, needKey);   // prefer her drug, else any
      if (!drawn) continue;
      const curveKey = DRUG_CURVES[drawn] ? drawn : ITEM_TO_DRUG[drawn];
      if (!curveKey || !DRUG_CURVES[curveKey]) continue;
      try { administer(girl.id, curveKey, { forFree: true, selfServe: true }); } catch (e) { /* non-fatal */ }
    }
  }

  // DRUGUSE.1 — drug use-case taxonomy. Drives the "wide range of use cases" — knockout drugs put
  // her under (manage anyone), docile drugs calm fighters (escape-risk already drops on administer),
  // stimulants loosen tongues (a mute talks — see the DRUG×AFFECT OVERRIDE prompt block). All three
  // already have mechanical hooks (knockout via isUnconscious; docile via instant.escapeRisk;
  // stimulant via speechEffect + the prompt rule). This map exposes the intent for UI/tooltips.
  const DRUG_USE_CASE = Object.freeze({
    coke: 'stimulant', mdma: 'stimulant',
    weed: 'docile', whiskey: 'docile', alcohol: 'docile', acid: 'docile',
    ketamine: 'knockout', tranquilizer: 'knockout', chloroform: 'knockout', ether: 'knockout', rohypnol: 'knockout'
  });
  function useCaseOf(drugKey) { return DRUG_USE_CASE[drugKey] || 'stimulant'; }

  window.DMTHGame = window.DMTHGame || {};
  window.DMTHGame.drugs = Object.freeze({
    DRUG_CURVES, ADDICTIVENESS, ITEM_TO_DRUG, DRUG_USE_CASE, useCaseOf, administer, offer, currentEffect, tickAll, tickSelfServe, summarize,
    isUnconscious, unconsciousRemainingMs, addictionState, withdrawalState
  });
})();
