// DUNGEON MASTER: THE HUNT — girl lifespan system.
// Days-captive tracking, physical/mental degradation from neglect, terminal states, slow game-time aging.

(function () {
  'use strict';

  const TICK_MS = 30_000;                        // matches tick.js interval
  const REAL_MS_PER_GAME_DAY = 30 * 60_000;       // 30 real minutes = 1 in-game day
  const AGING_REAL_MS_PER_GAME_YEAR = 30 * 24 * 60 * 60 * 1000; // slow — 30 real days = 1 in-game year

  // Corpse usability window (CORPSE-TIMER.1) — game minutes since death. The decay timer
  // starts the instant the corpse is made; you've got ~5 game days to make money off the body,
  // FRESH paying the most and NEAR-ROTTEN very little (whore-out necro multiplier scales down
  // with decayDays). Past the limit it's a maggot-infested mess no one wants — the UI nudges
  // disposal and a body left to rot bleeds passive WANTED. (No auto-disposal — player picks a method.)
  const POSTMORTEM_DECAY_LIMIT = 5 * 1440;

  // Lifespan states in order of severity
  const STATES = {
    healthy:    { label: '💚 Healthy',      penaltyPerTick: { bondDebt: 0 } },
    strained:   { label: '💛 Strained',     penaltyPerTick: { bondDebt: 1 } },
    breaking:   { label: '🟠 Breaking',     penaltyPerTick: { bondDebt: 2, bruises: 0.3 } },
    terminal:   { label: '🔴 Terminal',     penaltyPerTick: { bondDebt: 3, bruises: 0.5 } },
    'mentally-broken': { label: '💀 Mentally broken beyond repair', penaltyPerTick: { bondDebt: 5 } },
    'died-of-neglect': { label: '☠️ Died of neglect', penaltyPerTick: {} },
    'aged-out':        { label: '⏳ Aged out of usefulness', penaltyPerTick: {} }
  };

  // Compute days captive from captureDate
  function daysCaptive(girl) {
    if (!girl.captureDate) return 0;
    return Math.floor((Date.now() - girl.captureDate) / REAL_MS_PER_GAME_DAY);
  }

  // Compute current in-game age based on real-time elapsed since girl was created
  function currentAge(girl) {
    const ageOffset = girl.age || 22;
    if (!girl.captureDate) return ageOffset;
    const yearsElapsed = (Date.now() - girl.captureDate) / AGING_REAL_MS_PER_GAME_YEAR;
    return Math.floor(ageOffset + yearsElapsed);
  }

  // Lifespan state is DERIVED from body.health + body.stamina rather than tracked as a
  // separate scalar that drifted independently. The prior independent-scalar design showed
  // "Terminal" popups while the girl's HP bar still read 100% — the lifespan.score crashed
  // within ~20 ticks even when the player was feeding her and her body.health was untouched.
  //
  // New design: lifespan.state is a UX label for the composite body vital. body.health is
  // the authoritative number (drained by tickStaminaHealth in action-effects.js, restored
  // by heal/feed/water actions). Lifespan only labels it and applies soft per-state effects.
  function vitalScore(girl) {
    const health = girl.body?.health ?? 100;
    const stamina = girl.body?.stamina ?? 70;
    // 70% weight on health, 30% on stamina — stamina compounds neglect but doesn't dominate.
    return Math.round(health * 0.7 + stamina * 0.3);
  }

  // Kept as the public API for any caller that wanted a raw careScore — but now reflects
  // vital direction (positive = recovering, negative = strained). Caller code should
  // prefer `vitalScore` or the lifespan.score field directly.
  function careScore(girl) {
    const v = vitalScore(girl);
    // Map vital score to a small delta sign for legacy callers — same range as before.
    if (v >= 80) return 2;
    if (v >= 60) return 1;
    if (v >= 40) return 0;
    if (v >= 20) return -2;
    return -4;
  }

  // Evaluate lifespan state per girl — called every tick for both captive (alive) and
  // dead (postmortem) state. For dead bodies, skip the body-vital re-evaluation and just
  // tick the decay accumulator forward.
  function evaluate(girl) {
    if (!girl) return null;
    // Dead-body decay-only branch — no vital re-evaluation.
    if (girl.encounterState === 'dead') {
      // Death dossier backstop (DEATHSTATS.1) — catches a death from ANY path that didn't
      // already build the record (idempotent). Fires the popup + saves her final snapshot.
      if (window.DMTHGame.death && !girl.deathRecord) {
        window.DMTHGame.death.ensureDeathRecord(girl.id, girl.deceasedCause);
      }
      if (girl.body?.diedAt == null) return null;
      const newDecay = (girl.body.decayedMinutes || 0) + 30;
      const patch = { body: { ...girl.body, decayedMinutes: newDecay } };
      if (newDecay >= POSTMORTEM_DECAY_LIMIT && (girl.body.decayedMinutes || 0) < POSTMORTEM_DECAY_LIMIT) {
        if (window.DMTHNotify) {
          window.DMTHNotify.show(`☠️ ${girl.name}'s body has decayed past usability — dispose now or the smell draws attention.`, { type: 'error', durationMs: 8000 });
        }
      }
      // A body left to rot past the limit is evidence — passive WANTED accrual every tick it
      // sits. The longer you leave a corpse, the more the neighbors notice.
      if (newDecay >= POSTMORTEM_DECAY_LIMIT && window.DMTHGame.wanted) {
        window.DMTHGame.wanted.accrue('decay-discovery');
      }
      window.DMTHGame.state.updateGirl(girl.id, patch);
      return null;
    }
    if (girl.encounterState !== 'captive') return null;
    let lifespan = girl.lifespan || { state: 'healthy', score: 100, ageAtCapture: girl.age || 22 };

    // State derives directly from body vital. No independent scalar drift.
    const v = vitalScore(girl);
    lifespan.score = v;

    const prev = lifespan.state;
    if      (v >= 60) lifespan.state = 'healthy';
    else if (v >= 40) lifespan.state = 'strained';
    else if (v >= 20) lifespan.state = 'breaking';
    else if (v > 0)   lifespan.state = 'terminal';
    else              lifespan.state = girl.bond?.bondLevel >= 5 ? 'mentally-broken' : 'died-of-neglect';

    // Terminal aging — very long captivity with low care
    const dc = daysCaptive(girl);
    if (dc > 365 && lifespan.score < 30) {
      lifespan.state = 'aged-out';
    }

    lifespan.daysCaptive = dc;
    lifespan.currentAge  = currentAge(girl);

    // Apply per-tick penalty
    const penalty = STATES[lifespan.state]?.penaltyPerTick || {};
    const patch = { lifespan };
    if (penalty.bondDebt) {
      patch.bond = { ...girl.bond, bondDebt: (girl.bond?.bondDebt || 0) + penalty.bondDebt };
    }
    if (penalty.bruises) {
      patch.body = { ...girl.body, bruises: Math.min(99, (girl.body?.bruises || 0) + Math.ceil(penalty.bruises)) };
    }

    // Terminal / dead → encounterState flip. Body STAYS in the hold (postmortem use
    // continues) until forced disposal at body.decayedMinutes >= POSTMORTEM_DECAY_LIMIT
    // OR the player manually disposes via #dispose. The hold is no longer freed at
    // time-of-death; freeing happens on disposal. Disposal log entry is also deferred to
    // disposal-time so the disposals ledger reflects player-initiated removals, not the
    // moment-of-death itself.
    // DEATH (neglect / aged-out) → corpse. Body STAYS in the hold for postmortem use until
    // disposal. MENTAL BREAK is handled separately below — she stays a live captive.
    if (['died-of-neglect', 'aged-out'].includes(lifespan.state)) {
      if (!girl.lifespan || !['died-of-neglect', 'aged-out'].includes(girl.lifespan.state)) {
        patch.encounterState = 'dead';
        patch.deceasedAt = Date.now();
        patch.deceasedCause = lifespan.state;
        // Stamp game-minutes time-of-death on body for postmortem decay tracking.
        if (window.DMTHGame.gameClock) {
          patch.body = { ...(patch.body || girl.body || {}), diedAt: window.DMTHGame.gameClock.now(), decayedMinutes: 0 };
        }
        // BUZZ hit — captive deaths suppress underground demand. Word spreads that the
        // operator can't keep his girls alive, clients pull back.
        if (window.DMTHGame.state.addBuzz) {
          window.DMTHGame.state.addBuzz(-3, `captive-died: ${lifespan.state}`);
        }
        // A body to account for — death raises WANTED. Disposing of it cleanly mitigates
        // later; leaving it to rot past the decay limit adds passive heat (decay-discovery).
        if (window.DMTHGame.wanted) window.DMTHGame.wanted.accrue('captive-death');
        if (window.DMTHNotify) {
          window.DMTHNotify.show(`☠️ ${girl.name} died of neglect — body remains in her hold for postmortem use until disposal.`, { type: 'error', durationMs: 6000 });
        }
      }
    } else if (lifespan.state === 'mentally-broken') {
      // Mind gone, body ALIVE. She stays a captive — fully interactable, whoreable, and
      // disposable — just catatonic/broken, never recovering her mind. This replaces the old
      // `encounterState: 'broken'` phantom state that nothing downstream handled (soft-lock).
      if (girl.mind !== 'broken') {
        patch.mind = 'broken';
        patch.mood = { mood: 'broken', moodEmoji: '😵', history: [...(girl.mood?.history || []), { shift: 'mentally-broken', ts: Date.now() }] };
        if (window.DMTHNotify) {
          window.DMTHNotify.show(`💀 ${girl.name} broke beyond repair — her mind is gone, her body is still yours.`, { type: 'error', durationMs: 6000 });
        }
      }
    }

    window.DMTHGame.state.updateGirl(girl.id, patch);

    // Notify on state transitions
    if (prev !== lifespan.state && window.DMTHNotify) {
      window.DMTHNotify.show(`${girl.name}: ${STATES[lifespan.state].label}`, { type: lifespan.score < 30 ? 'error' : 'info' });
    }
    return lifespan;
  }

  function tickAll() {
    const s = window.DMTHGame.state.current;
    if (!s) return;
    for (const girl of s.roster || []) {
      // Alive captives go through full lifespan evaluation. Dead bodies just tick decay
      // forward via the dead-branch in evaluate() — no body-vital changes apply.
      if (girl.encounterState !== 'captive' && girl.encounterState !== 'dead') continue;
      evaluate(girl);
    }
  }

  function describeLifespan(girl) {
    const ls = girl.lifespan || { state: 'healthy', score: 100 };
    const dc = ls.daysCaptive != null ? ls.daysCaptive : daysCaptive(girl);
    const age = ls.currentAge != null ? ls.currentAge : currentAge(girl);
    return {
      state: ls.state,
      label: STATES[ls.state]?.label || ls.state,
      score: ls.score,
      daysCaptive: dc,
      currentAge: age
    };
  }

  // ---- SNUFF (deliberate kill → corpse) ----
  // A myriad of ways to do the deed, quick → slow & methodical, each its own sexually-taboo
  // act. Filmed or not. The result is always a CORPSE in her hold (postmortem use until
  // disposal — distinct from disposal, which removes her). corpse = the visible cause marker
  // the image pipeline renders on the body (imaging.postmortemTokens). 18+ fiction.
  const SNUFF_METHODS = Object.freeze({
    'choke-fuck':       { displayName: 'Strangle Her Mid-Fuck',     emoji: '🤲', speed: 'slow',  xp: 16, wanted: 5, filmBase: 1100, corpse: 'choked',       notes: 'Erotic asphyxiation taken all the way — choke the life out of her while buried inside her. Slow, intimate, vile.' },
    'cock-suffocate':   { displayName: 'Suffocate on His Cock',     emoji: '👄', speed: 'slow',  xp: 15, wanted: 4, filmBase: 1000, corpse: 'choked',       notes: 'Hold her down on his cock until she stops struggling — throat-fucked to death.' },
    'slit-throat':      { displayName: 'Slit Her Throat Mid-Thrust',emoji: '🔪', speed: 'quick', xp: 14, wanted: 6, filmBase: 1200, corpse: 'bloody-throat',notes: 'One deep cut while she rides — fast, bloody, over in seconds.' },
    'hotshot':          { displayName: 'Lethal Hotshot',            emoji: '💉', speed: 'quick', xp: 12, wanted: 4, filmBase: 900,  corpse: 'peaceful',     notes: 'A hotshot mid-scene — she nods off and never wakes. Quick, almost gentle.' },
    'drown-bath':       { displayName: 'Drown Her in the Bath',     emoji: '🛁', speed: 'slow',  xp: 15, wanted: 4, filmBase: 1000, corpse: 'drowned',      notes: 'Hold her under during a bath — slow, watching the bubbles stop.' },
    'beat-to-death':    { displayName: 'Beat Her to Death',         emoji: '💀', speed: 'slow',  xp: 14, wanted: 7, filmBase: 1100, corpse: 'beaten',       notes: 'Fists and boots until she stops moving. Slow, brutal, messy.' },
    'breed-then-bleed': { displayName: 'Breed Her, Then Bleed Her', emoji: '🩸', speed: 'slow',  xp: 18, wanted: 7, filmBase: 1400, corpse: 'bled-out',     notes: 'Pump her full, then open her up and let her bleed out slow while it leaks. The most methodical and depraved.' },
    'snap-neck':        { displayName: 'Snap Her Neck',             emoji: '🦴', speed: 'quick', xp: 11, wanted: 5, filmBase: 800,  corpse: 'broken-neck',  notes: 'One sharp twist from behind mid-fuck. Instant.' },
    // ── more demented chamber-grade kills (the worse, the better) ──
    'gut-her':          { displayName: 'Disembowel Her Slow',       emoji: '🔪', speed: 'slow',  xp: 22, wanted: 9, filmBase: 1700, corpse: 'gutted',       notes: 'Open her belly and keep fucking her while she watches her own insides spill into her lap. The vilest, slowest end.' },
    'flay':             { displayName: 'Flay Her Alive',            emoji: '🩸', speed: 'slow',  xp: 20, wanted: 8, filmBase: 1600, corpse: 'flayed',       notes: 'Peel her skin off in sheets while she screams herself hoarse, then let the shock take her.' },
    'impale':           { displayName: 'Impale Her',                emoji: '🪓', speed: 'slow',  xp: 19, wanted: 8, filmBase: 1500, corpse: 'impaled',      notes: 'Mount her, alive, on a stake through the worst place — gravity does the rest over long minutes.' },
    'piston-death':     { displayName: 'Fuck Her to Death',         emoji: '🛠️', speed: 'slow',  xp: 16, wanted: 5, filmBase: 1300, corpse: 'peaceful',     notes: 'Strap her to the machine and leave it railing every hole on max until her heart simply quits.' },
    'speedball':        { displayName: 'Lethal Speedball',          emoji: '💉', speed: 'quick', xp: 13, wanted: 4, filmBase: 1000, corpse: 'peaceful',     notes: 'A speedball slammed mid-orgasm — she cums, seizes, and flatlines with the smile still on her face.' },
    'crush-skull':      { displayName: 'Crush Her Skull',           emoji: '🔨', speed: 'quick', xp: 12, wanted: 7, filmBase: 900,  corpse: 'beaten',       notes: 'One boot, one cinderblock, done. Fast and final and very messy.' }
  });

  function snuffKill(girlId, methodId, opts = {}) {
    const girl = window.DMTHGame.state.getGirl(girlId);
    if (!girl) return { ok: false, reason: 'no such girl' };
    if (girl.encounterState !== 'captive') return { ok: false, reason: 'only a living captive can be snuffed' };
    const m = SNUFF_METHODS[methodId];
    if (!m) return { ok: false, reason: 'unknown snuff method' };
    // DEPRAVITY gate (mirrors the room UI gate as an engine backstop).
    if (window.DMTHGame.progression && !window.DMTHGame.progression.isUnlocked('snuff')) {
      return { ok: false, reason: `snuff is locked — reach DEPRAVITY level ${window.DMTHGame.progression.requiredLevel('snuff')}` };
    }

    // Filmed snuff records a premium reel BEFORE she's flipped to a corpse (film.startRecording
    // requires a living captive). Unfilmed just makes the corpse.
    let filmId = null;
    if (opts.filmed && window.DMTHGame.film) {
      try {
        window.DMTHGame.film.startRecording(girlId, ['snuff', 'extreme-pain', 'finalization', m.speed]);
        window.DMTHGame.state.appendTurn(girlId, 'user', `*${m.displayName.toLowerCase()} — on camera*`);
        const film = window.DMTHGame.film.stopRecording({ title: `${girl.name}: ${m.displayName}`, basePrice: m.filmBase });
        filmId = film?.id || null;
      } catch (e) { /* filming failed — still make the corpse */ }
    }

    window.DMTHGame.state.updateGirl(girlId, {
      encounterState: 'dead',
      deceasedAt: Date.now(),
      deceasedCause: (opts.filmed ? 'snuff-filmed:' : 'snuff:') + methodId,
      body: { ...girl.body, diedAt: window.DMTHGame.gameClock?.now?.() ?? 0, decayedMinutes: 0, corpseMarker: m.corpse }
    });
    if (window.DMTHGame.death) window.DMTHGame.death.ensureDeathRecord(girlId, (opts.filmed ? 'snuff-filmed:' : 'snuff:') + methodId);
    if (window.DMTHGame.state.addBuzz) window.DMTHGame.state.addBuzz(opts.filmed ? -1 : -3, 'snuff:' + methodId);
    if (window.DMTHGame.wanted) window.DMTHGame.wanted.accrue('captive-death');
    if (window.DMTHGame.progression) window.DMTHGame.progression.grantXp(m.xp + (opts.filmed ? 4 : 0), 'snuff:' + methodId);
    if (window.DMTHNotify) window.DMTHNotify.show(`☠️ ${girl.name} — ${m.displayName}${opts.filmed ? ' (premium snuff film listed)' : ''}. Her body's in the hold for postmortem use until you dispose of it.`, { type: 'error', durationMs: 7000 });
    return { ok: true, methodId, filmed: !!opts.filmed, filmId };
  }

  // ---- DEATH DURING AN ACT (FRIENDKILL.1 / SNUFFBONUS.1 / DEATHBAL.1) ----
  // The lethal-finish path shared by the player's extreme acts, johns, and "friends". Flips a
  // living captive to a corpse, stamps cause + corpse marker, builds the death record, and
  // returns a SNUFF BONUS payout the caller credits to the right pocket (player wallet / john
  // earnings). GATE (Gee): callers only fire this when the act's damage would cross her death
  // floor (her remaining health <= the act's debuff) — so a managed, healed, robust girl is
  // never low enough for a normal act to kill her. Death is a risk you manage, not attrition.
  function killDuringAct(girlId, opts = {}) {
    const girl = window.DMTHGame.state.getGirl(girlId);
    if (!girl || girl.encounterState !== 'captive') return { ok: false, reason: 'not a living captive' };
    const cause = opts.cause || 'killed-during-act';
    const corpse = opts.corpse || 'bled-out';
    window.DMTHGame.state.updateGirl(girlId, {
      encounterState: 'dead',
      deceasedAt: Date.now(),
      deceasedCause: cause,
      body: { ...girl.body, health: 0, diedAt: window.DMTHGame.gameClock?.now?.() ?? 0, decayedMinutes: 0, corpseMarker: corpse, recentActTag: 'beaten' }
    });
    if (window.DMTHGame.death) { try { window.DMTHGame.death.ensureDeathRecord(girlId, cause); } catch (e) { /* non-fatal */ } }
    // SNUFFBONUS.1 — a girl corpsing mid-act is PREMIUM content, not pure loss. Bonus scales with
    // bond (a trained/broken girl dying on camera sells for more) + a flat snuff premium.
    const bondLvl = girl.bond?.bondLevel || 0;
    const snuffBonus = Math.round((opts.baseBonus || 600) * (1 + bondLvl * 0.12));
    if (window.DMTHGame.state.addBuzz) window.DMTHGame.state.addBuzz(-2, 'act-death:' + cause);
    if (window.DMTHGame.wanted) window.DMTHGame.wanted.accrue('captive-death');
    if (window.DMTHGame.progression) window.DMTHGame.progression.grantXp(14, 'act-death');
    if (window.DMTHNotify) {
      window.DMTHNotify.show(`☠️ ${girl.name} died ${opts.byLabel ? 'under ' + opts.byLabel : 'mid-act'} — snuff content sells for +$${snuffBonus.toLocaleString()}. Her body stays in the hold for postmortem use until you dispose of it.`, { type: 'error', durationMs: 8000 });
    }
    return { ok: true, snuffBonus, cause, corpse };
  }

  window.DMTHGame = window.DMTHGame || {};
  window.DMTHGame.lifespan = Object.freeze({
    STATES, evaluate, tickAll, daysCaptive, currentAge, careScore, describeLifespan,
    TICK_MS, REAL_MS_PER_GAME_DAY, AGING_REAL_MS_PER_GAME_YEAR,
    POSTMORTEM_DECAY_LIMIT,
    SNUFF_METHODS, snuffKill, killDuringAct
  });
})();
