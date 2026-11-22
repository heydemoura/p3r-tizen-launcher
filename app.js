// Main Menu: a TV home screen (fan theme). Its canvas layers share one animation clock,
// so the same code runs live on the TV and renders deterministic frames for previews.
//
// How a frame is kept cheap (measured on the TV, where a canvas call costs 5–30 µs and drawing a word 150–250 µs):
// everything that can be drawn ahead of time is — every word, the giant title, the figure, the clock — as ready-made
// pictures ("sprites"). A frame then only places pictures and fills a few simple shapes; no text is drawn while animating.
'use strict';
(function () {
const W = 1920, H = 1080;
const cv = document.getElementById('c');
const g = cv.getContext('2d');
const Q = new URLSearchParams(location.search);
const TV = typeof tizen !== 'undefined';
const CAPTURE = !!Q.get('capture'), PROF = !!Q.get('prof');
const EVERY_FRAME = CAPTURE && !Q.get('live');      // previews refresh everything on every frame; ?live=1 measures the TV's rhythm instead
const X = {}; (Q.get('x') || '').split(',').forEach(k => { if (k) X[k] = true; });      // ?x=a,b switches experiments on (lab use)
const OFF = window.__off = {};                       // window.__off.<part> = true leaves a part of the picture out (for measuring what it costs)

// ───────────────────────── helpers ─────────────────────────
const clamp = (v, a = 0, b = 1) => v < a ? a : v > b ? b : v;
const lerp = (a, b, t) => a + (b - a) * t;
const sstep = (a, b, x) => { const t = clamp((x - a) / (b - a)); return t * t * (3 - 2 * t); };
const eOut = t => 1 - Math.pow(1 - clamp(t), 3);
const eOut5 = t => 1 - Math.pow(1 - clamp(t), 5);
const eIn = t => Math.pow(clamp(t), 3);
const eIO = t => { t = clamp(t); return t < .5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2; };
const eBack = (t, c = 1.7) => { t = clamp(t); return 1 + (c + 1) * Math.pow(t - 1, 3) + c * Math.pow(t - 1, 2); };
const prog = (t, start, dur) => clamp((t - start) / dur);
function rng(seed) { let s = seed % 2147483647; if (s <= 0) s += 2147483646; return () => (s = s * 16807 % 2147483647, (s - 1) / 2147483646); }
const DEG = Math.PI / 180;
const rgb = (c, a = 1) => `rgba(${c[0] | 0},${c[1] | 0},${c[2] | 0},${a})`;
const mkCanvas = (w, h) => { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; };
function pathOf(pts) { const p = new Path2D(); p.moveTo(pts[0][0], pts[0][1]); for (let i = 1; i < pts.length; i++) p.lineTo(pts[i][0], pts[i][1]); p.closePath(); return p; }
if (!CanvasRenderingContext2D.prototype.roundRect) CanvasRenderingContext2D.prototype.roundRect = function (x, y, w, h, r) {
  this.moveTo(x + r, y); this.arcTo(x + w, y, x + w, y + h, r); this.arcTo(x + w, y + h, x, y + h, r); this.arcTo(x, y + h, x, y, r); this.arcTo(x, y, x + w, y, r); this.closePath();
};

// ───────────────────────── what went wrong, for runs on a real TV ─────────────────────────
const diag = { errors: [], notes: [], apps: null, sources: null, setup: {} };
let _st = performance.now(); const lap = name => { const n = performance.now(); diag.setup[name] = Math.round(n - _st); _st = n; };
function note(s) { diag.notes.push(s); if (diag.notes.length > 40) diag.notes.shift(); }
function oops(where, e) {
  const m = where + ': ' + (e && e.name ? e.name + ' ' : '') + (e && e.message !== undefined ? e.message : e);
  if (diag.errors.length < 20) diag.errors.push(m);
  try { console.error(m); } catch (_) {}
}
addEventListener('error', e => oops('script', e.error || e.message));
addEventListener('unhandledrejection', e => oops('promise', e.reason));

// ───────────────────────── content ─────────────────────────
// These installed apps start on Home by default. Other installed apps can be added from Apps.
// Keys identify saved settings, IDs identify TV apps, and names are a fallback when an app has another ID.
const CATALOG = [
  { key: 'youtube', label: 'YOUTUBE', cmd: 'Watch YouTube', names: [/^youtube$/i], ids: ['9Ur5IzDKqV.TizenYouTube', '111299001912'] },
  { key: 'crunchyroll', label: 'CRUNCHYROLL', cmd: 'Watch Crunchyroll', names: [/^crunchyroll/i], ids: ['OGLLvqej7u.CrunchyrollWebApp'] },
  { key: 'jellyfin', label: 'JELLYFIN', cmd: 'Watch Jellyfin', names: [/^jellyfin/i], ids: ['rTn6ClEurC.Jellyfin', 'AprZAARz4r.Jellyfin'] },
  { key: 'spotify', label: 'SPOTIFY', cmd: 'Play Music', names: [/^spotify/i], ids: ['rJeHak5zRg.Spotify', '3201606009684'] },
  { key: 'moonlight', label: 'MOONLIGHT', cmd: 'Play from the PC', names: [/^moonlight/i], ids: ['MoonLightS.MoonlightWasm', 'ChqHQExU28.MoonlightNaCl'] },
  { key: 'netflix', label: 'NETFLIX', cmd: 'Watch Netflix', names: [/^netflix$/i], ids: ['org.tizen.netflix-app', '3201907018807'] },
  { key: 'disney', label: 'DISNEY+', cmd: 'Watch Disney+', names: [/^disney\s*(\+|plus)$/i], ids: ['MCmYXNxgcu.DisneyPlus', '3201901017640'] },
  { key: 'prime', label: 'PRIME VIDEO', cmd: 'Watch Prime Video', names: [/^prime video$/i], ids: ['org.tizen.primevideo', '3201910019365'] },
  { key: 'apple', label: 'APPLE TV', cmd: 'Watch Apple TV', names: [/^apple tv(\+)?$/i], ids: ['com.samsung.tv.aria-video', '3201807016597'] },
];
const INPUTS_ENTRY = { key: 'inputs', label: 'INPUTS', cmd: 'Switch Source', screen: 'list' };
const SETTINGS_ENTRY = { key: 'settings', label: 'SETTINGS', cmd: 'Configure apps and inputs', screen: 'settings' };
const catalogByKey = new Map(CATALOG.map(entry => [entry.key, entry]));
function installedEntry(appId, displayName, preset) {
  if (preset) return { ...preset, appId, displayName };
  return { key: 'tv:' + appId, appId, displayName, label: displayName.toUpperCase(), cmd: 'Open ' + displayName };
}
const DEMO_MENU = Q.get('demo') === '9' || !!Q.get('p3');
// Lines on screen at once; a longer list slides. The game shows nine, but its third line is cut so steep and short (for
// "EQUIP") that an app name there gets buried by its neighbours, so app lists use the other eight.
const VIS = +(Q.get('vis') || (Q.get('p3') || Q.get('demo') ? 9 : 8));
// The browser preview uses sample apps. The TV starts from its last inventory or waits for a live answer.
let discoveredApps = TV && !CAPTURE ? [] : CATALOG.filter(a => a.key !== 'moonlight');
let menuChoices = new Map([INPUTS_ENTRY, ...discoveredApps].map(entry => [entry.key, entry]));
let APPS = [INPUTS_ENTRY, ...discoveredApps, SETTINGS_ENTRY];
if (Q.get('demo') === '9') APPS = [['NETFLIX', 'Watch Netflix'], ['PLEX', 'Open the Library'], ['GAMES', 'Play Cloud Games'], ['YOUTUBE', 'Watch YouTube'], ['DISNEY+', 'Watch Disney+'],
  ['SPOTIFY', 'Play Music'], ['PRIME VIDEO', 'Watch Prime Video']].map(([label, cmd]) => ({ label, cmd, ids: [] })).concat([SETTINGS_ENTRY, INPUTS_ENTRY]);
if (Q.get('p3')) APPS = ['SKILL', 'ITEM', 'EQUIP', 'PERSONA', 'STATS', 'QUEST', 'SOCIAL LINK', 'CALENDAR', 'SYSTEM'].map(label => ({ label, cmd: 'Use a Skill', ids: [] }));
const cmdOf = a => a.missing ? 'Not installed on this TV' : a.cmd;

// baseline-left corner, angle and cap height of each line, measured off the game's main menu (1080p units)
const SLOTS = [   // sx: how condensed the game draws that line, len: its length there; room: the longest a name may run before it is set smaller;
                  // flat: the angle a long name takes on a line the game drew steep for a short word (so it does not climb into the line above)
  { x: 843, y: 430, a: -22, cap: 50, sx: .85, len: 190, room: 280 }, { x: 878, y: 515, a: -13, cap: 60, sx: .82, len: 158, room: 320 }, { x: 840, y: 593, a: -23, cap: 60, sx: .79, len: 184, room: 236, flat: -14 },
  { x: 789, y: 677, a: -20, cap: 69, sx: .82, len: 358, room: 440 }, { x: 854, y: 688, a: -4, cap: 52, sx: .99, len: 211, room: 330 }, { x: 808, y: 756, a: -10, cap: 55, sx: .95, len: 223, room: 340 },
  { x: 835, y: 805, a: -6, cap: 49, sx: .97, len: 381, room: 440 }, { x: 777, y: 866, a: -3.5, cap: 52, sx: .92, len: 347, room: 430 }, { x: 835, y: 903, a: 9, cap: 52, sx: .89, len: 252, room: 350 },
];
// Preview data for the Inputs screen. On the TV this is replaced by what the TV reports.
const DEMO_SOURCES = [
  { name: 'PlayStation 5', port: 'HDMI 1', live: true, info: ['4K · 120 Hz · HDR · Game Mode', 'Controller connected.'], stats: [['RES', '2160'], ['HZ', '120']], kind: 'pad' },
  { name: 'Gaming PC', port: 'HDMI 2', info: ['1440p · 144 Hz · VRR', 'Last used yesterday.'], stats: [['RES', '1440'], ['HZ', '144']], kind: 'pc' },
  { name: 'Soundbar', port: 'HDMI 3', info: ['eARC · Dolby Atmos pass-through', 'Audio only.'], stats: [['CH', '5.1'], ['BIT', '24']], kind: 'spk' },
  { name: 'Antenna TV', port: 'TUNER', info: ['Digital channels', '42 channels stored.'], kind: 'pc' },
  { name: 'AirPlay', port: 'CAST', info: ['Screen mirroring from a phone', 'Waiting for a device.'], kind: 'pc' },
  { name: 'USB Drive', port: 'USB', dim: true, info: ['No drive connected', ''], kind: 'pc' },
];
const INPUT_NAMES_KEY = 'mainmenu.input-names.1';
let inputNames = new Map();
let SOURCES = [];
const settingsHub = makeSettingsHub();
const inputSettings = makeInputSettings();
const FAKE_NOW = new Date(2026, 10, 22, 21, 48, 0);

// ───────────────────────── state ─────────────────────────
const S = {
  t: 0, mode: 'home', tMode: -1e6, prevMode: 'home',
  sel: 0, tSel: -1e6, prevSel: 0,
  top: 0, prevTop: 0, tTop: -1e6,          // first line of the visible window, for lists longer than the window
  lsel: 0, tLsel: -1e6,
  settingsSel: 0, hubSel: 0, prevHubSel: 0, tHubSel: -1e6,
  inputSel: 0, prevInputSel: 0, tInputSel: -1e6,
  tLaunch: -1e6, launchApp: null,
  notice: null, tNotice: -1e6,          // short message shown in place of the command text
  debug: !!Q.get('debug'), passthrough: false,
};
let frameNo = 0;

// ───────────────────────── picture quality and ready-made pictures ─────────────────────────
// Level 2 is what the TV runs. Lower levels drop small things; only level 0 lowers the resolution. Level 3 adds two
// effects that need many more drawing calls per frame (the figure's sway, the ripple over the menu) for fast machines.
const QUALITY = [
  { rs: 2 / 3, cauDiv: 4, cauEvery: 6, shards: 14, bubbles: 0, blobs: 4, shafts: false, sway: false, ripple: 0 },
  { rs: 1, cauDiv: 2, cauEvery: 5, shards: 20, bubbles: 12, blobs: 6, shafts: true, sway: false, ripple: 0 },
  { rs: 1, cauDiv: 2, cauEvery: 4, shards: 30, bubbles: 24, blobs: 9, shafts: true, sway: false, ripple: 0 },
  { rs: 1, cauDiv: 1, cauEvery: 2, shards: 30, bubbles: 34, blobs: 9, shafts: true, sway: true, ripple: 2 },
];
let q = 2, QL = QUALITY[2], RS = 1;       // RS: canvas pixels per layout unit
// A sprite is a ready-made picture of one thing. (ox, oy) is where its top-left corner sits relative to the thing's
// anchor point, in layout units, so drawing it is one call under whatever transform is current. `x` is its drawing
// context, already set up so the builder draws in the same anchor-relative coordinates. `k` builds it finer or coarser.
function sprite(ox, oy, w, h, k) {
  const s = RS * (k || 1), c = mkCanvas(Math.max(1, Math.ceil(w * s)), Math.max(1, Math.ceil(h * s))), x = c.getContext('2d');
  x.setTransform(s, 0, 0, s, -ox * s, -oy * s);
  const sp = { c, x, ox, oy, w: c.width / s, h: c.height / s };
  fresh.push(sp); return sp;
}
// The first time a picture is drawn costs the TV about a millisecond more than every later time (and the first full
// frame of the opening used fifty of them at once). So each new picture is drawn once, tiny and as good as invisible,
// in the frame it was made in: the cost then falls where there is time for it, not in the middle of a movement.
const fresh = [];
function touch() {
  if (!fresh.length) return;
  T0(); g.globalCompositeOperation = 'source-over'; g.globalAlpha = .004;
  for (let i = 0; i < fresh.length; i++) g.drawImage(fresh[i].c, 0, 0, 1, 1);
  g.globalAlpha = 1; fresh.length = 0;
}
const put = (c, s) => c.drawImage(s.c, s.ox, s.oy, s.w, s.h);
const putAt = (c, s, x, y) => c.drawImage(s.c, x + s.ox, y + s.oy, s.w, s.h);
const T0 = () => g.setTransform(RS, 0, 0, RS, 0, 0);
const TF = (c, a, b, cc, d, e, f) => c.setTransform(a * RS, b * RS, cc * RS, d * RS, e * RS, f * RS);
// Pictures that are not needed for the first frame are made a little at a time while nothing is moving.
const jobs = [], urgent = [];      // urgent: wanted by a transition that has already begun
let eager = true;                  // until the opening begins everything is made at once: nothing is on screen yet that could stutter
function later(fn) { if (CAPTURE || eager) fn(); else jobs.push(fn); }
function runJob(list) { try { list.shift()(); } catch (e) { oops('picture', e); } }

// ───────────────────────── water ─────────────────────────
const GRAD = [[0, [8, 248, 255]], [60, [12, 231, 254]], [100, [13, 220, 255]], [150, [14, 201, 254]], [200, [13, 160, 254]],
  [260, [11, 138, 240]], [330, [8, 118, 220]], [400, [5, 100, 207]], [480, [3, 84, 198]], [560, [4, 74, 196]], [640, [6, 64, 196]],
  [720, [7, 56, 196]], [800, [8, 49, 196]], [850, [8, 45, 196]], [900, [9, 44, 196]], [950, [7, 40, 194]], [1000, [5, 33, 195]],
  [1050, [1, 22, 193]], [1080, [0, 15, 190]]];
const waterGrad = g.createLinearGradient(0, 0, 0, H);
for (const [y, c] of GRAD) waterGrad.addColorStop(y / H, rgb(c));

// value-noise islands, tileable in x, used for the light patches on the surface
function noiseTex(seed, w, h, cellX, cellY, thr, soft, col) {
  const c = mkCanvas(w, h), x = c.getContext('2d'), id = x.createImageData(w, h), d = id.data, r = rng(seed);
  const mk = (cx, cy, wt) => {
    const gw = Math.round(w / cx), gh = Math.ceil(h / cy) + 2, a = new Float32Array(gw * gh); for (let i = 0; i < a.length; i++) a[i] = r();
    const X0 = new Int32Array(w), X1 = new Int32Array(w), TX = new Float32Array(w);       // which lattice columns each pixel column sits between
    for (let px = 0; px < w; px++) { const fx = px / cx, x0 = Math.floor(fx); let t = fx - x0; TX[px] = t * t * (3 - 2 * t); X0[px] = ((x0 % gw) + gw) % gw; X1[px] = (X0[px] + 1) % gw; }
    return { gw, gh, a, cy, wt, X0, X1, TX };
  };
  const octs = [mk(cellX, cellY, .58), mk(cellX / 2.5, cellY / 2.2, .3), mk(cellX / 5.5, cellY / 4.5, .12)];
  const row = new Float32Array(w), lo = thr - soft, inv = 1 / (2 * soft);
  for (let py = 0; py < h; py++) {
    row.fill(0);
    for (const o of octs) {
      const fy = py / o.cy, y0 = Math.floor(fy); let ty = fy - y0; ty = ty * ty * (3 - 2 * ty);
      const r0 = Math.min(y0, o.gh - 1) * o.gw, r1 = Math.min(y0 + 1, o.gh - 1) * o.gw, a = o.a, X0 = o.X0, X1 = o.X1, TX = o.TX, wt = o.wt;
      for (let px = 0; px < w; px++) {
        const i0 = X0[px], i1 = X1[px], tx = TX[px], top = a[r0 + i0] + (a[r0 + i1] - a[r0 + i0]) * tx, bot = a[r1 + i0] + (a[r1 + i1] - a[r1 + i0]) * tx;
        row[px] += (top + (bot - top) * ty) * wt;
      }
    }
    for (let px = 0, i = py * w * 4; px < w; px++, i += 4) {
      let t = (row[px] - lo) * inv; t = t < 0 ? 0 : t > 1 ? 1 : t;
      d[i] = col[0]; d[i + 1] = col[1]; d[i + 2] = col[2]; d[i + 3] = 255 * t * t * (3 - 2 * t);
    }
  }
  x.putImageData(id, 0, 0); return c;
}
// The surface light is two drifting island maps cut by each other and by a mask (an inverted triangle at the top right
// plus a thin band along the surface). The maps are made at the size they are used at.
const CW = 1280, CH = 400, CX0 = W - CW;
let texB = null, cauA, cauB, cauM, cau, cauX, cauS = 1, cauFresh = false, cauFor = 0;
function buildCaustics() {
  if (cauFor === QL.cauDiv) return;
  cauFor = QL.cauDiv; cauS = 1 / QL.cauDiv; const cs = cauS, w = Math.round(CW * cs), h = Math.round(CH * cs);
  const texA = noiseTex(31, w, h, 80 * cs, 26 * cs, .5, .012, [150, 255, 255]);
  texB = noiseTex(77, w, h, 64 * cs, 34 * cs, .47, .012, [150, 255, 255]);
  cauM = mkCanvas(w, h); { const x = cauM.getContext('2d'), id = x.createImageData(w, h), d = id.data;
    for (let py = 0; py < h; py++) for (let px = 0; px < w; px++) {
      const Y = (py + .5) / cs, X = (px + .5) / cs + CX0, cl = 1575 - Y * .25, hw = 430 * (1 - Y / 345) + 20;
      const m1 = Y < 345 ? Math.pow(clamp(1.25 - Math.abs(X - cl) / hw * 1.25), .8) * Math.pow(clamp(1 - Y / 345), .45) : 0;
      const m2 = clamp(1 - Y / 70) * .7 * clamp((X - 900) / 260);
      const i = (py * w + px) * 4; d[i] = d[i + 1] = d[i + 2] = 255; d[i + 3] = 255 * clamp(Math.max(m1, m2));
    }
    x.putImageData(id, 0, 0); }
  const twice = src => { const c = mkCanvas(w * 2, h), x = c.getContext('2d'); x.drawImage(src, 0, 0); x.drawImage(src, w, 0); return c; };   // side by side, so one copy covers any drift
  cauA = twice(texA); cauB = twice(texB); cau = mkCanvas(w, h); cauX = cau.getContext('2d'); cauFresh = false;
}
function updateCaustics(t) {
  const w = cau.width, h = cau.height, x = cauX, wrap = v => ((v % w) + w) % w;
  x.globalCompositeOperation = 'copy'; x.drawImage(cauA, w - wrap(t * .011 * cauS), 0, w, h, 0, Math.sin(t / 2300) * 5 * cauS, w, h);
  x.globalCompositeOperation = 'destination-in'; x.drawImage(cauB, w - wrap((-t * .016 + 300) * cauS), 0, w, h, 0, Math.cos(t / 1900) * 6 * cauS, w, h); x.drawImage(cauM, 0, 0);
  cauFresh = true;
}
const R0 = rng(5);
const blobs = Array.from({ length: 9 }, () => ({ x: 900 + R0() * 760, y: R0(), r: 16 + R0() * 26, sp: 9 + R0() * 16, ph: R0() * 7, k: .6 + R0() * .7 }));
const bubbles = Array.from({ length: 34 }, () => ({ x: R0() * W, off: R0() * 1300, r: 1.5 + Math.pow(R0(), 2.2) * 7, sp: 30 + R0() * 80, ph: R0() * 7, f: .4 + R0() }));
const BR = 42;
let gradSpr, blobSpr, shaftSpr, ringSpr;
function buildWater() {
  gradSpr = sprite(0, 0, W, H); gradSpr.x.fillStyle = waterGrad; gradSpr.x.fillRect(0, 0, W, H);
  // one soft out-of-focus bubble pair; drawn at half strength so that where the two overlap it reads a little denser
  blobSpr = sprite(-1.2 * BR, -1.72 * BR, 2.7 * BR, 2.8 * BR); { const x = blobSpr.x; x.fillStyle = 'rgba(70,170,255,.5)';
    x.beginPath(); x.ellipse(0, 0, BR * 1.15, BR, .3, 0, 7); x.fill(); x.beginPath(); x.ellipse(BR * .8, -BR * 1.1, BR * .62, BR * .56, 0, 0, 7); x.fill(); }
  // light shafts: slanted bands that fade out downwards (soft shapes, so half resolution is plenty)
  shaftSpr = [0, 1, 2, 3].map(i => { const w = 46 + i * 14, s = sprite(-152, 0, 154 + w, 720, .5), x = s.x, lg = x.createLinearGradient(0, 0, 0, 720);
    lg.addColorStop(0, 'rgba(120,235,255,1)'); lg.addColorStop(1, 'rgba(120,235,255,0)'); x.fillStyle = lg;
    x.beginPath(); x.moveTo(0, 0); x.lineTo(w, 0); x.lineTo(w * 1.5 - 150, 720); x.lineTo(-150, 720); x.fill(); return s; });
  // tiny bubble rings in three sizes
  ringSpr = [2, 3.6, 6.5].map(r => { const s = sprite(-(r + 2), -(r + 2), 2 * r + 4, 2 * r + 4, 2); s.x.strokeStyle = 'rgb(190,240,255)'; s.x.lineWidth = 1.5; s.x.beginPath(); s.x.arc(0, 0, r, 0, 7); s.x.stroke(); s.r = r; return s; });
}
function drawBackground(t, c = g) {
  const s = t / 1000;
  TF(c, 1, 0, 0, 1, 0, 0); c.globalAlpha = 1;
  if (OFF.water) { c.fillStyle = '#0a2bb8'; c.fillRect(0, 0, W, H); return; }
  c.globalCompositeOperation = 'copy'; c.drawImage(gradSpr.c, 0, 0, W, H); c.globalCompositeOperation = 'source-over';
  mark('w.bg');
  if (!OFF.blobs) for (let i = 0; i < QL.blobs; i++) {      // soft out-of-focus bubbles drifting up
    const b = blobs[i], y = 620 - ((s * b.sp + b.y * 640) % 640), a = clamp(y / 90) * clamp((620 - y) / 200) * .68;
    if (a < .01) continue;
    const x = b.x + Math.sin(s * .5 * b.k + b.ph) * 16, k = b.r / BR;
    c.globalAlpha = a; c.drawImage(blobSpr.c, x + blobSpr.ox * k, y + blobSpr.oy * k, blobSpr.w * k, blobSpr.h * k);
  }
  mark('w.blobs');
  if (QL.shafts && !OFF.shafts) {
    c.globalCompositeOperation = 'lighter';
    for (let i = 0; i < 4; i++) { const sp = shaftSpr[i]; c.globalAlpha = .05 + .03 * Math.sin(s * .7 + i); c.drawImage(sp.c, 1240 + i * 150 + Math.sin(s * .23 + i * 2.1) * 40 + sp.ox, 0, sp.w, sp.h); }
    c.globalCompositeOperation = 'source-over';
  }
  mark('w.shafts');
  if (!OFF.caustics) {
    if (c !== g || EVERY_FRAME || !cauFresh || frameNo % QL.cauEvery === 0) updateCaustics(t);
    c.globalAlpha = .8; c.drawImage(cau, CX0, 0, CW, CH);
  }
  mark('w.caustics');
  if (!OFF.bubbles) for (let i = 0; i < QL.bubbles; i++) {      // tiny bubbles
    const b = bubbles[i], y = 1110 - ((s * b.sp + b.off) % 1300), a = clamp((1110 - y) / 200) * clamp(y / 300) * .5;
    if (a < .01) continue;
    const x = b.x + Math.sin(s * b.f + b.ph) * 9, sp = ringSpr[b.r <= 2.6 ? 0 : b.r <= 5 ? 1 : 2], k = b.r / sp.r;
    c.globalAlpha = a; c.drawImage(sp.c, x + sp.ox * k, y + sp.oy * k, sp.w * k, sp.h * k);
  }
  c.globalAlpha = 1;
}

// ───────────────────────── the figure, his white wedge and the giant title ─────────────────────────
const reduceMenuMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
const homeScene = new Image();
let diveWater = null;
homeScene.src = 'assets/home-scene.webp';

// The Quest screen uses a masked frame atlas.
function loadIdleArt(src, frames, columns, x, y, w, h) {
  const image = new Image(); image.src = src;
  return { image, frames, columns, x, y, w, h, tiles: [] };
}
// The Home layer reconstructs the recorded poses at their source resolution.
let motionCanvas = null, homeRenderer = null, homeLoading = null, homeSettled = false;
let lastHomePose = -1, homeZoom = 1;
function loadHomeFrames(software = false) {
  if (reduceMenuMotion.matches) return Promise.resolve();
  if (homeLoading) return homeLoading;
  if (typeof HOME_MOTION_FRAMES === 'undefined') {
    note('Home animation manifest unavailable; using the still poster');
    homeSettled = true;
    return Promise.resolve();
  }
  const spec = HOME_MOTION_FRAMES;
  const load = file => new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error(file));
    image.src = 'assets/home-frames/' + file;
  });
  let timer;
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => reject(new Error('Timed out loading Home animation')), 12000);
  });
  homeLoading = Promise.race([Promise.all([spec.map, ...spec.pages].map(load)), timeout])
    .then(([map, ...pages]) => {
      let canvas = mkCanvas(spec.width, spec.height);
      try { homeRenderer = makeHomeMotion(canvas, spec, map, pages, CAPTURE, software); }
      catch (e) {
        note('Home graphics path: ' + e.message);
        canvas = mkCanvas(spec.width, spec.height);
        homeRenderer = makeHomeMotion(canvas, spec, map, pages, CAPTURE, true);
      }
      homeRenderer.draw(0);
      if (!CAPTURE) { canvas.id = 'home-motion'; canvas.style.display = 'none'; cv.before(canvas); }
      motionCanvas = canvas; homeZoom = 1;
      canvas.addEventListener('webglcontextlost', e => {
        e.preventDefault(); canvas.remove(); homeRenderer = motionCanvas = homeLoading = null;
        lastHomePose = -1; homeSettled = false;
        loadHomeFrames(true);
      }, {once: true});
    }).catch(e => oops('Home motion', e)).finally(() => { clearTimeout(timer); homeSettled = true; });
  return homeLoading;
}
loadHomeFrames();
reduceMenuMotion.addListener(() => loadHomeFrames());
const heroImg = new Image();
let heroOK = false, heroSpr = null, heroTint = null, swayL = null, swayReady = false;
const HEAD = [330, 820], HERO_K = 1.016;
function buildHero() {       // the figure at its on-screen size, ready to copy
  heroSpr = sprite(-6, -15, 969, 1101); const x = heroSpr.x; x.imageSmoothingQuality = 'high';
  x.translate(HEAD[0], HEAD[1]); x.scale(HERO_K, HERO_K); x.translate(-HEAD[0], -HEAD[1]); x.drawImage(heroImg, 0, 0, 950, 1080);
  swayL = null; swayReady = false; heroTint = null;
}
function tintedHero() {      // the figure sunk into the blue, as the backdrop of the Inputs screen (it is shown enlarged, so it is kept finer)
  if (heroTint || !heroOK || X.nohero) return heroTint;
  heroTint = sprite(0, 0, 950, 1080, q >= 2 ? 1.5 : 1); const x = heroTint.x; x.imageSmoothingQuality = 'high'; x.drawImage(heroImg, 0, 0, 950, 1080);
  x.globalCompositeOperation = 'source-atop'; x.fillStyle = 'rgba(6,40,178,.8)'; x.fillRect(0, 0, 950, 1080);
  return heroTint;
}
const WEDGE = [[-3000, -3000], [735, -3000], [735, 0], [725, 150], [700, 280], [650, 450], [625, 550], [550, 598], [450, 625], [325, 650], [310, 950],
  [300, 975], [240, 1000], [200, 1080], [120, 1500], [0, 3000], [-3000, 3000]];
