# Space Journey — assets & components (Agent A)

Status: **final (v2)**. The contract surface hasn't changed since v1. The numbers below changed a little in v2
(chest point, box sizes), so read them from `rig.json` / CSS rather than hard-coding them.
Preview: `http://localhost:4321/preview/space`. It has the hero (moon, both figures, `--reach` slider), the
two figures in their source "hands clasped" arrangement at `--reach:1`, dogs at 260/520/900 px, a dog covering
the viewport, and the smoke texture.

## `<Astronaut who="left|right" class? />`: `src/components/space/Astronaut.astro` + `astronaut.ts`

- Root: `div.rb-astro[data-astronaut="left|right"]` with `position: relative; width: 100%` and an intrinsic
  `aspect-ratio`. left is 2034×1557 (1.306), right is 1335×1683 (0.793). Set its width on a wrapper or class.
  Every part is positioned in %, so the figure scales with the width. Put your transforms (position, rotation,
  scale) on the root or on a wrapper. The component only transforms its inner `[data-rig]` (bob/roll) and the
  `[data-part]` elements (limbs).
- **Unrotated pose**: both figures keep the orientation they have in `source-figures.webp`.
  - **left** (purple/pink, red legs): head at the top-right, reaching arm going down-right from the chest,
    other arm up-left, legs trailing to the lower-left. `--head-angle: -32.5deg` (head points right and a little
    up). To point it head-first at a figure to its lower-right (about +30°), rotate the box by about **+62°**.
  - **right** (blue): head at the top-left, reaching arm going left, knees bent, shins to the lower-right.
    `--head-angle: -126deg` (head points up-left). To point it at a figure to its upper-left (about -150°),
    rotate the box by about **-24°**.
  - `--head-angle` uses screen axes: 0 = right, 90 = down.
  - **Important for act 1:** the hands meet only in the source arrangement, where both boxes have rotation 0,
    the same scale, and the offsets below. The head-first hero rotations (+62° / -24°) point the arms elsewhere.
    So during `approach` tween each box's rotation from its hero angle to 0 (or to any rotation the two share)
    while `--reach` goes 0 → 1.
- **Source arrangement (hands clasped)**: use the same pixel scale for both boxes. Then
  right box origin = left box origin + `((703-63)*3, (179-60)*3)` = **(+1920, +357)** in box-pixel units, where
  the left box is 2034 px wide. As fractions of the left box width that is
  **(+94.40%, +17.55%)**, and the right box width is **65.63%** of the left box width.
  `rig.json` → `source_box`, `scale`, `width`, `height` has the raw values. Preview section `#clasp` builds
  exactly this arrangement (`docs/journey/shots/A/clasp.png`, `clasp-hands-zoom.png`). The hands overlap by
  about 5 source px, so there is no seam.
- CSS variables on the root (read them with `getComputedStyle`, or `import rig from '@/components/space/rig.json'`):
  - `--chest-x`, `--chest-y`: % of the box. This is the centre of the largest fully opaque 16:10 rectangle on
    the figure (upper chest), i.e. the act-1 zoom target. **left: 69.91%, 22.35%**; right: 45.39%, 26.92%.
  - `--hand-x`, `--hand-y`: % of the box. This is the reaching hand tip at `--reach: 1` with the figure at
    rest. **left: 98.08%, 63.20%** (right edge of the box); **right: 4.72%, 36.54%**.
  - `--head-angle`: see above.
- **Reach**: tween the inline custom property, for example `gsap.to(root, { '--reach': 1 })`. Each tick the
  script reads `root.style.getPropertyValue('--reach')`. That reads the inline style only, so it never forces a
  style recalc. You can also call `setReach(root, n)`. 0 = arm relaxed and bent towards the body. 1 = arm fully
  extended in the source pose. The arm moves with a smoothstep, and the idle sway on the reaching arm fades
  to 10% as reach → 1 so the hand is steady at contact. Changes are applied even while the idle loop is paused,
  through a MutationObserver on `style`.
- Live points: `handPoint(root)` and `chestPoint(root)` return viewport `{x, y}`. They include idle motion,
  reach and your transforms (they use marker elements and `getBoundingClientRect`, so call them sparingly,
  e.g. once on refresh, not every scrub frame).
- **Idle spacewalk**: one GSAP timeline per figure. Each limb gets two overlapping `sine.inOut` yoyo tweens
  with different periods (3.3–10 s, ±0.5–6.5°), and every figure gets ±10% random period jitter and a random
  start phase. Child limbs nest inside their parent, so a lower leg inherits the thigh's swing. The whole figure
  also bobs and rolls on `[data-rig]` (xPercent ±1, yPercent ±1.4, rotation ±1.6–1.8°, 7–14 s). It runs by
  itself and pauses when the root is off-screen (IntersectionObserver, 10% margin). It never runs under
  `prefers-reduced-motion` (reach still works). `setIdle(root, false|true)` stops or restarts it manually, for
  example while the screen is full of smoke. Writes go through `gsap.quickSetter` (transforms only).
