// Agent B robustness checks: resize / orientation mid-journey, post-pin reveals, reduced motion.
//   node docs/journey/tools/b/checks.mjs <outDir>
import { chromium } from 'playwright-core';
import sharp from 'sharp';
import fs from 'node:fs';
const out = process.argv[2]; fs.mkdirSync(out, { recursive: true });
const b = await chromium.launch({ executablePath: '/usr/bin/google-chrome', args: ['--no-sandbox'] });
const errs = [];
const page = async (opts) => { const p = await b.newPage(opts); p.on('pageerror', (e) => errs.push(String(e))); p.on('console', (m) => { if (m.type() === 'error' && !/ERR_TUNNEL|Failed to load resource/.test(m.text())) errs.push(m.text()); }); await p.goto('http://localhost:4321/preview/journey', { waitUntil: 'load' }); await p.waitForTimeout(1500); return p; };
const yAt = (p, t) => p.evaluate((t) => { const r = document.querySelector('[data-sj]').__sj; return Math.round(r.trigger.start + (r.trigger.end - r.trigger.start) * t / r.T.end); }, t);
const scrollSteps = async (p, from, to) => { const st = to > from ? 150 : -150; for (let s = from; st > 0 ? s < to : s > to; s += st) { await p.evaluate((v) => scrollTo(0, v), s); await p.waitForTimeout(16); } await p.evaluate((v) => scrollTo(0, v), to); };
const state = (p) => p.evaluate(() => { const r = document.querySelector('[data-sj]').__sj; const sc = document.querySelector('[data-phoneshowcase]'); return { t: +r.tl.time().toFixed(2), pinned: r.trigger.isActive, showcase: getComputedStyle(sc).visibility, fx: getComputedStyle(document.querySelector('[data-sj-fx]')).opacity, W: innerWidth, motion: document.documentElement.classList.contains('sj-motion') }; });
const shots = [];
const snap = async (p, name) => { const f = `${out}/${name}.png`; await p.screenshot({ path: f }); shots.push(f); return f; };

// 1) resize + orientation in the middle of the journey
{
  const p = await page({ viewport: { width: 1440, height: 900 } });
  let y = await yAt(p, 3.0); await scrollSteps(p, 0, y); await p.waitForTimeout(1500);
  console.log('desktop s2-hold', JSON.stringify(await state(p))); await snap(p, 'r1-1440-s2hold');
  await p.setViewportSize({ width: 390, height: 844 }); await p.waitForTimeout(2500);
  console.log('→390x844', JSON.stringify(await state(p))); await snap(p, 'r2-resized-390');
  y = await yAt(p, 6.98); await scrollSteps(p, await p.evaluate(() => scrollY), y); await p.waitForTimeout(2500);
  console.log('390 after flash', JSON.stringify(await state(p))); await snap(p, 'r3-390-after-flash');
  await p.setViewportSize({ width: 844, height: 390 }); await p.waitForTimeout(2500);
  console.log('→844x390 (landscape)', JSON.stringify(await state(p))); await snap(p, 'r4-landscape');
  y = await yAt(p, 6.2); await scrollSteps(p, await p.evaluate(() => scrollY), y); await p.waitForTimeout(2000);
  console.log('landscape back to 6.2', JSON.stringify(await state(p))); await snap(p, 'r5-landscape-dog');
  await p.setViewportSize({ width: 1440, height: 900 }); await p.waitForTimeout(2500);
  y = await yAt(p, 1.5); await scrollSteps(p, await p.evaluate(() => scrollY), y); await p.waitForTimeout(2000);
  console.log('1440 back to 1.5', JSON.stringify(await state(p))); await snap(p, 'r6-1440-approach');
  await p.evaluate(() => scrollTo(0, 0)); await p.waitForTimeout(2000);
  console.log('top', JSON.stringify(await state(p))); await snap(p, 'r7-1440-top');
  await p.close();
}
// 2) after the pin: the stage scrolls away; dummy reveals fire at their own positions (top crosses 85%)
{
  const p = await page({ viewport: { width: 1440, height: 900 } });
  const end = await p.evaluate(() => document.querySelector('[data-sj]').__sj.trigger.end);
  await scrollSteps(p, 0, end + 450); await p.waitForTimeout(1500);
  console.log('just past pin end', JSON.stringify(await state(p)), 'stage top', await p.evaluate(() => Math.round(document.querySelector('[data-sj-stage]').getBoundingClientRect().top)));
  await snap(p, 'p1-pin-released');
  const rev = await p.evaluate(() => [...document.querySelectorAll('.dummy-reveal')].map((el) => ({ id: el.dataset.reveal, docTop: Math.round(el.getBoundingClientRect().top + scrollY) })));
  let cur = end + 450;
  for (const r of rev) {
    const fire = r.docTop - 0.85 * 900; // where its ScrollTrigger should start
    for (const [label, y] of [['before', fire - 60], ['after', fire + 60]]) {
      await scrollSteps(p, cur, y); cur = y; await p.waitForTimeout(1000);
      const v = await p.evaluate((id) => { const el = document.querySelector(`[data-reveal="${id}"]`); return { revealed: el.dataset.revealed ?? 'unset', opacity: +(+getComputedStyle(el).opacity).toFixed(2) }; }, r.id);
      console.log(`reveal ${r.id} ${label} (y=${y})`, JSON.stringify(v));
    }
  }
  await snap(p, 'p2-reveal-last');
  await p.close();
}
// 3) reduced motion: three ordinary stacked blocks, full page
for (const [w, h] of [[1440, 900], [390, 844]]) {
  const p = await page({ viewport: { width: w, height: h }, reducedMotion: 'reduce' });
  await p.waitForTimeout(1000);
  console.log(`reduced ${w}`, JSON.stringify(await p.evaluate(() => ({ motion: document.documentElement.classList.contains('sj-motion'), pins: document.querySelectorAll('.pin-spacer').length, h: document.querySelector('[data-sj]').offsetHeight }))));
  await p.screenshot({ path: `${out}/reduced-${w}-full.png`, fullPage: true });
  await p.close();
}
// 4) no JS
{
  const ctx = await b.newContext({ viewport: { width: 1440, height: 900 }, javaScriptEnabled: false });
  const p = await ctx.newPage(); await p.goto('http://localhost:4321/preview/journey', { waitUntil: 'load' }); await p.waitForTimeout(1500);
  await p.screenshot({ path: `${out}/nojs-1440-full.png`, fullPage: true }); await ctx.close();
}
console.log(errs.length ? 'ERRORS\n' + [...new Set(errs)].join('\n') : 'no page errors');
const tw = 360; const comps = [];
for (const [i, f] of shots.entries()) { const m = await sharp(f).metadata(); const th = Math.round(tw * m.height / m.width); comps.push({ input: await sharp(f).resize(tw, th).toBuffer(), left: (i % 5) * (tw + 4), top: Math.floor(i / 5) * 820 }); }
await sharp({ create: { width: 5 * (tw + 4), height: Math.ceil(shots.length / 5) * 820, channels: 3, background: '#333' } }).composite(comps).png().toFile(`${out}/sheet.png`);
await b.close();
