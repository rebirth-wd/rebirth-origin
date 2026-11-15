// Agent B: frames in REAL TIME around the flash.  node docs/journey/tools/b/flash.mjs <w> <h> <outDir> [offsets s]
// Scrolls (in steps) to just past the `flash` label, polls until the playhead crosses it, then screenshots at the
// given offsets (seconds after the crossing; default 0,0.2,0.6,1.5,4) and builds a labelled sheet.
import { chromium } from 'playwright-core';
import sharp from 'sharp';
import fs from 'node:fs';
const [w, h, out, offs = '0,0.2,0.6,1.5,4'] = process.argv.slice(2);
fs.mkdirSync(out, { recursive: true });
const b = await chromium.launch({ executablePath: '/usr/bin/google-chrome', args: ['--no-sandbox'] });
const p = await b.newPage({ viewport: { width: +w, height: +h } });
await p.goto('http://localhost:4321/preview/journey', { waitUntil: 'load' });
await p.waitForTimeout(1500);
const y = await p.evaluate(() => { const r = document.querySelector('[data-sj]').__sj; return Math.round(r.trigger.start + (r.trigger.end - r.trigger.start) * (r.T.flash + 0.06) / r.T.end); });
for (let s = 0; s < y; s += 150) { await p.evaluate(v => scrollTo(0, v), s); await p.waitForTimeout(16); }
await p.evaluate(v => scrollTo(0, v), y);
await p.waitForFunction(() => { const r = document.querySelector('[data-sj]').__sj; return r.tl.time() >= r.T.flash; }, null, { polling: 'raf', timeout: 10000 });
const t0 = Date.now(); const files = [];
for (const o of offs.split(',').map(Number)) {
  const wait = t0 + o * 1000 - Date.now(); if (wait > 0) await p.waitForTimeout(wait);
  const f = `${out}/flash+${o.toFixed(1)}s.png`; await p.screenshot({ path: f }); files.push({ f, l: `flash +${o}s` });
}
const tw = 360, th = Math.round(tw * h / w), cols = Math.min(files.length, 5);
const comps = [];
for (const [i, it] of files.entries()) {
  comps.push({ input: await sharp(it.f).resize(tw, th).toBuffer(), left: (i % cols) * (tw + 4), top: Math.floor(i / cols) * (th + 26) + 22 });
  comps.push({ input: Buffer.from(`<svg width="${tw}" height="22"><rect width="100%" height="100%" fill="#000"/><text x="6" y="16" font-family="monospace" font-size="14" fill="#ff0">${it.l}</text></svg>`), left: (i % cols) * (tw + 4), top: Math.floor(i / cols) * (th + 26) });
}
await sharp({ create: { width: cols * (tw + 4), height: Math.ceil(files.length / cols) * (th + 26), channels: 3, background: '#333' } }).composite(comps).png().toFile(`${out}/sheet.png`);
console.log('ok', y);
await b.close();
