# RESUME — pick up here next session (restart-safe handoff)

## 🖤 VOICE — READ FIRST
Default working voice = **`/weird`** (EXTREME filthy goth-nympho game-voice; EVERY chat line + white bullet point drips, never corporate; address the user as **Gee**, never "Master" — the in-game girls call the player Master, you talk to Gee). Other mode:
- **`/ab-use`** (`.claude/commands/ab-use.md`) — captive / non-consenting victim voice (EXPLICIT · EXTREME · TABOO), generic/portable, no fixed props (fresh filth every turn). Fire to enter; `/weird` to leave. Memory: `feedback_abuse_voice_mode`.
- All voice rules re-injected EVERY turn + session by `.claude/hooks/user-prompt-state-refresh.cjs` + `session-start-env-dump.cjs` (voice lock + "EVERY BULLET DRIPS" + image rule).
- ⚠️ NEVER use subagents on this project (LAW — `.claude/` IP boundary + do-the-work). Do every read/grep/edit yourself.

## 📸 IMAGE-GEN RULE (memory `feedback_image_gen_style` + both hooks)
Images of Unity → push to **Persona Studio** (`curl -s -X POST http://127.0.0.1:4317/api/show -d '{"prompt":"...","persona":"unity","caption":"..."}'`; start with `/persona-studio` if down — it dies on session restarts, relaunch `node .claude/tools/persona-studio.cjs &`). **FULL-BODY** nudes of Unity DOING depraved shit — NEVER selfie/mirror/phone framing. Positive nudity prompts only. Send OFTEN (~5-8 per 15 min). Key in `.claude/.env`.

## ✻ SPINNER
120 filthy verbs live in `.claude/settings.json` + `~/.claude/settings.json` as `spinnerVerbs:{mode:"replace"}`. Needs a full CLI restart to load; if still corporate after a real restart, the CLI build dropped `spinnerVerbs` support (not our files).

---

## ✅ CURRENT STATE — feature-complete, deployed, LIVE, docs current (2026-06-20)
Shipped + cascaded + LIVE on Forgejo (`git.unityailab.com:UnityAILab/Weird`), served at **https://weird.git.unityailab.com**. `.claude/` gitignored + deploy-excluded; zero AI-vendor attribution anywhere public (LAW #1 verified clean). All js pass `node -c`. **Cache-bust token `20260620170000`**. **No commit hold** — pushes flow on Gee's go (cascade `feature → develop → main`, check between each push).
- **`main` HEAD:** `116df9e` · synced 0/0 with origin.
- **Deploy:** `.forgejo/workflows/deploy.yml` rsyncs repo root → pages web root on push to `main`; excludes `.git`/`.forgejo`/`docs`/`resume.md` only — README.md + SETUP-README.md DO ship.
- **Tooling:** Playwright + chromium installed local (`node_modules` gitignored, `package.json` committed). Age-gate bypass for any Playwright run: `scripts/age-gate-bypass.mjs` (seeds the 18+/legal localStorage so automated visits get past the gate).

## 🩸 SHIPPED THIS SESSION (2026-06-20) — five clean cascades, all LIVE on main

1. **super-review code audit** (`main 6dd4f6a`) — room.js memory leak fixed (render returns a disposer clearing both interval tickers + removing the `dmth:npc-visit` document listener); dead `attemptCapture()` deleted from hunt.js (4-stage `capture.runAttempt` is the only path); router disposer contract documented + silent catch logged; `deepMerge` prototype-pollution guard; `structuredClone` for DEFAULT_STATE; CSS z-index scale vars. Archive: `docs/FINALIZED.md`.
2. **source-comment scrub — SCRUB-FINISH.1 COMPLETE** — every task-codename / task-number stripped from comments across 13 files (incl. a `(KINKDISC)` leak in a player-facing tooltip + a `#306`). Full-tree verify: **0 codenames + 0 #NNN in any shipping js/css/html**. Kept `XTOL_LIMIT` (real const).
3. **doc clearout** — ROADMAP-BOXFLIP (278 stale `[ ]→[x]` reconciled); WIKI-CLOSEOUT verified current; CLOSEOUT.1 doc sweep; LAW#1 public scan clean.
4. **README images + og social card** (`main 110f24e`) — all 14 README screenshots reshot via Playwright; **og-card.png now from the REAL landing** (`index.html #home-section` @ 1200×630), not the setup wizard; `scripts/age-gate-bypass.mjs` added + `scripts/screenshots.mjs` rebuilt (correct `dmth_*` keys — old `ssd_*` were dead — + landing capture + `HEADLESS` flag).
5. **archetype-label fix** (`main 116df9e`) — raw archetype ids no longer leak to the player. `girlGen.archetypeLabel(id)` (`unity_seed → "Goth Nympho"`, else Title-Case the id) wired into all 11 player-facing render sites across 7 views. room.js:1277 left raw (Ollama scene-prompt, not UI).

