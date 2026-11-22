// Reload the app's page on the TV with experiment switches (?x=a,b) and report how the start went each time.
//   CDP=http://<tv>:<port> node lab/reload.mjs "" "fat1" "noopen" ...     (the empty string is the plain app)
import fs from 'node:fs';
const base = process.env.CDP.replace(/\/$/, '');
const connect = async () => {
  const targets = await (await fetch(base + '/json')).json();
  const page = targets.find(t => t.type === 'page' && t.webSocketDebuggerUrl) || targets[0];
  const ws = new WebSocket(base.replace(/^http/, 'ws') + new URL(page.webSocketDebuggerUrl).pathname);
  await new Promise(ok => { ws.onopen = ok; });
  let seq = 0; const waiting = new Map();
  ws.onmessage = m => { const d = JSON.parse(m.data); if (d.id && waiting.has(d.id)) { waiting.get(d.id)(d); waiting.delete(d.id); } };
  const send = (method, params = {}) => new Promise(ok => { const id = ++seq; waiting.set(id, ok); ws.send(JSON.stringify({ id, method, params })); });
  return { ws, run: async js => { const r = await send('Runtime.evaluate', { expression: js, returnByValue: true, awaitPromise: true }); if (r.error || r.result.exceptionDetails) throw new Error(JSON.stringify(r.error || r.result.exceptionDetails).slice(0, 400)); return r.result.result.value; } };
};
const sleep = ms => new Promise(r => setTimeout(r, ms));
const body = fs.readFileSync(new URL('./intro.js', import.meta.url), 'utf8');
for (const flags of process.argv.slice(2)) {
  let c = await connect();
  await c.run(`setTimeout(() => location.replace(location.pathname + ${JSON.stringify(flags ? '?x=' + flags : '')}), 50); 1`);
  c.ws.close(); await sleep(+(process.env.WAIT || 9000));
  c = await connect();
  const r = JSON.parse(await c.run(`(async (args) => { ${body}\n})({ upto: 4300 }).then(v => JSON.stringify(v))`));
  const st = r.setup, laps = Object.keys(st).filter(k => k[0] === '·').map(k => `${k.slice(2)} ${st[k]}`).join(', ');
  console.log(`[${flags || 'plain'}] set-up: files ${st['fonts + picture loaded']} (maps meanwhile ${st['maps (while the files load)']}), apps ${st['apps checked']}, pictures ${st.pictures} (${laps}), held ${st['held for']} ms | opening: ${r.fps} fps, ${r.missed} missed (${r.missedPct}%), worst ${r.worstGap.toFixed(0)} ms`);
  console.log('   late:', r.late.join(' | '));
  c.ws.close();
}
