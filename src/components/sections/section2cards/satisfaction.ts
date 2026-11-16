import gsap from 'gsap';

// Satisfaction card loop: empty track → ring draws clockwise (chips light as it passes) → check + one pulse →
// hold the finished state → short fade back to the empty track. 5.4 s cycle. Only transform / opacity /
// stroke-dashoffset; every tween is a fromTo that does not render until the playhead reaches it, and every
// animated property is also set at time 0, so any seek time renders the same frame.
const CX = 132, CY = 77, R = 42;
const ORIGIN = `${CX} ${CY}`;
const DRAW_AT = 0.25, DRAW = 2.0;   // ring draw
const DONE = DRAW_AT + DRAW;        // 2.25: ring closes
const EXIT_AT = 4.9, EXIT = 0.4;    // fade back to empty
const CYCLE = 5.4;
const CHIP_YS = [51, 77, 103];      // chip centre lines (same as the markup)

/** time at which a power2.inOut tween reaches progress p */
const inOutTime = (p: number) => (p < 0.5 ? Math.sqrt(p / 2) : 1 - Math.sqrt((1 - p) / 2));

export function build(root: HTMLElement): gsap.core.Timeline {
  const q = <T extends Element>(s: string) => Array.from(root.querySelectorAll<T>(s));
  const arcs = q<SVGPathElement>('[data-sat-arc]');
  const ring = q<SVGGElement>('[data-sat-ring]');
  const head = q<SVGGElement>('[data-sat-head]');
  const core = q<SVGCircleElement>('[data-sat-core]');
  const chips = q<SVGGElement>('[data-sat-chip]');
  const dots = q<SVGGElement>('[data-sat-dot]');
  const pulse = q<SVGCircleElement>('[data-sat-pulse]');
  const sparks = q<SVGPathElement>('[data-sat-spark]');
  const check = q<SVGGElement>('[data-sat-check]');
  const tick = q<SVGPathElement>('[data-sat-tick]');

  const tl = gsap.timeline({ repeat: -1 });
  const ft = (target: gsap.TweenTarget, from: gsap.TweenVars, to: gsap.TweenVars, at: number) =>
    tl.fromTo(target, from, { ...to, immediateRender: false }, at);

  // ── frame 0: the empty state (track + unlit chips only) ──
  // dashoffset slightly past 1 so the round cap of the hidden dash cannot peek out at 12 o'clock
  tl.set(arcs, { strokeDashoffset: 1.03 }, 0)
    .set(ring, { opacity: 1 }, 0)
    .set(head, { opacity: 0, rotation: 0, svgOrigin: ORIGIN }, 0)
    .set(core, { opacity: 0 }, 0)
    .set(chips, { opacity: 0 }, 0)
    .set(pulse, { opacity: 0, scale: 1, svgOrigin: ORIGIN }, 0)
    .set(sparks, { opacity: 0, x: 0, y: 0 }, 0)
    .set(check, { opacity: 1, scale: 0.6, svgOrigin: ORIGIN }, 0)
    .set(tick, { strokeDashoffset: 1.06 }, 0);
  dots.forEach((d) => tl.set(d, { scale: 0.4, svgOrigin: `${d.dataset.ox} ${d.dataset.oy}` }, 0));

  // ── ring draws clockwise from 12 o'clock, a bright point leading it ──
  ft(arcs, { strokeDashoffset: 1.03 }, { strokeDashoffset: 0, duration: DRAW, ease: 'power2.inOut' }, DRAW_AT);
  ft(head, { rotation: 0 }, { rotation: 360, duration: DRAW, ease: 'power2.inOut' }, DRAW_AT);
  ft(head, { opacity: 0 }, { opacity: 1, duration: 0.2, ease: 'power1.out' }, DRAW_AT);
  ft(head, { opacity: 1 }, { opacity: 0, duration: 0.22, ease: 'power1.in' }, DONE - 0.16);

  // ── chips light in turn as the ring passes their height (right side going down, then left side going up) ──
  const pass = CHIP_YS.map((y) => Math.acos((CY - y) / R) / (2 * Math.PI)); // ring progress at that height, right side
  const order = [...pass, ...pass.map((p) => 1 - p).reverse()];             // matches the chip order in the markup
  chips.forEach((chip, i) => {
    const at = DRAW_AT + inOutTime(order[i] ?? 1) * DRAW;
    ft(chip, { opacity: 0 }, { opacity: 1, duration: 0.28, ease: 'power2.out' }, at);
    if (dots[i]) ft(dots[i], { scale: 0.4 }, { scale: 1, duration: 0.42, ease: 'back.out(2.6)' }, at);
  });

  // ── completion: check draws + pops, core glow, one pulse, a few sparks ──
  ft(tick, { strokeDashoffset: 1.06 }, { strokeDashoffset: 0, duration: 0.34, ease: 'power2.out' }, DONE + 0.02);
  ft(check, { scale: 0.6 }, { scale: 1, duration: 0.5, ease: 'back.out(2.4)' }, DONE + 0.02);
  ft(core, { opacity: 0 }, { opacity: 1, duration: 0.45, ease: 'power2.out' }, DONE);
  ft(pulse, { opacity: 0.7, scale: 1 }, { opacity: 0, scale: 1.24, duration: 0.75, ease: 'power2.out' }, DONE + 0.04);
  sparks.forEach((s) => {
    const ux = Number(s.dataset.ux), uy = Number(s.dataset.uy);
    ft(s, { x: -3 * ux, y: -3 * uy }, { x: 5 * ux, y: 5 * uy, duration: 0.6, ease: 'power3.out' }, DONE + 0.08);
    ft(s, { opacity: 0 }, { opacity: 0.95, duration: 0.12, ease: 'none' }, DONE + 0.08);
    ft(s, { opacity: 0.95 }, { opacity: 0, duration: 0.36, ease: 'power1.in' }, DONE + 0.32);
  });

  // ── hold the finished state (≈ 3.0 → 4.9), then a short fade back to the empty track ──
  ft([...ring, ...check, ...core, ...chips], { opacity: 1 }, { opacity: 0, duration: EXIT, ease: 'power2.inOut' }, EXIT_AT);
  tl.to({}, { duration: 0.001 }, CYCLE - 0.001); // pad the cycle to CYCLE seconds
  return tl;
}
