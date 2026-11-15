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

## `<Dog class? />`: `src/components/space/Dog.astro`
- Original vector art: a big friendly dog, side view, **facing right**. It has a round helmet with the dog's
  head inside (drop ear, muzzle, eye, nose), an air tank on its back, a valve and a hose curling into the back
  of the helmet, a raised tail and four legs (far legs shaded darker).
- Root `div.rb-dog[data-dog]`, `width: 100%`, intrinsic aspect ratio **990 : 710** (1.394).
- The body is `div.rb-dog__fill.rb-gradient-field`, masked by ONE closed SVG silhouette path (`mask-image` +
  `-webkit-mask-image`, data URI, `mask-size: 100% 100%`). The path has two interior holes: the gaps between
  the legs and the belly.
- The overlay `svg.rb-dog__detail` draws the helmet glass, rim and highlights, the head inside, the tank
  shading and bands, and a rim light. The body itself carries no overlay detail.
- Geometry: `dog.json`. Generator: `docs/journey/tools/dog.py` (shapely union + fillet).
- `--body-x`, `--body-y` = **41.82%, 41.41%**. This is the centre of the largest 16:10 rectangle inside the
  silhouette (`dogcover.py`).
- **Cover sizes**, centred on that point:
  - A 16:10 viewport is fully covered when the dog is **≥ 3.2 × viewport width** (e.g. 4600 px for 1440×900).
  - A 390×844 portrait viewport needs **≥ 8.6 × viewport width** (about 3350 px).
  - Don't go far above these sizes: the mask is rasterised at the element size.
- **`--dog-detail`** (default 1) sets the overlay opacity. Set it to 0 while the dog fills the screen, because
  the tank bands sit near the top of the cover rectangle. Fade it in as the dog recedes.
- The gradient's `background-size` is relative to the dog element. While the dog is huge, the gradient looks
  "zoomed" compared with a viewport-sized `.rb-gradient-field`. Hand over between the two with a short
  cross-fade.
- Verified crisp at 260 px and at 4600 px covering 1440×900, with a solid fill at the body point
  (`v3-dogs.png`, `final-dogs-390.png`, `v4-dogcover-1440.png`, `v4-dogcover-1440-detail.png`).

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

The star tiles and dog paths are inline (about 30 KB of HTML, uncompressed). `source-figures.webp` is not
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
- Dog, star field, nebula, crater field: original, generated here. No branded or copyrighted characters.
