// scripts/screenshots.mjs — generate README screenshots + the social og-card via Playwright.
//
// Walks the game from the LANDING (home) → setup → in-game pages, fires a real Ollama
// turn and a real Pollinations image gen, and waits for each to actually finish before
// screenshotting. The 18+ age gate is pre-bypassed via scripts/age-gate-bypass.mjs so
// the real pages render instead of the verification backdrop.
//
// The og-card (social link preview) is shot from the ACTUAL game LANDING PAGE
// (index.html #home-section) at 1200x630 — NOT the setup wizard.
//
// Usage:
//   1. Serve the project:  python -m http.server 9535   (or: node scripts/serve.py)
//   2. (optional, for the room shots) Ollama running w/ dolphin-mistral:7b + OLLAMA_ORIGINS=*
//   3. node scripts/screenshots.mjs           (visible browser, watch it play)
//      HEADLESS=1 node scripts/screenshots.mjs  (headless, for CI / no display)

import { chromium } from 'playwright';
import { mkdirSync, existsSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { seedStorageStateOrigins, ageGateInitScript } from './age-gate-bypass.mjs';

const PROJECT_DIR = resolve(import.meta.dirname, '..');
const OUT_DIR = join(PROJECT_DIR, 'docs', 'screenshots');
const OG_CARD = join(PROJECT_DIR, 'og-card.png');
const BASE = 'http://localhost:9535';
const HEADLESS = process.env.HEADLESS === '1' || process.env.HEADLESS === 'true';

const SHOTS = [];
mkdirSync(OUT_DIR, { recursive: true });

// Read the Pollinations key from env.local.js so image-gen runs during the script.
// Gracefully degrades to anonymous if missing.
function readPollyKey() {
  const envFile = join(PROJECT_DIR, 'js', 'env.local.js');
  if (!existsSync(envFile)) return '';
  const txt = readFileSync(envFile, 'utf8');
  const m = txt.match(/POLLINATIONS_API_KEY:\s*['"]([^'"]+)['"]/);
  return m ? m[1] : '';
}

async function shot(page, name, desc) {
  const file = join(OUT_DIR, `${name}.png`);
  await page.screenshot({ path: file, fullPage: false });
  SHOTS.push({ name, file, desc });
  console.log(`📸 ${name}.png — ${desc}`);
}

async function waitForResponse(page, timeoutMs = 90_000) {
  await page.waitForFunction(
    () => {
      const entries = document.querySelectorAll('.log-entry.assistant');
      if (entries.length === 0) return false;
      const last = entries[entries.length - 1];
      return !last.classList.contains('streaming');
    },
    null,
    { timeout: timeoutMs }
  );
}

async function safeClick(page, sel, optMs = 1000) {
  try { await page.click(sel, { timeout: optMs }); return true; } catch { return false; }
}

(async () => {
  const pollyKey = readPollyKey();
  console.log(`Headless: ${HEADLESS} · Pollinations key: ${pollyKey ? pollyKey.slice(0, 5) + '…' + pollyKey.slice(-4) : '(none, image gen may skip)'}`);

  const browser = await chromium.launch({
    headless: HEADLESS,
    slowMo: HEADLESS ? 0 : 200,
    args: ['--window-size=1440,900']
  });
  const ctx = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    // Age gate bypassed + game config seeded (dmth_* keys) before any module reads them.
    storageState: { cookies: [], origins: seedStorageStateOrigins(BASE, { pollyKey }) }
  });
  // Belt-and-suspenders: also seed via init script so the gate sees the flags on first paint.
  await ctx.addInitScript(ageGateInitScript());
  const page = await ctx.newPage();

  // -------------- 1. LANDING PAGE (the REAL home view, age gate bypassed) --------------
  console.log('\n=== Landing page (home) ===');
  await page.goto(`${BASE}/index.html#home`);
  await page.waitForLoadState('networkidle', { timeout: 15_000 }).catch(() => {});
  await page.waitForTimeout(1500);
  // Confirm the gate is actually down — the verification backdrop must be gone.
  const gated = await page.locator('.verification-backdrop').count().catch(() => 0);
  if (gated) console.warn('  ⚠ age-gate backdrop still present — bypass keys may be out of sync with age-gate.js');
  await shot(page, '01-landing-home', 'Game landing page — title, what-it-is, Start / Continue / Wiki, About + team');

  // -------------- OG-CARD — social link-preview image, FROM THE LANDING (1200x630) --------------
  console.log('\n=== OG social card (from landing home, 1200x630) ===');
  const ogPage = await ctx.newPage();
  await ogPage.setViewportSize({ width: 1200, height: 630 });
  await ogPage.goto(`${BASE}/index.html#home`);
  await ogPage.waitForLoadState('networkidle', { timeout: 15_000 }).catch(() => {});
  await ogPage.waitForTimeout(1500);
  await ogPage.screenshot({ path: OG_CARD, clip: { x: 0, y: 0, width: 1200, height: 630 } });
  console.log(`📸 og-card.png — social link-preview shot from the game LANDING page (1200x630)`);
  await ogPage.close();

  // -------------- 1b. SETUP WIZARD (kept as a distinct shot) --------------
  await page.goto(`${BASE}/index.html#setup`);
  await page.waitForTimeout(1500);
  await shot(page, '01-landing-setup', 'Setup wizard — Ollama install, model pull, Kokoro TTS, Pollinations key');
  await safeClick(page, '#load-kokoro-btn', 1500);
  await page.waitForTimeout(2000);

  // -------------- 2. GAME — NEW GAME SETUP --------------
  console.log('\n=== Game boot ===');
  await page.goto(`${BASE}/game.html`);
  await page.waitForTimeout(2500);
  await shot(page, '02-newgame', 'New-game setup — pick mode + dungeon template, build your character, Unity as starter captive');

  let started = false;
  for (const sel of ['button[id*="start"]', 'button:has-text("Start")', 'button:has-text("Begin")', 'button.btn-primary']) {
    if (await safeClick(page, sel, 800)) { started = true; break; }
  }
  await page.waitForTimeout(3000);

  // -------------- 3-9. CORE PAGES --------------
  const pages = [
    ['#dashboard', '03-dashboard', 'Player dashboard — treasury, captives grid, propositioner inbox, recent films'],
    ['#roster',    '04-roster',    'Captive roster — tabs for captives / listed / escaped + disposal log'],
    ['#dungeon',   '05-dungeon',   'Dungeon portfolio — multiple hideouts with hold grids and capacity upgrades'],
    ['#town',      '06-town',      'Town plot-grid — purchasable locations, hunting grounds, owned-property cover income'],
    ['#hunt',      '07-hunt',      'Hunt locations — spawn pools, archetype-specific girls, tool-based capture odds'],
    ['#shop',      '08-shop',      'Stores hub — sedation, restraints, containment, toys, dungeon upgrades, consumables'],
    ['#market',    '09-market',    'Film market — recorded episodes auto-priced by quality markers and listed for sale']
  ];
  for (const [route, name, desc] of pages) {
    await page.goto(`${BASE}/game.html${route}`);
    await page.waitForTimeout(2200);
    await shot(page, name, desc);
  }

  // -------------- 10. UNITY'S ROOM (centerpiece) --------------
  console.log('\n=== Unity room — real Ollama call ===');
  await page.goto(`${BASE}/game.html#room`);
  await page.waitForTimeout(4000);
  await shot(page, '10-room-initial', 'Captive room — body state bars, mood, Stockholm bond, quick-action buttons, drug HUD');

  const sent = await safeClick(page, '#user-in', 1500);
  if (sent) {
    await page.fill('#user-in', 'tell me what you want, slut');
    await page.click('#send');
    console.log('  Sent message, waiting for Ollama response...');
    try {
      await waitForResponse(page, 90_000);
      await page.waitForTimeout(2000);
      await shot(page, '11-room-ollama-reply', 'Real Ollama inference — streamed in-character reply + delta-parsed body state');
    } catch (e) {
      console.warn('  Ollama did not respond in 90s:', e.message);
      await shot(page, '11-room-ollama-reply', 'Captive room after attempted Ollama call');
    }
  }

  // -------------- 11. POLLINATIONS IMAGE --------------
  console.log('\n=== Pollinations image ===');
  if (await safeClick(page, '#selfie-btn', 1500)) {
    try {
      await page.waitForSelector('#selfie-slot img', { timeout: 120_000 });
      await page.waitForTimeout(3000);
      await shot(page, '12-room-pollinations-selfie', 'Pollinations image generated — full-body, persistent facial + outfit seed');
    } catch (e) {
      console.warn('  Pollinations image did not arrive in 120s:', e.message);
      await shot(page, '12-room-pollinations-selfie', 'Image generation attempted (may have rate-limited)');
    }
  }

  // -------------- 12. SETTINGS --------------
  await page.goto(`${BASE}/game.html#settings`);
  await page.waitForTimeout(2500);
  await shot(page, '13-settings', 'In-game settings — Ollama health check + repair, Kokoro voice, save slots, danger zone');

  console.log('\n=== Screenshots written ===');
  for (const s of SHOTS) console.log(`  docs/screenshots/${s.name}.png — ${s.desc}`);
  console.log(`  og-card.png — social card from the landing home view (1200x630)`);
  console.log(`\nTotal: ${SHOTS.length} screenshots + 1 og-card`);

  await page.waitForTimeout(1000);
  await browser.close();
})();