- Exports of `astronaut.ts`: `initAstronaut(root)`, `initAll(scope?)` (the component calls it on load),
  `setReach(root, n)`, `handPoint(root)`, `chestPoint(root)`, `setIdle(root, on)`. Debug handle:
  `root.rbAstronaut`.
- Rig parts (z-order low → high):
  - left: legs a/b (upper→lower), arm-back, torso+head, reaching arm upper→lower.
  - right: shins, legs-upper, torso+head, arm-other, reaching arm upper→lower.
  - Pivots are at the shoulders, elbows, hips and knees. Each part overlaps its neighbour by about 10 source px
    with a feathered edge.
  - Checked at ±7–8° on every joint at once (`seam8.png`, `seam-8.png`, `seam-alt7-*-dpr2.png`): no gaps. The
    only effect is a faint double texture at the left hip at the extremes. Idle amplitudes are smaller than that.
- Assets: `src/assets/space/astronaut-{left,right}-*.webp`, 15 files, **156 KB** total. Pipeline:
  - Figures separated by the hand split at x = 722 ± 5 px plus connectivity.
  - Paint specks dropped. Kept: the detached shoe of the left figure's upper leg.
  - Colours pushed outward under the alpha before resampling, so there is no dark fringe.
  - ×3 Lanczos, then two bilateral passes (de-block), then a light unsharp.
  - Binary alpha → blurred smoothstep edge (about 4–6 px soft at 3×).
  - Generator: `docs/journey/tools/rig.py`.

## `smoke-pink.webp`: `src/assets/space/smoke-pink.webp`
- **2560 × 1600, 21.7 KB.** It is exactly the left figure's 16:10 chest window: box rect
  `left 57.08%, top 11.88%, width 25.57%, height 20.87%` of the left Astronaut box, centred on
  `--chest-x/--chest-y`. If you overlay it on that rect (`object-fit: fill`), it lines up with the figure
  before you cross-fade.
- Processing: bilateral → ×6.7 bicubic → Gaussian σ6 → faint large-scale noise. Soft, no blocks.
- **Average colour `#6c67b2`** (lavender-violet; the chest of the source figure is lavender/blue with pink
  streaks).
- Generator: `docs/journey/tools/smoke.py`.

## `<Dog class? idle? />`: `src/components/space/Dog.astro`
- A crisp **silhouette** of the client's labrador in a glass bubble helmet with a back tank
  (`docs/journey/source/dog.png`), **facing left**, filled with pink / magenta / violet / blue smoke from
  `docs/journey/source/smoke.png`. No suit detail, no hose or tether. Same look as the astronauts.
- Root `div.rb-dog[data-dog]`, `width: 100%`, intrinsic aspect ratio **1997 : 1891** (`dog.json.viewBox`
  `[0, 0, 1997, 1891]`, box px). `--body-x`, `--body-y` are set on the root.
- Six parts nested like `<Astronaut/>` (`div.rb-dog__part[data-dog-part]`, `left/top/width/height` in % of the
  parent box, `transform-origin` = joint): `body` (torso + helmet + tank) with children `leg-front-far` (z 0, under),
  `tail` and `leg-hind-far` (z 1, under), `leg-front-near` (z 3, over), `leg-hind-near` (z 4, over). Far legs are a
  touch darker for depth. Each limb reaches 28 px (box) fully opaque under its neighbours, then tapers, so no seam
  opens up to ±8°; the smoke is sampled once in rest-pose box coordinates, so the texture is continuous at rest.
- Each part has two images: the smoke (`dog-<part>.webp`) and a **volume layer** (`dog-<part>-shade.webp`,
  `img.rb-dog__vol`, half resolution): a soft inner shade along the edges (stronger away from the light, upper
  left) and a thin rim light on the lit edges.
- **Glass overlay** `svg.rb-dog__glass` (vector, scales cleanly; geometry in `dog.json.helmet`): the dog's head
  inside the bubble as a darker smoke tone (face with drop ears, nose, eyes; traced from dog.png), a glass sheen, a
  bright thin rim with a faint inner ring, and three curved speculars. Gradient ids are unique per instance.
- **`--dog-detail`** (default 1) is the opacity of the volume layer and the glass overlay. journey.ts already
  drives it: 0 while the dog covers the screen (the helmet sits next to the 16:10 body window), fading in from
  B 0.97 s. The frozen frame in the phone leaves it at 1.
- **Idle** (`dog.ts`, `initDogs(scope = document)`, called by the component): every leg turns ±3.6° max, the tail
  ±6°, each as two summed sines with incommensurate periods (4–9 s) and a random phase. Paused off-screen
  (IntersectionObserver), never runs under `prefers-reduced-motion`, and not at all with `idle={false}`
  (`data-dog-idle="false"`): the dog in the phone (`SpaceArt.astro`) is a frozen frame at the rest pose.