const WEDGE_PATH = pathOf(WEDGE);
// Giant title down the left edge: grey index of the selected line + black "MAIN", reading top to bottom.
// Geometry measured on the game's menu: baseline off-screen at x=-39, cap line at x=264, 10 degree slant.
const T_BASE = -39.2, T_SIZE = 353, T_SXR = 1.2153, T_SLANT = .175, T_MY = 234.7, T_GAP = 26, T_DIG = 1.033;
function titleRun(c, text, yScreen, k, align, fill) {
  c.save(); c.translate(T_BASE, yScreen); c.rotate(Math.PI / 2); c.transform(T_SXR * k, 0, -T_SLANT * k, k, 0, 0);
  c.font = T_SIZE + 'px Title'; c.textAlign = align; c.textBaseline = 'alphabetic'; c.fillStyle = fill;
  c.fillText(text, 0, 0); c.restore();
}
function paintMain(c) {
  titleRun(c, 'M', T_MY, 1, 'left', '#000');
  // A, I and N follow the measured shapes (wider stance than the condensed face's own letters)
  const glyph = (y0, outer, holes) => {
    c.save(); c.translate(T_BASE, y0); c.rotate(Math.PI / 2); c.transform(1, 0, -T_SLANT, 1, 0, 0);
    c.beginPath(); for (const pts of [outer].concat(holes || [])) { c.moveTo(pts[0][0], -pts[0][1]); for (let i = 1; i < pts.length; i++) c.lineTo(pts[i][0], -pts[i][1]); c.closePath(); }
    c.fillStyle = '#000'; c.fill('evenodd'); c.restore();
  };
  const CAP = 303.4;
  glyph(495, [[0, 0], [102.4, CAP], [201.6, CAP], [304, 0]], [[[116, 69], [188, 69], [152, 228]]]);
  glyph(765, [[0, 0], [0, CAP], [70, CAP], [70, 0]]);
  glyph(839, [[0, 0], [0, CAP], [95, CAP], [179, 133.5], [179, CAP], [245, CAP], [245, 0], [150, 0], [66, 170], [66, 0]]);
}
let mainSpr = null, mainClipSpr = null; const digitCache = new Map();
function buildTitle() {
  mainSpr = sprite(-48, 220, 330, 930); paintMain(mainSpr.x);                                          // whole letters, for while they slide in
  mainClipSpr = sprite(-48, 220, 330, 930); mainClipSpr.x.clip(WEDGE_PATH); paintMain(mainClipSpr.x);   // as they rest: cut where the white wedge ends
  digitCache.clear();
}
function digitSpr(n) {
  let s = digitCache.get(n);
  if (!s) { s = sprite(-52, -250, 346, 530); titleRun(s.x, String(n).padStart(2, '0'), T_MY - T_GAP, T_DIG, 'right', '#787878'); digitCache.set(n, s); }
  return s;
}
const SWAY_TOP = 624;
function swayed(t) {       // level 3: rows of the figure far from the head drift sideways a little, built on whole pixel rows off-screen
  const s = RS, src = heroSpr.c, rows = SWAY_TOP - heroSpr.oy, wpx = src.width;
  if (!swayL) { swayL = mkCanvas(src.width, src.height); swayReady = false; }
  const x = swayL.getContext('2d');
  if (!swayReady) { x.clearRect(0, 0, swayL.width, swayL.height); x.drawImage(src, 0, 0); swayReady = true; }
  x.clearRect(0, 0, swayL.width, rows * s);
  for (let r = 0; r < rows; r += 6) {
    const y = Math.max(0, r + heroSpr.oy), k = Math.pow((SWAY_TOP - y) / SWAY_TOP, 1.35), dx = k * (5.5 * Math.sin(t / 1150 + y * .0105) + 2.6 * Math.sin(t / 690 + y * .024 + 1.3));
    x.drawImage(src, 0, r * s, wpx, 6 * s, dx * s, r * s, wpx, 6 * s);
  }
  return swayL;
}
// The plate is the white wedge with the title and the figure. It is one rigid thing: P moves it as a whole
// (dx, dy: slide; sc: zoom about the head; rot: tilt about the head).
const PK = { dx: 0, dy: 0, sc: 1, rot: 0, wedge: 1, title: 1, titleSlide: 0, digOff: 0, alpha: 1 };
function drawPlate(t, k) {
  let a = 1, b = 0, c = 0, d = 1, e = k.dx, f = k.dy;
  if (k.rot || k.sc !== 1) {
    const cs = Math.cos(k.rot) * k.sc, sn = Math.sin(k.rot) * k.sc;
    a = cs; b = sn; c = -sn; d = cs; e = HEAD[0] + k.dx - (cs * HEAD[0] - sn * HEAD[1]); f = HEAD[1] + k.dy - (sn * HEAD[0] + cs * HEAD[1]);
  }
  TF(g, a, b, c, d, e, f);
  if (k.wedge > 0 && !OFF.wedge) { g.globalAlpha = k.wedge; g.fillStyle = '#fff'; g.fill(WEDGE_PATH); }
  const ta = k.title * k.wedge;
  if (ta > .003 && !OFF.title) {
    g.globalAlpha = ta;
    if (k.titleSlide === 0) put(g, mainClipSpr);
    else { g.save(); g.clip(WEDGE_PATH); TF(g, a, b, c, d, e + c * k.titleSlide, f + d * k.titleSlide); put(g, mainSpr); g.restore(); }
    const dy = k.titleSlide + k.digOff;
    TF(g, a, b, c, d, e + c * dy, f + d * dy); put(g, digitSpr(S.sel + 1));
  }
  mark('plate');
  if (!heroOK || OFF.hero || !heroSpr) return;
  const bobY = 5 * Math.sin(t / 2600), bobX = 2 * Math.sin(t / 3300 + 1);
  g.globalAlpha = k.alpha;
  if (QL.sway && k.sc <= 1.3) {
    const r = .0035 * Math.sin(t / 3100), cs = Math.cos(r), sn = Math.sin(r), hx = HEAD[0] + bobX, hy = HEAD[1] + bobY;      // a slight turn about the head
    const a2 = a * cs + c * sn, b2 = b * cs + d * sn, c2 = c * cs - a * sn, d2 = d * cs - b * sn;
    TF(g, a2, b2, c2, d2, a * hx + c * hy + e - (a2 * HEAD[0] + c2 * HEAD[1]), b * hx + d * hy + f - (b2 * HEAD[0] + d2 * HEAD[1]));
    g.drawImage(swayed(t), heroSpr.ox, heroSpr.oy, heroSpr.w, heroSpr.h);
  } else { TF(g, a, b, c, d, e + a * bobX + c * bobY, f + b * bobX + d * bobY); put(g, heroSpr); }
  mark('hero');
}
function drawIdleArt(art, t, opacity) {
  const image = art.image;
  if (reduceMenuMotion.matches || !image.complete || !image.naturalWidth) return;
  // Reverse at the ends so the figure and the ripples meet without a jump.
  const last = art.frames - 1, phase = (t / 250) % (2 * last);
  const sample = phase <= last ? phase : 2 * last - phase;
  const frame = Math.floor(sample), mix = sample - frame;
  const tile = i => {
    let canvas = art.tiles[i];
    if (!canvas) {
      const w = image.naturalWidth / art.columns, h = image.naturalHeight / Math.ceil(art.frames / art.columns);
      canvas = art.tiles[i] = mkCanvas(art.w, art.h);
      canvas.getContext('2d').drawImage(image, (i % art.columns) * w, Math.floor(i / art.columns) * h, w, h, 0, 0, art.w, art.h);
    }
    g.drawImage(canvas, art.x, art.y);
  };
  g.globalAlpha = opacity; tile(frame);
  if (mix > 0) { g.globalAlpha = mix * opacity; tile(frame + 1); }
  g.globalAlpha = 1;
}
function drawHomeArt(t, alpha, mList, alreadyRevealed = false) {
  const zoom = 1 + .12 * mList;
  TF(g, zoom, 0, 0, zoom, HEAD[0] * (1 - zoom), HEAD[1] * (1 - zoom));
  if (!homeRenderer || reduceMenuMotion.matches) {
    lastHomePose = -1; g.globalAlpha = alpha; g.drawImage(homeScene, 0, 0, W, H);
  } else {
    const spec = HOME_MOTION_FRAMES, period = 2 * (spec.frames - 1);
    const frame = Math.round(t * spec.fps / 1000) % period;
    lastHomePose = Math.min(frame, period - frame);
    homeRenderer.draw(lastHomePose);
    if (CAPTURE) {
      g.globalAlpha = alpha; g.drawImage(motionCanvas, 0, 0, W, H);
    } else {
      // The compositor keeps the native background on the GPU. Cut its reveal into
      // the foreground UI, using the same zoom and clip as the offscreen preview.
      if (motionCanvas.style.display) motionCanvas.style.display = '';
      if (homeZoom !== zoom) { motionCanvas.style.transform = zoom === 1 ? '' : 'scale(' + zoom + ')'; homeZoom = zoom; }
      if (alpha === 1) g.clearRect(0, 0, W, H);
      else if (!alreadyRevealed) {
        g.globalAlpha = alpha; g.globalCompositeOperation = 'destination-out';
        g.fillStyle = '#000'; g.fillRect(0, 0, W, H); g.globalCompositeOperation = 'source-over';
      }
    }
  }
  const indexIn = eOut(prog(t, 1290, 460));
  g.globalAlpha = alpha * indexIn;
  const offset = -200 * (1 - indexIn) - 54 * (1 - eOut(prog(t, S.tSel, 165)));
  putAt(g, digitSpr(S.sel + 1), 0, offset);
  g.globalAlpha = 1; T0();
}
function drawListPlate(t, p, alpha) {      // p: 0 home framing … 1 list framing. The camera pushes in on him and the figure sinks into the blue
  if (alpha * .78 < .5 / 255 || OFF.hero) return;
  const s = tintedHero(); if (!s) return;
  const sc = lerp(1, 2.4, p), dx = lerp(0, 680, p), dy = lerp(0, -120, p) + 5 * Math.sin(t / 2600);
  TF(g, sc, 0, 0, sc, HEAD[0] + dx - sc * HEAD[0], HEAD[1] + dy - sc * HEAD[1]);
  g.globalAlpha = .78 * alpha; put(g, s); g.globalAlpha = 1;
}

// ───────────────────────── floating shards ─────────────────────────
const R1 = rng(23);
const SH_COL = [[255, 120, 210], [240, 70, 196], [200, 70, 230], [140, 60, 228], [110, 70, 235], [255, 150, 222], [255, 96, 140], [215, 235, 255]];
const shards = Array.from({ length: 30 }, (_, i) => {
  const near = i < 20, a = R1() * 6.283, d = Math.sqrt(R1());
  const p = {
    x: near ? 430 + Math.cos(a) * d * 520 : R1() * W, y: near ? 560 + Math.sin(a) * d * 560 : R1() * H,
    s: 8 + Math.pow(R1(), 1.8) * 30, rot: R1() * 6.3, spin: (R1() - .5) * .5, flip: R1() * 6.3, fsp: .5 + R1() * 1.2,
    vx: -4 - R1() * 9, vy: -7 - R1() * 16, col: SH_COL[(R1() * SH_COL.length) | 0], al: .5 + R1() * .4, front: R1() < .45,
    q: [[-1, -.2 - R1() * .5], [.3 + R1() * .7, -1], [1, .1 + R1() * .6], [-.2 - R1() * .6, .5 + R1() * .5]], ar: .45 + R1() * .5,
  };
  p.path = pathOf(p.q); p.fill = rgb(p.col); return p;
});
function drawShards(t, front, burst, c = g) {
  if (OFF.shards) return;
  const s = t / 1000;
  for (let i = 0; i < QL.shards; i++) {
    const p = shards[i];
    if (p.front !== front) continue;
    let x = ((p.x + p.vx * s) % (W + 120) + W + 120) % (W + 120) - 60, y = ((p.y + p.vy * s) % (H + 120) + H + 120) % (H + 120) - 60;
    if (burst) { x += (x - 960) * burst * 1.4; y += (y - 540) * burst * 1.4; }
    const fl = Math.cos(p.flip + s * p.fsp), r = p.rot + s * p.spin, sx = p.s * (.2 + .8 * Math.abs(fl)), sy = p.s * p.ar, cs = Math.cos(r), sn = Math.sin(r);
    TF(c, cs * sx, sn * sx, -sn * sy, cs * sy, x, y);
    c.globalAlpha = p.al * (.75 + .25 * fl); c.fillStyle = p.fill; c.fill(p.path);
  }
  c.globalAlpha = 1;
}

