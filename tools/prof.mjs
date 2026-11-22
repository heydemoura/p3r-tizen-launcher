// Rough per-section cost of one frame in software rendering on this PC (the TV will differ). usage: node tools/prof.mjs "q=2"
import { launch } from './lib/browser.mjs';
const br = await launch();
for (const q of (process.argv[2] || '3,2,1,0').split(',')) {
  const pg = await br.newPage({ viewport: { width: 1920, height: 1080 } });
  pg.on('pageerror', e => console.log('pageerror', e.message));
  await pg.goto(`file://${process.cwd()}/index.html?capture=1&at=3000&q=${q}${process.argv[3] ? '&' + process.argv[3] : ''}`);
  await pg.waitForFunction(() => window.ready, null, { timeout: 30000 });
  // whole-frame cost without the per-section read-backs, then the split
  const total = await pg.evaluate(() => { const N = 60, c = document.getElementById('c').getContext('2d'); const t0 = performance.now(); for (let i = 0; i < N; i++) window.renderAt(5000 + i * 16.7); c.getImageData(0, 0, 1, 1); return (performance.now() - t0) / N; });
  await pg.close();
  const pg2 = await br.newPage({ viewport: { width: 1920, height: 1080 } });
  await pg2.goto(`file://${process.cwd()}/index.html?capture=1&at=3000&prof=1&q=${q}`);
  await pg2.waitForFunction(() => window.ready, null, { timeout: 30000 });
  const sections = await pg2.evaluate(() => { const N = 30; window.__prof = {}; for (let i = 0; i < N; i++) window.renderAt(5000 + i * 16.7); const o = {}; for (const k in window.__prof) o[k] = +(window.__prof[k] / N).toFixed(1); return o; });
  await pg2.close();
  const pg3 = await br.newPage({ viewport: { width: 1920, height: 1080 } });
  await pg3.goto(`file://${process.cwd()}/index.html?capture=1&at=3000&live=1&q=${q}`);
  await pg3.waitForFunction(() => window.ready, null, { timeout: 30000 });
  const live = await pg3.evaluate(() => { const N = 120, c = document.getElementById("c").getContext("2d"); const t0 = performance.now(); for (let i = 0; i < N; i++) window.renderAt(5000 + i * 16.7); c.getImageData(0, 0, 1, 1); return (performance.now() - t0) / N; });
  await pg3.close();
  console.log(`quality ${q}: every-frame ${total.toFixed(1)} ms, TV rhythm ${live.toFixed(1)} ms   ${JSON.stringify(sections)}`);
}
await br.close();
