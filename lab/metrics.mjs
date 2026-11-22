// Main-thread time per frame on the TV, from the browser's own counters, while idle and while the selection moves.
const base = process.env.CDP.replace(/\/$/, '');
const targets = await (await fetch(base + '/json')).json();
const ws = new WebSocket(base.replace(/^http/, 'ws') + new URL(targets[0].webSocketDebuggerUrl).pathname);
await new Promise(ok => { ws.onopen = ok; });
let seq = 0; const waiting = new Map();
ws.onmessage = m => { const d = JSON.parse(m.data); if (d.id && waiting.has(d.id)) { waiting.get(d.id)(d); waiting.delete(d.id); } };
const send = (method, params = {}) => new Promise(ok => { const id = ++seq; waiting.set(id, ok); ws.send(JSON.stringify({ id, method, params })); });
const run = async js => (await send('Runtime.evaluate', { expression: js, returnByValue: true, awaitPromise: true })).result.result.value;
await send('Performance.enable');
const metrics = async () => Object.fromEntries((await send('Performance.getMetrics')).result.metrics.map(m => [m.name, m.value]));
const frames = () => run(`new Promise(r => { let n = 0; const t0 = performance.now(); const f = () => { n++; if (performance.now() - t0 < ${process.env.MS || 3000}) requestAnimationFrame(f); else r(n); }; requestAnimationFrame(f); })`);
const keys = (seqs, gap) => run(`(async () => { for (const k of ${JSON.stringify(seqs)}) { const e = new Event('keydown'); e.keyCode = k; window.dispatchEvent(e); await new Promise(r => setTimeout(r, ${gap})); } })()`);
const window_ = async (name, during) => {
  const a = await metrics(); const pf = frames(); if (during) await during(); const n = await pf; const b = await metrics();
  const d = k => (b[k] - a[k]) * 1000;
  console.log(`${name.padEnd(22)} frames ${String(n).padStart(4)} | per frame: all main-thread work ${(d('TaskDuration') / n).toFixed(1)} ms, of which script ${(d('ScriptDuration') / n).toFixed(1)} ms, layout ${(d('LayoutDuration') / n).toFixed(2)}, style ${(d('RecalcStyleDuration') / n).toFixed(2)} | JS heap ${(b.JSHeapUsedSize / 1e6).toFixed(1)} MB`);
};
console.log(await run('JSON.stringify((d => ({ q: d.q, canvas: d.canvas, fps: d.fps, drawMs: d.drawMs, auto: d.auto, notes: d.notes }))(window.__diag()))'));
await window_('idle');
await window_('selection moving', () => keys([40, 40, 40, 40, 38, 38, 38, 38], 330));
await window_('idle again');
ws.close();