// During the short crossfade, the figure and menus zoom over the Inputs water. Sample the water
// where it meets the fully revealed Inputs screen, so moving into and out of its live surface is continuous.
let inputsWater = null, inputsWaterAt = -1, inputsWaterLevel = -1;
function drawTransitionWater(opacity) {
  const at = S.tMode + (S.mode === 'list' ? 336 : 184);
  if (!inputsWater || inputsWater.canvas.width !== cv.width || inputsWater.canvas.height !== cv.height) {
    inputsWater = mkCanvas(cv.width, cv.height).getContext('2d', { alpha: false });
    inputsWaterAt = -1;
  }
  if (inputsWaterAt !== at || inputsWaterLevel !== q) {
    drawBackground(at, inputsWater);
    drawShards(at, false, 0, inputsWater);
    inputsWaterAt = at; inputsWaterLevel = q;
  }
  T0(); g.globalAlpha = opacity;
  g.globalCompositeOperation = 'copy'; g.drawImage(inputsWater.canvas, 0, 0, W, H);
  g.globalCompositeOperation = 'source-over'; g.globalAlpha = 1;
}

// ───────────────────────── main menu ─────────────────────────
const SX_SEL = .88, SKEW = -.105, CAPK = .727, CAP_SEL = 92, MAXL_SEL = 430;
const RED = '#ff0000', PINK = '#ff70d6';
const TRACK = -.065, FAT = .034;      // tracking and extra weight, as fractions of the font size
function menuFont(c, size) { c.font = `${size}px MenuI`; c.letterSpacing = `${(TRACK * size).toFixed(2)}px`; }
// The game's letters are a little heavier than the font's heaviest weight. The extra weight is put on by laying the word
// down again shifted to the corners (and sides) of a small parallelogram whose sides run along the baseline and along
// the slant of the stems: every edge moves out by the same amount and the corners stay sharp, exactly as an outline
// stroke with mitred joins would leave them. (A real stroke looks the same, but on the TV a stroked word takes 15–50 ms
// to draw the first time, which is up to three frames lost; filled copies take under 1 ms.)
const ITAL = Math.tan(9.4 * DEG);      // the slant of the font's stems
function fatText(c, text, fs) {
  const r = fs * FAT / 2, a = r * Math.sqrt(1 + ITAL * ITAL), b = r * ITAL;
  c.fillText(text, 0, 0); if (X.fat1) return;
  c.fillText(text, b + a, -r); c.fillText(text, b - a, -r); c.fillText(text, a - b, r); c.fillText(text, -a - b, r);      // corners
  c.fillText(text, a, 0); c.fillText(text, -a, 0); c.fillText(text, b, -r); c.fillText(text, -b, r);                      // sides
}
// A word as a picture: upright, unstretched, at font size `fs`, anchored at the left end of its baseline. The slant and
// the squeeze are applied when it is placed, so one picture serves every place and size the word is shown at.
function wordSprite(text, fs, fill, mottle) {
  menuFont(g, fs); const w = g.measureText(text).width; g.letterSpacing = '0px';
  const s = sprite(-.1 * fs, -.86 * fs, w + .24 * fs, 1.1 * fs), x = s.x;
  menuFont(x, fs); x.fillStyle = fill; fatText(x, text, fs); x.letterSpacing = '0px';
  if (mottle && texB) {      // water light caught inside the letters
    let hsh = 0; for (let i = 0; i < text.length; i++) hsh = (hsh * 31 + text.charCodeAt(i)) % 500;
    x.globalCompositeOperation = 'source-atop'; x.globalAlpha = .15; x.drawImage(texB, -200 - hsh, -6 * fs, CW * 1.05, CH * 3.1);
  }
  return s;
}
const TONES = [[58, 126, 250], [13, 203, 255], [105, 246, 253]];
const LINE_FS = 96;                                   // resting lines are pictured once at this size (cap height 70) and placed smaller
const lineCache = new Map(), selCache = new Map(), openCache = new Map();
function lineSpr(label) {      // a resting line in each of the game's three blues; in-between shades are a cross-fade of two
  let s = lineCache.get(label);
  if (!s) { s = TONES.map(c => wordSprite(label, LINE_FS, rgb(c), true)); lineCache.set(label, s); }
  return s;
}
let unitW = [], PICK = [], SHIFT = 0, FIT = [];           // natural text width per unit of font size; which measured lines are in use; block nudge; where each line sits at each window place
const selFs = i => Math.min(CAP_SEL, MAXL_SEL * CAPK / (unitW[i] * SX_SEL)) / CAPK;
function selSpr(i) {           // the selected line: black letters, and the same in red for where the wedge crosses them
  const label = APPS[i].label; let s = selCache.get(label);
  if (!s) { const fs = selFs(i); s = { fs, b: wordSprite(label, fs, '#000'), r: wordSprite(label, fs, RED) }; selCache.set(label, s); }
  return s;
}
const openCap = i => Math.min(168, 1150 * CAPK / (unitW[i] * SX_SEL));
// The same pair, large, for the "Now opening" card. Each half is made on its own, in a frame of its own.
function openPart(i, red) {
  const label = APPS[i].label; let s = openCache.get(label);
  if (!s) { s = { fs: openCap(i) / CAPK, b: null, r: null }; openCache.set(label, s); }
  if (red) { if (!s.r) s.r = wordSprite(label, s.fs, RED); } else if (!s.b) s.b = wordSprite(label, s.fs, '#000');
}
function openSpr(i) { const s = openCache.get(APPS[i].label); return s && s.b && s.r ? s : null; }      // null until both halves exist
function wantOpen(i, list, resting) {      // queue the two halves for line i (resting: only if the selection is still there when their turn comes)
  const a = APPS[i]; if (a.screen || a.missing || openSpr(i)) return;
  for (const red of [false, true]) list.push(() => { if (APPS[i] === a && (!resting || S.sel === i)) openPart(i, red); });
}
// Which of the nine measured lines a menu of n lines uses, top to bottom. Lines above the skipped third one drop a little to close the gap.
const UP = 38, SLOT_PICK = { 9: [0, 1, 2, 3, 4, 5, 6, 7, 8], 8: [[0, UP], [1, UP], 3, 4, 5, 6, 7, 8], 7: [[1, UP], 3, 4, 5, 6, 7, 8], 6: [[1, UP], 3, 4, 5, 6, 7], 5: [[1, UP], 3, 4, 5, 6], 4: [[1, UP], 3, 4, 5], 3: [[1, UP], 3, 4], 2: [[1, UP], 3], 1: [3] };
function slotAt(p) {      // the measured line at window place p; one step outside the window is where lines wait unseen
  const n = PICK.length;
  if (p < 0) { const a = PICK[0]; return Object.assign({}, a, { x: a.x + 34, y: a.y + SHIFT - 86, show: 0 }); }
  if (p >= n) { const b = PICK[n - 1]; return Object.assign({}, b, { x: b.x - 18, y: b.y + SHIFT + 64, show: 0 }); }
  const m = PICK[p]; return Object.assign({}, m, { y: m.y + SHIFT, show: 1 });
}
function fitAt(i, p) {    // how line i sits at window place p: condensed to the slot, and set smaller if its name still runs too long
  const m = slotAt(p), nat = unitW[i] * m.cap / CAPK, sx = clamp(m.len * 1.25 / nat, .72, m.sx), L = nat * sx;
  const long = m.flat === undefined ? 0 : sstep(1.15, 1.45, L / m.len);       // how much longer than the game's word on this line
  return { x: m.x, y: m.y, a: lerp(m.a, m.flat === undefined ? m.a : m.flat, long), cap: m.cap * Math.min(m.room / L, 1), sx, show: m.show };
}
function measureMenu() {
  unitW = APPS.map(a => { menuFont(g, 100); const w = (g.measureText(a.label).width + 100 * FAT) / 100; g.letterSpacing = '0px'; return w; });
  const n = Math.min(APPS.length, VIS);
  VA = new Float32Array(APPS.length); VO = new Float32Array(APPS.length);
  PICK = (Q.get('slots') ? Q.get('slots').split(',').map(Number) : SLOT_PICK[n]).map(e => { const [i, dy] = Array.isArray(e) ? e : [e, 0]; return Object.assign({}, SLOTS[i], { y: SLOTS[i].y + dy }); });
  SHIFT = Q.get('shift') !== null ? +Q.get('shift') : ((SLOTS[8].y - PICK[n - 1].y) - (PICK[0].y - SLOTS[0].y)) * .45;      // keep the block centred where the game's is
  FIT = APPS.map((a, i) => { const row = []; for (let p = -1; p <= n; p++) row.push(fitAt(i, p)); return row; });       // worked out once, so placing lines makes no garbage
  S.sel = clamp(S.sel, 0, APPS.length - 1); S.top = S.prevTop = clamp(S.top, 0, Math.max(0, APPS.length - VIS)); keepInView(-1e6);
  S.prevTop = S.top;
  // every picture a line can need, made now: moving the selection must not have to draw any text
  APPS.forEach((a, i) => { lineSpr(a.label); selSpr(i); digitSpr(i + 1); guideText(cmdOf(a)); if (a.missing) later(() => guideText(notHere(a))); });
  if (!X.noopen) APPS.forEach((a, i) => { if (a.screen || a.missing) return; for (const red of [false, true]) later(() => { if (APPS[i] === a) openPart(i, red); }); });
}
// The window follows the selection, leaving one line of context where there is more to see.
function keepInView(t) {
  const most = Math.max(0, APPS.length - VIS), top = clamp(S.top, clamp(S.sel - (VIS - 2), 0, most), clamp(S.sel - 1, 0, most));
  if (top !== S.top) { S.prevTop = topAt(t); S.top = top; S.tTop = t; }
}
function topAt(t) { return lerp(S.prevTop, S.top, eOut(prog(t, S.tTop, 240))); }
// Where line i is right now (k: 0 = resting, 1 = selected). The answer lands in GM, which is reused: no garbage per frame.
const GM = { x: 0, y: 0, a: 0, cap: 0, L: 0, sx: 0, size: 0, cx: 0, cy: 0, show: 0 };
let TOPNOW = 0;
function itemGeom(i, k) {
  const n = PICK.length, f = clamp(i - TOPNOW, -1, n), p = Math.floor(f), kk = f - p, A = FIT[i][p + 1];
  let sxp = A.x, syp = A.y, sa = A.a, scap = A.cap, ssx = A.sx, show = A.show;
  if (kk >= .001) { const B = FIT[i][p + 2]; sxp = lerp(A.x, B.x, kk); syp = lerp(A.y, B.y, kk); sa = lerp(A.a, B.a, kk); scap = lerp(A.cap, B.cap, kk); ssx = lerp(A.sx, B.sx, kk); show = lerp(A.show, B.show, kk); }
  const a = sa * DEG, ux = Math.cos(a), uy = Math.sin(a), vx = uy, vy = -ux;   // v points "up" from the baseline
  const L0 = unitW[i] * ssx * scap / CAPK, cx = sxp + ux * L0 / 2 + vx * scap / 2, cy = syp + uy * L0 / 2 + vy * scap / 2;
  const capS = Math.min(CAP_SEL, MAXL_SEL * CAPK / (unitW[i] * SX_SEL)), cap = lerp(scap, capS, k), sx = lerp(ssx, SX_SEL, k), L = unitW[i] * sx * cap / CAPK;
  GM.x = cx - ux * L / 2 - vx * cap / 2 + 14 * k; GM.y = cy - uy * L / 2 - vy * cap / 2 + 4 * k; GM.a = a; GM.cap = cap; GM.L = L; GM.sx = sx; GM.size = cap / CAPK; GM.cx = cx; GM.cy = cy; GM.show = show;
  return GM;
}
const ML = { x: 640, y: 300, w: 760, h: 690 };
let menuL = null;
const WP = new Float32Array(6), PP = new Float32Array(6);      // the white wedge under the selected line, and its pink echo
function wedgePts(out, L, h, t, grow, pink) {
  const ha = 8.3 * Math.min(1, 3.95 * h / (L + .9 * h)) * DEG, ax = (.6 + Math.sin(t / 1700) * 1.3) * DEG, up = Math.tan(ha + ax), dn = Math.tan(ha - ax);
  let Tx = -.36 * h + Math.sin(t / 900 + 1) * 3, Ty = .29 * h + Math.sin(t / 1300 + 2) * 2;
  let Ax = L + 1.02 * h + Math.sin(t / 800 + 3) * 5, Bx = L + .2 * h + Math.sin(t / 1100 + 4) * 4;
  if (pink) { Tx -= .46 * h; Ty += .09 * h; Ax += .27 * h; Bx += .15 * h; }
  Ax = lerp(Tx + (Ax - Tx) * .35, Ax, grow); Bx = lerp(Tx + (Bx - Tx) * .35, Bx, grow);
  out[0] = Tx; out[1] = -Ty; out[2] = Ax; out[3] = -(Ty + (Ax - Tx) * up + (pink ? .02 * h : 0)); out[4] = Bx; out[5] = -(Ty - (Bx - Tx) * dn - (pink ? .05 * h : 0));     // canvas y is down
}
const tri = (c, p) => { c.beginPath(); c.moveTo(p[0], p[1]); c.lineTo(p[2], p[3]); c.lineTo(p[4], p[5]); c.closePath(); };
let VA, VO;      // per line: how visible it is, and how far it is shifted along its own direction
// The lines that are not selected: each is two pictures laid over each other (two neighbouring blues, cross-faded).
function drawRestLines(c, bx, by, t) {
  const sel = S.sel, since0 = t - S.tSel;
  for (let i = 0; i < APPS.length; i++) {
    if (i === sel) continue;
    const va = VA[i]; if (va <= .01) continue;
    const gm = itemGeom(i, i === S.prevSel && since0 >= 0 && since0 < 150 ? 1 - eOut(since0 / 150) : 0); if (gm.show <= .01) continue;
    const pl = i - TOPNOW, tone = clamp(.55 + .42 * Math.sin(pl * .82 - (t - 3000) / 2600 - .254) + .1 * Math.sin(pl * 1.9 + t / 1700));
    const sp = lineSpr(APPS[i].label), k = gm.size / LINE_FS, cs = Math.cos(gm.a) * k, sn = Math.sin(gm.a) * k, off = VO[i] / k;
    c.setTransform(cs * gm.sx * RS, sn * gm.sx * RS, (cs * SKEW - sn) * RS, (sn * SKEW + cs) * RS, (gm.x + cs * off - bx) * RS, (gm.y + sn * off - by) * RS);
    const alpha = .96 * va * gm.show * (APPS[i].missing ? .36 : 1), hi = tone >= .5, m = hi ? tone * 2 - 1 : tone * 2, lo = sp[hi ? 1 : 0];
    c.globalAlpha = alpha; c.drawImage(lo.c, lo.ox, lo.oy, lo.w, lo.h);
    if (m > .02) { const up = sp[hi ? 2 : 1]; c.globalAlpha = alpha * m; c.drawImage(up.c, up.ox, up.oy, up.w, up.h); }
  }
  c.globalAlpha = 1;
}
let arrowSpr = null;
function buildArrow() { arrowSpr = sprite(-22, -14, 44, 32, 2); const x = arrowSpr.x; x.lineJoin = 'round'; x.beginPath(); x.moveTo(-15, -6); x.lineTo(15, -6); x.lineTo(0, 9); x.closePath(); x.strokeStyle = 'rgba(8,16,96,.9)'; x.lineWidth = 6; x.stroke(); x.fillStyle = '#fff'; x.fill(); }
function drawMenu(t) {
  if (OFF.menu) return;
  if (QL.ripple) {       // level 3: the lines go to a picture of their own first, which is then laid down in thin rows that shift sideways like something seen through moving water
    if (!menuL) menuL = sprite(ML.x, ML.y, ML.w, ML.h);
    const x = menuL.x; x.setTransform(1, 0, 0, 1, 0, 0); x.globalAlpha = 1; x.clearRect(0, 0, menuL.c.width, menuL.c.height);
    drawRestLines(x, ML.x, ML.y, t);
    T0(); const hgt = QL.ripple;
    for (let y = ML.y; y < ML.y + ML.h; y += hgt) {
      const k = 1 - .7 * sstep(470, 820, y), dx = k * (.9 * Math.sin(y * .3 + t * .0052) + .5 * Math.sin(y * .13 - t * .0037));
      g.drawImage(menuL.c, 0, (y - ML.y) * RS, ML.w * RS, hgt * RS, ML.x + dx, y, ML.w, hgt);
    }
  } else drawRestLines(g, 0, 0, t);
  mark('m.rest');
  // small marks when the list goes on above or below what is shown
  const v0 = VA[Math.round(S.top)];
  if (APPS.length > VIS && v0 > .01) {
    const most = APPS.length - VIS, n = PICK.length, off = VO[Math.round(S.top)], bob = Math.sin(t / 420) * 3, upOn = clamp(TOPNOW), dnOn = clamp(most - TOPNOW);
    if (upOn > .01) { g.globalAlpha = v0 * upOn * .92; TF(g, 1, 0, 0, -1, PICK[0].x - 34 + off, PICK[0].y + SHIFT - 62 - bob); put(g, arrowSpr); }
    if (dnOn > .01) { g.globalAlpha = v0 * dnOn * .92; TF(g, 1, 0, 0, 1, PICK[n - 1].x - 30 + off, PICK[n - 1].y + SHIFT + 34 + bob); put(g, arrowSpr); }
  }
  // selected line: black letters, a white wedge with a pink echo, and red letters wherever the wedge crosses them
  const sel = S.sel, va = VA[sel]; if (va <= .01) { g.globalAlpha = 1; return; }
  const since = t - S.tSel, pop = since < 0 ? 1 : eBack(since / 190, 2.2), grow = eOut(since / 170);
  const gm = itemGeom(sel, 1), sc = lerp(.8, 1, pop), sp = selSpr(sel);
  const ca = Math.cos(gm.a), sa = Math.sin(gm.a), cs = ca * sc, sn = sa * sc, hx = -gm.L / 2, hy = gm.cap / 2;
  const ex = gm.cx + 14 + ca * VO[sel] + cs * hx - sn * hy, ey = gm.cy + 4 + sa * VO[sel] + sn * hx + cs * hy;      // where the left end of the baseline lands
  g.globalAlpha = va;
  TF(g, cs, sn, -sn, cs, ex, ey);
  wedgePts(PP, gm.L, gm.cap, t, grow, true); g.fillStyle = PINK; tri(g, PP); g.fill();
  wedgePts(WP, gm.L, gm.cap, t, grow, false); g.fillStyle = '#fff'; tri(g, WP); g.fill();
  const k = gm.size / sp.fs, ta = cs * k * gm.sx, tb = sn * k * gm.sx, tc = (cs * SKEW - sn) * k, td = (sn * SKEW + cs) * k;
  TF(g, ta, tb, tc, td, ex, ey); put(g, sp.b);
  g.save(); TF(g, cs, sn, -sn, cs, ex, ey); tri(g, WP); g.clip(); TF(g, ta, tb, tc, td, ex, ey); put(g, sp.r); g.restore();
  g.globalAlpha = 1;
}

