// Find the late frames while the selection walks the menu, and where in the step they fall.
// args: { n: 9, gap: 450, key: 'down' }.  Returns every frame gap over 20 ms with the time since the last key press and
// the script time the app recorded for that frame.
const n = args.n || 9, gap = args.gap || 450, code = { up: 38, down: 40, ok: 13, back: 10009 }[args.key || 'down'];
const sleep = ms => new Promise(r => setTimeout(r, ms));
const frames = []; let on = true; (function loop() { if (!on) return; frames.push(performance.now()); requestAnimationFrame(loop); })();
const keys = [];
await sleep(200);
for (let i = 0; i < n; i++) { keys.push(performance.now()); const e = new Event('keydown'); e.keyCode = code; window.dispatchEvent(e); await sleep(gap); }
await sleep(400); on = false;
const rec = window.__frames(frames.length + 5);      // the app's own record: script time per frame (same frames, give or take one)
const late = [];
for (let i = 1; i < frames.length; i++) {
  const d = frames[i] - frames[i - 1]; if (d <= 20) continue;
  let k = -1; for (let j = 0; j < keys.length; j++) if (keys[j] <= frames[i]) k = j;
  const jsNear = rec.js.slice(Math.max(0, rec.js.length - frames.length + i - 2), rec.js.length - frames.length + i + 2).map(v => +v.toFixed(1));
  late.push({ gap: +d.toFixed(1), step: k + 1, sinceKey: k >= 0 ? Math.round(frames[i] - keys[k]) : null, jsNear });
}
const d = window.__diag();
return { frames: frames.length, late, sel: d.sel, q: d.q, jobs: d.jobs };
