// DUNGEON MASTER: THE HUNT — in-game settings + save slots panel.

(function () {
  'use strict';

  async function render(el) {
    try {
      await renderInner(el);
    } catch (err) {
      // Surface render failures visibly instead of leaving a blank/stale panel.
      // Without this, a missing global or bad reference would silently abort the
      // settings page and the player would see whatever was rendered last.
      console.error('[settings] render failed:', err);
      el.innerHTML = `
        <div class="panel" style="background:#3a0a14;border:2px solid #ff3060;">
          <h2 style="color:#ff7aa8;">⚠️ Settings failed to render</h2>
          <p>JavaScript error during settings render. Most likely cause: <b>stale browser cache</b> after a code update.</p>
          <p><b>Try first:</b> hard-refresh the page — Ctrl+Shift+R (Windows/Linux) or Cmd+Shift+R (Mac).</p>
          <p><b>If that doesn't fix it:</b> open DevTools (F12) → Console tab → reload → paste the red error here.</p>
          <pre style="background:#1a0a14;padding:10px;border-radius:4px;overflow:auto;font-size:0.85rem;">${String(err && err.stack || err).replace(/&/g,'&amp;').replace(/</g,'&lt;')}</pre>
          <a href="#dashboard" class="btn-small">← back to dashboard</a>
        </div>
      `;
    }
  }

  async function renderInner(el) {
    const cfg = window.DMTHConfig;
    const voices = window.DMTHVoices.VOICES;
    const catalog = cfg.OLLAMA.modelCatalog;
    const slots = await window.DMTHGame.saveSlots.listSlots();

    el.innerHTML = `
      <div class="panel">
        <h2>⚙️ Settings</h2>
        <p class="small muted">Changes save immediately. Some settings may need a reload.</p>
        <a href="#dashboard" class="btn-small">← back</a>
      </div>

      <div class="panel">
        <h2>Save slots</h2>
        <p class="small muted">Multiple named saves. 'main' is the live slot; copy to a lettered slot to keep a backup.</p>
        <div class="girl-grid">
          ${slots.map(s => `
            <div class="model-card ${s.isActive ? 'active' : ''}">
              <div class="model-name">${s.isActive ? '✓ ' : ''}${s.id}</div>
              ${s.exists ? `
                <div class="small muted">${new Date(s.createdAt).toLocaleString()}</div>
                <div class="stat-row small"><span>Captives</span><b>${s.captiveCount}</b></div>
                <div class="stat-row small"><span>Money</span><b>$${s.money.toLocaleString()}</b></div>
                <div class="stat-row small"><span>Notoriety</span><b>${s.notoriety}</b></div>
                <div class="stat-row small"><span>Ticks</span><b>${s.tickCount}</b></div>
              ` : `<div class="muted small">empty</div>`}
              <div class="btn-row">
                ${s.id !== 'main' ? `<button class="btn-small" data-save-to="${s.id}" data-tooltip="Copy your live 'main' game into this backup slot, overwriting whatever's here.">Save from main</button>` : ''}
                ${s.exists && s.id !== 'main' ? `<button class="btn-small btn-primary" data-load-from="${s.id}" data-tooltip="Load this slot into 'main' — your current live game is overwritten. Confirms first.">Load</button>` : ''}
                ${s.exists && s.id !== 'main' ? `<button class="btn-small btn-danger" data-wipe="${s.id}" data-tooltip="Permanently delete this backup slot. Doesn't touch your live 'main' game.">Wipe</button>` : ''}
              </div>
            </div>
          `).join('')}
        </div>
      </div>

      <div class="panel">
        <h2>Ollama</h2>
        <label class="field" data-tooltip="The local Ollama model that voices every girl + NPC. Use an uncensored/abliterated build (dolphin / etc.) so it never refuses the content. Changing it reloads the game."><span>Model</span>
          <select id="s-model">${catalog.map(m => `<option value="${m.id}" ${m.id === cfg.OLLAMA.activeModel ? 'selected' : ''}>${m.displayName}</option>`).join('')}</select>
        </label>
        <label class="field" data-tooltip="Sampling temperature 0–2. Lower = more focused/consistent; higher = wilder/more varied. ~0.8–1.0 is the sweet spot for in-character filth. Reloads on change."><span>Temperature</span>
          <input type="number" id="s-temp" step="0.05" min="0" max="2" value="${cfg.OLLAMA.temperature}" />
        </label>
        <div class="stat-row" style="margin-top:10px">
          <span data-tooltip="Whether the active model actually answers a real chat ping right now.">Model health</span>
          <span id="s-ollama-health" class="small muted">click check →</span>
          <button class="btn-small" id="s-check-health" data-tooltip="Probe the active model with a real chat ping — tells you if it's healthy or its weights are missing/corrupt.">🩺 Check now</button>
          <button class="btn-small btn-primary" id="s-repair-now" data-tooltip="Re-pull (re-download) the model weights — fixes a model whose files got deleted by disk cleanup, without leaving the game.">🔧 Re-pull (repair)</button>
        </div>
        <p class="small muted">Probes the active model with a real chat ping. If weights were deleted from disk (Windows Storage Sense, cleanup tools), re-pull fixes it without leaving the game.</p>
      </div>

      <div class="panel">
        <h2>Kokoro voice (default)</h2>
        <label class="field" data-tooltip="Default Kokoro TTS voice for new captives (each girl can still be re-voiced in her room). Only girls speak aloud — johns/friends are text-only. Reloads on change."><span>Voice</span>
          <select id="s-voice">${voices.map(v => `<option value="${v.id}" ${v.id === cfg.KOKORO.defaultFemaleVoice ? 'selected' : ''}>${v.displayName} (${v.accent}) — ${v.timbre}</option>`).join('')}</select>
        </label>
        <label class="field" data-tooltip="Playback speed 0.5–2× for the spoken voice. 1.0 = natural. Reloads on change."><span>Speed</span>
          <input type="number" id="s-speed" step="0.05" min="0.5" max="2" value="${cfg.KOKORO.defaultSpeed}" />
        </label>
        <label class="field" style="flex-direction:row;align-items:center;gap:8px;cursor:pointer" data-tooltip="DISABLE Kokoro entirely — the model never loads, never warms, never speaks (saves memory + CPU). Different from the header 🔊 MUTE, which only silences playback while keeping the engine resident + warm. Reloads on change.">
          <input type="checkbox" id="s-kokoro-off" ${localStorage.getItem('dmth_kokoro_disabled') === '1' ? 'checked' : ''} />
          <span>🔇 Disable Kokoro entirely — don't load the voice model at all (vs. the header 🔊 button which just mutes playback).</span>
        </label>
      </div>

      <div class="panel">
        <h2>Local image + voice servers</h2>
        <p class="small muted" style="margin-bottom:10px;">
          Both run on this machine — no cloud, no API keys. Start / install via the
          <code>scripts/</code> folder (batches for Windows, .sh for Linux). Override the
          endpoints only if you moved them off the default loopback ports.
        </p>
        <label class="field" data-tooltip="Local Stable Diffusion server endpoint. Default http://127.0.0.1:7860. Run scripts/start_image_gen (Windows: .bat, Linux: .sh). Install script pulls torch + diffusers + a ~2GB uncensored checkpoint."><span>Image endpoint (local SD)</span>
          <input type="text" id="s-local-image-endpoint" value="${cfg.LOCAL_IMAGE.endpoint}" placeholder="http://127.0.0.1:7860" />
        </label>
        <label class="field" data-tooltip="Local speech-to-text endpoint. Default http://127.0.0.1:7861. Whisper-small under faster-whisper, GPU-first with a CPU fallback. TTS still runs in the browser via Kokoro."><span>Voice endpoint (local STT)</span>
          <input type="text" id="s-local-voice-endpoint" value="${cfg.LOCAL_VOICE.endpoint}" placeholder="http://127.0.0.1:7861" />
        </label>
      </div>

      <div class="panel">
        <h2>Interface</h2>
        <label class="field" style="flex-direction:row;align-items:center;gap:8px;cursor:pointer">
          <input type="checkbox" id="s-lootpop-off" ${localStorage.getItem('dmth_lootpops_off') === '1' ? 'checked' : ''} />
          <span>🔕 Silence loot pop-ups — loot still goes straight to your inventory, you just skip the click-away popup. Handy in end-game when the gains come fast.</span>
        </label>
      </div>

      <div class="panel">
        <h2>📸 Scene / Images</h2>
        ${(() => { const t = window.DMTHGame.state.getSceneToggles ? window.DMTHGame.state.getSceneToggles() : {}; return `
        <label class="field" style="flex-direction:row;align-items:center;gap:8px;cursor:pointer">
          <input type="checkbox" id="s-tog-player" ${t.playerInShot ? 'checked' : ''} />
          <span>🤳 Put me in the shot — your created character renders into every scene image WITH the girl (actively using her), instead of her solo.</span>
        </label>
        <label class="field" style="flex-direction:row;align-items:center;gap:8px;cursor:pointer">
          <input type="checkbox" id="s-tog-pov" ${t.pov ? 'checked' : ''} />
          <span>👁️ POV shots — scene images render first-person from your eyes (your own arms/hands in frame). Overrides "in the shot".</span>
        </label>
        <label class="field" style="flex-direction:row;align-items:center;gap:8px;cursor:pointer">
          <input type="checkbox" id="s-tog-watch" ${t.watchVisitors ? 'checked' : ''} />
          <span>👁️‍🗨️ Watch her visitors — when a whored-out girl gets used, the scene image shows her WITH the john/friend on her (not solo). Voiced gangbangs already do this.</span>
        </label>
        `; })()}
      </div>

      <div class="panel">
        <h2>Danger zone</h2>
        <div class="btn-row">
          <button class="btn-small btn-danger" id="new-game-btn" data-tooltip="Wipe the current save + open new-game setup. KEEPS your Ollama / Kokoro / local-endpoint settings. Confirms first.">🔄 Start over (new game)</button>
          <button class="btn-small btn-danger" id="wipe-all" data-tooltip="Wipe IndexedDB + every dmth_* localStorage key (all saves AND settings). Age-gate stays accepted. Cannot be undone.">💥 Wipe ALL saves + settings</button>
          <button class="btn-small btn-danger" id="full-nuke" style="border:2px solid #ff3060;background:#3a0a14;" data-tooltip="Burns the whole origin down — IndexedDB, ALL localStorage (incl. 18+ age verification + ToS acceptance), sessionStorage. You re-verify 18+ + re-accept ToS on next load. No traces. Double-confirms.">☢️ FULL NUKE — delete ALL user data (fresh slate)</button>
        </div>
        <p class="small muted">
          <b>Start over</b> — wipes the current save, opens the new-game setup. Keeps Ollama/Kokoro/local-endpoint settings.<br>
          <b>Wipe ALL saves + settings</b> — wipes IndexedDB + every <code>dmth_*</code> localStorage key. Age-gate stays accepted.<br>
          <b>FULL NUKE</b> — burns the whole origin down: IndexedDB, ALL localStorage (incl. age verification + ToS acceptance), sessionStorage. You'll re-verify 18+ and re-accept ToS on next load. Fresh slate, no traces.
        </p>
      </div>
    `;

    // LOOTPOP-TOGGLE — silence loot pop-ups (loot still flows to inventory). No reload needed.
    const lootPopChk = el.querySelector('#s-lootpop-off');
    if (lootPopChk) lootPopChk.onchange = e => {
      if (e.target.checked) localStorage.setItem('dmth_lootpops_off', '1');
      else localStorage.removeItem('dmth_lootpops_off');
    };

    // player/scene image toggles (no reload; roomScene reads them live on next regen).
    const togPlayer = el.querySelector('#s-tog-player');
    if (togPlayer) togPlayer.onchange = e => window.DMTHGame.state.setSceneToggles({ playerInShot: e.target.checked });
    const togPov = el.querySelector('#s-tog-pov');
    if (togPov) togPov.onchange = e => window.DMTHGame.state.setSceneToggles({ pov: e.target.checked });
    const togWatch = el.querySelector('#s-tog-watch');
    if (togWatch) togWatch.onchange = e => window.DMTHGame.state.setSceneToggles({ watchVisitors: e.target.checked });

    el.querySelector('#s-model').onchange = e => { localStorage.setItem('dmth_ollama_model', e.target.value); location.reload(); };
    el.querySelector('#s-temp').onchange  = e => { localStorage.setItem('dmth_ollama_temp', e.target.value); location.reload(); };

    // Ollama health check + manual repair
    const healthEl = el.querySelector('#s-ollama-health');
    const checkBtn = el.querySelector('#s-check-health');
    const repairBtn = el.querySelector('#s-repair-now');
    async function runHealthCheck() {
      if (!window.DMTHOllamaRepair) {
        healthEl.textContent = 'repair module not loaded';
        return null;
      }
      healthEl.textContent = '⏳ probing…';
      const probe = await window.DMTHOllamaRepair.probeModelHealth(cfg.OLLAMA.activeModel);
      if (probe.status === 'ok') {
        healthEl.textContent = '✓ healthy';
        healthEl.style.color = '#53d68a';
      } else {
        healthEl.textContent = `✗ ${probe.diagnosis?.label || probe.status}`;
        healthEl.style.color = '#ff7aa8';
      }
      return probe;
    }
    if (checkBtn) {
      checkBtn.onclick = async () => {
        checkBtn.disabled = true;
        await runHealthCheck();
        checkBtn.disabled = false;
      };
    }
    if (repairBtn) {
      repairBtn.onclick = async () => {
        if (!window.DMTHOllamaRepairOverlay) {
          alert('Repair overlay not loaded.');
          return;
        }
        const probe = await runHealthCheck();
        const diag = probe?.diagnosis || {
          code: 'unknown',
          label: 'Manual repair',
          modelId: cfg.OLLAMA.activeModel,
          detail: 'You requested a manual re-pull. This re-downloads the model weights.',
          fix: `ollama pull ${cfg.OLLAMA.activeModel}`
        };
        const result = await window.DMTHOllamaRepairOverlay.show({
          diagnosis: diag,
          modelId: cfg.OLLAMA.activeModel,
          reason: 'manual repair from in-game settings'
        });
        if (result && result.repaired) await runHealthCheck();
      };
    }
    el.querySelector('#s-voice').onchange = e => { localStorage.setItem('dmth_kokoro_voice', e.target.value); location.reload(); };
    el.querySelector('#s-speed').onchange = e => { localStorage.setItem('dmth_kokoro_speed', e.target.value); location.reload(); };
    // Hard-disable Kokoro (vs the header mute). Reload so boot honors it (skips the model load).
    const kokoroOff = el.querySelector('#s-kokoro-off');
    if (kokoroOff) kokoroOff.onchange = e => {
      if (e.target.checked) { localStorage.setItem('dmth_kokoro_disabled', '1'); try { window.DMTHKokoro?.releaseKeepWarm?.(); } catch {} }
      else localStorage.removeItem('dmth_kokoro_disabled');
      location.reload();
    };
    const localImageEndpointEl = el.querySelector('#s-local-image-endpoint');
    if (localImageEndpointEl) localImageEndpointEl.onchange = e => {
      localStorage.setItem('dmth_local_image_endpoint', e.target.value.trim() || 'http://127.0.0.1:7860');
      location.reload();
    };
    const localVoiceEndpointEl = el.querySelector('#s-local-voice-endpoint');
    if (localVoiceEndpointEl) localVoiceEndpointEl.onchange = e => {
      localStorage.setItem('dmth_local_voice_endpoint', e.target.value.trim() || 'http://127.0.0.1:7861');
      location.reload();
    };

    el.querySelectorAll('[data-save-to]').forEach(b => {
      b.onclick = async () => {
        try { await window.DMTHGame.saveSlots.saveTo(b.dataset.saveTo); window.DMTHNotify.show(`Saved to ${b.dataset.saveTo}`, { type: 'success' }); window.DMTHRouter.handle(); }
        catch (e) { alert(e.message); }
      };
    });
    el.querySelectorAll('[data-load-from]').forEach(b => {
      b.onclick = async () => {
        if (!confirm(`Load from ${b.dataset.loadFrom}? Current game will be overwritten.`)) return;
        await window.DMTHGame.saveSlots.loadFrom(b.dataset.loadFrom);
        location.reload();
      };
    });
    el.querySelectorAll('[data-wipe]').forEach(b => {
      b.onclick = async () => {
        if (!confirm(`Wipe ${b.dataset.wipe}?`)) return;
        await window.DMTHGame.saveSlots.wipeSlot(b.dataset.wipe);
        window.DMTHRouter.handle();
      };
    });

    // Pre-wipe shutdown sequence prevents the 30-second tick from firing a background
    // save() that repopulates IndexedDB after wipeAll(). The _nuking flag short-circuits
    // state.save() while the wipe is in flight.
    function shutdownBeforeWipe() {
      try { if (window.DMTHGame?.tick) window.DMTHGame.tick.stop(); } catch {}
      try { if (window.DMTHVoiceQueue) window.DMTHVoiceQueue.cancel(); } catch {}
      try { if (window.DMTHGame?.state) window.DMTHGame.state._nuking = true; } catch {}
    }

    el.querySelector('#new-game-btn').onclick = async () => {
      if (!confirm('Start over? Wipes your current save but keeps your settings (Ollama model, Kokoro voice, local endpoints).')) return;
      shutdownBeforeWipe();
      await window.DMTHStorage.wipeAll();
      // Keep settings-y localStorage, wipe game-state pointers only
      const KEEP = new Set([
        'dmth_ollama_endpoint','dmth_ollama_model','dmth_ollama_temp',
        'dmth_kokoro_voice','dmth_kokoro_speed','dmth_kokoro_model','dmth_kokoro_dtype',
        'dmth_local_image_endpoint','dmth_local_voice_endpoint'
      ]);
      for (const k of Object.keys(localStorage)) {
        if (k.startsWith('dmth_') && !KEEP.has(k)) {
          localStorage.removeItem(k);
        }
      }
      location.hash = '#newgame';
      location.reload();
    };

    el.querySelector('#wipe-all').onclick = async () => {
      if (!confirm('WIPE ALL DATA? This cannot be undone.')) return;
      shutdownBeforeWipe();
      await window.DMTHStorage.wipeAll();
      for (const k of Object.keys(localStorage)) if (k.startsWith('dmth_')) localStorage.removeItem(k);
      location.reload();
    };

    // FULL NUKE — burns the origin down: IndexedDB + ALL localStorage (including
    // age-gate + ToS acceptance) + sessionStorage. No survivors.
    el.querySelector('#full-nuke').onclick = async () => {
      if (!confirm('FULL NUKE — delete EVERYTHING: game data, local endpoint overrides, age verification, ToS acceptance, all preferences. You will re-verify 18+ and re-accept the ToS on the next load. This cannot be undone. Proceed?')) return;
      if (!confirm('Second confirmation — really wipe ALL user data?')) return;
      shutdownBeforeWipe();
      try { await window.DMTHStorage.wipeAll(); } catch (e) { console.warn('IDB wipe failed:', e); }
      try { localStorage.clear(); } catch (e) { console.warn('localStorage clear failed:', e); }
      try { sessionStorage.clear(); } catch (e) { console.warn('sessionStorage clear failed:', e); }
      // Hard-reset hash + reload to landing page so age-gate fires from scratch
      location.href = './index.html';
    };
  }

  window.DMTHRouter.register('settings', render);
})();
