// usage: node tools/sheet.mjs <script> <t1,t2,...> out.jpg [cols]
import { launch } from './lib/browser.mjs';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
const [,, script, times, out, cols = '4'] = process.argv;
const br = await launch();
const pg = await br.newPage({ viewport: { width: 1920, height: 1080 } });
pg.on('pageerror', e => console.log('page error:', e.message));
await pg.goto(`file://${process.cwd()}/index.html?capture=1&script=${script}`);
await pg.waitForFunction(() => window.ready, null, { timeout: 30000 });
const dir = 'work/sheet_tmp'; fs.rmSync(dir, { recursive: true, force: true }); fs.mkdirSync(dir, { recursive: true });
const ts = times.split(',').map(Number);
for (let i = 0; i < ts.length; i++) {
  // advance in small steps so scripted key presses fire in order
  for (let t = (i ? ts[i - 1] : 0); t < ts[i]; t += 16) await pg.evaluate(x => window.renderAt(x), t);
  await pg.evaluate(x => window.renderAt(x), ts[i]);
  await pg.screenshot({ path: `${dir}/${String(i).padStart(3, '0')}.png` });
}
await br.close();
const rows = Math.ceil(ts.length / +cols);
execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-i', `${dir}/%03d.png`, '-vf', `scale=${Math.floor(1920 / +cols)}:-1,tile=${cols}x${rows}`, '-frames:v', '1', '-update', '1', out]);
console.log('sheet', out, ts.length);
