// Idle "spacewalk" motion + reaching control for <Astronaut/>.
//
// Reach: tween the CSS custom property `--reach` (0 → 1) INLINE on the root, e.g.
//   gsap.to(root, { '--reach': 1 })        (gsap writes inline styles; we read root.style each tick)
// or call setReach(root, n) directly. Both are supported; setReach also writes the inline variable.
// At reach = 1 the reaching arm is in the source pose (fully extended, hand at --hand-x/--hand-y, idle damped
// on that arm so the hand is steady); at reach = 0 it is relaxed/bent towards the body.
//
// Sync groups: roots with the same data-astronaut value AND the same data-astronaut-sync value form a group (a
// keyhole figure is drawn twice, a black and a white copy, and both must move identically). The first in DOM order is
// the leader and the only one with a State, tweens, ticker and observers. Its per-part and rig setters write to every
// root of the group, and `states` maps each follower to the leader's State, so setReach, setIdle, setIdleAmp and
// posePoint called with a follower act on the leader. Roots without data-astronaut-sync behave exactly as before.
import { gsap } from 'gsap';
import rig from './rig.json';

type Who = 'left' | 'right';
interface Part { el: HTMLElement; els: HTMLElement[]; set: (v: number) => void; a: { r: number; s: number }; reach?: number; reachDamp?: boolean }
interface State {
  root: HTMLElement; who: Who; parts: Part[]; rig: HTMLElement; roots: HTMLElement[];
  rigSet: { x: (v: number) => void; y: (v: number) => void; r: (v: number) => void }; rigP: { x: number; y: number; r: number };
  tl: gsap.core.Timeline | null; running: boolean; visible: boolean; enabled: boolean; reach: number; lastReachStr: string; tick: () => void;
  amp: number;
}
const states = new WeakMap<HTMLElement, State>();

// [amplitude deg, period s] for two summed sines per part (different, incommensurate periods so nothing syncs)
const IDLE: Record<Who, Record<string, [number, number, number, number]>> = {
  left: {
    torso: [1.2, 9.3, 0.6, 5.7],
    'arm-other': [5.5, 6.1, 2.0, 3.9],
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
    'leg-a-upper': [3.0, 8.7, 1.0, 5.1],
    'leg-a-lower': [5.5, 7.1, 1.6, 3.8],
    'leg-b-upper': [3.2, 7.9, 1.1, 4.8],
    'leg-b-lower': [6.5, 6.0, 1.8, 4.5],
  },
};
// rotation (deg) added at reach = 0 (relaxed arm); at reach = 1 it is 0 (clasp pose). The signs fold each reaching
// arm towards its own body: the shoulder swings the hand towards the torso and the elbow bends further (checked
// against rig.json: left hand 757 -> 634 box px from the torso, elbow 57 -> 87 deg; right 881 -> 839, 20 -> 46 deg).
const RELAX: Record<Who, Record<string, number>> = {
  left: { 'arm-reach-upper': -16, 'arm-reach-lower': -30 },
  right: { 'arm-reach-upper': 14, 'arm-reach-lower': 26 },
};
// whole-figure bob/roll: [x %, y %, rotation deg] amplitudes and periods
const FLOAT: Record<Who, [number, number, number, number, number, number]> = {
  left: [0.9, 11.3, 1.4, 8.2, 1.6, 13.7],
  right: [1.0, 9.7, 1.3, 7.4, 1.8, 12.1],
};

const reduced = () => typeof matchMedia !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches;

/** (Re)create the quick setters so they write to every root of the group; called when a follower joins. */
function bindSetters(s: State) {
  const rigs = s.roots.map((r) => r.querySelector<HTMLElement>('[data-rig]')!);
  s.rigSet = {
    x: gsap.quickSetter(rigs, 'xPercent') as any, y: gsap.quickSetter(rigs, 'yPercent') as any, r: gsap.quickSetter(rigs, 'rotation', 'deg') as any,
  };
  for (const p of s.parts) {
    p.els = s.roots.map((r) => r.querySelector<HTMLElement>(`[data-part="${p.el.dataset.part}"]`)).filter((e): e is HTMLElement => !!e);
    p.set = gsap.quickSetter(p.els, 'rotation', 'deg') as (v: number) => void;
  }
}

