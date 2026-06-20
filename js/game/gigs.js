// DUNGEON MASTER: THE HUNT — shady time-passing gigs .
// "where time passes for action and you can que them up before starting the actions and earn
// money or steal items or break i nplaces". The shady money loop that ISN'T films/johns/sharks: a
// menagerie of street hustles + heists you QUEUE up, then RUN — each burns real game-time (the
// ACTIONTIME clock advances + the world reconciles), pays cash into the vault, maybe rips off stolen
// goods, and stacks WANTED heat scaled to how brazen the job is. Queue lives in state.gigQueue[].

(function () {
  'use strict';

  // The hustles — brutal/seedy, escalating cash + loot + heat + game-time + level gate. `pay` is the
  // cash range; `lootChance`/`lootTier` = odds + max tier of a stolen item; `wanted` = heat per run;
  // `min` = game-minutes the job eats; `levelReq` = DEPRAVITY level to unlock it.
  const GIGS = Object.freeze({
    'roll-a-drunk':    { name: '🔪 Roll a drunk',            min: 60,  pay: [40, 120],     lootChance: 0.15, lootTier: 1, wanted: 1.5, levelReq: 0, notes: 'Jump some staggering mark in an alley, lift his wallet + whatever\'s in his pockets. Quick, cheap, low heat.' },
    'snatch-and-grab': { name: '👜 Snatch-and-grab',         min: 90,  pay: [60, 180],     lootChance: 0.30, lootTier: 1, wanted: 2.5, levelReq: 0, notes: 'Yank a purse / smash a car window. Fast cash, a little heat.' },
    'break-in':        { name: '🪟 Break into a house',      min: 240, pay: [150, 400],    lootChance: 0.65, lootTier: 2, wanted: 4,   levelReq: 1, notes: 'Crack an empty house, strip it of anything worth fencing. Good odds on stolen gear.' },
    'liquor-store':    { name: '🏪 Stick up a liquor store', min: 180, pay: [220, 550],    lootChance: 0.30, lootTier: 1, wanted: 6,   levelReq: 2, notes: 'Wave iron at the night clerk, clean the till. Solid cash, real heat.' },
    'pharmacy':        { name: '💊 Knock over a pharmacy',   min: 300, pay: [150, 350],    lootChance: 0.85, lootTier: 3, wanted: 7,   levelReq: 3, lootBias: 'drugs', notes: 'Smash the pharmacy after close — chems + supplies by the armful. Heavy on stolen drugs.' },
    'crack-a-warehouse':{ name: '📦 Crack a warehouse',      min: 480, pay: [400, 900],    lootChance: 0.90, lootTier: 4, wanted: 10,  levelReq: 5, notes: 'An overnight job on a supply warehouse — tools, toys, equipment by the crate. Big haul, big heat.' },
    'armored-truck':   { name: '🚚 Hit an armored truck',    min: 600, pay: [1800, 4500],  lootChance: 0.50, lootTier: 4, wanted: 18,  levelReq: 7, notes: 'The big score. Take down a cash truck — a fortune, and the law comes down HARD.' },
    'kidnap-a-girl':   { name: '🎯 Kidnap a fresh girl',     min: 360, pay: [0, 60],       lootChance: 0,    lootTier: 1, wanted: 9,   levelReq: 4, capturesGirl: true, notes: 'Grab a new girl off the street. BRING A TRAINED CREW GIRL — she lures + helps subdue, hugely raising the odds you drag a fresh captive home to a free hold. The payoff is a NEW captive, not cash.' }
  });

  function level() { return window.DMTHGame.progression ? window.DMTHGame.progression.getLevel() : 1; }
  function cheat() { return window.DMTHGame.progression ? window.DMTHGame.progression.isCheatUnlocked() : false; }
  function unlocked(id) { const g = GIGS[id]; return !!g && (cheat() || level() >= (g.levelReq || 0)); }

  function queue() {
    const s = window.DMTHGame.state.current;
    return (s && Array.isArray(s.gigQueue)) ? s.gigQueue : [];
  }
  function enqueue(id) {
    if (!GIGS[id]) return { ok: false, reason: 'no such job' };
    if (!unlocked(id)) return { ok: false, reason: `locked — reach DEPRAVITY level ${GIGS[id].levelReq}` };
    if (queue().length >= 8) return { ok: false, reason: 'queue is full (8 jobs) — run it first' };
    window.DMTHGame.state.pushGig(id);
    return { ok: true };
  }
  function dequeue(idx) { window.DMTHGame.state.removeGigAt(idx); return { ok: true }; }
  function clear() { window.DMTHGame.state.clearGigs(); return { ok: true }; }

  function rint(a, b) { return a + Math.floor(Math.random() * (b - a + 1)); }
  // Pick a stealable item of tier ≤ cap (optionally biased to a subcategory) from the catalog.
  function pickLoot(cap, bias) {
    const items = (window.DMTHAssets && window.DMTHAssets.ITEMS) || [];
    // gig stolen-goods drop through the ONE unified loot picker (loot.pickLootByTier:
    // tier pools + category-rarity weighting), same as capture / scavenge / NPC gifts. A subcategory
    // lootBias ('drugs' on the pharmacy job) is converted to that subcat's item-ids for the picker's
    // bias. Falls back to a raw tier filter only if loot.js isn't loaded.
    const L = window.DMTHGame.loot;
    if (L && L.pickLootByTier) {
      const biasIds = bias ? items.filter(i => i.subcategory === bias).map(i => i.id) : null;
      const id = L.pickLootByTier(cap, biasIds);
      if (id) return items.find(i => i.id === id) || { id, displayName: id };
    }
    let pool = items.filter(i => (i.tier || 0) >= 1 && (i.tier || 0) <= cap);
    if (bias) { const b = pool.filter(i => i.subcategory === bias); if (b.length) pool = b; }
    if (!pool.length) return null;
    return pool[Math.floor(Math.random() * pool.length)];
  }

  // Run the WHOLE queue: each job in order burns its game-time (clock advances + the world reconciles
  // the skipped span), pays cash to the vault, maybe rips off a stolen item, and stacks WANTED. Then
  // the queue clears. Returns a summary the UI shows.
  // drag a fresh girl off the street into a free hold (the kidnap gig's payoff).
  function captureFreshGirl() {
    const G = window.DMTHGame;
    if (!G.girlGen || !G.hunt || !G.hunt.escortToHold) return null;
    const arches = Object.keys(G.girlGen.ARCHETYPE_POOLS || {});
    if (!arches.length) return null;
    const arche = arches[Math.floor(Math.random() * arches.length)];
    const seed = Math.floor(Math.random() * 1e9);
    try {
      const girl = G.girlGen.generate(arche, seed, {});
      G.hunt.escortToHold(girl, G.state.current.settings.activeDungeonId);   // throws if no free hold
      return girl.name || 'a fresh girl';
    } catch (e) { return null; }   // no free hold / gen failure → she got away
  }

  // run the WHOLE queue, optionally with a TRAINED CAPTIVE as crew. Her Stockholm level
  // (the "range of girl levels") scales pay + loot + the kidnap odds; a HALF-trained one (bond < 3)
  // can BOLT mid-job (flees, frees her hold) — "they are trained, sort of". Each job still burns its
  // game-time + reconciles the world. The kidnap gig brings home a NEW captive instead of cash.
  function runQueue(crewGirlId) {
    const q = queue().slice();
    if (!q.length) return { ok: false, reason: 'nothing queued — line up some jobs first' };
    let crew = crewGirlId ? window.DMTHGame.state.getGirl(crewGirlId) : null;
    if (crew && crew.encounterState !== 'captive') crew = null;
    const crewBond = crew ? Math.max(0, Math.min(9, (crew.bond && crew.bond.bondLevel) || 0)) : -1;
    const crewPayMul = crew ? (1 + crewBond * 0.06) : 1;       // L9 crew ≈ +54% pay
    const crewLootBonus = crew ? crewBond * 0.04 : 0;          // + up to +36% loot odds
    let crewFled = false;

    let cash = 0; const stolen = []; const captured = []; let heat = 0; let totalMin = 0; let done = 0;
    for (const id of q) {
      const g = GIGS[id];
      if (!g) continue;
      // time passes for the job — advance the clock + reconcile the world for the skipped span.
      if (window.DMTHGame.gameClock && window.DMTHGame.gameClock.advanceBy) {
        window.DMTHGame.gameClock.advanceBy(g.min);
        if (window.DMTHGame.tick && window.DMTHGame.tick.reconcileSpan) window.DMTHGame.tick.reconcileSpan(g.min);
      }
      totalMin += g.min;

      // half-trained crew (bond < 3) can bolt mid-job — she frees herself + the run loses her.
      if (crew && !crewFled && crewBond < 3 && Math.random() < (0.12 - crewBond * 0.03)) {
        crewFled = true;
        const d = window.DMTHGame.state.getDungeon(crew.assignedDungeonId);
        if (d) { const nh = (d.holds || []).map(h => h.captiveGirlId === crew.id ? { ...h, captiveGirlId: null } : h); window.DMTHGame.state.updateDungeon(d.id, { holds: nh }); }
        window.DMTHGame.state.updateGirl(crew.id, { encounterState: 'escaped', assignedDungeonId: null, assignedHoldIdx: null, escape: { ...(crew.escape || {}), currentRisk: 1, escapedAt: Date.now(), escapedFrom: 'gig-bolt' } });
        if (window.DMTHGame.wanted) { window.DMTHGame.wanted.accrue('escape'); heat += 6; }
        if (window.DMTHNotify) window.DMTHNotify.show(`🏃 ${crew.name} wasn't broken enough — she bolted mid-job and got loose. Should've trained her harder before bringing her along.`, { type: 'error', durationMs: 7000 });
      }
      const liveCrew = crew && !crewFled;

      if (g.capturesGirl) {
        // kidnap: a trained crew girl lures + helps subdue → far better odds of dragging one home.
        const cap = 0.30 + (liveCrew ? 0.40 + crewBond * 0.03 : 0);
        if (Math.random() < cap) {
          const name = captureFreshGirl();
          if (name) captured.push(name);
          else if (window.DMTHNotify) window.DMTHNotify.show('🎯 Grabbed one — but every hold is full. She slipped loose with nowhere to put her. Free up a hold.', { type: 'warn', durationMs: 6000 });
        }
        const tip = rint(g.pay[0], g.pay[1]); if (tip > 0) { cash += tip; window.DMTHGame.state.addMoney(tip, `hustle:${id}`); }
      } else {
        const got = Math.round(rint(g.pay[0], g.pay[1]) * (liveCrew ? crewPayMul : 1));
        cash += got;
        window.DMTHGame.state.addMoney(got, `hustle:${id}`);
        if (Math.random() < ((g.lootChance || 0) + (liveCrew ? crewLootBonus : 0))) {
          const it = pickLoot(g.lootTier || 1, g.lootBias);
          if (it) { window.DMTHGame.state.addItem(it.id, 1); stolen.push(it.displayName || it.id); }
        }
      }
      if (g.wanted && window.DMTHGame.wanted) { window.DMTHGame.wanted.accrue(g.wanted); heat += g.wanted; }
      done++;
    }
    window.DMTHGame.state.clearGigs();
    const dur = window.DMTHGame.gameClock && window.DMTHGame.gameClock.formatDuration ? window.DMTHGame.gameClock.formatDuration(totalMin) : `${totalMin} min`;
    if (window.DMTHNotify) {
      const bits = [`pocketed $${cash.toLocaleString()}`];
      if (captured.length) bits.push(`dragged home ${captured.length} new captive${captured.length === 1 ? '' : 's'} (${captured.join(', ')})`);
      if (stolen.length) bits.push(`lifted ${stolen.length} item${stolen.length === 1 ? '' : 's'}`);
      if (heat > 0) bits.push(`+${Math.round(heat)} WANTED`);
      window.DMTHNotify.show(`💰 Ran ${done} job${done === 1 ? '' : 's'} (${dur})${crew && !crewFled ? ` with ${crew.name} as crew` : ''} — ${bits.join(', ')}.`, { type: heat >= 15 ? 'error' : 'success', durationMs: 8000 });
    }
    return { ok: true, jobs: done, cash, stolen, captured, heat: Math.round(heat), gameMin: totalMin, crewFled };
  }

  function listForDisplay() {
    return Object.entries(GIGS).map(([id, g]) => ({
      id, name: g.name, notes: g.notes, min: g.min, pay: g.pay,
      lootChance: g.lootChance, lootTier: g.lootTier, wanted: g.wanted,
      levelReq: g.levelReq, unlocked: unlocked(id)
    }));
  }

  window.DMTHGame = window.DMTHGame || {};
  window.DMTHGame.gigs = Object.freeze({ GIGS, queue, enqueue, dequeue, clear, runQueue, listForDisplay, unlocked });
})();
