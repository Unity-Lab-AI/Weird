# ASSET STYLE BIBLE — DUNGEON MASTER: THE HUNT

**Purpose:** one locked visual style so every generated game asset (location cards, item icons, dungeon
art, room/facility art) reads like it came from ONE artist — instead of 102 mismatched flux rolls.
This is the cohesion spine. Every asset prompt = **the shared STYLE BLOCK + the asset's own subject prompt**
(from `js/assets/catalog.js`) + a **deterministic per-asset seed**.

> Cross-refs: `js/assets/asset-gen.js` (the procedural engine — holds the canonical `STYLE_BLOCK` constant,
> this doc is the human-readable source of truth) · `js/assets/catalog.js` (per-asset `prompt` fields) ·
> `js/assets/loader.js` (resolve chain) · `js/ui/asset-img.js` (slot filler) · `scripts/build-assets.mjs`
> (batch generator for the static default set).

---

## THE THREE-TIER FALLBACK CHAIN

Every asset slot (`[data-asset-category][data-asset-id]` in the UI) resolves in this order:

1. **DYNAMIC / PROCEDURAL** *(opt-in, `localStorage.dmth_procedural_assets === 'true'`)* — `asset-gen.js`
   composes `STYLE_BLOCK + catalog.prompt` with the asset's deterministic seed, fires Pollinations, caches
   the blob in IDB. Same logical asset → same seed → consistent render every time. This is the live,
   no-static-files-needed path.
2. **STATIC DEFAULT SET** — a committed `assets/<plural>/<id>/cover.png` per asset. `loader.js` already
   resolves `cover.png` first. This set is generated ONCE (via `build-assets.mjs`), hand-curated, and
   committed. It is BOTH the guaranteed-present fallback (works offline / Pollinations-down / GitHub Pages)
   AND the visual **template/example** for what each asset should look like.
3. **EMOJI** — the catalog `emoji` field. The current live default. Never removed — the ultimate safety net.

The static default set (tier 2) is the example/reference; the procedural engine (tier 1) generates fresh
in-style variants on demand; emoji (tier 3) guarantees the game is never bare.

---

## THE STYLE BLOCK (cohesion spine)

Append this VERBATIM to every asset subject prompt. Keep it the single source of truth — if it changes,
change it in `asset-gen.js`'s `STYLE_BLOCK` constant and re-run the default-set generator.

```
dark grimy dungeon-noir aesthetic, 35mm film grain, low-key cinematic lighting, deep shadows,
desaturated muted base palette of black / charcoal / oxblood, lit by sickly accents of blood-red,
neon-pink and bruise-purple, wet sheen, oppressive moody atmosphere, high detail, painterly-realistic,
consistent square framing, no text, no watermark, no logo, no border
```

**Palette (locked):** black + charcoal base · oxblood/dried-blood mid · blood-red / neon-pink / bruise-purple
accents. Never bright, never clean, never cheerful, never daylight-flat.

**Framing (locked):** square (1:1), subject centered, generous shadow margins. Icons/items = product-on-dark
framing; locations/dungeons/rooms = establishing-shot framing. No people in the static asset set (people are
the per-girl imaging system's job) — these are PLACES and OBJECTS.

---

## PER-CATEGORY TEMPLATE GUIDANCE

Each category's catalog `prompt` already carries a decent subject; the style block unifies them. Where a
prompt is thin or off-palette, tune it toward these shapes (the "better prompts where stylized together" pass):

| Category | Subject template shape | Framing |
|---|---|---|
| **location** (15) | establishing exterior/interior of the place, no people, atmosphere-forward | wide establishing, square crop |
| **item** (63) | single object, product-on-dark, slight rim light, menacing-but-clean | centered product shot |
| **dungeon** (9) | the hideout interior/exterior as a brooding space, empty of people | cross-section / establishing |
| **room** (7) | a single cell/hold interior, restraint furniture, no occupant | interior establishing |
| **facility** (8) | the installed fixture (cameras, soundproofing, disposal rig) on-site | detail / installed-in-place |

**Cohesion rules:**
- Same STYLE BLOCK on all of them — that's what makes a syringe icon and a sewer-tunnel read as one set.
- Per-asset deterministic seed (`djb2(category + '/' + id)`) so re-rolls of the SAME asset stay consistent.
- No bright product-catalog white backgrounds; everything sits in the dungeon-noir dark.
- 18+ taboo theme stays in fiction; the STATIC PUBLIC default set leans menacing/atmospheric, NOT explicit
  (these ship in the repo + may surface on a static host) — explicit content stays in the per-girl runtime
  imaging behind the age gate. Items/places aren't bodies, so this is rarely an issue, but keep promo-safe.

---

## REGENERATING THE DEFAULT SET

```
node scripts/build-assets.mjs            # all 102 assets → assets/<plural>/<id>/cover.png
node scripts/build-assets.mjs item       # just one category
node scripts/build-assets.mjs item pipe  # just one asset (re-roll a miss)
```

Generate → eyeball → re-roll the misses (same command, the seed varies per run unless pinned) → commit the
winners. The committed `cover.png` set is the curated template/fallback. Bumping `STYLE_BLOCK` means a full
re-gen for cohesion.
