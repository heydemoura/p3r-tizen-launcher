// Watch the app on the TV over time: every STEP ms print how evenly frames came and how busy the main thread was.
//   CDP=http://<tv>:<port> [DUR=120] [STEP=5000] node lab/timeline.mjs [--init "<js>"] [--every "<js>"] [--label text]
// --init runs once at the start (inside the page), --every at the start of each sample (key(), resume(), stubLaunch()
// and sleep() are available as in lab/phases.mjs). The clock printed is the app's own (seconds since the page started).
const arg = (n, d) => { const i = process.argv.indexOf('--' + n); return i > 0 ? process.argv[i + 1] : d; };
const base = process.env.CDP.replace(/\/$/, '');
const targets = await (await fetch(base + '/json')).json();
const page = targets.find(t => t.type === 'page' && t.webSocketDebuggerUrl) || targets[0];
const ws = new WebSocket(base.replace(/^http/, 'ws') + new URL(page.webSocketDebuggerUrl).pathname);
await new Promise(ok => { ws.onopen = ok; });
let seq = 0; const waiting = new Map();
ws.onmessage = m => { const d = JSON.parse(m.data); if (d.id && waiting.has(d.id)) { waiting.get(d.id)(d); waiting.delete(d.id); } };
const send = (method, params = {}) => new Promise(ok => { const id = ++seq; waiting.set(id, ok); ws.send(JSON.stringify({ id, method, params })); });
const run = async js => { const r = await send('Runtime.evaluate', { expression: js, returnByValue: true, awaitPromise: true }); if (r.error || r.result.exceptionDetails) throw new Error(JSON.stringify(r.error || r.result.exceptionDetails).slice(0, 500)); return r.result.result.value; };
await send('Performance.enable');
const metrics = async () => Object.fromEntries((await send('Performance.getMetrics')).result.metrics.map(m => [m.name, m.value]));
await run(`window.KEYS = { up: 38, down: 40, left: 37, right: 39, ok: 13, back: 10009, red: 403, green: 404 };
  window.key = k => { const e = new Event('keydown'); e.keyCode = typeof k === 'string' ? KEYS[k] : k; window.dispatchEvent(e); };
  window.resume = () => document.dispatchEvent(new Event('visibilitychange'));
  window.stubLaunch = () => { window.__launched = window.__launched || 0; try { tizen.application.launch = function () { window.__launched++; }; } catch (e) {} };
  window.sleep = ms => new Promise(r => setTimeout(r, ms)); 1`);
const DUR = +(process.env.DUR || 120) * 1000, STEP = +(process.env.STEP || 5000);
if (arg('label')) console.log('#', arg('label'));
if (arg('init')) console.log('init →', JSON.stringify(await run(`(async () => { ${arg('init')} })()`)));
const t0 = Date.now(); let n = 0;
while (Date.now() - t0 < DUR) {
  const a = await metrics();
  const r = JSON.parse(await run(`(async () => {
    const frames = []; let on = true; (function loop() { if (!on) return; frames.push(performance.now()); requestAnimationFrame(loop); })();
    let out; try { out = await (async () => { ${arg('every', '')} })(); } catch (e) { out = 'ERR ' + e.message; }
    await sleep(${STEP}); on = false;
    const d = window.__diag ? window.__diag() : {};
    return JSON.stringify({ frames, out, q: d.q, canvas: d.canvas, js: d.drawMs, mode: d.mode, jobs: d.jobs, now: performance.now(), notes: (d.notes || []).length });
  })()`));
  const b = await metrics();
  const dts = []; for (let i = 1; i < r.frames.length; i++) dts.push(r.frames[i] - r.frames[i - 1]);
  const s = dts.slice().sort((x, y) => x - y), qq = p => s.length ? s[Math.min(s.length - 1, Math.floor(p * s.length))] : 0;
  const dur = r.frames.length > 1 ? r.frames[r.frames.length - 1] - r.frames[0] : 1, missed = dts.reduce((m, v) => m + Math.max(0, Math.round(v / 16.667) - 1), 0);
  const k = Math.max(1, dts.length), d = key => (b[key] - a[key]) * 1000;
  console.log(`${String(Math.round(r.now / 1000)).padStart(4)} s  ${String((dts.length / dur * 1000).toFixed(1)).padStart(5)} fps  p50 ${qq(.5).toFixed(1).padStart(5)} p95 ${qq(.95).toFixed(1).padStart(5)} max ${(s[s.length - 1] || 0).toFixed(1).padStart(6)}  missed ${String(missed).padStart(3)} (${(missed / (missed + k) * 100).toFixed(1).padStart(4)}%)  main ${(d('TaskDuration') / k).toFixed(1).padStart(5)} ms/fr, script ${(d('ScriptDuration') / k).toFixed(1).padStart(4)}  heap ${(b.JSHeapUsedSize / 1e6).toFixed(1)} MB  L${r.q} ${(r.canvas || []).join('x')} ${r.mode}${r.out !== undefined && r.out !== null ? '  → ' + JSON.stringify(r.out).slice(0, 160) : ''}`);
  n++;
}
ws.close();
