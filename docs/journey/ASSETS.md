# Space Journey — assets & components (Agent A)

Status: **final (v2)**. The contract surface hasn't changed since v1. The numbers below changed a little in v2
(chest point, box sizes), so read them from `rig.json` / CSS rather than hard-coding them.
Preview: `http://localhost:4321/preview/space`. It has the hero (moon, both figures, `--reach` slider), the
two figures in their clasp arrangement (`rig.clasp`) at `--reach:1`, dogs at 260/520/900 px, a dog covering
the viewport, and the smoke texture.

## `<Astronaut who="left|right" class? />`: `src/components/space/Astronaut.astro` + `astronaut.ts`

- Root: `div.rb-astro[data-astronaut="left|right"]` with `position: relative; width: 100%` and an intrinsic
  `aspect-ratio`. left is 1852×1664 (1.113), right is 1666×1830 (0.910). Set its width on a wrapper or class.
  Every part is positioned in %, so the figure scales with the width. Put your transforms (position, rotation,
  scale) on the root or on a wrapper. The component only transforms its inner `[data-rig]` (bob/roll) and the
  `[data-part]` elements (limbs). Always read numbers from `rig.json` (it is regenerated), not from this page.
- **Look**: crisp astronaut silhouettes filled with the client's smoke. Each silhouette is cut from the outline
  of a client photo (`docs/journey/source/astronaut-a.png` = left, `astronaut-b.png` mirrored = right).
  - Outline: smoothed like a vector curve, with the fingers kept. The head is a clean helmet dome over a
    backpack. The dome itself is the outline: the backpack (and on the left figure the shoulders under the helmet)
    never reaches past the shell, so there is no second, offset circle.
  - Inside: a dark smoke visor with a soft specular and a slightly denser backpack. The right figure has a faint
    groove where the helmet shell meets the pack; the left has none (`helmet.groove = 0`), so its helmet is one clean
    outline.
  - Volume: an inner edge shade and a faint rim light from the upper left.
  - No photo pixel is shipped. Left is pink/magenta/violet; right is blue/violet (its smoke is mirrored and
    hue-shifted).
  - The right figure's clenched fist is replaced by the open glove outline from photo a, so the reaching hands
    meet fingertip to fingertip.
- **Rotation 0 of both boxes is the clasp pose** (each figure is pre-rotated in the generator):
  - **left**: lying diagonally, helmet at the upper right, reaching arm pointing right (12°), other arm up,
    legs trailing to the lower left. `--head-angle: -37.5deg`.
  - **right**: upright, leaning slightly left, reaching arm pointing left (168°), other arm hanging.
    `--head-angle: -104deg`.
  - `--head-angle` uses screen axes: 0 = right, 90 = down. To point a figure head-first in a direction θ, rotate
    its box by θ − headAngle. Any head-first hero rotation points the arms elsewhere, so during `approach` tween
    each box's rotation back to 0 while `--reach` goes 0 → 1.
- **Clasp arrangement (hands meet)**: both boxes at rotation 0 and the same pixel scale.
  - `rig.clasp.rightRelW` = right box width / left box width (**0.89957**).
  - `rig.clasp.off` = right box origin − left box origin, in left-box widths (**[0.96403, 0.13445]**).
  - At `--reach: 1` the two hand points then coincide; the generator asserts ≤ 2 px. The fingertips overlap by
    about 6 box px, so there is no gap.
  - The bodies touch nowhere else (asserted).
  - Preview section `#clasp` (`dev-previews/space.astro`) builds exactly this.
- CSS variables on the root (or `import rig from '@/components/space/rig.json'`):
  - `--chest-x`, `--chest-y`: % of the box. This is the centre of the largest fully opaque 16:10 window in the
    torso, kept clear of the helmet and backpack detail. It is the act-1 zoom target. **left: 54.54%, 49.52%**;
    right: 56.69%, 36.97%.
  - `rig.left.smokeRect = { l, t, w, h }` (fractions of the left box) is that window:
    **0.43898, 0.42127, 0.21274, 0.14784**.
    - It is 100% opaque in the torso part alone, and no shading touches it (both asserted).
    - `smoke-pink.webp` is exactly this window.
  - `--hand-x`, `--hand-y`: % of the box. This is the reaching fingertip at `--reach: 1` with the figure at
    rest. **left: 98.201%, 58.323%**; **right: 1.999%, 39.426%**.
  - `--head-angle`: see above.
