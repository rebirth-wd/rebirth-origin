# Smoke Silhouettes Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace both astronauts and the dog with smoke-filled silhouettes cut from the client's images, remove the pre-contact pause and the beam, and put stars behind the phone showcase.

**Architecture:** One Python generator cuts each source image into limb parts, bakes the smoke texture into every part and writes the WebP parts plus `rig.json` / `dog.json`. The existing `Astronaut.astro` → `rig.json` contract is kept; `Dog.astro` becomes the same kind of part rig. `journey.ts` reads its geometry constants from the JSON instead of hard-coded numbers; `timing.ts` loses the hold and beam beats.

**Tech Stack:** Astro 7, GSAP 3, Python 3 (Pillow, NumPy, OpenCV), Playwright-core for the probe.

**Spec:** `docs/superpowers/specs/2026-11-16-smoke-silhouettes-design.md`

## Global Constraints

- Left figure = photo 1, right figure = photo 2 mirrored horizontally.
- No suit detail, watermark or patch visible: parts carry smoke pixels only, alpha from the silhouette.
- Hands touch at `A` 3.00 s, the same instant the screen is fully smoke. No beat may hold the figures still before it.
- White flash: `B.flashIn` 3.32 → 3.60 s, `whiteHold` 0.15 s, `whiteFade` 0.50 s, unchanged.
- Untouched: hero copy, section 2, phone app animations, all timings not named below, reduced-motion layout.
- Part names for BOTH figures: `torso`, `arm-reach-upper`, `arm-reach-lower`, `arm-other`, `leg-a-upper`, `leg-a-lower`, `leg-b-upper`, `leg-b-lower`.
- Dog part names: `body`, `leg-front-near`, `leg-front-far`, `leg-hind-near`, `leg-hind-far`, `tail`.

## Review Focus

- Phone width (390×844): chest window must still cover the whole screen at 3.00 s (probe in Task 3).
- Reverse play (section2 → hero): figures must resume floating, no stuck zero-amplitude idle (probe in Task 3).
- Resize mid-journey: dog end rect still matches the phone's frozen frame (existing `remeasure`, probe in Task 4).
- Limb joints at idle extremes: no transparent gap at any joint at ±8° (generator assert in Task 1).
- Reduced motion: page still renders three stacked blocks with static figures (probe in Task 5).

---

### Task 1: Generator and astronaut assets