// ───────────────────────── small UI pieces (all ready-made pictures) ─────────────────────────
function glowText(c, text, x, y, font, opts = {}) {
  if (X.noglow) { c.save(); c.font = font; c.textAlign = opts.align || 'left'; c.fillStyle = opts.fill || '#fff'; c.fillText(text, x, y); const w0 = c.measureText(text).width; c.restore(); return w0; }
  c.save(); c.font = font; c.textAlign = opts.align || 'left'; c.lineJoin = 'round';
  c.strokeStyle = opts.stroke || 'rgba(8,16,96,.9)'; c.lineWidth = opts.lw || 6; c.shadowColor = 'rgba(4,10,70,.9)'; c.shadowBlur = (opts.blur == null ? 6 : opts.blur) * RS;
  c.strokeText(text, x, y); c.shadowBlur = 0; c.fillStyle = opts.fill || '#fff'; c.fillText(text, x, y);
  const w = c.measureText(text).width; c.restore(); return w;
}
function keyHint(c, xr, y, glyph, label) {      // right-aligned "(glyph) label", returns the x where it starts
  c.save(); c.font = '37px HintB'; const w = c.measureText(label).width; c.restore();
  const x0 = xr - w;
  glowText(c, label, x0, y, '37px HintB', { stroke: 'rgba(70,96,150,.92)', lw: 7, blur: 3 });
  const cx = x0 - 22, cy = y - 13;
  c.save();
  c.fillStyle = 'rgba(70,96,150,.92)'; c.beginPath(); c.arc(cx, cy, 21, 0, 7); c.fill();
  c.fillStyle = '#fff'; c.beginPath(); c.arc(cx, cy, 17.5, 0, 7); c.fill();
  c.fillStyle = '#070b55'; c.beginPath(); c.arc(cx, cy, 14, 0, 7); c.fill();
  c.fillStyle = '#fff'; c.textAlign = 'center';
  if (glyph === 'back') { c.strokeStyle = '#fff'; c.lineWidth = 3; c.lineCap = 'round'; c.lineJoin = 'round'; c.beginPath(); c.moveTo(cx - 6, cy - 5); c.lineTo(cx + 3, cy - 5); c.arc(cx + 3, cy, 5, -Math.PI / 2, Math.PI / 2); c.lineTo(cx - 6, cy + 5); c.stroke(); c.beginPath(); c.moveTo(cx - 3, cy - 9); c.lineTo(cx - 8, cy - 5); c.lineTo(cx - 3, cy - 1); c.stroke(); }
  else if (glyph === '↕' || glyph === '↔') {
    c.translate(cx, cy); if (glyph === '↕') c.rotate(Math.PI / 2);
    c.strokeStyle = '#fff'; c.lineWidth = 2.4; c.lineCap = c.lineJoin = 'round';
    c.beginPath(); c.moveTo(-9, 0); c.lineTo(9, 0);
    c.moveTo(-4, -5); c.lineTo(-9, 0); c.lineTo(-4, 5);
    c.moveTo(4, -5); c.lineTo(9, 0); c.lineTo(4, 5); c.stroke();
  } else { c.font = '15px HintL'; c.fillText(glyph, cx, cy + 5.5); }
  c.restore();
  return cx - 24;
}
// The guide at the bottom right: a sentence, a small label with a rule running off the screen, and the key hints.
const GX = 1868, guideCache = new Map(), labelCache = new Map(), hintCache = new Map(); let ruleSpr = null;
function guideText(text, which = 'home') {
  const key = which + ':' + text;
  let s = guideCache.get(key);
  if (!s) {
    const font = which === 'home' ? '42px HintR' : '46px HintR';
    const sx = which === 'home' ? .78 : 1;
    g.font = font; const w = g.measureText(text).width * sx;
    s = sprite(GX - w - 22, 922, w + 44, 76); s.x0 = GX - w;
    const c = s.x;
    c.save(); c.translate(s.x0, 975); c.scale(sx, 1);
    glowText(c, text, 0, 0, font, { lw: 5 }); c.restore();
    guideCache.set(key, s);
  }
  return s;
}
function guideLabel(label) {
  let s = labelCache.get(label);
  if (!s) { g.font = '17px HintL'; const w = g.measureText(label).width; s = sprite(-8, 974, w + 16, 32); s.lw = w; glowText(s.x, label, 0, 995, '17px HintL', { lw: 3, blur: 2 }); labelCache.set(label, s); }
  return s;
}
const HINTS = { home: [['back', 'Close'], ['OK', 'Confirm']], list: [['back', 'Back'], ['OK', 'Confirm']] };
function guideHints(which) {
  let s = hintCache.get(which);
  if (!s) {
    s = sprite(GX - 560, 1004, 590, 74);
    const c = s.x; c.save(); c.translate(GX, 1048);
    if (which === 'home') c.scale(.80, .92);
    let x = 0;
    for (const [glyph, label] of HINTS[which]) x = keyHint(c, x, 0, glyph, label) - 12;
    c.restore(); hintCache.set(which, s);
  }
  return s;
}
function buildRule() { ruleSpr = sprite(760, 978, W - 760, 24); const x = ruleSpr.x; x.shadowColor = 'rgba(4,10,70,.9)'; x.shadowBlur = 5 * RS; x.shadowOffsetY = 2 * RS; x.fillStyle = '#fff'; x.fillRect(760, 988, W - 760, 3); }
function drawGuide(t, alpha, text, label, which, tSwap) {
  if (alpha <= 0 || OFF.guide) return;
  const ts = guideText(text, which), ls = guideLabel(label), sw = eOut(prog(t, tSwap, 160)), x0 = ts.x0, rx = Math.max(ruleSpr.ox, x0 + ls.lw + 5);
  T0();
  g.globalAlpha = alpha * sw; putAt(g, ts, (1 - sw) * 26, 0);
  g.globalAlpha = alpha; putAt(g, ls, x0, 0);
  const ruleWidth = (W - rx) * lerp(.18, 1, sw);
  g.drawImage(ruleSpr.c, (rx - ruleSpr.ox) * RS, 0, ruleWidth * RS, ruleSpr.c.height, rx, ruleSpr.oy, ruleWidth, ruleSpr.h);
  if (sw < 1) {
    g.fillStyle = '#8af2fc';
    g.fillRect(rx + ruleWidth - 7, 984, 7, 10);
  }
  put(g, guideHints(which));
  g.globalAlpha = 1;
}
function moonPhase(d) { const p = ((d.getTime() / 86400000 - 10962.76) / 29.530588853) % 1; return p < 0 ? p + 1 : p; }   // 0 new, .5 full
let clockSpr = null, clockKey = '', clockNext = 0;
function drawClock(t, alpha, pop) {
  if (alpha <= 0 || OFF.hud) return;
  const ms = CAPTURE ? 0 : Date.now();
  if (!clockSpr || ms >= clockNext) {      // looked at once a second, repainted when the minute changes
    clockNext = ms + 1000;
    const now = CAPTURE ? FAKE_NOW : new Date(ms), hh = String(now.getHours()).padStart(2, '0'), mm = String(now.getMinutes()).padStart(2, '0'), key = hh + mm + now.getDate();
    if (!clockSpr || key !== clockKey) {
      clockKey = key; clockSpr = sprite(150, 44, 290, 124); const c = clockSpr.x;
      const day = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'][now.getDay()];
      c.fillStyle = '#fff'; c.fillRect(168, 57, 256, 98); c.strokeStyle = '#000'; c.lineWidth = 2; c.strokeRect(168, 57, 256, 98);
      c.fillStyle = '#000'; c.beginPath(); c.moveTo(168, 124); c.lineTo(161, 126); c.lineTo(168, 132); c.fill();
      c.font = '50px Num'; c.letterSpacing = '-1px'; c.fillText(`${hh}:${mm}`, 184, 110); c.letterSpacing = '0px';
      c.font = '14.5px UiBI'; c.fillText(`${day} ${now.getMonth() + 1}/${now.getDate()}`, 185, 134);
      // moon phase, as in the game's calendar
      const ph = moonPhase(now), cx = 382, cy = 105, r = 22;
      c.fillStyle = '#16183a'; c.beginPath(); c.arc(cx, cy, r + 2.5, 0, 7); c.fill();
      c.fillStyle = '#3a3c1c'; c.beginPath(); c.arc(cx, cy, r, 0, 7); c.fill();
      c.fillStyle = '#ffe51f'; c.beginPath();
      const waxing = ph < .5, k = Math.cos(ph * 2 * Math.PI);          // k: 1 new … -1 full
      c.arc(cx, cy, r, -Math.PI / 2, Math.PI / 2, !waxing);            // lit limb
      c.ellipse(cx, cy, Math.abs(k) * r, r, 0, Math.PI / 2, -Math.PI / 2, waxing ? k > 0 : k < 0);
      c.fill();
    }
  }
  TF(g, pop, 0, 0, pop, 296 - 296 * pop, 106 - 106 * pop); g.globalAlpha = alpha; put(g, clockSpr); g.globalAlpha = 1;
}
// Device icons on the Inputs screen.
function iconPath(c, kind) {
  c.beginPath();
  if (kind === 'pad') { c.moveTo(-34, -14); c.quadraticCurveTo(-36, -30, -18, -30); c.lineTo(18, -30); c.quadraticCurveTo(36, -30, 34, -14); c.lineTo(42, 22); c.quadraticCurveTo(44, 38, 30, 36); c.quadraticCurveTo(22, 34, 14, 14); c.lineTo(-14, 14); c.quadraticCurveTo(-22, 34, -30, 36); c.quadraticCurveTo(-44, 38, -42, 22); c.closePath(); }
  else if (kind === 'spk') { c.moveTo(-22, -40); c.lineTo(22, -40); c.quadraticCurveTo(30, -40, 30, -32); c.lineTo(30, 32); c.quadraticCurveTo(30, 40, 22, 40); c.lineTo(-22, 40); c.quadraticCurveTo(-30, 40, -30, 32); c.lineTo(-30, -32); c.quadraticCurveTo(-30, -40, -22, -40); c.closePath(); }
  else { c.rect(-40, -34, 80, 52); c.moveTo(-10, 18); c.lineTo(10, 18); c.lineTo(14, 32); c.lineTo(28, 32); c.lineTo(28, 38); c.lineTo(-28, 38); c.lineTo(-28, 32); c.lineTo(-14, 32); c.closePath(); }
}
// ───────────────────────── source list screen ─────────────────────────
const LIST_ROWS = 7;
const LS = { sig: null, title: null, strip: null, rows: [], bars: [], info: [] };     // its pictures; rows and bars come plain and selected
function rowBadge(c, x, y, s, sel) {
  c.save(); c.translate(x, y);
  c.fillStyle = sel ? '#0b1c8f' : '#0d2aa8'; c.beginPath(); c.moveTo(-52, 14); c.lineTo(-40, -15); c.lineTo(46, -15); c.lineTo(34, 14); c.fill();
  c.fillStyle = '#fff'; c.beginPath(); c.moveTo(-34, 9); c.lineTo(-27, -10); c.lineTo(-9, -10); c.lineTo(-16, 9); c.fill();
  c.fillStyle = '#35e9ff'; c.beginPath(); c.moveTo(-10, 9); c.lineTo(-3, -10); c.lineTo(32, -10); c.lineTo(25, 9); c.fill();
  c.fillStyle = '#0b1c8f'; c.font = '10.5px UiBI'; c.textAlign = 'center'; c.fillText(s.port.split(' ')[0].slice(0, 4), 11, 3.5);
  c.restore();
}
function listTitle() {
  if (!LS.title) { LS.title = sprite(-40, -200, 980, 250); const x = LS.title.x; menuFont(x, 222); x.transform(.93, 0, -.16, 1, 0, 0); x.fillStyle = '#a9a9a9'; x.fillText('INPUTS', 0, 0); x.letterSpacing = '0px'; }
  return LS.title;
}
function listStrip() {
  if (!LS.strip) { LS.strip = sprite(1090, 82, 750, 106); const c = LS.strip.x;
    const arrow = (x, d) => { c.strokeStyle = '#f0283c'; c.lineWidth = 7; c.lineJoin = 'miter'; c.beginPath(); c.moveTo(x + d * 16, 96); c.lineTo(x - d * 16, 130); c.lineTo(x + d * 16, 164); c.stroke(); c.strokeStyle = '#fff'; c.lineWidth = 2.5; c.stroke(); };
    arrow(1118, 1); arrow(1806, -1);
    c.fillStyle = '#111'; c.font = '40px RowB'; c.textAlign = 'center'; c.fillText('Connected Sources', 1462, 136);
    for (let i = 0; i < 4; i++) { c.beginPath(); c.arc(1408 + i * 36, 172, i === 0 ? 9 : 7, 0, 7); c.fillStyle = '#111'; c.fill(); if (i === 0) { c.beginPath(); c.arc(1408, 172, 5.5, 0, 7); c.strokeStyle = '#fff'; c.lineWidth = 2; c.stroke(); } }
  }
  return LS.strip;
}
function listRow(i, sel) {       // one line of the list as it sits in the first row; other rows are the same picture shifted
  const slot = i * 2 + (sel ? 1 : 0); let sp = LS.rows[slot];
  if (!sp) { const s = SOURCES[i], x = 1250, y = 0; sp = LS.rows[slot] = sprite(1008, -44, 784, 82); const c = sp.x;
    rowBadge(c, x - 72, y - 2, s, sel);
    c.font = '41px RowB'; c.textAlign = 'left'; c.fillStyle = sel ? '#000' : '#35c6ff'; c.fillText(s.name, x, y + 12, 350);
    c.fillStyle = '#04040c'; c.beginPath(); c.roundRect(1630, y - 19, 148, 38, 19); c.fill();
    c.fillStyle = sel ? '#fff' : '#cfd6ea'; c.font = '25px UiLI'; c.textAlign = 'center'; c.fillText(s.port, 1704, y + 9, 130);
    if (s.live) { c.font = '34px MenuI'; c.textAlign = 'right'; c.lineJoin = 'round'; c.strokeStyle = '#000'; c.lineWidth = 7; c.save(); c.translate(x - 136, y + 4); c.rotate(-6 * DEG); const tg = (s.tags || ['LIVE'])[0]; c.strokeText(tg, 0, 0); c.fillStyle = '#fff'; c.fillText(tg, 0, 0); c.restore(); }
  }
  return sp;
}
function listInfo(i) {
  let sp = LS.info[i];
  if (!sp) { const src = SOURCES[i]; sp = LS.info[i] = sprite(1196, 738, 716, 94); const c = sp.x;
    c.strokeStyle = '#35e9ff'; c.lineWidth = 3; c.beginPath(); c.roundRect(1203, 746, 72, 22, 11); c.stroke();
    c.fillStyle = '#35e9ff'; c.font = '15px HintL'; c.textAlign = 'center'; c.fillText('Info', 1239, 763);
    c.textAlign = 'left'; c.font = '39px Row'; c.fillStyle = '#3fc8ff'; c.fillText(src.info[0], 1295, 772, 600); c.fillText(src.info[1] || '', 1295, 816, 600);
  }
  return sp;
}
function listBar(i, cur) {       // status bars on the left, like the party list
  const slot = i * 2 + (cur ? 1 : 0); let sp = LS.bars[slot];
  if (!sp) { const s = SOURCES[i], y = 0; sp = LS.bars[slot] = sprite(0, 0, 866, 86); const c = sp.x;
    c.fillStyle = '#05050a'; c.beginPath(); c.moveTo(0, y); c.lineTo(862, y); c.lineTo(838, y + 84); c.lineTo(0, y + 84); c.fill();
    if (cur) { c.fillStyle = '#fff'; c.beginPath(); c.moveTo(262, y + 6); c.lineTo(512, y + 6); c.lineTo(492, y + 78); c.lineTo(262, y + 78); c.fill(); }
    const wc = [[40, 170, 255], [226, 60, 200], [44, 84, 240]][i];
    c.fillStyle = rgb(wc); c.beginPath(); c.moveTo(128, y + 84); c.lineTo(150, y); c.lineTo(236, y); c.lineTo(300, y + 84); c.fill();
    c.fillStyle = '#fff'; c.save(); c.translate(190, y + 50); c.scale(.6, .6); iconPath(c, s.kind); c.fill(); c.restore();
    c.save(); c.translate(42, y + 74); c.rotate(-33 * DEG); c.font = '40px MenuI'; c.letterSpacing = '-2px'; c.fillStyle = '#fff'; c.fillText((s.tags || ['LIVE', 'IDLE'])[s.live ? 0 : 1], 0, 0); c.letterSpacing = '0px'; c.restore();
    c.font = '35px RowB'; c.textAlign = 'left'; c.fillStyle = cur ? '#000' : '#fff'; c.fillText(s.name, 296, y + 54, 196);
    c.strokeStyle = rgb(wc); c.lineWidth = 2; c.beginPath(); c.moveTo(548, y + 20); c.lineTo(508, y + 78); c.stroke();
    c.fillStyle = '#fff'; c.font = '14px UiBI'; c.fillText('No.', 530, y + 68); c.font = '38px UiLI'; c.fillText(String(i + 1), 562, y + 68);
    const stat = (x, lab, val, col) => { c.font = '13px UiBI'; c.fillStyle = col; c.fillText(lab, x, y + 56); c.font = '42px UiXLI'; c.fillText(val, x + 30, y + 61); const w = c.measureText(val).width; c.fillRect(x - 2, y + 66, w + 38, 5); };
    const st = s.stats || [];
    if (st[0]) stat(612, st[0][0], st[0][1], '#2fe6ff');
    if (st[1]) stat(744, st[1][0], st[1][1], '#ffe51f');
  }
  return sp;
}
function listChanged() {       // the sources were (re)read: throw away pictures of the old ones, and make the new ones while nothing moves
  const sig = JSON.stringify(SOURCES.map(s => [s.name, s.port, !!s.live, !!s.dim, s.info, s.stats, s.kind, s.tags]));
  if (sig === LS.sig) return;
  LS.sig = sig; LS.rows = []; LS.bars = []; LS.info = []; asked.again = true;
  later(() => { listTitle(); listStrip(); });
  later(() => { tintedHero(); });
  SOURCES.forEach((s, i) => { later(() => { if (LS.sig === sig) { listRow(i, false); listInfo(i); } }); later(() => { if (LS.sig === sig) { listRow(i, true); if (i < 3) { listBar(i, false); listBar(i, true); } } }); });
}
const RAIL = pathOf([[1778, 492], [1794, 492], [1756, 692], [1740, 692]]);
const listSkyY = p => -210 + 210 * eOut(prog(p, .05, .5));
function drawList(t, p) {       // p 0..1 presence
  if (p <= .05 || OFF.list) return;
  const inn = (a, d) => eOut(prog(p, a, d));
  T0(); g.globalAlpha = 1;
  // white sky above the waterline with the giant grey title
  const by = listSkyY(p);
  g.fillStyle = '#fff'; g.fillRect(0, by, W, 206);
  g.globalAlpha = inn(.2, .5); putAt(g, listTitle(), 62 - (1 - inn(.2, .6)) * 260, 226 + by);
  g.globalAlpha = inn(.35, .4); putAt(g, listStrip(), 0, by);
  if (!SOURCES.length) {
    g.globalAlpha = inn(.4, .4); g.textAlign = 'left'; g.font = '39px Row'; g.fillStyle = '#3fc8ff';
    g.fillText(S.sourcesState === 'asking' ? 'Asking the TV for its sources…' : 'The TV did not report any sources.', 1140, 330); g.globalAlpha = 1;
    return;
  }
  // list (a window of LIST_ROWS rows that follows the selection)
  const first = clamp(S.lsel - LIST_ROWS + 1, 0, Math.max(0, SOURCES.length - LIST_ROWS));
  const y0 = 274, pitch = 56, selY = y0 + (S.lsel - first) * pitch, since = t - S.tLsel, snap = since < 0 ? 1 : eBack(since / 150, 2);
  g.globalAlpha = inn(.3, .4);
  const bx = 1056 + (1 - inn(.3, .5)) * 900;
  g.fillStyle = '#ee1133'; g.fillRect(bx, selY - 39, W - bx, 10); g.fillStyle = '#fff';
  g.beginPath(); g.roundRect(bx, selY - 33, W - bx + 20, 66 * lerp(.6, 1, snap), 6); g.fill();
  for (let r = 0; r < LIST_ROWS && first + r < SOURCES.length; r++) {
    const i = first + r, a = inn(.28 + r * .05, .4);
    g.globalAlpha = a * (SOURCES[i].dim ? .45 : 1); putAt(g, listRow(i, i === S.lsel), -r * 9 + (1 - a) * 420, y0 + r * pitch);
  }
  // scroll rail
  g.globalAlpha = inn(.5, .4); g.fillStyle = '#04040c'; g.fill(RAIL);
  const sp = S.lsel / Math.max(1, SOURCES.length - 1) * .45, yA = 496 + sp * 190, yB = yA + 88, xA = 1780 - (yA - 492) * .19, xB = 1780 - (yB - 492) * .19;
  g.fillStyle = '#fff'; g.beginPath(); g.moveTo(xA, yA); g.lineTo(xA + 10, yA); g.lineTo(xB + 10, yB); g.lineTo(xB, yB); g.fill();
  // info
  g.globalAlpha = inn(.5, .4) * eOut(prog(t, S.tLsel, 180)); put(g, listInfo(S.lsel));
  for (let i = 0; i < 3 && i < SOURCES.length; i++) {
    const a = inn(.3 + i * .08, .45);
    g.globalAlpha = a * (SOURCES[i].dim ? .5 : 1); putAt(g, listBar(i, i === S.lsel), -(1 - a) * 900, 478 + i * 90);
  }
  g.globalAlpha = 1;
}

// ───────────────────────── menu settings screen ─────────────────────────
const SETTINGS_ROWS = 7, SETTINGS_PITCH = 60, SETTINGS_FIRST_Y = 260;
const SETTINGS_CYAN = '#72f6ff', SETTINGS_MUTED = '#a5a2c7';
const SETTINGS_NAMES = {
  inputs: 'Inputs', youtube: 'YouTube', crunchyroll: 'Crunchyroll', jellyfin: 'Jellyfin',
  spotify: 'Spotify', moonlight: 'Moonlight', netflix: 'Netflix', disney: 'Disney+',
  prime: 'Prime Video', apple: 'Apple TV',
};
const SETTINGS_TITLE_CLIP = pathOf([[0, 0], [970, 0], [0, 198]]);
const SETTINGS_BOARD = pathOf([[0, 0], [1238, 0], [1457, H], [0, H]]);
// Underlap the moving board edge by two pixels so its anti-aliasing meets opaque water.
const QUEST_WATER = pathOf([[1236, 0], [W, 0], [W, H], [1455, H]]);
const SETTINGS_STATUS_TAB = pathOf([[1123, 170], [1275, 170], [1200, 241]]);
let settingsTitlePicture = null, settingsGuidePicture = null, settingsHeaderPicture = null;
let settingsFocusPicture = null, settingsDetailPicture = null, settingsRemovalPicture = null;
const settingsRowCache = new Map(), settingsPage = [];
let settingsFirst = 0, settingsCount = 0, settingsDirty = true;
let settingsBase = null, settingsTableEdge = null, settingsBaseDirty = true;
const settingsFocus = { key: null, index: -1, hidden: false, openedAt: null, since: -1e6, y: 0 };
const questScene = new Image();
questScene.src = 'assets/quest-scene.webp';
const questIdle = loadIdleArt('assets/quest-idle.webp', 9, 3, 1232, 0, 688, 928);
let questBoard = null, questWater = null;

function settingsRows() {
  return menuOrder.filter(key => menuChoices.has(key)).map(key => {
    const app = menuChoices.get(key);
    return { key, label: SETTINGS_NAMES[key] || app.displayName || app.label, appId: app.appId || null,
      hidden: hiddenEntries.has(key), installed: key !== INPUTS_ENTRY.key };
  });
}

