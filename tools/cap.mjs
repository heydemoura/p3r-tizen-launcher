// Render the app on the PC at exact moments (it is a pure function of time and key presses), from the repository's top folder:
//   node tools/cap.mjs still <script> <t1,t2,...>   |   node tools/cap.mjs video <script> <durationMs> [fps]
// <script> is one of the key scripts in app.js (home, all, inputs, launch); env OUT = output folder (default out/), EXTRA = more URL parameters (q=3, demo=9 …)
import { launch } from './lib/browser.mjs';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
const [,, mode, script, a, b] = process.argv;
const br = await launch();
const pg = await br.newPage({ viewport: { width: 1920, height: 1080 } });
pg.on('pageerror', e => console.log('page error:', e.message));
const extra = process.env.EXTRA ? '&' + process.env.EXTRA : '', outDir = process.env.OUT || 'out';
await pg.goto(`file://${process.cwd()}/index.html?capture=1&script=${script}${extra}`);
await pg.waitForFunction(() => window.ready, null, { timeout: 30000 });
fs.mkdirSync(outDir, { recursive: true });
if (mode === 'still') {
  let last = 0;
  for (const at of a.split(',').map(Number)) {
    for (let t = last; t < at; t += 16) await pg.evaluate(x => window.renderAt(x), t);   // step so scripted keys fire in order
    await pg.evaluate(x => window.renderAt(x), at); last = at;
    await pg.screenshot({ path: `${outDir}/${script}-${at}.png` });
    console.log('still', script, at);
  }
} else {
  const dur = Number(a), fps = Number(b || 60), dir = `${outDir}/f-${script}`;
  fs.rmSync(dir, { recursive: true, force: true }); fs.mkdirSync(dir);
  for (let i = 0; i * 1000 / fps <= dur; i++) {
    await pg.evaluate(t => window.renderAt(t), i * 1000 / fps);
    await pg.screenshot({ path: `${dir}/${String(i).padStart(5, '0')}.jpg`, type: 'jpeg', quality: 93 });
  }
  execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-framerate', String(fps), '-i', `${dir}/%05d.jpg`, '-c:v', 'libx264', '-preset', 'slow', '-pix_fmt', 'yuv420p', '-crf', '19', '-movflags', '+faststart', `${outDir}/${script}.mp4`]);
  fs.rmSync(dir, { recursive: true, force: true });
  console.log('video', script);
}
await br.close();
