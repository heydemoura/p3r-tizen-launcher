// What does it cost to make a big word picture while the app is animating? For each way of making it: the script time,
// and the longest gap between frames right after (which is what a viewer would notice).
// args: { reps: 3 }
const sleep = ms => new Promise(r => setTimeout(r, ms));
const g = document.getElementById('c').getContext('2d');
const TRACK = -.065, FAT = .034;
const words = ['YOUTUBE', 'CRUNCHYROLL', 'JELLYFIN', 'SPOTIFY', 'NETFLIX', 'DISNEY+', 'PRIME VIDEO', 'APPLE TV'];
let salt = 0;
function make(text, fs, mode, opts) {
  const c = document.createElement('canvas');
  const m = document.createElement('canvas').getContext('2d'); m.font = `${fs}px MenuI`; m.letterSpacing = `${(TRACK * fs).toFixed(2)}px`;
  const w = m.measureText(text).width;
  c.width = Math.ceil(w + .24 * fs); c.height = Math.ceil(1.1 * fs);
  const x = c.getContext('2d', opts || {});
  x.setTransform(1, 0, 0, 1, .1 * fs, .86 * fs);
  x.font = `${fs}px MenuI`; x.letterSpacing = `${(TRACK * fs).toFixed(2)}px`; x.fillStyle = x.strokeStyle = '#000'; x.lineJoin = 'miter'; x.miterLimit = 3; x.lineWidth = fs * FAT;
  if (mode === 'fill+stroke') { x.fillText(text, 0, 0); x.strokeText(text, 0, 0); }
  else if (mode === 'fill') x.fillText(text, 0, 0);
  else if (mode === 'fill x5') { const o = fs * FAT / 2; x.fillText(text, 0, 0); x.fillText(text, -o, 0); x.fillText(text, o, 0); x.fillText(text, 0, -o); x.fillText(text, 0, o); }
  else if (mode === 'fill x9') { const o = fs * FAT / 2, d = o * .707; x.fillText(text, 0, 0); for (const [a, b] of [[-o, 0], [o, 0], [0, -o], [0, o], [-d, -d], [d, -d], [-d, d], [d, d]]) x.fillText(text, a, b); }
  return c;
}
const CASES = [
  ['fill+stroke 231 px (as now)', (t, i) => make(t, 231 + i * .37, 'fill+stroke')],
  ['fill only 231 px', (t, i) => make(t, 233 + i * .37, 'fill')],
  ['fill x5 offsets 231 px', (t, i) => make(t, 235 + i * .37, 'fill x5')],
  ['fill x9 offsets 231 px', (t, i) => make(t, 237 + i * .37, 'fill x9')],
  ['fill+stroke 126 px', (t, i) => make(t, 126 + i * .37, 'fill+stroke')],
  ['fill+stroke 231 px, plain-memory canvas', (t, i) => make(t, 239 + i * .37, 'fill+stroke', { willReadFrequently: true })],
  ['fill only 231 px, plain-memory canvas', (t, i) => make(t, 241 + i * .37, 'fill', { willReadFrequently: true })],
  ['nothing (control)', () => null],
];
const out = [];
for (const [name, fn] of CASES) {
  const js = [], gaps = [];
  for (let r = 0; r < (args.reps || 3); r++) {
    await sleep(350);
    await new Promise(ok => requestAnimationFrame(ok));
    const text = words[(salt++) % words.length];
    const a = performance.now(); const c = fn(text, salt); const b = performance.now();
    // use it once, as the app would: small, in a corner (the app paints over it next frame)
    if (c) { g.setTransform(1, 0, 0, 1, 0, 0); g.globalAlpha = 1; g.drawImage(c, 0, 0, c.width, c.height, 2, 2, 60, 14); }
    const c2 = performance.now();
    let last = performance.now(), worst = 0;
    for (let k = 0; k < 8; k++) { await new Promise(ok => requestAnimationFrame(ok)); const n = performance.now(); worst = Math.max(worst, n - last); last = n; }
    js.push(+(b - a).toFixed(1) + '+' + (c2 - b).toFixed(1)); gaps.push(+worst.toFixed(1));
  }
  out.push(`${name.padEnd(42)} script ms (make+first use): ${js.join(', ').padEnd(34)} | longest frame gap after: ${gaps.join(', ')}`);
}
return out;
