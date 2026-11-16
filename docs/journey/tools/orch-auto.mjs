// Orchestrator's independent check of trigger-and-autoplay: ONE wheel per transition, frames sampled by time.
import { chromium } from 'playwright-core'; import sharp from 'sharp';
const [w, h, tag] = [+process.argv[2] || 1440, +process.argv[3] || 900, process.argv[4] || 'd'];
const b = await chromium.launch({ executablePath: '/usr/bin/google-chrome', args: ['--no-sandbox'] });
const p = await b.newPage({ viewport: { width: w, height: h } });
const errs = []; p.on('pageerror', e => errs.push(String(e))); p.on('console', m => { if (m.type() === 'error' && !/ERR_TUNNEL|Failed to load resource/.test(m.text())) errs.push(m.text()); });
await p.goto('http://localhost:4321/', { waitUntil: 'load' }); await p.waitForTimeout(2500);
await p.mouse.move(w / 2, h / 2);
const shots = []; const ys = [];
const snap = async (label) => { const o = `docs/journey/shots/orch/auto-${tag}-${shots.length}.png`; await p.screenshot({ path: o }); shots.push([o, label]); ys.push(await p.evaluate(() => scrollY)); };
const run = async (name, dy, times) => { const t0 = Date.now(); await p.mouse.wheel(0, dy); for (const t of times) { const wait = t * 1000 - (Date.now() - t0); if (wait > 0) await p.waitForTimeout(wait); await snap(`${name} t=${t}s`); } };
await snap('rest: hero');
await run('A', 120, [0.5, 1.5, 2.3, 2.8, 3.1, 3.4, 4.3, 6]);
await run('B', 120, [0.6, 1.4, 2.2, 3.0, 3.4, 3.65, 3.9, 4.5, 6, 9]);
await run('B back', -120, [0.8, 2.0, 4.0]);
await run('A back', -120, [1.0, 2.2, 4.0]);
console.log('scrollY samples max', Math.max(...ys), 'docH', await p.evaluate(() => document.documentElement.scrollHeight), 'errors', [...new Set(errs)].slice(0, 5));
await b.close();
const cols = w < 768 ? 9 : 5, tw = w < 768 ? 180 : 400, th = Math.round(tw * h / w), rows = Math.ceil(shots.length / cols);
const comps = []; for (let i = 0; i < shots.length; i++) { const buf = await sharp(shots[i][0]).resize(tw, th).toBuffer(); const x = (i % cols) * (tw + 4), yy = Math.floor(i / cols) * (th + 22); comps.push({ input: buf, left: x, top: yy + 18 }); comps.push({ input: Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${tw}" height="18"><rect width="100%" height="100%" fill="#222"/><text x="4" y="13" font-size="12" fill="#ff0" font-family="monospace">${shots[i][1]}</text></svg>`), left: x, top: yy }); }
await sharp({ create: { width: cols * (tw + 4), height: rows * (th + 22), channels: 3, background: '#444' } }).composite(comps).png().toFile(`docs/journey/shots/orch/auto-${tag}-sheet.png`);
