// DUNGEON MASTER: THE HUNT — hunt / outside world page.

(function () {
  'use strict';

  function render(el, params) {
    const stage = params.stage || 'map';
    if (stage === 'map')       { window.DMTHRouter.go('town'); return; }   // redirect to the plot page
    if (stage === 'location') return renderLocation(el, params);
    if (stage === 'approach') return renderApproach(el, params);
  }

  function renderLocation(el, params) {
    const locId = params.loc;
    const loc = window.DMTHAssets.getById('location', locId);
    if (!loc) { el.innerHTML = `<p>unknown location</p>`; return; }
    // PLVL.2 — locked hunting ground can't be entered until its level / roster / purchase gate is met.
    if (window.DMTHGame.progression && !window.DMTHGame.progression.isLocationUnlocked(locId)) {
      el.innerHTML = `<div class="panel"><h2>🔒 ${loc.emoji} ${loc.displayName} — locked</h2><p class="small muted">${window.DMTHGame.progression.locationGateReason(locId)}.</p><a href="#town" class="btn-small">← back to town</a></div>`;
      return;
    }
    const encounters = window.DMTHGame.hunt.rollEncounters(locId, 3);
    const inv = window.DMTHGame.state.current.inventory;

    el.innerHTML = `
      <div class="panel">
        <h2>${loc.emoji} ${loc.displayName}</h2>
        <p class="small muted">${loc.notes}</p>
        <div class="stat-row small"><span>Notoriety</span><b>${window.DMTHGame.state.current.wallet.notoriety}</b>
          <span class="muted">(experience bonus applied to acquisitions)</span></div>
        <a href="#hunt" class="btn-small">← back to map</a>
        <button id="scavenge-area" class="btn-small" data-tooltip="Search the area for loot — tools, drugs, gear, cash. ~50% you find something; sometimes a rare item from the full catalog. Free, no notoriety.">🔦 Search the area</button>
      </div>
      <div class="panel">
        <h2>Girls to snatch</h2>
        <div class="girl-grid">
          ${encounters.map(g => {
            const archDiff = window.DMTHGame.hunt.ARCHETYPE_DIFFICULTY[g.archetypeTemplate] ?? 0.5;
            const captureTools = ['rohypnol','chloroform','ether','ketamine','duct-tape','rope','zip-ties','handcuffs'].filter(id => inv[id] > 0);
            const bestOdds = captureTools.length === 0 ? null : Math.max(...captureTools.map(tid =>
              window.DMTHGame.hunt.previewCaptureOdds({ girl: g, toolId: tid, locationId: locId }).successP
            ));
            const oddsLabel = bestOdds === null ? 'no tool owned' : `${Math.round(bestOdds * 100)}% best odds`;
            return `
            <div class="girl-card approach-card">
              <div class="girl-emoji">${moodEmoji(g)}</div>
              <div class="girl-name">${g.name} <span class="muted small">(${g.age})</span></div>
              <div class="girl-meta">
                <span>${g.archetypeTemplate}</span>
                <span>type diff ${Math.round(archDiff*100)}%</span>
              </div>
              <div class="small muted">${g.backstoryFragment}</div>
              <div class="stat-row small"><span>Defiance</span><b>${g.stats.defiance}</b></div>
              <div class="stat-row small"><span>Intelligence</span><b>${g.stats.intelligence}</b></div>
              <div class="stat-row small"><span>Stamina</span><b>${g.stats.stamina}</b></div>
              <div class="stat-row small"><span>Pain tolerance</span><b>${g.stats.painTolerance}</b></div>
              <div class="stat-row small"><span>Snatch odds</span><b class="${bestOdds && bestOdds > 0.5 ? 'gold' : (bestOdds && bestOdds > 0.3 ? '' : 'danger')}">${oddsLabel}</b></div>
              <div class="btn-row">
                <button data-approach="${g.id}" class="btn-small btn-primary" data-tooltip="Open the snatch loadout. Stack any drugs + tools you want, then drag her under — every miss only makes the next grab easier.">Snatch →</button>
                <button data-walk="${g.id}" class="btn-small" data-tooltip="Skip her. No cost, no notoriety.">Walk away</button>
              </div>
            </div>`;
          }).join('')}
        </div>
      </div>
    `;

    // Stash current roll in module state so approach page can find them
    window._DMTH_lastEncounters = encounters;
    window._DMTH_lastLocationId = locId;

    el.querySelectorAll('[data-approach]').forEach(b => {
      b.onclick = () => window.DMTHRouter.go('hunt', { stage: 'approach', girl: b.dataset.approach, loc: locId });
    });
    el.querySelectorAll('[data-walk]').forEach(b => {
      b.onclick = () => window.DMTHRouter.go('hunt');
    });

    // LOOT.2 — search the area for tools/drugs/gear/cash.
    const scavBtn = el.querySelector('#scavenge-area');
    if (scavBtn) scavBtn.onclick = () => {
      const r = window.DMTHGame.loot.scavengeLocation(locId);
      if (!r.ok && window.DMTHNotify) window.DMTHNotify.show(`🔦 ${r.reason || 'nothing found'}.`, { type: 'info', durationMs: 3000 });
    };

    // Make the whole card clickable — click anywhere on a girl card to approach her
    el.querySelectorAll('.approach-card').forEach(card => {
      card.style.cursor = 'pointer';
      card.onclick = (ev) => {
        // Ignore clicks on inner buttons (they have their own handlers)
        if (ev.target.closest('button, a')) return;
        const id = card.querySelector('[data-approach]')?.dataset.approach;
        if (id) window.DMTHRouter.go('hunt', { stage: 'approach', girl: id, loc: locId });
      };
    });

    // Per-encounter thumbnail generation — SEQUENTIAL (one at a time, in order).
    // Pass girl object directly (not via state) so we don't pollute roster with encounters.
    (async () => {
      for (let i = 0; i < encounters.length; i++) {
        const g = encounters[i];
        const card = el.querySelector(`[data-approach="${g.id}"]`)?.closest('.girl-card');
        if (!card) continue;
        const slot = document.createElement('div');
        slot.className = 'hunt-thumb-slot small muted';
        slot.textContent = `📷 generating ${i+1}/${encounters.length}…`;
        card.insertBefore(slot, card.firstChild.nextSibling);

        const situation = `hunt-encounter-${locId}`;
        try {
          const result = await window.DMTHGame.imaging.generateFor(g, { situation, locationId: locId });
          if (result && result.url) {
            slot.innerHTML = `<img src="${result.url}" alt="${g.name}" class="gen-img hunt-thumb" onerror="this.outerHTML='<div class=\\'small muted\\'>(image blocked — click to approach anyway)</div>';" />`;
          } else {
            slot.innerHTML = `<div class="small muted">(no thumb — ${result?.error || 'skipped'})</div>`;
          }
        } catch (err) {
          slot.innerHTML = `<div class="small muted">(thumb error — click to approach anyway)</div>`;
        }
      }
    })();
  }

  // CAPNAME.1 / CAPEASE.1 / CAPSTACK.1 — the SNATCH loadout. Stack any owned drugs + tools (each
  // one additively boosts the grab), then hit ONE button to drag her under. Misses don't end the
  // encounter — they make the player DESPERATE so the next grab is easier (the ~3rd is basically a
  // lock). She never escapes the snatch loop, so the player never gets stuck.
  function renderApproach(el, params) {
    const encounters = window._DMTH_lastEncounters || [];
    const girl = encounters.find(g => g.id === params.girl);
    const locId = params.loc;
    if (!girl) { el.innerHTML = `<p>encounter expired — <a href="#hunt">back to map</a></p>`; return; }
    const locName = window.DMTHAssets.getById('location', locId)?.displayName;
    const cap = window.DMTHGame.capture;

    // Encounter-scoped state — survives re-renders, resets on navigate-away.
    let desperationTier = 0;
    const selected = new Set();   // CAPSTACK loadout — tool ids stacked for the next grab
    const attemptHistory = [];    // [{toolIds, roll, chance}]

    function rerender() {
      const tools = cap.eligibleSimpleTools();   // [{id, chance, owned}]
      // Drop any selected tool we no longer own (single-use ones get spent on a miss).
      for (const id of [...selected]) { if (!tools.find(t => t.id === id)) selected.delete(id); }

      const suspicionNow = window.DMTHGame.state.current?.wallet?.suspicionByLocation?.[locId] || 0;
      const despBonus = cap.desperationBonus(desperationTier);
      const despLabel = cap.desperationLabel(desperationTier);
      const despEmoji = ['🙂','😤','🔥','😈','😈'][desperationTier] || '😈';
      const despColor = ['','','warn','gold','gold'][desperationTier] || 'gold';
      const combined = selected.size ? cap.stackedChance([...selected], desperationTier) : 0;
      const combinedPct = Math.round(combined * 100);

      const toolCards = tools.length === 0
        ? `<p class="small danger">No snatch tools in inventory. <a href="#shop">Shop →</a></p>`
        : tools.map(t => {
            const item = window.DMTHAssets.getById('item', t.id);
            const sel = selected.has(t.id);
            return `
              <button class="btn-small loadout-tool${sel ? ' sel' : ''}" data-tool="${t.id}" data-tooltip="${(item?.notes || '').replace(/"/g, '&quot;')}" style="display:flex;align-items:center;gap:8px;padding:9px 13px;${sel ? 'outline:2px solid var(--gold,#d4af37);' : ''}">
                <span style="font-size:1.3rem;">${sel ? '☑' : '☐'} ${item?.emoji || '🔧'}</span>
                <span style="flex:1;text-align:left;">
                  <b>${item?.displayName || t.id}</b><br>
                  <span class="small muted">have ×${t.owned} · +${Math.round(t.chance * 100)}% each</span>
                </span>
              </button>
            `;
          }).join('');

      const historyHtml = attemptHistory.length === 0 ? '' : `
        <div class="small muted" style="margin-top:10px;">
          <b>Misses this encounter:</b>
          <ul style="margin:4px 0 0;padding-left:20px;">
            ${attemptHistory.map((a, i) => `<li>#${i+1} ${a.toolIds.map(id => window.DMTHAssets.getById('item', id)?.emoji || '🔧').join('')} → rolled ${Math.round(a.roll * 100)} vs ${Math.round(a.chance * 100)}%</li>`).join('')}
          </ul>
        </div>
      `;

      // REQUEST.1 — pre-capture "ask her for something" panel. Three type-specific options,
      // stat-rolled odds shown per option, once per game-day per girl-type per location.
      const reqInfo = (window.DMTHGame.loot && window.DMTHGame.loot.requestOptions)
        ? window.DMTHGame.loot.requestOptions(girl, locId) : { usedToday: false, options: [] };
      const reqHtml = `
        <div class="panel">
          <h2>Ask her for something</h2>
          <p class="small muted">Sweet-talk one item out of her before you make your move. What she carries depends on her type — cheap gear comes easy, the good stuff rarely. One ask per girl-type here per day.</p>
          ${reqInfo.usedToday
            ? `<p class="small warn">You already worked a ${escapeHtml(girl.archetypeTemplate)} here today. Come back tomorrow.</p>`
            : `<div class="btn-col" style="gap:6px;">
                ${reqInfo.options.map((o, i) => {
                  const pct = Math.round(o.chance * 100);
                  const cc = pct >= 70 ? '' : pct >= 40 ? 'warn' : 'danger';
                  return `
                    <button class="btn-small req-item-btn" data-req="${i}" data-tooltip="${o.tierLabel} — ${pct}% she gives it up (scales with your level, this location, and her stats)" style="display:flex;align-items:center;gap:8px;padding:9px 13px;">
                      <span style="flex:1;text-align:left;">🙏 ask for <b>${escapeHtml(o.label)}</b> <span class="small muted">(${o.tierLabel})</span></span>
                      <span class="bar-fill ${cc}" style="padding:3px 9px;border-radius:4px;font-weight:700;">${pct}%</span>
                    </button>`;
                }).join('')}
              </div>`}
          <div id="req-result"></div>
        </div>
      `;

      el.innerHTML = `
        <div class="panel">
          <h2>Approach: ${moodEmoji(girl)} ${girl.name}</h2>
          <p class="small muted">${girl.backstoryFragment}</p>
          <div class="stat-row small"><span>Archetype</span><b>${girl.archetypeTemplate}</b></div>
          <div class="stat-row small"><span>Location</span><b>${locName}</b></div>
          <div class="stat-row small"><span>Location suspicion</span><b class="${suspicionNow > 5 ? 'warn' : ''}">${suspicionNow}</b></div>
          <div class="btn-row">
            <a href="#hunt?stage=location&loc=${locId}" class="btn-small">← back</a>
          </div>
        </div>

        <div class="panel">
          <h2>Talk first</h2>
          <div class="btn-col">
            <button data-action="talk" class="btn-small" data-tooltip="Ollama-narrated first-encounter scene from her POV. Low commitment.">💬 Open with a line (low commitment)</button>
            <button data-action="walk" class="btn-small" data-tooltip="Leave the encounter. No cost, no notoriety, no inventory loss.">🚪 Walk away</button>
          </div>
        </div>

        ${reqHtml}

        <div class="panel">
          <h2>🩸 Snatch her</h2>
          <div class="stat-row" style="margin-bottom:8px;"><span>Your resolve</span><b class="${despColor}">${despEmoji} ${despLabel.toUpperCase()}${despBonus > 0 ? ` · +${Math.round(despBonus * 100)}% desperation` : ''}</b></div>
          <p class="small muted">Stack any drugs + tools — each one adds to your odds. Then drag her under. Every miss only makes you more desperate and the next grab easier (the third's basically a lock). She can't get away from you here.</p>
          <div class="btn-col" style="gap:6px;">
            ${toolCards}
          </div>
          <div class="btn-row" style="margin-top:10px;align-items:center;gap:10px;">
            <button id="snatch-btn" class="btn-small btn-primary" ${selected.size === 0 ? 'disabled' : ''} data-tooltip="Fire the grab with your whole loadout. Single-use items (drugs / tape / rope) are spent; reusable gear (pipe / cuffs / shackles / harness) isn't.">🩸 Drag her under — ${selected.size === 0 ? 'pick gear' : combinedPct + '%'}</button>
            ${selected.size ? `<span class="small muted">${selected.size} item${selected.size > 1 ? 's' : ''} stacked</span>` : ''}
          </div>
          ${historyHtml}
        </div>

        <div id="result"></div>
      `;

      el.querySelector('[data-action="talk"]').onclick = async () => {
        const resultEl = el.querySelector('#result');
        resultEl.innerHTML = `<div class="panel"><p class="small muted">${girl.name} turns to look at you…</p></div>`;
        await runSceneNarration({
          girl, sceneKey: 'first_encounter', sceneVars: { LOCATION: locName },
          userText: '', resultEl, heading: `${girl.name} says:`
        });
      };
      el.querySelector('[data-action="walk"]').onclick = () => window.DMTHRouter.go('hunt');

      // REQUEST.1 — ask-for-an-item handlers. Roll the chosen option, show the result, then
      // re-render so the now-spent daily attempt locks the panel until tomorrow.
      el.querySelectorAll('.req-item-btn').forEach(btn => {
        btn.onclick = () => {
          el.querySelectorAll('.req-item-btn').forEach(b => { b.disabled = true; });
          const idx = parseInt(btn.dataset.req, 10);
          const r = window.DMTHGame.loot.requestItem(girl, locId, idx);
          const rr = el.querySelector('#req-result');
          const rolled = (r.roll != null && r.chance != null) ? ` <span class="muted">(rolled ${Math.round(r.roll * 100)} vs ${Math.round(r.chance * 100)}%)</span>` : '';
          if (r.ok) {
            rr.innerHTML = `<div class="panel"><p class="small gold">🎁 She gives it up — 1× ${escapeHtml(String(r.id).replace(/-/g, ' '))} added to your kit.${rolled}</p></div>`;
          } else if (r.usedToday) {
            rr.innerHTML = `<div class="panel"><p class="small warn">${escapeHtml(r.reason)}.</p></div>`;
          } else {
            rr.innerHTML = `<div class="panel"><p class="small">😒 ${escapeHtml(girl.name)} ${escapeHtml(r.reason || 'refuses')}.${rolled}</p></div>`;
          }
          setTimeout(rerender, 1100);
        };
      });

      // CAPSTACK.1 — toggle a tool in/out of the loadout, then re-render so the combined odds update.
      el.querySelectorAll('.loadout-tool').forEach(btn => {
        btn.onclick = () => {
          const id = btn.dataset.tool;
          if (selected.has(id)) selected.delete(id); else selected.add(id);
          rerender();
        };
      });

      // Fire the stacked grab. Success → escort + transition. Miss → desperation up, re-render
      // (the next grab is easier). She never escapes the loop (CAPEASE.1).
      const snatchBtn = el.querySelector('#snatch-btn');
      if (snatchBtn) snatchBtn.onclick = async () => {
        if (selected.size === 0) return;
        snatchBtn.disabled = true;
        const toolIds = [...selected];
        const result = cap.stackedAttempt({ girl, toolIds, locationId: locId, desperationTier });
        const resultEl = el.querySelector('#result');
        const toolNames = toolIds.map(id => window.DMTHAssets.getById('item', id)?.displayName || id).join(' + ');

        if (result.outcome === 'success' || result.outcome === 'success-no-room') {
          const heading = result.outcome === 'success'
            ? `<h3>🩸 SNATCHED — dragged under with ${toolNames}</h3>`
            : `<h3>⚠️ TAKEN BUT NO ROOM</h3><p class="warn small">${result.error || 'no open holds in active dungeon'} — upgrade or buy a dungeon first.</p>`;
          resultEl.innerHTML = `
            <div class="panel">
              ${heading}
              <div class="stat-row small"><span>Rolled</span><b>${Math.round(result.roll * 100)}</b> vs <b>${Math.round(result.chance * 100)}%</b></div>
              <div class="log"><div class="log-entry assistant streaming"><b>${girl.name}:</b> <span id="acquire-narr"></span></div></div>
            </div>
          `;
          await runSceneNarration({
            girl, sceneKey: result.outcome === 'success' ? 'acquire_success' : 'acquire_partial_fail',
            sceneVars: { LOCATION: locName, TOOL: toolNames },
            userText: '',
            injectInto: resultEl.querySelector('#acquire-narr')
          });
          if (result.outcome === 'success' && result.escort) {
            // LOCPERSIST.1 — she's taken; drop her from this location's persistent spawn set.
            try { window.DMTHGame.hunt.markEncounterCaptured(locId, girl.id); } catch (e) { /* non-fatal */ }
            const sceneVars = window.DMTHGame.hunt.composeSceneVars({
              girl, toolId: toolIds[0], locationId: locId, dungeonId: result.escort.dungeonId
            });
            await playTransitionSequence({ resultEl, girl, sceneVars });
            const followup = document.createElement('div');
            followup.className = 'btn-row';
            followup.innerHTML = `<a href="#room?girl=${girl.id}" class="btn-primary">Enter her hold →</a>`;
            resultEl.querySelector('.panel').appendChild(followup);
          }
          return;
        }

        if (result.outcome === 'fail') {
          resultEl.innerHTML = `<div class="panel"><p class="small danger">Can't grab — ${escapeHtml(result.reason || 'no gear selected')}.</p></div>`;
          setTimeout(rerender, 700);
          return;
        }

        // Miss — desperation rises (next grab easier), encounter continues, no escape.
        attemptHistory.push({ toolIds, roll: result.roll, chance: result.chance });
        desperationTier = result.desperationTier;
        const line = cap.desperationNarration(desperationTier) || "she twists out of your grip — but you're not done with her";
        resultEl.innerHTML = `
          <div class="panel">
            <h3>❌ She slipped you — grab her again</h3>
            <div class="stat-row small"><span>Rolled</span><b>${Math.round(result.roll * 100)}</b> vs <b>${Math.round(result.chance * 100)}%</b></div>
            <div class="stat-row small"><span>Your resolve</span><b class="warn">${cap.desperationLabel(desperationTier).toUpperCase()} — ${line}</b></div>
            <p class="small muted">The next grab is easier — stack more gear and drag her under again. She isn't getting away.</p>
          </div>
        `;
        setTimeout(rerender, 1100);
      };
    }

    rerender();
  }

  // Animate one progress bar from 0% to its final value over ~600ms.
  function animateProgressBar(meterEl, finalProgress, cleared) {
    return new Promise(resolve => {
      const bar = meterEl.querySelector('.capture-progress-bar');
      const pct = meterEl.querySelector('.capture-progress-pct');
      if (!bar || !pct) { resolve(); return; }
      const start = performance.now();
      const duration = 600;
      function step(now) {
        const t = Math.min(1, (now - start) / duration);
        const eased = 1 - Math.pow(1 - t, 3);
        const current = Math.round(finalProgress * eased);
        bar.style.width = current + '%';
        pct.textContent = current + '%' + (cleared && t >= 1 ? ' ✓' : '');
        if (t < 1) requestAnimationFrame(step);
        else {
          if (cleared) meterEl.classList.add('cleared');
          else meterEl.classList.add('failed');
          meterEl.classList.remove('in-progress', 'idle');
          resolve();
        }
      }
      meterEl.classList.add('in-progress');
      requestAnimationFrame(step);
    });
  }

  // Pick the highest-stage-stat tool from the cleared stages (for narration "TOOL").
  function pickHeroToolFromStages(stages) {
    let best = null;
    let bestStat = -1;
    for (const s of stages) {
      if (!s.toolId || !s.cleared) continue;
      if (s.toolBonus > bestStat) {
        bestStat = s.toolBonus;
        best = s.toolId;
      }
    }
    return best;
  }

  // Play the 4-beat capture transition as sequential Ollama scenes.
  async function playTransitionSequence({ resultEl, girl, sceneVars }) {
    const beats = [
      { key: 'transition_subdue',        heading: '🔸 beat 1 — subdue' },
      { key: 'transition_transport',     heading: '🔸 beat 2 — transport' },
      { key: 'transition_arrival',       heading: '🔸 beat 3 — arrival' },
      { key: 'transition_first_moment',  heading: '🔸 beat 4 — first moment in her hold' }
    ];
    const container = document.createElement('div');
    container.className = 'panel transition-panel';
    container.innerHTML = `<h3>📽️ Capture transition</h3><div class="transition-log"></div>`;
    resultEl.appendChild(container);
    const logEl = container.querySelector('.transition-log');

    for (const beat of beats) {
      const beatDiv = document.createElement('div');
      beatDiv.className = 'log-entry assistant streaming';
      beatDiv.innerHTML = `<b>${beat.heading}</b><br><span></span>`;
      logEl.appendChild(beatDiv);
      const spanEl = beatDiv.querySelector('span');
      try {
        const system = window.DMTHTemplates.buildSystemPrompt(girl, 'sexy', beat.key, sceneVars);
        const { raw, parsed } = await window.DMTHGame.ollama.chatStream({
          system,
          messages: [{ role: 'user', content: '(play out this beat in first person from her POV)' }],
          onChunk: (chunk, full) => {
            spanEl.textContent = full.replace(/<delta>[\s\S]*?<\/delta>/g, '').trim();
            logEl.scrollTop = logEl.scrollHeight;
          }
        });
        spanEl.textContent = (parsed.cleanText || raw).trim();
        beatDiv.classList.remove('streaming');
        // Append to girl's turn log so she remembers her own narration
        window.DMTHGame.state.appendTurn(girl.id, 'assistant', `[${beat.heading}] ${spanEl.textContent}`);
      } catch (err) {
        spanEl.textContent = `(Ollama unreachable — beat skipped: ${err.message})`;
        beatDiv.classList.remove('streaming');
      }
    }
  }

  // Run a scene narration — calls Ollama with the scene template, streams text into a DOM target.
  async function runSceneNarration({ girl, sceneKey, sceneVars, userText = '', resultEl, heading, injectInto }) {
    try {
      const system = window.DMTHTemplates.buildSystemPrompt(girl, 'sexy', sceneKey, sceneVars);
      let target = injectInto;
      if (!target && resultEl) {
        resultEl.innerHTML = `<div class="panel"><h3>${heading || girl.name}</h3><div class="log"><div class="log-entry assistant streaming"><b>${girl.name}:</b> <span id="narr-txt"></span></div></div></div>`;
        target = resultEl.querySelector('#narr-txt');
      }
      const { raw, parsed } = await window.DMTHGame.ollama.chatStream({
        system,
        messages: [{ role: 'user', content: userText || `(Master initiates the scene — narrate from your POV.)` }],
        onChunk: (chunk, full) => {
          if (!target) return;
          target.textContent = full.replace(/<delta>[\s\S]*?<\/delta>/g, '').trim();
        }
      });
      if (target) target.textContent = (parsed.cleanText || raw).trim();
    } catch (err) {
      if (resultEl) {
        resultEl.insertAdjacentHTML('beforeend', `<p class="small danger">(Ollama unreachable: ${err.message} — game mechanics still applied.)</p>`);
      } else if (injectInto) {
        injectInto.textContent = `(Ollama unreachable: ${err.message} — mechanics applied.)`;
      }
    }
  }

  function moodEmoji(g) { return g.mood?.moodEmoji || '😐'; }
  function escapeHtml(s) {
    return String(s ?? '').replace(/[&<>"']/g, c => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[c]));
  }

  window.DMTHRouter.register('hunt', render);
})();
