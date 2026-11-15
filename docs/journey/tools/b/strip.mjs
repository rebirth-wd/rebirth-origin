// Agent B verification strip: node tools/b/strip.mjs <w> <h> <outDir> <t1,t2,...|auto> [--settle ms]
// [--settle ms] [--jump]. t values are timeline positions in vh-units of the SpaceJourney master timeline (see journey.ts T).
import { chromium } from 'playwright-core';
import sharp from 'sharp';
import fs from 'node:fs';
const [w, h, out, list] = process.argv.slice(2);
const settle = +(process.argv.includes('--settle') ? process.argv[process.argv.indexOf('--settle') + 1] : 1300);
const jump = process.argv.includes('--jump'); // jump straight to each position (fast-scroll test)
fs.mkdirSync(out, { recursive: true });
const b = await chromium.launch({ executablePath: '/usr/bin/google-chrome', args: ['--no-sandbox'] });
const p = await b.newPage({ viewport: { width: +w, height: +h } });
const errs = []; p.on('pageerror', e => errs.push(String(e))); p.on('console', m => { if (m.type() === 'error') errs.push(m.text()); });
await p.goto('http://localhost:4321/preview/journey', { waitUntil: 'load' });
await p.waitForTimeout(1500);
const info = await p.evaluate(() => { const r = document.querySelector('[data-sj]').__sj; return { start: r.trigger.start, end: r.trigger.end, total: r.T.end }; });
const T = info.total;
const ts = list === 'auto' ? Array.from({ length: 13 }, (_, i) => +(i * T / 12).toFixed(3)) : list.split(',').map(Number);
let cur = 0; const files = [];
for (const t of ts) {
  const y = Math.round(info.start + (info.end - info.start) * (t / T));
  const step = y > cur ? 120 : -120;
  if (!jump) for (let s = cur; step > 0 ? s < y : s > y; s += step) { await p.evaluate(v => scrollTo(0, v), s); await p.waitForTimeout(16); }
  await p.evaluate(v => scrollTo(0, v), y); cur = y;
  await p.waitForTimeout(settle);
  const f = `${out}/${String(files.length).padStart(2, '0')}-t${t.toFixed(2)}.png`;
  await p.screenshot({ path: f }); files.push({ f, t, y });
}
// contact sheet
const tw = 360, th = Math.round(tw * h / w), cols = 4, rows = Math.ceil(files.length / cols);
const comps = [];
for (const [i, it] of files.entries()) {
  const img = await sharp(it.f).resize(tw, th).toBuffer();
  const label = Buffer.from(`<svg width="${tw}" height="22"><rect width="100%" height="100%" fill="#000"/><text x="6" y="16" font-family="monospace" font-size="14" fill="#ff0">t=${it.t} y=${it.y}</text></svg>`);
  comps.push({ input: img, left: (i % cols) * (tw + 4), top: Math.floor(i / cols) * (th + 26) + 22 });
  comps.push({ input: label, left: (i % cols) * (tw + 4), top: Math.floor(i / cols) * (th + 26) });
}
await sharp({ create: { width: cols * (tw + 4), height: rows * (th + 26), channels: 3, background: '#333' } }).composite(comps).png().toFile(`${out}/sheet.png`);
console.log(JSON.stringify(info), errs.length ? 'ERRORS ' + [...new Set(errs)].join('\n') : 'no errors');
await b.close();
