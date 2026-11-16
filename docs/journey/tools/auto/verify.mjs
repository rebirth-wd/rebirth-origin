// Space Journey (trigger-and-autoplay) verification.
//   node docs/journey/tools/auto/verify.mjs [--only frames|checks] [--base http://localhost:4321]
// Frames: loads `/`, ONE wheel → frames every 0.25 s through transition A (+1 s), one wheel → B (+4 s), then wheel up
// twice (B reversed, A reversed), at 1440×900 and 390×844 (touch device). JPEG frames + contact sheets go to
// docs/journey/shots/auto/<w>x<h>/. Checks: scroll lock, input bursts / fling inertia, keyboard, touch, resize,
// reduced motion, skip link, navbar, debug overlay, restore / native scroll below the stage (uses
// /preview/journey, which must exist while verifying), measured vs configured durations. Results:
// docs/journey/shots/auto/results.json.
import { chromium } from 'playwright-core';
import sharp from 'sharp';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const repo = path.resolve(here, '../../../..');
const OUT = path.join(repo, 'docs/journey/shots/auto');
const arg = (k, d) => { const i = process.argv.indexOf('--' + k); return i > -1 ? process.argv[i + 1] : d; };
const BASE = arg('base', 'http://localhost:4321');
const ONLY = arg('only', 'all');
const { TIMING, transitionLength } = await import(path.join(repo, 'src/components/sections/spacejourney/timing.ts'));
const LA = transitionLength(TIMING.A), LB = transitionLength(TIMING.B), RS = TIMING.global.reverseSpeed;
const FRAME = 1000 / 60;

fs.mkdirSync(OUT, { recursive: true });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const results = [];
const check = (name, pass, detail = '') => { results.push({ name, pass: !!pass, detail }); console.log(`${pass ? 'PASS' : 'FAIL'}  ${name}${detail ? '  — ' + detail : ''}`); };
const errors = [];

const browser = await chromium.launch({ executablePath: '/usr/bin/google-chrome', args: ['--no-sandbox'] });

// ------------------------------------------------------------------ helpers
const VIEWPORTS = {
  desktop: { viewport: { width: 1440, height: 900 } },
  mobile: { viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true, deviceScaleFactor: 1 },
};
async function open(kind, url = '/', extra = {}) {
  const ctx = await browser.newContext({ ...VIEWPORTS[kind], ...extra });
  // page-side monitor: max |scrollY| seen while locked (hero / section2 / any transition), start/arrive events
  await ctx.addInitScript(() => {
    const mon = (window.__mon = { maxLockedY: 0, lockedSamples: 0, events: [], raf: [] });
    const ctl = () => document.querySelector('[data-sj]')?.__sj?.ctl;
    const sample = () => { const c = ctl(); if (c && (c.running() || c.stop() !== 'appdesign')) { mon.maxLockedY = Math.max(mon.maxLockedY, Math.abs(window.scrollY)); mon.lockedSamples++; } };
    const tick = (ts) => { sample(); mon.raf.push(ts); if (mon.raf.length > 4000) mon.raf.splice(0, 1000); requestAnimationFrame(tick); };
    requestAnimationFrame(tick);
    addEventListener('scroll', sample, { capture: true, passive: true });
    addEventListener('DOMContentLoaded', () => {
      const root = document.querySelector('[data-sj]');
      root?.addEventListener('sj:start', (e) => mon.events.push({ type: 'start', t: performance.now(), ...e.detail }));
      root?.addEventListener('sj:arrive', (e) => mon.events.push({ type: 'arrive', t: performance.now(), stop: e.detail.stop }));
    });
  });
  const page = await ctx.newPage();
  page.on('pageerror', (e) => errors.push(`[${kind} ${url}] pageerror ${e}`));
  page.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') errors.push(`[${kind} ${url}] console.${m.type()} ${m.text()}`); });
  await page.goto(BASE + url, { waitUntil: 'load' });
  await page.waitForFunction(() => !!document.querySelector('[data-sj]')?.__sj?.ctl || document.documentElement.matches(':not(.sj-motion)'), null, { timeout: 15000 });
  await page.waitForTimeout(1200);
  if (!VIEWPORTS[kind].hasTouch) await page.mouse.move(VIEWPORTS[kind].viewport.width / 2, VIEWPORTS[kind].viewport.height / 2);
  return { ctx, page };
}
const S = (page) => page.evaluate(() => {
  const c = document.querySelector('[data-sj]').__sj.ctl;
  return { stop: c.stop(), run: c.running(), local: c.local(), runs: c.log.length, log: c.log, y: window.scrollY, locked: document.documentElement.classList.contains('sj-locked'), active: c.active() };
});
const waitRest = (page, stop, timeout = 12000) => page.waitForFunction((s) => { const c = document.querySelector('[data-sj]').__sj.ctl; return !c.running() && c.stop() === s; }, stop, { timeout, polling: 30 });
const mon = (page) => page.evaluate(() => window.__mon);
async function swipe(page, cdp, y0, y1, x = 195, steps = 12) {
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y: y0 }] });
  for (let i = 1; i <= steps; i++) { await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x, y: y0 + ((y1 - y0) * i) / steps }] }); await sleep(16); }
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
}

