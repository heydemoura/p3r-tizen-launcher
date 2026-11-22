// Load the packaged folder (dist/) in an older Chromium (108 is the engine generation of Tizen 8 TVs; Tizen 9 has 120) and report what breaks.
//   OLD_CHROMIUM=/path/to/chrome node tools/oldchrome.mjs      (after tools/build-tv.sh, which fills dist/)
import { launch } from './lib/browser.mjs';
import fs from 'node:fs';
fs.mkdirSync('work', { recursive: true });      // screenshots of each step land in work/ (not in the repository)
const exe = process.env.OLD_CHROMIUM;
if (!exe) { console.log('set OLD_CHROMIUM to an older Chromium binary (for example a Chromium 108 snapshot build) — see tools/local.env.example'); process.exit(2); }
const br = await launch(exe);
console.log('browser:', br.version());
const pg = await br.newPage({ viewport: { width: 1920, height: 1080 } });
const errs = []; pg.on('pageerror', e => errs.push('pageerror: ' + e.message)); pg.on('console', m => { if (m.type() === 'error') errs.push('console: ' + m.text()); });
for (const [name, q] of [['home', 'capture=1&at=3000'], ['list', 'capture=1&script=inputs&at=8400'], ['launch', 'capture=1&script=launch&at=4850'], ['intro', 'capture=1&at=1000'], ['q1', 'capture=1&at=3000&q=1']]) {
  await pg.goto(`file://${process.cwd()}/dist/index.html?${q}`);
  // drive scripted keys in order
  await pg.waitForFunction(() => window.ready, null, { timeout: 30000 });
  const at = +(/at=(\d+)/.exec(q) || [0, 0])[1];
  if (/script=/.test(q)) { await pg.goto(`file://${process.cwd()}/dist/index.html?${q.replace(/at=\d+/, 'at=0')}`); await pg.waitForFunction(() => window.ready); for (let t = 0; t < at; t += 16) await pg.evaluate(x => window.renderAt(x), t); await pg.evaluate(x => window.renderAt(x), at); }
  await pg.screenshot({ path: `work/m108-${name}.png` });
  const d = await pg.evaluate(() => { const d = window.__diag(); return { errors: d.errors, notes: d.notes, canvas: d.canvas, feat: { letterSpacing: 'letterSpacing' in CanvasRenderingContext2D.prototype, roundRect: !!CanvasRenderingContext2D.prototype.roundRect } }; });
  console.log(name, JSON.stringify(d));
}
console.log(errs.length ? errs.join('\n') : 'no page errors');
await br.close();
