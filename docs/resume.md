# resume.md — DUNGEON MASTER: THE HUNT — session handoff

**Last session:** 2026-06-18 · **Branch:** `UpdateWork` · **Last commit:** `21042ae` (landing hub + doc viewer + REQUEST.1) · **State:** working tree CLEAN — everything committed + pushed to `UpdateWork`. Every changed JS file passes `node -c`. `.claude/` is gitignored (local tooling); everything below is game code/docs.

> This session: a headless smoke-test pass (no real bugs found), then a clean-launcher landing redesign + web doc viewer, then the pre-capture item-request system (REQUEST.1) with capture-haul + rare toy drop. All shipped to `UpdateWork` in commit `21042ae` (prior push `9f6188b` = doc sweep).

---

## ✅ SHIPPED + PUSHED THIS SESSION (commit `21042ae`)

### 🏠 Landing-page redesign — clean launcher hub (`index.html`, NEW `doc.html`)
Gee: *"the whole landing page is too noisy thats what the wiki is for … web versions of redme and setup guide docs … accessable on the landing page … the 5-8 buttons needed like start game, settings wiki, and the others … i dont want a text wall layout"*.
- **HOME is now a hub**: hero + one-line tagline + an 8-tile button grid (🎬 Start New Game · ⏵ Continue · ⚙️ Settings · ⚡ Setup Wizard · 📖 Wiki · 📘 Readme · 🛠 Setup Guide · ℹ️ About) + one closing line. Same button IDs the router wires to (`cta-start-new-game`/`cta-continue-game`/`cta-open-settings`) so save-detection still works.
- **Removed the noise**: pitch-strip stat-wall, "The Loop", Systems feature grid, "Inside Her Room", quick-start wall, closing text-wall, dead inline CSS. `index.html` 884 → ~656 lines.
- **NEW `doc.html`** — self-contained markdown viewer (`doc.html?f=README.md&t=Readme`, `?f=SETUP-README.md`). Inline GFM renderer (headings/**tables**/fenced code/lists/quotes/links/images). Single source of truth — reads the live `.md`. Path-guarded to `^[A-Za-z0-9._-]+\.md$`. On `file://` shows a "run through the local server" note.
- Verified headless: index 0 console errors, all 8 tiles render; README rendered (1 h1 / 19 h2 / 46 h3 / 11 code blocks / 15 tables) clean.

