// Space Journey timing: THE one place to timestamp the two transitions.
//
// The page rests only at three stops: hero → section2 → appdesign. The first scroll intent at a stop (wheel,
// trackpad, swipe, keys) starts a transition, which then plays by TIME to the end on its own:
//   A = hero → section2      (act 1: figures converge and reach, camera into the left chest, smoke, gradient, section 2)
//   B = section2 → appdesign (act 2: section 2 out, the gradient becomes a dog-shaped window that recedes left →
//                              centre, a sudden camera flash, phone showcase)
// Going back plays the same timeline in reverse (at `global.reverseSpeed`).
//
// Every beat is { start, dur, ease, what }:
//   start  seconds from the start of ITS transition (A or B each start at 0)
//   dur    seconds (0 = an instant: a switch, a hand-off or a marker)
//   ease   a GSAP ease name (https://gsap.com/docs/v3/Eases): 'none', 'sine.inOut', 'power2.in', 'expo.out', ...
//          or one of ours from EASES below, e.g. 'glide(6)'
//   what   plain English, shown in docs/journey/TIMING.md
// A transition ends ("arrives") at its `arrival` beat's start (if a beat runs past it the transition is extended to
// that beat's end and a warning is logged in the browser console).
//
// How to change a timing: edit a number below, save; the dev server reloads the page. Review with `?journey=debug`
// (overlay: P pause, [ ] step ±0.1 s while paused, R replay, 1/2/3 jump to a stop). Regenerate the table with
// `node docs/journey/tools/timing-doc.mjs` (writes docs/journey/TIMING.md).
//
// Starting values: the previous scroll-scrubbed timeline converted to seconds (act 1 at 1.25 s per viewport-height
// of scroll, section 2's entrance a little tighter; act 2 at 1.385 s per viewport-height), so A ≈ 4.0 s and B ≈ 3.6 s
// to the flash peak. Since then the swelling glow before the flash was replaced by a camera flash right after the dog
// settles, so B reaches the flash peak at ≈ 2.85 s. Several beats share a start on purpose (they overlapped in the
// scrubbed version too).

/** `glide(k)`: starts from rest, covers most of the way early, then keeps gliding in at a slowly falling speed that
 *  never reaches zero before the end (a critically damped approach, normalised to end exactly at 1). Larger k = more
 *  of the way covered early and a slower final glide. Used by A.approach: the figures never stop before the hands
 *  touch. */
const glide = (k: number) => {
  const f = (x: number) => 1 - (1 + k * x) * Math.exp(-k * x);
  const n = f(1);
  return (p: number) => (p <= 0 ? 0 : p >= 1 ? 1 : f(p) / n);
};
/** `carry`: for a beat that takes over from another one mid-motion. It starts at the speed the previous beat ended
 *  with (CARRY.k = that speed as a fraction of this beat's average speed; journey.ts works it out from the measured
 *  zoom levels) and accelerates from there, so the hand-over has no stop. Used by A.cameraRush after A.cameraTwoShot. */
export const CARRY = { k: 0.4 };
const carry = (p: number) => (p <= 0 ? 0 : p >= 1 ? 1 : CARRY.k * p + (1 - CARRY.k) * p ** 4);
/** Custom eases, registered with GSAP by journey.ts. `name` alone = the default k; `name(k)` = configured. */
export const EASES: Record<string, ((p: number) => number) & { config?: (k: number) => (p: number) => number }> = {
  glide: Object.assign(glide(6), { config: (k: number) => glide(+k || 6) }),
  carry,
};

export type Beat = {
  /** seconds from the start of its transition */
  start: number;
  /** seconds; 0 = an instant */
  dur: number;
  /** GSAP ease name */
  ease: string;
  /** one line, plain English */
  what: string;
};

export type TransitionA = {
  heroOut: Beat; leftFigureToFront: Beat;
  approach: Beat;
  turn: Beat; reach: Beat;
  cameraTwoShot: Beat; cameraFocus: Beat; cameraRush: Beat; cameraCentre: Beat;
  idleCorrection: Beat;
  spaceZoom: Beat; smokeIn: Beat; gradientIn: Beat;
  s2Heading: Beat; s2Sub: Beat; s2Badge1: Beat; s2Badge2: Beat; s2Badge3: Beat; s2Badge4: Beat;
  arrival: Beat;
};

export type TransitionB = {
  s2Badge4Out: Beat; s2Badge3Out: Beat; s2Badge2Out: Beat; s2Badge1Out: Beat; s2SubOut: Beat; s2HeadingOut: Beat;
  gradToDog: Beat; dogRecede: Beat; dogDrift: Beat; dogDetail: Beat; settle: Beat;
  flashIn: Beat; flashPeak: Beat;
  whiteHold: Beat; whiteFade: Beat;
  arrival: Beat;
};

