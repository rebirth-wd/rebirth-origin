// Phone showcase controller (act 3). Contract (docs/journey/SPEC.md, C -> B):
//   initPhoneShowcase(root) -> { play(), reset(), dogRect() }
// - After init (motion allowed) the root is visibility:hidden + inert, posed at the t=0 state.
// - play(): shows everything at t=0 with no fade (B's flash covers it), runs the ~3.9 s automatic sequence, then
//   leaves three seamless screen loops running. Calling it again while playing does nothing.
// - reset(): kills everything, restores the hidden t=0 pose instantly.
// - dogRect(): viewport rect of the dog in the centre phone's frozen frame at t=0 (valid before play()).
// Everything is one master timeline (loops nested as repeat:-1 children), so pausing (off-screen / hidden tab)
// is a single switch and any time can be rendered deterministically (seek, used by the preview page).
// Only transform / opacity / stroke-dashoffset are animated.
import gsap from 'gsap';
import { DATA_STATES } from './data';

export interface PhoneShowcase {
  play(): void;
  reset(): void;
  dogRect(): DOMRect;
  /** preview/debug: pause and render the sequence at time t (seconds after play()). */
  seek?(t: number): void;
}

const instances = new WeakMap<HTMLElement, PhoneShowcase>();
const IR = { immediateRender: false } as const;

/** Sequence timing (seconds from play()). */
export const T = {
  text: 0.12,
  recede: 0.5,
  chrome: 0.95,
  scroll: 1.75,
  tap: 2.5,
  sides: 2.68,
  sideStagger: 0.08,
  feedLoop: 3.45,
};