function drawQuestBackground(age) {
  if (!questBoard && questScene.naturalWidth) {
    questBoard = mkCanvas(1458, H); const board = questBoard.getContext('2d');
    board.clip(SETTINGS_BOARD); board.drawImage(questScene, 0, 0, W, H);
    questWater = mkCanvas(W - 1236, H); const water = questWater.getContext('2d');
    water.translate(-1236, 0); water.clip(QUEST_WATER); water.drawImage(questScene, 0, 0, W, H);
  }
  const deskIn = eOut(prog(age, 122, 256));
  if (deskIn < 1 || !questBoard) { g.fillStyle = waterGrad; g.fillRect(0, 0, W, H); }
  if (!questBoard) {
    g.fillStyle = '#1b196c'; g.fill(SETTINGS_BOARD);
    g.fillStyle = '#fff'; g.fill(SETTINGS_TITLE_CLIP);
    return;
  }
  const waterIn = eOut(prog(age, 80, 180));
  if (waterIn > 0) { g.globalAlpha = waterIn; g.drawImage(questWater, 1236, 0); }
  g.globalAlpha = 1;
  if (deskIn > 0) g.drawImage(questBoard, -140 * (1 - deskIn), -H * (1 - deskIn));
}

function paintSettingsTitle(c) {
  c.save(); c.clip(SETTINGS_TITLE_CLIP);
  c.translate(24, 201); c.rotate(-11.5 * DEG);
  c.font = '168px MenuI'; c.letterSpacing = '-11px'; c.fillStyle = '#b4b4b5';
  c.fillText('APPS', 0, 0, 826);
  c.restore();
}

function paintSettingsGuide(c) {
  // The reference uses a small Guide and button glyphs over the water.
  const x = 1339;
  glowText(c, 'Choose apps for Home.', x, 970, '39px HintR', { lw: 5 });
  glowText(c, 'Guide', x, 993, '17px HintL', { lw: 3, blur: 2 });
  c.fillStyle = '#fff'; c.fillRect(x + 48, 985, W - x - 48, 3);
  let right = 1862;
  for (const [key, label] of [['back', 'Back'], ['OK', 'Hide/Show'], ['↔', 'Move'], ['↕', 'Select']]) {
    right = keyHint(c, right, 1044, key, label) - 15;
  }
}

function questRect(c, x, y, w, h, radius, fill) {
  c.fillStyle = fill; c.beginPath(); c.roundRect(x, y, w, h, radius); c.fill();
}

function paintSettingsRow(c, row, index, y, selected) {
  c.save(); c.translate(0, y);
  if (selected) {
    questRect(c, 76, -40, 1265, 72, 9, '#ff197e');
    questRect(c, 76, -30, 1265, 66, 9, '#fff');
  }
  const ink = selected ? '#090911' : row.hidden ? SETTINGS_MUTED : SETTINGS_CYAN;
  c.fillStyle = ink; c.textAlign = 'right'; c.font = '45px UiXLI';
  c.fillText(String(index + 1), 181, 18);
  c.textAlign = 'left'; c.font = '42px RowB';
  c.fillText(row.label, 214, 17, 687);
  c.textAlign = 'center'; c.font = '36px RowB';
  c.fillText(row.installed ? 'Installed' : 'Built-in', 1008, 16);
  const status = row.hidden ? 'Hidden' : 'Shown';
  const filled = selected || status === 'Shown';
  questRect(c, 1100, -19, 206, 46, 6, selected ? '#050509' : ink);
  if (!filled) questRect(c, 1103, -16, 200, 40, 4, '#1c1968');
  c.fillStyle = selected ? '#fff' : filled ? '#11114b' : ink;
  c.strokeStyle = c.fillStyle; c.lineWidth = 4; c.lineJoin = 'round'; c.lineCap = 'round';
  c.beginPath();
  if (status === 'Shown') {
    c.moveTo(1116, 5); c.lineTo(1122, 13); c.lineTo(1139, -6);
  } else {
    c.moveTo(1117, 4); c.lineTo(1137, 4);
  }
  c.stroke(); c.textAlign = 'left'; c.font = '34px HintL';
  c.fillText(status, 1148, 16, 148);
  c.restore();
}

function paintSettingsHeader(c) {
  c.fillStyle = '#185ad8'; c.fill(SETTINGS_STATUS_TAB);
  c.font = 'italic 31px RowB'; c.textAlign = 'center'; c.fillStyle = '#c0b9e0';
  c.fillText('No.', 164, 210); c.fillText('Menu item', 557, 210); c.fillText('On TV', 1008, 210);
  c.fillStyle = '#9ff8ff'; c.fillText('Status', 1201, 210); c.textAlign = 'left';
}

function paintSettingsDetail(c, row) {
  c.fillStyle = SETTINGS_CYAN; c.font = 'italic 58px Row'; c.fillText('Details', 227, 744);
  const firstLine = row.label + (row.hidden ? ' is hidden from the Main Menu.' : ' is shown on the Main Menu.');
  let secondLine = row.hidden ? 'Press OK to show it on the Main Menu.' : 'Press OK to hide it from the Main Menu.';
  if (canManageRow(row)) secondLine = (row.hidden ? 'Tap OK to show.' : 'Tap OK to hide.') + ' Hold OK for deletion steps.';
  if (TV && appsState === 'loading') secondLine = 'Checking installed apps…';
  if (TV && appsState === 'error') secondLine = 'Could not refresh apps. Reopen Apps to try again.';
  if (settingsSaveFailed) secondLine = 'Could not save this change for the next launch.';
  c.fillStyle = '#fff'; c.beginPath(); c.arc(268, 781, 8, 0, 2 * Math.PI); c.fill();
  c.font = '39px RowB'; c.fillText(firstLine, 294, 793, 922);
  c.fillStyle = settingsSaveFailed ? '#ffaccc' : '#fff'; c.fillText(secondLine, 294, 837, 922);
}

function settingsRowArt(row, index) {
  let art = settingsRowCache.get(row.key);
  if (!art || art.index !== index || art.label !== row.label || art.hidden !== row.hidden || art.appId !== row.appId) {
    const normal = sprite(73, -43, 1272, 84);
    paintSettingsRow(normal.x, row, index, 0, false);
    art = { index, label: row.label, hidden: row.hidden, appId: row.appId, normal };
    settingsRowCache.set(row.key, art);
  }
  return art;
}
function prepareSettingsSelection(art, row) {
  if (!art.focus) {
    art.focus = sprite(73, -43, 1272, 84);
    paintSettingsRow(art.focus.x, row, art.index, 0, true);
  }
  const status = settingsSaveFailed ? 'save failed' : appsState;
  if (!art.detail || art.status !== status) {
    art.status = status;
    art.detail = sprite(213, 678, 1032, 190);
    paintSettingsDetail(art.detail.x, row);
  }
}

function paintSettingsRemoval(c, action) {
  const guide = action.phase === 'guide';
  const waiting = action.phase === 'checking';
  c.clearRect(238, 258, 1450, 550);
  c.fillStyle = '#ff197e'; c.fill(pathOf([[268, 274], [1668, 259], [1616, 785], [238, 803]]));
  c.fillStyle = '#17145f'; c.fill(pathOf([[282, 282], [1677, 269], [1626, 784], [251, 796]]));
  c.fillStyle = '#fff'; c.fill(pathOf([[271, 324], [1672, 311], [1663, 397], [264, 410]]));
  c.fillStyle = '#100f30'; c.font = '60px UiBI'; c.fillText(action.label, 327, 384, 1260);
  c.fillStyle = SETTINGS_CYAN; c.font = 'italic 51px RowB';
  c.fillText(guide ? 'Delete in Device Care' : 'Installed apps', 325, 479);

  c.fillStyle = '#fff'; c.font = '42px RowB';
  if (guide) {
    c.fillText('Press Settings/123 on your remote and choose All Settings.', 325, 534, 1250);
    c.fillText('Open Support → Device Care → Manage Storage.', 325, 584, 1250);
    c.fillText('Select the app named above, choose Delete and confirm.', 325, 634, 1250);
    c.fillStyle = '#c0b9e0'; c.font = '37px RowB';
    c.fillText('Return to Main Menu and press OK to check again.', 325, 685, 1250);
  } else {
    const status = {
      checking: 'Checking the TV’s installed apps…',
      removed: 'This app is no longer installed on the TV.',
      present: 'This app is still installed on the TV.',
      error: action.message || 'The TV could not confirm whether this app is installed.',
    };
    c.fillText(status[action.phase] || '', 325, 556, 1225);
  }
  if (!waiting) {
    const left = keyHint(c, 1578, 739, 'OK', guide ? 'Check again' : 'Close');
    if (guide) keyHint(c, left - 36, 739, 'back', 'Cancel');
  }
}

function drawSettingsTable(c, x) {
  putAt(c, settingsHeaderPicture, x, 0);
  for (let i = 0; i < settingsPage.length; i++)
    putAt(c, settingsPage[i], x, SETTINGS_FIRST_Y + i * SETTINGS_PITCH);
  if (settingsCount > SETTINGS_ROWS) {
    const track = 224, thumb = track * SETTINGS_ROWS / settingsCount;
    const y = 467 + (track - thumb) * settingsFirst / (settingsCount - SETTINGS_ROWS);
    c.fillStyle = '#090817'; c.fillRect(x + 43, 463, 18, track + 8);
    c.fillStyle = '#fff'; c.fillRect(x + 47, y, 10, thumb);
  }
}
function buildSettingsBase() {
  if (!settingsBase) {
    settingsBase = mkCanvas(cv.width, cv.height).getContext('2d', { alpha: false });
    settingsBase.setTransform(RS, 0, 0, RS, 0, 0);
    settingsTableEdge = sprite(questIdle.x, 151, 1351 - questIdle.x, 549);
  }
  settingsBase.drawImage(questWater, 1236, 0); settingsBase.drawImage(questBoard, 0, 0);
  put(settingsBase, settingsTitlePicture); put(settingsBase, settingsGuidePicture);
  // The right edge of the status badges overlaps the moving portrait. Draw that strip above it.
  settingsBase.save(); settingsBase.beginPath(); settingsBase.rect(0, 0, questIdle.x, H); settingsBase.clip();
  drawSettingsTable(settingsBase, 0); settingsBase.restore();
  settingsTableEdge.x.clearRect(settingsTableEdge.ox, settingsTableEdge.oy, settingsTableEdge.w, settingsTableEdge.h);
  drawSettingsTable(settingsTableEdge.x, 0);
  settingsBaseDirty = false;
}
function drawApps(t) {
  if (settingsDirty) {
    const rows = settingsRows(), index = S.settingsSel, row = rows[index];
    const first = Math.max(0, index - SETTINGS_ROWS + 1);
    const last = Math.min(rows.length, first + SETTINGS_ROWS);
    if (!settingsTitlePicture) {
      settingsTitlePicture = sprite(0, 0, 976, 201);
      paintSettingsTitle(settingsTitlePicture.x);
      settingsGuidePicture = sprite(1080, 916, W - 1080, H - 916);
      paintSettingsGuide(settingsGuidePicture.x);
      settingsHeaderPicture = sprite(37, 151, 1314, 94);
      paintSettingsHeader(settingsHeaderPicture.x);
    }
    // Keep the visible window and its neighbors. Scrolling retains the rows common to both pages.
    for (const [key, art] of settingsRowCache)
      if (art.index < first - 2 || art.index >= last + 2 || rows[art.index]?.key !== key) settingsRowCache.delete(key);
    if (first !== settingsFirst || rows.length !== settingsCount) settingsBaseDirty = true;
    for (let i = first; i < last; i++) {
      const art = settingsRowArt(rows[i], i).normal;
      if (settingsPage[i - first] !== art) settingsBaseDirty = true;
      settingsPage[i - first] = art;
    }
    settingsPage.length = last - first;
    settingsFirst = first; settingsCount = rows.length;
    if (settingsFocus.openedAt !== S.tMode || settingsFocus.key !== row.key ||
        settingsFocus.index !== index || settingsFocus.hidden !== row.hidden) {
      Object.assign(settingsFocus, { openedAt: S.tMode, key: row.key, index, hidden: row.hidden, since: t });
    }
    settingsFocus.y = SETTINGS_FIRST_Y + (index - first) * SETTINGS_PITCH;
    const selected = settingsRowCache.get(row.key);
    prepareSettingsSelection(selected, row);
    settingsFocusPicture = selected.focus; settingsDetailPicture = selected.detail;
    for (const i of [index - 1, index + 1]) {
      if (!rows[i]) continue;
      const neighbor = settingsRowArt(rows[i], i);
      if (!neighbor.focus && !neighbor.queued) {
        neighbor.queued = true;
        later(() => { if (settingsRowCache.get(rows[i].key) === neighbor) prepareSettingsSelection(neighbor, rows[i]); });
      }
    }
    if (removal) {
      if (!settingsRemovalPicture) settingsRemovalPicture = sprite(238, 258, 1450, 550);
      paintSettingsRemoval(settingsRemovalPicture.x, removal);
    }
    settingsDirty = false;
  }
  const age = S.mode === 'apps' ? t - S.tMode : 1000;
  const listIn = eOut(prog(age, 400, 125)), focusIn = eOut(prog(t, settingsFocus.since, 100));
  const x = (1 - listIn) * -48;
  if (age >= 580 && questBoard) {
    if (settingsBaseDirty) buildSettingsBase();
    g.globalAlpha = 1; g.drawImage(settingsBase.canvas, 0, 0, W, H);
    drawIdleArt(questIdle, t, 1);
    put(g, settingsTableEdge);
  } else {
    drawQuestBackground(age);
    if (age >= 378) drawIdleArt(questIdle, t, eOut(prog(age, 378, 145)));
    const titleIn = eOut(prog(age, 310, 155)), titleOffset = 135 * (1 - titleIn);
    g.globalAlpha = titleIn; putAt(g, settingsTitlePicture, -titleOffset, titleOffset * .204);
    g.globalAlpha = eOut(prog(age, 265, 155)); put(g, settingsGuidePicture);
    g.globalAlpha = listIn; drawSettingsTable(g, x);
  }
  g.globalAlpha = listIn;
  putAt(g, settingsFocusPicture, x - (1 - focusIn) * 14, settingsFocus.y);
  const detailIn = eOut(prog(t, settingsFocus.since, 135));
  g.globalAlpha = eOut(prog(age, 430, 150)) * (.65 + detailIn * .35);
  putAt(g, settingsDetailPicture, -15 * (1 - detailIn), 0);
  g.globalAlpha = 1;
  if (removal && settingsRemovalPicture) {
    g.fillStyle = 'rgba(3,4,31,.83)'; g.fillRect(0, 0, W, H);
    put(g, settingsRemovalPicture);
  }
}

// ───────────────────────── intro: white, then the dive ─────────────────────────
// The screen starts white and bubbles of water open in it. Each bubble grows from its own start time, so every spot has
// one moment at which it clears. That moment is worked out once, as a small map; drawing a frame is then a matter of
// comparing the map with the clock. The TV's graphics chip does that for every pixel (a tiny WebGL program on a
// second canvas laid over the first); where WebGL is missing, a plain loop over the small map does it instead.
const FW = 320, FH = 180;
const R2 = rng(91);
const holes = Array.from({ length: 64 }, () => {       // positions in half-size screen units, as first drawn
  const x = R2() * 1040 - 40, y = R2() * 620 - 40, col = Math.min(Math.abs(x - 330), Math.abs(x - 610), Math.abs(x - 190)) < 46;
  const d = Math.hypot(x - 520, y - 500) / 620;
  return { x, y, t0: 230 + d * 430 + (col ? 260 + (540 - y) * .7 : 0) + R2() * 120, r: 70 + R2() * 120 };
});
let foamT = null, fx = null, foam2d = null, foamEnd = 0;
function buildFoam() {
  const T = foamT = new Float32Array(FW * FH).fill(1e9), k = FW / (W / 2);
  for (const h of holes.slice().sort((a, b) => a.t0 - b.t0)) {
    const cx = h.x * k, cy = h.y * k, R = h.r * 2.2 * k, RR = R * R, t0 = h.t0;
    const x0 = Math.max(0, Math.floor(cx - R)), x1 = Math.min(FW - 1, Math.ceil(cx + R)), y0 = Math.max(0, Math.floor(cy - R)), y1 = Math.min(FH - 1, Math.ceil(cy + R));
    for (let y = y0; y <= y1; y++) {
      const dy = y + .5 - cy, dy2 = dy * dy; let i = y * FW + x0;
      for (let x = x0; x <= x1; x++, i++) {
        if (T[i] <= t0) continue;                               // an earlier bubble already opened this spot before this one starts
        const dx = x + .5 - cx, d2 = dx * dx + dy2; if (d2 >= RR) continue;
        const tt = t0 + 640 * (1 - Math.cbrt(1 - Math.sqrt(d2) / R)); if (tt < T[i]) T[i] = tt;      // the ease-out growth, solved for time
      }
    }
  }
  let latest = 0;
  for (let i = 0; i < T.length; i++) {
    T[i] = Math.min(T[i], 1900);
    latest = Math.max(latest, T[i]);
  }
  foamEnd = latest + SHEETS[0][0] + 4;      // the last pixel of the outer sheet is fully transparent
  if (!Q.get('nogl')) try { fx = foamGL(); } catch (e) { oops('foam', e); fx = null; }
}
const SHEETS = [[170, [127, 232, 255]], [80, [201, 248, 255]], [0, [255, 255, 255]]];      // three sheets, the outer ones dissolving later
function foamGL() {
  const c = mkCanvas(960, 540); c.id = 'fx';
  const gl = c.getContext('webgl', { alpha: true, premultipliedAlpha: true, antialias: false, depth: false, stencil: false, preserveDrawingBuffer: CAPTURE });
  if (!gl) return null;
  if (gl.getShaderPrecisionFormat(gl.FRAGMENT_SHADER, gl.HIGH_FLOAT).precision < 20) return null;       // the map is read back to about 1/36 ms
  const sh = (type, src) => { const s = gl.createShader(type); gl.shaderSource(s, src); gl.compileShader(s); if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s)); return s; };
  const col = c3 => `vec3(${(c3[0] / 255).toFixed(4)}, ${(c3[1] / 255).toFixed(4)}, ${(c3[2] / 255).toFixed(4)})`;
  const pr = gl.createProgram();
  gl.attachShader(pr, sh(gl.VERTEX_SHADER, 'attribute vec2 p; varying vec2 uv; void main() { uv = vec2(p.x * .5 + .5, .5 - p.y * .5); gl_Position = vec4(p, 0., 1.); }'));
  gl.attachShader(pr, sh(gl.FRAGMENT_SHADER, `precision highp float; varying vec2 uv; uniform sampler2D s; uniform float t; const vec2 sz = vec2(${FW}., ${FH}.);
    float at(vec2 ij) { vec4 v = texture2D(s, (ij + .5) / sz); return (v.r * 65280. + v.g * 255.) / 65535. * 1800. + 200.; }
    void main() {
      vec2 st = uv * sz - .5, i = floor(st), f = st - i;
      float T = mix(mix(at(i), at(i + vec2(1., 0.)), f.x), mix(at(i + vec2(0., 1.)), at(i + vec2(1., 1.)), f.x), f.y), left = T - t;
      float a0 = clamp((left + ${SHEETS[0][0]}.) / 7. + .5, 0., 1.), a1 = clamp((left + ${SHEETS[1][0]}.) / 7. + .5, 0., 1.), a2 = clamp(left / 7. + .5, 0., 1.);
      vec4 c = vec4(${col(SHEETS[0][1])} * a0, a0);
      c = vec4(${col(SHEETS[1][1])} * a1, a1) + c * (1. - a1);
      gl_FragColor = vec4(a2) + c * (1. - a2);
    }`));
  gl.bindAttribLocation(pr, 0, 'p'); gl.linkProgram(pr);
  if (!gl.getProgramParameter(pr, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(pr));
  gl.useProgram(pr);
  gl.bindBuffer(gl.ARRAY_BUFFER, gl.createBuffer()); gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW); gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
  const px = new Uint8Array(FW * FH * 4);
  for (let i = 0; i < FW * FH; i++) { const v = Math.round(clamp((foamT[i] - 200) / 1800) * 65535); px[i * 4] = v >> 8; px[i * 4 + 1] = v & 255; px[i * 4 + 3] = 255; }
  gl.bindTexture(gl.TEXTURE_2D, gl.createTexture()); gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, FW, FH, 0, gl.RGBA, gl.UNSIGNED_BYTE, px);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  gl.disable(gl.BLEND); gl.viewport(0, 0, c.width, c.height);
  if (gl.getError() !== gl.NO_ERROR) return null;
  c.style.display = 'none'; document.body.appendChild(c);
  c.addEventListener('webglcontextlost', e => { e.preventDefault(); c.remove(); if (fx && fx.cv === c) fx = null; note('the foam lost its graphics context; using the plain version from now on'); });
  return { cv: c, gl, ut: gl.getUniformLocation(pr, 't'), on: false };
}
function foamOff() { if (fx && fx.on) { fx.cv.style.display = 'none'; fx.on = false; } }
function drawFoam(t) {
  if (t >= foamEnd || OFF.foam) return foamOff();
  if (fx) { if (!fx.on) { fx.cv.style.display = 'block'; fx.on = true; } fx.gl.uniform1f(fx.ut, t); fx.gl.drawArrays(fx.gl.TRIANGLE_STRIP, 0, 4); return; }
  if (!foam2d) { const c = mkCanvas(FW, FH), x = c.getContext('2d'); foam2d = { c, x, pix: x.createImageData(FW, FH) }; }
  const d = foam2d.pix.data, T = foamT, n = FW * FH, soft = 1 / 7;
  for (let i = 0, j = 0; i < n; i++, j += 4) {
    const left = T[i] - t;                                    // ms until the white sheet opens here
    if (left <= -174) { d[j + 3] = 0; continue; }
    if (left >= 4) { d[j] = d[j + 1] = d[j + 2] = d[j + 3] = 255; continue; }
    let r = 0, gg = 0, b = 0, al = 0;                           // stack the sheets, each with a soft edge
    for (let s = 0; s < 3; s++) {
      let a = (left + SHEETS[s][0]) * soft + .5; if (a <= 0) continue; if (a > 1) a = 1;
      const c = SHEETS[s][1]; r = c[0] * a + r * (1 - a); gg = c[1] * a + gg * (1 - a); b = c[2] * a + b * (1 - a); al = a + al * (1 - a);
    }
    if (al <= 0) { d[j + 3] = 0; continue; }
    d[j] = r / al; d[j + 1] = gg / al; d[j + 2] = b / al; d[j + 3] = al * 255;
  }
  foam2d.x.putImageData(foam2d.pix, 0, 0);
  T0(); g.globalAlpha = 1; g.drawImage(foam2d.c, 0, 0, W, H);
}

