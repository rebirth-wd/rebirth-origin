// AstroUsers loop — growth line draws left→right with a glowing end dot riding it, while the chip's counter rolls
// up to "39k+". Frame 0 = empty (grid only); finished state = the static markup; then a short fade and repeat.
// Animates only transform, opacity and stroke-dashoffset; every tween has explicit start values (seek-safe).
import gsap from 'gsap';

const STEP = 24;            // digit strip row height, matches AstroUsers.astro
const END = '240 30';       // line end point (ring pulse origin)
const CHIP = '67 35';       // chip centre

export function build(root: HTMLElement): gsap.core.Timeline {
  const qa = (s: string) => Array.from(root.querySelectorAll<SVGElement>(s));
  const fx = qa('[data-au-fx]'), area = qa('[data-au-area]'), lines = qa('[data-au-line]');
  const dots = qa('[data-au-dot]'), dotWrap = qa('[data-au-dotwrap]'), ring = qa('[data-au-ring]');
  const chip = qa('[data-au-chip]'), digits = qa('[data-au-digit]');
  const tl = gsap.timeline({ repeat: -1 });
  if (!fx.length || digits.length < 2) return tl.to({}, { duration: 5.4 });

  const DRAW_AT = 0.3, DRAW = 2.0, LAND = DRAW_AT + DRAW;

  // chip + dot arrive
  tl.fromTo(chip, { opacity: 0, scale: 0.86, svgOrigin: CHIP }, { opacity: 1, scale: 1, svgOrigin: CHIP, duration: 0.45, ease: 'back.out(1.8)' }, 0.05);
  tl.fromTo(dotWrap, { opacity: 0 }, { opacity: 1, duration: 0.3, ease: 'power2.out' }, 0.1);

  // line draw, dot rides the tip, area blooms behind it
  tl.fromTo(lines, { strokeDashoffset: 1012 }, { strokeDashoffset: 0, duration: DRAW, ease: 'power2.inOut' }, DRAW_AT);
  tl.fromTo(dots, { strokeDashoffset: 0 }, { strokeDashoffset: -999, duration: DRAW, ease: 'power2.inOut' }, DRAW_AT);
  tl.fromTo(area, { opacity: 0 }, { opacity: 1, duration: 0.7, ease: 'power2.out' }, DRAW_AT + 1.8);

  // counter roll: tens 0→3, units spin twice round and settle on 9
  tl.fromTo(digits[0], { y: 0 }, { y: -3 * STEP, duration: 1.75, ease: 'power2.inOut' }, DRAW_AT + 0.1);
  tl.fromTo(digits[1], { y: 0 }, { y: -19 * STEP, duration: 2.05, ease: 'power3.out' }, DRAW_AT + 0.05);

  // landing: ring pulse off the end dot, chip gives a tiny nod
  tl.fromTo(ring, { opacity: 0 }, { opacity: 0.8, duration: 0.1, ease: 'none' }, LAND - 0.05);
  tl.fromTo(ring, { scale: 0.5, svgOrigin: END }, { scale: 2.5, svgOrigin: END, duration: 0.7, ease: 'power2.out' }, LAND - 0.05);
  tl.fromTo(ring, { opacity: 0.8 }, { opacity: 0, duration: 0.55, ease: 'power1.out', immediateRender: false }, LAND + 0.1);

  // hold the finished state, then fade out and repeat
  tl.fromTo(fx, { opacity: 1 }, { opacity: 0, duration: 0.4, ease: 'power2.in', immediateRender: false }, 4.95);
  tl.to({}, { duration: 0.05 }, 5.35);
  return tl;
}