- **Reach**: tween the inline custom property, for example `gsap.to(root, { '--reach': 1 })`. Each tick the
  script reads `root.style.getPropertyValue('--reach')`. That reads the inline style only, so it never forces a
  style recalc. You can also call `setReach(root, n)`.
  - 0 = arm folded towards the body (shoulder −16°/+14°, elbow −30°/+26°, left/right).
  - 1 = arm fully extended in the clasp pose.
  - The arm moves with a smoothstep, and the idle sway on the reaching arm fades to 10% as reach → 1, so the
    hand is steady at contact.
  - Changes are applied even while the idle loop is paused, through a MutationObserver on `style`.
- Live points: `handPoint(root)` and `chestPoint(root)` return viewport `{x, y}`. They include idle motion,
  reach and your transforms (they use marker elements and `getBoundingClientRect`, so call them sparingly).
- Pose maths (no layout): `posePoint(root, part, rest)` takes a rest-pose point of `part` in box fractions (e.g.
  `rig.left.hand / 100` on `arm-reach-lower`, `rig.left.chest / 100` on `torso`) and returns where it is in the
  current pose (idle × amplitude, reach, rig bob / roll) in box fractions, plus the part's total rotation `rot`
  (deg). It is computed from `rig.json` and the same values the idle paints this frame, so it is exact and cheap
  every frame. journey.ts uses it to keep the hands and the chest window exact while the figures keep floating.
  `idleRollMax(who, part)` is the largest total idle rotation of a part (deg), used for the zoom cover.
- **Idle spacewalk**: one GSAP timeline per figure.
  - Each limb gets two overlapping `sine.inOut` yoyo tweens with different periods (3.3–10 s, ±0.5–6.5°).
  - Every figure gets ±10% random period jitter and a random start phase.
  - Child limbs nest inside their parent, so a lower leg inherits the thigh's swing.
  - The whole figure also bobs and rolls on `[data-rig]` (xPercent ±1, yPercent ±1.4, rotation ±1.6–1.8°,
    7–14 s).
  - It runs by itself and pauses when the root is off-screen (IntersectionObserver, 10% margin). It never runs
    under `prefers-reduced-motion` (reach still works).
  - `setIdle(root, false|true)` stops or restarts it.
  - `setIdleAmp(root, n)` multiplies every idle term (limb sway and the rig bob and roll) by n. The default is
    1 and 0 is the rest pose. It applies at once, even while paused, and does not affect reach. (journey.ts does
    not use it: the figures float at full amplitude right up to the contact, corrected with `posePoint`.)
  - Writes go through `gsap.quickSetter` (transforms only).
- Exports of `astronaut.ts`: `initAstronaut(root)`, `initAll(scope?)` (the component calls it on load),
  `setReach(root, n)`, `setIdleAmp(root, n)`, `handPoint(root)`, `chestPoint(root)`, `posePoint(root, part, rest)`,
  `idleRollMax(who, part?)`, `setIdle(root, on)`.
  Debug handle: `root.rbAstronaut`.
- Rig parts, the same 8 for both figures: `torso` (with helmet and backpack), `arm-reach-upper`,
  `arm-reach-lower`, `arm-other`, `leg-a-upper`, `leg-a-lower`, `leg-b-upper`, `leg-b-lower`.
  - Every child paints above its parent.
  - Pivots sit at the middle of hand-placed joint cuts (shoulders, elbows, hips, knees).
  - Across each cut, the parent reaches fully under the child for 36 box px and then tapers over another
    36 px. The child has a 20 px soft edge over the parent.
  - The smoke is sampled once per figure in rest-pose box coordinates, so there is no seam at the joints.
  - The generator asserts no hole at any joint with every joint at ±8° (all one way and alternating).
- Assets: `src/assets/space/astronaut-{left,right}-*.webp`, 16 files, **175,232 bytes** total. Alpha is lossless.
- Generator: `python3 docs/journey/tools/silhouette.py astronauts [--shots docs/journey/shots/t1]`. It prints
  `OK astronauts` when every assert passes. `--shots` writes the contact sheets.

