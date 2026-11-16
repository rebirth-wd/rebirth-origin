# Smoke silhouettes: new astronauts, new dog, no pause, no beam, stars behind the phones

## Intent
Make the two astronauts look better: replace the painted figures with crisp astronaut silhouettes (cut from the
client's two astronaut photos) filled with the client's pink/purple/blue smoke image. Same treatment for the dog.

## Goals
- Left figure = photo 1 (both arms up). Right figure = photo 2 (one arm out), mirrored so the arm reaches left.
- Limbs are separate parts: idle float and `--reach` keep working; chest / hand points re-measured in `rig.json`.
- Act 1 has no pause: figures keep converging and floating until the hands touch at 3.00 s, the same instant the
  left chest fills the screen (`convergeSlow`, `idleFreeze` hold and the `expo.out` hand beat go).
- Dog = smoke-filled silhouette cut from the client's dog image (helmet, pack, tail; hose and station dropped),
  in the stage scene and in the first phone's frozen frame. Legs and tail sway slightly.
- Thin beam removed. White flash, its hold and fade unchanged.
- The App Design (phone showcase) screen gets the star field instead of flat #050505.

## Non-goals
Hero copy, section 2, phone app animations, every other timing, the reduced-motion fallback layout.

## Anti-goals
Any suit detail, watermark or patch visible; a visible hold before the hands touch; a seam at limb joints.

## Approaches
1. **Baked parts (picked):** cut each figure into limb parts, bake the smoke into each part's pixels, keep the
   existing `Astronaut.astro` / `astronaut.ts` / `rig.json` contract. Proven in the current build; only assets,
   rig numbers and timing change.
2. Live mask: one static smoke layer masked by animated limb shapes. Seamless joints, but HTML elements cannot use
   an animated SVG `<mask>` reliably in Chrome/Safari; would need canvas. More code, more risk.
3. Single flat image per figure with whole-body bob only. Cheapest, but loses limb motion and the reach.

## Builder's calls
- Smoke is sampled per part from the figure's rest pose so the texture is continuous across joints at rest.
- Contact stays exact without a freeze by fading idle amplitude to zero over the last stretch of the approach.
- Dog keeps the screen-cover hand-over from the gradient via the existing 0.3 s cross-fade.
