// Orchestrator's independent check: one browser, scroll progressively through the real home page, capture frames.
import { chromium } from 'playwright-core'; import sharp from 'sharp';
const [w, h, tag] = [+process.argv[2] || 1440, +process.argv[3] || 900, process.argv[4] || 'd'];
const b = await chromium.launch({ executablePath: '/usr/bin/google-chrome', args: ['--no-sandbox'] });
const p = await b.newPage({ viewport: { width: w, height: h } });
const errs = []; p.on('pageerror', e => errs.push(String(e))); p.on('console', m => { if (m.type() === 'error' && !/ERR_TUNNEL|Failed to load resource/.test(m.text())) errs.push(m.text()); });
await p.goto('http://localhost:4321/', { waitUntil: 'load' }); await p.waitForTimeout(2500);
const info = await p.evaluate(() => { const st = window.ScrollTrigger; const s = document.querySelector('[data-spacejourney], section'); return { docH: document.documentElement.scrollHeight }; });
const fr = [0, .03, .08, .14, .2, .26, .3, .325, .34, .36, .4, .46, .55, .62, .66, .7, .74, .79, .84, .88, .9, .93];
const mult = w < 768 ? 5.82 : 7.1; const dist = mult * h; const shots = [];
let y = 0;
const go = async (t) => { while (y < t) { y = Math.min(t, y + 60); await p.evaluate(v => scrollTo(0, v), y); await p.waitForTimeout(16); } await p.waitForTimeout(1300); };
for (const f of fr) { await go(Math.round(f * dist)); const o = `docs/journey/shots/orch/${tag}-${String(Math.round(f * 1000)).padStart(4, '0')}.png`; await p.screenshot({ path: o }); shots.push([o, 'p=' + f]); }
// through the flash: scroll to just past it and sample by time
await go(Math.round(.985 * dist)); for (const [i, ms] of [[0, 0], [1, 250], [2, 500], [3, 1200], [4, 2500], [5, 5000]]) { if (i) await p.waitForTimeout(ms - [0, 0, 250, 500, 1200, 2500][i]); const o = `docs/journey/shots/orch/${tag}-flash${i}.png`; await p.screenshot({ path: o }); shots.push([o, 'flash+' + ms + 'ms(+1.3s)']); }
await go(Math.round(dist + h * .6)); let o = `docs/journey/shots/orch/${tag}-after1.png`; await p.screenshot({ path: o }); shots.push([o, 'after pin +0.6vh']);
await go(Math.round(dist + h * 1.6)); o = `docs/journey/shots/orch/${tag}-after2.png`; await p.screenshot({ path: o }); shots.push([o, 'after pin +1.6vh']);
// scroll back to section-2 hold and to rest
const back = async (t) => { while (y > t) { y = Math.max(t, y - 120); await p.evaluate(v => scrollTo(0, v), y); await p.waitForTimeout(16); } await p.waitForTimeout(1500); };
await back(Math.round(.55 * dist)); o = `docs/journey/shots/orch/${tag}-back-s2.png`; await p.screenshot({ path: o }); shots.push([o, 'BACK to p=.55']);
await back(0); o = `docs/journey/shots/orch/${tag}-back-0.png`; await p.screenshot({ path: o }); shots.push([o, 'BACK to 0']);
console.log(JSON.stringify(info), 'errors:', [...new Set(errs)].slice(0, 6));
await b.close();
const cols = w < 768 ? 8 : 5, tw = w < 768 ? 195 : 400, th = Math.round(tw * h / w), rows = Math.ceil(shots.length / cols);
const comps = []; for (let i = 0; i < shots.length; i++) { const buf = await sharp(shots[i][0]).resize(tw, th).toBuffer(); const x = (i % cols) * (tw + 4), yy = Math.floor(i / cols) * (th + 22); comps.push({ input: buf, left: x, top: yy + 18 }); comps.push({ input: Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${tw}" height="18"><rect width="100%" height="100%" fill="#222"/><text x="4" y="13" font-size="12" fill="#ff0" font-family="monospace">${shots[i][1]}</text></svg>`), left: x, top: yy }); }
await sharp({ create: { width: cols * (tw + 4), height: rows * (th + 22), channels: 3, background: '#444' } }).composite(comps).png().toFile(`docs/journey/shots/orch/${tag}-sheet.png`);
