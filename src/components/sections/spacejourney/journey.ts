// SpaceJourney controller: pinned stage + ONE scrubbed master timeline (acts 1–2) + the flash hand-off to act 3.
// Plan, timing table and staging choices: docs/journey/PLAN-B.md.
//
// The timeline tweens a plain state object (`st`); `render()` turns it into transforms using geometry measured in
// `measure()` (re-run on every ScrollTrigger refresh: resize, orientation change, fonts). That keeps the maths exact:
// the left chest is the zoom focus, the hands meet in Agent A's source arrangement at `fill`, and the dog ends exactly
// on the rect where Agent C's frozen frame shows it.
import gsap from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import { SplitText } from 'gsap/SplitText';
import { setReach, setIdle, handPoint } from '../../space/astronaut';
import { initPhoneShowcase } from '../phoneshowcase/controller';
import dogGeo from '../../space/dog.json';
import rig from '../../space/rig.json';

gsap.registerPlugin(ScrollTrigger, SplitText);

/** Timeline positions in viewport-heights of scroll (desktop; mobile maps the same timeline onto `len` x). */
export const T = {
  hero: 0,
  approach: 0,
  fill: 2.4, // screen 100% smoke AND the hands touch
  s2in: 2.4,
  s2hold: 3.3,
  dog: 4.3,
  dogFade: 4.4, // plain gradient → the screen-covering dog (cross-fade 4.4–4.62)
  dogMove: 4.62, // the dog recedes + drifts left → centre until 6.15
  dogEnd: 6.15,
  beam: 6.25,
  flash: 6.9,
  end: 7.1,
};
const A = T.fill; // approach length
/** approach fractions */
const P = { reachIn: 0.12, reachDone: 0.66, turnIn: 0.04, turnDone: 0.7, freeze: 0.72, gapClose: 0.78, smokeIn: 0.88, smokeDone: 0.98 };

// Agent A facts (docs/journey/ASSETS.md): source "hands clasped" arrangement, both boxes at rotation 0, same scale.
const L_AR = rig.left.width / rig.left.height; // 1.306
const R_AR = rig.right.width / rig.right.height; // 0.793
const R_REL_W = 0.6563; // right box width / left box width
const R_OFF = { x: 0.944, y: 0.1755 }; // right box origin − left box origin, in left box widths
const SMOKE_RECT = { l: 0.5708, t: 0.1188, w: 0.2557, h: 0.2087 }; // smoke-pink.webp = this rect of the left box
const ROLL_MAX = (3.6 * Math.PI) / 180; // worst-case idle roll of the chest window (rig 1.6° + torso 1.8°), radians
const FEATHER = 0.1; // the smoke overlay's edges are feathered over 10% per side (CSS mask), so only the core must cover

type Pt = { x: number; y: number };
type Cfg = {
  L: Pt; R: Pt; wL: number; wMin: number; wMax: number; // hero centres (fractions of W/H), left box width (fraction of W)
  alpha: number; // share of the convergence travelled by the left figure
  sHold: number; // camera scale of the held two-shot at `freeze` (hands still in frame)
  hold: Pt; // where the left chest sits on screen during the two-shot (fractions of W/H); it reaches the centre at fill
  len: number; // scroll length multiplier
  dogCtrlX: number; // dog drift: bezier control point for the dog's centre (fraction of W): left of centre
};
const DESKTOP: Cfg = { L: { x: 0.1, y: 0.215 }, R: { x: 0.875, y: 0.79 }, wL: 0.235, wMin: 230, wMax: 470, alpha: 0.5, sHold: 3.2, hold: { x: 0.5, y: 0.5 }, len: 1, dogCtrlX: 0.02 };
const MOBILE: Cfg = { L: { x: 0.06, y: 0.15 }, R: { x: 0.88, y: 0.925 }, wL: 0.27, wMin: 96, wMax: 200, alpha: 0.5, sHold: 2.1, hold: { x: 0.3, y: 0.42 }, len: 0.82, dogCtrlX: -0.05 };

const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const bez = (a: number, c: number, b: number, t: number) => (1 - t) * (1 - t) * a + 2 * (1 - t) * t * c + t * t * b;
const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));
const norm = (d: number) => ((((d + 180) % 360) + 360) % 360) - 180;

type Fig = { el: HTMLElement; root: HTMLElement; w: number; h: number; c0: Pt; c1: Pt; rot0: number; chest: Pt; hand: Pt; head: number };

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

