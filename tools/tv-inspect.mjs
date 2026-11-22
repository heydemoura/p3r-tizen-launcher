// Look inside the app while it runs on the TV, through its web inspector (plain DevTools protocol, no browser library).
//   1. CDP=$(tools/tv.sh debug)     → the TV restarts the app with its inspector on and prints the address
//   2. CDP=$CDP node tools/tv-inspect.mjs [--shot out.png] [--keys down,down,ok] [--gap 400] [--wait 1500] [--eval "<js>"]
// Prints the app's own report (window.__diag()) and can save a picture of what it is drawing.
// Keys sent this way are made up inside the page: the TV does not count them as someone using the remote, so its
// screensaver still comes up two minutes after the app was started (and slows the page: measure before that).
import fs from 'node:fs';
const arg = (n, d) => { const i = process.argv.indexOf('--' + n); return i > 0 ? process.argv[i + 1] : d; };
const base = (process.env.CDP || 'http://127.0.0.1:9333').replace(/\/$/, '');
const targets = await (await fetch(base + '/json')).json();
const page = targets.find(t => /index\.html/.test(t.url || '') && t.webSocketDebuggerUrl) || targets.find(t => t.type === 'page' && t.webSocketDebuggerUrl) || targets.find(t => t.webSocketDebuggerUrl);
if (!page) { console.log('no inspectable page; targets:', JSON.stringify(targets).slice(0, 400)); process.exit(1); }
const wsUrl = base.replace(/^http/, 'ws') + new URL(page.webSocketDebuggerUrl).pathname;      // always go through our own address (the forward)
const ws = new WebSocket(wsUrl);
await new Promise((ok, no) => { ws.onopen = ok; ws.onerror = e => no(new Error('inspector socket failed: ' + (e.message || wsUrl))); });
let seq = 0; const waiting = new Map();
ws.onmessage = m => { const d = JSON.parse(m.data); if (d.id && waiting.has(d.id)) { waiting.get(d.id)(d); waiting.delete(d.id); } };
const send = (method, params = {}) => new Promise(ok => { const id = ++seq; waiting.set(id, ok); ws.send(JSON.stringify({ id, method, params })); });
const run = async js => { const r = await send('Runtime.evaluate', { expression: js, returnByValue: true, awaitPromise: true }); if (r.error || r.result.exceptionDetails) throw new Error(JSON.stringify(r.error || r.result.exceptionDetails).slice(0, 300)); return r.result.result.value; };
const sleep = ms => new Promise(r => setTimeout(r, ms));
const CODES = { up: 38, down: 40, left: 37, right: 39, ok: 13, back: 10009, red: 403, green: 404 };
console.log('page:', page.url);
await sleep(+arg('wait', 0));
for (const k of (arg('keys', '') || '').split(',').filter(Boolean)) {
  await run(`(() => { const e = new Event('keydown'); e.keyCode = ${CODES[k] || +k}; window.dispatchEvent(e); })()`);      // the app reads keyCode, as it does for the remote
  await sleep(+arg('gap', 400));
}
if (arg('eval')) console.log('eval →', JSON.stringify(await run(arg('eval'))));
const diag = JSON.parse(await run('JSON.stringify(window.__diag ? window.__diag() : { missing: "no __diag on this page" })'));
if (diag.apps && diag.apps.all && !process.argv.includes('--apps')) diag.apps.all = `(${diag.apps.all.length} entries, pass --apps to list)`;
console.log(JSON.stringify(diag, null, 1));
if (arg('shot')) {
  const r = await send('Page.captureScreenshot', { format: 'png' });
  if (r.result && r.result.data) { fs.writeFileSync(arg('shot'), Buffer.from(r.result.data, 'base64')); console.log('picture saved:', arg('shot')); }
  else {      // some TV inspectors cannot capture the screen; fall back to the canvas itself
    const data = await run(`new Promise(resolve => requestAnimationFrame(() => {
      const frame = document.createElement('canvas');
      frame.width = 1920; frame.height = 1080;
      const ctx = frame.getContext('2d', {alpha:false});
      ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, frame.width, frame.height);
      ctx.scale(frame.width / innerWidth, frame.height / innerHeight);
      for (const layer of document.querySelectorAll('#home-motion, #c, #fx')) {
        const bounds = layer.getBoundingClientRect(), style = getComputedStyle(layer);
        if (!bounds.width || !bounds.height || style.visibility === 'hidden') continue;
        ctx.globalAlpha = Number(style.opacity);
        ctx.drawImage(layer, bounds.left, bounds.top, bounds.width, bounds.height);
      }
      resolve(frame.toDataURL('image/jpeg', 0.85));
    }))`);
    fs.writeFileSync(arg('shot').replace(/\.png$/, '.jpg'), Buffer.from(data.split(',')[1], 'base64')); console.log('picture saved from the canvas:', arg('shot').replace(/\.png$/, '.jpg'));
  }
}
ws.close();