// ───────────────────────── opening an app: the wedge swallows the screen, the name stays, then cut to black ─────────────────────────
let nowOpenSpr = null;
function nowOpen() { if (!nowOpenSpr) { nowOpenSpr = sprite(760, 706, 400, 50); const x = nowOpenSpr.x; x.fillStyle = '#000'; x.font = '34px Hint'; x.textAlign = 'center'; x.fillText('Now opening', 960, 742); } return nowOpenSpr; }
const OP = new Float32Array(6), OQ = new Float32Array(6);
function drawOpening(t, lp) {
  const sel = S.sel, gm = itemGeom(sel, 1), gcx = gm.cx, gcy = gm.cy, ga = gm.a, gL = gm.L, gcap = gm.cap;
  const grow = eIn(prog(lp, 60, 330)), k2 = eIn(prog(lp, 110, 330)), R = 60 + grow * 5200, R2b = 40 + k2 * 5200;
  let cs = Math.cos(ga - grow * .12), sn = Math.sin(ga - grow * .12);
  g.globalAlpha = 1; TF(g, cs, sn, -sn, cs, gcx, gcy);
  g.fillStyle = PINK; g.beginPath(); g.moveTo(-gL / 2 - 80 - grow * 900, 10); g.lineTo(R, -R * .34 - 40); g.lineTo(R, R * .3 + 30); g.fill();
  g.fillStyle = '#fff'; g.beginPath(); g.moveTo(-gL / 2 - 40 - k2 * 1400, 0); g.lineTo(R2b, -R2b * .5 - 30); g.lineTo(R2b, R2b * .46 + 24); g.fill();
  if (CAPTURE && !openSpr(sel)) { openPart(sel, false); openPart(sel, true); }
  // the large pair is made in the first frames of the transition if it was not there yet; until then the selected-line pair stands in (same letters, smaller)
  const sp = openSpr(sel) || selSpr(sel), hold = eOut(prog(lp, 300, 420)), cap = lerp(gcap, openCap(sel), hold), size = cap / CAPK, L = unitW[sel] * SX_SEL * size;
  const cx = lerp(gcx, 960, hold), cy = lerp(gcy, 560, hold), ang = lerp(ga, -8 * DEG, hold);
  T0();
  if (lp > 380) { g.fillStyle = '#fff'; g.globalAlpha = clamp((lp - 380) / 80); g.fillRect(0, 0, W, H); g.globalAlpha = 1; }      // fully white from 460 on
  cs = Math.cos(ang); sn = Math.sin(ang);
  const ex = cx + cs * (-L / 2) - sn * (cap / 2), ey = cy + sn * (-L / 2) + cs * (cap / 2), band = lp > 400;
  if (band) {
    const bandIn = eOut(prog(lp, 420, 360));
    OQ[0] = -.5 * cap - 600 * (1 - bandIn); OQ[1] = -.25 * cap; OQ[2] = L + 1.4 * cap; OQ[3] = -.25 * cap - (L + 1.9 * cap) * .15 * bandIn; OQ[4] = L + .5 * cap; OQ[5] = -.25 * cap + (L + cap) * .17 * bandIn;
    OP[0] = OQ[0] - .5 * cap; OP[1] = OQ[1] - .08 * cap; OP[2] = OQ[2] + .3 * cap; OP[3] = OQ[3] - .04 * cap; OP[4] = OQ[4] + .16 * cap; OP[5] = OQ[5] + .06 * cap;
    TF(g, cs, sn, -sn, cs, ex, ey); g.fillStyle = PINK; tri(g, OP); g.fill(); g.fillStyle = '#19d3ff'; tri(g, OQ); g.fill();
  }
  const k = size / sp.fs, ta = cs * k * SX_SEL, tb = sn * k * SX_SEL, tc = (cs * SKEW - sn) * k, td = (sn * SKEW + cs) * k;
  TF(g, ta, tb, tc, td, ex, ey); put(g, sp.b);
  if (band) { g.save(); TF(g, cs, sn, -sn, cs, ex, ey); tri(g, OQ); g.clip(); TF(g, ta, tb, tc, td, ex, ey); put(g, sp.r); g.restore(); }
  T0();
  if (lp > 520) {
    g.globalAlpha = eOut(prog(lp, 520, 300)); put(g, nowOpen());
    g.fillStyle = '#000'; for (let i = 0; i < 3; i++) { g.globalAlpha = .25 + .75 * clamp(Math.sin(lp / 130 - i * .9)); g.beginPath(); g.arc(930 + i * 30, 776, 6, 0, 7); g.fill(); }
    g.globalAlpha = 1;
  }
  // previews end on a cut to black; on the TV the "Now opening" card simply stays until the app takes over
  const out = S.holdLaunch ? 0 : eIO(prog(lp, 1500, 420));
  if (out > 0) { g.fillStyle = '#000'; g.beginPath(); g.moveTo(W + 400 - out * (W + 900), 0); g.lineTo(W + 400, 0); g.lineTo(W + 400, H); g.lineTo(W - out * (W + 900), H); g.fill(); }
  if (S.debug && lp > 470) drawDebug();
}

// ───────────────────────── frame ─────────────────────────
let _pt = 0; const mark = name => { if (!PROF) return; g.getImageData(0, 0, 1, 1); const n = performance.now(); if (name) (window.__prof = window.__prof || {})[name] = (window.__prof[name] || 0) + n - _pt; _pt = n; };
function drawHub(t, age) {
  g.save(); T0();
  settingsHub.draw(g, t, S.hubSel, age, t - S.tHubSel, S.prevHubSel, reduceMenuMotion.matches);
  g.restore();
}
function drawSettingsChild(mode, t, age) {
  g.save(); T0();
  if (mode === 'apps') drawApps(t);
  else {
    const top = Math.max(0, S.inputSel - 7);
    const status = !SOURCES.length && (S.sourcesState === 'asking' ? 'Reading TV inputs…' :
      S.sourcesState === 'failed' ? 'Could not read TV inputs. Press OK to retry.' : 'No inputs available.');
    inputSettings.draw(g, t, SOURCES, S.inputSel, top, age, t - S.tInputSel, S.prevInputSel, reduceMenuMotion.matches, status || '');
  }
  g.restore();
}
function render() {
  const t = S.t;
  T0(); g.globalAlpha = 1; g.globalCompositeOperation = 'source-over';
  const age = Math.max(0, t - S.tMode), reduced = reduceMenuMotion.matches;
  if (S.mode === 'apps' || S.mode === 'inputSettings') {
    foamOff();
    if (age < 230 && !reduced) {
      drawHub(t, 1200);
      g.save(); g.beginPath(); g.arc(1000, 515, 1210 * eIO(age / 230), 0, Math.PI * 2); g.clip();
    }
    drawSettingsChild(S.mode, t, age);
    if (age < 230 && !reduced) g.restore();
    if (S.debug) drawDebug();
    return;
  }
  if (S.mode === 'settings' && (S.prevMode !== 'home' || age >= 350 || reduced)) {
    foamOff();
    drawHub(t, S.prevMode === 'home' ? age : 1200 + age);
    if (!reduced && age < 190 && (S.prevMode === 'apps' || S.prevMode === 'inputSettings')) {
      g.save(); g.beginPath();
      const edge = W * eIO(age / 190);
      g.moveTo(edge + 120, 0); g.lineTo(W + 120, 0); g.lineTo(W + 120, H); g.lineTo(edge, H); g.closePath(); g.clip();
      drawSettingsChild(S.prevMode, t, 1200);
      g.restore();
    }
    if (S.debug) drawDebug();
    return;
  }
  const mList = S.mode === 'list' ? eIO(prog(t, S.tMode, 560)) : S.prevMode === 'list' ? 1 - eIO(prog(t, S.tMode, 460)) : 0;
  const lp = S.mode === 'launch' ? t - S.tLaunch : -1;
  const home = 1 - mList;
  TOPNOW = topAt(t);
  if (t < 260) { g.fillStyle = '#fff'; g.fillRect(0, 0, W, H); drawFoam(t); return; }      // the opening white: nothing shows yet (the foam sheet is already up, still closed)
  if (lp > 470) { foamOff(); drawOpening(t, lp); return; }                                // the "Now opening" card covers everything
  // The white Inputs header covers the water, moving portraits, menu and clock beneath it.
  // Exclude whole covered pixel rows before compositing those layers during the transition.
  const cover = mList > 0 && !OFF.list ? Math.floor((listSkyY(mList) + 206) * RS) / RS : 0;
  if (cover > 0) { g.save(); g.beginPath(); g.rect(0, cover, W, H - cover); g.clip(); }
  mark();
  const artReady = homeScene.complete && homeScene.naturalWidth > 0 &&
    !X.nohero && !OFF.hero && !OFF.title && !OFF.wedge && !OFF.water && !OFF.shards;
  // Canvas blends to 8-bit colors. Skip the second full-screen composition when it has rounded away.
  const artAlpha = artReady ? Math.round(255 * sstep(.76, 0, mList)) / 255 : 0;
  const transitionWater = artAlpha > 0 && artAlpha < 1 && mList > 0 && lp < 0;
  const waterRevealsHome = transitionWater && !!homeRenderer && !CAPTURE && !reduceMenuMotion.matches;
  const diving = artReady && !reduceMenuMotion.matches && mList === 0 && t < 1500;
  const openingEdge = diving ? Math.round(H * RS * eIO(prog(t, 1290, 210))) / RS : 0;
  if (openingEdge > 0) {
    g.save(); g.beginPath(); g.rect(0, openingEdge, W, H - openingEdge); g.clip();
  }
  if (diving) {
    if (!diveWater) {
      // The clear right half of the poster supplies both halves of the water behind the falling figure.
      diveWater = mkCanvas(W, H);
      const water = diveWater.getContext('2d', { alpha: false }), half = W / 2;
      water.drawImage(homeScene, half, 0, half, H, half, 0, half, H);
      water.setTransform(-1, 0, 0, 1, W, 0);
      water.drawImage(homeScene, half, 0, half, H, half, 0, half, H);
    }
    g.drawImage(diveWater, 0, 0, W, H);
  } else if (transitionWater) drawTransitionWater(waterRevealsHome ? 1 - artAlpha : 1);
  else if (artAlpha < 1) drawBackground(t);
  mark('water');
  const burst = lp > 0 ? eOut(lp / 500) : 0;
  if (artAlpha < 1 && !transitionWater) drawShards(t, false, burst);
  mark('shards');

  if (diving || (!artReady && mList < 1)) {
    const heroIn = eOut5(prog(t, 560, 1150));
    const fade = sstep(.6, .15, mList);
    PK.dx = mList * 680; PK.dy = (1 - heroIn) * -1050 + mList * -120; PK.sc = 1 + mList * 1.4; PK.rot = QL.sway ? (1 - heroIn) * -.12 : 0; PK.wedge = fade; PK.alpha = fade;
    PK.title = eOut(prog(t, 1350, 500)); PK.titleSlide = (1 - eOut(prog(t, 1300, 650))) * -260; PK.digOff = (1 - eOut(prog(t, S.tSel, 200))) * -60;
    drawPlate(t, PK);
  }
  if (openingEdge > 0) {
    g.restore();
    T0(); g.save(); g.beginPath(); g.rect(0, 0, W, openingEdge); g.clip();
    drawHomeArt(t, 1, 0); g.restore();
  } else if (!diving && artAlpha > 0) drawHomeArt(t, artAlpha, mList, waterRevealsHome);
  mark('figure');
  if (mList > 0) drawListPlate(t, mList, sstep(.1, .6, mList));

  // home UI
  const menuOut = eIn(clamp(mList * 1.7));
  for (let i = 0; i < APPS.length; i++) {
    const pl = clamp(i - S.top, 0, VIS - 1), p = eBack(prog(t, 1250 + pl * 60, 360), 1.2);
    let a = clamp(prog(t, 1250 + pl * 60, 180)) * (1 - menuOut), off = (1 - p) * 300 + menuOut * (420 + pl * 30);
    if (lp >= 0 && i !== S.sel) { off += eIn(lp / 300) * 900; a *= 1 - clamp(lp / 260); }
    VA[i] = a; VO[i] = off;
  }
  if (menuOut < 1 && lp < 330) drawMenu(t);
  mark('menu');
  if (artAlpha === 0) drawShards(t, true, burst);
  T0();
  const hudIn = eOut(prog(t, 1550, 420)), hudA = home * (lp >= 0 ? 1 - clamp(lp / 200) : 1);
  drawClock(t, hudIn * hudA, lerp(.7, 1, eBack(prog(t, 1550, 380), 2.4)));
  mark('hud');
  if (cover > 0) g.restore();
  drawList(t, mList); mark('list');

  // guide text + key hints
  const gi = eOut(prog(t, 1750, 400)) * (lp >= 0 ? 1 - clamp(lp / 200) : 1);
  const noticeOn = S.notice && t - S.tNotice < 4200;
  if (noticeOn) drawGuide(t, gi * (1 - prog(t, S.tNotice + 3800, 400)), S.notice, 'Notice', mList < .5 ? 'home' : 'list', S.tNotice);
  else if (mList < .5) drawGuide(t, gi * sstep(.5, 0, mList), cmdOf(APPS[S.sel]), 'Command', 'home', Math.max(S.tSel, 1750));
  else drawGuide(t, sstep(.5, 1, mList), 'Which source do you want?', 'Guide', 'list', S.tMode);
  mark('guide');
  drawFoam(t); mark('foam');
  if (lp >= 0) drawOpening(t, lp);
  T0();
  if (S.mode === 'settings') drawHub(t, age);
  if (S.prevMode === 'settings' && S.mode === 'home' && age < 250 && !reduced) {
    g.save(); g.beginPath(); g.arc(1110, 455, 1500 * (1 - eIO(age / 250)), 0, Math.PI * 2); g.clip();
    drawHub(t, 1200);
    g.restore();
  }
  if (S.debug) drawDebug();
  if (refImg && refImg.complete) { g.globalAlpha = +Q.get('ref') || .5; g.drawImage(refImg, 0, 0, W, H); g.globalAlpha = 1; }
}

// Before the opening plays, each kind of frame is drawn once where it cannot be seen (the screen is still white): home
// with everything in, a selection just made, the Inputs screen, the change between the two, an app opening. The first
// time the TV draws a kind of thing it can take several frames over it; this way that happens before anything moves.
// One scene per frame: within a frame, a scene that repaints the whole screen makes the browser drop whatever was
// drawn before it without ever drawing it.
const QUEST_POSES_START = 9;
function rehearse(k) {
  const keep = [S.t, S.mode, S.prevMode, S.tMode, S.sel, S.prevSel, S.tSel, S.tLaunch, S.holdLaunch, S.tLsel, S.debug];
  S.debug = false; S.t = 9000; S.mode = S.prevMode = 'home'; S.tMode = S.tSel = S.tLsel = S.tLaunch = -1e6;
  const app = APPS.findIndex(a => !a.screen && !a.missing);
  if (k === 1) S.tSel = 8930;                                                              // a selection just made
  else if (k === 2 || k === 3) { if (app >= 0) { S.sel = app; S.mode = 'launch'; S.holdLaunch = true; S.tLaunch = k === 2 ? 8750 : 8000; } }      // an app opening: the wedge, then the card
  else if (k === 4) S.mode = 'list';                                                       // the Inputs screen (last: the TV's list of sources has had time to arrive)
  else if (k === 5) { S.prevMode = 'list'; S.tMode = 8800; }                               // on the way back from it: both at once
  else if (k === 6) { S.mode = 'apps'; S.tMode = S.t - 170; } // moving board and water inside the reveal
  else if (k === 7) S.t = 850; // falling portrait and moving foam
  else if (k === 8) S.t = 1400; // wipe into the first animated Home pose
  else if (k >= QUEST_POSES_START) { S.mode = 'apps'; S.t = 8000 + (k - QUEST_POSES_START) * 250; } // one Quest pose at display size
  try { render(); } catch (e) { oops('rehearsal', e); }
  if (k >= QUEST_POSES_START && k - QUEST_POSES_START < SETTINGS_ROWS) {
    const index = k - QUEST_POSES_START, row = settingsRows()[index];
    if (row) {
      const art = settingsRowArt(row, index);
      prepareSettingsSelection(art, row);
      putAt(g, art.focus, 0, SETTINGS_FIRST_Y); put(g, art.detail);
    }
  }
  [S.t, S.mode, S.prevMode, S.tMode, S.sel, S.prevSel, S.tSel, S.tLaunch, S.holdLaunch, S.tLsel, S.debug] = keep;
  touch();
  // back to plain white — in two halves: after one fill of the whole screen the graphics chip would be told to skip everything before it
  T0(); g.globalAlpha = 1; g.globalCompositeOperation = 'source-over';
  if (!fx) { g.fillStyle = '#fff'; g.fillRect(0, 0, W / 2, H); g.fillRect(W / 2, 0, W / 2, H); }
  drawFoam(0);
}

// ───────────────────────── speed: a running record of frames, a readout (red button / D), and the level watch ─────────────────────────
const REC = 720, recDt = new Float32Array(REC), recJs = new Float32Array(REC); let recN = 0;
function recStats(n) {       // the last n frames: how many screen refreshes went by without a new frame, and how long the script took
  n = Math.min(n, recN, REC); if (!n) return { n: 0, fps: 0, js: 0, missed: 0, missedPct: 0, max: 0 };
  let sum = 0, js = 0, missed = 0, max = 0;
  for (let k = 0; k < n; k++) { const i = (recN - 1 - k) % REC, d = recDt[i]; sum += d; js += recJs[i]; if (d > max) max = d; missed += Math.max(0, Math.round(d / 16.667) - 1); }
  return { n, fps: +(n / sum * 1000).toFixed(1), js: +(js / n).toFixed(2), missed, missedPct: +(missed / (missed + n) * 100).toFixed(1), max: +max.toFixed(1) };
}
window.__frames = n => { n = Math.min(n || REC, recN, REC); const dt = [], js = []; for (let k = n - 1; k >= 0; k--) { const i = (recN - 1 - k) % REC; dt.push(+recDt[i].toFixed(2)); js.push(+recJs[i].toFixed(2)); } return { dt, js }; };
const auto = { on: false, quiet: 0, slow: 0 };
// Whether something of the TV's own is in front of the page (its screensaver comes up after two minutes without a key
// press, and then takes a good part of the graphics chip: measured 60 → 42 frames a second), and when a key last came.
const front = { covered: false, since: 0, key: 0, lies: false };
function drawDebug() {
  const st = recStats(180);
  const lines = [
    `level ${q}/3 · canvas ${cv.width}×${cv.height} · ${st.fps} fps over the last ${st.n} frames · ${st.missed} refreshes missed (${st.missedPct}%) · longest gap ${st.max} ms · script ${st.js} ms a frame · watch: ${auto.on ? 'on' : 'off'} · foam: ${fx ? 'graphics chip' : 'plain'}${front.covered ? ' · the TV has something in front' : ''}`,
    `apps: ${diag.apps ? diag.apps.how + ', ' + APPS.filter(a => a.appId).map(a => a.label + '=' + a.appId).join(', ') : (TV ? 'not asked yet' : 'preview data')}`,
    `sources: ${diag.sources ? diag.sources : (TV ? 'not reported yet' : 'preview data')}`,
    `page ${innerWidth}×${innerHeight} @${devicePixelRatio} · set-up ${Object.keys(diag.setup).map(k => diag.setup[k]).join('+')} ms · pictures waiting to be made: ${jobs.length}`,
    (navigator.userAgent || '').slice(0, 150),
  ].concat(diag.notes.slice(-3), diag.errors.slice(-4).map(e => '! ' + e));
  T0(); g.globalAlpha = .82; g.fillStyle = '#000814'; g.fillRect(40, 40, 1700, 30 + lines.length * 30);
  g.globalAlpha = 1; g.font = '22px Row'; g.textAlign = 'left';
  lines.forEach((l, i) => { g.fillStyle = l[0] === '!' ? '#ffb0c8' : '#d8f6ff'; g.fillText(l.slice(0, 160), 58, 76 + i * 30); });
}
window.__diag = () => { const st = recStats(180); return { ua: navigator.userAgent, tv: TV, page: [innerWidth, innerHeight, devicePixelRatio], setup: diag.setup, q, rs: RS, canvas: [cv.width, cv.height],
  fps: st.fps, frameMs: st.fps ? +(1000 / st.fps).toFixed(2) : 0, drawMs: st.js, perf: st, auto: auto.on ? 'watching' : 'off', foam: fx ? 'webgl' : '2d', jobs: jobs.length + urgent.length, covered: front.covered, focus: document.hasFocus(), sinceKey: Math.round((performance.now() - front.key) / 1000),
  apps: diag.apps, menu: APPS.map(a => ({ label: a.label, appId: a.appId || null, missing: !!a.missing })), top: S.top, sources: SOURCES.map(s => s.name + (s.dim ? ' (empty)' : '')), sourcesInfo: diag.sources, notes: diag.notes, errors: diag.errors, mode: S.mode, sel: S.sel,
  homeMotion: { backend: homeRenderer?.backend, pages: homeRenderer ? HOME_MOTION_FRAMES.pages.length : 0, width: motionCanvas?.width, height: motionCanvas?.height, pose: lastHomePose },
  inputSettings: { selected: S.inputSel, rows: SOURCES.map(({ key, name, defaultName, connected }) => ({key, name, defaultName, connected})), editing: nameEditor.isOpen() },
  menuSettings: { state: appsState, removal, selected: S.settingsSel, rows: settingsRows() } }; };
