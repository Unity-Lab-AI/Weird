// DUNGEON MASTER: THE HUNT — dashboard page. Overview of everything.

(function () {
  'use strict';

  // Single persistent state-change subscription for this page. Subscribing from inside render()
  // is a freeze bug: state.emit() iterates the listener Set, and a Set re-visits elements added
  // during iteration — so subscribing from within an emit-triggered render loops forever in one
  // emit. The subscription lives in mount() (once); render() only builds DOM.
  let dashUnsub = null;

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
      <div class="dash-stats">
        <section class="panel" data-tooltip="DEPRAVITY — the player level. Earns experience from EVERY successful act (a kiss to a capture to a 'mass' drop). Higher level unlocks the heaviest depravities: branding (Level 3), extreme acts (Level 4), nugget-making (Level 6), dismemberment (Level 7). Cheat/sandbox start unlocks everything.">
          <h2>😈 Depravity</h2>
          ${(() => {
            const p = window.DMTHGame.progression;
            if (!p) return '<div class="sub">—</div>';
            const lvl = p.getLevel();
            const nx = p.xpToNext();
            const lo = p.LEVEL_THRESHOLDS[lvl - 1] || 0;
            const pct = nx ? Math.max(0, Math.min(100, Math.round(((nx.have - lo) / Math.max(1, nx.need - lo)) * 100))) : 100;
            return `<div class="big-num">Level ${lvl}</div>
              <div class="sub">"${p.titleFor(lvl)}"${p.isCheatUnlocked() ? ' · 🔓 all unlocked (cheat)' : ''}</div>
              <div class="bar"><div class="bar-fill" style="width:${pct}%;background:#8e44ad"></div></div>
              <div class="sub small">${nx ? `${nx.have} / ${nx.need} experience → Level ${nx.next}` : 'MAX LEVEL — The Depraved'}</div>
              ${(() => {
                // viewable detail of what the NEXT level unlocks (cum-wad growth + features).
                const ni = p.nextLevelInfo && p.nextLevelInfo();
                if (!ni) return '';
                return `<details class="sub small" style="margin-top:4px" data-tooltip="What hitting the next DEPRAVITY level gets you.">
                  <summary style="cursor:pointer">▸ Next: Level ${ni.level} "${ni.title}"</summary>
                  <ul style="margin:4px 0 0;padding-left:16px">${ni.perks.map(pk => `<li>${pk}</li>`).join('')}</ul>
                </details>`;
              })()}
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
                  keys.map(k => `<div class="stat-row small" data-tooltip="Unlock &quot;${k}&quot; now for $${p.unlockFee(k).toLocaleString()} instead of grinding to DEPRAVITY level ${p.requiredLevel(k)}."><span>${k} <span class="muted">Level ${p.requiredLevel(k)}</span></span><button class="btn-small" data-buy-unlock="${k}">🔓 $${p.unlockFee(k).toLocaleString()}</button></div>`).join('');
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
        <section class="panel" data-tooltip="John inbox — upmarket clientele requesting specific rental gigs. Accept/reject per request.">
          <h2>📬 Propositioners</h2>
          <div class="stat-row" data-tooltip="Waiting for your review.">Inbox<b>${s.propositioners.inbox.length}</b></div>
          <div class="stat-row" data-tooltip="Currently being fulfilled by your girls.">Active<b>${s.propositioners.active.length}</b></div>
          <div class="stat-row" data-tooltip="Completed engagements — drove repeat-client reputation.">Completed<b>${s.propositioners.completed.length}</b></div>
          <a data-route="propositioners" href="#propositioners" class="btn-small" data-tooltip="Review inbox + manage active engagements.">Inbox →</a>
        </section>
      </div>

      <section class="panel">
        <h2>🔗 Your Operation</h2>
        <div class="cap-hero">
          <div class="cap-hero-top">
            <div>
              <div class="big-num">${captives.length}</div>
              <div class="sub">captive${captives.length === 1 ? '' : 's'} across ${s.dungeons.length} dungeon${s.dungeons.length === 1 ? '' : 's'}</div>
            </div>
            <div class="cap-hero-cta">
              <a data-route="roster" href="#roster" data-tooltip="Full roster — every captive, escaped girl, corpse + disposal log + listings.">📋 Roster →</a>
              <a data-route="dungeon" href="#dungeon" data-tooltip="Dungeon portfolio — holds, upgrades, capacity, security.">🏚️ Dungeons →</a>
              <a href="#hunt" data-tooltip="Pick a target + loadout, run a capture attempt.">🎯 Hunt →</a>
              ${window.DMTHGame.escapeRecovery && window.DMTHGame.escapeRecovery.recoverable().length > 0 ? `<a href="#escape-recovery" class="btn-danger" style="border-color:#c0392b;color:#ff8a8a" data-tooltip="Girls have escaped — recapture them before they alert authorities.">🏃 ${window.DMTHGame.escapeRecovery.recoverable().length} on the run</a>` : ''}
            </div>
          </div>
          ${captives.length === 0
            ? `<p class="muted small">No captives yet. <a href="#hunt">Go hunt one →</a></p>`
            : `<div class="cap-tiles">${captives.map(g => {
                const hp = Math.round(g.body?.health ?? 100);
                const maxH = (window.DMTHGame.actionEffects?.maxHealthFor) ? window.DMTHGame.actionEffects.maxHealthFor(g) : 100;
                const hpPct = Math.min(100, Math.round((hp / maxH) * 100));
                const preg = g.pregnancy || {};
                const pregBadge = preg.status === 'pregnant' ? ' 🤰' : '';
                const stock = (g.bond?.bondLevel || 0) + 1;
                const archLabel = window.DMTHGame.girlGen.archetypeLabel(g.archetypeTemplate);
                return `<a class="cap-tile" href="#room?girl=${g.id}" data-tooltip="Enter ${g.name}'s hold — ${archLabel}, Stockholm ${stock}/10, ${hp}/${maxH} Health.">
                  <div class="cap-tile-name">${g.mood.moodEmoji} ${g.name}${pregBadge}</div>
                  <div class="cap-tile-meta"><span>⛓ Stockholm ${stock}/10</span><span>${archLabel}</span><span>❤️ Health ${hp}/${maxH}</span></div>
                  <div class="bar"><div class="bar-fill ${hp < maxH * 0.3 ? 'danger' : ''}" style="width:${hpPct}%"></div></div>
                </a>`;
              }).join('')}</div>`
          }
        </div>
      </section>

      <details class="sect" style="margin-top:8px" data-tooltip="Pre-bought defenses that AUTO-APPLY the moment a raid hits — no scramble, no menu mid-bust. Stock them while you're flush so a bad raid doesn't end the run.">
        <summary>🚨 Legal Defenses</summary><div class="sect-body">
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
          // the standing Dirty-Cop Payroll: pay the badges off in tiers so raids get
          // far rarer + WANTED cools faster — the mid/end-game way to not get stopped + jailed daily.
          const pr = A.payrollInfo ? A.payrollInfo() : null;
          const payroll = pr
            ? `<div class="stat-row" data-tooltip="Dirty-Cop Payroll — buy the badges off in tiers. Each tier makes raids far RARER and cools WANTED faster, so a high-heat empire isn't raided every day. Beat-Cop Envelope → Precinct Captain → City Hall's Pocket.">
                <span>🚓 Dirty-Cop Payroll <b class="${pr.tier > 0 ? 'ok' : 'muted'}">${pr.current.name}</b>${pr.tier > 0 ? ` <span class="muted small">(raids ${Math.round((1 - A.payrollRaidMul()) * 100)}% rarer)</span>` : ''}</span>
                ${pr.next ? `<button class="btn-small" data-buy-payroll data-tooltip="Upgrade to ${pr.next.name}: raids ${Math.round((1 - pr.next.raidMul) * 100)}% rarer + faster WANTED cooling.">${pr.next.name} — $${pr.next.cost.toLocaleString()}</button>` : '<b class="ok small">whole city owned</b>'}
              </div>`
            : '';
          return rows + bribe + payroll;
        })() : '<p class="muted small">—</p>'}
      </div></details>

    `;

    // pop a refill item / drink girl-milk to top up Nut Reserve.
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

    // buy early access to a gated action tier.
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
    // buy / upgrade the Dirty-Cop Payroll tier.
    const payrollBtn = el.querySelector('[data-buy-payroll]');
    if (payrollBtn) payrollBtn.onclick = () => {
      const r = window.DMTHGame.arrest.buyPayroll();
      if (!r.ok) { alert(r.reason); return; }
      render(el);
    };

    // bribe heat down directly.
    const wantedBribe = el.querySelector('[data-bribe]');
    if (wantedBribe) wantedBribe.onclick = () => {
      const r = window.DMTHGame.wanted.bribe(15);
      if (!r.ok) { alert(r.reason); return; }
      render(el);
    };

    // No subscription here — render() only builds DOM (see mount()).
  }

  // Page entry point: subscribe EXACTLY ONCE (replacing any prior listener), then re-render on
  // every state change. The router registers this; render() never touches the listener Set.
  function mount(el) {
    if (dashUnsub) { try { dashUnsub(); } catch (e) { /* ignore */ } dashUnsub = null; }
    render(el);
    dashUnsub = window.DMTHGame.state.onChange(() => {
      if (location.hash === '#dashboard' || location.hash === '') render(el);
    });
    return dashUnsub;
  }

  window.DMTHRouter.register('dashboard', mount);
})();
