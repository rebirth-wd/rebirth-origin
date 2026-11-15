// Idle "spacewalk" motion + reaching control for <Astronaut/>.
//
// Reach: tween the CSS custom property `--reach` (0 → 1) INLINE on the root, e.g.
//   gsap.to(root, { '--reach': 1 })        (gsap writes inline styles; we read root.style each tick)
// or call setReach(root, n) directly. Both are supported; setReach also writes the inline variable.
// At reach = 1 the reaching arm is in the source pose (fully extended, hand at --hand-x/--hand-y, idle damped
// on that arm so the hand is steady); at reach = 0 it is relaxed/bent towards the body.
import { gsap } from 'gsap';

type Who = 'left' | 'right';
interface Part { el: HTMLElement; set: (v: number) => void; a: { r: number; s: number }; reach?: number; reachDamp?: boolean }
interface State {
  root: HTMLElement; who: Who; parts: Part[]; rig: HTMLElement;
  rigSet: { x: (v: number) => void; y: (v: number) => void; r: (v: number) => void }; rigP: { x: number; y: number; r: number };
  tl: gsap.core.Timeline | null; running: boolean; visible: boolean; enabled: boolean; reach: number; lastReachStr: string; tick: () => void;
}
const states = new WeakMap<HTMLElement, State>();

// [amplitude deg, period s] for two summed sines per part (different, incommensurate periods so nothing syncs)
const IDLE: Record<Who, Record<string, [number, number, number, number]>> = {
  left: {
    torso: [1.2, 9.3, 0.6, 5.7],
    'arm-back': [5.5, 6.1, 2.0, 3.9],
    'arm-reach-upper': [4.0, 7.3, 1.5, 4.4],
    'arm-reach-lower': [5.0, 5.2, 1.8, 3.3],
    'leg-a-upper': [3.5, 8.1, 1.2, 4.9],
    'leg-a-lower': [5.0, 6.7, 1.6, 3.7],
    'leg-b-upper': [3.0, 7.7, 1.4, 5.3],
    'leg-b-lower': [6.0, 5.9, 1.5, 4.1],
  },
  right: {
    torso: [1.4, 10.1, 0.5, 6.3],
    'arm-reach-upper': [4.0, 6.9, 1.4, 4.7],
    'arm-reach-lower': [5.0, 5.5, 1.7, 3.5],
    'arm-other': [6.5, 6.3, 2.0, 4.2],
    'legs-upper': [3.0, 8.7, 1.0, 5.1],
    'shin-a': [5.5, 7.1, 1.6, 3.8],
    'shin-b': [6.5, 6.0, 1.8, 4.5],
  },
};
// rotation (deg) added at reach = 0 (relaxed arm); at reach = 1 it is 0 (source pose)
const RELAX: Record<Who, Record<string, number>> = {
  left: { 'arm-reach-upper': 16, 'arm-reach-lower': 30 },
  right: { 'arm-reach-upper': -14, 'arm-reach-lower': -26 },
};
// whole-figure bob/roll: [x %, y %, rotation deg] amplitudes and periods
const FLOAT: Record<Who, [number, number, number, number, number, number]> = {
  left: [0.9, 11.3, 1.4, 8.2, 1.6, 13.7],
  right: [1.0, 9.7, 1.3, 7.4, 1.8, 12.1],
};

const reduced = () => typeof matchMedia !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches;

function readReach(s: State) {
  const v = s.root.style.getPropertyValue('--reach');
  if (v !== s.lastReachStr) {
    s.lastReachStr = v;
    const n = parseFloat(v);
    s.reach = Number.isFinite(n) ? Math.min(1, Math.max(0, n)) : 0;
  }
}

function apply(s: State) {
  readReach(s);
  const r = s.reach;
  const ease = r * r * (3 - 2 * r); // smooth arrival of the hand
  for (const p of s.parts) {
    const damp = p.reachDamp ? 1 - 0.9 * ease : 1;
    p.set((p.a.r + p.a.s) * damp + (p.reach ?? 0) * (1 - ease));
  }
  s.rigSet.x(s.rigP.x); s.rigSet.y(s.rigP.y); s.rigSet.r(s.rigP.r);
}

