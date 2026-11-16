// SpaceJourney controller: one 100svh stage with three stops (hero → section2 → appdesign) and two transitions that
// play by TIME once a scroll intent triggers them (no scrubbing):
//   A = hero → section2 (act 1), B = section2 → appdesign (act 2 + the flash hand-off to act 3).
// Every timing lives in ./timing.ts. Docs: docs/journey/TIMING.md, docs/journey/PLAN-B.md.
//
// ONE paused master timeline in seconds holds both transitions: A on [0, LA], B on [LA, LA + LB]. A transition is a
// tween of the master's time from one stop to the next (forwards at speed 1, backwards at TIMING.global.reverseSpeed).
// The timeline tweens a plain state object (`st`); `render()` turns it into transforms using geometry measured in
// `measure()` (re-run on resize at a stop, or on arrival if the resize happened mid-transition). That keeps the
// maths exact: the left chest is the zoom focus, the hands meet in the rig's clasp arrangement at the end of
// A.approach (the same instant the chest window fills the screen), and the dog ends exactly on the rect where Agent
// C's frozen frame shows it. The figures never stop floating: their live idle pose (astronaut.ts posePoint, pure
// maths) is folded into the right figure's position and the camera target, so the contact is exact anyway.
//
// Input: GSAP Observer (wheel + touch, preventDefault) while the page is locked at hero / section2 / mid-transition;
// at appdesign native scrolling is released and a second, passive Observer only watches for an upward intent at
// scrollY 0. Gestures are separated by TIMING.global.inputQuietGap of silence; a gesture that started a transition,
// or that scrolled the page natively, never starts another one.
import gsap from 'gsap';
import { Observer } from 'gsap/Observer';
import { SplitText } from 'gsap/SplitText';
import { setReach, setIdle, posePoint, idleRollMax } from '../../space/astronaut';
import { initPhoneShowcase } from '../phoneshowcase/controller';
import dogGeo from '../../space/dog.json';
import rig from '../../space/rig.json';
import { TIMING, EASES, resolveTiming, transitionLength, type Beat, type TransitionA, type TransitionB } from './timing';

gsap.registerPlugin(Observer, SplitText);
for (const [name, ease] of Object.entries(EASES)) gsap.registerEase(name, ease);

export type Stop = 'hero' | 'section2' | 'appdesign';
export const STOPS: Stop[] = ['hero', 'section2', 'appdesign'];
type Dir = 1 | -1;
type Name = 'A' | 'B';
export type RunInfo = { name: Name; dir: Dir; from: Stop; to: Stop; started: number; ended?: number };

/** What the `?journey=debug` overlay (./debug.ts) and the verification scripts use. */
export interface JourneyCtl {
  stop(): Stop;
  running(): RunInfo | null;
  last(): RunInfo | null;
  /** transition-local time: which transition the playhead is in and its position in seconds */
  local(): { name: Name; t: number; len: number };
  active(): string[];
  isPaused(): boolean;
  setPaused(on: boolean): void;
  step(dt: number): void;
  replay(): void;
  jump(stop: Stop): void;
  beats: { A: TransitionA; B: TransitionB };
  lens: { A: number; B: number };
  log: RunInfo[];
}

// Section-2 elements in DOM order ([data-sj-s2-item]: heading, sub line, badges 1–4) → their beats.
const S2_IN = ['s2Heading', 's2Sub', 's2Badge1', 's2Badge2', 's2Badge3', 's2Badge4'] as const;
const S2_OUT = ['s2HeadingOut', 's2SubOut', 's2Badge1Out', 's2Badge2Out', 's2Badge3Out', 's2Badge4Out'] as const;
/** wait for the showcase's own resize handler (150 ms debounce) before re-measuring its dog rect */
const RESIZE_SETTLE_MS = 250;

// rig.json (docs/journey/ASSETS.md): the clasp arrangement has both boxes at rotation 0 and the same pixel scale.
const L_AR = rig.left.width / rig.left.height;
const R_AR = rig.right.width / rig.right.height;
const R_REL_W = rig.clasp.rightRelW; // right box width / left box width
const R_OFF = { x: rig.clasp.off[0], y: rig.clasp.off[1] }; // right box origin − left box origin, in left box widths
const SMOKE_RECT = rig.left.smokeRect; // smoke-pink.webp = this rect of the left box (centred on rig.left.chest)
const ROLL_MAX = (idleRollMax('left', 'torso') * Math.PI) / 180; // worst-case idle roll of the chest window, radians
const FEATHER = 0.1; // the smoke overlay's edges are feathered over 10% per side (CSS mask), so only the core must cover

type Pt = { x: number; y: number };
type Cfg = {
  L: Pt; R: Pt; wL: number; wMin: number; wMax: number; // hero centres (fractions of W/H), left box width (fraction of W)
  alpha: number; // share of the convergence travelled by the left figure
  sHold: number; // camera scale of the held two-shot at `freeze` (hands still in frame)
  hold: Pt; // where the left chest sits on screen during the two-shot (fractions of W/H); it reaches the centre at fill
  dogCtrlX: number; // dog drift: bezier control point for the dog's centre (fraction of W): left of centre
};
const DESKTOP: Cfg = { L: { x: 0.1, y: 0.215 }, R: { x: 0.875, y: 0.79 }, wL: 0.235, wMin: 230, wMax: 470, alpha: 0.5, sHold: 3.2, hold: { x: 0.4, y: 0.5 }, dogCtrlX: 0.02 };
const MOBILE: Cfg = { L: { x: 0.06, y: 0.15 }, R: { x: 0.88, y: 0.925 }, wL: 0.27, wMin: 96, wMax: 200, alpha: 0.5, sHold: 2.1, hold: { x: 0.3, y: 0.42 }, dogCtrlX: -0.05 };

const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const bez = (a: number, c: number, b: number, t: number) => (1 - t) * (1 - t) * a + 2 * (1 - t) * t * c + t * t * b;
const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));
const norm = (d: number) => ((((d + 180) % 360) + 360) % 360) - 180;