async function sheet(frames, file, w, h, cols) {
  const tw = w > h ? 300 : 150, th = Math.round((tw * h) / w), lh = 20;
  const rows = Math.ceil(frames.length / cols);
  const comps = [];
  for (const [i, f] of frames.entries()) {
    const x = (i % cols) * (tw + 4), y = Math.floor(i / cols) * (th + lh + 4);
    comps.push({ input: await sharp(f.file).resize(tw, th).toBuffer(), left: x, top: y + lh });
    const txt = f.label.replace(/&/g, '&amp;').replace(/</g, '&lt;');
    comps.push({ input: Buffer.from(`<svg width="${tw}" height="${lh}"><rect width="100%" height="100%" fill="#000"/><text x="4" y="14" font-family="monospace" font-size="${tw > 200 ? 12 : 10}" fill="#ff0">${txt}</text></svg>`), left: x, top: y });
  }
  await sharp({ create: { width: cols * (tw + 4), height: rows * (th + lh + 4), channels: 3, background: '#333' } }).composite(comps).png().toFile(file);
}

// ------------------------------------------------------------------ frames
async function frames(kind) {
  const { ctx, page } = await open(kind, '/');
  const { width: w, height: h } = VIEWPORTS[kind].viewport;
  const dir = path.join(OUT, `${w}x${h}`);
  fs.rmSync(dir, { recursive: true, force: true });
  fs.mkdirSync(dir, { recursive: true });
  const runs = [
    { name: 'A-forward', dy: 120, to: 'section2', after: 1000 },
    { name: 'B-forward', dy: 120, to: 'appdesign', after: 4000 },
    { name: 'B-reverse', dy: -120, to: 'section2', after: 1000 },
    { name: 'A-reverse', dy: -120, to: 'hero', after: 1000 },
  ];
  const timing = [];
  for (const r of runs) {
    await page.waitForTimeout(700); // past the arrival cool-down; a new gesture
    const list = [];
    const t0 = Date.now();
    await page.mouse.wheel(0, r.dy); // ONE wheel event
    let arrived = null;
    for (let k = 0; k < 400; k++) {
      const due = t0 + k * 250, wait = due - Date.now();
      if (wait > 0) await sleep(wait);
      const s = await S(page);
      const file = path.join(dir, `${r.name}-${String(k).padStart(2, '0')}.jpg`);
      await page.screenshot({ path: file, type: 'jpeg', quality: 72 });
      const el = (Date.now() - t0) / 1000;
      list.push({ file, label: `${el.toFixed(2)}s ${s.run ? `${s.local.name} t=${s.local.t.toFixed(2)}` : '@' + s.stop}` });
      if (!s.run && s.stop === r.to && arrived === null) arrived = Date.now();
      if (arrived !== null && Date.now() - arrived >= r.after) break;
    }
    await sheet(list, path.join(OUT, `sheet-${w}x${h}-${r.name}.png`), w, h, w > h ? 6 : 10);
    const s = await S(page);
    const lastRun = s.log[s.log.length - 1];
    timing.push({ name: r.name, ms: lastRun.ended - lastRun.started, frames: list.length });
    check(`[frames ${kind}] ${r.name}: one wheel → arrives at ${r.to}`, s.stop === r.to && !s.run, `runs so far ${s.runs}`);
  }
  const m = await mon(page);
  check(`[frames ${kind}] scrollY stays 0 at hero/section2 and during all transitions`, m.maxLockedY === 0, `max |scrollY| while locked = ${m.maxLockedY} over ${m.lockedSamples} samples`);
  check(`[frames ${kind}] exactly 4 transitions for 4 wheel events`, (await S(page)).runs === 4);
  await ctx.close();
  return timing;
}