- Generator: `docs/journey/tools/dog_silhouette.py` (GrabCut + hand-tuned shapes: fitted helmet ellipse, a capsule
  tank and one smooth back line, a redrawn far hind leg, paw undersides; SDF-smoothed ~2 px anti-aliased edge;
  asserts at the end; `--shots DIR` writes the contact sheets). Weight: **210,586 bytes** (smoke 151,896 + volume
  58,690), 12 files.
  - `body` = **36.43%, 42.54%**: the centre of the largest 16:10 rectangle (783 × 489 box px) that is 100% opaque in
    the `body` part alone (asserted on the decoded WebP).
  - `silhouette` = one closed SVG path (box px) of the **stable** outline: the area covered in every idle pose
    (limbs at their idle extremes), so a cover computed from it (journey.ts `dogCoverWidth`, isPointInFill) holds
    while the legs move. It is a little inside the rest outline at the limbs; don't use it as a visual mask.
- **Cover sizes**, centred on `body`: a 16:10 viewport is covered from ≈ **2.6 × viewport width** (3747 px for
  1440×900 incl. journey.ts's 3% margin); a 390×844 portrait viewport needs ≈ **7.9 × viewport width** (3073 px).
  The parts are 1997 px wide, so at the cover size the smoke is upscaled ~2×: soft smoke, that is fine.
- Verified (`docs/journey/shots/dog/`, gitignored): contact sheet at 260 / 900 px, legs ±8°, 4× edges; browser at
  100–900 px incl. the glass at 4×; `/?journey=debug` transition B at 1440×900 and 390×844: smoke covers the
  screen at B 0.44 s and the stage dog lands on the phone's dog rect to 0.1 px.

## `<SpaceBackdrop moon? moonPhoto? class? />`: `src/components/space/SpaceBackdrop.astro`
- Root `div.rb-space[data-space]`, `position:absolute; inset:0` (fills its positioned parent),
  `contain: strict`, `pointer-events: none`.
- Layers:
  - A nebula tint from radial gradients: violet top-left, blue right, faint pink low.
  - Three tiled SVG star layers (data URIs with 150, 70 and 28 stars on 613, 1109 and 1777 px tiles, seeded,
    so they are identical on every build). They are static and crisp at any DPR.
  - The bright layer twinkles with a 7 s opacity animation, which is off under reduced motion.
- No JS (except the photo `onload`).
- With `moon`, a `div.rb-space__moon[data-moon]` covers the bottom 40% of the stage (`left/right: -6%`). It
  holds `src/assets/space/moon-surface.webp`: **2400 × 700 RGBA, 279 KB**. The render is a large sphere limb:
  - Lit from the upper-left, with limb/terminator falloff and a crisp anti-aliased horizon. Transparent above.
  - Albedo (maria/highlands) from the three.js lunar map (low frequencies only).
  - A procedural crater field with bowls, rims, central peaks, ejecta and degraded old craters, plus the map's
    own crater micro-structure tiled as bump.
  - Low-sun shading with cast shadows, and relief flattening towards the horizon.
  - Generator: `docs/journey/tools/moon2.py`.
  - On a 390 px portrait screen `object-fit: cover` crops it to a nearly flat horizon (`v3-hero-390.png`).
    Override `.rb-space__moon` height or width in your matchMedia if you want more curvature.
- `moonPhoto` (default `true`; only takes effect together with `moon`): an `<img>` of `images.moonSurface`
  (Unsplash, hotlinked, `fetchpriority=low`) sits above the local render at opacity 0.
  - Its `onload` adds `.has-photo`, which fades the photo in (screen blend, top 25% masked so its black sky
    drops out) and dims the local render to 0.35.
  - **The photo was not previewable from this container** (`images.unsplash.com` is blocked here). Its framing
    is unverified. If it doesn't sit well, pass `moonPhoto={false}`.

## Weight (hero-related, on disk)
| asset | bytes |
|---|---|
| astronaut parts (15 WebP) | 156,362 |
| moon-surface.webp | 278,780 |
| smoke-pink.webp | 21,670 |
| **total** | **456,812 (~446 KiB)** |

The dog parts `dog-*.webp` add 210,586 bytes (twelve files). The star tiles are inline in the HTML; the dog's
`silhouette` path (~17 KB) ships in the journey script, which imports `dog.json`. `source-figures.webp` is not
loaded at runtime.

## Sources / licences
- `source-figures.webp`: the client's existing hero art (provided). Every `astronaut-*` part and
  `smoke-pink.webp` are derived from it.
- Lunar albedo/detail: `moon_1024.jpg` from the three.js repository
  (`https://raw.githubusercontent.com/mrdoob/three.js/dev/examples/textures/planets/moon_1024.jpg`). three.js is
  MIT-licensed; the planet textures there are commonly credited as derived from NASA public-domain imagery.
  The download was kept outside the project and used only as input data. The shipped file is a new render.
- `images.moonSurface`: Unsplash photo `1777277539249-34020e857900`, NASA (@nasa), Artemis II flyby,
  "Cratered lunar surface against a dark sky", Unsplash License. The ID was confirmed from its photo page.
- Dog: the OUTLINE of the client-supplied `docs/journey/source/dog.png`, filled with the client-supplied
  `smoke.png`; no photo pixel is shipped. Star field, nebula, crater field: original, generated here.
