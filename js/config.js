// DUNGEON MASTER: THE HUNT — central config
// All presets live here: Ollama models, Kokoro voices, emotion states, Pollinations defaults,
// endpoint URLs, UI constants. Read at runtime from window.__DEV_ENV (dev) / localStorage (user)
// / defaults (fallback).

(function () {
  'use strict';

  const DEV_ENV = window.__DEV_ENV || {};
  const LS = window.localStorage;

  // Precedence: localStorage (user settings) > window.__DEV_ENV (local dev only) > default.
  const pick = (lsKey, devKey, fallback) => {
    const fromLS = LS && LS.getItem(lsKey);
    if (fromLS != null && fromLS !== '') return fromLS;
    if (DEV_ENV[devKey] != null && DEV_ENV[devKey] !== '') return DEV_ENV[devKey];
    return fallback;
  };

  // --- Ollama ----------------------------------------------------------------
  const OLLAMA = {
    endpoint: pick('dmth_ollama_endpoint', 'OLLAMA_ENDPOINT', 'http://localhost:11434'),
    // Default model — Dolphin family. Dolphin is the classic community-proven choice for
    // uncensored + scripted-template work: low refusal rate, strong system-prompt adherence,
    // reliable structured-output (our <delta>{}</delta> suffix), wide availability.
    activeModel: pick('dmth_ollama_model', 'OLLAMA_MODEL', 'dolphin-mistral:7b'),

    // Preset model catalog — Dolphin variants prioritized, with a couple of alternative
    // uncensored/abliterated options at the end. Each entry: id (ollama pull name),
    // displayName, sizeGB, uncensored bool, notes.
    modelCatalog: [
      {
        id: 'dolphin-mistral:7b',
        displayName: 'Dolphin Mistral 7B (recommended — fast + proven)',
        sizeGB: 4.1,
        uncensored: true,
        notes: 'Classic Dolphin. Runs on almost anything. Strong template adherence, low refusal rate. Safe default.'
      },
      {
        id: 'dolphin3:8b',
        displayName: 'Dolphin 3 (Llama3.1 8B — newer)',
        sizeGB: 4.9,
        uncensored: true,
        notes: 'Latest Dolphin gen on Llama3.1 base. Better reasoning, same uncensored compliance.'
      },
      {
        id: 'dolphin-llama3:8b',
        displayName: 'Dolphin Llama3 8B',
        sizeGB: 4.7,
        uncensored: true,
        notes: 'Dolphin on Llama3 base. Solid middle option.'
      },
      {
        id: 'dolphin-mixtral:8x7b',
        displayName: 'Dolphin Mixtral 8x7B (large — best quality)',
        sizeGB: 26,
        uncensored: true,
        notes: 'Highest quality. MoE architecture. Needs 32GB+ RAM or a beefy GPU. For power users.'
      },
      {
        id: 'huihui_ai/qwen2.5-abliterate:7b',
        displayName: 'Qwen2.5 Abliterate 7B (alternative)',
        sizeGB: 4.7,
        uncensored: true,
        notes: 'Non-Dolphin alternative. Good persona work; less tested for structured JSON output than Dolphin.'
      },
      {
        id: 'mannix/llama3.1-8b-abliterated:latest',
        displayName: 'Llama3.1 8B Abliterated',
        sizeGB: 4.9,
        uncensored: true,
        notes: 'Non-Dolphin alternative. Ablation-modified Llama3.1 base for zero refusals.'
      }
    ],

    // Generation params — overridable via settings (Settings panel writes dmth_ollama_temp).
    // 200 tokens leaves room for: 1-2 short sentences + 1 asterisk-action + the delta block.
    temperature: (() => { const v = parseFloat(pick('dmth_ollama_temp', 'OLLAMA_TEMP', '0.85')); return Number.isFinite(v) ? v : 0.85; })(),
    topP: 0.92,
    repeatPenalty: 1.25,           // higher = less likely to repeat the same response
    maxTokens: 256,                // headroom so a SHORT complete reply + the full <delta> block both finish before the cap (was 200 → chopped mid-sentence)
    streamResponse: true,
    // Aggressive stop sequences — first blank line ends the response
    stopSequences: ['\n\n\n', 'Master:', 'Scene:', 'SCENE:', '[END]', 'You:', 'User:', '<|end|>', '### ', '<sentence']
  };

  // --- Kokoro TTS ------------------------------------------------------------
  const KOKORO = {
    modelId: pick('dmth_kokoro_model', 'KOKORO_MODEL', 'onnx-community/Kokoro-82M-v1.0-ONNX'),
    // kokoro-js is loaded from a CDN; version pinned for stability.
    cdnUrl: 'https://cdn.jsdelivr.net/npm/kokoro-js@1.2.0/dist/kokoro.web.js',
    dtype: pick('dmth_kokoro_dtype', 'KOKORO_DTYPE', 'q8'),   // q8 ~80MB (default) · q4 ~40MB loads faster · fp32 ~330MB. Override via dmth_kokoro_dtype localStorage.
    // Default voice + speed are USER-OVERRIDABLE — the Settings panel writes dmth_kokoro_voice /
    // dmth_kokoro_speed then reloads; read them back here or the picker silently reverts to Nova/1.0.
    defaultFemaleVoice: pick('dmth_kokoro_voice', 'KOKORO_VOICE', 'af_nova'),
    defaultSpeed: (() => { const v = parseFloat(pick('dmth_kokoro_speed', 'KOKORO_SPEED', '1.0')); return Number.isFinite(v) && v > 0 ? v : 1.0; })()
  };

  // --- Pollinations ----------------------------------------------------------
  // Endpoints updated April 2026 — unified gen.pollinations.ai replaces legacy image.pollinations.ai.
  // Auth via ?key= query param. sk_ = secret key (server side / no rate limit). pk_ = publishable key (client / rate-limited).
  // If you get 403 errors from a browser with sk_ key, try swapping to a pk_ key from enter.pollinations.ai.
  //
  // Unity AI Lab Worker proxy — when the page is hosted under unityailab.com / unity-lab-ai.github.io
  // / localhost, image generation routes through the shared Cloudflare Worker at
  // websiteunityailab.gfourteen7525.workers.dev/image/. The Worker injects the operator's sk_
  // token server-side, so the browser sends NO key. This is the same path the rest of the
  // website2.0 apps (Unity Chat, Persona Chat, Text Chat, Slideshow, Screensaver) use —
  // keeps Pollinations auth uniform across the whole Unity AI Lab site.
  //
  // When running standalone (e.g., a local clone of this repo not on the Unity AI Lab site)
  // the Worker route is OFF and image gen falls back to direct Pollinations + user-supplied
  // pk_ key from the Settings panel.
  // Worker-route selection has three tiers, in priority order:
  //   1. Explicit localStorage flag — user toggle on the Settings panel:
  //        - 'on'  → force Worker route
  //        - 'off' → force direct Pollinations + user pk_ key
  //   2. Hostname auto-detect — when no explicit flag, unityailab.com hosts default
  //      to Worker route (the Worker's CORS allows that origin).
  //   3. Default off — everywhere else falls back to direct Pollinations + pk_ key.
  //
  // Note on CORS: the production Worker only allows Origin: https://unityailab.com.
  // If a user flips the toggle ON from localhost or another origin, requests will
  // be blocked by CORS until the Worker's allowed-origins list includes that host.
  function detectUnityLabWorker() {
    if (typeof window === 'undefined' || !window.location) return false;
    try {
      const flag = window.localStorage && window.localStorage.getItem('dmth_use_unity_worker');
      if (flag === 'on')  return true;
      if (flag === 'off') return false;
    } catch {}
    const h = (window.location.hostname || '').toLowerCase();
    return h === 'unityailab.com' || h === 'www.unityailab.com';
  }
  const POLLINATIONS = {
    // PRE-ALPHA COMMUNAL KEY — supplied so visitors don't need their own Pollinations token.
    // This is a throwaway, internally-rate-limited, REVOCABLE key (rotate any time). It is the
    // fallback ONLY: a user's own key (localStorage 'dmth_pollinations_key') or a dev-env key
    // still overrides it. Yes it ships in the public JS — that's the accepted tradeoff for a
    // zero-setup pre-alpha; rotate it the moment it's abused.
    apiKey: pick('dmth_pollinations_key', 'POLLINATIONS_API_KEY', 'sk_cVKTWfmo9wF7S5bOiFHZPhN2LjpW4SZ3'),
    imageEndpoint: 'https://image.pollinations.ai/prompt/',   // legacy free — used as fallback
    imageEndpointAuth: 'https://gen.pollinations.ai/image/',  // current authed endpoint
    // Unity AI Lab Worker proxy URL. When detectUnityLabWorker() returns true, buildUrl
    // in imaging.js routes here and drops the ?key= param entirely.
    imageEndpointWorker: 'https://websiteunityailab.gfourteen7525.workers.dev/image/',
    useUnityLabWorker: detectUnityLabWorker(),
    textEndpoint: 'https://text.pollinations.ai/',
    // Preferred image model for strict visuals. Current gen.pollinations.ai catalog includes:
    // zimage / flux / gptimage / gptimage-large / seedream / seedream-pro / kontext / nanobanana variants / grok-imagine / klein / qwen-image / wan-image / nova-canvas
    imageModel: 'flux',
    // Default to portrait tall for character images — full body needs vertical room
    // so the model doesn't compose a portrait/mugshot crop. Per 2026-05-14:
    // "we need the images to do more fullbody style not mugshots and portrate images".
    // Environment renders (town/dungeon) override to 1792×1024 landscape in renderEnvironment().
    width: 1024,
    height: 1792,
    nologo: true,
    // Meta — use Ollama to write each image prompt from the scene context (vs purely hardcoded).
    useOllamaPromptWriter: true
  };

  // --- Storage ---------------------------------------------------------------
  const STORAGE = {
    idbName: 'dungeon_master_the_hunt',
    idbVersion: 1,
    stores: {
      save:      'save',         // main game save
      girls:     'girls',        // per-girl profiles + state
      episodes:  'episodes',     // recorded episodes
      cache:     'cache',        // Pollinations image cache metadata
      audio:     'audio'         // Kokoro TTS outputs kept for episodes
    }
  };

  // --- Game meta -------------------------------------------------------------
  const GAME = {
    title: 'DUNGEON MASTER: THE HUNT',
    tagline: 'persistent city-builder — dungeon harem evil taboo — hunt your prey',
    version: '0.0.1',
    defaultDungeonTemplate: 'hole-in-the-desert',
    startingMoney: 200,
    sandboxMoney: 999999
  };

  // --- Dev / debug -----------------------------------------------------------
  const DEV = {
    mode: DEV_ENV.DEV_MODE === true || DEV_ENV.DEV_MODE === 'true',
    logLevel: DEV_ENV.DEV_MODE ? 'debug' : 'info'
  };

  // Expose globally — non-module scripts can read window.DMTHConfig.
  // detectUnityLabWorker is exported so the landing-page Settings toggle can re-evaluate
  // the resolved value (localStorage flag > hostname auto) after the user flips it.
  window.DMTHConfig = Object.freeze({
    OLLAMA,
    KOKORO,
    POLLINATIONS,
    STORAGE,
    GAME,
    DEV,
    detectUnityLabWorker
  });

  if (DEV.mode) {
    void 0;
  }
})();