window.__lab = { S, get homePose() { return lastHomePose; }, auto, front, jobs, OFF, setQuality: n => setQuality(n), level: () => q };      // handles for experiments on the TV (tools/, lab/)
const LEVEL_KEY = 'mainmenu.level.5';
function saveLevel() { try { localStorage.setItem(LEVEL_KEY, String(q)); } catch (_) {} }
// The resolution and what is pictured at which size depend on the level, so a change of level may remake the pictures.
let sized = false;
function setQuality(n) {
  const was = QL; q = clamp(n | 0, 0, QUALITY.length - 1); QL = QUALITY[q];
  if (sized && was.rs === QL.rs && was.cauDiv === QL.cauDiv) return;       // only counts changed: nothing to remake
  sized = true; RS = QL.rs; cv.width = Math.round(W * RS); cv.height = Math.round(H * RS);
  lineCache.clear(); selCache.clear(); openCache.clear(); guideCache.clear(); labelCache.clear(); hintCache.clear(); digitCache.clear();
  LS.sig = null; LS.title = LS.strip = null; LS.rows = []; LS.bars = []; LS.info = []; clockSpr = null; nowOpenSpr = null; menuL = null; jobs.length = 0; urgent.length = 0;
  settingsTitlePicture = settingsGuidePicture = settingsHeaderPicture = null;
  settingsBase = settingsTableEdge = null; settingsBaseDirty = true;
  settingsRowCache.clear(); settingsPage.length = 0;
  settingsFocusPicture = settingsDetailPicture = settingsRemovalPicture = null;
  settingsDirty = true;
  buildCaustics(); buildWater(); lap('· water'); if (heroOK && !X.nohero) buildHero(); lap('· figure'); buildTitle(); buildArrow(); buildRule(); guideLabel('Command'); guideHints('home');
  later(() => { guideLabel('Guide'); guideLabel('Notice'); guideHints('list'); }); later(nowOpen); lap('· title and hints');
  measureMenu(); lap('· menu words');
  listChanged(); lap('· inputs screen');
}
// While the home screen sits still, count missed refreshes; if it keeps missing them, drop a level for this session
// (the next start begins at the chosen level again). It never goes up by itself, never judges while something is
// animating, and only judges while someone is plainly using the TV: a key within the last minute and a half, nothing
// of the TV's own in front. (Left alone for two minutes the TV starts its screensaver over the page, and that alone
// slows the page down; judging then would lower the picture for no reason.)
function watch(now) {
  const still = S.t > 3400 && S.mode === 'home' && S.t - S.tSel > 700 && S.t - S.tMode > 1300 && S.t - S.tTop > 700 && !jobs.length && appsState !== 'loading'
    && !front.covered && now - front.key < 90000;
  if (!auto.on || !still) { auto.quiet = 0; return; }
  if (++auto.quiet < 240) return;
  const st = recStats(180); auto.quiet = 0;
  if (st.missedPct > 6 && q > 0) { if (++auto.slow >= 2) { auto.slow = 0; setQuality(q - 1); note(`kept missing frames while still (${st.missedPct}%): level ${q} until the next start`); } }
  else auto.slow = 0;
}

// ───────────────────────── the TV: installed apps, sources, launching ─────────────────────────
// The installed-app list arrives asynchronously while the opening or Apps screen is shown.
const APPS_KEY = 'mainmenu.apps.2';
const MENU_PREFS_KEY = 'mainmenu.menu.1';
const defaultOrder = [INPUTS_ENTRY.key, ...catalogByKey.keys()];
let menuOrder = defaultOrder.slice();
let hiddenEntries = new Set();
let settingsSaveFailed = false;
function readMenuPreferences() {
  try {
    const prefs = JSON.parse(localStorage.getItem(MENU_PREFS_KEY));
    if (!prefs || typeof prefs !== 'object') return;
    // Keep choices for temporarily uninstalled apps so reinstalling restores their previous place.
    const valid = keys => Array.isArray(keys) ? keys.filter(key => defaultOrder.includes(key) ||
      (typeof key === 'string' && key.startsWith('tv:') && key.length > 3)) : [];
    menuOrder = [...new Set([...valid(prefs.order), ...defaultOrder])];
    hiddenEntries = new Set(valid(prefs.hidden));
  } catch (_) {}
}
function saveMenuPreferences() {
  try {
    localStorage.setItem(MENU_PREFS_KEY, JSON.stringify({ order: menuOrder, hidden: [...hiddenEntries] }));
    settingsSaveFailed = false;
  } catch (_) { settingsSaveFailed = true; }
}
function adjustMenu(name) {
  const index = S.settingsSel;
  const rows = settingsRows();
  const key = rows[index].key;
  if (name === 'up' || name === 'down') {
    S.settingsSel = clamp(index + (name === 'up' ? -1 : 1), 0, rows.length - 1);
    if (S.settingsSel === index) return;
    settingsDirty = true;
    return 'focus';
  }
  if (name === 'ok') {
    if (hiddenEntries.has(key)) hiddenEntries.delete(key);
    else hiddenEntries.add(key);
  } else {
    const next = index + (name === 'left' ? -1 : 1);
    if (next < 0 || next >= rows.length) return;
    const other = rows[next].key;
    const from = menuOrder.indexOf(key), to = menuOrder.indexOf(other);
    menuOrder[from] = other;
    menuOrder[to] = key;
    S.settingsSel = next;
  }
  settingsDirty = true;
  saveMenuPreferences();
  refreshMenu();
  if (settingsSaveFailed) return;
  return name === 'ok' ? 'confirm' : 'focus';
}

const want = { apps: false, sources: false };
const asked = { n: 0, again: false };      // answers still awaited by a start (the opening waits a moment for them); again: new pictures came with one
let appsState = 'idle';
const menuSig = list => JSON.stringify(list.map(e => [e.key, e.appId, e.label, e.displayName]));
function refreshMenu() {
  if (DEMO_MENU) return;
  const next = menuOrder.filter(key => !hiddenEntries.has(key) && menuChoices.has(key)).map(key => menuChoices.get(key));
  next.push(SETTINGS_ENTRY);
  if (menuSig(next) === menuSig(APPS)) return;
  const keep = APPS[S.sel].key;
  APPS = next;
  const again = APPS.findIndex(a => a.key === keep); S.sel = again >= 0 ? again : 0; S.prevSel = S.sel;
  if (sized) { measureMenu(); asked.again = true; }       // (before the first set-up there is nothing to redo: the set-up measures the menu itself)
}
function setMenu(entries, how) {
  if (!diag.apps) diag.apps = {};
  diag.apps.how = how;
  if (menuSig(entries) === menuSig(discoveredApps)) return;
  const focusedKey = settingsRows()[S.settingsSel]?.key;
  discoveredApps = entries;
  menuChoices = new Map([INPUTS_ENTRY, ...entries].map(app => [app.key, app]));
  const known = new Set(menuOrder);
  for (const {key} of entries) {
    if (known.has(key)) continue;
    menuOrder.push(key);
    hiddenEntries.add(key);
  }
  const rows = settingsRows();
  const focus = rows.findIndex(row => row.key === focusedKey);
  S.settingsSel = focus >= 0 ? focus : clamp(S.settingsSel, 0, rows.length - 1);
  settingsDirty = true;
  refreshMenu();
  if (how !== 'cached') {
    try { localStorage.setItem(APPS_KEY, JSON.stringify(entries.map(e => [e.key, e.appId, e.displayName]))); } catch (_) {}
  }
}
function rememberedMenu() {
  try {
    let cache = JSON.parse(localStorage.getItem(APPS_KEY));
    if (cache === null) {
      const legacy = JSON.parse(localStorage.getItem('mainmenu.apps.1'));
      if (!Array.isArray(legacy)) return;
      cache = [];
      for (const row of legacy) {
        if (!Array.isArray(row)) continue;
        const [label, id, missing] = row;
        const preset = CATALOG.find(app => app.label === label);
        if (preset && id && !missing) cache.push([preset.key, id, SETTINGS_NAMES[preset.key]]);
      }
    }
    if (!Array.isArray(cache)) return;
    const entries = [];
    for (const row of cache) {
      if (!Array.isArray(row)) continue;
      const [key, id, name] = row;
      if (typeof id !== 'string' || !id || typeof name !== 'string' || !name) continue;
      const preset = catalogByKey.get(key);
      if (preset || key === 'tv:' + id) entries.push(installedEntry(id, name, preset));
    }
    setMenu(entries, 'cached');
  } catch (_) {}
}
// Device Care owns the Delete confirmation. The guide keeps the exact app to check on return.
const STORE_IDS = ['org.volt.apps', 'com.samsung.tv.store'];
const REMOVE_KEY = 'mainmenu.pending-removal.1';
let removal = null;
function canManageRow(row) { return !!row?.appId && !STORE_IDS.includes(row.appId); }
function clearRemoval() {
  try { localStorage.removeItem(REMOVE_KEY); } catch (_) {}
  removal = null;
  settingsDirty = true;
}
function removalResult(phase, message) {
  const target = removal;
  clearRemoval();
  removal = { ...target, phase, message };
}
function prepareRemovalCheck() {
  // A query already in flight may have started before Settings closed.
  removal = { ...removal, phase: 'checking' };
  S.hubSel = S.prevHubSel = 0;
  S.prevMode = S.mode = 'apps';
  S.tMode = -1e6;
  const index = settingsRows().findIndex(row => row.key === removal.key);
  if (index >= 0) S.settingsSel = index;
  const manager = APPS.indexOf(SETTINGS_ENTRY);
  if (manager >= 0) {
    S.prevSel = S.sel = manager;
    if (sized) keepInView(-1e6);
  }
  settingsDirty = true;
}
function restoreRemovalTarget() {
  try {
    const target = JSON.parse(localStorage.getItem(REMOVE_KEY));
    // Version 0.10.0 persisted 'opening' before switching to Samsung Apps.
    if ((target?.phase === 'guide' || target?.phase === 'opening') && typeof target.key === 'string' &&
        typeof target.label === 'string' && typeof target.appId === 'string') {
      removal = target;
      prepareRemovalCheck();
    }
  } catch (_) {}
}
function removalAction(name) {
  if (!removal) {
    const row = settingsRows()[S.settingsSel];
    if (name === 'manage' && canManageRow(row)) {
      removal = { key: row.key, label: row.label, appId: row.appId, phase: 'guide' };
      try { localStorage.setItem(REMOVE_KEY, JSON.stringify(removal)); } catch (_) {}
      settingsDirty = true;
      return 'confirm';
    }
    return;
  }
  if (name === 'back') { clearRemoval(); return 'back'; }
  if (name !== 'ok') return;
  if (removal.phase === 'guide') {
    // Quick Settings can cover the app without a hide/show event.
    prepareRemovalCheck();
    askApps();
    return 'confirm';
  }
  if (removal.phase !== 'checking') { clearRemoval(); return 'back'; }
}
function askApps(atStart = false) {
  if (!TV || DEMO_MENU || CAPTURE || appsState === 'loading') return;
  want.apps = false;
  const check = removal?.phase === 'checking' ? removal : null;
  appsState = 'loading';
  settingsDirty = true;
  if (atStart) asked.n++;
  let waiting = true;
  const finish = (list, error) => {
    if (!waiting) return;
    waiting = false;
    clearTimeout(timer);
    if (atStart) asked.n--;
    try {
      if (error) throw error;
      useApps(list);
      appsState = 'ready';
    } catch (e) { appsState = 'error'; oops('app list', e); }
    if (check && removal === check) {
      if (appsState === 'error') removalResult('error', 'The TV did not confirm the installed apps. Reopen Apps to refresh.');
      else {
        const present = list.some(a => a && a.id === check.appId) || menuChoices.has(check.key);
        removalResult(present ? 'present' : 'removed');
      }
    } else if (removal?.phase === 'checking') {
      // The previous query started before the user returned. Its snapshot can be stale.
      askApps();
    }
    settingsDirty = true;
  };
  const timer = setTimeout(() => finish(null, new Error('The TV did not answer')), 5000);
  try { tizen.application.getAppsInfo(list => finish(list), err => finish(null, err)); }
  catch (e) { finish(null, e); }
}
// Samsung's firmware also marks factory tools, plug-ins and background UI as showable.
// These are the consumer entry points for native firmware apps. Some use hidden or unnamed
// web wrappers. Downloaded and sideloaded apps are discovered by ID independently of this list.
const TV_APP_ALIASES = [
  ['Samsung TV Plus', 'HEPsqFNie0.tvplusstandalone', 'com.samsung.tv.tvplus'],
  ['Globoplay', 'org.tizen.globoplayaria', 'LnLzvqrcEY.globo', 'org.tizen.globoplayapp'],
  ['Internet', 'org.tizen.browser'], ['Samsung Apps', ...STORE_IDS],
  ['SmartThings', 'com.samsung.tv.SmartThingsApp'], ['Gaming Hub', 'com.samsung.tv.gaminghub', 'com.samsung.tv.gamehome'],
  ['Workspace', 'com.samsung.tv.coba.pconscreen'], ['Workspace Browser', 'com.samsung.tv.knox-browser'],
  ['Windows 365', 'com.samsung.tv.knox-browser-win365'], ['Samsung DeX', 'com.samsung.tv.samsungdex'],
  ['Workout Tracker', 'com.samsung.tv.health-mde-workout-tracker'], ['My Contents', 'com.samsung.tv.mycontents'],
  ['Generative Wallpaper', 'com.samsung.tv.GenerativeWallpaper'], ['Screen Mirroring', 'org.tizen.ScreenMirroring-app-tv'],
  ['Privacy Choices', 'tv6pbVMQFF.PrivacyChoices'],
];
function useApps(list) {
  const ownApp = tizen.application.getCurrentApplication().appInfo;
  const ownId = ownApp ? ownApp.id : 'MainMenuTV.Home';
  const all = list.filter(app => app && app.id && app.id !== ownId && !/-dummy$/i.test(app.id));
  const byId = new Map(all.map(app => [app.id, app]));
  const shown = all.filter(app => app.show && String(app.name || '').trim());
  const entries = [], used = new Set();
  for (const entry of CATALOG) {
    const match = entry.ids.map(id => byId.get(id)).find(Boolean) ||
      shown.find(app => entry.names.some(pattern => pattern.test(app.name.trim())));
    if (match) {
      entries.push(installedEntry(match.id, match.name, entry));
      used.add(match.id);
    }
  }
  const extras = [];
  for (const [name, ...ids] of TV_APP_ALIASES) {
    const match = ids.map(id => byId.get(id)).find(Boolean);
    if (match) extras.push(installedEntry(match.id, name));
    ids.forEach(id => used.add(id));
  }
  for (const app of shown) {
    // Third-party applications have a package-qualified launch ID. Reserve the OS
    // namespaces for the named entry points above; many of those packages are services.
    if (used.has(app.id) || !app.id.includes('.') || /^(org\.tizen\.|com\.samsung\.|com\.sausng\.)/i.test(app.id)) continue;
    used.add(app.id);
    extras.push(installedEntry(app.id, app.name.trim()));
  }
  extras.sort((a, b) => a.displayName.localeCompare(b.displayName) || a.appId.localeCompare(b.appId));
  entries.push(...extras);
  diag.apps = { count: list.length, shown: shown.length, all: entries.map(app => app.displayName + '|' + app.appId) };
  setMenu(entries, entries.length + ' installed apps');
}
let keysAsked = false;
function askTV() {           // back in front: note what to ask; the questions go out once the picture is at rest (tvIdle)
  if (!TV) return;
  want.sources = true;
  want.apps = !DEMO_MENU;
  if (!keysAsked) { keysAsked = true; try { tizen.tvinputdevice.registerKeyBatch(['ColorF0Red', 'ColorF1Green', 'ColorF3Blue']); } catch (e) { oops('colour keys', e); } }
}
function tvIdle() {          // called once a frame while nothing is moving
  if (want.sources) { want.sources = false; askSources(); return; }
  if (want.apps && (S.mode !== 'apps' || S.t - settingsFocus.since > 1000)) askApps();
}
function readInputNames() {
  try {
    const saved = JSON.parse(localStorage.getItem(INPUT_NAMES_KEY));
    if (saved && typeof saved === 'object' && !Array.isArray(saved))
      inputNames = new Map(Object.entries(saved).filter(([, value]) => typeof value === 'string' && value.trim()));
  } catch (_) { /* Use the TV's names when storage is unavailable. */ }
}
function updateSources(rows) {
  const focusedPort = SOURCES[S.inputSel]?.key, watchingPort = SOURCES[S.lsel]?.key;
  SOURCES = rows.map(row => ({ ...row, name: inputNames.get(row.key) || row.defaultName }));
  const selected = SOURCES.findIndex(row => row.key === focusedPort);
  S.inputSel = selected >= 0 ? selected : clamp(S.inputSel, 0, Math.max(0, SOURCES.length - 1));
  if (selected < 0) { S.prevInputSel = S.inputSel; S.tInputSel = -1e6; }
  const live = SOURCES.findIndex(row => row.key === watchingPort && !row.dim);
  S.lsel = live >= 0 ? live : Math.max(0, SOURCES.findIndex(row => !row.dim));
  if (sized) listChanged();
}
function saveInputName(row, value) {
  const name = value.trim().replace(/\s+/g, ' ');
  const next = new Map(inputNames);
  if (!name || name === row.defaultName) next.delete(row.key);
  else next.set(row.key, name);
  try { localStorage.setItem(INPUT_NAMES_KEY, JSON.stringify(Object.fromEntries(next))); }
  catch (_) { return 'Could not save the name. Try again.'; }
  inputNames = next;
  updateSources(SOURCES);
  return '';
}
const nameEditor = makeInputNameEditor(saveInputName, cue => playMenuCue(cue));
let sourceQuery = 0;
function askSources(atStart) {
  if (!TV) return;
  const query = ++sourceQuery;
  S.sourcesState = 'asking'; if (atStart) asked.n++;
  const done = () => { if (atStart) { asked.n--; atStart = false; } };
  try {
    tizen.systeminfo.getPropertyValue('VIDEOSOURCE', v => {
      if (query !== sourceQuery) { done(); return; }
      const mk = (s, on) => {
        const hdmi = s.type === 'HDMI', name = s.type === 'TV' ? 'TV antenna' : s.type + ' ' + s.number;
        return { key: s.type + ':' + s.number, defaultName: name, connected: on, port: hdmi ? 'HDMI ' + s.number : String(s.type), live: on, dim: !on, raw: s, kind: 'pc', stats: [['PORT', String(s.number)]], tags: ['LINK', 'NONE'],
          info: on ? ['Something is connected here.', 'Press OK to switch to it.'] : ['Nothing is connected here.', ''] };
      };
      const con = (v.connected || []).map(s => mk(s, true)), dis = (v.disconnected || []).map(s => mk(s, false));
      S.sourcesState = 'ok'; updateSources(con.concat(dis));
      diag.sources = `${con.length} connected, ${dis.length} empty`;
      done();
    }, e => { done(); if (query !== sourceQuery) return; S.sourcesState = 'failed'; oops('sources', e); });
  } catch (e) { done(); S.sourcesState = 'failed'; oops('sources', e); }
}
function say(text) { S.notice = text; S.tNotice = S.t; }
const nice = label => label.toLowerCase().replace(/(^|\s)([a-z])/g, (m, a, b) => a + b.toUpperCase()).replace(/\bTv\b/, 'TV');
const notHere = a => `${nice(a.label)} isn't installed on this TV`;
function launch(app) {       // try the id the TV gave us, then the known fallbacks
  const ids = (app.appId ? [app.appId] : []).concat(app.ids || []).filter((v, i, a) => a.indexOf(v) === i);
  const giveUp = why => { S.mode = 'home'; S.tLaunch = -1e6; S.holdLaunch = false; say(`Couldn't open ${nice(app.label)}`); note(`launch ${app.label} failed: ${why}`); };
  if (!TV) { setTimeout(() => { S.mode = 'home'; S.tLaunch = -1e6; S.holdLaunch = false; }, 600); return; }
  let i = 0, last = 'no id known';
  const next = () => {
    if (i >= ids.length) return giveUp(last);
    const id = ids[i++];
    try { tizen.application.launch(id, () => { note(`launched ${id}`); setTimeout(() => { if (S.mode === 'launch') giveUp('still in front after 9 s'); }, 9000); }, e => { last = id + ' ' + (e && e.name); next(); }); }
    catch (e) { last = id + ' ' + e.name; next(); }
  };
  next();
}
// Showing an HDMI source: the TV draws it behind the page, so the page steps aside until Back is pressed.
function showSource(src) {
  if (!TV || !src.raw) { say('Switching sources only works on the TV'); return; }
  const fail = e => { oops('source', e); say(`Couldn't switch to ${src.name}`); leaveSource(); };
  try {
    tizen.tvwindow.setSource(src.raw, () => {
      try { tizen.tvwindow.show(() => { S.passthrough = true; document.documentElement.className = 'through'; note('showing ' + src.name); }, fail, ['0px', '0px', '1920px', '1080px'], 'MAIN', 'BEHIND'); } catch (e) { fail(e); }
    }, fail, 'MAIN');
  } catch (e) { fail(e); }
}
function leaveSource() {
  S.passthrough = false; document.documentElement.className = '';
  try { tizen.tvwindow.hide(() => {}, e => oops('source hide', e), 'MAIN'); } catch (e) {}
}

