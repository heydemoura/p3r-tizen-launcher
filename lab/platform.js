// What does this TV's browser engine do well and badly? The app's own drawing is paused; simple drawing jobs are run
// one at a time on the same canvas and the gaps between frames are measured for each.
const cv = document.getElementById('c');
if (!window.__realRenderAt) window.__realRenderAt = window.renderAt;
window.renderAt = () => {};                                  // pause the app's drawing (its frame loop keeps ticking)
const sleep = ms => new Promise(r => setTimeout(r, ms));
const stat = (name, gaps, js) => {
  const s = gaps.slice().sort((a, b) => a - b), q = p => s[Math.min(s.length - 1, Math.floor(p * s.length))], sum = gaps.reduce((a, b) => a + b, 0);
  return { name, fps: +(gaps.length / sum * 1000).toFixed(1), p50: +q(.5).toFixed(1), p95: +q(.95).toFixed(1), max: +s[s.length - 1].toFixed(1), jsMs: +(js / gaps.length).toFixed(2) };
};
const measure = (name, draw, ms = 1400) => new Promise(done => {
  const gaps = []; let last = 0, js = 0, t0 = performance.now(), n = 0;
  const loop = () => {
    const now = performance.now(); if (last && n > 3) gaps.push(now - last); last = now; n++;
    const a = performance.now(); draw(n, now - t0); js += performance.now() - a;
    if (now - t0 < ms) requestAnimationFrame(loop); else done(stat(name, gaps, js));
  };
  requestAnimationFrame(loop);
});
const mk = (w, h) => { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; };
const out = { ua: navigator.userAgent, dpr: devicePixelRatio, hw: navigator.hardwareConcurrency, mem: navigator.deviceMemory, results: [] };
// WebGL?
try {
  const gl = mk(16, 16).getContext('webgl') || mk(16, 16).getContext('experimental-webgl');
  if (gl) { const ext = gl.getExtension('WEBGL_debug_renderer_info'); out.webgl = { version: gl.getParameter(gl.VERSION), renderer: ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER), vendor: ext ? gl.getParameter(ext.UNMASKED_VENDOR_WEBGL) : gl.getParameter(gl.VENDOR), maxTex: gl.getParameter(gl.MAX_TEXTURE_SIZE) }; }
  else out.webgl = null;
  const gl2 = mk(16, 16).getContext('webgl2'); out.webgl2 = !!gl2;
} catch (e) { out.webgl = 'error ' + e.message; }
const run = async (w, h, tag) => {
  cv.width = w; cv.height = h;
  const g = cv.getContext('2d'), k = w / 1920;
  const grad = mk(w, h), gx = grad.getContext('2d'); const lg = gx.createLinearGradient(0, 0, 0, h); lg.addColorStop(0, '#08f8ff'); lg.addColorStop(1, '#000fbe'); gx.fillStyle = lg; gx.fillRect(0, 0, w, h);
  const spr = mk(Math.round(950 * k), h), sx = spr.getContext('2d'); sx.fillStyle = 'rgba(255,255,255,.9)'; sx.beginPath(); sx.arc(spr.width / 2, h / 2, h * .45, 0, 7); sx.fill();
  const R = async (name, f, ms) => out.results.push(await measure(tag + ' ' + name, f, ms));
  g.setTransform(1, 0, 0, 1, 0, 0);
  await R('nothing drawn', () => {});
  await R('1px rect', n => { g.fillStyle = n & 1 ? '#000' : '#111'; g.fillRect(0, 0, 1, 1); });
  await R('full rect', n => { g.fillStyle = n & 1 ? '#0a2bb8' : '#0a2bb9'; g.fillRect(0, 0, w, h); });
  await R('full blit (copy)', () => { g.globalCompositeOperation = 'copy'; g.drawImage(grad, 0, 0); g.globalCompositeOperation = 'source-over'; });
  await R('blit + figure-size sprite', (n, t) => { g.globalCompositeOperation = 'copy'; g.drawImage(grad, 0, 0); g.globalCompositeOperation = 'source-over'; g.drawImage(spr, Math.sin(t / 300) * 10, 0); });
  await R('blit + 5 full alpha blits', () => { g.globalCompositeOperation = 'copy'; g.drawImage(grad, 0, 0); g.globalCompositeOperation = 'source-over'; g.globalAlpha = .2; for (let i = 0; i < 5; i++) g.drawImage(grad, i, 0); g.globalAlpha = 1; });
  await R('blit + 8 text lines', (n, t) => { g.drawImage(grad, 0, 0); g.fillStyle = '#6ff'; g.font = `${80 * k}px MenuI`; for (let i = 0; i < 8; i++) { g.save(); g.translate(800 * k, (400 + i * 70) * k); g.rotate(-.2 + Math.sin(t / 500) * .01); g.fillText('PRIME VIDEO', 0, 0); g.restore(); } });
  await R('blit + 8 text lines fill+stroke', (n, t) => { g.drawImage(grad, 0, 0); g.fillStyle = g.strokeStyle = '#6ff'; g.lineWidth = 3 * k; g.font = `${80 * k}px MenuI`; for (let i = 0; i < 8; i++) { g.save(); g.translate(800 * k, (400 + i * 70) * k); g.rotate(-.2 + Math.sin(t / 500) * .01); g.fillText('PRIME VIDEO', 0, 0); g.strokeText('PRIME VIDEO', 0, 0); g.restore(); } });
  await R('blit + 30 small shapes', (n, t) => { g.drawImage(grad, 0, 0); g.fillStyle = '#f7d'; for (let i = 0; i < 30; i++) { g.save(); g.translate((100 + i * 60) * k, (200 + (i * 97 % 700) + Math.sin(t / 400 + i) * 20) * k); g.rotate(t / 900 + i); g.fillRect(-12 * k, -8 * k, 24 * k, 16 * k); g.restore(); } });
  await R('blit + giant clipped letters', (n, t) => { g.drawImage(grad, 0, 0); g.save(); g.beginPath(); g.moveTo(0, 0); g.lineTo(700 * k, 0); g.lineTo(300 * k, h); g.lineTo(0, h); g.clip(); g.fillStyle = '#000'; g.font = `${353 * k}px Title`; g.translate(-39 * k, (234 + Math.sin(t / 300) * 4) * k); g.rotate(Math.PI / 2); g.fillText('MAIN', 0, 0); g.restore(); });
  await R('blit + 64 strips (sway)', (n, t) => { g.drawImage(grad, 0, 0); for (let y = 0; y < 640 * k; y += 10 * k) g.drawImage(spr, 0, y, spr.width, 10 * k, Math.sin(t / 300 + y) * 5, y, spr.width, 10 * k); });
  const small = mk(640, 360), smx = small.getContext('2d'), id = smx.createImageData(640, 360); for (let i = 3; i < id.data.length; i += 4) id.data[i] = 128;
  await R('blit + pixel upload 640x360 scaled', () => { g.drawImage(grad, 0, 0); smx.putImageData(id, 0, 0); g.drawImage(small, 0, 0, w, h); });
  await R('blit + 1 shadowed text', (n, t) => { g.drawImage(grad, 0, 0); g.save(); g.shadowColor = '#004'; g.shadowBlur = 6; g.fillStyle = '#fff'; g.font = `${46 * k}px Hint`; g.fillText('Watch something ' + (n % 10), 1500 * k, 975 * k); g.restore(); });
};
await run(1920, 1080, 'FULL');
await run(1280, 720, '2/3');
await run(960, 540, 'HALF');
return out;
