// Screenshot the demo the way a real screen shows it.
//   node scripts/shot.mjs <url> <out.png> [width height scale]
// scale defaults to 2: phones and laptops draw maps at 2x, so a 1x shot looks softer than the real thing.
import { chromium } from '@playwright/test';
const [,, url, out, w = 1280, h = 800, scale = 2] = process.argv;
const b = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const p = await b.newPage({ viewport: { width: +w, height: +h }, deviceScaleFactor: +scale });
await p.goto(url); await p.waitForFunction(() => window.__mapIdle === true, null, { timeout: 60000 });
await p.waitForTimeout(500); await p.screenshot({ path: out }); await b.close();