// Short recordings from the menu footage. Read the packaged files during the opening.
const menuCueNames = ['focus', 'confirm', 'back', 'dialog'];
const menuCues = new Map(), playingCues = new Set();
let menuAudio = null, cueRequest = 0, lastCueAt = -Infinity;
function warmMenuAudio() {
  const Context = window.AudioContext || window.webkitAudioContext;
  if (!Context) return;
  try {
    if (!menuAudio) menuAudio = new Context();
    else if (menuAudio.state === 'suspended') menuAudio.resume().catch(() => {});
    // Open the output device while the screen is held. The first remote press can then play its cue immediately.
    const silent = menuAudio.createBufferSource();
    silent.buffer = menuAudio.createBuffer(1, 1, menuAudio.sampleRate);
    silent.connect(menuAudio.destination);
    silent.onended = () => silent.disconnect();
    silent.start();
  } catch (_) {} // A browser that requires a gesture retries from playMenuCue.
}
function prepareMenuCues() {
  const Decoder = window.OfflineAudioContext || window.webkitOfflineAudioContext;
  let decoder;
  try { decoder = new Decoder(1, 1, 48000); } catch (_) {}
  if (decoder && TV) warmMenuAudio();
  for (const name of menuCueNames) {
    const url = 'assets/menu-sfx/' + name + '.wav';
    const cue = {};
    menuCues.set(name, cue);
    const useMedia = () => {
      // Chromium can play sibling files opened directly from disk even when local XHR is restricted.
      cue.media = new Audio(url);
      cue.media.preload = 'auto';
    };
    if (!decoder || !(window.AudioContext || window.webkitAudioContext)) { useMedia(); continue; }
    cue.ready = new Promise((resolve, reject) => {
      const xhr = new XMLHttpRequest();
      xhr.open('GET', url);
      xhr.responseType = 'arraybuffer';
      xhr.onload = () => {
        if ((xhr.status === 0 || xhr.status === 200) && xhr.response && xhr.response.byteLength) resolve(xhr.response);
        else reject();
      };
      xhr.onerror = reject;
      xhr.send();
    }).then(bytes => decoder.decodeAudioData(bytes)).then(buffer => { cue.buffer = buffer; }).catch(useMedia);
  }
}
async function playMenuCue(name, repeat = false) {
  const pressed = performance.now();
  const cue = menuCues.get(name);
  if (!cue || document.hidden || (repeat && pressed - lastCueAt < 65)) return;
  lastCueAt = pressed;
  const request = ++cueRequest;
  try {
    if (!cue.media) {
      const Context = window.AudioContext || window.webkitAudioContext;
      if (!menuAudio) menuAudio = new Context();
      const resume = menuAudio.state === 'running' ? null : menuAudio.resume();
      if (resume || !cue.buffer) await Promise.all([resume, cue.ready]);
    }
    // A newer action or a suspended page supersedes an unfinished load.
    if (request !== cueRequest || document.hidden || performance.now() - pressed > 230) return;
    if (cue.media) {
      cue.media.currentTime = 0;
      await cue.media.play();
    } else {
      const player = menuAudio.createBufferSource();
      player.buffer = cue.buffer;
      player.connect(menuAudio.destination);
      player.onended = () => { playingCues.delete(player); player.disconnect(); };
      player.start();
      playingCues.add(player);
    }
  } catch (_) {} // Audio can be unavailable while the TV switches apps.
}
function silenceMenuCues() {
  cueRequest++;
  for (const player of playingCues) player.stop();
  for (const cue of menuCues.values()) if (cue.media) cue.media.pause();
  if (menuAudio && menuAudio.state === 'running') menuAudio.suspend().catch(() => {});
}

// ───────────────────────── input ─────────────────────────
function act(name, t) {
  if (t < 1500 || S.mode === 'launch') return;
  if (S.mode === 'home') {
    if (name === 'down' || name === 'up') {
      const N = APPS.length, n = (S.sel + (name === 'down' ? 1 : -1) + N) % N;
      if (n !== S.sel) { S.prevSel = S.sel; S.sel = n; S.tSel = t; keepInView(t); if (!CAPTURE) wantOpen(n, jobs, true); return 'focus'; }
    }
    else if (name === 'ok') {
      if (APPS[S.sel].missing) { say(notHere(APPS[S.sel])); if (TV) want.apps = true; }      // …and look again: it may have been installed since
      else if (APPS[S.sel].screen === 'list') { S.prevMode = 'home'; S.mode = 'list'; S.tMode = t; S.tLsel = t + 300; if (TV) { if (SOURCES.length) want.sources = true; else askSources(); } }      // the list is checked again once it has slid in
      else if (APPS[S.sel].screen === 'settings') {
        S.hubSel = S.prevHubSel = 0; S.tHubSel = -1e6;
        inputSettings.warmup();
        openScreen('settings', t);
      }
      else { S.mode = 'launch'; S.tLaunch = t; S.launchApp = APPS[S.sel]; if (!CAPTURE) wantOpen(S.sel, urgent, false); }
      if (S.mode !== 'home') return 'confirm';
    }
  } else if (S.mode === 'list') {
    if (name === 'down' || name === 'up') {
      let n = S.lsel + (name === 'down' ? 1 : -1);
      if (n >= 0 && n < SOURCES.length && !SOURCES[n].dim && n !== S.lsel) { S.lsel = n; S.tLsel = t; return 'focus'; }
    }
    else if (name === 'ok' && SOURCES[S.lsel] && !SOURCES[S.lsel].dim) {
      const source = SOURCES[S.lsel];
      showSource(source);
      if (TV && source.raw && !source.dim) return 'confirm';
    }
    else if (name === 'back') { S.prevMode = 'list'; S.mode = 'home'; S.tMode = t; return 'back'; }
  } else if (S.mode === 'settings') {
    if (name === 'back') { openScreen('home', t); return 'back'; }
    if (name === 'up' || name === 'down') {
      const next = name === 'up' ? 0 : 1;
      if (next === S.hubSel) return;
      S.prevHubSel = S.hubSel; S.hubSel = next; S.tHubSel = t;
      return 'focus';
    }
    if (name === 'ok') {
      if (S.hubSel === 0) {
        openScreen('apps', t); S.settingsSel = 0; settingsDirty = true;
        if (TV) want.apps = true;
      } else {
        openScreen('inputSettings', t); S.tInputSel = -1e6;
        S.prevInputSel = S.inputSel;
        if (TV) askSources();
      }
      return 'confirm';
    }
  } else if (S.mode === 'apps') {
    if (name === 'manage' || removal) return removalAction(name);
    if (name === 'back') { openScreen('settings', t); return 'back'; }
    return adjustMenu(name);
  } else if (S.mode === 'inputSettings') {
    if (name === 'back') { openScreen('settings', t); return 'back'; }
    if (name === 'up' || name === 'down') {
      const next = clamp(S.inputSel + (name === 'down' ? 1 : -1), 0, Math.max(0, SOURCES.length - 1));
      if (next === S.inputSel) return;
      S.prevInputSel = S.inputSel; S.inputSel = next; S.tInputSel = t;
      return 'focus';
    }
    if (name === 'ok') {
      if (!SOURCES.length) { if (TV) askSources(); return; }
      nameEditor.open(SOURCES[S.inputSel]);
      return 'dialog';
    }
  }
}
function openScreen(mode, t) {
  S.prevMode = S.mode; S.mode = mode; S.tMode = t; S.notice = null;
}
const SCRIPTS = {
  settings: [[2400, 'up'], [3000, 'ok']],
  appSettings: [[2400, 'up'], [3000, 'ok'], [4600, 'ok']],
  inputSettings: [[2400, 'up'], [3000, 'ok'], [4200, 'down'], [4800, 'ok']],
  all: [1, 2, 3, 4, 5, 6, 7, 8, 9].map(i => [2000 + i * 500, 'down']),
  home: [[3300, 'down'], [4300, 'down'], [5200, 'down'], [6300, 'down'], [7100, 'down'], [7900, 'down'], [8700, 'down'], [9500, 'down'], [10300, 'down'], [11300, 'down'], [12300, 'up'], [13100, 'up']],
  inputs: [[5100, 'ok'], [7000, 'down'], [8000, 'down'], [9000, 'up'], [10300, 'back']],
  launch: [[2600, 'down'], [4000, 'ok']],
};
const script = (SCRIPTS[Q.get('script')] || []).slice();
let refImg = null;
if (Q.get('ref')) { refImg = new Image(); refImg.src = Q.get('refsrc') || 'refs/main.jpg'; }

window.renderAt = tms => {
  while (script.length && script[0][0] <= tms) { const [at, name] = script.shift(); act(name, at); }
  if (CAPTURE) frameNo++;
  S.t = tms; render();
};
function chosenLevel() {
  let level = 2;
  if (Q.get('q') !== null) level = +Q.get('q');
  else if (TV) { try { const v = localStorage.getItem(LEVEL_KEY); if (v !== null) level = +v; } catch (_) {} }
  return clamp(level | 0, 0, QUALITY.length - 1);
}
// What needs neither the fonts nor the figure is worked out while those files are still loading: the water's light
// maps and the foam (a third of a second on the TV, which the start would otherwise be longer by).
let earlyDone = false;
function early() {
  if (earlyDone) return; earlyDone = true;
  const a = performance.now();
  q = chosenLevel(); QL = QUALITY[q];
  try { buildCaustics(); buildFoam(); } catch (e) { oops('early set-up', e); }
  diag.setup['maps (while the files load)'] = Math.round(performance.now() - a);
}
let started = false;
function start() {
  if (started) return; started = true;
  const level = chosenLevel();
  early();
  lap('fonts + picture loaded');
  if (!CAPTURE && !DEMO_MENU) readMenuPreferences();
  if (!CAPTURE) readInputNames();
  if (!TV) updateSources(DEMO_SOURCES.map(s => ({ ...s, key: s.port, defaultName: s.name, connected: !s.dim })));
  // Use the saved TV inventory immediately, and reconcile it with a fresh snapshot on every start.
  const cold = TV && !CAPTURE && !DEMO_MENU;
  if (cold) rememberedMenu();
  refreshMenu();
  S.sel = S.prevSel = 0;
  if (cold) { restoreRemovalTarget(); askApps(true); }
  const p0 = performance.now(); setQuality(level); diag.setup.pictures = Math.round(performance.now() - p0);
  if (CAPTURE) {
    eager = false;
    Promise.all([loadHomeFrames(), settingsHub.ready, inputSettings.ready]).then(() => {
      window.renderAt(+Q.get('at') || 0); window.ready = true;
    });
    return;
  }
  prepareMenuCues();
  auto.on = Q.get('q') === null && (TV || !!Q.get('auto'));
  if (TV) { askSources(true); if (!keysAsked) { keysAsked = true; try { tizen.tvinputdevice.registerKeyBatch(['ColorF0Red', 'ColorF1Green', 'ColorF3Blue']); } catch (e) { oops('colour keys', e); } } }
  let t0 = performance.now(), last = 0, broken = 0, waited = 0;
  // Right after a start, and after coming back from another app, the TV is still busy and the first frames come late
  // (at a start, every picture made above is also drawn for the first time). The clock is held on the opening picture
  // until frames arrive at their normal pace, so that the opening plays from its first moment instead of skipping ahead.
  let roll = { at: +Q.get('skip') || 0, good: 0, since: t0, cold: true, scene: 0 };
  front.key = t0;
  const seen = on => {       // is something of the TV's own in front of the page?
    if (!TV || X.nocover || front.lies) return;
    if (on && !front.covered) { front.covered = true; front.since = performance.now(); }
    else if (!on && front.covered) { front.covered = false; last = 0; }
  };
  // Delay a short OK on an app row until release so holding it never toggles visibility.
  let okHold = null;
  const cancelHold = () => { if (okHold) clearTimeout(okHold.timer); okHold = null; };
  addEventListener('keyup', e => {
    if (e.keyCode !== 13 || !okHold) return;
    const press = okHold;
    cancelHold(); e.preventDefault();
    if (!press.long && !document.hidden && S.mode === 'apps' && !removal &&
        settingsRows()[S.settingsSel]?.key === press.key) playMenuCue(adjustMenu('ok'));
  });
  addEventListener('blur', () => { cancelHold(); seen(true); }); addEventListener('focus', () => seen(false));
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) {
      cancelHold(); nameEditor.close(); silenceMenuCues();
      return;
    }
    // Some TVs report their initial foreground transition after startup has begun.
    if (roll?.cold) return;
    if (menuAudio) warmMenuAudio();
    const checkingRemoval = removal?.phase === 'guide' || removal?.phase === 'checking';
    roll = { at: checkingRemoval ? 2000 : 0, good: 0, since: performance.now(), scene: checkingRemoval ? QUEST_POSES_START : 7 }; last = 0; front.key = roll.since;
    S.mode = 'home'; S.prevMode = 'home'; S.holdLaunch = false; S.tMode = S.tSel = S.tLsel = S.tLaunch = S.tNotice = S.tTop = -1e6;
    if (S.passthrough) leaveSource();
    askTV();
    if (checkingRemoval) {
      prepareRemovalCheck(); askApps();
    } else {
      if (removal) clearRemoval();
      // SDK inventory calls can take several refreshes on foregrounding. Start both behind the opening white.
      if (want.sources) { want.sources = false; askSources(true); }
      if (want.apps) askApps(true);
    }
  });
  addEventListener('keydown', e => {
    const k = e.keyCode;
    if (k !== 13) cancelHold();
    front.key = performance.now();
    if (front.covered) { if (!document.hasFocus()) { front.lies = true; note('keys arrive while the TV says the page is not in front; ignoring that from now on'); } front.covered = false; last = 0; }
    if (nameEditor.isOpen()) { nameEditor.keydown(e); return; }
    if (k === 403 || k === 68) { S.debug = !S.debug; return; }                                   // red button / D
    if (k === 404 || k === 81) { auto.on = false; setQuality((q + 3) % 4); saveLevel(); note('level set by hand: ' + q); return; }   // green / Q
    const m = { 38: 'up', 40: 'down', 37: 'left', 39: 'right', 13: 'ok', 27: 'back', 8: 'back', 10009: 'back', 406: 'manage', 46: 'manage' }[k]; if (!m) return;
    if (S.passthrough) { if (m === 'back') { leaveSource(); playMenuCue('back'); } return; }
    if (roll) return;                                                                            // the opening has not begun
    const inSettings = ['settings', 'apps', 'inputSettings'].includes(S.mode);
    const openingSettings = S.mode === 'home' && APPS[S.sel].screen === 'settings';
    if (inSettings) e.preventDefault();
    if ((openingSettings || inSettings) && m === 'ok' && (e.repeat || okHold)) return;
    if (m === 'manage' && (e.repeat || S.mode !== 'apps')) return;
    if (S.mode === 'apps' && !removal && m === 'ok') {
      const row = settingsRows()[S.settingsSel];
      if (canManageRow(row)) {
        const press = okHold = { key: row.key, long: false };
        press.timer = setTimeout(() => {
          press.long = true;
          if (S.mode === 'apps' && !document.hidden && settingsRows()[S.settingsSel]?.key === press.key)
            playMenuCue(removalAction('manage'));
        }, 650);
        return;
      }
    }
    const now = performance.now() - t0;
    if (m === 'back' && S.mode === 'home') {
      if (TV) { playMenuCue('back'); try { tizen.application.getCurrentApplication().hide(); } catch (_) {} }
      return;
    }
    const before = S.mode;
    playMenuCue(act(m, now), e.repeat);
    if (S.mode === 'launch' && before !== 'launch') { S.holdLaunch = TV; const app = S.launchApp; setTimeout(() => launch(app), TV ? 1250 : 1700); }
  });
  const draw = t => {
    try { window.renderAt(t); }
    catch (e) {
      if (broken++ < 3) oops('draw', e);
      try { T0(); g.globalAlpha = 1; g.globalCompositeOperation = 'source-over'; g.fillStyle = '#0a2bb8'; g.fillRect(0, 0, W, H); g.fillStyle = '#fff'; g.font = '30px sans-serif'; g.textAlign = 'left';
        g.fillText('Main Menu hit a drawing problem on this TV:', 80, 120); diag.errors.slice(-8).forEach((m, i) => g.fillText(m.slice(0, 110), 80, 180 + i * 44)); } catch (_) {}
    }
  };
  const loop = frameTime => {
    requestAnimationFrame(loop);
    const now = performance.now(), dt = last ? frameTime - last : 16.7; last = frameTime;
    if (S.passthrough || document.hidden) return;
    frameNo++;
    if (roll) {
      const held = now - roll.since;
      if (roll.cold && asked.again) { asked.again = false; roll.scene = Math.min(roll.scene, 4); }       // an answer from the TV brought new pictures (the sources): those scenes once more
      if (roll.cold && roll.scene >= 7 && !reduceMenuMotion.matches && !homeSettled) {
        roll.good = 0;
        draw(roll.at);
        return;
      }
      const sceneCount = QUEST_POSES_START + (roll.cold ? questIdle.frames : 0);
      if (roll.scene < sceneCount && !X.norehearse) { rehearse(roll.scene++); return; }
      if (roll.cold && !roll.primed && homeRenderer && !reduceMenuMotion.matches && fx) {
        rehearse(8); roll.primed = true; return;
      }
      // Start counting after the last upload. The TV may still be processing it after JS returns.
      if (!roll.settleAt) roll.settleAt = now;
      roll.good = dt < 22 ? roll.good + 1 : 0;
      if ((roll.good >= 6 && (!asked.n || held > 1300)) || now - roll.settleAt > 1300) {
        t0 = frameTime - Math.max(roll.at, 200);       // (the first 200 ms of the opening are plain white as well)
        if (roll.cold) { diag.setup['held for'] = Math.round(held); eager = false; asked.again = false; }
        roll = null;
      } else {
        if (roll.at === 0 && fx) drawFoam(0);
        else draw(roll.at);
        return;
      }
    }
    if (frameNo % (front.covered ? 6 : 30) === 0) seen(!document.hasFocus());       // (asked often while covered, so that the page is back at full speed the moment it is in front again)
    // With something of the TV's own in front for a while (its screensaver, as a rule), draw less often and leave it the graphics chip.
    if (front.covered) { const away = now - front.since; if (away > 5000 && frameNo % (away > 30000 ? 6 : 2)) return; }
    draw(frameTime - t0);
    const spent = performance.now() - now;
    if (!front.covered) { recDt[recN % REC] = dt; recJs[recN % REC] = spent; recN++; }
    // Pictures still to be made are made in frames with time to spare, never during the dive or a transition (except
    // the ones a transition that has begun is about to need); questions to the TV wait for the same quiet moments.
    if (urgent.length) { runJob(urgent); touch(); }
    else if (S.t > 2500 && S.t - S.tSel > 250 && S.t - S.tMode > 650 && S.t - S.tTop > 300 && S.mode !== 'launch') {
      if (!waited) waited = now;
      if (spent < 7 || now - waited > 400) {       // (a frame that was itself slow is left alone, but the work is not put off for long)
        if (jobs.length) { const a = performance.now(); do runJob(jobs); while (jobs.length && performance.now() - a < 1.5); touch(); }
        else if (TV && S.t > 2600 && (want.sources || want.apps)) tvIdle();
      }
    } else waited = 0;
    watch(now);
  };
  requestAnimationFrame(loop);
}
const fonts = ['100px MenuI', '100px Title', '20px UiBI', '20px UiLI', '20px UiXLI', '20px Hint', '20px HintR', '20px HintB', '20px HintL', '20px Num', '20px Row', '20px RowB'];
let fontsIn = false, heroIn = false;
const go = () => { if (fontsIn && heroIn) start(); };
Promise.all(fonts.map(f => document.fonts.load(f).catch(e => oops('font ' + f, e)))).then(() => { fontsIn = true; go(); });
heroImg.onload = () => { const done = () => { heroOK = true; heroIn = true; go(); }; if (heroImg.decode) heroImg.decode().then(done, done); else done(); };      // opened off the main thread while the rest loads
heroImg.onerror = () => { oops('picture', 'assets/hero.png did not load'); heroIn = true; go(); };
heroImg.src = 'assets/hero.png';
if (!CAPTURE) setTimeout(early, 0);
if (!CAPTURE) setTimeout(() => { if (!started) { note('started without waiting for every font/picture'); fontsIn = heroIn = true; go(); } }, 4000);
})();
