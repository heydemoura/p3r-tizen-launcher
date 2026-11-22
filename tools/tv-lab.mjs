// Run a small experiment script inside the app's page on the TV and print what it returns.
//   CDP=http://<tv>:<port> node tools/tv-lab.mjs lab/<file>.js ['{"json":"args"}']
// The file is the body of an async function (it may use `args`); it must return something JSON can carry.
import fs from 'node:fs';
const base = (process.env.CDP || 'http://127.0.0.1:9334').replace(/\/$/, '');
const targets = await (await fetch(base + '/json')).json();
const page = targets.find(t => t.type === 'page' && t.webSocketDebuggerUrl) || targets[0];
const ws = new WebSocket(base.replace(/^http/, 'ws') + new URL(page.webSocketDebuggerUrl).pathname);
await new Promise((ok, no) => { ws.onopen = ok; ws.onerror = () => no(new Error('inspector socket failed')); });
let seq = 0; const waiting = new Map();
ws.onmessage = m => { const d = JSON.parse(m.data); if (d.id && waiting.has(d.id)) { waiting.get(d.id)(d); waiting.delete(d.id); } };
const send = (method, params = {}) => new Promise(ok => { const id = ++seq; waiting.set(id, ok); ws.send(JSON.stringify({ id, method, params })); });
const body = fs.readFileSync(process.argv[2], 'utf8'), args = process.argv[3] || '{}';
const r = await send('Runtime.evaluate', { expression: `(async (args) => { ${body}\n})(${args}).then(v => JSON.stringify(v))`, returnByValue: true, awaitPromise: true });
if (r.error || r.result.exceptionDetails) { console.log('FAILED:', JSON.stringify(r.error || r.result.exceptionDetails).slice(0, 900)); process.exit(1); }
const out = JSON.parse(r.result.result.value);
if (process.env.RAW) console.log(JSON.stringify(out)); else console.log(typeof out === 'string' ? out : JSON.stringify(out, null, 1));
ws.close();
