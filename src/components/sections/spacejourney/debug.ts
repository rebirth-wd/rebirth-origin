// `?journey=debug` review aid for the Space Journey timings (loaded by journey.ts with a dynamic import ONLY when that
// URL parameter is present, so normal visitors get no extra code or DOM).
// Overlay: current stop, transition, transition-local time (s), active beat keys (names from timing.ts).
// Keys: P pause / resume · [ ] step −/+0.1 s while paused · R replay the current (or last) transition · 1 2 3 jump to
// hero / section2 / appdesign.
import gsap from 'gsap';
import type { JourneyCtl, Stop } from './journey';

export function mountDebug(handle: { ctl: JourneyCtl | null }) {
  const box = document.createElement('div');
  box.setAttribute('data-sj-debug', '');
  box.setAttribute('aria-hidden', 'true');
  box.style.cssText = [
    'position:fixed', 'left:12px', 'bottom:12px', 'z-index:100000', 'pointer-events:none',
    'font:12px/1.45 ui-monospace,SFMono-Regular,Menlo,monospace', 'color:#e9e6ff', 'background:rgba(8,8,16,.82)',
    'border:1px solid rgba(255,255,255,.18)', 'border-radius:8px', 'padding:8px 10px', 'min-width:250px', 'max-width:min(92vw,420px)',
    'white-space:pre-wrap', 'backdrop-filter:blur(6px)', '-webkit-backdrop-filter:blur(6px)',
  ].join(';');
  document.body.appendChild(box);

  let lastText = '';
  const draw = () => {
    const c = handle.ctl;
    if (!c) return;
    const r = c.running();
    const { name, t, len } = c.local();
    const dir = r ? (r.dir > 0 ? '▶ forward' : '◀ reverse') : 'at rest';
    const lines = [
      `stop        ${c.stop()}${r ? `  →  ${r.to}` : ''}`,
      `transition  ${r ? `${name} (${r.from} → ${r.to})` : `${name}  ${dir}`}${r ? `  ${dir}` : ''}`,
      `time        ${t.toFixed(2)} s / ${len.toFixed(2)} s${c.isPaused() ? '   ⏸ PAUSED' : ''}`,
      `beats       ${c.active().join(' ') || '–'}`,
      `last run    ${(() => { const l = c.last(); return l && l.ended ? `${l.name}${l.dir > 0 ? '+' : '−'} ${((l.ended - l.started) / 1000).toFixed(2)} s real` : '–'; })()}`,
      `keys        P pause  [ ] ±0.1s  R replay  1 2 3`,
    ];
    const text = lines.join('\n');
    if (text !== lastText) { box.textContent = text; lastText = text; }
  };
  gsap.ticker.add(draw);

  const stops: Record<string, Stop> = { '1': 'hero', '2': 'section2', '3': 'appdesign' };
  addEventListener('keydown', (e) => {
    const c = handle.ctl;
    if (!c || e.ctrlKey || e.metaKey || e.altKey) return;
    const k = e.key.toLowerCase();
    if (k === 'p') c.setPaused(!c.isPaused());
    else if (k === '[') c.step(-0.1);
    else if (k === ']') c.step(0.1);
    else if (k === 'r') c.replay();
    else if (stops[k]) c.jump(stops[k]);
    else return;
    e.preventDefault();
    e.stopPropagation();
  }, true);
}