/** Every <Dog/> instance carries the same SVG ids (helmet clip, glass gradient). `url(#id)` resolves to the FIRST
 *  one in the document, which is this stage's dog; when act 2 is visibility:hidden (after the flash) the clipPath
 *  would hide the head inside Agent C's frozen-frame dog. Give this instance private ids. */
function privatiseSvgIds(scope: HTMLElement, prefix: string) {
  const ids = Array.from(scope.querySelectorAll<SVGElement>('[id]')).map((el) => el.id);
  if (!ids.length) return;
  for (const el of Array.from(scope.querySelectorAll<SVGElement>('*'))) {
    for (const a of Array.from(el.attributes)) {
      let v = a.value, changed = false;
      for (const id of ids) if (v.includes(`#${id})`)) { v = v.split(`#${id})`).join(`#${prefix}${id})`); changed = true; }
      if (changed) el.setAttribute(a.name, v);
    }
  }
  scope.querySelectorAll<SVGElement>('[id]').forEach((el) => { el.id = prefix + el.id; });
}

export function initSpaceJourney(root: HTMLElement) {
  const q = (s: string) => root.querySelector<HTMLElement>(s)!;
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
  const beam = q('[data-sj-beam]');
  const bloom = q('[data-sj-bloom]');
  const flash = q('[data-sj-flash]');
  const figL = q('[data-sj-fig="left"]');
  const figR = q('[data-sj-fig="right"]');
  const astroL = q('[data-sj-fig="left"] [data-astronaut]');
  const astroR = q('[data-sj-fig="right"] [data-astronaut]');
  const showcase = initPhoneShowcase(q('[data-sj-showcase] [data-phoneshowcase]'));

  mountSmoke(figL, smoke);
  privatiseSvgIds(dogbox, 'sj-');
  const rim = dogbox.querySelector<SVGPathElement>('.rb-dog__detail path[vector-effect="non-scaling-stroke"]');
  const rimW = rim ? parseFloat(rim.getAttribute('stroke-width') || '5') : 5;
  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (!reduce) { heroLoadIn(root); heroCards(root); }

  const mm = gsap.matchMedia();
  mm.add({
    desktop: '(min-width: 768px) and (prefers-reduced-motion: no-preference)',
    mobile: '(max-width: 767px) and (prefers-reduced-motion: no-preference)',
    reduce: '(prefers-reduced-motion: reduce)',
  }, (ctx) => {
    const c = ctx.conditions as Record<string, boolean>;
    if (c.reduce) {
      // three static stacked blocks (CSS); the showcase renders its own final state under reduced motion
      document.documentElement.classList.remove('sj-motion');
      return;
    }
    document.documentElement.classList.add('sj-motion');
    return buildMotion(c.mobile ? MOBILE : DESKTOP);
  });

  function buildMotion(cfg: Cfg) {
    // ---------- state driven by the timeline ----------
    const st = { conv: 0, turn: 0, reach: 0, zoom: 0, focus: 0, centre: 0, fix: 0, smoke: 0, dog: 0, detail: 0 };
    // ---------- geometry ----------
    let W = 0, H = 0, sFill = 10;
    const figs = {} as { L: Fig; R: Fig };
    let P0: Pt = { x: 0, y: 0 }; // left chest at rest (world = screen at zoom 1)
    let eH: Pt = { x: 0, y: 0 }, eC: Pt = { x: 0, y: 0 }; // idle corrections (world px), measured at freeze
    let rimPx = 5, Lw = 0, Lh = 0, body: Pt = { x: 0, y: 0 }, k1 = 0.1, C0: Pt = { x: 0, y: 0 }, C1: Pt = { x: 0, y: 0 }, Cc: Pt = { x: 0, y: 0 };
    let cam = { s: 1, x: 0, y: 0 };

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
      const cDog = q('[data-sj-showcase] [data-ps-dogart] [data-dog]');
      // C's dog sits inside a scaled photo: its non-scaling rim stroke shows at rimW × that scale on screen
      rimPx = rimW * (cDog && cDog.offsetWidth ? r.width / cDog.offsetWidth : 1);
      if (r && r.width > 2) {
        k1 = r.width / Lw;
        C1 = { x: r.left - sr.left + r.width / 2, y: r.top - sr.top + r.height / 2 };
      } else {
        k1 = (Math.min(W, H) * 0.3) / Lw;
        C1 = { x: W / 2, y: H / 2 };
      }
      Cc = { x: cfg.dogCtrlX * W, y: lerp(C0.y, C1.y, 0.5) };
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
      // zoom at `fill`: the (possibly slightly rolled) chest window must cover the stage
      const rw = SMOKE_RECT.w * wL, rh = SMOKE_RECT.h * hL, co = Math.cos(ROLL_MAX), si = Math.sin(ROLL_MAX);
      sFill = (Math.max((W * co + H * si) / rw, (W * si + H * co) / rh) * 1.03) / (1 - 2 * FEATHER);
      measureDog();
    };

    // ---------- render ----------
    const figPose = (f: Fig, turn: number, conv: number, corr: Pt) => ({
      c: { x: lerp(f.c0.x, f.c1.x, conv) - corr.x, y: lerp(f.c0.y, f.c1.y, conv) - corr.y },
      rot: lerp(f.rot0, 0, turn),
    });
    const render = () => {
      const { L, R } = figs;
      if (!L) return;
      const pL = figPose(L, st.turn, st.conv, { x: 0, y: 0 });
      const pR = figPose(R, st.turn, st.conv, { x: eH.x * st.fix, y: eH.y * st.fix });
      for (const [f, p] of [[L, pL], [R, pR]] as const) {
        f.el.style.transform = `translate(${(p.c.x - f.w / 2).toFixed(2)}px, ${(p.c.y - f.h / 2).toFixed(2)}px) rotate(${p.rot.toFixed(3)}deg)`;
      }
      setReach(L.root, st.reach); setReach(R.root, st.reach);
      // camera: the left chest travels from its rest position to the stage centre while the scale grows
      const s = Math.exp(st.zoom * Math.log(sFill));
      const Pw = toWorld(L, L.chest, pL.c, pL.rot);
      Pw.x += eC.x * st.fix; Pw.y += eC.y * st.fix;
      // focus 0 = neutral camera (the chest is where the figure's own drift puts it), 1 = chest on the stage centre
      const tx = lerp(cfg.hold.x * W, W / 2, st.centre), ty = lerp(cfg.hold.y * H, H / 2, st.centre);
      const Q = { x: lerp(Pw.x, tx, st.focus), y: lerp(Pw.y, ty, st.focus) };
      cam = { s, x: Q.x - s * Pw.x, y: Q.y - s * Pw.y };
      const t = `translate(${cam.x.toFixed(2)}px, ${cam.y.toFixed(2)}px) scale(${s.toFixed(5)})`;
      for (const w of worlds) w.style.transform = t;
      smoke.style.opacity = st.smoke.toFixed(4);
      // dog: log-scale recede from cover (k = 1) to C's rect; its centre on a bezier (centre → left → middle)
      const e = st.dog;
      const k = Math.exp(lerp(0, Math.log(k1), e));
      const cx = bez(C0.x, Cc.x, C1.x, e), cy = bez(C0.y, Cc.y, C1.y, e);
      dogbox.style.transform = `translate(${(cx - (k * Lw) / 2).toFixed(2)}px, ${(cy - (k * Lh) / 2).toFixed(2)}px) scale(${k.toFixed(6)})`;
      dogRoot.style.setProperty('--dog-detail', st.detail.toFixed(3));
      // same on-screen rim thickness as C's frozen frame (the stroke ignores the SVG viewBox scale, not CSS scale)
      if (rim && st.detail > 0) rim.style.strokeWidth = `${(rimPx / k).toFixed(2)}px`;
    };

    // ---------- idle freeze for the contact (Agent A: setIdle(false) once the screen is going to smoke) ----------
    let frozen = false;
    const freeze = (on: boolean) => {
      if (on === frozen) return;
      frozen = on;
      setIdle(astroL, !on); setIdle(astroR, !on);
      if (!on) { eH = { x: 0, y: 0 }; eC = { x: 0, y: 0 }; render(); return; }
      // the idle pose is now fixed: measure how far it puts the hands / chest window from the model, once
      eH = { x: 0, y: 0 }; eC = { x: 0, y: 0 }; render();
      const sr = stage.getBoundingClientRect();
      const toW = (p: Pt): Pt => ({ x: (p.x - sr.left - cam.x) / cam.s, y: (p.y - sr.top - cam.y) / cam.s });
      const { L, R } = figs;
      const pL = figPose(L, st.turn, st.conv, { x: 0, y: 0 }), pR = figPose(R, st.turn, st.conv, { x: 0, y: 0 });
      const hl = toW(handPoint(astroL)), hr = toW(handPoint(astroR));
      const ml = toWorld(L, L.hand, pL.c, pL.rot), mr = toWorld(R, R.hand, pR.c, pR.rot);
      eH = { x: (hr.x - hl.x) - (mr.x - ml.x), y: (hr.y - hl.y) - (mr.y - ml.y) };
      const ob = smoke.getBoundingClientRect();
      const oc = toW({ x: ob.left + ob.width / 2, y: ob.top + ob.height / 2 });
      const mc = toWorld(L, L.chest, pL.c, pL.rot);
      eC = { x: oc.x - mc.x, y: oc.y - mc.y };
      render();
    };

    // ---------- the master timeline ----------
    const tl = gsap.timeline({ defaults: { ease: 'none' }, paused: true, onUpdate: () => { render(); sync(); } });
    const at = (f: number) => f * A;

    // act 1: approach. Everything starts on the first pixel of scroll and overlaps.
    tl.addLabel('hero', T.hero).addLabel('approach', T.approach);
    tl.to(hero, { autoAlpha: 0, y: -46, duration: at(0.24), ease: 'power2.in' }, 0);
    tl.set(worldL, { zIndex: 4 }, at(0.25)); // copy gone: the left figure (zoom target) is nearest the camera
    // the hands close the last ~1.5% visibly in the held two-shot; expo.out lands them within a pixel by ~0.88 of the
    // approach (still in frame) and exactly on `fill`
    tl.to(st, { conv: 0.95, duration: at(0.6), ease: 'power2.inOut' }, 0);
    tl.to(st, { conv: 0.985, duration: at(P.gapClose - 0.6), ease: 'sine.inOut' }, at(0.6));
    tl.to(st, { conv: 1, duration: at(1 - P.gapClose), ease: 'expo.out' }, at(P.gapClose));
    tl.to(st, { turn: 1, duration: at(P.turnDone - P.turnIn), ease: 'sine.inOut' }, at(P.turnIn));
    tl.to(st, { reach: 1, duration: at(P.reachDone - P.reachIn), ease: 'power2.inOut' }, at(P.reachIn));
    tl.to(st, { zoom: () => Math.log(cfg.sHold) / Math.log(sFill), duration: at(P.freeze), ease: 'power2.in' }, 0);
    // power4.in: the hands stay in frame while they meet, then the camera rushes into the chest smoke
    tl.to(st, { zoom: 1, duration: at(1 - P.freeze), ease: 'power4.in' }, at(P.freeze));
    tl.to(st, { focus: 1, duration: at(0.8), ease: 'power2.inOut' }, at(0.06));
    tl.to(st, { centre: 1, duration: at(1 - P.freeze), ease: 'power2.in' }, at(P.freeze));
    tl.to(st, { fix: 1, duration: at(1 - P.freeze), ease: 'sine.inOut' }, at(P.freeze));
    tl.to(st, { smoke: 1, duration: at(P.smokeDone - P.smokeIn), ease: 'power1.inOut' }, at(P.smokeIn));
    tl.fromTo(space, { scale: 1 }, { scale: 1.35, duration: A, ease: 'power2.in', transformOrigin: () => `${P0.x}px ${P0.y}px` }, 0);
    tl.addLabel('fill', T.fill);

    // act 2: section 2 (the smoke fades fairly quickly into the moving gradient while the copy staggers in)
    tl.addLabel('section2-in', T.s2in);
    tl.set(act2, { autoAlpha: 1 }, T.s2in);
    tl.fromTo(grad, { autoAlpha: 0 }, { autoAlpha: 1, duration: 0.24, ease: 'power1.inOut' }, T.s2in);
    tl.set(act1, { autoAlpha: 0 }, T.s2in + 0.26);
    tl.set(s2, { autoAlpha: 1 }, T.s2in);
    tl.fromTo(s2items, { autoAlpha: 0, y: 26 }, { autoAlpha: 1, y: 0, duration: 0.3, stagger: 0.09, ease: 'power2.out' }, T.s2in + 0.06);
    tl.addLabel('section2-hold', T.s2hold);

    // act 2: the dog. Copy out (reverse order); the gradient turns out to be the inside of a screen-covering dog.
    tl.addLabel('dog', T.dog);
    tl.to(s2items, { autoAlpha: 0, y: -20, duration: 0.24, stagger: { each: 0.035, from: 'end' }, ease: 'power2.in' }, T.dog);
    tl.set(s2, { autoAlpha: 0 }, T.dog + 0.45);
    tl.set([space2, dogwrap], { autoAlpha: 1 }, T.dog);
    tl.to(grad, { autoAlpha: 0, duration: T.dogMove - T.dogFade, ease: 'power1.inOut' }, T.dogFade);
    tl.to(st, { dog: 1, duration: T.dogEnd - T.dogMove, ease: 'power2.inOut' }, T.dogMove);
    tl.to(st, { detail: 1, duration: (T.dogEnd - T.dogMove) * 0.4, ease: 'power1.inOut' }, T.dogMove + (T.dogEnd - T.dogMove) * 0.25);

    // light: a thin beam from the centre to both edges, then the screen-wide flash
    tl.addLabel('beam', T.beam);
    tl.fromTo(beam, { opacity: 0 }, { opacity: 1, duration: 0.05 }, T.beam);
    tl.fromTo(beam, { scaleX: 0 }, { scaleX: 1, duration: 0.38, ease: 'expo.out' }, T.beam);
    tl.fromTo(bloom, { opacity: 0, scaleY: 0.02 }, { opacity: 1, scaleY: 1.6, duration: 0.3, ease: 'power2.in' }, T.flash - 0.3);
    tl.fromTo(flash, { opacity: 0 }, { opacity: 1, duration: 0.2, ease: 'power2.in' }, T.flash - 0.2);
    tl.addLabel('flash', T.flash);
    tl.set(act2, { autoAlpha: 0 }, T.flash);
    tl.to({}, { duration: T.end - T.flash }, T.flash);

    // ---------- discrete hand-offs: idle freeze, and the flash → act 3 (time-based, not scrubbed) ----------
    let flashed = false, dogStale = false;
    let fxFade: gsap.core.Tween | null = null;
    function sync() {
      const t = tl.time();
      freeze(t >= at(P.freeze)); // stays frozen while act 1 is hidden (no idle work off-stage)
      const past = t >= T.flash - 1e-4;
      if (past === flashed) return;
      flashed = past;
      fxFade?.kill();
      if (past) {
        showcase.play();
        fxFade = gsap.fromTo(fx, { opacity: 1 }, { opacity: 0, duration: 0.5, delay: 0.15, ease: 'power1.inOut' });
      } else {
        showcase.reset();
        gsap.set(fx, { opacity: 1 });
        if (dogStale) { dogStale = false; measureDog(); render(); }
      }
    }

    measure();
    render();
    const trigger = ScrollTrigger.create({
      id: 'space-journey',
      trigger: root,
      pin: stage,
      start: 'top top',
      end: () => `+=${Math.round(T.end * stage.offsetHeight * cfg.len)}`,
      scrub: 0.8,
      anticipatePin: 1,
      invalidateOnRefresh: true,
      refreshPriority: 10, // pin measured before every later ScrollTrigger (higher = earlier in GSAP 3.15)
      animation: tl,
      onRefresh: () => {
        measure();
        // the showcase is running: its dog rect is no longer the t=0 frame (the dog is hidden anyway); re-measure the
        // dog's end rect when reset() puts the frozen frame back
        if (flashed) dogStale = true;
        if (frozen) freeze(false); // sync() re-freezes and re-measures the idle corrections with the new geometry
        render(); sync();
      },
    });

    // verification handle (docs/journey/tools/b/*)
    (root as any).__sj = { tl, trigger, st, T, cfg, get geo() { return { W, H, sFill, Lw, k1, C0, C1, eH, eC, figs, cam }; } };

    return () => {
      fxFade?.kill();
      if (flashed) showcase.reset();
      if (frozen) { setIdle(astroL, true); setIdle(astroR, true); }
      [figL, figR, dogbox].forEach((el) => { el.style.transform = ''; el.style.width = ''; });
      worlds.forEach((w) => { w.style.transform = ''; });
      smoke.style.opacity = '';
      setReach(astroL, 0); setReach(astroR, 0);
      trigger.kill();
    };
  }

  // fonts and images change layout → re-measure once they settle
  document.fonts?.ready.then(() => ScrollTrigger.refresh());
  if (document.readyState !== 'complete') addEventListener('load', () => ScrollTrigger.refresh(), { once: true });
}
