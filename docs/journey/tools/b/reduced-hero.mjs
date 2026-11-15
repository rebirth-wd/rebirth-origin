import { chromium } from 'playwright-core';
const b = await chromium.launch({ executablePath: '/usr/bin/google-chrome', args: ['--no-sandbox'] });
const p = await b.newPage({ viewport: { width: 390, height: 844 }, reducedMotion: 'reduce' });
await p.goto('http://localhost:4321/preview/journey', { waitUntil: 'load' }); await p.waitForTimeout(2000);
await p.screenshot({ path: process.argv[2] }); await b.close();