// ------------------------------------------------------------------ measured durations (no screenshots while running)
async function durations(kind) {
  const { ctx, page } = await open(kind, '/');
  const out = [];
  const plan = [['A', 1, 'section2', LA], ['B', 1, 'appdesign', LB], ['B', -1, 'section2', LB / RS], ['A', -1, 'hero', LA / RS]];
  for (const [name, dir, to, cfgSec] of plan) {
    await page.waitForTimeout(700);
    const tw = await page.evaluate(() => performance.now());
    if (kind === 'mobile') {
      const cdp = await ctx.newCDPSession(page);
      await swipe(page, cdp, dir > 0 ? 640 : 200, dir > 0 ? 200 : 640);
    } else await page.mouse.wheel(0, dir * 120);
    await waitRest(page, to);
    const ev = (await mon(page)).events;
    const st = ev.filter((e) => e.type === 'start').pop(), ar = ev.filter((e) => e.type === 'arrive').pop();
    const ms = ar.t - st.t;
    // the real frame that straddles the configured end: arrival can only be seen on the first frame after it
    const raf = (await mon(page)).raf, endT = st.t + cfgSec * 1000;
    const after = raf.find((x) => x >= endT) ?? ar.t, before = [...raf].reverse().find((x) => x < endT) ?? endT;
    const straddle = after - before;
    const gaps = raf.filter((x) => x > st.t && x <= ar.t).map((x, i, a) => (i ? x - a[i - 1] : 0));
    out.push({ kind, run: `${name}${dir > 0 ? '+' : '-'}`, input: kind === 'mobile' ? 'swipe' : 'wheel', configured: +(cfgSec * 1000).toFixed(1), measured: +ms.toFixed(1), diff: +(ms - cfgSec * 1000).toFixed(1), endFrameMs: +straddle.toFixed(1), worstFrameMs: +Math.max(...gaps).toFixed(1), inputToStart: +(st.t - tw).toFixed(1) });
    const okDur = Math.abs(ms - cfgSec * 1000) <= 2 * FRAME + 1 || (ms - cfgSec * 1000 >= 0 && ms - cfgSec * 1000 <= straddle + FRAME + 1);
    check(`[duration ${kind}] ${name}${dir > 0 ? ' forward' : ' reverse'} ${ms.toFixed(0)} ms vs ${(cfgSec * 1000).toFixed(0)} ms configured`, okDur, `diff ${(ms - cfgSec * 1000).toFixed(1)} ms; the real frame straddling the configured end lasted ${straddle.toFixed(1)} ms`);
  }
  await ctx.close();
  return out;
}

