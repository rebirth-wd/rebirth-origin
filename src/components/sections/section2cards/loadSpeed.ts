// LoadSpeed loop — "<2s load speed" card. Cycle 5.2 s:
//   0.00  empty: only the track, the 2s tick and its labels
//   0.10  window frame rises in, the load bar starts filling
//   0.34  three dots pop · 0.52 hero · 0.74 / 0.88 text lines · 1.04 button (the page assembles while the bar runs)
//   1.30  bar stops, clearly short of the 2s tick · 1.34 green check pops (+ one ring ping)
//   1.80  finished state (= static markup), held to 4.55
//   4.55  page, fill and check fade out (0.4 s) → 5.2 repeat
// Transform + opacity only; every tween is a fromTo, so any seek time renders the same picture.
import gsap from 'gsap';

export function build(root: HTMLElement): gsap.core.Timeline {
  const tl = gsap.timeline({ repeat: -1 });
  const q = <T extends SVGElement>(sel: string) => root.querySelector<T>(sel);
  const qa = <T extends SVGElement>(sel: string) => Array.from(root.querySelectorAll<T>(sel));

  const page = q('[data-ls-page]'), load = q('[data-ls-load]');
  const frame = q('[data-ls-frame]'), glow = q('[data-ls-glow]');
  const dots = qa('[data-ls-dot]'), blocks = qa('[data-ls-block]'), btn = q('[data-ls-btn]');
  const fill = q('[data-ls-fill]'), check = q('[data-ls-check]'), ring = q('[data-ls-ring]');
  if (!page || !load || !frame || !glow || !btn || !fill || !check || !ring) return tl.to({}, { duration: 5.2 });

  const fillW = Number(fill.dataset.lsW) || 92;
  const cx = Number(check.dataset.lsCx), cy = Number(check.dataset.lsCy);
  const END = 5.2, OUT = 4.55;

  // wrappers carry only the exit fade
  tl.set([page, load], { opacity: 1 }, 0);

  // window
  tl.fromTo(frame, { opacity: 0, y: 7 }, { opacity: 1, y: 0, duration: 0.34, ease: 'power3.out' }, 0.1);
  tl.fromTo(glow, { opacity: 0 }, { opacity: 1, duration: 0.9, ease: 'power1.out' }, 0.3);
  dots.forEach((d, i) => {
    tl.fromTo(d, { opacity: 0, scale: 0, transformOrigin: '50% 50%' },
      { opacity: 1, scale: 1, duration: 0.26, ease: 'back.out(2.4)' }, 0.34 + i * 0.06);
  });
  // skeleton blocks, in quick succession
  const at = [0.52, 0.74, 0.88];
  blocks.forEach((b, i) => {
    tl.fromTo(b, { opacity: 0, y: 6, scaleX: i === 0 ? 0.94 : 0.5, transformOrigin: i === 0 ? '50% 50%' : '0% 50%' },
      { opacity: 1, y: 0, scaleX: 1, duration: i === 0 ? 0.36 : 0.3, ease: 'power3.out' }, at[i] ?? 0.9);
  });
  tl.fromTo(btn, { opacity: 0, scale: 0.5, transformOrigin: '50% 50%' },
    { opacity: 1, scale: 1, duration: 0.34, ease: 'back.out(2.2)' }, 1.04);

  // load bar: runs from the frame's arrival and stops short of the tick
  tl.fromTo(fill, { x: -fillW - 2 }, { x: 0, duration: 1.2, ease: 'power2.inOut' }, 0.1);
  tl.fromTo(check, { opacity: 0, scale: 0.2, svgOrigin: `${cx} ${cy}` },
    { opacity: 1, scale: 1, duration: 0.4, ease: 'back.out(2.6)' }, 1.34);
  tl.fromTo(ring, { opacity: 0.7, scale: 1, svgOrigin: `${cx} ${cy}` },
    { opacity: 0, scale: 2.1, duration: 0.6, ease: 'power2.out', immediateRender: false }, 1.44);
  tl.set(ring, { opacity: 0 }, 0);

  // exit
  tl.fromTo([page, load], { opacity: 1 }, { opacity: 0, duration: 0.4, ease: 'power2.in', immediateRender: false }, OUT);
  tl.to({}, { duration: 0.001 }, END - 0.001);
  return tl;
}
