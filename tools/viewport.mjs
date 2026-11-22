// The TV may hand the page a different size than 1920x1080 (for instance 960x540 at double density). Check the picture still fills it.
import { launch } from './lib/browser.mjs';
const br = await launch();
for (const [w, h, dpr] of [[960, 540, 2], [1280, 720, 1], [3840, 2160, 1]]) {
  const ctx = await br.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: dpr });
  const pg = await ctx.newPage();
  await pg.goto(`file://${process.cwd()}/dist/index.html?capture=1&at=3000`);
  await pg.waitForFunction(() => window.ready, null, { timeout: 30000 });
  const r = await pg.evaluate(() => { const c = document.getElementById('c').getBoundingClientRect(); return { page: [innerWidth, innerHeight, devicePixelRatio], canvasBox: [c.left, c.top, c.width, c.height], scroll: [document.documentElement.scrollWidth, document.documentElement.scrollHeight] }; });
  await pg.screenshot({ path: `work/vp-${w}.png` });
  console.log(JSON.stringify(r));
  await ctx.close();
}
await br.close();