// ------------------------------------------------------------------ checks
async function checks() {
  // ---- burst of 30 wheel events during a transition + fling inertia spanning the arrival
  {
    const { ctx, page } = await open('desktop', '/');
    await page.mouse.wheel(0, 120);
    await page.waitForTimeout(600);
    for (let i = 0; i < 30; i++) { await page.mouse.wheel(0, i % 3 === 0 ? -120 : 120); await sleep(8); }
    await waitRest(page, 'section2');
    let s = await S(page);
    const ms = s.log[0].ended - s.log[0].started;
    check('[burst] 30 wheel events (mixed directions) during A: no skip, no queue, no double trigger', s.runs === 1 && s.stop === 'section2' && Math.abs(ms - LA * 1000) < 2 * FRAME + 1, `runs ${s.runs}, A took ${ms.toFixed(0)} ms`);
    await page.waitForTimeout(1000);
    s = await S(page);
    check('[burst] nothing queued after arrival', s.runs === 1 && s.stop === 'section2' && !s.run);
    // a trackpad fling: one continuous wheel stream (every 16 ms, decaying) lasting longer than transition B
    const flingStart = Date.now();
    let d = 60;
    while (Date.now() - flingStart < (LB + 1.5) * 1000) { await page.mouse.wheel(0, Math.max(1, Math.round(d))); d *= 0.995; await sleep(16); }
    s = await S(page);
    check('[fling] one inertia stream longer than B triggers exactly one transition', s.runs === 2 && s.stop === 'appdesign' && !s.run, `runs ${s.runs}, stop ${s.stop}`);
    const m = await mon(page);
    check('[burst+fling] scrollY 0 while locked', m.maxLockedY === 0, `max ${m.maxLockedY}`);
    await ctx.close();
  }

  // ---- keyboard
  {
    const { ctx, page } = await open('desktop', '/');
    const seq = [];
    const press = async (k, expect) => {
      await page.waitForTimeout(600);
      await page.keyboard.press(k);
      await page.waitForTimeout(250);
      const s = await S(page);
      seq.push(`${k}→${s.run ? s.run.name + (s.run.dir > 0 ? '+' : '-') : 'rest@' + s.stop}`);
      for (let i = 0; i < 5; i++) await page.keyboard.press(k); // ignored while running
      if (expect) await waitRest(page, expect);
    };
    await press('ArrowUp', null); // at hero: no previous stop
    await press('ArrowDown', 'section2');
    await press('Space', 'appdesign');
    await press('Home', 'section2');
    await press('PageUp', 'hero');
    await press('PageDown', 'section2');
    await press('End', 'appdesign');
    await press('Shift+Space', 'section2');
    await press('ArrowUp', 'hero');
    const s = await S(page);
    const runs = s.log.map((r) => `${r.name}${r.dir > 0 ? '+' : '-'}`).join(' ');
    check('[keyboard] ArrowDown/Space/PageDown/End forward, Home/PageUp/Shift+Space/ArrowUp back, one transition per key press (+5 ignored presses each)', runs === 'A+ B+ B- A- A+ B+ B- A-', `${seq.join(', ')} | log: ${runs}`);
    check('[keyboard] scrollY 0 while locked', (await mon(page)).maxLockedY === 0);
    // Tab order: navbar → skip link → hero CTA → leaves the page (not trapped)
    await page.keyboard.press('Tab');
    const order = [];
    for (let i = 0; i < 16; i++) {
      order.push(await page.evaluate(() => { const a = document.activeElement; return a === document.body || !a ? 'BODY' : (a.getAttribute('data-sj-skip') !== null ? 'SKIP' : a.textContent.trim().slice(0, 16) || a.tagName); }));
      await page.keyboard.press('Tab');
    }
    check('[a11y] Tab reaches navbar, skip link and hero CTA, and is not trapped', order.includes('SKIP') && order.some((t) => /Get Started/i.test(t)) && (order.includes('BODY') || new Set(order).size < order.length), order.join(' | '));
    check('[a11y] tabbing did not move the journey', (await S(page)).stop === 'hero');
    await ctx.close();
  }

  // ---- touch (390×844, touch device): one swipe = one transition, scrollY stays 0
  {
    const { ctx, page } = await open('mobile', '/');
    const cdp = await ctx.newCDPSession(page);
    await swipe(page, cdp, 640, 200); // finger up = next
    await page.waitForTimeout(300);
    let s = await S(page);
    const started = s.run?.name;
    await swipe(page, cdp, 640, 200); await swipe(page, cdp, 200, 640); // during the transition: ignored
    await waitRest(page, 'section2');
    s = await S(page);
    check('[touch] one swipe up at hero → exactly one transition (A); swipes during it ignored', started === 'A' && s.runs === 1 && s.stop === 'section2', `runs ${s.runs}`);
    await page.waitForTimeout(700);
    await swipe(page, cdp, 200, 640); // finger down = previous
    await page.waitForTimeout(300);
    s = await S(page);
    const rev = s.run && s.run.name === 'A' && s.run.dir === -1;
    await waitRest(page, 'hero');
    await page.waitForTimeout(700);
    await swipe(page, cdp, 300, 294); // 6px, below the 10px tolerance: a tap-sized move must not trigger
    await page.waitForTimeout(400);
    s = await S(page);
    check('[touch] swipe down at section2 → A reversed; tiny move ignored', rev && s.runs === 2 && s.stop === 'hero');
    check('[touch] scrollY 0 while locked', (await mon(page)).maxLockedY === 0);
    // tap on the hero CTA still produces a click (Observer must not swallow taps)
    const r = await page.evaluate(() => { const a = document.querySelector('[data-sj-hero] a[href="/contact"]'); const b = a.getBoundingClientRect(); return { x: b.x + b.width / 2, y: b.y + b.height / 2 }; });
    const got = page.evaluate(() => new Promise((res) => { const a = document.querySelector('[data-sj-hero] a[href="/contact"]'); a.addEventListener('click', (e) => { e.preventDefault(); res(true); }, { once: true }); setTimeout(() => res(false), 2000); }));
    await page.touchscreen.tap(r.x, r.y);
    check('[touch] tap on the hero CTA at the hero stop fires its click', await got);
    // orientation change at a stop
    await page.setViewportSize({ width: 844, height: 390 });
    await page.waitForTimeout(800);
    s = await S(page);
    check('[touch] rotate to landscape at hero keeps the hero stop', s.stop === 'hero' && !s.run && s.y === 0);
    await ctx.close();
  }

  // ---- resize at a stop; dog alignment with the showcase frame before / after resize
  {
    const { ctx, page } = await open('desktop', '/');
    const align = () => page.evaluate(() => {
      const c = document.querySelector('[data-sj]').__sj.ctl;
      const back = c.stop();
      c.setPaused(true);
      if (back === 'hero') c.jump('section2');
      for (let i = 0; i < 34; i++) c.step(0.1); // B at 3.4 s: the dog has landed, before the flash peak
      const a = document.querySelector('[data-sj-dogbox] [data-dog]').getBoundingClientRect();
      const b = document.querySelector('[data-sj-showcase] [data-ps-dogart] [data-dog]').getBoundingClientRect();
      c.jump(back); c.setPaused(false);
      return { dx: +(a.x - b.x).toFixed(2), dy: +(a.y - b.y).toFixed(2), dw: +(a.width - b.width).toFixed(2), w: +b.width.toFixed(1) };
    });
    const ok = (a) => Math.abs(a.dx) < 1 && Math.abs(a.dy) < 1 && Math.abs(a.dw) < 1;
    let a0 = await align();
    check('[dogRect] dog lands on the showcase frozen frame (1440×900)', ok(a0), JSON.stringify(a0));
    await page.waitForTimeout(600); // align() ends with jump(): wait out the arrival cool-down
    await page.mouse.wheel(0, 120);
    await waitRest(page, 'section2');
    await page.setViewportSize({ width: 1100, height: 760 });
    await page.waitForTimeout(800);
    let s = await S(page);
    check('[resize] 1440×900 → 1100×760 at section2 keeps section2', s.stop === 'section2' && !s.run && s.y === 0);
    await page.screenshot({ path: path.join(OUT, 'resize-section2-1100x760.jpg'), type: 'jpeg', quality: 75 });
    a0 = await align();
    check('[dogRect] still aligned after the resize (1100×760)', ok(a0), JSON.stringify(a0));
    await page.waitForTimeout(600);
    // resize DURING a transition: finishes, then re-measures
    await page.waitForTimeout(600);
    await page.mouse.wheel(0, 120);
    await page.waitForTimeout(400);
    await page.setViewportSize({ width: 1280, height: 800 });
    await waitRest(page, 'appdesign');
    await page.waitForTimeout(500);
    s = await S(page);
    check('[resize] resize mid-B: B completes at appdesign', s.stop === 'appdesign' && s.runs === 2);
    await page.screenshot({ path: path.join(OUT, 'resize-midB-appdesign-1280x800.jpg'), type: 'jpeg', quality: 75 });
    // resize at appdesign, then reverse: the dog end rect is re-measured when the showcase is reset
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.waitForTimeout(800);
    await page.mouse.wheel(0, -120);
    await waitRest(page, 'section2');
    a0 = await align();
    check('[dogRect] aligned after resize at appdesign + reverse (1440×900)', ok(a0), JSON.stringify(a0));
    check('[resize] scrollY 0 while locked', (await mon(page)).maxLockedY === 0);
    await ctx.close();
  }

  // ---- reduced motion: unchanged (three stacked blocks, nothing locked, native scroll)
  {
    const { ctx, page } = await open('desktop', '/', { reducedMotion: 'reduce' });
    const r = await page.evaluate(() => ({ cls: document.documentElement.className, ov: getComputedStyle(document.documentElement).overflow, h: document.documentElement.scrollHeight, vh: innerHeight, ctl: !!document.querySelector('[data-sj]').__sj?.ctl }));
    await page.mouse.wheel(0, 600);
    await page.waitForTimeout(500);
    const y = await page.evaluate(() => scrollY);
    check('[reduced motion] no lock, no controller, page scrolls natively through three stacked blocks', !/sj-(locked|motion)/.test(r.cls) && r.ov !== 'hidden' && r.h > r.vh * 2.5 && !r.ctl && y > 0, `${JSON.stringify(r)} scrollY after wheel ${y}`);
    await page.screenshot({ path: path.join(OUT, 'reduced-motion-full.jpg'), type: 'jpeg', quality: 60, fullPage: true });
    await ctx.close();
  }

  // ---- skip intro, navbar + CTA hit-testing, dropdown at every stop
  {
    const { ctx, page } = await open('desktop', '/');
    const hit = () => page.evaluate(() => {
      const at = (el) => { const b = el.getBoundingClientRect(); const e = document.elementFromPoint(b.x + b.width / 2, b.y + b.height / 2); return !!e && (e === el || el.contains(e)); };
      const navLinks = Array.from(document.querySelectorAll('[data-section="Navbar"] a, [data-section="Navbar"] button')).filter((e) => e.getBoundingClientRect().width > 0 && getComputedStyle(e).visibility === 'visible'); // closed dropdown links are visibility:hidden
      const cta = document.querySelector('[data-sj-hero] a[href="/contact"]');
      return { nav: navLinks.every(at), navCount: navLinks.length, cta: cta && getComputedStyle(cta).visibility === 'visible' ? at(cta) : null };
    });
    const dd = async () => {
      await page.hover('[data-rbnav-dd-toggle]');
      await page.waitForTimeout(500);
      const v = await page.evaluate(() => { const l = document.querySelector('.rbnav-dd-link'); const b = l.getBoundingClientRect(); const e = document.elementFromPoint(b.x + b.width / 2, b.y + b.height / 2); return b.height > 0 && (e === l || l.contains(e)); });
      await page.mouse.move(700, 600);
      await page.waitForTimeout(300);
      return v;
    };
    let h = await hit();
    check('[navbar] hero stop: every navbar control and the hero CTA are hit-testable (clickable)', h.nav && h.cta === true, JSON.stringify(h));
    check('[navbar] hero stop: Services dropdown opens on hover and its links are on top', await dd());
    await page.mouse.wheel(0, 120);
    await waitRest(page, 'section2');
    h = await hit();
    check('[navbar] section2 stop: navbar clickable + dropdown', h.nav && (await dd()), JSON.stringify(h));
    // skip link: focus it, press Enter → appdesign final state, no transition, focus on the showcase title
    await page.evaluate(() => document.querySelector('[data-sj]').__sj.ctl.jump('hero'));
    await page.waitForTimeout(500);
    const before = (await S(page)).runs;
    await page.focus('[data-sj-skip]');
    await page.waitForTimeout(100);
    const vis = await page.evaluate(() => { const b = document.querySelector('[data-sj-skip]').getBoundingClientRect(); return { w: b.width, h: b.height }; });
    await page.screenshot({ path: path.join(OUT, 'skip-link-focused-1440.jpg'), type: 'jpeg', quality: 80, clip: { x: 0, y: 0, width: 720, height: 300 } });
    const hidden = await page.evaluate(() => { document.activeElement.blur(); const b = document.querySelector('[data-sj-skip]').getBoundingClientRect(); return b.width <= 1 && b.height <= 1; });
    await page.focus('[data-sj-skip]');
    await page.keyboard.press('Enter');
    await page.waitForTimeout(150);
    const s = await S(page);
    const foc = await page.evaluate(() => document.activeElement?.id);
    check('[skip] visually hidden until focused; Enter jumps straight to appdesign (no transition), focus on the App Design title', hidden && vis.w > 40 && s.stop === 'appdesign' && !s.run && s.runs === before && !s.locked && foc === 'ps-title', `focused size ${vis.w}×${vis.h}, focus #${foc}`);
    await page.waitForTimeout(400);
    await page.screenshot({ path: path.join(OUT, 'skip-appdesign-1440.jpg'), type: 'jpeg', quality: 75 });
    h = await hit();
    check('[navbar] appdesign stop: navbar clickable + dropdown', h.nav && (await dd()), JSON.stringify(h));
    await ctx.close();
  }

  // ---- debug overlay
  {
    const { ctx, page } = await open('desktop', '/');
    const none = await page.evaluate(() => ({ nodes: document.querySelectorAll('[data-sj-debug]').length, all: document.body.querySelectorAll('*').length }));
    await ctx.close();
    const o = await open('desktop', '/?journey=debug');
    const p = o.page;
    await p.waitForSelector('[data-sj-debug]');
    await p.keyboard.press('p');
    for (let i = 0; i < 25; i++) await p.keyboard.press(']'); // 2.5 s into A, paused
    await p.keyboard.press('[');
    await p.waitForTimeout(200);
    const txt = await p.evaluate(() => document.querySelector('[data-sj-debug]').textContent);
    const s1 = await S(p);
    await p.screenshot({ path: path.join(OUT, 'debug-overlay-A-2.40s.jpg'), type: 'jpeg', quality: 80 });
    await p.keyboard.press('p'); // resume
    await waitRest(p, 'section2');
    await p.keyboard.press('r'); // replay A
    await p.waitForTimeout(300);
    const s2 = await S(p);
    await waitRest(p, 'section2');
    await p.keyboard.press('3');
    await p.waitForTimeout(300);
    const s3 = await S(p);
    await p.keyboard.press('1');
    await p.waitForTimeout(300);
    const s4 = await S(p);
    check('[debug] without ?journey=debug: no overlay node', none.nodes === 0, `${none.nodes} overlay nodes`);
    check('[debug] ?journey=debug: overlay shows stop, transition, time (2 decimals) and active beats; P / [ ] / R / 1 / 3 work',
      /time\s+2\.40 s/.test(txt) && /beats\s+.*cameraRush/.test(txt) && Math.abs(s1.local.t - 2.4) < 1e-6 && s2.run?.name === 'A' && s3.stop === 'appdesign' && s4.stop === 'hero',
      txt.replace(/\n/g, ' ¶ '));
    await o.ctx.close();
  }

  // ---- content below the stage: native scroll at appdesign, reverse only on a NEW gesture at the top, reload restore
  {
    const { ctx, page } = await open('desktop', '/preview/journey');
    const g0 = await page.evaluate(() => ({ gutter: document.documentElement.classList.contains('sj-gutter'), sg: getComputedStyle(document.documentElement).scrollbarGutter, cw: document.documentElement.clientWidth, iw: innerWidth }));
    await page.mouse.wheel(0, 120); await waitRest(page, 'section2');
    await page.waitForTimeout(700);
    await page.mouse.wheel(0, 120); await waitRest(page, 'appdesign');
    const cw1 = await page.evaluate(() => document.documentElement.clientWidth);
    check('[gutter] page with content below: scrollbar-gutter reserved, no width change between locked and released', g0.gutter && g0.sg.includes('stable') && g0.cw === cw1, `${JSON.stringify(g0)} clientWidth at appdesign ${cw1}`);
    await page.waitForTimeout(700);
    for (let i = 0; i < 20; i++) { await page.mouse.wheel(0, 120); await sleep(30); }
    await page.waitForTimeout(500);
    let s = await S(page);
    check('[native] at appdesign the page scrolls natively into the sections below', s.y > 1000 && s.stop === 'appdesign' && !s.locked && s.runs === 2, `scrollY ${s.y}`);
    await page.waitForTimeout(900);
    // every reveal whose top has crossed 85% of the viewport must have played; the others must still be waiting
    const rev = await page.evaluate(() => Array.from(document.querySelectorAll('[data-reveal]')).map((el) => {
      const due = el.getBoundingClientRect().top < innerHeight * 0.85; // like ScrollTrigger: measured with the start transform applied
      return { k: el.dataset.reveal, due, o: +getComputedStyle(el).opacity };
    }));
    check('[native] ScrollTrigger reveals below the stage fire at their own scroll positions', rev.some((r) => r.due) && rev.every((r) => (r.due ? r.o > 0.99 : true)), rev.map((r) => `${r.k}:${r.due ? 'due' : 'not yet'}/${r.o}`).join(' '));
    // the same continuous gesture scrolls back up to 0 and keeps going: must NOT start the reverse
    for (let i = 0; i < 60; i++) { await page.mouse.wheel(0, -80); await sleep(16); }
    await page.waitForTimeout(100);
    s = await S(page);
    check('[top] the gesture that brought the page back to scrollY 0 does not start the reverse', s.y === 0 && s.stop === 'appdesign' && !s.run && s.runs === 2, `y ${s.y} runs ${s.runs}`);
    await page.waitForTimeout(500);
    await page.mouse.wheel(0, -120); // a new upward gesture at the top
    await page.waitForTimeout(200);
    s = await S(page);
    check('[top] a new upward intent at scrollY 0 starts B reversed', s.run?.name === 'B' && s.run.dir === -1 && s.y === 0);
    await waitRest(page, 'section2');
    await page.waitForTimeout(700);
    await page.mouse.wheel(0, 120); await waitRest(page, 'appdesign');
    await page.waitForTimeout(500);
    await page.evaluate(() => window.scrollTo(0, 1400));
    await page.waitForTimeout(300);
    await page.reload({ waitUntil: 'load' });
    await page.waitForFunction(() => !!document.querySelector('[data-sj]')?.__sj?.ctl);
    await page.waitForTimeout(1500);
    s = await S(page);
    const sc = await page.evaluate(() => { const r = document.querySelector('[data-phoneshowcase]'); return { vis: getComputedStyle(r).visibility, armed: r.hasAttribute('data-ps-armed'), restoration: history.scrollRestoration }; });
    check('[restore] reload below the stage → appdesign final state, position restored, showcase playing', s.stop === 'appdesign' && !s.locked && Math.abs(s.y - 1400) < 2 && sc.vis === 'visible' && !sc.armed && sc.restoration === 'manual', `${JSON.stringify(s.log.length)} runs, y ${s.y}, ${JSON.stringify(sc)}`);
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.waitForTimeout(300);
    await page.reload({ waitUntil: 'load' });
    await page.waitForFunction(() => !!document.querySelector('[data-sj]')?.__sj?.ctl);
    await page.waitForTimeout(800);
    s = await S(page);
    check('[restore] reload at scrollY 0 (even from appdesign) starts at hero, locked', s.stop === 'hero' && s.locked && s.y === 0, JSON.stringify({ stop: s.stop, y: s.y }));
    await ctx.close();
    // a fresh visit at scrollY 0 → hero
    const o2 = await open('mobile', '/preview/journey');
    s = await S(o2.page);
    check('[restore] fresh load at y 0 → hero (390×844)', s.stop === 'hero' && s.locked && s.y === 0);
    await o2.ctx.close();
  }
}