**Files:**
- Create: `docs/journey/source/astronaut-a.png`, `astronaut-b.png`, `smoke.png`, `dog.png` (the client's four images)
- Create: `docs/journey/tools/silhouette.py`
- Replace: `src/assets/space/astronaut-{left,right}-*.webp`, `src/assets/space/smoke-pink.webp`
- Replace: `src/components/space/rig.json`
- Delete: `src/assets/space/source-figures.webp`, old part files not in the new name list

**Interfaces:**
- Produces `rig.json`: per figure the existing keys (`width`, `height`, `chest`, `hand`, `headAngle`, `handInPart`, `parts[]` with `name, parent, z, file, css{left,top,width,height,ox,oy}`), plus top-level `clasp: { rightRelW: number, off: [x, y] }` (right box origin − left box origin in left-box widths) and `left.smokeRect: { l, t, w, h }` (fractions of the left box; a 16:10 fully opaque window centred on `chest`).
- Rotation 0 of each box = the clasp pose: left's reaching hand tip and right's reaching hand tip coincide when placed with `clasp`.

- [ ] **Step 1:** Write `silhouette.py astronauts`. Alpha = not-white threshold + largest component + 2 px feathered edge. Photo 2 is flipped. Each figure is rotated so its reaching arm points at the other figure. Joints (shoulder, elbow, hip, knee) are a hard-coded table of pixel coordinates per source image. Each part = alpha of its region, dilated 10 px across the cut, RGB from a crop of `smoke.png` sampled in rest-pose box coordinates (left: pink/violet region, right: blue region).
- [ ] **Step 2:** Asserts at the end of the script, which fail the run: clasp hand tips within 2 px; `smokeRect` 100% opaque; with every joint at ±8° the union alpha has no hole inside the rest silhouette larger than 6 px²; total part bytes < 400 KB.
- [ ] **Step 3:** Run `python3 docs/journey/tools/silhouette.py astronauts`. Expected: `OK astronauts`.
- [ ] **Step 4:** `smoke-pink.webp` = the left `smokeRect` window rendered at 2560×1600 from the same smoke crop.
- [ ] **Step 5:** Commit `feat: astronaut smoke silhouettes (assets + rig)`.

### Task 2: Astronaut idle tables and idle amplitude

**Files:**
- Modify: `src/components/space/astronaut.ts` (`IDLE`, `RELAX`, new export)
- Modify: `src/components/space/Astronaut.astro` (aria-labels only)

**Interfaces:**
- Produces: `setIdleAmp(root: HTMLElement, n: number): void`. Multiplies every idle term (part rotations and rig bob/roll) by `n` in `apply()`; 1 = normal, 0 = exact rest pose. Applied even when the loop is paused.

- [ ] **Step 1:** `IDLE.right` uses the shared part names; `RELAX` bends `arm-reach-upper` / `arm-reach-lower` for both figures (signs chosen so reach 0 folds the arm towards the body).
- [ ] **Step 2:** Add `amp: number` to `State`, default 1, and `setIdleAmp`.
- [ ] **Step 3:** Run `npx astro check`. Expected: 0 errors.
- [ ] **Step 4:** Commit `feat: astronaut idle amplitude control`.

### Task 3: Act 1 without the pause

**Files:**
- Modify: `src/components/sections/spacejourney/timing.ts`
- Modify: `src/components/sections/spacejourney/journey.ts`
- Create: `docs/journey/tools/auto/contact.mjs`

**Interfaces:**
- Consumes: `rig.clasp`, `rig.left.smokeRect`, `setIdleAmp`.

- [ ] **Step 1:** Write `contact.mjs` (Playwright, `/?journey=debug`, uses `root.__sj.ctl`). At 1440×900 and 390×844: sample hand distance every 0.1 s over A; assert it strictly decreases from 0.3 s to 3.0 s (no hold), is < 3 px at 3.00 s, and that a screenshot at 3.00 s has no pixel darker than luminance 40. Then jump to section2, play back to hero, wait 2 s, assert two samples of a limb rotation 0.5 s apart differ (idle resumed).
- [ ] **Step 2:** Run it. Expected: FAIL on "strictly decreases".
- [ ] **Step 3:** `timing.ts` A: `converge` = `{ start 0, dur 3.00, ease 'power1.inOut' }` to 100%; delete `convergeSlow`, `handsTouch`, `idleCorrection`; add `idleSettle` = `{ start 2.16, dur 0.84, ease 'sine.inOut' }` (idle amplitude 1 → 0); `idleFreeze` start = 3.00.
- [ ] **Step 4:** `journey.ts`: `st.conv` single tween to 1; `st.idle` 1 → 0 on `idleSettle`, pushed to both figures with `setIdleAmp` in `render()`; remove `st.fix`, `eH`, `eC` and the measuring branch of `freeze()`; `R_REL_W`, `R_OFF`, `SMOKE_RECT` read from `rig.json`; `ROLL_MAX` = 0.
- [ ] **Step 5:** Run `contact.mjs`. Expected: PASS at both sizes.
- [ ] **Step 6:** Regenerate `docs/journey/TIMING.md` with `node docs/journey/tools/timing-doc.mjs`; commit `feat: figures float until the hands touch`.

### Task 4: Smoke dog with floating limbs

**Files:**
- Modify: `docs/journey/tools/silhouette.py` (add `dog` command)
- Create: `src/assets/space/dog-*.webp`
- Replace: `src/components/space/dog.json`, `src/components/space/Dog.astro`
- Create: `src/components/space/dog.ts`
- Modify: `src/components/sections/spacejourney/journey.ts`, `src/components/sections/phoneshowcase/SpaceArt.astro`
- Create: `docs/journey/tools/auto/dog.mjs`

**Interfaces:**
- Produces `dog.json`: `viewBox`, `body: [x%, y%]`, `silhouette` (SVG path of the rest outline, traced from the alpha, used by `dogCoverWidth`), `parts[]` in the `rig.json` part format.
- Produces `<Dog class? idle={true} />`; root still `div.rb-dog[data-dog]`. `idle={false}` renders the rest pose and never starts the loop.
- Produces `dog.ts`: `initDogs(scope?: ParentNode): void`. Legs ±3–4°, tail ±6°, periods 4–9 s, paused off-screen and under reduced motion.

- [ ] **Step 1:** Write `dog.mjs`: at B 2.0 s two samples of `leg-front-near` rotation 0.5 s apart differ; at B 3.60 s the stage dog rect equals `showcase.dogRect()` within 2 px; no element matches `[data-sj-beam]` (Task 5 makes that last assert pass).
- [ ] **Step 2:** `silhouette.py dog`: segment the dog (GrabCut seeded from the orange suit + helmet circle), drop the hose and station, cut four legs and the tail at hard-coded joints, bake smoke. Same joint-gap assert as Task 1.
- [ ] **Step 3:** `Dog.astro` renders parts from `dog.json`; the gradient fill, mask and detail SVG go. `SpaceArt.astro` passes `idle={false}`.
- [ ] **Step 4:** `journey.ts`: remove `st.detail`, the rim code and `privatiseSvgIds`; `timing.ts` B: delete `dogDetail`.
- [ ] **Step 5:** Run `dog.mjs`. Expected: first two asserts PASS.
- [ ] **Step 6:** Commit `feat: smoke dog with floating limbs`.

### Task 5: Flash without the beam, stars behind the phones

**Files:**
- Modify: `src/components/sections/SpaceJourney.astro` (remove `.sj-beam`, `.sj-bloom` markup and CSS)
- Modify: `src/components/sections/spacejourney/timing.ts` (delete `beamIgnite`, `beamGrow`, `bloom`), `journey.ts` (their tweens)
- Modify: `src/components/sections/PhoneShowcase.astro` (`<SpaceBackdrop />` as the first child of `.ps`, under `.ps-glow`)
- Create: `docs/journey/tools/auto/final.mjs`

- [ ] **Step 1:** `final.mjs`: no `[data-sj-beam]` / `[data-sj-bloom]`; at B 3.60 s the screenshot's mean luminance > 245; at appdesign `[data-phoneshowcase] [data-space]` exists and is visible; with `reducedMotion: 'reduce'` the page height > 2.5 viewports and both `[data-astronaut]` are visible.
- [ ] **Step 2:** Run. Expected: FAIL on the beam assert.
- [ ] **Step 3:** Make the edits above.
- [ ] **Step 4:** Run `final.mjs`, `dog.mjs`, `contact.mjs`, `npx astro check`. Expected: all PASS, 0 errors.
- [ ] **Step 5:** Update `docs/journey/ASSETS.md` and regenerate `TIMING.md`; commit `feat: flash without beam, stars behind the phone showcase`.
