// scripts/age-gate-bypass.mjs — pre-seed localStorage so the 18+ age gate +
// legal-acceptance gate are already satisfied before any automated visit (Playwright
// screenshots, smoke tests, etc.). Without this, every page load is blocked behind
// the verification backdrop and nothing past the gate ever renders.
//
// The keys + values MUST stay in sync with js/ui/age-gate.js:
//   button18 === 'true'
//   birthdate -> validates to age >= 18
//   husdh-f978dyh-sdf === VERIFICATION_VALUE ('ijdfjgdfo-38d9sf-sdf')
//   legalAccepted === 'true'
//   legalAcceptedVersion === CURRENT_LEGAL_VERSION ('v1.0')
//   legalAcceptedDate present
// If age-gate.js bumps CURRENT_LEGAL_VERSION or VERIFICATION_VALUE, bump them here too.
//
// Usage (Playwright):
//   import { ageGateLocalStorage, seedStorageStateOrigins } from './age-gate-bypass.mjs';
//   const ctx = await browser.newContext({ storageState: { cookies: [], origins: seedStorageStateOrigins(BASE) } });

// Matches age-gate.js KEYS + VERIFICATION_VALUE + CURRENT_LEGAL_VERSION exactly.
export const AGE_GATE_VERIFICATION_VALUE = 'ijdfjgdfo-38d9sf-sdf';
export const AGE_GATE_LEGAL_VERSION = 'v1.0';

// The localStorage entries that mark a visitor as 18+ verified AND legal-accepted.
// `now` is passed in (Date is unavailable in some sandboxed contexts) so the
// acceptance date is stampable; defaults to a fixed safe date.
export function ageGateLocalStorage(now = '2026-01-01') {
  return [
    { name: 'button18', value: 'true' },
    { name: 'birthdate', value: '1990-01-01' },                       // resolves to 30+ → passes MIN_AGE 18
    { name: 'husdh-f978dyh-sdf', value: AGE_GATE_VERIFICATION_VALUE },
    { name: 'legalAccepted', value: 'true' },
    { name: 'legalAcceptedVersion', value: AGE_GATE_LEGAL_VERSION },
    { name: 'legalAcceptedDate', value: now }
  ];
}

// The real game config localStorage keys (dmth_* — config.js / room.js read these).
// `ssd_*` was the OLD prefix and is dead; never seed those.
export function gameConfigLocalStorage({ ollamaModel = 'dolphin-mistral:7b', ollamaEndpoint = 'http://localhost:11434' } = {}) {
  return [
    { name: 'dmth_voice_on', value: 'off' },          // never blast TTS audio during a capture run
    { name: 'dmth_ollama_model', value: ollamaModel },
    { name: 'dmth_ollama_endpoint', value: ollamaEndpoint }
  ];
}

// Build the Playwright storageState `origins` array for a base origin, with the age
// gate bypassed + the game config seeded.
export function seedStorageStateOrigins(origin, opts = {}) {
  return [{
    origin,
    localStorage: [
      ...ageGateLocalStorage(opts.now),
      ...gameConfigLocalStorage(opts)
    ]
  }];
}

// Apply the bypass to a LIVE Playwright page/context via addInitScript — an alternative
// to storageState when you already have a context. Runs before any page script, so the
// age gate sees the flags on first load.
export function ageGateInitScript() {
  return `(${(verVal, legalVer, now) => {
    try {
      localStorage.setItem('button18', 'true');
      localStorage.setItem('birthdate', '1990-01-01');
      localStorage.setItem('husdh-f978dyh-sdf', verVal);
      localStorage.setItem('legalAccepted', 'true');
      localStorage.setItem('legalAcceptedVersion', legalVer);
      localStorage.setItem('legalAcceptedDate', now);
    } catch (e) { /* private mode / blocked storage — gate will just show */ }
  }})(${JSON.stringify(AGE_GATE_VERIFICATION_VALUE)}, ${JSON.stringify(AGE_GATE_LEGAL_VERSION)}, ${JSON.stringify('2026-01-01')});`;
}