export function initPhoneShowcase(root: HTMLElement): PhoneShowcase {
  const existing = instances.get(root);
  if (existing) return existing;

  const q = <E extends Element = HTMLElement>(s: string, el: ParentNode = root) => el.querySelector(s) as E;
  const qa = <E extends Element = HTMLElement>(s: string, el: ParentNode = root) => Array.from(el.querySelectorAll(s)) as E[];

  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const dogEl = () => q('[data-ps-dogart] [data-dog]') ?? q('[data-ps-dogart]');

  if (reduce) {
    // Composed static final state (the markup's default); nothing hidden, nothing animated.
    const api: PhoneShowcase = { play() {}, reset() {}, dogRect: () => dogEl().getBoundingClientRect() };
    instances.set(root, api);
    return api;
  }

  // ---------- elements ----------
  const center = q('[data-ps-center]');
  const sideL = q('[data-ps-side="left"]');
  const sideR = q('[data-ps-side="right"]');
  const texts = qa('[data-ps-text],[data-ps-word]');
  const feed = q('[data-ps-feed]', center);
  const list = q('[data-ps-feedlist]', center);
  const post = (k: string) => q(`[data-ps-post="${k}"]`, center);
  const p1 = post('p1'), p2 = post('p2'), p3 = post('p3'), p1b = post('p1b'), p2b = post('p2b');
  const photo1 = q('[data-ps-photo]', p1);
  const status = q('[data-pf-status]', center);
  const feedTop = q('[data-ps-feedtop]', center);
  const feedTabs = q('[data-ps-feedtabs]', center);
  const p1chrome = qa('[data-ps-chrome]', p1);
  const later = [p2, p3, p1b, p2b];
  const dimL = q('[data-pf-dim]', sideL), dimR = q('[data-pf-dim]', sideR);

  let pre: gsap.Context | null = null;
  let run: gsap.Context | null = null;
  let master: gsap.core.Timeline | null = null;
  let playing = false;
  let frozen = false;
  let inView = true;

  // ---------- normalise CSS-authored transforms into GSAP's percent/rotation channels (once) ----------
  // The markup's static state uses CSS transforms (translateY(%), rotate()); GSAP would read those back as px.
  const setRoll = (els: HTMLElement[], onIdx: number) => els.forEach((el, i) => gsap.set(el, { y: 0, yPercent: i === onIdx ? 0 : 100, opacity: i === onIdx ? 1 : 0 }));
  gsap.set(list, { y: 0 });
  {
    const cam = q('[data-ps-camera]');
    const [el, er] = qa('[data-cm-ear]', cam);
    gsap.set(el, { svgOrigin: '42 57' }); gsap.set(er, { svgOrigin: '58 57' });
    gsap.set(q('[data-cm-fx="stardust"]', cam), { svgOrigin: '50 82' });
    gsap.set(q('[data-cm-person]', cam), { svgOrigin: '50 218' });
    gsap.set(q('[data-cm-track]', cam), { svgOrigin: '50 83' });
    gsap.set(qa('[data-cm-spark]', cam), { transformOrigin: '50% 50%' });
    gsap.set(qa('[data-dt-pulse]'), { transformOrigin: '50% 50%' });
  }
  qa('[data-ps-post]', center).forEach((p) => {
    const liked = p.classList.contains('is-liked');
    gsap.set(q('[data-ps-c-old]', p), { y: 0, yPercent: liked ? -100 : 0 });
    gsap.set(q('[data-ps-c-new]', p), { y: 0, yPercent: liked ? 0 : 100 });
  });
  setRoll(qa('[data-cm-label]'), 0);
  qa('[data-dt-roll]').forEach((r) => setRoll(Array.from(r.children) as HTMLElement[], 0));
  {
    const d0 = String(DATA_STATES[0].kpi).padStart(5, '0').split('').map(Number);
    qa('[data-dt-digit]').forEach((d, k) => { d.style.transform = ''; gsap.set(d, { y: 0, yPercent: -d0[k] * 10 }); });
    let start = 0;
    qa('[data-dt-seg]').forEach((s, k) => {
      s.style.transform = ''; s.style.transformOrigin = '';
      gsap.set(s, { rotation: -90 + start * 3.6, svgOrigin: '20 20' });
      start += DATA_STATES[0].donut[k];
    });
  }

  // ---------- t=0 pose (hidden) ----------
  function coverPose() {
    // Frozen frame: P1's photo scaled up to cover the whole screen, centred. Ratios only (all inner sizes are cqw),
    // so this stays right at any phone size.
    const fdH = feed.clientHeight;
    const ph = photo1.offsetHeight || 1;
    const top = list.offsetTop + p1.offsetTop + photo1.offsetTop;
    const scale = fdH / ph;
    const yPercent = ((fdH / 2 - (top + ph / 2)) / ph) * 100;
    return { scale, yPercent };
  }

  function applyPre() {
    pre?.revert();
    root.setAttribute('data-ps-armed', '');
    pre = gsap.context(() => {
      gsap.set(texts, { autoAlpha: 0, y: 18 });
      // start directly behind the centre phone (distance measured from layout; transforms don't affect offsetLeft)
      const w = sideL.offsetWidth || 1;
      gsap.set(sideL, { xPercent: ((center.offsetLeft - sideL.offsetLeft) / w) * 100, scale: 0.9, rotation: 0, autoAlpha: 0 });
      gsap.set(sideR, { xPercent: ((center.offsetLeft - sideR.offsetLeft) / w) * 100, scale: 0.9, rotation: 0, autoAlpha: 0 });
      gsap.set([dimL, dimR], { opacity: 0.6 });
      gsap.set(list, { yPercent: 0 });
      gsap.set(photo1, coverPose());
      gsap.set([status, feedTop, ...p1chrome, ...later], { autoAlpha: 0 });
      gsap.set(feedTabs, { yPercent: 100, autoAlpha: 0 });
      likedState(p2, false);
    }, root);
  }

  function likedState(p: HTMLElement, liked: boolean) {
    gsap.set(q('[data-ps-heart-f]', p), { scale: liked ? 1 : 0 });
    gsap.set(q('[data-ps-heart-o]', p), { opacity: liked ? 0 : 1 });
    gsap.set(q('[data-ps-c-old]', p), { y: 0, yPercent: liked ? -100 : 0, opacity: liked ? 0 : 1 });
    gsap.set(q('[data-ps-c-new]', p), { y: 0, yPercent: liked ? 0 : 100, opacity: liked ? 1 : 0 });
  }

  // ---------- heart tap (double-tap on the photo: ripple x2, big heart burst, small heart pop, count +1) ----------
  function heartTap(tl: gsap.core.Timeline, p: HTMLElement, at: number) {
    const rip = q('[data-ps-ripple]', p), big = q('[data-ps-bigheart]', p);
    const hf = q('[data-ps-heart-f]', p), ho = q('[data-ps-heart-o]', p);
    const cOld = q('[data-ps-c-old]', p), cNew = q('[data-ps-c-new]', p);
    tl.fromTo(rip, { scale: 0.3, opacity: 0.9 }, { scale: 1.2, opacity: 0, duration: 0.36, ease: 'power2.out', ...IR }, at)
      .fromTo(rip, { scale: 0.3, opacity: 0.9 }, { scale: 1.45, opacity: 0, duration: 0.42, ease: 'power2.out', ...IR }, at + 0.15)
      .fromTo(big, { scale: 0, opacity: 0, rotation: -14, yPercent: 0 }, { scale: 1.16, opacity: 1, rotation: 0, duration: 0.26, ease: 'back.out(2.6)', ...IR }, at + 0.17)
      .to(big, { scale: 1, duration: 0.18, ease: 'power2.out' }, at + 0.43)
      .to(big, { scale: 0.62, yPercent: -40, opacity: 0, duration: 0.32, ease: 'power2.in' }, at + 0.92)
      .fromTo(ho, { opacity: 1 }, { opacity: 0, duration: 0.06, ...IR }, at + 0.22)
      .fromTo(hf, { scale: 0 }, { scale: 1.32, duration: 0.16, ease: 'power2.out', ...IR }, at + 0.22)
      .to(hf, { scale: 1, duration: 0.42, ease: 'back.out(3.2)' }, at + 0.38)
      .to(cOld, { yPercent: -100, opacity: 0, duration: 0.26, ease: 'power2.in' }, at + 0.28)
      .fromTo(cNew, { yPercent: 100, opacity: 0 }, { yPercent: 0, opacity: 1, duration: 0.42, ease: 'power3.out', ...IR }, at + 0.36);
  }

  // ---------- centre loop: feed scrolls post to post, every arrival gets the heart tap ----------
  // Starts "at P2, liked" and ends "at P2-copy, liked": identical frames, so repeat:-1 has no visible seam.
  function feedLoop() {
    const tl = gsap.timeline({ repeat: -1 });
    const STEP = 2.9;
    const stops: [HTMLElement, number][] = [[p3, -40], [p1b, -60], [p2b, -80]];
    stops.forEach(([p, y], i) => {
      const b = i * STEP;
      tl.to(list, { yPercent: y, duration: 0.8, ease: 'power3.inOut' }, b + 1.1);
      heartTap(tl, p, b + 1.95);
    });
    tl.set({}, {}, stops.length * STEP);
    return tl;
  }

  // ---------- left loop: camera filters ----------
  function cameraLoop() {
    const cam = q('[data-ps-camera]');
    const strip = q('[data-cm-strip]', cam);
    const labels = qa('[data-cm-label]', cam);
    const fx = (k: string) => q(`[data-cm-fx="${k}"]`, cam);
    const order = ['stardust', 'bunny', 'dusk', 'shades'];
    const ears = qa('[data-cm-ear]', cam);
    const glint = q('[data-cm-glint]', cam);
    const tl = gsap.timeline({ repeat: -1 });
    const STEP = 2.4;
    const fxIn = (k: string, at: number) => {
      const el = fx(k);
      if (k === 'stardust') tl.fromTo(el, { opacity: 0, scale: 0.85 }, { opacity: 1, scale: 1, duration: 0.5, ease: 'power3.out', ...IR }, at);
      if (k === 'bunny') {
        tl.fromTo(el, { opacity: 0 }, { opacity: 1, duration: 0.15, ...IR }, at);
        tl.fromTo(ears[0], { scaleY: 0, rotation: -8 }, { scaleY: 1, rotation: 0, duration: 0.55, ease: 'back.out(2.2)', ...IR }, at);
        tl.fromTo(ears[1], { scaleY: 0, rotation: 8 }, { scaleY: 1, rotation: 0, duration: 0.55, ease: 'back.out(2.2)', ...IR }, at + 0.07);
        tl.to(ears[0], { rotation: -6, duration: 0.32, ease: 'sine.inOut', yoyo: true, repeat: 3 }, at + 0.65);
        tl.to(ears[1], { rotation: 6, duration: 0.32, ease: 'sine.inOut', yoyo: true, repeat: 3 }, at + 0.72);
      }
      if (k === 'dusk') tl.fromTo(el, { opacity: 0 }, { opacity: 1, duration: 0.6, ease: 'sine.inOut', ...IR }, at);
      if (k === 'shades') {
        tl.fromTo(el, { opacity: 0, y: -26 }, { opacity: 1, y: 0, duration: 0.55, ease: 'back.out(1.8)', ...IR }, at);
        tl.fromTo(glint, { x: 0 }, { x: 46, duration: 0.7, ease: 'power2.inOut', ...IR }, at + 0.6);
      }
    };
    const fxOut = (k: string, at: number) => {
      const el = fx(k);
      if (k === 'shades') tl.to(el, { opacity: 0, y: -16, duration: 0.25, ease: 'power2.in' }, at);
      else tl.to(el, { opacity: 0, duration: 0.25, ease: 'power2.in' }, at);
    };
    for (let i = 0; i < 4; i++) {
      const at = i * STEP + 1.6;
      const from = order[i], to = order[(i + 1) % 4];
      tl.to(strip, { xPercent: -((i + 1) * 100) / 12, duration: 0.55, ease: 'back.out(1.7)' }, at);
      tl.to(labels[i], { yPercent: -100, opacity: 0, duration: 0.22, ease: 'power2.in' }, at);
      tl.fromTo(labels[(i + 1) % 4], { yPercent: 100, opacity: 0 }, { yPercent: 0, opacity: 1, duration: 0.34, ease: 'power3.out', ...IR }, at + 0.14);
      fxOut(from, at);
      fxIn(to, at + 0.16);
    }
    tl.set({}, {}, 4 * STEP);
    return tl;
  }

  function cameraAmbient(tl: gsap.core.Timeline, at: number) {
    const cam = q('[data-ps-camera]');
    tl.to(q('[data-cm-ring]', cam), { scale: 1.06, duration: 1.2, ease: 'sine.inOut', yoyo: true, repeat: -1 }, at);
    tl.to(q('[data-cm-person]', cam), { rotation: 1.4, duration: 3.2, ease: 'sine.inOut', yoyo: true, repeat: -1 }, at);
    tl.to(q('[data-cm-bokeh]', cam), { x: 4, y: -6, duration: 5.5, ease: 'sine.inOut', yoyo: true, repeat: -1 }, at);
    tl.to(q('[data-cm-track]', cam), { scale: 1.03, opacity: 0.45, duration: 1.6, ease: 'sine.inOut', yoyo: true, repeat: -1 }, at);
    qa('[data-cm-spark]', cam).forEach((s, i) => {
      tl.fromTo(s, { scale: 0.45, opacity: 0.35 }, { scale: 1.1, opacity: 1, duration: 0.7 + (i % 3) * 0.23, ease: 'sine.inOut', yoyo: true, repeat: -1, ...IR }, at + i * 0.13);
    });
  }

  // ---------- right loop: data app refreshes between three range states ----------
  function dataLoop() {
    const dt = q('[data-ps-data]');
    const pill = q('[data-dt-pill]', dt);
    const digits = qa('[data-dt-digit]', dt);
    const rolls = qa('[data-dt-roll]', dt).map((r) => Array.from(r.children) as HTMLElement[]);
    const lines = qa('[data-dt-line]', dt), areas = qa('[data-dt-area]', dt), dots = qa('[data-dt-dot]', dt);
    const bars = qa('[data-dt-bar]', dt), segs = qa('[data-dt-seg]', dt);
    const tl = gsap.timeline({ repeat: -1 });
    const STEP = 2.8;
    const order = [1, 2, 0];
    let a = 0;
    order.forEach((b, i) => {
      const at = i * STEP + 1.7;
      const S = DATA_STATES[b];
      tl.to(pill, { xPercent: b * 100, duration: 0.45, ease: 'power3.inOut' }, at);
      const ds = String(S.kpi).padStart(5, '0').split('').map(Number);
      digits.forEach((d, k) => tl.to(d, { yPercent: -ds[k] * 10, duration: 0.7, ease: 'power3.inOut' }, at + 0.1 + (digits.length - 1 - k) * 0.03));
      rolls.forEach((r) => {
        tl.to(r[a], { yPercent: -100, opacity: 0, duration: 0.24, ease: 'power2.in' }, at + 0.12);
        tl.fromTo(r[b], { yPercent: 100, opacity: 0 }, { yPercent: 0, opacity: 1, duration: 0.4, ease: 'power3.out', ...IR }, at + 0.3);
      });
      // line: old fades, new draws in (dashoffset), area + end dot follow
      tl.to([lines[a], areas[a], dots[a]], { opacity: 0, duration: 0.3, ease: 'power2.in' }, at + 0.1);
      tl.fromTo(lines[b], { opacity: 1, strokeDashoffset: 1 }, { opacity: 1, strokeDashoffset: 0, duration: 1.0, ease: 'power2.inOut', ...IR }, at + 0.2);
      tl.fromTo(areas[b], { opacity: 0 }, { opacity: 1, duration: 0.6, ease: 'sine.out', ...IR }, at + 0.65);
      tl.fromTo(dots[b], { opacity: 0 }, { opacity: 1, duration: 0.25, ease: 'power2.out', ...IR }, at + 1.1);
      bars.forEach((bar, k) => tl.to(bar, { scaleY: S.bars[k], duration: 0.7, ease: 'back.out(1.3)' }, at + 0.2 + k * 0.045));
      let start = 0;
      segs.forEach((s, k) => {
        tl.to(s, { rotation: -90 + start * 3.6, strokeDashoffset: 100 - S.donut[k] + 1.2, duration: 0.9, ease: 'power3.inOut' }, at + 0.15);
        start += S.donut[k];
      });
      a = b;
    });
    tl.set({}, {}, order.length * STEP);
    return tl;
  }

  function dataAmbient(tl: gsap.core.Timeline, at: number) {
    const dt = q('[data-ps-data]');
    tl.fromTo(qa('[data-dt-pulse]', dt), { scale: 1, opacity: 0.55 }, { scale: 2.4, opacity: 0, duration: 1.4, ease: 'power2.out', repeat: -1, ...IR }, at);
    tl.to(q('[data-dt-live]', dt), { opacity: 0.25, duration: 0.7, ease: 'sine.inOut', yoyo: true, repeat: -1 }, at);
  }

  // ---------- master ----------
  function build() {
    const tl = gsap.timeline({ paused: true });
    // copy
    tl.to(texts, { autoAlpha: 1, y: 0, duration: 0.9, ease: 'expo.out', stagger: 0.07 }, T.text);
    // frozen frame recedes into the post photo (camera pull-back, then a soft settle)
    tl.to(photo1, { scale: 0.975, yPercent: 0, duration: 0.85, ease: 'power3.inOut' }, T.recede)
      .to(photo1, { scale: 1, duration: 0.45, ease: 'sine.out' }, T.recede + 0.85);
    // feed UI builds around it
    tl.to(status, { autoAlpha: 1, duration: 0.4, ease: 'power2.out' }, T.chrome)
      .fromTo(feedTop, { autoAlpha: 0, yPercent: -25 }, { autoAlpha: 1, yPercent: 0, duration: 0.55, ease: 'expo.out', ...IR }, T.chrome + 0.05)
      .fromTo(feedTabs, { yPercent: 100, autoAlpha: 1 }, { yPercent: 0, autoAlpha: 1, duration: 0.6, ease: 'expo.out', ...IR }, T.chrome + 0.1)
      .fromTo(p1chrome, { autoAlpha: 0, y: 6 }, { autoAlpha: 1, y: 0, duration: 0.5, ease: 'power3.out', stagger: 0.045, ...IR }, T.chrome + 0.1)
      .to(later, { autoAlpha: 1, duration: 0.4, ease: 'power2.out' }, T.chrome + 0.35);
    // scroll to the next post, double-tap its photo
    tl.to(list, { yPercent: -20, duration: 0.75, ease: 'power3.inOut' }, T.scroll);
    heartTap(tl, p2, T.tap);
    // side phones slide out from behind the centre phone (stagger 80 ms, overshoot, little rotation settling)
    const sides: [HTMLElement, HTMLElement, number][] = [[sideL, dimL, -1], [sideR, dimR, 1]];
    sides.forEach(([el, dim, dir], i) => {
      const at = T.sides + i * T.sideStagger;
      tl.set(el, { autoAlpha: 1 }, at)
        .to(el, { xPercent: 0, scale: 1, duration: 1.0, ease: 'back.out(1.35)' }, at)
        .to(el, { rotation: dir * 6, duration: 0.32, ease: 'power2.out' }, at)
        .to(el, { rotation: 0, duration: 0.7, ease: 'back.out(2)' }, at + 0.32)
        .to(dim, { opacity: 0, duration: 0.7, ease: 'power2.out' }, at + 0.1);
    });
    // loops (each starts the instant its phone appears)
    tl.add(cameraLoop(), T.sides);
    cameraAmbient(tl, T.sides);
    tl.add(dataLoop(), T.sides + T.sideStagger);
    dataAmbient(tl, T.sides + T.sideStagger);
    tl.add(feedLoop(), T.feedLoop);
    return tl;
  }

  // ---------- run control (off-screen / hidden tab => paused, CSS animations too) ----------
  function sync() {
    const go = playing && !frozen && inView && !document.hidden;
    root.toggleAttribute('data-ps-paused', playing && !go);
    if (master && master.paused() === go) master.paused(!go);
  }
  const io = new IntersectionObserver((entries) => { inView = entries[entries.length - 1].isIntersecting; sync(); }, { threshold: 0 });
  io.observe(root);
  document.addEventListener('visibilitychange', sync);

  let rz = 0;
  addEventListener('resize', () => {
    clearTimeout(rz);
    rz = window.setTimeout(() => { if (!playing) applyPre(); }, 150);
  });

  applyPre();

  const api: PhoneShowcase = {
    play() {
      if (playing) return;
      playing = true; frozen = false;
      run = gsap.context(() => { master = build(); }, root);
      root.removeAttribute('data-ps-armed');
      master!.play(0);
      sync();
    },
    reset() {
      playing = false; frozen = false;
      run?.revert(); run = null; master = null;
      root.removeAttribute('data-ps-paused');
      applyPre();
    },
    dogRect() {
      return dogEl().getBoundingClientRect();
    },
    seek(t: number) {
      if (!playing) api.play();
      frozen = true; // stays paused at t (sync() won't resume it)
      root.removeAttribute('data-ps-paused');
      master!.pause();
      master!.time(t);
    },
  };
  instances.set(root, api);
  return api;
}
