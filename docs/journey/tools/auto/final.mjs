// Review frames of the space journey at fixed transition times, at 1440×900 and 390×844 (touch device).
//   node docs/journey/tools/auto/final.mjs [--base http://localhost:4321] [--out docs/journey/shots/final]
// Uses `/?journey=debug` (pause + step to an exact time; the overlay is hidden for the shot). Also prints, at the
// contact frame, the live gap between the two reaching fingertips (world px, from the DOM hand markers) and the
// darkest pixel below the navbar (the left chest window must fill the screen: no dark sky showing).
import { chromium } from 'playwright-core';
import sharp from 'sharp';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const repo = path.resolve(here, '../../../..');
const arg = (k, d) => { const i = process.argv.indexOf('--' + k); return i > -1 ? process.argv[i + 1] : d; };
const BASE = arg('base', 'http://localhost:4321');
const OUT = path.resolve(repo, arg('out', 'docs/journey/shots/final'));
const FRAMES = [
  ['01-approach', 'A', 2.5], ['02-approach-just-before-contact', 'A', 2.7], ['03-contact-full-smoke', 'A', 3.0],
  ['04-dog-mid-recede', 'B', 1.5], ['05-flash-building', 'B', 3.45], ['06-flash-peak', 'B', 3.6], ['07-appdesign-stars', 'app', 4.5],
];
const SIZES = [
  ['desktop-1440x900', { viewport: { width: 1440, height: 900 } }],
  ['phone-390x844', { viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true }],
];
fs.mkdirSync(OUT, { recursive: true });
const browser = await chromium.launch({ executablePath: '/usr/bin/google-chrome', args: ['--no-sandbox'] });
for (const [size, opts] of SIZES) {
  const ctx = await browser.newContext(opts);
  const p = await ctx.newPage();
  p.on('pageerror', (e) => console.log('PAGE ERROR', String(e)));
  await p.goto(`${BASE}/?journey=debug`, { waitUntil: 'load' });
  await p.waitForTimeout(2500);
  await p.addStyleTag({ content: '[data-sj-debug]{display:none!important}' });
  for (const [name, seg, t] of FRAMES) {
    const info = await p.evaluate(async ([seg, t]) => {
      const c = document.querySelector('[data-sj]').__sj.ctl;
      const raf = () => new Promise((r) => requestAnimationFrame(() => r()));
      c.setPaused(false);
      if (seg === 'app') { c.jump('section2'); c.setPaused(true); c.step(9); c.setPaused(false); return null; }
      c.jump(seg === 'A' ? 'hero' : 'section2'); c.setPaused(true); c.step(t);
      await raf(); await raf();
      const s = new DOMMatrix(getComputedStyle(document.querySelector('[data-sj-world="left"]')).transform).a;
      const hp = (w) => { const r = document.querySelector(`[data-sj-fig="${w}"] [data-hand-marker]`).getBoundingClientRect(); return [r.left, r.top]; };
      const a = hp('left'), b = hp('right');
      return seg === 'A' ? { t: c.local().t, scale: s, handGapWorldPx: Math.hypot(a[0] - b[0], a[1] - b[1]) / s } : null;
    }, [seg, t]);
    await p.waitForTimeout(seg === 'app' ? t * 1000 : 300);
    const file = path.join(OUT, `${size}-${name}.png`);
    await p.screenshot({ path: file });
    let extra = '';
    if (name.startsWith('03')) {
      const { data, info: im } = await sharp(file).greyscale().raw().toBuffer({ resolveWithObject: true });
      let min = 255; for (let y = 100; y < im.height; y++) for (let x = 0; x < im.width; x++) min = Math.min(min, data[y * im.width + x]);
      extra = `  darkest pixel below the navbar: ${min}`;
    }
    console.log(`${path.relative(repo, file)}${info ? `  t=${info.t.toFixed(2)} s  zoom ×${info.scale.toFixed(2)}  hand gap ${info.handGapWorldPx.toFixed(2)} world px` : ''}${extra}`);
  }
  await ctx.close();
}
await browser.close();