### 🙏 REQUEST.1 — pre-capture item requests + capture haul + rare toy drop
Gee: *"asking a captive for drugs taps her depleting stash. thats not right not captives pre captives can give items … a button or option for each girl for a stat based roll(based on character level and girl dificulty and location difficulty … 80% 50% 25% … dont make loot drops impossible and not endlesess supplies like only once a day per gril in a location … 1 of the threee options available per girl type"* + *"the types of items the girls give are based on the type of girl they are.. and when u capture them u get some of all she has,, like 2-5 of each thing she offered before kidnapp"* + *"rare even girls sometime have thir own sex toys in their persons pockets on capture so like 1out of every 3 girls captrued can give a unique toy apon capture with her normal loot given"*.
- **Removed the bug**: captive `askGirlForDrugs` depleting-stash + `DRUG_STASH` model deleted; `quick-actions.js` "ask her for drugs" button + handler removed. Also retired the endless random talk-loot (`rollConversationWin`).
- **`REQUEST_TEMPLATES`** (`loot.js`) — 3 options per girl TYPE, cheap→prize (12 archetypes: library/club/street/sorority/gym/barista/office/waitress/model/nurse/neighbor/unity_seed + `_default`), real catalog/drug ids themed per type.
- **Stat roll** — `requestSuccessChance()` = tier base (**0.80 / 0.50 / 0.25**) + DEPRAVITY-level bonus (`progression.getLevel()`×0.015, cap +0.15) − location difficulty (`LOCATION_REQ_DIFF`) − girl-type difficulty (`hunt.ARCHETYPE_DIFFICULTY`×0.18) − defiance/intelligence. Clamped **0.05–0.95**.
- **Daily cap** — `state.itemRequestLog` keyed `${locationId}|${archetype}` → game-day (`gameClock.now()/MIN_PER_DAY`). One ask per girl-type per location per game-day; attempt burned on success OR fail. New `state.noteItemRequest`/`lastItemRequestDay` + DEFAULT_STATE field + migrate backfill.
  - ⚠️ **Design note (open for Gee's call)**: pre-capture girls are ephemeral (no stable id), so the daily limit is keyed to **(location, girl-type)** not a specific girl — the only enforceable "not endless" model. Re-key if Gee wants per-girl.
- **UI** — "Ask her for something" panel in the hunt encounter (`hunt-view.js renderApproach`, between Talk and Capture): 3 option buttons w/ live %, color-coded, full effect tooltip; result line on roll; re-renders ~1.1s later to lock the spent daily attempt.
- **Capture haul** (`loot.grantCaptureHaul`, wired in `capture.js simpleAttempt` success) — strips her stash: **2–5 of EACH** of her type's 3 items, PLUS **~1-in-3** a random level-appropriate **sex toy** from the toys catalog. Returns `{ items, toy }`.
- `loot.js` export: `LOCATION_LOOT, FULL_POOL, ARCHETYPE_GIFTS, REQUEST_TEMPLATES, TIER_BASE, rollCaptureLoot, scavengeLocation, tickArchetypeGifts, requestOptions, requestItem, grantCaptureHaul`.
- **Doc sync (same commit)**: `wiki.html` Loot &amp; finds rewritten to match; `TODO.md` REQUEST.1 → `[x]`; `FINALIZED.md` new session entry; this `resume.md`.

### 🐞 Headless smoke-test pass (no code shipped — temp harness removed)
- Booted `game.html` headless (Chrome `--headless=new`, seeded age-gate, sandbox new game): all **90 scripts load**, all **21 routes render**, 8 ticks + an engine-action battery (progression/supply/condoms/milk/propositioner/slave-market/dispose→trophy) ran **0 errors**. **No real bugs found** — the two flags were harness arg mistakes, not game bugs. Temp files scrubbed.
- `start.bat` Ollama `bind: Only one usage of each socket address` is **benign** — Ollama already running on :11434; the launcher's redundant `ollama serve` can't re-bind. Game reaches the running instance fine.

---

## ⏭️ OPEN / NEXT

- **REQUEST.1 playtest (optional follow-up)** — it's shipped + pushed, not blocking. When Gee plays it: hunt → "Ask her for something" across girl types (confirm odds shift by type/location/level + daily lock), capture one (confirm 2–5-of-each haul + occasional toy). If the daily-limit keying or odds feel off, tweak `loot.js requestSuccessChance` / `requestKey`.
- **TUTORIAL.1** — guided onboarding. **DEFERRED by Gee** until he says go. Do NOT start unprompted.
- Active backlog in [`TODO.md`](./TODO.md): the BAL.1–5 balance epic + the progression/economy mega-directive items (most already shipped in the prior mega-build — verify against FINALIZED before re-touching).

---

## 🧪 HOW TO RESUME / TEST
Open via `start.bat` (serves on `:9535`, opens browser) with Ollama on `localhost:11434` + a Pollinations `pk_` key in Settings. Landing page → 🎬 Start New Game.
- REQUEST.1: Town → a hunt location → a girl card → **Approach** → "Ask her for something" (3 type-specific options w/ %). Capture her → watch the 🎒 stash haul (2–5 each) + possible 🧰 toy drop.
- Docs: landing tiles 📘 Readme / 🛠 Setup Guide open `doc.html`.

Engine modules are IIFEs on `window.DMTHGame.*`; UI on `window.DMTHRouter`; captives live in `state.current.roster` (NOT `.girls`). Load order in `game.html`.

## ⚖️ LAWS (binding)
LAW #0 verbatim Gee words · LAW #1 no AI-vendor attribution in shipping code/docs/commits · no tests (`node -c` + manual) · 800-line read before edit · docs-before-push · adult-floor 18+ on every template/spawn · Git Flow (work on `UpdateWork`/`feature/*`, never direct on `main`/`develop`). `.claude/` gitignored.

*Resume from here: landing redesign + REQUEST.1 are SHIPPED + PUSHED to `UpdateWork` (commit `21042ae`), working tree clean. Optional next: Gee playtests REQUEST.1 + decides on the (location,girl-type) daily-limit keying. TUTORIAL.1 still deferred.* 🖤