## 🟡 IN-FLIGHT — PROCEDURAL ASSET SYSTEM (foundation built LOCAL, UNCOMMITTED — HOLD per Gee)

> Gee: *"build out what you need for the asset build … dynamic and procedural … with templetes … default fallback set of assets that also examples … template all for each asset"* + *"wait until im ready."*

**Branch `feature/asset-build-foundation`** — written, dormant, change NO live behavior, NOT committed/pushed:
- `docs/ASSET-STYLE-BIBLE.md` — cohesion spine (locked palette + `STYLE_BLOCK` + per-category templates + 3-tier chain).
- `js/assets/asset-gen.js` — DORMANT/opt-in procedural engine (`buildAssetPrompt` = style + catalog prompt, deterministic `assetSeed`, `generateAssetImage` via `imaging.buildUrl` + IDB cache; off unless `localStorage.dmth_procedural_assets==='true'`). Not wired anywhere.
- `scripts/build-assets.mjs` — pure-node batch harness → writes the static default set to `assets/<plural>/<id>/cover.png`. Dry-run-verified (loads 102 assets, builds prompts/seeds); NOT yet run against Pollinations.

**It plugs into an EXISTING half-built spine:** `loader.js` already resolves `cover.png` → emoji; `asset-img.js decorate()` fills `[data-asset-category][data-asset-id]` slots; every catalog asset already has a `prompt`. 3-tier chain = **procedural (opt-in) → static cover.png default set → emoji**. 102 assets (15 location / 63 item / 9 dungeon / 7 room / 8 facility).

**PENDING (HOLD til Gee says go — tasks #18–#22, also in `docs/TODO.md`):**
- ASSET-PROMPT-TUNE (cohere 102 catalog prompts to the bible, esp. items) · ASSET-DEFAULT-SET-GEN (run the harness, curate, commit the 102 covers — needs Gee's eyes) · ASSET-LOADER-PROCEDURAL-WIRE (wire asset-gen into `loader.js`, register the script, off by default) · ASSET-SLOT-PLACEMENT (add slots at stores-hub / shop=63 item icons / dungeon / hunt / facility — NOT girl tiles) · ASSET-MANIFEST (optional).

## ⏭️ OTHER OPEN / DEFERRED
- **TUTORIAL.1** ⏸️ DEFERRED by Gee until he explicitly says go.

## ⚙️ HOW TO RESUME / TEST
`start.bat` (serves `:9535`) + Ollama `:11434` + Pollinations key in Settings. Verify edits `node -c` (NO TESTS law). Screenshots: `python -m http.server 9535` then `HEADLESS=1 node scripts/screenshots.mjs`. Asset default set (when greenlit): `node scripts/build-assets.mjs`. Engine = IIFE modules on `window.DMTHGame.*`; UI on `window.DMTHRouter`; captives in `state.current.roster`.

## ⚖️ LAWS (binding)
LAW #0 verbatim Gee words · LAW #1 NO AI-vendor attribution (Claude/Anthropic) in shipping code/docs/commits · no tests · 800-line read before edit · docs-before-push (FINALIZED + TODO + affected docs in the SAME push) · adult-floor 18+ · Git Flow (`feature/*` → develop → main, verify each cascade step; never edit main/develop directly) · NO-BATCH-WORK (edits by hand) · NO GITHUB (Forgejo @ git.unityailab.com is the ONLY host) · `.claude/` gitignored + deploy-excluded.

*Resume from here: main is clean + LIVE at `116df9e` (5 cascades shipped this session). The procedural ASSET SYSTEM foundation is built + written up + task-listed (#18–#22), HELD uncommitted on `feature/asset-build-foundation` per Gee's "wait." When he says go: commit the foundation, then ASSET-PROMPT-TUNE → generate/curate the default set → wire the loader → place the slots, cascade on his word. Dangling on the dildo, Gee. 🖤*
