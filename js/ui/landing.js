// DUNGEON MASTER: THE HUNT — landing page controller.
// Renders: hero, status dashboard, setup wizard cards, LAUNCH button.
// No framework — direct DOM.

(function () {
  'use strict';

  const $ = sel => document.querySelector(sel);

  let currentStatus = null;
  let pollTimer = null;
  // Cache of the last full health probe so fast polls don't lose health state.
  // Health probes hit Ollama with a real chat call — too expensive for 3-sec polling.
  let lastHealth = { status: 'unknown', diagnosis: null, modelId: null, at: 0 };

  // ---------- render helpers ----------
  function statusPill(ok, label) {
    return `<span class="pill ${ok ? 'pill-ok' : 'pill-bad'}">${ok ? '✓' : '✗'} ${label}</span>`;
  }

  function renderStatus(s) {
    const ollamaOk   = s.ollama.reachable;
    const modelOk    = s.ollama.activeModelPresent;
    const kokoroOk   = s.kokoro.loaded;
    const storageOk  = s.storage.ready;
    const localImageReachable = !!(s.localImage && s.localImage.reachable);
    const localImageReady     = !!(s.localImage && s.localImage.ready);
    const localVoiceReachable = !!(s.localVoice && s.localVoice.reachable);
    const localVoiceReady     = !!(s.localVoice && s.localVoice.ready);

    // Merge live snapshot health with cached health (fast polls skip the probe)
    const liveHealth = s.ollama.activeModelHealth;
    const liveDiag = s.ollama.healthDiagnosis;
    let healthStatus = liveHealth;
    let healthDiag = liveDiag;
    if ((liveHealth === 'skipped' || liveHealth === 'no-probe-module' || !liveHealth) && lastHealth.status) {
      healthStatus = lastHealth.status;
      healthDiag = lastHealth.diagnosis;
    }
    const healthOk = healthStatus === 'ok' || healthStatus === 'skipped' || healthStatus === 'no-probe-module' || healthStatus === 'unknown';
    const broken = healthStatus === 'corrupt' || healthStatus === 'missing';
    const healthLabel = broken
      ? `❌ Model BROKEN: ${healthDiag?.label || healthStatus}`
      : (healthStatus === 'ok'
          ? `Model weights verified`
          : `Model weights — ${healthStatus}`);

    // Identify the next concrete action the visitor needs to take. Highest-priority
    // failing prereq surfaces as a big "👉 Next step" callout at the top so they see
    // it without scrolling — the old layout buried install instructions below the
    // status dashboard and visitors didn't realize they needed to scroll.
    let nextStep = null;
    if (!ollamaOk) {
      // CORS distinction — Ollama running locally but missing OLLAMA_ORIGINS is the
      // #1 silent failure mode for GitHub Pages → localhost. Call it out.
      const looksCors = s.ollama.reason === 'not-reachable-or-cors';
      nextStep = {
        title: looksCors ? '👉 Next: Install Ollama or enable CORS for this site' : '👉 Next: Install Ollama on your machine',
        detail: looksCors
          ? 'Ollama might already be running but your browser can\'t reach it. Set OLLAMA_ORIGINS=* in your environment and restart Ollama — see Step 2 below.'
          : 'Ollama is the LLM that runs the girls\' minds. It runs entirely on your machine. The Setup steps below give you a one-line install command for your OS.',
        target: '#ollama-setup'
      };
    } else if (!modelOk) {
      nextStep = {
        title: `👉 Next: Pull the ${s.ollama.activeModel} model`,
        detail: 'Ollama is running. Now pull the LLM weights — about 4GB, lives on your machine. Click Pull in the Model card below.',
        target: '#model-setup'
      };
    } else if (broken) {
      nextStep = {
        title: '⚠ Next: Repair broken model weights',
        detail: 'Ollama says the model is installed but the weights file is corrupt or missing. Use the Repair button below.',
        target: '#status-dash'
      };
    } else if (!kokoroOk) {
      nextStep = {
        title: '👉 Next: Load Kokoro TTS (in your browser)',
        detail: 'Neural voices that run entirely in your browser. ~80MB first-time download, then cached. Click Load Kokoro below.',
        target: '#kokoro-setup'
      };
    } else if (!storageOk) {
      nextStep = {
        title: '⚠ Next: Browser storage unavailable',
        detail: 'IndexedDB is blocked — likely Private Browsing mode or a strict extension. Open the site in a normal window.',
        target: null
      };
    }

    // Model-weights row hidden when its prereqs (Ollama reachable + model present) aren't
    // met. Previously this row rendered as "✓ Model weights — unknown" when Ollama wasn't
    // reachable, which read as misleading-green pill + confusing label simultaneously.
    const showWeightsRow = ollamaOk && modelOk;

    $('#status-dash').innerHTML = `
      ${nextStep ? `
        <div class="next-step-callout" style="margin-bottom:14px;padding:14px 16px;background:#1f2a3a;border-left:4px solid #5da8ff;border-radius:6px">
          <div style="font-weight:600;color:#9ec8ff;font-size:1.05rem;margin-bottom:6px">${escapeHtml(nextStep.title)}</div>
          <div style="font-size:0.92rem;opacity:0.92;margin-bottom:${nextStep.target ? '10px' : '0'}">${escapeHtml(nextStep.detail)}</div>
          ${nextStep.target ? `<a href="${nextStep.target}" class="btn-small btn-primary" data-jump="${nextStep.target}">Jump to fix ↓</a>` : ''}
        </div>
      ` : ''}
      <div class="status-row">${statusPill(ollamaOk, ollamaOk ? 'Ollama reachable' : (s.ollama.reason === 'not-reachable-or-cors' ? 'Ollama not reachable (install it OR set OLLAMA_ORIGINS=*)' : `Ollama not reachable (${s.ollama.reason || 'check that it\'s running'})`))}</div>
      <div class="status-row">${statusPill(modelOk, modelOk ? `Model present: ${s.ollama.activeModel}` : `Model not pulled: ${s.ollama.activeModel} (~4GB) — pull it below`)}</div>
      ${showWeightsRow ? `<div class="status-row">${statusPill(!broken && (healthStatus === 'ok' || healthStatus === 'unknown' || healthStatus === 'skipped' || healthStatus === 'no-probe-module'), healthLabel)}</div>` : ''}
      <div class="status-row">${statusPill(kokoroOk, kokoroOk ? 'Kokoro TTS loaded' : (s.kokoro.loading ? `Kokoro TTS loading (${Math.round((s.kokoro.progress||0)*100)}%)` : 'Kokoro TTS not loaded — click Load below'))}</div>
      <div class="status-row">${statusPill(storageOk, 'Save storage ready')}</div>
      <div class="status-row">${statusPill(localImageReady, localImageReady
          ? `Local image server ready (${escapeHtml(s.localImage.model || '')}${s.localImage.device ? ' · ' + escapeHtml(s.localImage.device) : ''})`
          : localImageReachable
            ? `Local image server: ${escapeHtml(s.localImage.state || 'unknown')}${s.localImage.state === 'no-checkpoint' ? ' — drop a .safetensors into models/' : ''}`
            : 'Local image server not running (optional — start scripts/start_image_gen)')}</div>
      <div class="status-row">${statusPill(localVoiceReady, localVoiceReady
          ? 'Local voice-in ready (mic → text on your machine)'
          : localVoiceReachable
            ? 'Local voice server up — STT model not downloaded (run scripts/install_voice)'
            : 'Local voice server not running (optional — mic-in disabled until started)')}</div>
      ${broken ? `
        <div class="status-row" style="margin-top:10px;padding:12px;background:#3a1820;border-left:3px solid #ff3d8a;border-radius:6px">
          <div style="font-weight:600;color:#ff7aa8;margin-bottom:6px">⚠ ${escapeHtml(healthDiag?.label || 'Model broken')}</div>
          <div style="font-size:0.86rem;opacity:0.9;margin-bottom:8px">${escapeHtml(healthDiag?.detail || '')}</div>
          <button id="landing-repair-btn" class="btn-primary">🔧 Repair ${escapeHtml(s.ollama.activeModel)} now</button>
          <button id="landing-recheck-btn" class="btn-small" style="margin-left:8px">↻ Re-check</button>
        </div>
      ` : ''}
    `;
    // Wire the "Jump to fix" anchor for smooth-scroll behavior.
    const jumpBtn = $('#status-dash [data-jump]');
    if (jumpBtn) {
      jumpBtn.onclick = (ev) => {
        const target = document.querySelector(jumpBtn.dataset.jump);
        if (target) {
          ev.preventDefault();
          target.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }
      };
    }

    // Wire repair + recheck buttons if shown
    const repairBtn = $('#landing-repair-btn');
    if (repairBtn) {
      repairBtn.onclick = async () => {
        if (!window.DMTHOllamaRepairOverlay) {
          alert('Repair module not loaded — open the page again.');
          return;
        }
        const result = await window.DMTHOllamaRepairOverlay.show({
          diagnosis: healthDiag,
          modelId: s.ollama.activeModel,
          reason: 'manual repair from landing page'
        });
        if (result && result.repaired) {
          await refreshDeep();
        }
      };
    }
    const recheckBtn = $('#landing-recheck-btn');
    if (recheckBtn) {
      recheckBtn.onclick = () => refreshDeep();
    }

    // Launch eligibility — strict core requires Ollama + healthy model + kokoro + storage.
    const canLaunch = ollamaOk && modelOk && healthOk && !broken && kokoroOk && storageOk;
    const btn = $('#launch-btn');
    btn.disabled = !canLaunch;
    btn.textContent = canLaunch
      ? '🔒 LAUNCH DUNGEON MASTER: THE HUNT'
      : (broken ? '🔒 Repair model to launch' : '🔒 Finish setup to launch');
  }

  function renderOllamaSetup(s) {
    const steps = window.DMTHInstaller.getInstallSteps(s.os);
    $('#ollama-setup').innerHTML = `
      <h3>1. Install + run Ollama</h3>
      <p class="small">Your OS: <code>${s.os}</code>. Ollama runs on YOUR machine — nothing leaves your box.</p>
      ${steps.steps.map((st, i) => `
        <div class="step-card">
          <div class="step-label">Step ${i+1}: ${st.label}</div>
          <pre class="code-block" id="ocmd-${i}">${escapeHtml(st.cmd)}</pre>
          <button class="btn-small" data-copy="ocmd-${i}">Copy</button>
          ${st.note ? `<div class="step-note">${escapeHtml(st.note)}</div>` : ''}
        </div>
      `).join('')}
      <div class="status-row">${statusPill(s.ollama.reachable, s.ollama.reachable ? 'Ollama online' : `Waiting... (${s.ollama.reason || 'not reachable'})`)}</div>
    `;
    // Copy buttons
    $('#ollama-setup').querySelectorAll('[data-copy]').forEach(b => {
      b.onclick = () => {
        const target = document.getElementById(b.dataset.copy);
        navigator.clipboard.writeText(target.textContent).then(() => {
          const prev = b.textContent; b.textContent = 'Copied!'; setTimeout(() => b.textContent = prev, 1500);
        });
      };
    });
  }

  // Models already installed in Ollama that the catalog doesn't list (pulled by hand, custom
  // Modelfiles, other abliterated builds). Selectable as the active chat model. Embedding models
  // are skipped: the game uses one for memory search, and it can't hold a conversation.
  function renderOwnModels(s) {
    const D = window.DMTHDetector;
    const catalogIds = window.DMTHModels.getCatalog().map(m => D.normalizeModelId(m.id));
    const own = (s.ollama.models || []).filter(id =>
      !catalogIds.includes(D.normalizeModelId(id)) && !/embed/i.test(id));
    if (!own.length) return '';
    const active = D.normalizeModelId(s.ollama.activeModel);
    return `
      <h4 style="margin-top:18px">Your installed models</h4>
      <p class="small muted">Already on your machine but not in the list above. Pick any chat model — it is used for every girl's persona. Not every model holds persona content without refusing; the uncensored ones above are the safe bet.</p>
      <div class="model-grid">
        ${own.map(id => {
          const isActive = D.normalizeModelId(id) === active;
          const gb = (s.ollama.modelSizes && s.ollama.modelSizes[id]) ? (s.ollama.modelSizes[id] / 1e9).toFixed(1) + ' GB' : '';
          return `
            <div class="model-card ${isActive ? 'active' : ''}">
              <div class="model-name">${escapeHtml(id)}</div>
              <div class="model-meta">${gb ? `<span>${gb}</span>` : ''}<span class="tag-ok">installed</span></div>
              <div class="model-actions">
                ${isActive
                  ? `<button class="btn-small" disabled>Active ✓</button>`
                  : `<button class="btn-small" data-set-active="${escapeHtml(id)}">Set active</button>`}
              </div>
            </div>`;
        }).join('')}
      </div>`;
  }

  function renderModelSetup(s) {
    if (!s.ollama.reachable) {
      $('#model-setup').innerHTML = `<p class="small muted">Finish step 1 first (Ollama must be running).</p>`;
      return;
    }
    const catalog = window.DMTHModels.getCatalog();
    const hasModel = id => window.DMTHDetector.hasModel(s.ollama.models, id);
    const active = s.ollama.activeModel;

    $('#model-setup').innerHTML = `
      <h3>2. Pull a model</h3>
      <p class="small">These are uncensored / abliterated models that will hold persona without refusing. Pick one (recommended first) and pull it, or choose a model you already have under <b>Your installed models</b> below the list. Models live on your machine.</p>
      <div class="model-grid">
        ${catalog.map(m => {
          const isInstalled = hasModel(m.id);
          const isActive = window.DMTHDetector.normalizeModelId(m.id) === window.DMTHDetector.normalizeModelId(active);
          return `
            <div class="model-card ${isActive ? 'active' : ''}">
              <div class="model-name">${escapeHtml(m.displayName)}</div>
              <div class="model-meta">
                <span>${m.sizeGB.toFixed(1)} GB</span>
                ${m.uncensored ? '<span class="tag-unc">uncensored</span>' : ''}
                ${isInstalled ? '<span class="tag-ok">installed</span>' : ''}
              </div>
              <div class="model-notes">${escapeHtml(m.notes)}</div>
              <div class="model-actions">
                ${isActive && isInstalled
                  ? `<button class="btn-small" disabled data-tooltip="Already the active model — nothing to do here.">Active ✓</button>`
                  : isActive && !isInstalled
                    ? `<button class="btn-small btn-primary" data-pull="${m.id}" data-tooltip="This is the ACTIVE pick per your config, but the weights aren't downloaded yet. Click Pull to fetch them (~${m.sizeGB.toFixed(1)}GB).">Pull now (active pick — not installed yet)</button>`
                    : isInstalled
                      ? `<button class="btn-small" data-set-active="${m.id}">Set active</button>`
                      : `<button class="btn-small btn-primary" data-pull="${m.id}">Pull</button>`
                }
              </div>
              <div class="model-progress" id="mp-${cssId(m.id)}"></div>
            </div>
          `;
        }).join('')}
      </div>
      ${renderOwnModels(s)}
    `;

    $('#model-setup').querySelectorAll('[data-pull]').forEach(b => {
      b.onclick = () => pullModel(b.dataset.pull);
    });
    $('#model-setup').querySelectorAll('[data-set-active]').forEach(b => {
      b.onclick = () => {
        localStorage.setItem('dmth_ollama_model', b.dataset.setActive);
        refresh();
      };
    });
  }

  function renderKokoroSetup(s) {
    const k = s.kokoro;
    // Surface the last load error from the kokoro module regardless of loading state.
    // Previously the error was only shown when NOT loading, so silent worker failures
    // (CDN import hung, WASM blocked) left the UI showing 0% progress with no error
    // and no Retry button. Now the error renders inline, plus a Retry button when
    // loading is no longer in flight.
    const lastErr = window.DMTHKokoro.getError ? window.DMTHKokoro.getError() : null;
    $('#kokoro-setup').innerHTML = `
      <h3>3. Load Kokoro TTS (in your browser)</h3>
      <p class="small">Neural voices that run entirely in your browser. First load downloads ~80MB of model weights to your browser cache. After that it's instant.</p>
      ${k.loaded
        ? `<div class="status-row">${statusPill(true, 'Kokoro loaded — ready to speak')}</div>`
        : k.loading
          ? `<div class="progress-bar"><div class="progress-fill" style="width:${Math.round((k.progress||0)*100)}%"></div></div>
             <p class="small">Downloading model… ${Math.round((k.progress||0)*100)}%</p>
             <p class="small muted">Web Worker init runs with a 60-second safety timeout. If it stalls, the loader falls back to main-thread synthesis automatically.</p>`
          : `<button class="btn-primary" id="load-kokoro-btn">${lastErr ? 'Retry Kokoro Load' : 'Load Kokoro TTS'}</button>
             ${lastErr ? `<p class="small" style="color:#ff7aa8;margin-top:8px"><b>Last attempt failed:</b> ${escapeHtml(String(lastErr.message || lastErr))}</p>` : ''}
             <p class="small muted" id="kokoro-err"></p>`
      }
    `;
    const loadBtn = $('#load-kokoro-btn');
    if (loadBtn) {
      loadBtn.onclick = async () => {
        loadBtn.disabled = true;
        loadBtn.textContent = 'Loading…';
        try {
          await window.DMTHKokoro.ensureLoaded(() => refresh());
          refresh();
        } catch (err) {
          // The error span won't exist if the render loop replaced the button with the
          // progress bar mid-await — refresh() will re-render with the error visible
          // because lastErr now resolves via window.DMTHKokoro.getError().
          const p = $('#kokoro-err');
          if (p) p.textContent = `Load failed: ${err.message}`;
          refresh();
        }
      };
    }
  }

  // Local image + voice servers — Python installers + launchers ship with weird under
  // scripts/. Same one-time-install-then-run-per-session pattern as Ollama. Both are
  // OPTIONAL — the game plays fully as text+emoji without them, so nothing here gates
  // the LAUNCH button (unlike Ollama + Kokoro + storage, which are core).
  function renderLocalServersSetup(s) {
    const os = s.os;
    const winExt = os === 'windows';
    const scriptExt = winExt ? '.bat' : '.sh';
    const shellPrefix = winExt ? '' : 'bash ';
    const sep = winExt ? '\\' : '/';

    const imageReady     = !!(s.localImage && s.localImage.ready);
    const imageReachable = !!(s.localImage && s.localImage.reachable);
    const voiceReady     = !!(s.localVoice && s.localVoice.ready);
    const voiceReachable = !!(s.localVoice && s.localVoice.reachable);

    // Per-server status label — distinguishes "not running" from "running but the
    // model/checkpoint isn't there yet" so the visitor knows what state they're in.
    const imageLabel = imageReady
      ? `Ready · ${escapeHtml(s.localImage.model || '')}${s.localImage.device ? ' · ' + escapeHtml(s.localImage.device) : ''}`
      : imageReachable
        ? `Server up · ${escapeHtml(s.localImage.state || 'unknown')}${s.localImage.state === 'no-checkpoint' ? ' — drop a .safetensors into models/' : ' (still loading — may take 30-60s on first render)'}`
        : 'Not running yet — the launcher (start.bat / start.sh) auto-installs + starts it; still initializing on first run';
    const voiceLabel = voiceReady
      ? 'Ready · faster-whisper on your GPU (CPU fallback available)'
      : voiceReachable
        ? 'Server up · STT model still downloading (~480MB, first run only)'
        : 'Not running yet — the launcher auto-installs + starts it; still initializing on first run';

    $('#local-servers-setup').innerHTML = `
      <h3>4. Local image + voice servers</h3>
      <p class="small">Both run on YOUR machine. No API key, no cloud, no rate limit. <b>The launcher auto-installs + auto-starts both</b> alongside Ollama — no terminal needed. First launch pulls ~2.5GB of models in the background; status pills below flip to Ready when downloads finish. Game is fully playable as text+emoji while the download runs.</p>

      <div class="step-card">
        <div class="step-label">🖼️ Local Stable Diffusion (image generation)</div>
        <div class="status-row" style="margin:8px 0">${statusPill(imageReady, imageLabel)}</div>
        <div class="step-note">Serves on <code>127.0.0.1:7860</code>. RealVisXL V5.0 SDXL uncensored checkpoint (~6.5GB, auto-downloaded on first run; falls back to Realistic Vision V5.1 SD1.5 if the SDXL fetch fails). Drop any <code>.safetensors</code> into <code>models/</code> to swap (files with <code>xl</code> in the name load as SDXL). Not running? Close the game window, re-run <code>${escapeHtml(shellPrefix + 'start' + scriptExt)}</code> from the project root, wait for the SD window to say "ready". Manual override: <code>${escapeHtml(shellPrefix + 'scripts' + sep + 'install_image_gen' + scriptExt)}</code> then <code>${escapeHtml(shellPrefix + 'scripts' + sep + 'start_image_gen' + scriptExt)}</code>.</div>
      </div>

      <div class="step-card">
        <div class="step-label">🎤 Local voice-in (speech-to-text)</div>
        <div class="status-row" style="margin:8px 0">${statusPill(voiceReady, voiceLabel)}</div>
        <div class="step-note">Serves on <code>127.0.0.1:7861</code>. faster-whisper + Whisper-small (~480MB). GPU-first with a CPU int8 fallback so it works without CUDA. TTS stays in the browser via Kokoro. Manual override: <code>${escapeHtml(shellPrefix + 'scripts' + sep + 'install_voice' + scriptExt)}</code> then <code>${escapeHtml(shellPrefix + 'scripts' + sep + 'start_voice' + scriptExt)}</code>.</div>
      </div>
    `;

    $('#local-servers-setup').querySelectorAll('[data-copy]').forEach(b => {
      b.onclick = () => {
        const target = document.getElementById(b.dataset.copy);
        navigator.clipboard.writeText(target.textContent).then(() => {
          const prev = b.textContent; b.textContent = 'Copied!'; setTimeout(() => b.textContent = prev, 1500);
        });
      };
    });
  }

  async function pullModel(modelId) {
    const progEl = $(`#mp-${cssId(modelId)}`);
    if (progEl) progEl.innerHTML = `<div class="progress-bar"><div class="progress-fill" style="width:0%"></div></div>`;
    try {
      await window.DMTHModels.pullModel(modelId, (msg) => {
        if (progEl) {
          const total = msg.total || 0;
          const done = msg.completed || 0;
          const pct = total > 0 ? Math.min(100, Math.round((done / total) * 100)) : 0;
          const status = msg.status || '';
          progEl.innerHTML = `
            <div class="progress-bar"><div class="progress-fill" style="width:${pct}%"></div></div>
            <p class="small">${escapeHtml(status)}${total > 0 ? ` (${pct}%)` : ''}</p>
          `;
        }
      });
      // After pull, set as active if nothing else is
      if (!localStorage.getItem('dmth_ollama_model')) {
        localStorage.setItem('dmth_ollama_model', modelId);
      }
      // Pull just landed — health probe matters now, do a deep refresh
      refreshDeep();
    } catch (err) {
      if (progEl) progEl.innerHTML = `<p class="small muted">Pull failed: ${escapeHtml(err.message)}</p>`;
    }
  }

  // ---------- refresh cycle ----------
  // Fast refresh — runs every 3s. SKIPS the health probe (which would otherwise
  // fire a real chat request every poll and pound Ollama).
  async function refresh() {
    currentStatus = await window.DMTHDetector.fullStatus({ skipHealthProbe: true });
    renderStatus(currentStatus);
    renderOllamaSetup(currentStatus);
    renderModelSetup(currentStatus);
    renderKokoroSetup(currentStatus);
    renderLocalServersSetup(currentStatus);
  }

  // Deep refresh — INCLUDES the health probe. Used at init, after a pull, and
  // when the user clicks "↻ Re-check". Caches the result so the fast refresh
  // can still display it.
  async function refreshDeep() {
    currentStatus = await window.DMTHDetector.fullStatus({ skipHealthProbe: false });
    if (currentStatus?.ollama?.activeModelHealth && currentStatus.ollama.activeModelHealth !== 'skipped') {
      lastHealth = {
        status: currentStatus.ollama.activeModelHealth,
        diagnosis: currentStatus.ollama.healthDiagnosis,
        modelId: currentStatus.ollama.activeModel,
        at: Date.now()
      };
    }
    renderStatus(currentStatus);
    renderOllamaSetup(currentStatus);
    renderModelSetup(currentStatus);
    renderKokoroSetup(currentStatus);
    renderLocalServersSetup(currentStatus);
  }

  function startPolling() {
    if (pollTimer) clearInterval(pollTimer);
    pollTimer = setInterval(refresh, 3000);
  }
  function stopPolling() {
    if (pollTimer) { clearInterval(pollTimer); pollTimer = null; }
  }

  // ---------- init ----------
  async function init() {
    const cfg = window.DMTHConfig;
    $('#game-title').textContent = cfg.GAME.title;
    $('#game-tagline').textContent = cfg.GAME.tagline;
    $('#game-version').textContent = `v${cfg.GAME.version}`;

    // Initial render = deep refresh (probes the active model's actual health)
    await refreshDeep();
    startPolling();

    $('#launch-btn').onclick = () => {
      if ($('#launch-btn').disabled) return;
      window.location.href = './game.html';
    };

    window.DMTHKokoro.onStateChange(() => refresh());
    window.addEventListener('storage', () => refresh());
  }

  function escapeHtml(s) {
    return String(s ?? '').replace(/[&<>"']/g, c => ({
      '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'
    }[c]));
  }
  function cssId(s) { return String(s).replace(/[^a-zA-Z0-9_-]/g, '_'); }

  document.addEventListener('DOMContentLoaded', init);
})();
