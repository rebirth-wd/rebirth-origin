import { chromium } from 'playwright-core';
const b = await chromium.launch({ executablePath: '/usr/bin/google-chrome', args: ['--no-sandbox'] });
const p = await b.newPage({ viewport: { width: 1440, height: 900 } });
await p.goto('http://localhost:4321/preview/journey', { waitUntil: 'load' });
await p.waitForTimeout(2000);
const r = await p.evaluate(() => {
  const sj = document.querySelector('[data-sj]').__sj; const g = sj.geo;
  const el = document.querySelector('[data-sj-showcase] [data-ps-dogart] [data-dog]');
  const a = el.getBoundingClientRect();
  const sr = document.querySelector('[data-sj-stage]').getBoundingClientRect();
  return { pre: [a.left, a.top, a.width, a.height].map(Math.round), stage:[sr.top,sr.height], k1: g.k1, Lw: g.Lw, C1: g.C1, endW: g.k1*g.Lw };
});
console.log(JSON.stringify(r));
await b.close();
