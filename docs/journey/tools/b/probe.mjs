// Agent B numeric probe: node docs/journey/tools/b/probe.mjs <w> <h> <t1,t2,...>
// For each master-timeline time t (vh units) scrolls there in steps, waits for the scrub, and prints:
// camera scale, live hand gap (px on screen), chest-marker position, smoke opacity and whether the smoke
// overlay's opaque core covers the viewport.
import { chromium } from 'playwright-core';
const [w, h, list] = process.argv.slice(2);
const b = await chromium.launch({ executablePath: '/usr/bin/google-chrome', args: ['--no-sandbox'] });
const p = await b.newPage({ viewport: { width: +w, height: +h } });
await p.goto('http://localhost:4321/preview/journey', { waitUntil: 'load' });
await p.waitForTimeout(1500);
let cur = 0;
for (const t of list.split(',').map(Number)) {
  const y = await p.evaluate((t) => { const r = document.querySelector('[data-sj]').__sj; return Math.round(r.trigger.start + (r.trigger.end - r.trigger.start) * t / r.T.end); }, t);
  const step = y > cur ? 150 : -150;
  for (let s = cur; step > 0 ? s < y : s > y; s += step) { await p.evaluate(v => scrollTo(0, v), s); await p.waitForTimeout(16); }
  await p.evaluate(v => scrollTo(0, v), y); cur = y;
  await p.waitForTimeout(1500);
  const out = await p.evaluate(() => {
    const r = document.querySelector('[data-sj]').__sj, g = r.geo;
    const hm = [...document.querySelectorAll('[data-sj-fig] [data-hand-marker]')].map(e => e.getBoundingClientRect());
    const cm = document.querySelector('[data-sj-fig="left"] [data-chest-marker]').getBoundingClientRect();
    const sm = document.querySelector('[data-sj-smoke]'), sb = sm.getBoundingClientRect();
    // core = inner 80% (feather 10%/side) of the AABB; fine for small roll
    const cx0 = sb.left + sb.width * 0.1, cx1 = sb.right - sb.width * 0.1, cy0 = sb.top + sb.height * 0.1, cy1 = sb.bottom - sb.height * 0.1;
    return {
      tl: +r.tl.time().toFixed(3), s: +g.cam.s.toFixed(2), sFill: +g.sFill.toFixed(2),
      gap: +Math.hypot(hm[0].x - hm[1].x, hm[0].y - hm[1].y).toFixed(1), handL: [Math.round(hm[0].x), Math.round(hm[0].y)],
      chest: [Math.round(cm.x), Math.round(cm.y)], smoke: +(+sm.style.opacity).toFixed(2),
      covers: cx0 <= 0 && cy0 <= 0 && cx1 >= innerWidth && cy1 >= innerHeight, eH: [g.eH.x.toFixed(1), g.eH.y.toFixed(1)], eC: [g.eC.x.toFixed(1), g.eC.y.toFixed(1)],
    };
  });
  console.log('t=' + t, JSON.stringify(out));
}
await b.close();
