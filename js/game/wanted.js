// DUNGEON MASTER: THE HUNT — WANTED level. The heat axis.
// Every dark action feeds it; it decays slowly over time; at high tiers it triggers raids →
// fines → jail → GAME OVER (arrest system, Phase 2). Distinct from BUZZ (good underground
// rep that DRAWS johns) and the legacy `notoriety` soft stat. WANTED is pure liability:
// it only ever makes hunting harder and the law closer. 0-100 scalar in wallet.wanted.

(function () {
  'use strict';

  // Slow decay drift per tick. Stickier than notoriety (notorietyDecayPerTick 0.5) — heat
  // lingers. A careful operator who stops generating heat watches it bleed off across many
  // ticks; a sloppy one outpaces decay and climbs tiers.
  const DECAY_PER_TICK = 0.25;

  // Named accrual sources. Callers do DMTHGame.wanted.accrue('escape-ratted') so the
  // amounts live in one place and can be retuned without hunting through call sites.
  const ACCRUAL = Object.freeze({
    'botched-capture':      3,   // a grab that failed in the open
    'witnessed-capture':    6,   // a witness saw the grab
    'escape':               6,   // a captive is loose and on the run in public
    'escape-ratted':       14,   // she got away clean / aged out of the recovery window — she talks
    'captive-death':        5,   // a body to account for
    'sloppy-disposal':      8,   // low-isolation bury / botched body dump
    'clean-disposal':       1,   // even a careful removal leaves a trace
    'corpse-content-sale':  7,   // selling necro / postmortem content draws the worst heat
    'decay-discovery':      1,   // per-tick pressure from a rotting body left past the limit
    'release-low-bond':    12,   // letting a non-bonded captive walk — she rats
    'john-disgust':         4    // a john recoiled at something and talked
  });

  // Tier bands (ascending by `min`). Each carries the hunt-odds liability and the per-tick
  // raid chance the arrest system (Phase 2) reads. huntPenalty is SUBTRACTED from capture odds.
  const TIERS = Object.freeze([
    { min: 0,  key: 'off-radar',            label: 'Off the radar',        emoji: '🟢', huntPenalty: 0.00, raidChancePerTick: 0.000 },
    { min: 20, key: 'person-of-interest',   label: 'Person of interest',   emoji: '🟡', huntPenalty: 0.05, raidChancePerTick: 0.000 },
    { min: 40, key: 'active-investigation', label: 'Active investigation', emoji: '🟠', huntPenalty: 0.12, raidChancePerTick: 0.010 },
    { min: 60, key: 'wanted',               label: 'WANTED',               emoji: '🔴', huntPenalty: 0.20, raidChancePerTick: 0.040 },
    { min: 80, key: 'most-wanted',          label: 'MOST WANTED',          emoji: '🚨', huntPenalty: 0.30, raidChancePerTick: 0.100 }
  ]);

  function get() {
    const s = window.DMTHGame.state.current;
    return Math.max(0, Math.min(100, s?.wallet?.wanted || 0));
  }

  // Resolve the tier band for a level (defaults to current wanted).
  function tierFor(level) {
    const v = (level == null ? get() : level);
    let t = TIERS[0];
    for (const band of TIERS) if (v >= band.min) t = band;
    return t;
  }
  function tier() { return tierFor(get()); }

  // Apply a named accrual (or an explicit numeric amount). `mult` scales by context — e.g.
  // a corpse sale at deep decay, or a disposal at low dungeon isolation. Notifies on an
  // upward tier crossing so the player feels the heat climbing.
  function accrue(source, mult = 1) {
    const base = typeof source === 'number' ? source : (ACCRUAL[source] || 0);
    const amount = base * mult;
    if (!amount) return 0;
    const before = tierFor(get());
    if (window.DMTHGame.state.addWanted) window.DMTHGame.state.addWanted(amount, String(source));
    const after = tierFor(get());
    if (after.min > before.min && window.DMTHNotify) {
      window.DMTHNotify.show(
        `${after.emoji} WANTED rising — you are now: ${after.label} (${get()}/100)`,
        { type: after.min >= 60 ? 'error' : 'info', durationMs: 6000 }
      );
    }
    return amount;
  }

  // Hunt-odds liability — heat makes catching harder. Consumed by hunt.previewCaptureOdds.
  function huntPenalty() { return tier().huntPenalty; }

  // Per-tick raid chance for the arrest system (Phase 2). Lives here so the tier table is
  // the single source of truth for how dangerous each band is.
  function raidChancePerTick() { return tier().raidChancePerTick; }

  // Slow decay — called from tick. Drift accumulator so sub-1 decay still applies over time.
  function decayTick() {
    const s = window.DMTHGame.state.current;
    if (!s || !(s.wallet.wanted > 0)) return;
    s._wantedDrift = (s._wantedDrift || 0) + DECAY_PER_TICK;
    if (s._wantedDrift >= 1) {
      const amount = Math.floor(s._wantedDrift);
      s.wallet.wanted = Math.max(0, s.wallet.wanted - amount);
      s._wantedDrift -= amount;
    }
  }

  // Compact readout for UI surfaces.
  function describe() {
    const v = get();
    const t = tier();
    return { level: v, key: t.key, label: t.label, emoji: t.emoji, huntPenalty: t.huntPenalty };
  }

  window.DMTHGame = window.DMTHGame || {};
  window.DMTHGame.wanted = Object.freeze({
    ACCRUAL, TIERS, DECAY_PER_TICK,
    get, tier, tierFor, accrue, huntPenalty, raidChancePerTick, decayTick, describe
  });
})();
