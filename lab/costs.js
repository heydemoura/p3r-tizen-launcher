// How much does each kind of drawing call cost on this TV? The app's drawing is paused; each job repeats one kind of
// call N times per frame for about a second. Reported: script time per call, and the frame rate the TV kept meanwhile.
const cv = document.getElementById('c');
if (!window.__realRenderAt) window.__realRenderAt = window.renderAt;
window.renderAt = () => {};
cv.width = 1920; cv.height = 1080;
const g = cv.getContext('2d');
const mk = (w, h) => { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; };
const grad = mk(1920, 1080), gx = grad.getContext('2d'); { const lg = gx.createLinearGradient(0, 0, 0, 1080); lg.addColorStop(0, '#08f8ff'); lg.addColorStop(1, '#000fbe'); gx.fillStyle = lg; gx.fillRect(0, 0, 1920, 1080); }
const spr = mk(420, 110), sx = spr.getContext('2d'); sx.fillStyle = '#6ff'; sx.font = '110px MenuI'; sx.fillText('SPOTIFY', 0, 95);
const dot = mk(32, 32), dx_ = dot.getContext('2d'); dx_.strokeStyle = '#cff'; dx_.lineWidth = 2; dx_.beginPath(); dx_.arc(16, 16, 12, 0, 7); dx_.stroke();
const hero = mk(969, 1101), hx = hero.getContext('2d'); hx.fillStyle = '#fff'; hx.beginPath(); hx.arc(480, 550, 470, 0, 7); hx.fill();
const quad = new Path2D(); quad.moveTo(-1, -.4); quad.lineTo(.6, -1); quad.lineTo(1, .5); quad.lineTo(-.4, .8); quad.closePath();
const tri = new Path2D(); tri.moveTo(700, 500); tri.lineTo(1300, 380); tri.lineTo(1250, 560); tri.closePath();
const layer = mk(760, 690), lx = layer.getContext('2d');
const small = mk(420, 110), smx = small.getContext('2d');
const tex = mk(1280, 400), tx = tex.getContext('2d'); tx.fillStyle = 'rgba(150,255,255,.5)'; for (let i = 0; i < 300; i++) tx.fillRect((i * 97) % 1280, (i * 53) % 400, 60, 24);
const out = [];
const job = (name, n, body, ms = 900) => new Promise(done => {
  let frames = 0, js = 0, last = 0; const gaps = [], t0 = performance.now();
  const loop = () => {
    const now = performance.now(); if (last && frames > 3) gaps.push(now - last); last = now; frames++;
    g.setTransform(1, 0, 0, 1, 0, 0); g.globalAlpha = 1; g.globalCompositeOperation = 'copy'; g.drawImage(grad, 0, 0); g.globalCompositeOperation = 'source-over';
    const a = performance.now(); for (let i = 0; i < n; i++) body(i, now); js += performance.now() - a;
    if (now - t0 < ms) requestAnimationFrame(loop);
    else { const sum = gaps.reduce((x, y) => x + y, 0); gaps.sort((x, y) => x - y); out.push({ name, n, usPerCall: +(js / frames / n * 1000).toFixed(1), msPerFrame: +(js / frames).toFixed(2), fps: +(gaps.length / sum * 1000).toFixed(1), p95: +gaps[Math.floor(gaps.length * .95)].toFixed(1) }); g.setTransform(1, 0, 0, 1, 0, 0); done(); }
  };
  requestAnimationFrame(loop);
});
await job('nothing (loop overhead)', 100, () => {});
await job('setTransform', 200, (i, t) => { g.setTransform(1, .1, -.1, 1, i, i); });
await job('globalAlpha set', 200, i => { g.globalAlpha = .5 + (i & 1) * .1; });
await job('fillStyle set (string)', 200, i => { g.fillStyle = i & 1 ? '#ff78d2' : '#8c3ce4'; });
await job('drawImage sprite 3-arg', 100, (i, t) => { g.drawImage(spr, 100 + (i % 10) * 170, 60 + ((i / 10) | 0) * 100); });
await job('setTransform + drawImage sprite (rotated)', 100, (i, t) => { g.setTransform(.95, -.3, .3, .95, 100 + (i % 10) * 170, 100 + ((i / 10) | 0) * 100); g.drawImage(spr, 0, 0); });
await job('drawImage sprite 5-arg scaled', 100, (i, t) => { g.drawImage(spr, 100 + (i % 10) * 170, 60 + ((i / 10) | 0) * 100, 300, 80); });
await job('drawImage 9-arg strip', 100, (i, t) => { g.drawImage(hero, 0, i * 10, 969, 10, 20 + Math.sin(t / 300 + i) * 5, i * 10, 969, 10); });
await job('drawImage tiny ring (bubble) 5-arg', 100, (i, t) => { g.drawImage(dot, (i * 191) % 1900, (i * 97 + t / 20) % 1060, 14, 14); });
await job('arc ring as path (4 calls)', 100, (i, t) => { g.strokeStyle = '#cff'; g.beginPath(); g.arc((i * 191) % 1900, (i * 97 + t / 20) % 1060, 7, 0, 7); g.stroke(); });
await job('setTransform + fill(Path2D quad) + style', 100, (i, t) => { const s = 20, a = t / 900 + i, c = Math.cos(a) * s, sn = Math.sin(a) * s; g.setTransform(c, sn, -sn, c, (i * 191) % 1900, (i * 97) % 1060); g.fillStyle = i & 1 ? '#ff78d2' : '#8c3ce4'; g.fill(quad); });
await job('save/translate/rotate/scale/poly/restore (old shard)', 100, (i, t) => { g.save(); g.translate((i * 191) % 1900, (i * 97) % 1060); g.rotate(t / 900 + i); g.scale(20, 14); g.globalAlpha = .7; g.fillStyle = 'rgba(255,120,210,1)'; g.beginPath(); g.moveTo(-1, -.4); g.lineTo(.6, -1); g.lineTo(1, .5); g.lineTo(-.4, .8); g.closePath(); g.fill(); g.restore(); });
await job('big hero blit', 5, (i, t) => { g.drawImage(hero, i * 3, Math.round(Math.sin(t / 500) * 5)); });
await job('fill big polygon path (17 pts)', 5, (i) => { g.fillStyle = '#fff'; g.beginPath(); g.moveTo(0, 0); for (let k = 0; k < 16; k++) g.lineTo(735 - k * 30, k * 70); g.lineTo(0, 1080); g.closePath(); g.fill(); });
await job('clip(triangle) + sprite + restore', 20, (i) => { g.save(); g.clip(tri); g.drawImage(spr, 760, 400 + i); g.restore(); });
await job('font set (changing size)', 20, (i) => { g.font = (100 + i) + 'px MenuI'; });
await job('font set + letterSpacing + fillText', 10, (i, t) => { g.font = '110px MenuI'; g.letterSpacing = '-7px'; g.fillStyle = '#6ff'; g.fillText('PRIME VIDEO', 60, 120 + i * 95); g.letterSpacing = '0px'; });
await job('font set + fillText + strokeText (menu line)', 10, (i, t) => { g.font = '110px MenuI'; g.letterSpacing = '-7px'; g.fillStyle = g.strokeStyle = '#6ff'; g.lineWidth = 3.7; g.lineJoin = 'miter'; g.fillText('PRIME VIDEO', 60, 120 + i * 95); g.strokeText('PRIME VIDEO', 60, 120 + i * 95); g.letterSpacing = '0px'; });
await job('repaint one small text sprite (clear + fill + stroke)', 1, (i, t) => { smx.clearRect(0, 0, 420, 110); smx.font = '110px MenuI'; smx.fillStyle = smx.strokeStyle = '#6ff'; smx.lineWidth = 3.7; smx.fillText('SPOTIFY', 0, 95); smx.strokeText('SPOTIFY', 0, 95); g.drawImage(small, 60, 60); });
await job('compose 9 sprites into a layer + light overlay + blit', 1, (i, t) => { lx.setTransform(1, 0, 0, 1, 0, 0); lx.globalCompositeOperation = 'source-over'; lx.globalAlpha = 1; lx.clearRect(0, 0, 760, 690); for (let k = 0; k < 9; k++) { lx.setTransform(.97, -.2, .2, .97, 60 + k * 8, 110 + k * 62); lx.drawImage(spr, 0, 0); } lx.setTransform(.62, 0, 0, 1.9, 0, 0); lx.globalCompositeOperation = 'source-atop'; lx.globalAlpha = .15; lx.drawImage(tex, (t * .03) % 1280 - 1280, 0); lx.drawImage(tex, (t * .03) % 1280, 0); g.drawImage(layer, 640, 300); });
await job('gradient shaft made each frame (old)', 4, (i, t) => { g.save(); g.globalCompositeOperation = 'lighter'; const lg = g.createLinearGradient(0, 0, 0, 720); lg.addColorStop(0, 'rgba(120,235,255,.07)'); lg.addColorStop(1, 'rgba(120,235,255,0)'); g.fillStyle = lg; g.beginPath(); g.moveTo(1240 + i * 150, 0); g.lineTo(1300 + i * 150, 0); g.lineTo(1200 + i * 150, 720); g.lineTo(1090 + i * 150, 720); g.fill(); g.restore(); });
// the opening "foam": per-pixel loop over a small picture + upload + enlarge
for (const [fw, fh] of [[640, 360], [320, 180]]) {
  const fc = mk(fw, fh), fx = fc.getContext('2d'), pix = fx.createImageData(fw, fh), T = new Float32Array(fw * fh); for (let i = 0; i < T.length; i++) T[i] = 230 + ((i * 7919) % 1600);
  await job(`foam pixel loop ${fw}x${fh} + upload + enlarge`, 1, (i, now) => { const d = pix.data, n = fw * fh, t = 300 + (now % 1700); for (let p = 0, j = 0; p < n; p++, j += 4) { const left = T[p] - t; if (left <= -174) { d[j + 3] = 0; continue; } if (left >= 4) { d[j] = d[j + 1] = d[j + 2] = d[j + 3] = 255; continue; } let a = left / 7 + .5; a = a < 0 ? 0 : a > 1 ? 1 : a; d[j] = d[j + 1] = d[j + 2] = 255; d[j + 3] = a * 255; } fx.putImageData(pix, 0, 0); g.drawImage(fc, 0, 0, 1920, 1080); }, 1200);
}
// WebGL: can a second canvas on top draw a full-screen shader pass cheaply?
try {
  const t0 = performance.now(); const gc = mk(1920, 1080); gc.style.cssText = 'position:absolute;left:0;top:0;width:100vw;height:100vh;pointer-events:none'; document.body.appendChild(gc);
  const gl = gc.getContext('webgl', { alpha: true, premultipliedAlpha: true, antialias: false });
  const sh = (type, src) => { const s = gl.createShader(type); gl.shaderSource(s, src); gl.compileShader(s); if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s)); return s; };
  const pr = gl.createProgram(); gl.attachShader(pr, sh(gl.VERTEX_SHADER, 'attribute vec2 p; varying vec2 v; void main(){ v = p * .5 + .5; gl_Position = vec4(p, 0., 1.); }'));
  gl.attachShader(pr, sh(gl.FRAGMENT_SHADER, 'precision mediump float; varying vec2 v; uniform sampler2D s; uniform float t; void main(){ vec4 a = texture2D(s, v), b = texture2D(s, v + vec2(.0016, 0.)), c = texture2D(s, v + vec2(0., .0028)), d = texture2D(s, v + vec2(.0016, .0028)); float f = (a.r + b.r + c.r + d.r) * .25; float al = clamp((f - t) * 40. + .5, 0., 1.) * .35; gl_FragColor = vec4(al, al, al, al); }'));
  gl.linkProgram(pr); gl.useProgram(pr);
  const buf = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, buf); gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW); gl.enableVertexAttribArray(0); gl.bindAttribLocation(pr, 0, 'p'); gl.vertexAttribPointer(gl.getAttribLocation(pr, 'p'), 2, gl.FLOAT, false, 0, 0);
  const texd = new Uint8Array(640 * 360 * 4); for (let i = 0; i < texd.length; i++) texd[i] = (i * 31) & 255;
  const tx2 = gl.createTexture(); gl.bindTexture(gl.TEXTURE_2D, tx2); gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 640, 360, 0, gl.RGBA, gl.UNSIGNED_BYTE, texd); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  const ut = gl.getUniformLocation(pr, 't'); gl.viewport(0, 0, 1920, 1080); const setup = performance.now() - t0;
  await job(`WebGL full-screen shader pass on a second canvas (set-up took ${setup.toFixed(0)} ms)`, 1, (i, now) => { gl.uniform1f(ut, (now % 1000) / 1000); gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4); }, 1500);
  gc.remove();
} catch (e) { out.push({ name: 'WebGL failed: ' + e.message }); }
return out;
