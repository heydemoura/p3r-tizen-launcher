// What do the TV's own calls cost the animation? Frames are watched while each call is made and answered.
const sleep = ms => new Promise(r => setTimeout(r, ms));
const watch = async (name, fn, ms) => {
  const frames = []; let on = true; (function loop() { if (!on) return; frames.push(performance.now()); requestAnimationFrame(loop); })();
  await sleep(300);
  const t0 = performance.now(); let info;
  try { info = await fn(t0); } catch (e) { info = 'ERR ' + e.name + ' ' + e.message; }
  await sleep(ms || 600); on = false;
  const late = []; for (let i = 1; i < frames.length; i++) { const d = frames[i] - frames[i - 1]; if (d > 20) late.push(`+${Math.round(frames[i] - t0)}ms gap ${d.toFixed(1)}`); }
  return { name, info, late };
};
const out = [];
out.push(await watch('control (nothing)', async () => 'ok'));
out.push(await watch('getAppsInfo (every app on the TV)', t0 => new Promise(ok => { tizen.application.getAppsInfo(list => { const t1 = performance.now(); ok(`answer after ${Math.round(t1 - t0)} ms, ${list.length} apps`); }, e => ok('refused ' + e.name)); const t2 = performance.now(); window.__callCost = +(t2 - t0).toFixed(1); })));
out.push({ callCost: window.__callCost });
const ids = ['9Ur5IzDKqV.TizenYouTube', 'OGLLvqej7u.CrunchyrollWebApp', 'rTn6ClEurC.Jellyfin', 'rJeHak5zRg.Spotify', 'MoonLightS.MoonlightWasm', 'org.tizen.netflix-app', 'MCmYXNxgcu.DisneyPlus', 'org.tizen.primevideo', 'com.samsung.tv.aria-video'];
out.push(await watch('getAppInfo(id) x9 (one question per known app)', async () => { const r = []; for (const id of ids) { const a = performance.now(); let res; try { const i = tizen.application.getAppInfo(id); res = i && i.name; } catch (e) { res = '✗ ' + e.name; } r.push(`${res} ${(performance.now() - a).toFixed(1)}ms`); } return r; }));
out.push(await watch('getAppInfo(id) x9, one per frame', async () => { const r = []; for (const id of ids) { await new Promise(ok => requestAnimationFrame(ok)); const a = performance.now(); try { tizen.application.getAppInfo(id); } catch (e) {} r.push(+(performance.now() - a).toFixed(1)); } return r; }));
out.push(await watch('VIDEOSOURCE question', t0 => new Promise(ok => { tizen.systeminfo.getPropertyValue('VIDEOSOURCE', v => ok(`answer after ${Math.round(performance.now() - t0)} ms, ${(v.connected || []).length} connected`), e => ok('refused ' + e.name)); })));
return out;
