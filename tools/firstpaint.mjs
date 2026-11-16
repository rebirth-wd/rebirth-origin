// First-paint check on the built site (run `npm run build` first): before the module JS has run, the App Design
// showcase (act 3) must not cover the hero; once it has run, the showcase must still appear at the appdesign stop.
//   node tools/firstpaint.mjs
import { chromium } from 'playwright-core';
import { readFile } from 'node:fs/promises';
import { extname, join } from 'node:path';

const DIST = new URL('../dist/', import.meta.url).pathname;
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.webp': 'image/webp', '.woff2': 'font/woff2', '.svg': 'image/svg+xml' };
const browser = await chromium.launch({ executablePath: '/usr/bin/google-chrome', args: ['--no-sandbox'] });
let failed = 0;
const check = (name, ok, got) => { if (!ok) failed++; console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${ok ? '' : `  (got ${JSON.stringify(got)})`}`); };

async function open(blockJs) {
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  await page.route('**/*', async (route) => {
    const path = new URL(route.request().url()).pathname;
    if (blockJs && path.endsWith('.js')) return route.abort();
    const file = join(DIST, path === '/' ? 'index.html' : path);
    try { await route.fulfill({ body: await readFile(file), contentType: TYPES[extname(file)] ?? 'application/octet-stream' }); }
    catch { await route.fulfill({ status: 404, body: '' }); }
  });
  await page.goto('http://sj.test/', { waitUntil: 'load' });
  return page;
}
// "shown" = the showcase headline is actually painted (hit-testing cannot tell: act 3 lets pointer events through)
const state = (page) => page.evaluate(() => {
  const sc = document.querySelector('[data-phoneshowcase]');
  const word = sc.querySelector('[data-ps-word]');
  const figs = [...document.querySelectorAll('[data-sj-fig] [data-astronaut]')].map((f) => f.checkVisibility({ visibilityProperty: true }));
  return { figs, visibility: getComputedStyle(sc).visibility, shown: word.checkVisibility({ visibilityProperty: true, opacityProperty: true }), ready: document.documentElement.classList.contains('sj-ready') };
});

// 1. module JS never arrives (= the moment before it runs on a slow connection)
let page = await open(true);
let s = await state(page);
check('before JS: showcase is hidden', s.visibility === 'hidden', s);
check('before JS: showcase headline is not painted over the hero', !s.shown, s);
check('before JS: the two figures are not painted (they are unpositioned until journey.ts runs)', s.figs.length === 2 && s.figs.every((v) => !v), s);
await page.close();

// 2. JS runs: hero first, showcase still reachable
page = await open(false);
await page.waitForFunction(() => document.documentElement.classList.contains('sj-ready'), null, { timeout: 5000 }).catch(() => {});
s = await state(page);
check('after JS: html.sj-ready set', s.ready, s);
check('after JS: both figures painted', s.figs.length === 2 && s.figs.every(Boolean), s);
check('after JS: showcase still hidden at the hero stop', s.visibility === 'hidden' && !s.shown, s);
await page.evaluate(() => document.querySelector('[data-sj-skip]').click());
await page.waitForTimeout(2500);
s = await state(page);
check('appdesign stop: showcase visible', s.visibility === 'visible' && s.shown, s);
await browser.close();
process.exit(failed ? 1 : 0);
