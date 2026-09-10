// DUNGEON MASTER: THE HUNT — central config
// All presets live here: Ollama models, Kokoro voices, emotion states, local image/voice
// endpoint URLs, UI constants. Read at runtime from window.__DEV_ENV (dev) / localStorage (user)
// / defaults (fallback). No cloud image/voice service, no keys, no tokens — every backend
// runs on the visitor's own machine (Ollama, local SD, local STT) or in the browser (Kokoro).

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
    temperature: (() => { const v = parseFloat(pick('dmth_ollama_temp', 'OLLAMA_TEMP', '0.92')); return Number.isFinite(v) ? v : 0.92; })(),   // 0.92 (was 0.85) — more reply variety, less repetition
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

  // --- Local image generation ------------------------------------------------
  // The visitor runs a local Stable Diffusion server on their machine (see
  // scripts/install_image_gen.bat|.sh + scripts/start_image_gen.bat|.sh). The
  // browser calls it DIRECTLY at http://127.0.0.1:7860 — the server sends
  // Access-Control-Allow-Origin: * so any page origin (localhost, GitHub Pages,
  // unityailab.com) can hit it. No key. No token. Nothing leaves the visitor's
  // machine.
  //
  // Default checkpoint: Realistic Vision V5.1 (uncensored, 2.1GB, ungated).
  // Drop any other .safetensors into weird/models/ to swap.
  const LOCAL_IMAGE = {
    endpoint:  pick('dmth_local_image_endpoint', 'LOCAL_IMAGE_ENDPOINT', 'http://127.0.0.1:7860'),
    txt2img:   '/sdapi/v1/txt2img',        // POST — {prompt, negative_prompt, steps, width, height, cfg_scale}
    options:   '/sdapi/v1/options',        // GET  — probe used by the setup wizard to decide "server alive"
    status:    '/status',                  // GET  — {state: starting|loading|ready|no-checkpoint, model, device, error}
    // Full-body portrait tall by default. 832×1216 is SDXL's canonical tall-portrait
    // bucket (~1MP, ~2:3 aspect) — sd_server.py auto-detects SDXL vs SD1.5 by
    // checkpoint filename and swaps to StableDiffusionXLPipeline. If the visitor
    // is running an SD1.5 checkpoint instead, this res is above SD1.5's coherent
    // zone and they'll see duplicate-subject artifacts — drop to 512×896 in that
    // case (dmth_local_image_endpoint override, or hand-edit here). Environment
    // renders (town/dungeon) still override to 1792×1024 landscape at their callsite.
    width: 832,
    height: 1216,
    steps: 24,
    cfgScale: 7.0,
    // Standard quality-steering negative — nothing here steers subject matter.
    negativePrompt:
      'blurry, lowres, bad anatomy, bad hands, extra fingers, deformed, ' +
      'watermark, text, jpeg artifacts, worst quality',
    // Meta — use Ollama to write each image prompt from the scene context
    // (vs purely hardcoded composition). Same lever as before; nothing about
    // this depends on the image backend.
    useOllamaPromptWriter: true
  };

  // --- Local voice (STT) -----------------------------------------------------
  // Speech-to-text is the visitor's local voice-server (scripts/install_voice.*
  // + scripts/start_voice.*). Same browser-direct + CORS-anywhere pattern as
  // the image server. TTS stays in the browser via Kokoro-js — not here.
  const LOCAL_VOICE = {
    endpoint:  pick('dmth_local_voice_endpoint', 'LOCAL_VOICE_ENDPOINT', 'http://127.0.0.1:7861'),
    stt:       '/stt',                     // POST — {pcm_b64|wav_b64, sample_rate} -> {text, seconds}
    state:     '/state'                    // GET  — probe: {ok, stt_model_present, cuda_dirs}
  };

  // --- Storage ---------------------------------------------------------------
  const STORAGE = {
    idbName: 'dungeon_master_the_hunt',
    idbVersion: 1,
    stores: {
      save:      'save',         // main game save
      girls:     'girls',        // per-girl profiles + state
      episodes:  'episodes',     // recorded episodes
      cache:     'cache',        // local SD image cache metadata (b64 blobs + prompt hashes)
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
  window.DMTHConfig = Object.freeze({
    OLLAMA,
    KOKORO,
    LOCAL_IMAGE,
    LOCAL_VOICE,
    STORAGE,
    GAME,
    DEV
  });

  if (DEV.mode) {
    void 0;
  }
})();
