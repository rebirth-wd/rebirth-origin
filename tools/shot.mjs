// Screenshot the local build.  node tools/shot.mjs <path> <out.png> [--w 1440] [--h 800] [--y 0] [--full] [--sel css] [--wait 1500] [--dpr 1] [--hover css] [--js "code"]
import { chromium } from 'playwright-core';
const a = process.argv.slice(2); const path = a[0], out = a[1];
const opt = (k, d) => { const i = a.indexOf('--' + k); return i > -1 ? a[i + 1] : d; };
const has = (k) => a.includes('--' + k);
const b = await chromium.launch({ executablePath: '/usr/bin/google-chrome', args: ['--no-sandbox', '--autoplay-policy=no-user-gesture-required'] });
const p = await b.newPage({ viewport: { width: +opt('w', 1440), height: +opt('h', 800) }, deviceScaleFactor: +opt('dpr', 1) });
const errs = []; p.on('pageerror', e => errs.push(String(e))); p.on('console', m => { if (m.type() === 'error') errs.push(m.text()); });
await p.goto('http://localhost:' + (process.env.PORT || 4321) + path, { waitUntil: 'load' });
await p.waitForTimeout(800);
const y = +opt('y', 0);
if (y) { // scroll in steps so scroll-driven animations fire like a real user
  for (let s = 0; s < y; s += 200) { await p.evaluate(v => scrollTo(0, v), s); await p.waitForTimeout(30); }
  await p.evaluate(v => scrollTo(0, v), y);
}
if (opt('hover')) await p.hover(opt('hover'));
if (opt('js')) await p.evaluate(opt('js'));
await p.waitForTimeout(+opt('wait', 1500));
if (opt('sel')) await p.locator(opt('sel')).first().screenshot({ path: out });
else await p.screenshot({ path: out, fullPage: has('full') });
if (errs.length) console.log('PAGE ERRORS:\n' + [...new Set(errs)].slice(0, 10).join('\n'));
console.log('saved', out);
await b.close();
