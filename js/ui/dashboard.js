// DUNGEON MASTER: THE HUNT — dashboard page. Overview of everything.

(function () {
  'use strict';

  function render(el) {
    const s = window.DMTHGame.state.current;
    if (!s || !s.createdAt) {
      el.innerHTML = `<div class="panel"><h2>No game in progress</h2><button id="new-game-btn" class="btn-primary">New Game</button></div>`;
      el.querySelector('#new-game-btn').onclick = () => window.DMTHRouter.go('newgame');
      return;
    }

    const captives = s.roster.filter(g => g.encounterState === 'captive');
    const listedFilms = s.films.filter(f => f.status === 'listed').length;
    const soldFilms = s.films.filter(f => f.status === 'sold').length;
    const totalEarned = s.films.reduce((t, f) => f.saleRecord ? t + f.saleRecord.price : t, 0);

    el.innerHTML = `
      <div class="grid-2">
        <section class="panel" data-tooltip="Liquid cash on hand. WANTED = law-heat — builds from hunts, escapes, deaths, sloppy disposal, and corpse content; decays slowly. High tiers trigger raids → fines → jail. Notoriety = legacy heat stat.">
          <h2>💰 Treasury</h2>
          <div class="big-num">$${s.wallet.money.toLocaleString()}</div>
          ${(() => {
            const w = window.DMTHGame.wanted ? window.DMTHGame.wanted.describe() : null;
            return w
              ? `<div class="sub">${w.emoji} WANTED: <b>${w.label}</b> (${w.level}/100) · Notoriety: ${s.wallet.notoriety} · Tick: ${s.tickCount}</div>
                 <div class="bar" data-tooltip="WANTED level 0-100. ${w.label}."><div class="bar-fill" style="width:${w.level}%;background:${w.level>=60?'#c0392b':w.level>=40?'#e67e22':w.level>=20?'#f1c40f':'#27ae60'}"></div></div>`
              : `<div class="sub">Notoriety: ${s.wallet.notoriety} · Tick: ${s.tickCount}</div>`;
          })()}
        </section>
        <section class="panel" data-tooltip="DEPRAVITY — the player level. Earns XP from EVERY successful act (a kiss to a capture to a 'mass' drop). Higher level unlocks the heaviest depravities: branding (L3), extreme acts (L4), nugget-making (L6), dismemberment (L7). Cheat/sandbox start unlocks everything.">
          <h2>😈 Depravity</h2>
          ${(() => {
            const p = window.DMTHGame.progression;
            if (!p) return '<div class="sub">—</div>';
            const lvl = p.getLevel();
            const nx = p.xpToNext();
            const lo = p.LEVEL_THRESHOLDS[lvl - 1] || 0;
            const pct = nx ? Math.max(0, Math.min(100, Math.round(((nx.have - lo) / Math.max(1, nx.need - lo)) * 100))) : 100;
            return `<div class="big-num">L${lvl}</div>
              <div class="sub">"${p.titleFor(lvl)}"${p.isCheatUnlocked() ? ' · 🔓 all unlocked (cheat)' : ''}</div>
              <div class="bar"><div class="bar-fill" style="width:${pct}%;background:#8e44ad"></div></div>
              <div class="sub small">${nx ? `${nx.have} / ${nx.need} XP → L${nx.next}` : 'MAX LEVEL — The Depraved'}</div>
              ${window.DMTHGame.sexdrive ? (() => {
                const sd = window.DMTHGame.sexdrive.status();
                return `<div class="bar" data-tooltip="Sexual drive — fed by sex acts, decays over time. MAXED = hunt + cash boosts; DEPRIVED = debuffs. The ceiling scales with how many girls you hold + your DEPRAVITY level, so you can't max it on one captive — you need a roster."><div class="bar-fill" style="width:${Math.round(sd.pct * 100)}%;background:${sd.maxed ? '#27ae60' : sd.deprived ? '#c0392b' : '#e67e22'}"></div></div>
                  <div class="sub small">🍆 Sex-drive ${sd.value}/${sd.max}${sd.maxed ? ' · MAXED (boosts)' : sd.deprived ? ' · DEPRIVED (debuffs)' : ''}</div>`;
              })() : ''}
              ${window.DMTHGame.playerStamina ? (() => {
                const ns = window.DMTHGame.playerStamina.status();
                const inv = (window.DMTHGame.state.current && window.DMTHGame.state.current.inventory) || {};
                const owned = window.DMTHGame.playerStamina.ownedRefillItems ? window.DMTHGame.playerStamina.ownedRefillItems() : [];
                const milkN = inv['girl-milk'] || 0;
                const btns = owned.map(it => `<button class="btn-small" data-pop-refill="${it.id}" data-tooltip="${(it.notes || '').replace(/"/g, '&quot;')}">${it.emoji || '💊'} ${it.displayName} (${inv[it.id] || 0})</button>`);
                if (milkN > 0) btns.push(`<button class="btn-small" data-drink-milk data-tooltip="Drink a glass of girl-milk — refills some Nut Reserve + satisfaction + buzz.">🥛 Girl-milk (${milkN})</button>`);
                const refillRow = btns.length
                  ? `<div class="btn-row" style="margin-top:6px;gap:6px;flex-wrap:wrap;">${btns.join('')}</div>`
                  : (ns.low ? `<div class="sub small muted">Running low — grab a 💊 Blue Pill / energy shot in the Shop, or drink girl-milk.</div>` : '');
                return `<div class="bar" data-tooltip="Nut Reserve — your gas tank. Every act on a girl spends it (extreme acts cost most); it regens each tick and refills instantly with viagra / girl's-milk. Run it empty and you're 'running on fumes' — acts pay reduced satisfaction + sex-drive fill until you recover."><div class="bar-fill" style="width:${Math.round(ns.pct * 100)}%;background:${ns.empty ? '#c0392b' : ns.low ? '#e67e22' : '#3498db'}"></div></div>
                  <div class="sub small">💦 Nut Reserve ${ns.value}/${ns.max}${ns.empty ? ' · RUNNING ON FUMES' : ns.low ? ' · running low' : ''}</div>
                  ${refillRow}`;
              })() : ''}
              ${(() => {
                const p = window.DMTHGame.progression;
                if (!p || p.isCheatUnlocked() || !p.UNLOCKS) return '';
                const keys = Object.keys(p.UNLOCKS).filter(k => !p.isUnlocked(k) && p.unlockFee(k) > 0);
                if (!keys.length) return '';
                return `<div class="sub small" style="margin-top:6px"><b>🔒 Locked — level up, or buy early:</b></div>` +
                  keys.map(k => `<div class="stat-row small" data-tooltip="Unlock &quot;${k}&quot; now for $${p.unlockFee(k).toLocaleString()} instead of grinding to DEPRAVITY level ${p.requiredLevel(k)}."><span>${k} <span class="muted">L${p.requiredLevel(k)}</span></span><button class="btn-small" data-buy-unlock="${k}">🔓 $${p.unlockFee(k).toLocaleString()}</button></div>`).join('');
              })()}`;
          })()}
        </section>
        <section class="panel" data-tooltip="Films auto-sell on tick. Listed = passive earners. Sold = closed sales. Total earned = lifetime payouts.">
          <h2>🎬 Film Market</h2>
          <div class="stat-row" data-tooltip="Films currently listed. Each pays per-tick passive income — they NEVER unlist unless you 💣 sell negatives.">Listed<b>${listedFilms}</b></div>
          <div class="stat-row" data-tooltip="Legacy sold count (pre-auto-sell). Auto-sell films stay listed.">Sold<b>${soldFilms}</b></div>
          <div class="stat-row" data-tooltip="Cumulative payouts from films across the entire save.">Total earned<b>$${totalEarned.toLocaleString()}</b></div>
          <a data-route="market" href="#market" class="btn-small" data-tooltip="Open the films market — list / sell-negatives / view passive income.">Open market →</a>
        </section>
        <section class="panel" data-tooltip="Captives in your operation across all dungeons.">
          <h2>🔗 Captives</h2>
          <div class="big-num">${captives.length}</div>
          <div class="sub">across ${s.dungeons.length} dungeon${s.dungeons.length === 1 ? '' : 's'}</div>
          <a data-route="roster" href="#roster" class="btn-small" data-tooltip="Full roster + disposal log + listings.">Roster →</a>
          <a data-route="dungeon" href="#dungeon" class="btn-small" data-tooltip="Dungeon portfolio + hold upgrades.">Dungeons →</a>
        </section>
        <section class="panel" data-tooltip="John inbox — upmarket clientele requesting specific rental gigs. Accept/reject per request.">
          <h2>📬 Propositioners</h2>
          <div class="stat-row" data-tooltip="Waiting for your review.">Inbox<b>${s.propositioners.inbox.length}</b></div>
          <div class="stat-row" data-tooltip="Currently being fulfilled by your girls.">Active<b>${s.propositioners.active.length}</b></div>
          <div class="stat-row" data-tooltip="Completed engagements — drove repeat-client reputation.">Completed<b>${s.propositioners.completed.length}</b></div>
          <a data-route="propositioners" href="#propositioners" class="btn-small" data-tooltip="Review inbox + manage active engagements.">Inbox →</a>
        </section>
      </div>

      <section class="panel">
        <h2>Quick actions</h2>
        <div class="btn-row">
          <a href="#town" class="btn-primary" data-tooltip="The map. Visit locations + own properties.">🌆 Town</a>
          <a href="#hunt" class="btn-small" data-tooltip="Pick a target + loadout. Run a 4-stage capture attempt.">🎯 Hunt</a>
          <a href="#shop" class="btn-small" data-tooltip="The Flesh Fence — shady supply den. Tools, drugs, food, water, contraception, abortion supplies. High-tier stock is level-locked + limited per day.">🩸 The Flesh Fence</a>
          <a href="#slave-market" class="btn-small" data-tooltip="Buy/sell captives. Untrained cheap, trained premium.">⛓️ Slave market</a>
          <a href="#achievements" class="btn-small" data-tooltip="Unlocked milestones.">🏆 Achievements</a>
          <a href="#trophy-room" class="btn-small" data-tooltip="Keepsakes carved off the girls you've snuffed, buried, burned, or dumped for good — each grants stacking perks.">🏆 Trophy room</a>
          ${window.DMTHGame.escapeRecovery && window.DMTHGame.escapeRecovery.recoverable().length > 0 ? `<a href="#escape-recovery" class="btn-small btn-danger" data-tooltip="Girls have escaped — recapture them before they alert authorities.">🏃 ${window.DMTHGame.escapeRecovery.recoverable().length} on the run</a>` : ''}
          ${captives.length > 0 ? `<a href="#room?girl=${captives[0].id}" class="btn-small" data-tooltip="Jump straight into ${captives[0].name}'s hold.">🚪 Enter ${captives[0].name}'s hold</a>` : ''}
        </div>
      </section>

      <section class="panel" data-tooltip="Pre-bought defenses that AUTO-APPLY the moment a raid hits — no scramble, no menu mid-bust. Stock them while you're flush so a bad raid doesn't end the run.">
        <h2>🚨 Legal Defenses</h2>
        <p class="small muted">Raids hit on their own when WANTED runs high. These kick in automatically: a lawyer beats a body-in-hold instant-arrest (or cuts a fine 40%), dirty-cop connections let you bribe a raid away entirely, and an escape kit lets you FLEE an unpayable fine instead of going to prison.</p>
        ${window.DMTHGame.arrest && window.DMTHGame.arrest.VALVES ? (() => {
          const A = window.DMTHGame.arrest;
          const rows = Object.entries(A.VALVES).map(([id, v]) => `
            <div class="stat-row" data-tooltip="${v.notes.replace(/"/g, '&quot;')}">
              <span>${v.displayName} <b class="muted">×${A.valveCount(id)}</b></span>
              <button class="btn-small" data-buy-valve="${id}">Buy $${v.cost.toLocaleString()}</button>
            </div>`).join('');
          const bribe = A.hasBribeContacts()
            ? `<div class="stat-row" data-tooltip="Active — a raid you can afford the bribe on (~1.6× the fine) auto-resolves with WANTED slashed and no record."><span>💰 Dirty-Cop Connections</span><b class="ok">✓ active</b></div>`
            : `<div class="stat-row" data-tooltip="One-time. Unlocks bribing a raid away — costs ~1.6× the fine but slashes WANTED far harder than a fine and leaves no escalating record."><span>💰 Dirty-Cop Connections</span><button class="btn-small" data-buy-bribe>Buy $${A.BRIBE_COST.toLocaleString()}</button></div>`;
          return rows + bribe;
        })() : '<p class="muted small">—</p>'}
      </section>

      <section class="panel">
        <h2>Recent captives</h2>
        ${captives.length === 0
          ? `<p class="muted small">No captives. <a href="#hunt">Go hunt one.</a></p>`
          : `<div class="girl-grid">${captives.map(g => {
              const preg = g.pregnancy || {};
              const pregLight = preg.status === 'pregnant'
                ? `<span class="preg-light" title="🤰 Pregnant — gestation day ${preg.gestationDays}/280 (trimester ${preg.trimester})">🤰</span>`
                : preg.status === 'aborted' ? `<span class="preg-light" title="Pregnancy aborted (day ${preg.outcomeHistory?.slice(-1)[0]?.day || '?'})">⚪</span>`
                : preg.status === 'miscarried' ? `<span class="preg-light" title="Miscarried (complication)">🩸</span>`
                : preg.status === 'birthed' ? `<span class="preg-light" title="Birthed">🍼</span>`
                : preg.status === 'lost' ? `<span class="preg-light" title="Lost to authorities">🚨</span>`
                : '';
              return `<a class="girl-card" href="#room?girl=${g.id}">
                <div class="girl-emoji">${g.mood.moodEmoji}${pregLight}</div>
                <div class="girl-name">${g.name}${preg.status === 'pregnant' ? ' 🤰' : ''}</div>
                <div class="girl-meta">
                  <span>L${g.bond.bondLevel}</span>
                  <span>${g.archetypeTemplate}</span>
                  ${preg.status === 'pregnant' ? `<span class="muted small" title="gestation day ${preg.gestationDays}/280">T${preg.trimester}·d${preg.gestationDays}</span>` : ''}
                </div>
                <div class="bar"><div class="bar-fill" style="width:${Math.round(((g.bond.bondXP % 50) / 50) * 100)}%"></div></div>
              </a>`;
            }).join('')}</div>`
        }
      </section>
    `;

    // PLAYERSTAM.2 — pop a refill item / drink girl-milk to top up Nut Reserve.
    el.querySelectorAll('[data-pop-refill]').forEach(b => {
      b.onclick = () => {
        const r = window.DMTHGame.playerStamina.popRefill(b.dataset.popRefill);
        if (!r.ok) { alert(r.reason); return; }
        render(el);
      };
    });
    const milkBtn = el.querySelector('[data-drink-milk]');
    if (milkBtn) milkBtn.onclick = () => {
      const r = window.DMTHGame.milk.drinkPlayer();
      if (!r.ok) { alert(r.reason); return; }
      render(el);
    };

    // PAYUNLOCK.1 — buy early access to a gated action tier.
    el.querySelectorAll('[data-buy-unlock]').forEach(b => {
      b.onclick = () => {
        const r = window.DMTHGame.progression.buyUnlock(b.dataset.buyUnlock);
        if (!r.ok) { alert(r.reason); return; }
        render(el);
      };
    });

    // F.5 — buy arrest escape valves (lawyer / escape kit / bribe contacts).
    el.querySelectorAll('[data-buy-valve]').forEach(b => {
      b.onclick = () => {
        const r = window.DMTHGame.arrest.buyValve(b.dataset.buyValve);
        if (!r.ok) { alert(r.reason); return; }
        render(el);
      };
    });
    const bribeBtn = el.querySelector('[data-buy-bribe]');
    if (bribeBtn) bribeBtn.onclick = () => {
      const r = window.DMTHGame.arrest.buyBribeContacts();
      if (!r.ok) { alert(r.reason); return; }
      render(el);
    };

    // No listener cleanup needed for static anchors.
    const unsub = window.DMTHGame.state.onChange(() => {
      if (location.hash === '#dashboard' || location.hash === '') render(el);
    });
    return unsub;
  }

  window.DMTHRouter.register('dashboard', render);
})();