// ------------------------------------------------------------------ scrollbar gutter with real (classic) scrollbars
async function gutter() {
  const b2 = await chromium.launch({ executablePath: '/usr/bin/google-chrome', args: ['--no-sandbox'], ignoreDefaultArgs: ['--hide-scrollbars'] });
  const ctx = await b2.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await ctx.newPage();
  page.on('pageerror', (e) => errors.push(`[gutter] pageerror ${e}`));
  const cw = () => page.evaluate(() => ({ cw: document.documentElement.clientWidth, sw: document.querySelector('[data-sj-stage]').clientWidth, iw: innerWidth, gutter: document.documentElement.classList.contains('sj-gutter') }));
  await page.goto(BASE + '/preview/journey', { waitUntil: 'load' });
  await page.waitForTimeout(1500);
  const locked = await cw();
  await page.evaluate(() => document.querySelector('[data-sj]').__sj.ctl.jump('appdesign'));
  await page.waitForTimeout(300);
  const released = await cw();
  check('[gutter] real scrollbars, content below: stage width identical locked vs released (gutter reserved)', locked.gutter && locked.sw < locked.iw && locked.sw === released.sw, /* root clientWidth reads the full width under overflow:hidden in Chrome; the stage's laid-out width is what matters */ `locked ${JSON.stringify(locked)} released ${JSON.stringify(released)}`);
  await page.goto(BASE + '/', { waitUntil: 'load' });
  await page.waitForTimeout(1500);
  const home = await cw();
  await page.evaluate(() => document.querySelector('[data-sj]').__sj.ctl.jump('appdesign'));
  await page.waitForTimeout(300);
  const home2 = await cw();
  check('[gutter] real scrollbars, nothing below (current home page): no gutter strip, full width at every stop', !home.gutter && home.cw === home.iw && home2.cw === home2.iw, `${JSON.stringify(home)} ${JSON.stringify(home2)}`);
  await b2.close();
}

// ------------------------------------------------------------------ run
let timing = {}, dur = [];
if (ONLY === 'all' || ONLY === 'frames') {
  timing.desktop = await frames('desktop');
  timing.mobile = await frames('mobile');
}
if (ONLY === 'all' || ONLY === 'checks' || ONLY === 'durations') {
  dur = [...(await durations('desktop')), ...(await durations('mobile'))];
  console.table(dur);
}
if (ONLY === 'all' || ONLY === 'checks') { await checks(); await gutter(); }
if (ONLY === 'gutter') await gutter();
const errs = [...new Set(errors)];
check('no console errors / warnings / page errors', errs.length === 0, errs.slice(0, 8).join(' || '));
fs.writeFileSync(path.join(OUT, 'results.json'), JSON.stringify({ when: new Date().toISOString(), configured: { A: LA, B: LB, reverseSpeed: RS }, durations: dur, framesRunTiming: timing, results, errors: errs }, null, 2));
const failed = results.filter((r) => !r.pass);
console.log(`\n${results.length - failed.length}/${results.length} passed`);
await browser.close();
process.exit(failed.length ? 1 : 0);
