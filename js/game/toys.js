// DUNGEON MASTER: THE HUNT — toys & implements.
// "Toys" used loosely — from a wand vibrator to torture-chamber implements. You can BUY them,
// LOOT them, or FIND them; you only UNLOCK the USE of a toy once you OWN one (it's an inventory
// item). Using a toy fires a depraved act with its own effect envelope + film/aftermath markers.
// The nastiest implements are DEPRAVITY-level gated (and cheat-start opens them).//
// Each toy: { name, emoji, cost, levelReq, masoFlips?, gore?, notes, fx }
//   fx = per-use effects on her body + the player. Negative = harm. masoFlips: a masochist
//   captive takes bondDebt as bondXP instead + an arousal surge (she craves it).

(function () {
  'use strict';

  // Every toy is NET-POSITIVE for the player: a nice boost/perk (big
  // satisfaction + arousal/wetness, or escape-suppression) clearly outweighs at most a SMALL
  // girl-side negative. The PLEASURE + mid toys carry only light health/mood/debt costs. The
  // GORE tier is the deliberate high-risk / high-reward exception — its benefit is the top
  // satisfaction + premium gore-film value, paid for with real (but no longer insta-kill) damage.
  const TOYS = Object.freeze({
    'wand-vibrator':  { name: 'Wand Vibrator',        emoji: '💫', cost: 80,   levelReq: 0, notes: 'Overstimulation wand — edge her raw until she breaks down sobbing or squirting. Pure pleasure-tool: big arousal + wetness, no real downside.', fx: { arousal: +22, wetness: +20, satisfaction: 6, bondDebt: 1, tag: 'used' } },
    'dildo-set':      { name: 'Silicone Dildo Set',   emoji: '🔵', cost: 120,  levelReq: 0, notes: 'A graduated set — work her open hole by hole. Strong arousal/wetness, minimal downside.', fx: { arousal: +16, wetness: +14, cumLoad: 0, satisfaction: 6, mood: -1, bondDebt: 2, tag: 'used' } },
    'loop-gag':       { name: 'Ring Loop Gag',        emoji: '👄', cost: 140,  levelReq: 0, notes: 'A locking loop-gag that holds her jaw wide for face-fucking — no teeth, no closing, just a held-open hole. Also suppresses escape a touch.', fx: { arousal: +6, cumLoad: +0.6, satisfaction: 8, mood: -3, health: -1, bruises: +1, bondDebt: 3, escapeRisk: -0.04, tag: 'throated' } },
    'monster-dildo':  { name: 'Monster Dildo',        emoji: '🟣', cost: 320,  levelReq: 2, notes: 'Obscene girth — stretches her past comfort, leaves her gaping and aching. Big satisfaction, light lasting cost.', fx: { arousal: +12, wetness: +8, satisfaction: 9, mood: -4, health: -4, bruises: +2, bondDebt: 4, tag: 'anal' } },
    'flogger-whip':   { name: 'Leather Flogger',      emoji: '🔥', cost: 200,  levelReq: 0, masoFlips: true, notes: 'Welts striped across her back, ass, tits. A masochist begs for it; anyone else screams. Net-positive — solid satisfaction, light health cost.', fx: { satisfaction: 8, mood: -6, health: -3, bruises: +5, bondDebt: 6, arousal: +5, tag: 'whipped' } },
    'cattle-prod':    { name: 'Electro Cattle-Prod',  emoji: '⚡', cost: 380,  levelReq: 2, masoFlips: true, notes: 'Live current — convulsions, scorch marks, instant compliance. Its perk: it strongly suppresses her escape will.', fx: { satisfaction: 8, mood: -7, health: -5, bruises: +3, bondDebt: 6, escapeRisk: -0.12, tag: 'beaten' } },
    'sounding-rods':  { name: 'Urethral Sounding Rods', emoji: '🪡', cost: 260, levelReq: 3, notes: 'Slim steel rods worked into her urethra — a deep, invasive, wrong kind of pain. High satisfaction, modest cost.', fx: { satisfaction: 9, mood: -7, health: -4, bruises: +1, bondDebt: 6, tag: 'used' } },
    'slim-jim':       { name: 'The Slim Jim',         emoji: '🌭', cost: 240,  levelReq: 3, notes: 'A long thin probe driven deeper than anything should go — clinical, depraved, agonizing. High satisfaction, modest cost.', fx: { satisfaction: 9, mood: -7, health: -4, bruises: +1, bondDebt: 6, tag: 'used' } },
    'breast-ripper':  { name: 'Breast Ripper',        emoji: '🦞', cost: 520,  levelReq: 4, gore: true, notes: 'Iron claws that clamp and tear at her tits — a chamber implement. Mutilating, premium film content. HIGH-RISK/HIGH-REWARD gore tier: top satisfaction, real damage.', fx: { satisfaction: 12, mood: -16, health: -14, bruises: +9, bondDebt: 12, tag: 'beaten' } },
    'cunt-wrecker':   { name: 'The Cunt-Wrecker',     emoji: '⚙️', cost: 600,  levelReq: 4, gore: true, notes: 'A cranking speculum-ratchet that wrenches her open past tearing — leaves her permanently gaping and wrecked. Gore tier: top satisfaction, real damage.', fx: { satisfaction: 13, mood: -15, health: -15, bruises: +7, wetness: +4, bondDebt: 13, tag: 'anal' } },
    'anal-prolapser': { name: 'Anal Prolapser Pump',  emoji: '🍩', cost: 680,  levelReq: 5, gore: true, notes: 'A suction pump that drags her insides out — prolapse on camera, the filthiest content tier. Gore tier: top satisfaction, real damage.', fx: { satisfaction: 14, mood: -15, health: -15, bruises: +6, cumLoad: +0.4, bondDebt: 13, tag: 'anal' } },
    'carving-knife':  { name: 'Carving Knife',        emoji: '🔪', cost: 450,  levelReq: 4, gore: true, masoFlips: true, notes: 'Shallow cuts + carved ownership lines. Blood content sells; a slip can kill — heals slow. Gore tier: top satisfaction, real damage.', fx: { satisfaction: 13, mood: -14, health: -16, bruises: +5, bondDebt: 12, wanted: 1, tag: 'beaten' } },
    'pear-of-anguish':{ name: 'Pear of Anguish',      emoji: '🍐', cost: 900,  levelReq: 5, gore: true, notes: 'A medieval screw-pear that ratchets open inside any hole — the most demented implement in the chamber. Top gore tier: highest satisfaction, heaviest (non-lethal) damage.', fx: { satisfaction: 16, mood: -18, health: -18, bruises: +8, bondDebt: 15, tag: 'anal' } },
    'fucking-machine':{ name: 'Relentless Fucking Machine', emoji: '🛠️', cost: 750, levelReq: 3, notes: 'A motorized piston that rails her for hours at a setting — leaves her fucked stupid and ruined. Big arousal/wetness/cum-fill payoff, light cost.', fx: { arousal: +18, wetness: +16, cumLoad: +0.8, satisfaction: 11, mood: -5, health: -5, bruises: +2, bondDebt: 5, tag: 'rough' } }
  });

  // The visible implement on her body when a toy is in use, rendered into her image
  // (imaging.toyTokens reads body.recentToy, TTL-faded like recentActTag). Only toys with a
  // visible presence get a token; the rest just apply their effects.
  const TOY_IMG = Object.freeze({
    'wand-vibrator':  'a large wand vibrator pressed hard against her clit',
    'dildo-set':      'a thick silicone dildo buried inside her, base protruding',
    'loop-gag':       'a metal ring/loop gag strapped into her mouth holding her jaw wide open, tongue exposed, drool running down her chin',
    'monster-dildo':  'an obscenely huge dildo stretching her hole grotesquely wide',
    'flogger-whip':   'fresh red flogger welts striped across her back, ass and tits',
    'cattle-prod':    'an electric cattle-prod pressed to her flesh, small scorch marks, body tensed and convulsing',
    'sounding-rods':  'a thin steel sounding rod inserted into her urethra, clinical and invasive',
    'slim-jim':       'a long thin steel probe driven obscenely deep into her',
    'breast-ripper':  'iron claw clamps biting into her breasts, skin pulled taut and tearing, blood beading',
    'cunt-wrecker':   'a cranking ratchet speculum wrenching her cunt obscenely wide and gaping',
    'anal-prolapser': 'a suction pump clamped to her ass, her hole prolapsed and everted',
    'carving-knife':  'shallow knife cuts and carved ownership lines scored into her skin, beads of blood',
    'pear-of-anguish':'a medieval metal screw-pear ratcheted open inside her, spreading her brutally',
    'fucking-machine':'a motorized fucking machine pistoning a dildo into her, strapped in place'
  });

  const MAX_TOYS_PER_HOLD = 3;   // a max of three toys per hold

  function spec(id) { return TOYS[id]; }
  function owns(id) { return ((window.DMTHGame.state.current?.inventory?.[id]) || 0) > 0; }

  // ── Hold attachment ─────────────────────────────────────────────
  // A hold holds up to MAX_TOYS_PER_HOLD attached toys; a toy can only be USED on a girl whose
  // hold it's attached to. Attaching consumes one from inventory; detaching returns it.
  function holdToys(girl) {
    const d = girl ? window.DMTHGame.state.getDungeon(girl.assignedDungeonId) : null;
    const hold = d?.holds?.[girl?.assignedHoldIdx ?? 0];
    return Array.isArray(hold?.toys) ? hold.toys : [];
  }
  function holdToysAt(dungeonId, holdIdx) {
    const d = window.DMTHGame.state.getDungeon(dungeonId);
    const hold = d?.holds?.[holdIdx];
    return Array.isArray(hold?.toys) ? hold.toys : [];
  }
  function attachToHold(dungeonId, holdIdx, toyId) {
    const t = TOYS[toyId];
    if (!t) return { ok: false, reason: 'unknown toy' };
    const d = window.DMTHGame.state.getDungeon(dungeonId);
    if (!d || !d.holds?.[holdIdx]) return { ok: false, reason: 'no such hold' };
    const cur = Array.isArray(d.holds[holdIdx].toys) ? d.holds[holdIdx].toys : [];
    if (cur.includes(toyId)) return { ok: false, reason: 'already attached to this hold' };
    if (cur.length >= MAX_TOYS_PER_HOLD) return { ok: false, reason: `hold is full (${MAX_TOYS_PER_HOLD} toys max) — detach one first` };
    if (!owns(toyId)) return { ok: false, reason: `you don't own a ${t.name} — buy, loot, or find one first` };
    if (!window.DMTHGame.state.consumeItem(toyId, 1)) return { ok: false, reason: 'none in inventory' };
    const newHolds = d.holds.map((h, i) => i === holdIdx ? { ...h, toys: [...cur, toyId] } : h);
    window.DMTHGame.state.updateDungeon(dungeonId, { holds: newHolds });
    if (window.DMTHNotify) window.DMTHNotify.show(`${t.emoji} ${t.name} mounted in the hold — usable on its girl.`, { type: 'success', durationMs: 3500 });
    return { ok: true };
  }
  function detachFromHold(dungeonId, holdIdx, toyId) {
    const d = window.DMTHGame.state.getDungeon(dungeonId);
    if (!d || !d.holds?.[holdIdx]) return { ok: false, reason: 'no such hold' };
    const cur = Array.isArray(d.holds[holdIdx].toys) ? d.holds[holdIdx].toys : [];
    if (!cur.includes(toyId)) return { ok: false, reason: 'not attached' };
    const newHolds = d.holds.map((h, i) => i === holdIdx ? { ...h, toys: cur.filter(x => x !== toyId) } : h);
    window.DMTHGame.state.updateDungeon(dungeonId, { holds: newHolds });
    window.DMTHGame.state.addItem(toyId, 1);   // returned to inventory
    return { ok: true };
  }
  function level() { return window.DMTHGame.progression ? window.DMTHGame.progression.getLevel() : 1; }
  function cheat() { return window.DMTHGame.progression ? window.DMTHGame.progression.isCheatUnlocked() : false; }
  function levelOk(id) { const t = TOYS[id]; return !t ? false : (cheat() || level() >= (t.levelReq || 0)); }

  // A toy's BUY gates by the SAME multi-dimension engine as every other item type
  // (player level + girls held + dungeons owned + stockpile, derived from the toy's levelReq).
  function buyStatus(id) {
    const t = TOYS[id];
    if (!t) return { locked: true, unmet: ['unknown toy'] };
    const p = window.DMTHGame.progression;
    if (!p || !p.itemUnlockStatus) return { locked: false, unmet: [] };
    return p.itemUnlockStatus(p.toyRequirementItem(t));
  }
  function buyLockReason(id) {
    const st = buyStatus(id);
    return st.unmet && st.unmet.length ? st.unmet.join(' + ') : '';
  }

  function buy(id) {
    const t = TOYS[id];
    if (!t) return { ok: false, reason: 'unknown toy' };
    const st = buyStatus(id);
    if (st.locked) return { ok: false, reason: 'locked — needs ' + (st.unmet.join(' + ') || 'more progress') };
    if (!window.DMTHGame.state.spendMoney(t.cost, 'toy:' + id)) return { ok: false, reason: 'insufficient funds' };
    window.DMTHGame.state.addItem(id, 1);
    if (window.DMTHNotify) window.DMTHNotify.show(`${t.emoji} Bought ${t.name} ($${t.cost.toLocaleString()}) — added to your inventory. Mount it in a hold to use it.`, { type: 'success', durationMs: 4500 });
    return { ok: true, id, cost: t.cost };
  }

  function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }

  // Use a toy on a captive. Ownership-gated (you must hold one) + DEPRAVITY-gated for the worst.
  // A masochist captive (masoFlips toys) takes the bond-debt as bond GAIN + an arousal surge.
  function use(toyId, girlId, opts = {}) {
    const t = TOYS[toyId];
    if (!t) return { ok: false, reason: 'unknown toy' };
    if (!levelOk(toyId)) return { ok: false, reason: `${t.name} is locked — reach DEPRAVITY level ${t.levelReq}` };
    const girl = window.DMTHGame.state.getGirl(girlId);
    if (!girl) return { ok: false, reason: 'no such girl' };
    if (girl.encounterState !== 'captive') return { ok: false, reason: 'she has to be a living captive for that' };
    // A toy must be ATTACHED to her hold to use it on her.
    if (!holdToys(girl).includes(toyId)) return { ok: false, reason: `${t.name} isn't mounted in her hold — attach it to this hold first` };

    const fx = t.fx || {};
    const maso = t.masoFlips && girl.captiveAffect === 'masochist';
    const b = { ...(girl.body || {}) };
    if (fx.health)  b.health  = clamp((b.health ?? 100) + fx.health, 1, 100);
    if (fx.stamina) b.stamina = clamp((b.stamina ?? 70) + fx.stamina, 0, b.health ?? 100);
    if (fx.arousal) b.arousal = clamp((b.arousal ?? 0) + fx.arousal + (maso ? 12 : 0), 0, 100);
    if (fx.wetness) b.wetness = clamp((b.wetness ?? 0) + fx.wetness + (maso ? 10 : 0), 0, 100);
    if (fx.bruises) b.bruises = clamp((b.bruises ?? 0) + fx.bruises, 0, 99);
    // CUMMOD-MAX — a toy doesn't PRODUCE cum; a cum-load modifier raises her cum-load MAX for a few days, not her current load.
    if (fx.cumLoad && window.DMTHGame.cumtool) window.DMTHGame.cumtool.addTempCapBonus(b, fx.cumLoad);
    if (fx.tag) { b.recentActTag = fx.tag; if (window.DMTHGame.gameClock) b.recentActAt = window.DMTHGame.gameClock.now(); }
    // Stamp the in-use toy so her next image renders the implement on her body
    // (gag in her mouth, clamps, machine, etc.). TTL-faded by imaging like recentActTag.
    if (TOY_IMG[toyId]) { b.recentToy = toyId; if (window.DMTHGame.gameClock) b.recentToyAt = window.DMTHGame.gameClock.now(); }

    const bond = { ...(girl.bond || {}) };
    if (maso) bond.bondXP = (bond.bondXP || 0) + Math.ceil((fx.bondDebt || 0) / 2);
    else if (fx.bondDebt) bond.bondDebt = (bond.bondDebt || 0) + fx.bondDebt;

    const patch = { body: b, bond };
    if (fx.escapeRisk) patch.escape = { ...(girl.escape || {}), currentRisk: clamp((girl.escape?.currentRisk || 0) + fx.escapeRisk, 0, 1) };
    if (fx.mood && !maso) patch.mood = { ...girl.mood, mood: 'distressed', moodEmoji: '😣' };
    window.DMTHGame.state.updateGirl(girlId, patch);

    // WANTED heat is real regardless of who wields it. But player-only credit (satisfaction,
    // sex-drive, DEPRAVITY XP) and the Master chat-log line are SUPPRESSED when a JOHN is the
    // one using the toy (opts.byJohn) — a john's act isn't the player's, and it must not pollute
    // her player-facing chat log. The john's own encounter ledger records his toy use.
    if (fx.wanted && window.DMTHGame.wanted) window.DMTHGame.wanted.accrue(fx.wanted);
    if (!opts.byJohn) {
      if (fx.satisfaction && window.DMTHGame.state.addSatisfaction) window.DMTHGame.state.addSatisfaction(fx.satisfaction, 'toy:' + toyId);
      if (window.DMTHGame.sexdrive && fx.satisfaction) window.DMTHGame.sexdrive.feed(fx.satisfaction);
      if (window.DMTHGame.progression) window.DMTHGame.progression.grantXp(Math.max(1, fx.satisfaction || 1), 'toy:' + toyId);
      window.DMTHGame.state.appendTurn(girlId, 'user', `*uses the ${t.name.toLowerCase()} on her*`);
    }
    return { ok: true, toyId, maso };
  }

  // Apply a toy's effect to a captive WITHOUT the ownership / hold-mount / level
  // gates: an NPC ("friend") brought his OWN chamber-grade implement. Health floors at 1 (the toy
  // never insta-kills — the FRIENDKILL gate owns lethality). No player credit (byJohn semantics);
  // stamps the in-use toy so her next image renders the implement on her body. Returns the spec.
  function applyExternal(toyId, girlId) {
    const t = TOYS[toyId];
    if (!t) return { ok: false, reason: 'unknown toy' };
    const girl = window.DMTHGame.state.getGirl(girlId);
    if (!girl || girl.encounterState !== 'captive') return { ok: false, reason: 'not a living captive' };
    const fx = t.fx || {};
    const b = { ...(girl.body || {}) };
    if (fx.health)  b.health  = clamp((b.health ?? 100) + fx.health, 1, 100);
    if (fx.stamina) b.stamina = clamp((b.stamina ?? 70) + fx.stamina, 0, b.health ?? 100);
    if (fx.arousal) b.arousal = clamp((b.arousal ?? 0) + fx.arousal, 0, 100);
    if (fx.wetness) b.wetness = clamp((b.wetness ?? 0) + fx.wetness, 0, 100);
    if (fx.bruises) b.bruises = clamp((b.bruises ?? 0) + fx.bruises, 0, 99);
    // CUMMOD-MAX — a toy doesn't PRODUCE cum; a cum-load modifier raises her cum-load MAX for a few days, not her current load.
    if (fx.cumLoad && window.DMTHGame.cumtool) window.DMTHGame.cumtool.addTempCapBonus(b, fx.cumLoad);
    if (fx.tag) { b.recentActTag = fx.tag; if (window.DMTHGame.gameClock) b.recentActAt = window.DMTHGame.gameClock.now(); }
    if (TOY_IMG[toyId]) { b.recentToy = toyId; if (window.DMTHGame.gameClock) b.recentToyAt = window.DMTHGame.gameClock.now(); }
    const bond = { ...(girl.bond || {}) };
    if (fx.bondDebt) bond.bondDebt = (bond.bondDebt || 0) + fx.bondDebt;
    window.DMTHGame.state.updateGirl(girlId, { body: b, bond });
    if (fx.wanted && window.DMTHGame.wanted) window.DMTHGame.wanted.accrue(fx.wanted);
    return { ok: true, toyId, name: t.name, emoji: t.emoji, healthHit: Math.abs(fx.health || 0) };
  }

  // Toy ids that can turn up as world loot (find them) — fed into loot.FULL_POOL by loot.js.
  function lootableIds() { return Object.keys(TOYS); }

  // Thorough per-toy tooltip — lays out the toy's full
  // per-use effects split into a 👤 HER line (her body/bond fx) + a 🎮 YOU line (satisfaction /
  // sex-drive / DEPRAVITY XP / WANTED heat), plus gore / masochist / level-gate flags. No
  // truncation — the DMTHTooltips bubble pre-wraps.
  const TOY_HER_LABELS = {
    health: 'Health', stamina: 'Stamina', mood: 'Mood', arousal: 'Arousal',
    wetness: 'Wetness', cumLoad: 'Cum-load', bruises: 'Bruises', bondDebt: 'Bond-debt', escapeRisk: 'Escape-risk'
  };
  const TOY_HER_ORDER = ['health', 'stamina', 'mood', 'arousal', 'wetness', 'cumLoad', 'bruises', 'bondDebt', 'escapeRisk'];
  function fmtToyDelta(v) {
    return Number.isInteger(v) ? (v > 0 ? '+' : '') + v : (v > 0 ? '+' : '') + (Math.round(v * 100) / 100);
  }
  function toyTooltip(toyId) {
    const t = TOYS[toyId];
    if (!t) return '';
    const fx = t.fx || {};
    const lines = [`${t.emoji} ${t.name}`];
    if (t.notes) lines.push(t.notes);
    const flags = [];
    if (t.gore) flags.push('⚠ gore / mutilation tier');
    if (t.masoFlips) flags.push('a masochist CRAVES this — bond-debt flips to bond gain + arousal surge');
    if (flags.length) lines.push(flags.join(' · '));
    const her = TOY_HER_ORDER.filter(k => fx[k]).map(k => `${TOY_HER_LABELS[k]} ${fmtToyDelta(fx[k])}`);
    if (her.length) lines.push('👤 HER: ' + her.join(' · '));
    const you = [];
    if (fx.satisfaction) { you.push(`Satisfaction +${fx.satisfaction}`); you.push(`Sex-drive +${fx.satisfaction}`); you.push(`Depravity XP ~${Math.max(1, fx.satisfaction)}`); }
    if (fx.wanted) you.push(`WANTED +${fx.wanted}`);
    if (you.length) lines.push('🎮 YOU: ' + you.join(' · '));
    if (t.levelReq) lines.push(`🔒 needs DEPRAVITY level ${t.levelReq}`);
    return lines.join('\n');
  }

  window.DMTHGame = window.DMTHGame || {};
  window.DMTHGame.toys = Object.freeze({
    TOYS, TOY_IMG, MAX_TOYS_PER_HOLD,
    spec, owns, levelOk, buyStatus, buyLockReason, buy, use, applyExternal, lootableIds, toyTooltip,
    holdToys, holdToysAt, attachToHold, detachFromHold
  });
})();
