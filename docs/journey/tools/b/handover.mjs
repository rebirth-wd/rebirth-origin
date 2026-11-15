// Agent B: compare B's dog at the end of its move with C's frozen-frame dog.  node handover.mjs <w> <h> <outDir>
import { chromium } from 'playwright-core';
import sharp from 'sharp';
import fs from 'node:fs';
const [w, h, out] = process.argv.slice(2); fs.mkdirSync(out, { recursive: true });
const b = await chromium.launch({ executablePath: '/usr/bin/google-chrome', args: ['--no-sandbox'] });
const p = await b.newPage({ viewport: { width: +w, height: +h } });
await p.goto('http://localhost:4321/preview/journey', { waitUntil: 'load' });
await p.waitForTimeout(1500);
const y = await p.evaluate(() => { const r = document.querySelector('[data-sj]').__sj; return Math.round(r.trigger.start + (r.trigger.end - r.trigger.start) * (r.T.beam - 0.02) / r.T.end); });
for (let s = 0; s < y; s += 150) { await p.evaluate(v => scrollTo(0, v), s); await p.waitForTimeout(16); }
await p.evaluate(v => scrollTo(0, v), y); await p.waitForTimeout(2000);
const mine = await p.evaluate(() => { const a = document.querySelector('[data-sj-dogbox]').getBoundingClientRect(); return [a.left, a.top, a.width, a.height]; });
await p.screenshot({ path: `${out}/B-dog-end.png` });
// C's frame at t=0 of play() (paused there), B's layers hidden, flash hidden
const theirs = await p.evaluate(() => {
  const sc = document.querySelector('[data-sj-showcase] [data-phoneshowcase]');
  const r = document.querySelector('[data-sj]').__sj;
  r.trigger.disable(false); // freeze ScrollTrigger so it does not fight us
  document.querySelector('[data-sj-act2]').style.visibility = 'hidden';
  document.querySelector('[data-sj-fx]').style.opacity = '0';
  return import('/src/components/sections/phoneshowcase/controller.ts').then((m) => { const api = m.initPhoneShowcase(sc); api.seek(0); const a = sc.querySelector('[data-ps-dogart] [data-dog]').getBoundingClientRect(); return [a.left, a.top, a.width, a.height]; });
});
await p.waitForTimeout(300);
await p.screenshot({ path: `${out}/C-dog-t0.png` });
const [x, yy, ww, hh] = mine.map(Math.round); const pad = 40;
const crop = { left: Math.max(0, x - pad), top: Math.max(0, yy - pad), width: Math.min(+w - Math.max(0, x - pad), ww + 2 * pad), height: Math.min(+h - Math.max(0, yy - pad), hh + 2 * pad) };
const a = await sharp(`${out}/B-dog-end.png`).extract(crop).resize({ width: crop.width * 2 }).toBuffer();
const c = await sharp(`${out}/C-dog-t0.png`).extract(crop).resize({ width: crop.width * 2 }).toBuffer();
await sharp({ create: { width: crop.width * 4 + 10, height: crop.height * 2, channels: 3, background: '#f0f' } }).composite([{ input: a, left: 0, top: 0 }, { input: c, left: crop.width * 2 + 10, top: 0 }]).png().toFile(`${out}/compare.png`);
console.log(JSON.stringify({ mine: mine.map((v) => +v.toFixed(1)), theirs: theirs.map((v) => +v.toFixed(1)) }));
await b.close();
