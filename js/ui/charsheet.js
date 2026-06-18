// DUNGEON MASTER: THE HUNT — player CHARACTER SHEET (CHARSHEET.1).
// One screen that pulls EVERY player-wide stat, buff, debuff, perk and unlock into a single
// overview so you can read your whole fucked-up build at a glance. Pure aggregator — it owns
// no state of its own; it reads the real getters from every system (progression / sexdrive /
// wanted / trophies / wallet / roster / body-parts) so the numbers always match the mechanics
// that actually run. Buffs + debuffs carry taboo names but each maps to a REAL modifier the
// hunt / income / containment math reads (see hunt.js breakdown, trophies.activePerks()).

(function () {
  'use strict';

  // ---- TABOO PERK NAMING ----
  // Every aggregated trophy-perk category gets a depraved display name + emoji. The underlying
  // key is what the game math reads; this is just the player-facing flex. Kept in sync with
  // trophies.js perk keys + trophy-room-view.js PERK_LABEL (this is the nastier-named twin).
  const PERK_NAME = {
    wantedDecayBonus:       { emoji: '👻', name: 'No Body, No Crime', blurb: 'Heat bleeds off your record faster — the law forgets what it can\'t find.' },
    filmPriceMul:           { emoji: '🎬', name: 'Snuff Auteur',      blurb: 'Your reels fetch a sicker premium on the market.' },
    johnCadenceBonus:       { emoji: '🥩', name: 'Flesh Broker',      blurb: 'Word travels — johns line up at your door more often.' },
    escapeContainmentBonus: { emoji: '⛓️', name: 'Iron Maiden',       blurb: 'Your holds bite harder — captives claw at the walls and get nowhere.' },
    shopDiscount:           { emoji: '🕳️', name: 'Black-Market Plug', blurb: 'Your fence cuts you a deal on every filthy tool.' },
    healBonus:              { emoji: '🔪', name: 'Mad Doctor',         blurb: 'You patch the meat back up faster between sessions.' }
  };

  // Depraved display names for the gated action tiers (progression.UNLOCKS keys).
  const UNLOCK_NAME = {
    own:       '🏷️ Brand Her Yours',
    extreme:   '☠️ Extreme Acts',
    nugget:    '🪓 Nugget-Making',
    dismember: '🔪 Butcher & Harvest',
    snuff:     '⚰️ Snuff Her Out'
  };

  function pct(v) { return `${v >= 0 ? '+' : ''}${Math.round(v * 100)}%`; }

  function render(el) {
    const s = window.DMTHGame.state.current;
    if (!s || !s.createdAt) {
      el.innerHTML = `<div class="panel"><h2>No game in progress</h2><a href="#newgame" class="btn-primary">New Game</a></div>`;
      return;
    }

    const G = window.DMTHGame;
    const name = G.state.getPlayerName ? G.state.getPlayerName() : 'Master';
    const w = s.wallet || {};

    // ---- progression / depravity ----
    const prog = G.progression;
    const lvl = prog ? prog.getLevel() : 1;
    const title = prog ? prog.titleFor(lvl) : '';
    const nx = prog ? prog.xpToNext() : null;
    const lo = prog ? (prog.LEVEL_THRESHOLDS[lvl - 1] || 0) : 0;
    const xpPct = (prog && nx) ? Math.max(0, Math.min(100, Math.round(((nx.have - lo) / Math.max(1, nx.need - lo)) * 100))) : 100;
    const cheat = prog ? prog.isCheatUnlocked() : false;

    // ---- vitals ----
    const sd = G.sexdrive ? G.sexdrive.status() : null;
    const sat = typeof w.playerSatisfaction === 'number' ? w.playerSatisfaction : 50;
    const buzz = typeof w.buzz === 'number' ? w.buzz : 0;
    const wanted = G.wanted ? G.wanted.describe() : { level: 0, label: '—', emoji: '⚪', huntPenalty: 0 };

    // ---- roster tallies ----
    const captives = s.roster.filter(g => g.encounterState === 'captive');
    const corpses = s.roster.filter(g => g.encounterState === 'dead').length;
    const escaped = s.roster.filter(g => g.encounterState === 'escaped').length;
    const trophies = G.state.getTrophies ? G.state.getTrophies() : [];
    const bodyParts = G.state.getBodyParts ? G.state.getBodyParts() : [];
    const listedFilms = s.films.filter(f => f.status === 'listed').length;
    const totalEarned = s.films.reduce((t, f) => f.saleRecord ? t + f.saleRecord.price : t, 0);

    // ---- BUFFS (active positive modifiers, real mechanics, taboo names) ----
    const buffs = [];
    // Sex-drive maxed = rut frenzy (hunt + dirty money boost — hunt.js sexDriveBonus, sexdrive.cashMul).
    if (sd && sd.maxed) {
      buffs.push({ emoji: '🍆', name: 'Rut Frenzy', detail: `${pct(0.12)} capture odds · ${pct(0.15)} dirty money`, blurb: 'Cock so primed every hunt comes easy and every payout fattens.' });
    }
    // High satisfaction = predator's high (hunt.js satisfactionBonus, scales above 50).
    if (sat > 50) {
      const b = ((sat - 50) / 50) * 0.20;
      buffs.push({ emoji: '😈', name: 'Predator\'s High', detail: `${pct(b)} capture odds`, blurb: 'Sated and smug — the next catch barely fights you.' });
    }
    // Buzz = underground notoriety drawing johns (whore-out cadence).
    if (buzz >= 60) {
      buffs.push({ emoji: '🐝', name: 'Hot Property', detail: `johns arrive up to 2× faster`, blurb: 'The whole underground is whispering your dungeons\' name.' });
    }
    // Trophy perks — aggregate every stacked perk, rename it taboo.
    const perks = G.trophies ? G.trophies.activePerks() : null;
    if (perks) {
      if (perks.huntBonus.all > 0) buffs.push({ emoji: '🩸', name: 'Bloodhound Rut', detail: `${pct(perks.huntBonus.all)} capture odds (all)`, blurb: 'The trophies on your shelf sharpen every hunt.' });
      for (const [arch, v] of Object.entries(perks.huntBonus.byArchetype)) {
        if (v > 0) buffs.push({ emoji: '🎯', name: `Type-Hunter: ${arch}`, detail: `${pct(v)} capture odds vs ${arch}`, blurb: `You know exactly how a ${arch} girl breaks.` });
      }
      for (const key of Object.keys(PERK_NAME)) {
        if ((perks[key] || 0) > 0) {
          const p = PERK_NAME[key];
          buffs.push({ emoji: p.emoji, name: p.name, detail: pct(perks[key]), blurb: p.blurb });
        }
      }
    }

    // ---- DEBUFFS (active penalties, taboo names) ----
    const debuffs = [];
    if (wanted.huntPenalty > 0) {
      debuffs.push({ emoji: wanted.emoji, name: 'Heat on Your Neck', detail: `${pct(-wanted.huntPenalty)} capture odds`, blurb: `${wanted.label} — eyes everywhere, targets warier, the law circling.` });
    }
    if (sd && sd.deprived) {
      debuffs.push({ emoji: '🥵', name: 'Blue-Balled Rage', detail: `${pct(-0.10)} capture odds · ${pct(-0.08)} income`, blurb: 'Backed-up and sloppy — you fumble the grab and lowball the sale.' });
    }
    if (sat < 50) {
      const b = ((sat - 50) / 50) * 0.10;
      debuffs.push({ emoji: '😒', name: 'Starved & Surly', detail: `${pct(b)} capture odds`, blurb: 'Unsatisfied and distracted — you\'re off your game in the field.' });
    }
    if (corpses > 0 && wanted.level >= 60) {
      debuffs.push({ emoji: '⚰️', name: 'Bodies to Bury', detail: `${corpses} corpse${corpses === 1 ? '' : 's'} · raid risk up`, blurb: 'Too many missing girls trace back to you — a raid is coming.' });
    }

    // ---- UNLOCKED DEPRAVITIES ----
    const unlockRows = prog ? Object.keys(prog.UNLOCKS).map(k => {
      const open = prog.isUnlocked(k);
      const req = prog.requiredLevel(k);
      const bought = (s.purchasedUnlocks || []).includes(k);
      const how = cheat ? 'cheat-start' : bought ? 'bought early' : open ? `reached L${req}` : `locked — needs L${req} or $${(prog.unlockFee(k) || 0).toLocaleString()}`;
      const nm = UNLOCK_NAME[k] || k;
      return `<div class="stat-row" data-tooltip="${open ? 'Unlocked.' : 'Locked.'} ${how}."><span>${open ? '🔓' : '🔒'} ${nm}</span><b class="${open ? 'ok' : 'muted'}">${open ? how : `L${req}`}</b></div>`;
    }).join('') : '';
    const ownedLocs = (s.unlockedLocations || []);

    el.innerHTML = `
      <div class="panel">
        <h2>📑 Character Sheet — ${escapeHtml(name)}</h2>
        <p class="small muted">Everything you are, in one ledger: your DEPRAVITY, your drives, every buff stacked on your back and every debuff dragging on your neck, and which sins you've earned the right to commit.</p>
      </div>

      <div class="grid-2">
        <section class="panel" data-tooltip="DEPRAVITY — your player level. XP from EVERY successful act; gentle deeds a sliver, atrocities a flood.">
          <h2>😈 Depravity</h2>
          <div class="big-num">L${lvl} <span class="sub">"${escapeHtml(title)}"</span></div>
          <div class="bar"><div class="bar-fill" style="width:${xpPct}%;background:#8e44ad"></div></div>
          <div class="sub small">${nx ? `${nx.have} / ${nx.need} XP → L${nx.next}` : 'MAX — The Depraved'}${cheat ? ' · 🔓 all unlocked (cheat)' : ''}</div>
        </section>

        <section class="panel" data-tooltip="Liquid cash + your two reputation axes: WANTED (law heat, pure liability) and Notoriety (legacy stat).">
          <h2>💰 Blood Standing</h2>
          <div class="big-num">$${(w.money || 0).toLocaleString()}</div>
          <div class="sub small">💵 Blood Money on hand</div>
          <div class="stat-row" data-tooltip="WANTED — law heat, 0-100. Pure liability: makes hunts harder and the raid closer."><span>🪢 The Noose</span><b>${wanted.label} (${wanted.level}/100)</b></div>
          <div class="bar"><div class="bar-fill" style="width:${wanted.level}%;background:${wanted.level>=60?'#c0392b':wanted.level>=40?'#e67e22':wanted.level>=20?'#f1c40f':'#27ae60'}"></div></div>
          <div class="stat-row" data-tooltip="Notoriety — legacy infamy stat."><span>📛 Infamy</span><b>${w.notoriety || 0}</b></div>
        </section>

        <section class="panel" data-tooltip="Your core drives. Sex-drive ceiling scales with roster + level. Satisfaction feeds hunt odds. Buzz draws johns.">
          <h2>🍆 The Need</h2>
          ${sd ? `<div class="stat-row" data-tooltip="Sex-drive — your appetite NEED. Ceiling scales with roster + DEPRAVITY level. MAXED = boosts, DEPRIVED = debuffs."><span>🍆 Cock-Hunger</span><b class="${sd.maxed?'ok':sd.deprived?'bad':''}">${sd.value}/${sd.max}${sd.maxed?' · MAXED':sd.deprived?' · DEPRIVED':''}</b></div>
          <div class="bar"><div class="bar-fill" style="width:${Math.round(sd.pct*100)}%;background:${sd.maxed?'#27ae60':sd.deprived?'#c0392b':'#e67e22'}"></div></div>` : ''}
          <div class="stat-row" data-tooltip="Player satisfaction (0-100). Above 50 = hunt bonus, below 50 = hunt penalty."><span>💦 Spent Load</span><b class="${sat>=60?'ok':sat<40?'bad':''}">${Math.round(sat)}/100</b></div>
          <div class="stat-row" data-tooltip="BUZZ (0-100) — underground word-of-mouth. Higher = johns visit your whored-out captives more often."><span>🐝 Dungeon Cred</span><b>${Math.round(buzz)}/100</b></div>
        </section>

        <section class="panel" data-tooltip="The operation, in numbers. Held captives, corpses on your hands, girls who slipped the leash, trophies + harvested parts.">
          <h2>🏚️ The Body Count</h2>
          <div class="stat-row" data-tooltip="Captives currently held across all dungeons."><span>🔗 Owned Meat</span><b>${captives.length}</b></div>
          <div class="stat-row" data-tooltip="Girls killed into corpses (snuff / OD / disposal). Still usable postmortem until disposed."><span>⚰️ Cold Meat</span><b>${corpses}</b></div>
          <div class="stat-row" data-tooltip="Captives who slipped the leash and are loose — a WANTED liability until recaptured."><span>🐀 Loose Rats</span><b class="${escaped>0?'bad':''}">${escaped}</b></div>
          <div class="stat-row" data-tooltip="Trophies minted from terminal disposals — each grants stacking perks."><span>🏆 Mounted Souls</span><b>${trophies.length}</b></div>
          <div class="stat-row" data-tooltip="Organs + limbs harvested via the dismember disposal path, sold on the body-part market."><span>🦴 Harvested Cuts</span><b>${bodyParts.length}</b></div>
          <div class="stat-row" data-tooltip="Films currently listed — each pays passive income per tick."><span>🎬 Filth Reels Live</span><b>${listedFilms}</b></div>
          <div class="stat-row" data-tooltip="Cumulative film payouts across the entire save."><span>💵 Lifetime Filth Take</span><b>$${totalEarned.toLocaleString()}</b></div>
        </section>
      </div>

      <section class="panel">
        <h2>✅ Active Buffs <span class="sub small">(${buffs.length})</span></h2>
        ${buffs.length ? `<div class="char-buffs">${buffs.map(b => `
          <div class="stat-row" data-tooltip="${escapeHtml(b.blurb)}"><span>${b.emoji} <b>${escapeHtml(b.name)}</b></span><b class="ok">${escapeHtml(b.detail)}</b></div>`).join('')}</div>`
          : `<p class="muted small">No buffs running. Max your sex-drive, keep satisfaction high, stack trophies, and pump buzz to load yourself up.</p>`}
      </section>

      <section class="panel">
        <h2>⚠️ Active Debuffs <span class="sub small">(${debuffs.length})</span></h2>
        ${debuffs.length ? `<div class="char-debuffs">${debuffs.map(d => `
          <div class="stat-row" data-tooltip="${escapeHtml(d.blurb)}"><span>${d.emoji} <b>${escapeHtml(d.name)}</b></span><b class="bad">${escapeHtml(d.detail)}</b></div>`).join('')}</div>`
          : `<p class="muted small">Clean — nothing dragging on you. Keep the heat low and your cock fed and it stays that way.</p>`}
      </section>

      <section class="panel">
        <h2>🔓 Unlocked Depravities</h2>
        ${unlockRows || '<p class="muted small">—</p>'}
        <div class="stat-row" style="margin-top:8px" data-tooltip="Hunting grounds you've bought private access to (no-suspicion hunts)."><span>🗝️ Owned ground access</span><b>${ownedLocs.length ? escapeHtml(ownedLocs.join(', ')) : 'none'}</b></div>
        <div class="btn-row" style="margin-top:8px">
          <a href="#dashboard" class="btn-small" data-tooltip="Back to the operation overview.">🏠 Dashboard</a>
          <a href="#trophy-room" class="btn-small" data-tooltip="Every trophy + its raw perk values.">🏆 Trophy room</a>
          <a href="#achievements" class="btn-small" data-tooltip="Milestones unlocked.">🎖️ Achievements</a>
        </div>
      </section>
    `;

    // Re-render live when state changes while this page is open.
    const unsub = window.DMTHGame.state.onChange(() => {
      if (location.hash.startsWith('#charsheet')) render(el);
    });
    return unsub;
  }

  function escapeHtml(s) {
    return String(s ?? '').replace(/[&<>"']/g, c => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[c]));
  }

  window.DMTHRouter.register('charsheet', render);
})();
