import { chromium } from '@playwright/test';
const b = await chromium.launch();
const p = await b.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
const shots = [['m-node', '#/nodes/beelink/processes'], ['m-settings', '#/settings/appearance'], ['m-home', '#/']];
for (const [name, hash] of shots) {
  await p.goto('http://localhost:4180/demo.html' + hash, { waitUntil: 'networkidle' });
  await p.waitForTimeout(500);
  await p.screenshot({ path: `/tmp/${name}.png` });
  const overflow = await p.evaluate(() => {
    const doc = document.documentElement;
    const wide = [...document.querySelectorAll('*')].filter((el) => el.scrollWidth - el.clientWidth > 2 && getComputedStyle(el).overflowX !== 'visible');
    return { docOverflow: doc.scrollWidth - doc.clientWidth, scrollers: wide.slice(0, 4).map((el) => `${el.tagName}.${el.className}`.slice(0, 60)) };
  });
  console.log(name, JSON.stringify(overflow));
}
await b.close();
