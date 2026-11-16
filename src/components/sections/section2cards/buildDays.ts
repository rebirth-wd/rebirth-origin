// BuildDays loop — "2-3 build days": DAY 1 → DAY 2 → DAY 3 are ticked off in turn (a progress stroke travels along
// the track between them), then the track runs on into the LIVE pill, which pops in with a pulsing green dot.
// The static markup is the finished state. Cycle = 5.6 s:
//   0.00 empty (quiet chips + hairline track)   0.25 / 1.20 / 2.15 day n ticks   0.78 / 1.73 link draws
//   2.68 link to LIVE draws   3.12 LIVE pops   3.6–5.1 hold (dot pulses)   5.1–5.5 fade back to empty
// Every property's first tween is a fromTo that renders its start values on build (so frame 0 is the empty state);
// later tweens on the same property carry immediateRender:false. Only transform / opacity / stroke-dashoffset move.
import gsap from 'gsap';

const CYCLE = 5.6;
const IR = { immediateRender: false };

export function build(root: HTMLElement): gsap.core.Timeline {
  const tl = gsap.timeline({ repeat: -1 });
  const svg = root.querySelector<SVGSVGElement>('[data-s2c-art="builddays"]');
  if (!svg) return tl.to({}, { duration: CYCLE });
  const all = <T extends Element>(s: string) => Array.from(svg.querySelectorAll<T>(s));

  const chips = all<SVGGElement>('[data-bd-chip]');
  const links = all<SVGPathElement>('[data-bd-link]');
  const live = svg.querySelector('[data-bd-live]');
  const ring = svg.querySelector('[data-bd-ring]');
  const dot = svg.querySelector('[data-bd-dot]');
  const OUT = 5.1, FADE = 0.4;

  chips.forEach((chip, i) => {
    const at = 0.25 + i * 0.95;
    const done = chip.querySelector('[data-bd-done]');
    const node = chip.querySelector('[data-bd-node]');
    const check = chip.querySelector('[data-bd-check]');
    const cx = Number(chip.dataset.ox);
    const chipO = { svgOrigin: `${cx} 52` }, nodeO = { svgOrigin: `${cx} 45` };
    // the chip gives a small press-pop while its "done" layer lights up
    tl.fromTo(chip, { scale: 1, ...chipO }, { scale: 1.07, duration: 0.14, ease: 'power2.out', ...chipO }, at)
      .fromTo(chip, { scale: 1.07, ...chipO }, { scale: 1, duration: 0.42, ease: 'back.out(3)', ...chipO, ...IR }, at + 0.14)
      .fromTo(done, { opacity: 0 }, { opacity: 1, duration: 0.22, ease: 'power2.out' }, at)
      .fromTo(node, { scale: 0.3, ...nodeO }, { scale: 1, duration: 0.42, ease: 'back.out(2.6)', ...nodeO }, at)
      .fromTo(check, { strokeDashoffset: 1 }, { strokeDashoffset: 0, duration: 0.28, ease: 'power2.out' }, at + 0.2)
      .fromTo(done, { opacity: 1 }, { opacity: 0, duration: FADE, ease: 'power2.inOut', ...IR }, OUT);
  });

  links.forEach((link, i) => {
    const last = i === links.length - 1;
    tl.fromTo(link, { strokeDashoffset: 1, opacity: 1 }, { strokeDashoffset: 0, opacity: 1, duration: last ? 0.5 : 0.4, ease: last ? 'power2.inOut' : 'power2.out' }, 0.78 + i * 0.95)
      .fromTo(link, { opacity: 1 }, { opacity: 0, duration: FADE, ease: 'power2.inOut', ...IR }, OUT);
  });

  if (live && ring && dot) {
    const liveO = { svgOrigin: '132 115' }, dotO = { svgOrigin: '114 115' };
    tl.fromTo(live, { opacity: 0, scale: 0.7, ...liveO }, { opacity: 1, scale: 1, duration: 0.45, ease: 'back.out(2.4)', ...liveO }, 3.12)
      .fromTo(live, { opacity: 1 }, { opacity: 0, duration: FADE, ease: 'power2.inOut', ...IR }, OUT);
    // success-dot pulse: a ring swells out of the dot, twice during the hold
    [3.45, 4.25].forEach((at, k) => {
      tl.fromTo(ring, { scale: 1, opacity: 0.7, ...dotO }, { scale: 3, opacity: 0, duration: 0.75, ease: 'power2.out', ...dotO, ...(k ? IR : {}) }, at)
        .fromTo(dot, { scale: 1, ...dotO }, { scale: 1.25, duration: 0.14, ease: 'power2.out', ...dotO, ...(k ? IR : {}) }, at)
        .fromTo(dot, { scale: 1.25, ...dotO }, { scale: 1, duration: 0.3, ease: 'power2.out', ...dotO, ...IR }, at + 0.14);
    });
  }

  return tl.to({}, { duration: 0.001 }, CYCLE - 0.001);
}