type Fig = { el: HTMLElement; root: HTMLElement; w: number; h: number; c0: Pt; c1: Pt; rot0: number; chest: Pt; hand: Pt; head: number; restHand: Pt; restChest: Pt };

/** world position of a local box point (px in the unrotated box) for a box centred at c, rotated by rot (deg). */
function toWorld(f: Fig, p: Pt, c: Pt, rot: number): Pt {
  const a = (rot * Math.PI) / 180, co = Math.cos(a), si = Math.sin(a);
  const u = p.x - f.w / 2, v = p.y - f.h / 2;
  return { x: c.x + u * co - v * si, y: c.y + u * si + v * co };
}

/** Smallest dog width (px) whose silhouette, centred on the body point, fully covers a W×H viewport (holes included).
 *  Uses the real mask path (dog.json) with isPointInFill; cached per aspect ratio. */
const coverCache = new Map<string, number>();
function dogCoverWidth(W: number, H: number): number {
  const key = (W / H).toFixed(3);
  const hit = coverCache.get(key);
  if (hit) return hit * W;
  const [vx, vy, vw, vh] = dogGeo.viewBox as number[];
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('viewBox', `${vx} ${vy} ${vw} ${vh}`);
  svg.style.cssText = 'position:absolute;left:-9999px;top:0;width:10px;height:10px;visibility:hidden';
  const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
  path.setAttribute('d', dogGeo.silhouette);
  svg.appendChild(path); document.body.appendChild(svg);
  const bx = vx + (dogGeo.body[0] / 100) * vw, by = vy + (dogGeo.body[1] / 100) * vh;
  const pt = svg.createSVGPoint();
  const inside = (x: number, y: number) => { pt.x = x; pt.y = y; return path.isPointInFill(pt); };
  // f = viewBox units per viewport px; the rect is (W f) × (H f) units
  const ok = (f: number) => {
    const hx = (W * f) / 2, hy = (H * f) / 2, n = 28, e = 160;
    for (let i = 0; i <= n; i++) for (let j = 0; j <= n; j++) if (!inside(bx - hx + (2 * hx * i) / n, by - hy + (2 * hy * j) / n)) return false;
    for (let i = 0; i <= e; i++) {
      const x = bx - hx + (2 * hx * i) / e, y = by - hy + (2 * hy * i) / e;
      if (!inside(x, by - hy) || !inside(x, by + hy) || !inside(bx - hx, y) || !inside(bx + hx, y)) return false;
    }
    return true;
  };
  let lo = 0, hi = vw / W;
  for (let k = 0; k < 22; k++) { const m = (lo + hi) / 2; if (ok(m)) lo = m; else hi = m; }
  svg.remove();
  const width = (vw / Math.max(lo, 1e-6)) * 1.03; // dog width = vw / f, plus a small safety margin
  coverCache.set(key, width / W);
  return width;
}

function heroLoadIn(root: HTMLElement) {
  const container = root.querySelector<HTMLElement>('[data-sjh-container]');
  const phone = root.querySelector<HTMLElement>('[data-sjh-phone]');
  const title = root.querySelector<HTMLElement>('[data-sjh-words]');
  if (!container || !phone || !title) return;
  gsap.fromTo(container, { opacity: 0, y: 30, filter: 'blur(10px)' },
    { opacity: 1, y: 0, filter: 'blur(0px)', duration: 0.5, delay: 0.2, ease: 'power1.inOut', clearProps: 'filter' });
  gsap.to(phone, { opacity: 1, duration: 0.4, delay: 0.9, ease: 'power1.inOut' });
  const split = SplitText.create(title, { type: 'words' });
  gsap.set(title, { visibility: 'visible' });
  gsap.from(split.words, { y: 40, opacity: 0, filter: 'blur(10px)', delay: 1.3, duration: 0.6, stagger: 0.1, ease: 'power2.out', clearProps: 'filter' });
}

/** The hero phone's 3.5 s card stack (copied from Hero.astro's script). */
function heroCards(root: HTMLElement) {
  const slider = root.querySelector<HTMLElement>('[data-sjh-slider]');
  const items = slider ? Array.from(slider.querySelectorAll<HTMLElement>('[data-sjh-card]')) : [];
  if (items.length < 4) return;
  const cardDuration = 0.8, stayDuration = 3.5;
  let current = 0;
  gsap.set(items, { opacity: 0, scale: 1, x: 0, yPercent: 0, rotate: 0, filter: 'blur(0rem)', pointerEvents: 'none' });
  gsap.set(items[2], { opacity: 0.4, zIndex: 1, x: 3, rotate: -3, pointerEvents: 'auto' });
  gsap.set(items[1], { opacity: 0.4, zIndex: 2, x: 8, rotate: 3, pointerEvents: 'auto' });
  gsap.set(items[0], { opacity: 1, zIndex: 3, pointerEvents: 'auto' });
  gsap.set(items[3], { opacity: 0, scale: 0.96, x: 25, yPercent: 180, rotate: 8, filter: 'blur(0.3rem)', zIndex: 0, pointerEvents: 'none' });
  const step = () => {
    const n = items.length;
    const falling = items[current], second = items[(current + 1) % n], third = items[(current + 2) % n], next = items[(current + 3) % n];
    gsap.set(next, { yPercent: -15, x: -10, rotate: -4, scale: 0.96, opacity: 0, filter: 'blur(0.3rem)', zIndex: 1 });
    gsap.to(next, { yPercent: 0, x: 3, rotate: -3, scale: 1, opacity: 0.4, filter: 'blur(0rem)', duration: cardDuration, ease: 'power3.out', pointerEvents: 'auto' });
    gsap.to(third, { yPercent: 0, x: 8, rotate: 3, scale: 1, opacity: 0.4, filter: 'blur(0rem)', duration: cardDuration, ease: 'power3.out', zIndex: 2, pointerEvents: 'auto' });
    gsap.to(second, { yPercent: 0, x: 0, rotate: 0, scale: 1, opacity: 1, filter: 'blur(0rem)', duration: cardDuration, ease: 'power3.out', zIndex: 3, pointerEvents: 'auto' });
    gsap.set(falling, { zIndex: 999, pointerEvents: 'none' });
    gsap.to(falling, { yPercent: 180, x: 25, rotate: 45, scale: 0.96, opacity: 1, filter: 'blur(0.3rem)', duration: cardDuration, ease: 'power2.in',
      onComplete: () => { gsap.set(falling, { zIndex: 0 }); } });
    current = (current + 1) % n;
    gsap.delayedCall(stayDuration, step);
  };
  gsap.delayedCall(stayDuration, step);
}

