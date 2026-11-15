import { chromium } from '@playwright/test';
const [,, url, out, w = 1280, h = 800] = process.argv;
const b = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const p = await b.newPage({ viewport: { width: +w, height: +h } });
await p.goto(url); await p.waitForFunction(() => window.__mapIdle === true, null, { timeout: 30000 });
await p.waitForTimeout(500); await p.screenshot({ path: out }); await b.close();
