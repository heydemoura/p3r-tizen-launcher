// Run a list of stages inside the app on the TV; for each one print how evenly frames came and how busy the page's
// main thread was (the browser's own counters).  CDP=http://<tv>:<port> node lab/phases.mjs '<stages json>' | @file.json
// A stage is [name, js-or-null, ms]: the JS runs once at the start, then frames are watched for `ms`.
// Shortcuts usable inside the JS: key(code), KEYS = {up,down,ok,back,...}, resume() (replays the end of the dive),
// stubLaunch() (opening an app then shows the transition but starts nothing).
import fs from 'node:fs';
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
let src = process.argv[2]; if (src[0] === '@') src = fs.readFileSync(src.slice(1), 'utf8');
const stages = JSON.parse(src);
await run(`window.KEYS = { up: 38, down: 40, left: 37, right: 39, ok: 13, back: 10009, red: 403, green: 404 };
  window.key = k => { const e = new Event('keydown'); e.keyCode = typeof k === 'string' ? KEYS[k] : k; window.dispatchEvent(e); };
  window.resume = () => document.dispatchEvent(new Event('visibilitychange'));
  window.stubLaunch = () => { window.__launched = window.__launched || 0; try { tizen.application.launch = function () { window.__launched++; }; } catch (e) {} };
  window.sleep = ms => new Promise(r => setTimeout(r, ms)); 1`);
const rows = [];
for (const [name, js, ms] of stages) {
  const a = await metrics();
  const r = JSON.parse(await run(`(async () => {
    const frames = []; let on = true; (function loop() { if (!on) return; frames.push(performance.now()); requestAnimationFrame(loop); })();
    let out; try { out = await (async () => { ${js || ''} })(); } catch (e) { out = 'ERR ' + e.message; }
    await sleep(${ms}); on = false;
    const d = window.__diag ? window.__diag() : {};
    return JSON.stringify({ frames, out, q: d.q, canvas: d.canvas, js: d.drawMs, mode: d.mode, jobs: d.jobs });
  })()`));
  const b = await metrics();
  const dts = []; for (let i = 1; i < r.frames.length; i++) dts.push(r.frames[i] - r.frames[i - 1]);
  const s = dts.slice().sort((x, y) => x - y), qq = p => s.length ? s[Math.min(s.length - 1, Math.floor(p * s.length))] : 0;
  const dur = r.frames.length > 1 ? r.frames[r.frames.length - 1] - r.frames[0] : 1, missed = dts.reduce((n, v) => n + Math.max(0, Math.round(v / 16.667) - 1), 0);
  const n = Math.max(1, dts.length), d = k => (b[k] - a[k]) * 1000;
  const row = { name, frames: dts.length, fps: +(dts.length / dur * 1000).toFixed(1), p50: +qq(.5).toFixed(1), p95: +qq(.95).toFixed(1), max: +(s[s.length - 1] || 0).toFixed(1), missed, missedPct: +(missed / (missed + n) * 100).toFixed(1),
    task: +(d('TaskDuration') / n).toFixed(1), script: +(d('ScriptDuration') / n).toFixed(1), q: r.q, canvas: (r.canvas || []).join('x'), mode: r.mode, jobs: r.jobs, out: r.out, heapMB: +(b.JSHeapUsedSize / 1e6).toFixed(1) };
  rows.push(row);
  console.log(`${name.padEnd(30)} ${String(row.frames).padStart(4)} fr ${String(row.fps).padStart(5)} fps  p50 ${String(row.p50).padStart(5)} p95 ${String(row.p95).padStart(5)} max ${String(row.max).padStart(6)}  missed ${String(row.missed).padStart(3)} (${String(row.missedPct).padStart(4)}%)  main ${String(row.task).padStart(5)} ms/fr, script ${String(row.script).padStart(4)}  | L${row.q} ${row.canvas} ${row.mode} jobs ${row.jobs}${row.out !== undefined && row.out !== null ? '  → ' + JSON.stringify(row.out).slice(0, 200) : ''}`);
}
if (process.env.JSON_OUT) fs.writeFileSync(process.env.JSON_OUT, JSON.stringify(rows, null, 1));
ws.close();
