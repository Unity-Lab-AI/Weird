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

Every asset slot (`[data-asset-category][data-asset-id]` in the UI) shows the emoji as a clickable
placeholder, and the image resolves in this order:

1. **DYNAMIC / PROCEDURAL — the DEFAULT (on)** — each asset generates its OWN image **per playthrough**.
   It's warmed in the background **when the asset is first acquired** (`asset-gen.prewarm`, called from
   `state.addItem` / `addDungeon` / `addOwnedLocation`) and/or generated **on the first click** of its
   emoji. `asset-gen.js` composes `STYLE_BLOCK + catalog.prompt` with the asset's seed, renders on the local SD server,
   caches the blob in IDB, and **stacks every fresh generation into the playthrough asset gallery**
   (`state.assetGallery` → the `#asset-gallery` view). Default ON; disable with
   `localStorage.dmth_procedural_assets === 'false'`.
2. **STATIC DEFAULT SET — the FALLBACK** — a committed `assets/<plural>/<id>/cover.png` per asset,
   generated once via `build-assets.mjs` and hand-curated. Shown **only when a live generation fails**
   (SD server down / offline / blocked). It is also the visual **template/example** every procedural
   render aims to match. Guaranteed-present so a static host is never bare.
3. **EMOJI** — the catalog `emoji` field. The clickable placeholder shown until an image exists, and the
   ultimate safety net. Never removed.

**Interaction:** clicking any asset slot opens a **click-away popup** (`asset-popup.js`, modeled on the
loot-popup — *any* click dismisses) that shows the image big, generating it live on the spot if it isn't
generated yet. The inline slot swaps to the cached render on the next decorate pass (`loader.resolveImageUrl`
is cache-only / no-network; live generation happens in the popup + on-acquire prewarm). Resolve helpers:
`asset-gen.getCached` (no-network cache lookup) + `loader.invalidate` (drop the memo after a fresh gen).

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

## PROMPT-AUTHORING LAW — DESCRIBE THE REAL OBJECT: COY BUT CONCRETE

**The single most important rule, and the one that wrecked the first generation pass.** A catalog
`prompt` is fed verbatim to the image generator. It must describe the **actual physical object/place**
by its real form — never the deranged in-game `displayName`, never abstract filler.

Three hard rules:

1. **NEVER echo the crazy in-game name.** The `displayName` can be as taboo/obtuse as we want — that's
   the game label. But if its wording lands in the prompt, the generator paints the literal words: a
   "Pear of Agony" prompted as *"pear of agony"* renders a piece of **fruit**, not the hinged iron
   torture device. Describe the device, not the name.
2. **NEVER use abstract/vague filler.** *"abstract silicone sculpture"*, *"smooth purple object"*,
   *"a plain card"* → the generator renders a featureless blob. Name the concrete form: shape, parts,
   material, proportions, base, strap, tip, etc.
3. **COY VOCABULARY ONLY — but coy ≠ vague.** Use clean, non-explicit words (no porn slang) so the
   prompt clears the generator's filter — yet still pin the real form precisely enough that the correct
   object renders. The art is describing the *shape and function* in clean words.

Worked examples (the fix that turned blobs into accurate renders):

| Asset | ❌ Abstract/name-echo (renders wrong) | ✅ Coy + concrete (renders the real thing) |
|---|---|---|
| dildo | "abstract blue silicone sculpture" | "smooth upright silicone adult toy, rounded bulbous tip, gently curved elongated shaft, wide flat circular base, glossy blue" |
| plug | "smooth purple silicone object" | "small teardrop-shaped silicone insert, tapered rounded tip, slim neck, wide flat base, glossy purple" |
| ballgag | "silicone-and-leather mouth gag" | "round red rubber ball drilled through the center, threaded on a thin black leather strap with a metal buckle" |
| hood | "plain canvas hood" (rendered a person) | "empty soft canvas head hood, eye + mouth openings, drawstring neck, deflated, lying flat, no person, no head inside" |
| weed | "hand-rolled herbal cigarettes" | "several hand-rolled cannabis joints in a small open tin, loose green herb scattered beside it" |

If you add or rename an asset, write its prompt to THIS standard, then regenerate it. The
STYLE BLOCK supplies the mood; the prompt supplies the accurate subject.

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
