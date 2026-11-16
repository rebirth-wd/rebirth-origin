// Section-2 stat cards controller. The markup is the finished static state; with motion allowed each card's graphic
// runs a seamless loop (one module per graphic: build(root) → a repeating gsap timeline that starts from its "empty"
// state). All four loops are children of ONE paused master timeline, like the phone showcase, so the journey can
// start / pause / seek them with a single switch:
//   const cards = initSection2Cards(root); cards.play(); cards.pause(); cards.seek?.(t)
// - play(restart): runs the loops (restart = from each loop's first frame); pause(): freezes them where they are.
// - Hidden tab ⇒ paused. Reduced motion ⇒ no-op API, the static markup stays.
import gsap from 'gsap';
import { build as buildDays } from './buildDays';
import { build as loadSpeed } from './loadSpeed';
import { build as satisfaction } from './satisfaction';
import { build as astroUsers } from './astroUsers';

export interface Section2Cards {
  play(restart?: boolean): void;
  pause(): void;
  /** preview/debug: pause and render every loop at time t (seconds after play()). */
  seek?(t: number): void;
}

const BUILDERS: Record<string, (root: HTMLElement) => gsap.core.Timeline> = {
  builddays: buildDays, loadspeed: loadSpeed, satisfaction, astrousers: astroUsers,
};
/** All four loops start together from their empty first frame (a later start would leave that card showing its
 *  finished static state until its loop began); their cycle lengths differ, so they drift out of step by themselves. */
export const STAGGER = 0;

/** The loops' first frame: just past 0 so every loop's time-0 `set`s (its empty state) are rendered. */
const T0 = 0.001;

const instances = new WeakMap<HTMLElement, Section2Cards>();

export function initSection2Cards(root: HTMLElement): Section2Cards {
  const existing = instances.get(root);
  if (existing) return existing;
  if (matchMedia('(prefers-reduced-motion: reduce)').matches) {
    const api: Section2Cards = { play() {}, pause() {} };
    instances.set(root, api);
    return api;
  }

  let master: gsap.core.Timeline | null = null;
  let playing = false, frozen = false;
  const make = () => {
    const tl = gsap.timeline({ paused: true });
    Array.from(root.querySelectorAll<HTMLElement>('[data-s2c-graphic]')).forEach((el, i) => {
      const b = BUILDERS[el.dataset.s2cGraphic || ''];
      if (b) tl.add(b(el), i * STAGGER);
    });
    tl.time(T0);
    return tl;
  };
  const sync = () => {
    const go = playing && !frozen && !document.hidden;
    if (master && master.paused() === go) master.paused(!go);
  };
  document.addEventListener('visibilitychange', sync);

  const api: Section2Cards = {
    play(restart = false) {
      master ??= make();
      frozen = false;
      if (restart) master.time(T0);
      playing = true;
      sync();
    },
    pause() { playing = false; sync(); },
    seek(t: number) {
      master ??= make();
      playing = true; frozen = true;
      master.pause(); master.time(Math.max(T0, t));
    },
  };
  instances.set(root, api);
  return api;
}
