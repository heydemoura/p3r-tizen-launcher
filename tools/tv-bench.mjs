// Measure how evenly the app produces frames on the TV while it animates, through its web inspector.
//   CDP=http://<tv>:<port> node tools/tv-bench.mjs [--plan home|list|all] [--label text] [--json out.json]
// A frame counter is injected into the page (one requestAnimationFrame callback per frame), remote-key presses are
// simulated, and the gaps between frames are summarised per stretch of the run. 60 fps = a gap of 16.7 ms every time.
import fs from 'node:fs';
const arg = (n, d) => { const i = process.argv.indexOf('--' + n); return i > 0 ? process.argv[i + 1] : d; };
const base = (process.env.CDP || 'http://127.0.0.1:9334').replace(/\/$/, '');
const targets = await (await fetch(base + '/json')).json();
const page = targets.find(t => t.type === 'page' && t.webSocketDebuggerUrl) || targets[0];
const ws = new WebSocket(base.replace(/^http/, 'ws') + new URL(page.webSocketDebuggerUrl).pathname);
await new Promise((ok, no) => { ws.onopen = ok; ws.onerror = () => no(new Error('inspector socket failed')); });
let seq = 0; const waiting = new Map();
ws.onmessage = m => { const d = JSON.parse(m.data); if (d.id && waiting.has(d.id)) { waiting.get(d.id)(d); waiting.delete(d.id); } };
const send = (method, params = {}) => new Promise(ok => { const id = ++seq; waiting.set(id, ok); ws.send(JSON.stringify({ id, method, params })); });
const run = async js => { const r = await send('Runtime.evaluate', { expression: js, returnByValue: true, awaitPromise: true }); if (r.error || r.result.exceptionDetails) throw new Error(JSON.stringify(r.error || r.result.exceptionDetails).slice(0, 400)); return r.result.result.value; };
const CODES = { up: 38, down: 40, left: 37, right: 39, ok: 13, back: 10009, red: 403, green: 404 };

// The whole run happens inside the page on its own clock, so network delays to the TV do not blur the timing.
const PLANS = {
  home: [['idle', 2500], ['step down x9', 9, 'down', 450], ['step up x9', 9, 'up', 450], ['fast down x9', 9, 'down', 160], ['fast up x9', 9, 'up', 160], ['wrap up', 1, 'up', 900], ['wrap down', 1, 'down', 900], ['idle after', 1500]],
  list: [['open inputs', 1, 'ok', 1400], ['list idle', 1200], ['list down/up', 4, 'down,up', 400], ['close inputs', 1, 'back', 1300], ['idle after', 1200]],
};
// 'resume' replays the end of the opening dive (what happens when you come back from another app); 'launch' plays the
// "Now opening" transition with the real app start stubbed out, so nothing actually opens on the TV.
PLANS.extra = [['resume (dive replay)', 'js', "document.dispatchEvent(new Event('visibilitychange'))", 2400], ['select line 2', 1, 'down', 500],
  ['opening an app', 'js', "window.__launched = 0; try { window.__realLaunch = window.__realLaunch || tizen.application.launch; tizen.application.launch = function () { window.__launched++; }; } catch (e) {} (() => { const e = new Event('keydown'); e.keyCode = 13; window.dispatchEvent(e); })()", 2100],
  ['back to home', 'js', "try { if (window.__realLaunch) tizen.application.launch = window.__realLaunch; } catch (e) {} document.dispatchEvent(new Event('visibilitychange'))", 2400]];      // (the real app start is put back, so the app on the TV keeps working)
PLANS.all = PLANS.home.concat(PLANS.list);
PLANS.full = PLANS.all.concat(PLANS.extra);
const plan = PLANS[arg('plan', 'all')];
const result = await run(`(async () => {
  const CODES = ${JSON.stringify(CODES)}, plan = ${JSON.stringify(plan)};
  const key = k => { const e = new Event('keydown'); e.keyCode = CODES[k]; window.dispatchEvent(e); };
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  const frames = []; let on = true;
  (function loop() { if (!on) return; frames.push(performance.now()); requestAnimationFrame(loop); })();
  const segs = [];
  await sleep(300);
  for (const st of plan) {
    const t0 = performance.now();
    if (st.length === 2) await sleep(st[1]);
    else if (st[1] === 'js') { (0, eval)(st[2]); await sleep(st[3]); }
    else { const keys = st[2].split(','); for (let i = 0; i < st[1]; i++) { key(keys[i % keys.length]); await sleep(st[3]); } }
    segs.push([st[0], t0, performance.now()]);
  }
  on = false;
  const d = window.__diag ? window.__diag() : {};
  return JSON.stringify({ frames: frames.map(v => +v.toFixed(2)), segs, q: d.q, canvas: d.canvas, drawMs: d.drawMs, errors: d.errors, mode: d.mode, sel: d.sel });
})()`);
const R = JSON.parse(result);
const stats = (name, a, b) => {
  const ts = R.frames.filter(t => t >= a && t <= b), dts = []; for (let i = 1; i < ts.length; i++) dts.push(ts[i] - ts[i - 1]);
  if (dts.length < 2) return null;
  const s = dts.slice().sort((x, y) => x - y), q = p => s[Math.min(s.length - 1, Math.floor(p * s.length))];
  const dur = ts[ts.length - 1] - ts[0], late = dts.filter(v => v > 25).length, vlate = dts.filter(v => v > 41.7).length;
  // "missed": how many 60 Hz refreshes went by without a new frame
  const missed = dts.reduce((n, v) => n + Math.max(0, Math.round(v / 16.667) - 1), 0);
  return { name, frames: dts.length, fps: +(dts.length / dur * 1000).toFixed(1), p50: +q(.5).toFixed(1), p95: +q(.95).toFixed(1), p99: +q(.99).toFixed(1), max: +s[s.length - 1].toFixed(1), late, vlate, missed, missedPct: +(missed / (missed + dts.length) * 100).toFixed(1) };
};
const rows = R.segs.map(([n, a, b]) => stats(n, a, b)).filter(Boolean);
rows.push(stats('WHOLE RUN', R.segs[0][1], R.segs[R.segs.length - 1][2]));
const label = arg('label', '');
console.log(`${label ? label + ' — ' : ''}quality ${R.q}, canvas ${R.canvas}, script time per frame ${R.drawMs} ms, ended in mode ${R.mode} sel ${R.sel}${R.errors && R.errors.length ? ', errors: ' + R.errors.join('; ') : ''}`);
console.log('stretch'.padEnd(16), 'frames'.padStart(6), 'fps'.padStart(6), 'p50'.padStart(6), 'p95'.padStart(6), 'p99'.padStart(6), 'max'.padStart(7), '>25ms'.padStart(6), '>42ms'.padStart(6), 'missed'.padStart(7), 'missed%'.padStart(8));
for (const r of rows) console.log(r.name.padEnd(16), String(r.frames).padStart(6), String(r.fps).padStart(6), String(r.p50).padStart(6), String(r.p95).padStart(6), String(r.p99).padStart(6), String(r.max).padStart(7), String(r.late).padStart(6), String(r.vlate).padStart(6), String(r.missed).padStart(7), String(r.missedPct).padStart(8));
if (arg('json')) fs.writeFileSync(arg('json'), JSON.stringify({ label, ...R, rows }));
ws.close();