function readReach(s: State) {
  const v = s.root.style.getPropertyValue('--reach');
  if (v !== s.lastReachStr) {
    s.lastReachStr = v;
    const n = parseFloat(v);
    s.reach = Number.isFinite(n) ? Math.min(1, Math.max(0, n)) : 0;
  }
}

/** rotation (deg) of one part right now: idle × amplitude (damped on the reaching arm as reach → 1) + relaxed bend */
function partRot(s: State, p: Part) {
  const r = s.reach;
  const ease = r * r * (3 - 2 * r); // smooth arrival of the hand
  const damp = p.reachDamp ? 1 - 0.9 * ease : 1;
  return (p.a.r + p.a.s) * damp * s.amp + (p.reach ?? 0) * (1 - ease); // amp (setIdleAmp) does not scale reach
}

function apply(s: State) {
  readReach(s);
  for (const p of s.parts) p.set(partRot(s, p));
  const k = s.amp;
  s.rigSet.x(s.rigP.x * k); s.rigSet.y(s.rigP.y * k); s.rigSet.r(s.rigP.r * k);
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
  const key = root.dataset.astronautSync;
  if (key) { // follower of an earlier root with the same figure and sync value: moved by that leader, nothing of its own
    const lead = [...root.ownerDocument.querySelectorAll<HTMLElement>('[data-astronaut][data-astronaut-sync]')]
      .find((r) => r !== root && r.dataset.astronaut === root.dataset.astronaut && r.dataset.astronautSync === key && states.get(r)?.root === r);
    const ls = lead && states.get(lead);
    if (ls && root.querySelector('[data-rig]')) {
      ls.roots.push(root);
      states.set(root, ls);
      bindSetters(ls);
      if (!ls.running) apply(ls); // show the group's current pose at once
      return ls;
    }
  }
  const rig = root.querySelector<HTMLElement>('[data-rig]')!;
  const parts: Part[] = [...root.querySelectorAll<HTMLElement>('[data-part]')].map((el) => {
    const name = el.dataset.part!;
    return {
      el, els: [el], set: gsap.quickSetter(el, 'rotation', 'deg') as (v: number) => void, a: { r: 0, s: 0 },
      reach: RELAX[who][name], reachDamp: name.startsWith('arm-reach'),
    };
  });
  const s: State = {
    root, who, parts, rig, roots: [root],
    rigSet: {
      x: gsap.quickSetter(rig, 'xPercent') as any, y: gsap.quickSetter(rig, 'yPercent') as any, r: gsap.quickSetter(rig, 'rotation', 'deg') as any,
    },
    rigP: { x: 0, y: 0, r: 0 }, tl: null, running: false, visible: false, enabled: true, reach: 0, lastReachStr: '\u0000', tick: () => apply(s),
    amp: 1,
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
  if (s) { if (s.root !== root) s.root.style.setProperty('--reach', String(n)); if (!s.running) apply(s); } // a follower acts as its leader
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
// ---------- pose maths (no layout): where a point of the rest pose is right now ----------
type RigPart = { name: string; parent: string | null; css: { left: number; top: number; width: number; height: number; ox: number; oy: number } };
type Pt = { x: number; y: number };
const rot = (p: Pt, deg: number): Pt => {
  const a = (deg * Math.PI) / 180, c = Math.cos(a), si = Math.sin(a);
  return { x: p.x * c - p.y * si, y: p.x * si + p.y * c };
};

/** Where the rest-pose point `rest` (fractions of the box; it belongs to `part`) is in the CURRENT pose: the same
 *  idle, reach and bob / roll values this frame paints (reach is read from the inline `--reach`). Fractions of the
 *  box, before any transform you put on the root or a wrapper. Pure arithmetic from rig.json: no layout read, so it
 *  is cheap to call every frame (handPoint / chestPoint measure the DOM instead). Also returns the part's total
 *  rotation in degrees (rig roll + the chain of joint rotations). */
export function posePoint(root: HTMLElement, part: string, rest: Pt): { x: number; y: number; rot: number } {
  const s = states.get(root);
  const R = (rig as any)[(root.dataset.astronaut as Who) || 'left'] as { width: number; height: number; chest: number[]; parts: RigPart[] };
  const W = R.width, H = R.height;
  if (s) readReach(s);
  // chain root → part with each part's rest rect in box px
  const chain: { p: RigPart; x: number; y: number; w: number; h: number; deg: number }[] = [];
  for (let name: string | null = part; name;) {
    const p = R.parts.find((q) => q.name === name);
    if (!p) break;
    chain.unshift({ p, x: 0, y: 0, w: 0, h: 0, deg: 0 });
    name = p.parent;
  }
  let px = 0, py = 0, pw = W, ph = H;
  for (const c of chain) {
    c.x = px + (c.p.css.left / 100) * pw; c.y = py + (c.p.css.top / 100) * ph;
    c.w = (c.p.css.width / 100) * pw; c.h = (c.p.css.height / 100) * ph;
    const live = s?.parts.find((q) => q.el.dataset.part === c.p.name);
    c.deg = s && live ? partRot(s, live) : 0;
    px = c.x; py = c.y; pw = c.w; ph = c.h;
  }
  // walk back up: local point in each part → its parent (rotation about the part's transform-origin)
  let q: Pt = { x: rest.x * W, y: rest.y * H };
  let total = 0;
  for (let i = chain.length - 1; i >= 0; i--) {
    const c = chain[i];
    const o = { x: c.x + (c.p.css.ox / 100) * c.w, y: c.y + (c.p.css.oy / 100) * c.h }; // origin, box px at rest
    const v = rot({ x: q.x - o.x, y: q.y - o.y }, c.deg);
    q = { x: o.x + v.x, y: o.y + v.y };
    total += c.deg;
  }
  // the rig: translate(xPercent, yPercent) rotate(r) about the chest
  const k = s ? s.amp : 0, rp = s ? s.rigP : { x: 0, y: 0, r: 0 };
  const o = { x: (R.chest[0] / 100) * W, y: (R.chest[1] / 100) * H };
  const v = rot({ x: q.x - o.x, y: q.y - o.y }, rp.r * k);
  total += rp.r * k;
  return { x: (o.x + (rp.x * k / 100) * W + v.x) / W, y: (o.y + (rp.y * k / 100) * H + v.y) / H, rot: total };
}

/** Largest idle rotation (deg) the given part can reach in total: the rig roll plus every joint above it (both sine
 *  amplitudes each, before the ±10% period jitter, which does not change amplitudes). */
export function idleRollMax(who: Who, part = 'torso'): number {
  const R = (rig as any)[who] as { parts: RigPart[] };
  let deg = FLOAT[who][4];
  for (let name: string | null = part; name;) {
    const c = IDLE[who][name];
    deg += c ? c[0] + c[2] : 0;
    name = R.parts.find((q) => q.name === name)?.parent ?? null;
  }
  return deg;
}

/** Scale every idle term (limb sway, whole-figure bob and roll) by n (default 1; 0 = rest pose, idle clock keeps
 *  running). Applied at once, also while the idle loop is paused. Reach is not affected. */
export function setIdleAmp(root: HTMLElement, n: number): void {
  const s = states.get(root); if (!s) return;
  s.amp = n;
  if (!s.running) apply(s);
}
/** Pause / resume idle motion manually (e.g. during the full-screen smoke phase). */
export function setIdle(root: HTMLElement, on: boolean) {
  const s = states.get(root); if (!s) return;
  s.enabled = on; update(s);
}

export function initAll(scope: ParentNode = document) {
  scope.querySelectorAll<HTMLElement>('[data-astronaut]').forEach((el) => initAstronaut(el));
}
