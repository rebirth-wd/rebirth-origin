// Idle "floating in space" motion for <Dog/>: each leg turns about its joint by up to ~3.5 deg, the tail by up to
// ~6 deg, as two summed sines with incommensurate periods (4-9 s) and a random phase, so the limbs drift and
// never visibly loop. Paused while off-screen; never runs under prefers-reduced-motion or on data-dog-idle="false"
// (the frozen frame inside the phone).
// Sync groups: [data-dog] roots in one scope that share a data-dog-sync value move as one. The first root is the
// leader: it owns the one set of tweens, the visibility observer and the reduced-motion handling, and each tween
// writes the same rotation to the same-named data-dog-part in every root of the group. The others are followers with
// no tweens of their own. This keeps stacked copies of the dog (black knockout, white matte, detail overlay) together.
// Roots without data-dog-sync are a group of one, exactly as before.
// Tempo: the leader root's data-dog-tempo (default 1) divides every idle period when the tweens are built, so the
// dog can paddle faster where it is only on screen for a moment. setDogIdleAmp(root, n) multiplies every idle
// rotation of the root's group by n from the next tick on, whether or not the tweens exist yet.
import { gsap } from 'gsap';

// [amplitude deg, period s, amplitude deg, period s]
const IDLE: Record<string, [number, number, number, number]> = {
  'leg-front-near': [2.4, 6.3, 1.2, 4.1],
  'leg-front-far': [2.2, 7.1, 1.3, 4.6],
  'leg-hind-near': [2.3, 8.3, 1.2, 5.3],
  'leg-hind-far': [2.5, 7.7, 1.1, 4.4],
  tail: [4.0, 5.9, 2.0, 8.7],
};

interface State { roots: HTMLElement[]; tweens: gsap.core.Tween[] | null; running: boolean; visible: boolean; amp: number }
const states = new WeakMap<HTMLElement, State>();
const rm = typeof matchMedia !== 'undefined' ? matchMedia('(prefers-reduced-motion: reduce)') : null;

function build(roots: HTMLElement[], getAmp: () => number) {
  const tempo = Math.max(0.01, parseFloat(roots[0].dataset.dogTempo ?? '') || 1);
  const tweens: gsap.core.Tween[] = [];
  // parts are matched by name across every root of the group
  const byName = new Map<string, HTMLElement[]>();
  roots.forEach((r) => r.querySelectorAll<HTMLElement>('[data-dog-part]').forEach((el) => {
    const n = el.dataset.dogPart!;
    byName.set(n, [...(byName.get(n) ?? []), el]);
  }));
  byName.forEach((els, name) => {
    const c = IDLE[name];
    if (!c) return;
    const a = { r: 0, s: 0 };
    const set = gsap.quickSetter(els, 'rotation', 'deg') as (v: number) => void;
    const sine = (key: 'r' | 's', amp: number, period: number) => {
      const t = gsap.fromTo(a, { [key]: -amp }, {
        [key]: amp, duration: period / 2, ease: 'sine.inOut', repeat: -1, yoyo: true, paused: true,
        onUpdate: () => set((a.r + a.s) * getAmp()),
      });
      t.totalTime(Math.random() * period); // random phase (anywhere in one full back-and-forth)
      tweens.push(t);
    };
    const j = 0.9 + Math.random() * 0.2; // each dog drifts a little differently
    sine('r', c[0], c[1] * j / tempo);
    sine('s', c[2], c[3] * j / tempo);
  });
  return tweens;
}

function update(root: HTMLElement, s: State) {
  const want = s.visible && !rm?.matches && root.dataset.dogIdle !== 'false';
  if (want === s.running) return;
  s.running = want;
  if (want) (s.tweens ??= build(s.roots, () => s.amp)).forEach((t) => t.play());
  else s.tweens?.forEach((t) => t.pause());
}

export function initDogs(scope: ParentNode = document): void {
  const leaders = new Map<string, State>(); // sync value -> the group's leader state
  scope.querySelectorAll<HTMLElement>('[data-dog]').forEach((root) => {
    const key = root.dataset.dogSync;
    const lead = key ? leaders.get(key) : undefined;
    if (states.has(root)) { // already set up by an earlier call: it may still lead (or belong to) a group
      if (key && !lead) leaders.set(key, states.get(root)!);
      return;
    }
    if (root.dataset.dogIdle === 'false' || !root.querySelector('[data-dog-part]')) return;
    if (lead) { // follower: moved by the leader's tweens, no tweens or observer of its own
      lead.roots.push(root);
      states.set(root, lead);
      return;
    }
    const s: State = { roots: [root], tweens: null, running: false, visible: false, amp: 1 };
    states.set(root, s);
    if (key) leaders.set(key, s);
    new IntersectionObserver((es) => { s.visible = es[es.length - 1].isIntersecting; update(root, s); }, { rootMargin: '10%' }).observe(root);
    rm?.addEventListener?.('change', () => update(root, s));
  });
}

/** Multiply every idle rotation of the dog's group (the leader and its followers) by n; default 1, 0 = rest pose.
 *  Applied on the next tick of the idle tweens, also if they are not built yet. A follower addresses its group. */
export function setDogIdleAmp(root: HTMLElement, n: number): void {
  const s = states.get(root);
  if (s) s.amp = n;
}
