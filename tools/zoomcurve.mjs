// Camera zoom over transition A on the built site (run `npm run build` first): samples the left world layer's scale
// every frame after one wheel tick and prints the zoom speed (log-scale units per second) in 0.1 s buckets.
// A bucket near 0 between the start and the end is a visible camera pause.
//   node tools/zoomcurve.mjs [width height]
import { chromium } from 'playwright-core';
import { readFile } from 'node:fs/promises';
import { extname, join } from 'node:path';

const DIST = new URL('../dist/', import.meta.url).pathname;
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.webp': 'image/webp', '.woff2': 'font/woff2', '.svg': 'image/svg+xml' };
const [w = 1440, h = 900] = process.argv.slice(2).map(Number);
const browser = await chromium.launch({ executablePath: '/usr/bin/google-chrome', args: ['--no-sandbox'] });
const page = await browser.newPage({ viewport: { width: w, height: h } });
await page.route('**/*', async (route) => {
  const path = new URL(route.request().url()).pathname;
  const file = join(DIST, path === '/' ? 'index.html' : path);
  try { await route.fulfill({ body: await readFile(file), contentType: TYPES[extname(file)] ?? 'application/octet-stream' }); }
  catch { await route.fulfill({ status: 404, body: '' }); }
});
await page.goto('http://sj.test/', { waitUntil: 'load' });
await page.waitForFunction(() => document.documentElement.classList.contains('sj-ready'));
await page.waitForTimeout(2500); // hero load-in
await page.evaluate(() => {
  const world = document.querySelector('[data-sj-world="left"]');
  const hands = () => ['left', 'right'].map((s) => document.querySelector(`[data-sj-fig="${s}"] [data-hand-marker]`).getBoundingClientRect());
  window.__z = [];
  const t0 = performance.now();
  const tick = () => {
    const m = new DOMMatrixReadOnly(getComputedStyle(world).transform);
    const [a, b] = hands();
    window.__z.push([(performance.now() - t0) / 1000, Math.hypot(m.a, m.b), Math.hypot(a.left - b.left, a.top - b.top) / Math.hypot(m.a, m.b)]);
    if (performance.now() - t0 < 3400) requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
});
await page.mouse.move(w / 2, h / 2);
await page.mouse.wheel(0, 120);
await page.waitForTimeout(3700);
const z = await page.evaluate(() => window.__z);
await browser.close();
const start = z.find((r, i) => i && r[1] > z[0][1] * 1.0005)?.[0] ?? 0;
console.log(`viewport ${w}x${h}; transition starts ${start.toFixed(2)} s after sampling began; final scale x${z.at(-1)[1].toFixed(1)}`);
console.log('  t (s)   scale   zoom speed   hand gap (world px)');
let min = Infinity;
for (let t = 0; t < 3.0 - 1e-9; t += 0.1) {
  const at = (x) => z.reduce((p, r) => (Math.abs(r[0] - start - x) < Math.abs(p[0] - start - x) ? r : p));
  const a = at(t), b = at(t + 0.1);
  const v = Math.log(b[1] / a[1]) / (b[0] - a[0]);
  if (t >= 1.0 && Number.isFinite(v) && b[1] < z.at(-1)[1] * 0.98) min = Math.min(min, v); // NaN = two samples in one frame
  console.log(`  ${t.toFixed(1)}-${(t + 0.1).toFixed(1)}  ${b[1].toFixed(2).padStart(6)}  ${v.toFixed(2).padStart(6)}  ${'#'.repeat(Math.max(0, Math.round(v * 6))).padEnd(30)} ${b[2].toFixed(0)}`);
}
console.log(`slowest zoom speed from 1.0 s until the screen is filled: ${min.toFixed(2)}`);