export type JourneyTiming = {
  global: {
    /** reverse transitions play this many times faster than forwards (1 = same speed, 2 = twice as fast) */
    reverseSpeed: number;
    /** seconds after arriving at a stop before a NEW gesture may start the next transition */
    arrivalCooldown: number;
    /** seconds of input silence that separate two gestures (a trackpad fling's inertia is one gesture) */
    inputQuietGap: number;
    /** pixels of wheel / finger travel before an intent counts (GSAP Observer tolerance) */
    tolerance: number;
    /** seconds the screen stays fully white after the flash peak (= B.whiteHold.dur) */
    flashHold: number;
    /** seconds the white takes to fade off the phone showcase (= B.whiteFade.dur) */
    flashFade: number;
  };
  A: TransitionA;
  B: TransitionB;
  /** phones (≤ 767px): only the beats listed here differ from desktop; any field of a beat may be given. */
  mobile: { A: Partial<{ [K in keyof TransitionA]: Partial<Beat> }>; B: Partial<{ [K in keyof TransitionB]: Partial<Beat> }> };
};

// The two flash knobs live here so `global` and the B beats can never disagree.
const FLASH_HOLD = 0.06;
const FLASH_FADE = 0.35;

export const TIMING: JourneyTiming = {
  global: {
    reverseSpeed: 1.5,
    arrivalCooldown: 0.4,
    inputQuietGap: 0.2,
    tolerance: 10,
    flashHold: FLASH_HOLD,
    flashFade: FLASH_FADE,
  },

  // ---------------------------------------------------------------- A: hero → section2 (≈ 4.0 s)
  A: {
    heroOut:           { start: 0.00, dur: 0.72, ease: 'power2.in',    what: 'Hero copy, button and phone fade out and lift 46px' },
    leftFigureToFront: { start: 0.75, dur: 0,    ease: 'none',         what: 'Copy gone: the left figure (the zoom target) is lifted in front of the hero layer' },
    approach:          { start: 0.00, dur: 3.00, ease: 'glide(6)',     what: 'The figures float towards each other without stopping; the END is the moment the hands touch (= the end of cameraRush)' },
    turn:              { start: 0.12, dur: 1.98, ease: 'sine.inOut',   what: 'Both figures rotate from head-first to the face-to-face clasp pose' },
    reach:             { start: 0.36, dur: 1.62, ease: 'power2.inOut', what: 'The reaching arms extend (--reach 0 → 1)' },
    cameraTwoShot:     { start: 0.00, dur: 2.16, ease: 'power2.in',    what: 'Camera push towards both figures, ending on the held two-shot (×3.2 desktop, ×2.1 phone)' },
    cameraFocus:       { start: 0.18, dur: 2.40, ease: 'power2.inOut', what: 'Camera pans so the left chest moves to the two-shot framing point' },
    cameraRush:        { start: 2.16, dur: 0.84, ease: 'carry',        what: 'Final rush into the left chest, continuing at the speed the push ended with (no camera pause); the END is the moment the screen is fully smoke' },
    cameraCentre:      { start: 2.16, dur: 0.84, ease: 'power2.in',    what: 'During the rush the chest moves from the framing point to the exact screen centre' },
    idleCorrection:    { start: 2.16, dur: 0.84, ease: 'sine.inOut',   what: 'The idle keeps floating; its live offset of the hands and the chest window is folded in so they meet exactly' },
    spaceZoom:         { start: 0.00, dur: 3.00, ease: 'power2.in',    what: 'The star field and moon scale 1 → 1.35 about the chest (parallax)' },
    smokeIn:           { start: 2.64, dur: 0.30, ease: 'power1.inOut', what: 'The soft smoke texture cross-fades in over the chest' },
    gradientIn:        { start: 3.00, dur: 0.30, ease: 'power1.inOut', what: 'Full-screen smoke fades into the moving pink/purple/blue gradient' },
    s2Heading:         { start: 3.05, dur: 0.40, ease: 'power2.out',   what: 'Section 2 heading fades up' },
    s2Sub:             { start: 3.16, dur: 0.40, ease: 'power2.out',   what: 'Section 2 sub line fades up' },
    s2Badge1:          { start: 3.27, dur: 0.40, ease: 'power2.out',   what: 'Card 1 (2-3 build days) fades up; the four card loops start' },
    s2Badge2:          { start: 3.38, dur: 0.40, ease: 'power2.out',   what: 'Card 2 (<2s load speed) fades up' },
    s2Badge3:          { start: 3.49, dur: 0.40, ease: 'power2.out',   what: 'Card 3 (100% client satisfaction) fades up' },
    s2Badge4:          { start: 3.60, dur: 0.40, ease: 'power2.out',   what: 'Card 4 (39k+ Astro users) fades up' },
    arrival:           { start: 4.00, dur: 0,    ease: 'none',         what: 'Section 2 is displayed; the page rests here' },
  },

  // ---------------------------------------------------------------- B: section2 → appdesign (≈ 2.85 s to the flash peak)
  B: {
    s2Badge4Out:  { start: 0.00, dur: 0.33, ease: 'power2.in',    what: 'Card 4 fades out and lifts 20px (last in, first out)' },
    s2Badge3Out:  { start: 0.05, dur: 0.33, ease: 'power2.in',    what: 'Card 3 out' },
    s2Badge2Out:  { start: 0.10, dur: 0.33, ease: 'power2.in',    what: 'Card 2 out' },
    s2Badge1Out:  { start: 0.15, dur: 0.33, ease: 'power2.in',    what: 'Card 1 out' },
    s2SubOut:     { start: 0.20, dur: 0.33, ease: 'power2.in',    what: 'Sub line out' },
    s2HeadingOut: { start: 0.25, dur: 0.33, ease: 'power2.in',    what: 'Heading out' },
    gradToDog:    { start: 0.14, dur: 0,    ease: 'none',         what: 'The gradient becomes the view through the screen-covering dog: a dog-shaped window onto the same live gradient (instant and invisible, the dog covers the screen)' },
    dogRecede:    { start: 0.44, dur: 2.12, ease: 'power2.inOut', what: 'The window shrinks: the dog recedes from the camera (scale: covering the screen → the size in the phone)' },
    dogDrift:     { start: 0.44, dur: 2.12, ease: 'power2.inOut', what: 'The dog drifts on a curve: out to the left, then to the centre (the phone screen)' },
    dogDetail:    { start: 0.97, dur: 0.85, ease: 'power1.inOut', what: 'The helmet glass and the volume shading fade in as the dog gets small (--dog-detail 0 → 1)' },
    settle:       { start: 2.56, dur: 0,    ease: 'none',         what: 'The dog has arrived on the phone screen rect (marker); its legs and tail keep floating' },
    flashIn:      { start: 2.81, dur: 0.04, ease: 'none',         what: 'Camera flash: after a 0.25 s still beat the whole screen snaps to white (about 2 frames, no build-up)' },
    flashPeak:    { start: 2.85, dur: 0,    ease: 'none',         what: 'Flash peak: the phone showcase starts (showcase.play()); dog and space are hidden. Going back: showcase.reset()' },
    whiteHold:    { start: 2.85, dur: FLASH_HOLD, ease: 'none',   what: 'The screen stays white (global.flashHold)' },
    whiteFade:    { start: 2.85 + FLASH_HOLD, dur: FLASH_FADE, ease: 'expo.out', what: 'The white decays fast off the phone + App Design title, like a flashbulb (global.flashFade)' },
    arrival:      { start: 2.85 + FLASH_HOLD + FLASH_FADE, dur: 0, ease: 'none', what: 'App Design is displayed; native scrolling is released (the showcase keeps playing its own sequence and loops)' },
  },

  // Phones play the same timings (the positions and zoom levels differ, see journey.ts DESKTOP / MOBILE).
  // Example override: mobile: { A: { cameraRush: { dur: 0.7 } }, B: {} }
  mobile: { A: {}, B: {} },
};

/** Beats of one transition with the mobile overrides applied. */
export function resolveTiming(mobile: boolean): { A: TransitionA; B: TransitionB } {
  const merge = <T extends Record<string, Beat>>(base: T, over: Partial<Record<keyof T, Partial<Beat>>>): T => {
    const out = {} as T;
    for (const k of Object.keys(base) as (keyof T)[]) out[k] = { ...base[k], ...(mobile ? over[k] ?? {} : {}) } as T[keyof T];
    return out;
  };
  return { A: merge(TIMING.A, TIMING.mobile.A), B: merge(TIMING.B, TIMING.mobile.B) };
}

/** Length of a transition in seconds: its arrival, or the last beat end if a beat runs past it. */
export function transitionLength(beats: Record<string, Beat>): number {
  let end = beats.arrival?.start ?? 0;
  for (const b of Object.values(beats)) end = Math.max(end, b.start + b.dur);
  return end;
}