## `smoke-pink.webp`: `src/assets/space/smoke-pink.webp`
- **2560 × 1600, 24 KB.** It is exactly the left figure's `smokeRect` window, rendered from the same smoke
  field as the figure, so it lines up when you overlay it on that rect (`object-fit: fill`) before the
  cross-fade.
- At this magnification (×18 of smoke.png) it is smoothed rather than sharpened, so no pixel grid shows.
- **Average colour `#fb57ba`** (hot pink).
- Generator: `silhouette.py astronauts` (same run).

## `<Dog class? idle? fill? detail? sync? />`: `src/components/space/Dog.astro`
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
- **Props** (defaults give the plain smoke dog, unchanged): `fill` = `'smoke'` (default) | `'white'` | `'black'` |
  `'none'` picks each part's first `<img>`: `dog-<part>.webp`, `dog-<part>-matte.webp`, `dog-<part>-knock.webp`, or
  no fill image. `detail={false}` omits every `img.rb-dog__vol` and `svg.rb-dog__glass`. `sync="name"` sets
  `data-dog-sync` on the root. Geometry and `data-dog-part` names are identical in every variant, so copies stack
  exactly. A copy with `fill !== 'smoke'` or `detail={false}` is decorative: no `role="img"`/`aria-label`, and
  `aria-hidden="true"`.
- **Matte assets** (`dog-<part>-matte.webp`: the part's alpha with RGB pure white, same pixel size as the smoke;
  `dog-<part>-knock.webp`: same alpha, RGB pure black, half the pixel size), six parts each, lossless so the edge
  stays crisp. Generator: `docs/journey/tools/dog-matte.mjs` (sharp, reads the smoke parts listed in `dog.json`;
  run `node docs/journey/tools/dog-matte.mjs` from the repo root, it prints every size). Weight: **63,990 bytes**
  (matte 49,954 + knock 14,036), 12 files.
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
  **Sync groups**: roots in one scope with the same `data-dog-sync` value are one group. The first is the leader
  (one set of tweens, one visibility observer, the reduced-motion handling); each tween writes the same rotation to
  the same-named `data-dog-part` in every root of the group. Followers get no tweens, and a second `initDogs()` call
  does not give them any. Roots without `data-dog-sync` are untouched.
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
- Used three times: act 1 (with the moon), act 2 behind the dog, and behind the App Design phone showcase
  (`PhoneShowcase.astro`, first child under `.ps-glow`), so the flash hands over to the same sky.
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
| astronaut parts (16 WebP) | 175,232 |
| moon-surface.webp | 278,780 |
| smoke-pink.webp | 24,050 |
| **total** | **478,062 (~467 KiB)** |

The dog parts `dog-*.webp` add 210,586 bytes (twelve files), and the matte/knockout copies add another 63,990 bytes
(twelve more). The star tiles are inline in the HTML; the dog's
`silhouette` path (~17 KB) ships in the journey script, which imports `dog.json`.

## Sources / licences
- Astronauts: the OUTLINES of the client-supplied `docs/journey/source/astronaut-a.png` / `astronaut-b.png`,
  filled with the client-supplied `smoke.png`; no photo pixel is shipped. `smoke-pink.webp` is from `smoke.png`.
- Lunar albedo/detail: `moon_1024.jpg` from the three.js repository
  (`https://raw.githubusercontent.com/mrdoob/three.js/dev/examples/textures/planets/moon_1024.jpg`). three.js is
  MIT-licensed; the planet textures there are commonly credited as derived from NASA public-domain imagery.
  The download was kept outside the project and used only as input data. The shipped file is a new render.
- `images.moonSurface`: Unsplash photo `1777277539249-34020e857900`, NASA (@nasa), Artemis II flyby,
  "Cratered lunar surface against a dark sky", Unsplash License. The ID was confirmed from its photo page.
- Dog: the OUTLINE of the client-supplied `docs/journey/source/dog.png`, filled with the client-supplied
  `smoke.png`; no photo pixel is shipped. Star field, nebula, crater field: original, generated here.
