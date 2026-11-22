// Load the page (capture mode) at a few moments of each key script and report any error.
import { launch } from './lib/browser.mjs';
const br = await launch();
for (const [script, at, extra] of [['home', 3000, ''], ['all', 6800, ''], ['inputs', 8400, ''], ['launch', 4850, ''], ['home', 900, ''], ['home', 3000, '&q=3'], ['inputs', 5400, '&q=3'], ['home', 900, '&nogl=1'], ['home', 3000, '&q=0'], ['home', 3000, '&p3=1'], ['home', 3000, '&demo=9']]) {
  const pg = await br.newPage({ viewport: { width: 1920, height: 1080 } });
  const errs = []; pg.on('pageerror', e => errs.push('pageerror: ' + e.message)); pg.on('console', m => { if (m.type() === 'error') errs.push('console: ' + m.text()); });
  await pg.goto(`file://${process.cwd()}/${process.env.DIR || '.'}/index.html?capture=1&script=${script}${extra}`);
  try { await pg.waitForFunction(() => window.ready, null, { timeout: 20000 }); for (let t = 0; t < at; t += 16) await pg.evaluate(x => window.renderAt(x), t); await pg.evaluate(x => window.renderAt(x), at); } catch (e) { errs.push('timeout/exception: ' + e.message.split('\n')[0]); }
  const d = await pg.evaluate(() => window.__diag ? (x => ({ errors: x.errors, foam: x.foam, q: x.q, canvas: x.canvas, setup: x.setup }))(window.__diag()) : null).catch(() => null);
  console.log(`${script}@${at}${extra}`.padEnd(24), JSON.stringify(d), errs.length ? errs.join(' | ') : 'ok');
  await pg.close();
}
await br.close();
