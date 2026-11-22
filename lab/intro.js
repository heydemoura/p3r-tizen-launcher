// How the first seconds went (the app keeps its own record of every frame since it started): each late frame with the
// app-clock time it happened at. Run within ~10 s of a start.  args: { upto: 4000 }
const rec = window.__frames(720), upto = args.upto || 4000;
let t = 0; const late = []; let n = 0, missed = 0, worst = 0, jsSum = 0;
for (let i = 0; i < rec.dt.length; i++) {
  t += rec.dt[i]; if (t > upto) break;
  n++; jsSum += rec.js[i]; missed += Math.max(0, Math.round(rec.dt[i] / 16.667) - 1); worst = Math.max(worst, rec.dt[i]);
  if (rec.dt[i] > 20 || rec.js[i] > 8) late.push(`t=${Math.round(t)} gap ${rec.dt[i].toFixed(1)} script ${rec.js[i].toFixed(1)}`);
}
const d = window.__diag();
return { setup: d.setup, framesInWindow: n, fps: +(n / t * 1000).toFixed(1), missed, missedPct: +(missed / (missed + n) * 100).toFixed(1), worstGap: worst, avgScript: +(jsSum / n).toFixed(2), late, recorded: rec.dt.length, foam: d.foam, q: d.q };
