#!/usr/bin/env node
// Rasterises the Cupola mark into the PWA icon set. Run once after changing the
// mark: `npm run icons`. The PNGs are committed; CI does not need a browser.
import { readFileSync } from 'node:fs';
import { chromium } from '@playwright/test';

const MARK = readFileSync(new URL('../public/icons/favicon.svg', import.meta.url), 'utf8');
const DATA = `data:image/svg+xml;base64,${Buffer.from(MARK).toString('base64')}`;

const TARGETS = [
  { file: 'pwa-192x192.png', size: 192, scale: 0.74 },
  { file: 'pwa-512x512.png', size: 512, scale: 0.74 },
  { file: 'pwa-1024x1024.png', size: 1024, scale: 0.74 },
  // maskable icons keep the mark inside the 80% safe circle
  { file: 'pwa-maskable-512x512.png', size: 512, scale: 0.56 },
];

const browser = await chromium.launch();
try {
  for (const target of TARGETS) {
    const page = await browser.newPage({ viewport: { width: target.size, height: target.size } });
    const inset = Math.round(target.size * target.scale);
    await page.setContent(
      `<!doctype html><style>html,body{margin:0;height:100%;background:#171719;display:grid;place-items:center}img{width:${inset}px;height:${inset}px}</style><img src="${DATA}" alt="">`,
    );
    await page.screenshot({
      path: new URL(`../public/icons/${target.file}`, import.meta.url).pathname,
    });
    await page.close();
    console.log(`icons: wrote ${target.file} (${target.size}x${target.size})`);
  }
} finally {
  await browser.close();
}