/** Put smoke-pink.webp inside the left figure's torso part, on the box rect it was cut from, so it follows the
 *  figure's idle motion exactly (Agent A: the texture IS that rect, so overlaying it there is seamless). */
function mountSmoke(figLeft: HTMLElement, img: HTMLElement) {
  const torso = figLeft.querySelector<HTMLElement>('[data-astronaut] [data-part="torso"]');
  if (!torso) return;
  const tl = parseFloat(torso.style.left), tt = parseFloat(torso.style.top), tw = parseFloat(torso.style.width), th = parseFloat(torso.style.height);
  const pct = (v: number) => `${v.toFixed(4)}%`;
  img.style.left = pct(((SMOKE_RECT.l * 100 - tl) / tw) * 100);
  img.style.top = pct(((SMOKE_RECT.t * 100 - tt) / th) * 100);
  img.style.width = pct(((SMOKE_RECT.w * 100) / tw) * 100);
  img.style.height = pct(((SMOKE_RECT.h * 100) / th) * 100);
  torso.appendChild(img);
}

const end = (b: Beat) => b.start + b.dur;

export function initSpaceJourney(root: HTMLElement) {
  const q = (s: string) => root.querySelector<HTMLElement>(s)!;
  const html = document.documentElement;
  const stage = q('[data-sj-stage]');
  const act1 = q('[data-sj-act1]');
  const act2 = q('[data-sj-act2]');
  const space = q('[data-sj-space]');
  const worlds = Array.from(root.querySelectorAll<HTMLElement>('[data-sj-world]'));
  const worldL = q('[data-sj-world="left"]');
  const hero = q('[data-sj-hero]');
  const smoke = q('[data-sj-smoke]');
  const space2 = q('[data-sj-space2]');
  const grad = q('[data-sj-grad]');
  const dogwrap = q('[data-sj-dogwrap]');
  const dogbox = q('[data-sj-dogbox]');
  const dogRoot = q('[data-sj-dogbox] [data-dog]');
  const s2 = q('[data-sj-s2]');
  const s2items = Array.from(root.querySelectorAll<HTMLElement>('[data-sj-s2-item]'));
  const fx = q('[data-sj-fx]');
  const bloom = q('[data-sj-bloom]');
  const flash = q('[data-sj-flash]');
  const figL = q('[data-sj-fig="left"]');
  const figR = q('[data-sj-fig="right"]');
  const astroL = q('[data-sj-fig="left"] [data-astronaut]');
  const astroR = q('[data-sj-fig="right"] [data-astronaut]');
  const skip = root.querySelector<HTMLAnchorElement>('[data-sj-skip]');
  const showcaseRoot = q('[data-sj-showcase] [data-phoneshowcase]');
  const showcase = initPhoneShowcase(showcaseRoot);

  mountSmoke(figL, smoke);
  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (!reduce) { heroLoadIn(root); heroCards(root); }

  // ---------- where to start (survives a desktop ↔ mobile rebuild) ----------
  // Reload / back-forward: we restore the scroll position ourselves (scrollRestoration = manual), and only when the
  // visitor had left the stage at `appdesign` (i.e. was scrolling the page below it). Otherwise always `hero` at y 0.
  const KEY = `sj:${location.pathname}`;
  let stopNow: Stop = 'hero';
  let restoreY = 0;
  let firstBuild = true;
  const decideStart = () => {
    if ('scrollRestoration' in history) history.scrollRestoration = 'manual';
    const nav = performance.getEntriesByType('navigation')[0] as PerformanceNavigationTiming | undefined;
    try {
      const saved = JSON.parse(sessionStorage.getItem(KEY) || 'null');
      if (saved && (nav?.type === 'reload' || nav?.type === 'back_forward') && saved.stop === 'appdesign' && saved.y > 0) {
        stopNow = 'appdesign'; restoreY = saved.y;
      }
    } catch { /* storage blocked: start at hero */ }
    const id = location.hash ? decodeURIComponent(location.hash.slice(1)) : '';
    const target = id ? document.getElementById(id) : null;
    if (target && (!root.contains(target) || target.closest('[data-sj-showcase]'))) stopNow = 'appdesign';
    if (window.scrollY > 0) { stopNow = 'appdesign'; restoreY = restoreY || window.scrollY; }
    addEventListener('pagehide', () => {
      try { sessionStorage.setItem(KEY, JSON.stringify({ stop: stopNow, y: Math.round(window.scrollY) })); } catch { /* ignore */ }
    });
  };

  const handle: { ctl: JourneyCtl | null } = { ctl: null };
  (root as any).__sj = handle; // verification handle (docs/journey/tools/auto/*) and the debug overlay
  const debug = new URLSearchParams(location.search).get('journey') === 'debug';

  const mm = gsap.matchMedia();
  mm.add({
    desktop: '(min-width: 768px) and (prefers-reduced-motion: no-preference)',
    mobile: '(max-width: 767px) and (prefers-reduced-motion: no-preference)',
    reduce: '(prefers-reduced-motion: reduce)',
  }, (ctx) => {
    const c = ctx.conditions as Record<string, boolean>;
    if (c.reduce) {
      // three static stacked blocks (CSS); the showcase renders its own final state under reduced motion
      html.classList.remove('sj-motion', 'sj-locked', 'sj-gutter');
      return;
    }
    html.classList.add('sj-motion');
    if (firstBuild) { firstBuild = false; decideStart(); }
    return buildMotion(c.mobile ? MOBILE : DESKTOP, !!c.mobile);
  });

  if (debug && !reduce) import('./debug').then((m) => m.mountDebug(handle));

  function buildMotion(cfg: Cfg, mobile: boolean) {
    const { A, B } = resolveTiming(mobile);
    const LA = transitionLength(A), LB = transitionLength(B);
    for (const [n, beats] of [['A', A], ['B', B]] as const) {
      for (const [k, b] of Object.entries(beats)) if (end(b) > beats.arrival.start + 1e-6) console.warn(`[journey] ${n}.${k} ends at ${end(b).toFixed(2)}s, after ${n}.arrival (${beats.arrival.start}s): the transition is extended`);
    }
    if (Math.abs(end(A.approach) - end(A.cameraRush)) > 1e-6) console.warn(`[journey] A.approach ends at ${end(A.approach).toFixed(2)}s but A.cameraRush at ${end(A.cameraRush).toFixed(2)}s: the hands should touch as the screen fills with smoke`);
    const T0: Record<Stop, number> = { hero: 0, section2: LA, appdesign: LA + LB };

    // ---------- state driven by the timeline ----------
    const st = { conv: 0, turn: 0, reach: 0, push: 0, rush: 0, focus: 0, centre: 0, fix: 0, smoke: 0, space: 0, dogK: 0, dogP: 0, detail: 0 };
    // ---------- geometry ----------
    let W = 0, H = 0, sFill = 10;
    const figs = {} as { L: Fig; R: Fig };
    let P0: Pt = { x: 0, y: 0 }; // left chest at rest (world = screen at zoom 1)
    let Lw = 0, Lh = 0, body: Pt = { x: 0, y: 0 }, k1 = 0.1, C0: Pt = { x: 0, y: 0 }, C1: Pt = { x: 0, y: 0 }, Cc: Pt = { x: 0, y: 0 };

    const measureDog = () => {
      // laid out at the size that just covers the stage (so k = 1 there: the mask is rasterised at that size)
      Lw = Math.round(dogCoverWidth(W, H));
      dogbox.style.width = `${Lw}px`;
      Lh = (Lw * dogGeo.viewBox[3]) / dogGeo.viewBox[2];
      body = { x: (dogGeo.body[0] / 100) * Lw, y: (dogGeo.body[1] / 100) * Lh };
      // start: body point on the stage centre at scale 1; end: Agent C's frozen-frame rect
      C0 = { x: W / 2 + (Lw / 2 - body.x), y: H / 2 + (Lh / 2 - body.y) };
      const sr = stage.getBoundingClientRect();
      const r = showcase.dogRect();
      if (r && r.width > 2) {
        k1 = r.width / Lw;
        C1 = { x: r.left - sr.left + r.width / 2, y: r.top - sr.top + r.height / 2 };
      } else {
        k1 = (Math.min(W, H) * 0.3) / Lw;
        C1 = { x: W / 2, y: H / 2 };
      }
      Cc = { x: cfg.dogCtrlX * W, y: lerp(C0.y, C1.y, 0.5) };
      // the glow before the flash is centred on the dog's body where it comes to rest, and at full size reaches
      // every corner of the stage (closest-side = d / 2)
      const gx = C1.x + (body.x - Lw / 2) * k1, gy = C1.y + (body.y - Lh / 2) * k1;
      const d = 2 * Math.max(Math.hypot(gx, gy), Math.hypot(W - gx, gy), Math.hypot(gx, H - gy), Math.hypot(W - gx, H - gy));
      Object.assign(bloom.style, { left: `${(gx - d / 2).toFixed(1)}px`, top: `${(gy - d / 2).toFixed(1)}px`, width: `${d.toFixed(1)}px`, height: `${d.toFixed(1)}px` });
    };

    const measure = () => {
      W = stage.clientWidth; H = stage.clientHeight;
      const wL = clamp(cfg.wL * W, cfg.wMin, cfg.wMax), hL = wL / L_AR;
      const wR = wL * R_REL_W, hR = wR / R_AR;
      figL.style.width = `${wL.toFixed(2)}px`; figR.style.width = `${wR.toFixed(2)}px`;
      const mk = (el: HTMLElement, root: HTMLElement, w: number, h: number, who: 'left' | 'right', c0: Pt): Fig => ({
        el, root, w, h, c0, c1: c0, rot0: 0, head: rig[who].headAngle,
        chest: { x: (rig[who].chest[0] / 100) * w, y: (rig[who].chest[1] / 100) * h },
        hand: { x: (rig[who].hand[0] / 100) * w, y: (rig[who].hand[1] / 100) * h },
        restHand: { x: rig[who].hand[0] / 100, y: rig[who].hand[1] / 100 },
        restChest: { x: rig[who].chest[0] / 100, y: rig[who].chest[1] / 100 },
      });
      const L = (figs.L = mk(figL, astroL, wL, hL, 'left', { x: cfg.L.x * W, y: cfg.L.y * H }));
      const R = (figs.R = mk(figR, astroR, wR, hR, 'right', { x: cfg.R.x * W, y: cfg.R.y * H }));
      // hero: head-first towards each other
      const phi = (Math.atan2(R.c0.y - L.c0.y, R.c0.x - L.c0.x) * 180) / Math.PI;
      L.rot0 = norm(phi - L.head);
      R.rot0 = norm(phi + 180 - R.head);
      // contact: rotation 0, source arrangement (centre-to-centre offset dC)
      const dC = { x: R_OFF.x * wL + wR / 2 - wL / 2, y: R_OFF.y * wL + hR / 2 - hL / 2 };
      const D = { x: R.c0.x - L.c0.x - dC.x, y: R.c0.y - L.c0.y - dC.y };
      L.c1 = { x: L.c0.x + cfg.alpha * D.x, y: L.c0.y + cfg.alpha * D.y };
      R.c1 = { x: L.c1.x + dC.x, y: L.c1.y + dC.y };
      P0 = toWorld(L, L.chest, L.c0, L.rot0);
      // zoom at fill: the (possibly slightly rolled) chest window must cover the stage
      const rw = SMOKE_RECT.w * wL, rh = SMOKE_RECT.h * hL, co = Math.cos(ROLL_MAX), si = Math.sin(ROLL_MAX);
      sFill = (Math.max((W * co + H * si) / rw, (W * si + H * co) / rh) * 1.03) / (1 - 2 * FEATHER);
      space.style.transformOrigin = `${P0.x.toFixed(2)}px ${P0.y.toFixed(2)}px`;
      measureDog();
      // reserve the scrollbar only if the page can scroll at all (content below the stage): no gutter strip otherwise
      html.classList.toggle('sj-gutter', html.scrollHeight > innerHeight + 1);
    };

    // ---------- render ----------
    const figPose = (f: Fig, turn: number, conv: number, corr: Pt) => ({
      c: { x: lerp(f.c0.x, f.c1.x, conv) - corr.x, y: lerp(f.c0.y, f.c1.y, conv) - corr.y },
      rot: lerp(f.rot0, 0, turn),
    });
    /** world position of a rest-pose box point (fractions) of figure f in its CURRENT idle / reach pose */
    const live = (f: Fig, part: string, rest: Pt, c: Pt, rot: number): Pt => {
      const p = posePoint(f.root, part, rest);
      return toWorld(f, { x: p.x * f.w, y: p.y * f.h }, c, rot);
    };
    const render = () => {
      const { L, R } = figs;
      if (!L) return;
      setReach(L.root, st.reach); setReach(R.root, st.reach); // first: posePoint reads the reach
      const pL = figPose(L, st.turn, st.conv, { x: 0, y: 0 });
      // the idle keeps running to the contact: whatever it does to the two hands this frame is added to the right
      // figure's position (blended in by `fix`), so at fix = 1 the live fingertips coincide exactly
      let eH: Pt = { x: 0, y: 0 }, eC: Pt = { x: 0, y: 0 };
      if (st.fix > 0) {
        const pR0 = figPose(R, st.turn, st.conv, { x: 0, y: 0 });
        const hl = live(L, 'arm-reach-lower', L.restHand, pL.c, pL.rot), hr = live(R, 'arm-reach-lower', R.restHand, pR0.c, pR0.rot);
        const ml = toWorld(L, L.hand, pL.c, pL.rot), mr = toWorld(R, R.hand, pR0.c, pR0.rot);
        eH = { x: (hr.x - hl.x) - (mr.x - ml.x), y: (hr.y - hl.y) - (mr.y - ml.y) };
        // and the chest window (the camera target) is followed where the idle has moved it
        const lc = live(L, 'torso', L.restChest, pL.c, pL.rot), mc = toWorld(L, L.chest, pL.c, pL.rot);
        eC = { x: lc.x - mc.x, y: lc.y - mc.y };
      }
      const pR = figPose(R, st.turn, st.conv, { x: eH.x * st.fix, y: eH.y * st.fix });
      for (const [f, p] of [[L, pL], [R, pR]] as const) {
        f.el.style.transform = `translate(${(p.c.x - f.w / 2).toFixed(2)}px, ${(p.c.y - f.h / 2).toFixed(2)}px) rotate(${p.rot.toFixed(3)}deg)`;
      }
      // camera (log scale): push to the held two-shot, then the rush to the cover scale where the chest fills the stage
      const lHold = Math.log(cfg.sHold);
      const s = Math.exp(st.push * lHold + st.rush * (Math.log(sFill) - lHold));
      const Pw = toWorld(L, L.chest, pL.c, pL.rot);
      Pw.x += eC.x * st.fix; Pw.y += eC.y * st.fix;
      // focus 0 = neutral camera (the chest is where the figure's own drift puts it), 1 = chest on the framing point;
      // centre moves that point to the exact stage centre during the rush
      const tx = lerp(cfg.hold.x * W, W / 2, st.centre), ty = lerp(cfg.hold.y * H, H / 2, st.centre);
      const Q = { x: lerp(Pw.x, tx, st.focus), y: lerp(Pw.y, ty, st.focus) };
      const t = `translate(${(Q.x - s * Pw.x).toFixed(2)}px, ${(Q.y - s * Pw.y).toFixed(2)}px) scale(${s.toFixed(5)})`;
      for (const w of worlds) w.style.transform = t;
      space.style.transform = `scale(${(1 + 0.35 * st.space).toFixed(5)})`;
      smoke.style.opacity = st.smoke.toFixed(4);
      // dog: log-scale recede from cover (k = 1) to C's rect; its centre on a bezier (centre → left → middle)
      const k = Math.exp(lerp(0, Math.log(k1), st.dogK));
      const e = st.dogP;
      const cx = bez(C0.x, Cc.x, C1.x, e), cy = bez(C0.y, Cc.y, C1.y, e);
      dogbox.style.transform = `translate(${(cx - (k * Lw) / 2).toFixed(2)}px, ${(cy - (k * Lh) / 2).toFixed(2)}px) scale(${k.toFixed(6)})`;
      // helmet glass + volume shading (Dog.astro): off while the dog covers the screen, in as it gets small
      dogRoot.style.setProperty('--dog-detail', st.detail.toFixed(3));
    };

    // ---------- idle: always on while act 1 can be seen; off once act 1 is hidden (no idle work off-stage) ----------
    let idleOff = false;
    const setIdleOff = (off: boolean) => {
      if (off === idleOff) return;
      idleOff = off;
      setIdle(astroL, !off); setIdle(astroR, !off);
    };
    // while the playhead stands still (a debug pause; never during a normal run) the idle still moves the hands and
    // the chest window, so keep the corrections live every frame
    const onIdleTick = () => { if (!idleOff && st.fix > 0 && (!run || dbgPaused)) render(); };
    gsap.ticker.add(onIdleTick);

    // ---------- the master timeline (seconds; built ONLY from timing.ts) ----------
    const tl = gsap.timeline({ defaults: { ease: 'none' }, paused: true, onUpdate: () => { render(); sync(); } });
    const stTo = (key: keyof typeof st, to: number, b: Beat, off = 0) => tl.to(st, { [key]: to, duration: b.dur, ease: b.ease }, off + b.start);
    const ab = (b: Beat) => ({ duration: b.dur, ease: b.ease });

    // A: hero → section2
    tl.addLabel('hero', 0);
    tl.to(hero, { autoAlpha: 0, y: -46, ...ab(A.heroOut) }, A.heroOut.start);
    tl.set(worldL, { zIndex: 4 }, A.leftFigureToFront.start); // copy gone: the left figure (zoom target) is nearest
    stTo('conv', 1, A.approach); // one continuous approach; contact in the clasp arrangement at its end
    stTo('turn', 1, A.turn);
    stTo('reach', 1, A.reach);
    stTo('push', 1, A.cameraTwoShot);
    stTo('focus', 1, A.cameraFocus);
    stTo('rush', 1, A.cameraRush); // the hands are still closing in the two-shot as the camera rushes into the chest
    stTo('centre', 1, A.cameraCentre);
    stTo('fix', 1, A.idleCorrection);
    stTo('smoke', 1, A.smokeIn);
    stTo('space', 1, A.spaceZoom);
    // smoke → gradient, section 2 in
    tl.set(act2, { autoAlpha: 1 }, A.gradientIn.start);
    tl.fromTo(grad, { autoAlpha: 0 }, { autoAlpha: 1, ...ab(A.gradientIn) }, A.gradientIn.start);
    tl.set(act1, { autoAlpha: 0 }, end(A.gradientIn));
    tl.set(s2, { autoAlpha: 1 }, A.gradientIn.start);
    s2items.forEach((el, i) => {
      const b = A[S2_IN[i]];
      if (b) tl.fromTo(el, { autoAlpha: 0, y: 26 }, { autoAlpha: 1, y: 0, ...ab(b) }, b.start);
    });
    tl.set({}, {}, LA);
    tl.addLabel('section2', LA);

    // B: section2 → appdesign. Section-2 elements out; the gradient turns out to be the inside of a screen-covering dog.
    let outEnd = 0;
    s2items.forEach((el, i) => {
      const b = B[S2_OUT[i]];
      if (!b) return;
      tl.to(el, { autoAlpha: 0, y: -20, ...ab(b) }, LA + b.start);
      outEnd = Math.max(outEnd, end(b));
    });
    tl.set(s2, { autoAlpha: 0 }, LA + outEnd);
    tl.set([space2, dogwrap], { autoAlpha: 1 }, LA + B.gradToDog.start);
    tl.to(grad, { autoAlpha: 0, ...ab(B.gradToDog) }, LA + B.gradToDog.start);
    stTo('dogK', 1, B.dogRecede, LA);
    stTo('dogP', 1, B.dogDrift, LA);
    stTo('detail', 1, B.dogDetail, LA);
    // light: as soon as the dog has arrived a soft round glow swells out of it, then the whole screen fades to white
    tl.fromTo(bloom, { opacity: 0 }, { opacity: 1, ...ab(B.glowIn) }, LA + B.glowIn.start);
    tl.fromTo(bloom, { scale: 0.05 }, { scale: 2, ...ab(B.glowSwell) }, LA + B.glowSwell.start); // at 2 its bright core reaches the corners
    tl.fromTo(flash, { opacity: 0 }, { opacity: 1, ...ab(B.flashIn) }, LA + B.flashIn.start);
    tl.set(act2, { autoAlpha: 0 }, LA + B.flashPeak.start); // showcase.play() at the same time, see sync()
    // (B.whiteHold: nothing moves) then the white fades off the showcase
    tl.fromTo(fx, { opacity: 1 }, { opacity: 0, ...ab(B.whiteFade) }, LA + B.whiteFade.start);
    tl.set({}, {}, LA + LB);
    tl.addLabel('appdesign', LA + LB);

    // ---------- discrete hand-offs: idle off while act 1 is hidden, and the flash → act 3 ----------
    const FLASH_T = LA + B.flashPeak.start - 1e-4;
    let flashed = false, dogStale = false;
    function sync() {
      const t = tl.time();
      setIdleOff(t >= end(A.gradientIn) - 1e-6);
      const past = t >= FLASH_T;
      if (past === flashed) return;
      flashed = past;
      if (past) showcase.play();
      else {
        showcase.reset();
        if (dogStale) { dogStale = false; measureDog(); render(); }
      }
    }

    const remeasure = () => {
      pendingMeasure = false;
      measure();
      // the showcase is running: its dog rect is no longer the t=0 frame (the dog is hidden anyway); re-measure the
      // dog's end rect when reset() puts the frozen frame back
      if (flashed) dogStale = true;
      render(); sync();
    };

    // ---------- stops, runs, locking ----------
    let idx = STOPS.indexOf(stopNow);
    let run: (RunInfo & { tween: gsap.core.Tween | null }) | null = null;
    let last: RunInfo | null = null;
    const log: RunInfo[] = [];
    let arrivedAt = -Infinity;
    let pendingMeasure = false;
    let dbgPaused = false;
    // gestures: a new one starts after `inputQuietGap` of input silence, on touchstart and on every key press
    let gesture = 0, usedGesture = -1, lastInput = -Infinity;
    const G = TIMING.global;
    const now = () => performance.now();

    const emit = (type: string, detail: object) => root.dispatchEvent(new CustomEvent(type, { detail }));
    const setLocked = (on: boolean) => {
      html.classList.toggle('sj-locked', on);
      if (on) { lockObs.enable(); freeObs.disable(); if (window.scrollY !== 0) window.scrollTo(0, 0); }
      else { lockObs.disable(); freeObs.enable(); }
    };
    const markStop = () => {
      stopNow = STOPS[idx];
      root.dataset.sjStop = stopNow;
      if (run) root.dataset.sjRun = `${run.name}${run.dir > 0 ? '+' : '-'}`; else delete root.dataset.sjRun;
    };

    const drive = () => {
      if (!run) return;
      run.tween?.kill();
      const target = T0[run.to], toIdx = STOPS.indexOf(run.to);
      const speed = run.dir > 0 ? 1 : G.reverseSpeed;
      run.tween = gsap.to(tl, { time: target, duration: Math.abs(target - tl.time()) / speed, ease: 'none', overwrite: true, onComplete: () => arrive(toIdx) });
      if (dbgPaused) run.tween.pause();
    };

    const begin = (dir: Dir) => {
      const to = idx + dir;
      if (to < 0 || to > 2) return false;
      const from = STOPS[idx];
      const name: Name = dir > 0 ? (idx === 0 ? 'A' : 'B') : (idx === 2 ? 'B' : 'A');
      run = { name, dir, from, to: STOPS[to], started: now(), tween: null };
      setLocked(true);
      markStop();
      emit('sj:start', { name, dir, from, to: STOPS[to] });
      drive();
      return true;
    };

    const arrive = (i: number) => {
      const r = run;
      idx = i; run?.tween?.kill(); run = null;
      arrivedAt = now();
      if (r) { last = { name: r.name, dir: r.dir, from: r.from, to: r.to, started: r.started, ended: arrivedAt }; log.push(last); }
      markStop();
      if (pendingMeasure) remeasure();
      setLocked(stopNow !== 'appdesign');
      emit('sj:arrive', { stop: stopNow, run: last && r ? last : null });
    };

    const jump = (stop: Stop, cooldown = true) => {
      run?.tween?.kill(); run = null;
      tl.time(T0[stop]); render(); sync();
      idx = STOPS.indexOf(stop);
      arrivedAt = cooldown ? now() : -Infinity;
      markStop();
      if (pendingMeasure) remeasure();
      setLocked(stop !== 'appdesign');
    };

    const intent = (dir: Dir) => {
      if (run || dbgPaused) return;
      if (gesture === usedGesture) return; // the same gesture already started a transition (or scrolled the page)
      const to = idx + dir;
      if (to < 0 || to > 2) return;
      usedGesture = gesture;
      if (now() - arrivedAt < G.arrivalCooldown * 1000) return; // consumed by the cool-down
      begin(dir);
    };

    const noteInput = (fresh = false) => {
      const t = now();
      if (fresh || t - lastInput >= G.inputQuietGap * 1000) gesture++;
      lastInput = t;
    };
    const onWheelNote = () => noteInput();
    const onTouchStartNote = (e: TouchEvent) => noteInput(e.touches.length === 1);
    const onTouchMoveNote = () => noteInput();
    const onScroll = () => {
      if (html.classList.contains('sj-locked')) {
        // locked: nothing may move the page (focus / anchors / scripts); focus outside the stage is handled below
        if (window.scrollY !== 0) window.scrollTo(0, 0);
        return;
      }
      usedGesture = gesture; // native scrolling at appdesign: this gesture may not also start the reverse transition
    };

    // wheel / trackpad / touch. wheelSpeed -1 maps wheel-down and finger-up to the same "up" (= next stop)
    const ignoreCheck = (e: Event, isPointerOrTouch: boolean) => {
      if (isPointerOrTouch) {
        const pe = e as PointerEvent & TouchEvent;
        return (!!pe.pointerType && pe.pointerType !== 'touch') || (!!pe.touches && pe.touches.length > 1); // mouse drags, pinch-zoom
      }
      const we = e as WheelEvent;
      return e.type === 'wheel' && (we.ctrlKey || Math.abs(we.deltaX) > Math.abs(we.deltaY)); // zoom, horizontal swipes
    };
    const vertical = (s: Observer) => Math.abs(s.deltaY) >= Math.abs(s.deltaX);
    const lockObs = Observer.create({
      target: window, type: 'wheel,touch', wheelSpeed: -1, tolerance: G.tolerance, preventDefault: true, ignoreCheck,
      onUp: (s) => { if (vertical(s)) intent(1); },
      onDown: (s) => { if (vertical(s)) intent(-1); },
    });
    const freeObs = Observer.create({
      target: window, type: 'wheel,touch', wheelSpeed: -1, tolerance: G.tolerance, ignoreCheck,
      onDown: (s) => { if (vertical(s) && window.scrollY <= 0) intent(-1); },
    });

    const onKey = (e: KeyboardEvent) => {
      if (e.defaultPrevented || e.ctrlKey || e.metaKey || e.altKey) return;
      const t = e.target as HTMLElement | null;
      if (t && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName))) return;
      let dir = 0;
      switch (e.key) {
        case 'ArrowDown': case 'PageDown': case 'End': dir = 1; break;
        case 'ArrowUp': case 'PageUp': case 'Home': dir = -1; break;
        case ' ': case 'Spacebar':
          if (t && (t.tagName === 'BUTTON' || t.getAttribute('role') === 'button')) return; // Space activates buttons
          dir = e.shiftKey ? -1 : 1; break;
        default: return;
      }
      const locked = !!run || idx < 2;
      if (!locked && (dir > 0 || window.scrollY > 0)) return; // appdesign: native keyboard scrolling
      e.preventDefault();
      if (e.repeat) return;
      noteInput(true);
      intent(dir as Dir);
    };

    // focus moving outside the stage (not the navbar) while locked → we are past the journey: release it
    const onFocusIn = (e: FocusEvent) => {
      const t = e.target as HTMLElement;
      if (!html.classList.contains('sj-locked') || !(t instanceof HTMLElement) || root.contains(t) || t.closest('[data-section="Navbar"]')) return;
      jump('appdesign');
      requestAnimationFrame(() => t.scrollIntoView({ block: 'nearest' }));
    };
    const onHash = () => {
      const id = decodeURIComponent(location.hash.slice(1));
      const el = id ? document.getElementById(id) : null;
      if (!el || (root.contains(el) && !el.closest('[data-sj-showcase]'))) return;
      jump('appdesign');
      requestAnimationFrame(() => el.scrollIntoView());
    };
    const onSkip = (e: MouseEvent) => {
      e.preventDefault();
      jump('appdesign');
      const title = showcaseRoot.querySelector<HTMLElement>('#ps-title') ?? showcaseRoot;
      if (!title.hasAttribute('tabindex')) title.setAttribute('tabindex', '-1');
      title.focus({ preventScroll: true });
    };

    let rzT = 0;
    const onResize = () => {
      clearTimeout(rzT);
      rzT = window.setTimeout(() => { if (run) pendingMeasure = true; else remeasure(); }, RESIZE_SETTLE_MS);
    };
    const onSettled = () => { if (run) pendingMeasure = true; else remeasure(); };

    addEventListener('wheel', onWheelNote, { capture: true, passive: true });
    addEventListener('touchstart', onTouchStartNote, { capture: true, passive: true });
    addEventListener('touchmove', onTouchMoveNote, { capture: true, passive: true });
    addEventListener('scroll', onScroll, { passive: true });
    addEventListener('keydown', onKey);
    addEventListener('resize', onResize);
    addEventListener('hashchange', onHash);
    document.addEventListener('focusin', onFocusIn);
    skip?.addEventListener('click', onSkip);
    // fonts and images change layout → re-measure once they settle
    document.fonts?.ready.then(onSettled);
    if (document.readyState !== 'complete') addEventListener('load', onSettled, { once: true });

    // ---------- start ----------
    measure();
    render(); sync();
    jump(stopNow, false);
    if (restoreY && stopNow === 'appdesign') {
      const y = restoreY; restoreY = 0;
      window.scrollTo(0, y);
      if (document.readyState !== 'complete') addEventListener('load', () => window.scrollTo(0, y), { once: true });
    }

    // ---------- control surface (debug overlay + verification) ----------
    const segOf = (t: number): Name => (t < LA - 1e-6 ? 'A' : t > LA + 1e-6 ? 'B' : (run?.name ?? last?.name ?? (idx === 2 ? 'B' : 'A')));
    const ctl: JourneyCtl = {
      stop: () => STOPS[idx],
      running: () => (run ? { name: run.name, dir: run.dir, from: run.from, to: run.to, started: run.started } : null),
      last: () => last,
      local: () => {
        const t = tl.time();
        const name = run?.name ?? segOf(t);
        return { name, t: name === 'A' ? t : t - LA, len: name === 'A' ? LA : LB };
      },
      active: () => {
        const { name, t } = ctl.local();
        const beats = (name === 'A' ? A : B) as Record<string, Beat>;
        return Object.entries(beats).filter(([, b]) => (b.dur > 0 ? t >= b.start - 1e-6 && t <= end(b) + 1e-6 : Math.abs(t - b.start) < 0.06)).map(([k]) => k);
      },
      isPaused: () => dbgPaused,
      setPaused: (on) => {
        dbgPaused = on;
        if (on) run?.tween?.pause();
        else if (run) drive(); // re-drive from wherever stepping left the playhead
      },
      step: (dt) => {
        if (!dbgPaused) return;
        if (!run) {
          const dir: Dir = dt > 0 ? 1 : -1;
          if (!begin(dir)) return; // begins paused (dbgPaused)
        }
        const r = run!;
        const a = T0[r.from], b = T0[r.to];
        const t = clamp(Math.round((tl.time() + dt) * 1000) / 1000, Math.min(a, b), Math.max(a, b));
        r.tween?.kill(); r.tween = null;
        tl.time(t);
        if (Math.abs(t - b) < 1e-6) arrive(STOPS.indexOf(r.to));
        else if (Math.abs(t - a) < 1e-6) { run = null; arrive(STOPS.indexOf(r.from)); }
      },
      replay: () => {
        const ref = run ?? last ?? { name: 'A' as Name, dir: 1 as Dir };
        const from = ref.name === 'A' ? (ref.dir > 0 ? 'hero' : 'section2') : (ref.dir > 0 ? 'section2' : 'appdesign');
        jump(from);
        begin(ref.dir);
      },
      jump: (stop) => jump(stop),
      beats: { A, B },
      lens: { A: LA, B: LB },
      log,
    };
    handle.ctl = ctl;

    return () => {
      // desktop ↔ mobile rebuild (or reduced motion switched on): a running transition snaps to its destination
      if (run) stopNow = run.to;
      run?.tween?.kill(); run = null;
      clearTimeout(rzT);
      removeEventListener('wheel', onWheelNote, { capture: true });
      removeEventListener('touchstart', onTouchStartNote, { capture: true });
      removeEventListener('touchmove', onTouchMoveNote, { capture: true });
      removeEventListener('scroll', onScroll);
      removeEventListener('keydown', onKey);
      removeEventListener('resize', onResize);
      removeEventListener('hashchange', onHash);
      document.removeEventListener('focusin', onFocusIn);
      skip?.removeEventListener('click', onSkip);
      lockObs.kill(); freeObs.kill();
      html.classList.remove('sj-locked');
      if (flashed) showcase.reset();
      gsap.ticker.remove(onIdleTick);
      if (idleOff) { setIdle(astroL, true); setIdle(astroR, true); }
      [figL, figR, dogbox].forEach((el) => { el.style.transform = ''; el.style.width = ''; });
      worlds.forEach((w) => { w.style.transform = ''; });
      space.style.transform = ''; space.style.transformOrigin = '';
      smoke.style.opacity = '';
      setReach(astroL, 0); setReach(astroR, 0);
      tl.kill();
      if (handle.ctl === ctl) handle.ctl = null;
    };
  }
}