function build(s: State) {
  const tl = gsap.timeline({ paused: true });
  const conf = IDLE[s.who];
  const sine = (target: object, key: string, amp: number, period: number) => {
    // start at a random point in the cycle: from -amp to +amp, yoyo, sine.inOut
    const t = gsap.fromTo(target, { [key]: -amp }, { [key]: amp, duration: period / 2, ease: 'sine.inOut', repeat: -1, yoyo: true });
    t.progress(Math.random());
    tl.add(t, 0);
  };
  for (const p of s.parts) {
    const c = conf[(p.el.dataset.part as string)] ?? [2, 7, 1, 4];
    const jitter = 0.9 + Math.random() * 0.2;
    sine(p.a, 'r', c[0], c[1] * jitter);
    sine(p.a, 's', c[2], c[3] * jitter);
  }
  const f = FLOAT[s.who];
  sine(s.rigP, 'x', f[0], f[1]);
  sine(s.rigP, 'y', f[2], f[3]);
  sine(s.rigP, 'r', f[4], f[5]);
  s.tl = tl;
}

function update(s: State) {
  const want = s.visible && s.enabled && !reduced();
  if (want === s.running) return;
  s.running = want;
  if (want) {
    if (!s.tl) build(s);
    s.tl!.play();
    gsap.ticker.add(s.tick);
  } else {
    s.tl?.pause();
    gsap.ticker.remove(s.tick);
    apply(s);
  }
}

export function initAstronaut(root: HTMLElement) {
  if (states.has(root)) return states.get(root)!;
  const who = (root.dataset.astronaut as Who) || 'left';
  const rig = root.querySelector<HTMLElement>('[data-rig]')!;
  const parts: Part[] = [...root.querySelectorAll<HTMLElement>('[data-part]')].map((el) => {
    const name = el.dataset.part!;
    return {
      el, set: gsap.quickSetter(el, 'rotation', 'deg') as (v: number) => void, a: { r: 0, s: 0 },
      reach: RELAX[who][name], reachDamp: name.startsWith('arm-reach'),
    };
  });
  const s: State = {
    root, who, parts, rig,
    rigSet: {
      x: gsap.quickSetter(rig, 'xPercent') as any, y: gsap.quickSetter(rig, 'yPercent') as any, r: gsap.quickSetter(rig, 'rotation', 'deg') as any,
    },
    rigP: { x: 0, y: 0, r: 0 }, tl: null, running: false, visible: false, enabled: true, reach: 0, lastReachStr: '\u0000', tick: () => apply(s),
  };
  states.set(root, s);
  (root as any).rbAstronaut = s; // debug/inspection handle (used by the preview shots)
  apply(s);
  // apply --reach changes even while the idle loop is paused (reduced motion / off-screen)
  new MutationObserver(() => { if (!s.running) apply(s); }).observe(root, { attributes: true, attributeFilter: ['style'] });
  new IntersectionObserver((es) => { s.visible = es[es.length - 1].isIntersecting; update(s); }, { rootMargin: '10%' }).observe(root);
  matchMedia('(prefers-reduced-motion: reduce)').addEventListener?.('change', () => update(s));
  return s;
}

/** Set the reach (0..1). Equivalent to tweening the inline `--reach` variable. */
export function setReach(root: HTMLElement, n: number) {
  root.style.setProperty('--reach', String(n));
  const s = states.get(root);
  if (s && !s.running) apply(s);
}

/** Live viewport position of the reaching hand tip (includes idle motion, reach and any transform B applies). */
export function handPoint(root: HTMLElement) {
  const r = root.querySelector('[data-hand-marker]')!.getBoundingClientRect();
  return { x: r.left, y: r.top };
}
/** Live viewport position of the chest point (the zoom target). */
export function chestPoint(root: HTMLElement) {
  const r = root.querySelector('[data-chest-marker]')!.getBoundingClientRect();
  return { x: r.left, y: r.top };
}
/** Pause / resume idle motion manually (e.g. during the full-screen smoke phase). */
export function setIdle(root: HTMLElement, on: boolean) {
  const s = states.get(root); if (!s) return;
  s.enabled = on; update(s);
}

export function initAll(scope: ParentNode = document) {
  scope.querySelectorAll<HTMLElement>('[data-astronaut]').forEach((el) => initAstronaut(el));
}
