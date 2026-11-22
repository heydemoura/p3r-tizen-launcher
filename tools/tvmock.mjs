// Run the launcher against a stand-in for the TV's own interfaces, to exercise the paths that only exist on the TV.
import { launch } from './lib/browser.mjs';
import fs from 'node:fs';
import assert from 'node:assert/strict';
fs.mkdirSync('work', { recursive: true });      // screenshots of each step land in work/ (not in the repository)
const br = await launch();
const pg = await br.newPage({ viewport: { width: 1920, height: 1080 } });
const errs = []; pg.on('pageerror', e => errs.push('pageerror: ' + e.message)); pg.on('console', m => { if (m.type() === 'error') errs.push('console: ' + m.text()); });
await pg.addInitScript(([full, hideReal]) => {
  window.__FULL = full; window.__HIDE_REAL = hideReal; const calls = []; window.__calls = calls; let hidden = false;
  Object.defineProperty(document, 'hidden', { get: () => hidden });
  window.__setHidden = v => { hidden = v; document.dispatchEvent(new Event('visibilitychange')); };
  // as reported by the real TV on 2026-11-22 (names and IDs), plus a few of its system entries; HIDE_REAL=1 hides the real
  // Prime Video / Apple TV entries so that only their placeholder tiles are visible
  const apps = [
    { id: 'com.samsung.tv.cobalt-yt', name: 'Youtube', show: false }, { id: '9Ur5IzDKqV.TizenYouTube', name: 'YouTube', show: true, packageId: '9Ur5IzDKqV' },
    { id: 'OGLLvqej7u.service', name: 'service', show: false }, { id: 'OGLLvqej7u.CrunchyrollWebApp', name: 'Crunchyroll', show: true, packageId: 'OGLLvqej7u' },
    { id: 'rTn6ClEurC.Jellyfin', name: 'Jellyfin', show: true, packageId: 'rTn6ClEurC' },
    { id: 'rJeHak5zRg.SpotifyService', name: 'SpotifyRecomendationsService', show: false }, { id: 'rJeHak5zRg.Spotify', name: 'Spotify - Music and Podcasts', show: true, packageId: 'rJeHak5zRg' },
    { id: 'org.tizen.netflix-app', name: 'Netflix', show: true, packageId: 'org.tizen.netflix-app' },
    { id: 'MCmYXNxgcu.DisneyPlusService', name: 'DisneyPlusPreviewService', show: false }, { id: 'MCmYXNxgcu.DisneyPlus', name: 'Disney+', show: true, packageId: 'MCmYXNxgcu' },
    { id: 'org.tizen.primevideo-dummy', name: 'Prime Video', show: true }, { id: 'org.tizen.primevideo', name: 'Prime Video', show: !hideReal },
    { id: 'com.samsung.tv.aria-dummy', name: 'Apple TV', show: true }, { id: 'com.samsung.tv.aria-video', name: 'Apple TV', show: !hideReal },
    { id: 'org.tizen.globoplayaria', name: 'globoplay', show: true }, { id: 'GHI3a0zMSx.XboxGamePass', name: 'Xbox', show: true }, { id: 'HEPsqFNie0.tvplusstandalone', name: 'Samsung TV Plus', show: true },
    { id: 'org.tizen.browser', name: 'Internet', show: true, packageId: 'org.tizen.browser' },
    { id: 'org.volt.apps', name: 'Apps', show: true }, { id: 'MainMenuTV.Home', name: 'Main Menu', show: true },
    { id: 'org.tizen.RunningAppsService', name: 'RunningAppsService', show: false }, { name: 'no id' }, null,
    ...(window.__FULL ? [{ id: 'MoonLightS.MoonlightWasm', name: 'Moonlight', show: true }] : []),
  ];
  const installed = () => apps.filter(a => !a || (a.id !== sessionStorage.getItem('mock.uninstalled') &&
    !(a.id === 'org.volt.apps' && sessionStorage.getItem('mock.noStore'))));
  const stamp = () => { if (!window.__firstAsk) window.__firstAsk = performance.now(); };
  window.tizen = {
    application: {
      getAppsInfo: (ok, err) => {
        stamp(); calls.push('getAppsInfo');
        const finish = () => {
          if (window.__failInventory) err({ name: 'UnknownError', message: 'Mock inventory unavailable' });
          else { ok(installed()); calls.push('inventory delivered'); }
        };
        if (window.__holdInventory) window.__finishInventory = finish;
        else setTimeout(finish, 120);
      },
      getAppInfo: id => { stamp(); calls.push('getAppInfo ' + id); const a = installed().find(a => a && a.id === id); if (!a) { const e = new Error('no such app'); e.name = 'NotFoundError'; throw e; } return a; },
      launch: (id, ok, err) => { calls.push('launch ' + id); setTimeout(() => (window.__failLaunch ? err({ name: 'NotFoundError' }) : ok()), 60); },
      getCurrentApplication: () => ({ appInfo: { id: 'MainMenuTV.Home' }, hide: () => calls.push('hide'), exit: () => calls.push('exit') }),
    },
    systeminfo: { getPropertyValue: (what, ok) => {
      stamp(); calls.push('sysinfo ' + what);
      const hdmi = number => ({ type: 'HDMI', number });
      const attached = sessionStorage.getItem('mock.hdmi2') === 'connected';
      setTimeout(() => ok({
        connected: (attached ? [3, 2, 1] : [1, 3]).map(hdmi),
        disconnected: [...(attached ? [4] : [2, 4]).map(hdmi), { type: 'TV', number: 1 }],
      }), 80);
    } },
    tvwindow: {
      setSource: (src, ok) => { calls.push(`setSource ${src.type}${src.number}`); setTimeout(ok, 50); },
      show: (ok, err, rect, type, z) => { calls.push(`show ${rect.join(',')} ${type} ${z}`); setTimeout(ok, 50); },
      hide: (ok) => { calls.push('tvwindow.hide'); setTimeout(ok, 10); },
    },
    tvinputdevice: { registerKeyBatch: keys => calls.push('keys ' + keys.join('+')) },
  };
}, [!!process.env.FULL, !!process.env.HIDE_REAL]);
await pg.goto(`file://${process.cwd()}/${process.env.DIR || '.'}/index.html?q=3`);
const key = async (k, wait = 260) => { await pg.keyboard.press(k); await pg.waitForTimeout(wait); };
const diag = () => pg.evaluate(() => window.__diag());
const calls = () => pg.evaluate(() => window.__calls.slice());
const tag = process.env.FULL ? 'full' : 'part';
async function selectHome(matches) {
  const { menu, sel } = await diag();
  const target = menu.findIndex(matches);
  assert.notEqual(target, -1, 'expected shortcut on Home');
  const down = (target - sel + menu.length) % menu.length;
  const up = menu.length - down;
  for (let i = 0; i < Math.min(up, down); i++) await pg.keyboard.press(down <= up ? 'ArrowDown' : 'ArrowUp');
  assert.equal((await diag()).sel, target);
}
async function openSettings() {
  await selectHome(item => item.label === 'SETTINGS' && !item.appId);
  await pg.keyboard.press('Enter');
  assert.equal((await diag()).mode, 'settings');
}
async function openApps() {
  await openSettings();
  await pg.keyboard.press('Enter');
  assert.equal((await diag()).mode, 'apps');
}
async function openInputSettings() {
  await openSettings();
  await pg.keyboard.press('ArrowDown');
  await pg.keyboard.press('Enter');
  assert.equal((await diag()).mode, 'inputSettings');
}
async function selectInput(defaultName) {
  const { rows, selected } = (await diag()).inputSettings;
  const target = rows.findIndex(row => row.defaultName === defaultName);
  assert.notEqual(target, -1, 'expected port in Input Settings');
  for (let i = 0; i < Math.abs(target - selected); i++) await pg.keyboard.press(target < selected ? 'ArrowUp' : 'ArrowDown');
  assert.equal((await diag()).inputSettings.selected, target);
}
async function selectRow(matches) {
  const { selected, rows } = (await diag()).menuSettings;
  const target = rows.findIndex(matches);
  assert.notEqual(target, -1, 'expected row in Apps');
  for (let i = 0; i < Math.abs(target - selected); i++) await pg.keyboard.press(target < selected ? 'ArrowUp' : 'ArrowDown');
  assert.equal((await diag()).menuSettings.selected, target);
}
async function reloadInventory() {
  await pg.reload();
  await pg.waitForFunction(() => window.__lab && window.__lab.S.t > 1600 && window.__calls.includes('inventory delivered'));
}
async function resumeHome() {
  await pg.evaluate(() => window.__setHidden(false));
  await pg.waitForFunction(() => {
    const t = window.__lab.S.t;
    return t >= 300 && t < 1000 && document.getElementById('fx').style.display === 'block';
  }, null, {timeout: 4000});
  await pg.waitForFunction(() => window.__lab.S.t >= 1600);
}
await pg.waitForFunction(() => window.__lab && window.__lab.S.t > 1600 && window.__calls.includes('inventory delivered'));
let d = await diag();
{ const c = await calls(); console.log('questions to the TV:', c.filter(x => x.startsWith('getAppInfo')).length, 'by ID,', c.filter(x => x === 'getAppsInfo').length, 'full list,', c.filter(x => x.startsWith('sysinfo')).length, 'sources | first one', Math.round(await pg.evaluate(() => window.__firstAsk || 0)), 'ms after the page opened | apps:', d.apps && d.apps.how, '| held for', d.setup['held for'], 'ms'); }
console.log('menu:', d.menu.map(m => `${m.label}${m.missing ? ' (missing)' : '=' + m.appId}`).join(' | '));
console.log('sources:', d.sources.join(', '), '|', d.sourcesInfo);
await pg.screenshot({ path: `work/tv-${tag}-1-home.png` });
// The inventory may include Moonlight, and the user can reorder Spotify.
if (process.env.FULL) {
  await selectHome(item => item.appId === 'MoonLightS.MoonlightWasm');
  await key('Enter', 1700);
  assert.ok((await calls()).includes('launch MoonLightS.MoonlightWasm'));
  await pg.screenshot({ path: `work/tv-${tag}-2-moonlight.png` });
  await pg.evaluate(() => window.__setHidden(true)); await pg.waitForTimeout(300);
  await resumeHome();
} else {
  assert.ok(!d.menu.some(item => item.label === 'MOONLIGHT'));
}
await selectHome(item => item.appId === 'rJeHak5zRg.Spotify');
await key('Enter', 1700);
console.log('OK on Spotify →', (await calls()).filter(c => c.startsWith('launch')).slice(-1).join(''), '| mode', (await diag()).mode);
await pg.evaluate(() => window.__setHidden(true)); await pg.waitForTimeout(400);
await resumeHome();
console.log('back in front: mode', (await diag()).mode);
// a launch that fails every way it can
await pg.evaluate(() => { window.__failLaunch = true; });
await key('Enter', 2300);
d = await diag(); console.log('failed launch: mode', d.mode, '| notes:', d.notes.slice(-1).join(''));
await pg.evaluate(() => { window.__failLaunch = false; });
// one press up from the first line wraps to the last, and one down comes back; Inputs is the first line
for (let i = d.sel; i > 0; i--) await key('ArrowUp', 200);
d = await diag(); console.log('first line:', d.menu[0].label, '| selected:', d.menu[d.sel].label);
await key('ArrowUp', 500);
d = await diag(); console.log('Up from the first line lands on:', d.menu[d.sel].label, '| window starts at line', d.top + 1);
await key('ArrowDown', 500);
await key('Enter', 1300); await key('ArrowDown', 500); await key('ArrowDown', 500);
d = await diag(); console.log('inputs: mode', d.mode);
await pg.screenshot({ path: `work/tv-${tag}-4-inputs.png` });
await key('Enter', 500);
console.log('source shown:', (await calls()).filter(c => /setSource|show |hide/.test(c)).join(', '), '| page class:', await pg.evaluate(() => document.documentElement.className));
await key('Escape', 400);
console.log('after Back:', (await calls()).filter(c => /tvwindow.hide/.test(c)).length, 'hide call(s) | page class:', JSON.stringify(await pg.evaluate(() => document.documentElement.className)), '| mode', (await diag()).mode);
await key('Escape', 900); await key('Escape', 300);
console.log('Back on home asks the TV to hide the app:', (await calls()).filter(c => c === 'hide').length === 1);
// something of the TV's own in front (its screensaver): the page should notice, draw less often after a while, and come back at once
{
  const rate = ms => pg.evaluate(ms => new Promise(ok => { const r = window.renderAt; let n = 0, f = 0; window.renderAt = t => { n++; r(t); }; const t0 = performance.now(); (function loop() { f++; if (performance.now() - t0 < ms) requestAnimationFrame(loop); else { window.renderAt = r; ok(+(n / f).toFixed(2)); } })(); }), ms);
  const before = await rate(700);
  await pg.evaluate(() => { Object.defineProperty(document, 'hasFocus', { value: () => false, configurable: true }); window.dispatchEvent(new Event('blur')); });
  const first = await rate(700); await pg.waitForTimeout(5000); const later = await rate(1200);
  const cov = (await diag()).covered;
  await pg.evaluate(() => { Object.defineProperty(document, 'hasFocus', { value: () => true, configurable: true }); window.dispatchEvent(new Event('focus')); });
  const after = await rate(700);
  console.log(`covered: share of frames drawn — before ${before}, just covered ${first}, covered for 5 s+ ${later} (noticed: ${cov}), in front again ${after} (noticed: ${!(await diag()).covered})`);
}
await pg.keyboard.press('d'); await pg.waitForTimeout(600);
await pg.screenshot({ path: `work/tv-${tag}-5-debug.png` });
d = await diag(); console.log('errors:', JSON.stringify(d.errors), '| page errors:', errs.filter(e => !/ERR_FILE_NOT_FOUND/.test(e)).join('; ') || 'none');
// Name an unplugged port, reconnect it in a different inventory position, and switch to it.
await openInputSettings();
const hdmi2 = d => d.inputSettings.rows.find(row => row.defaultName === 'HDMI 2');
assert.equal(hdmi2(await diag()).connected, false);
await selectInput('HDMI 2');
await pg.keyboard.press('Enter');
const editor = pg.locator('#rename-input');
const field = pg.locator('#input-alias');
await editor.waitFor({ state: 'visible' });
assert.ok((await diag()).inputSettings.editing);
const firstKey = await editor.locator('button:focus').textContent();
await pg.keyboard.press('ArrowRight');
const nextKey = await editor.locator('button:focus').textContent();
assert.notEqual(nextKey, firstKey, 'remote arrows move the keyboard cursor');
await pg.keyboard.press('Enter');
assert.equal(await field.inputValue(), nextKey, 'OK on a character replaces the selected name');
await pg.keyboard.press('Escape');
assert.equal((await diag()).inputSettings.editing, false);
assert.equal(hdmi2(await diag()).name, 'HDMI 2', 'cancel preserves the name');

await pg.keyboard.press('Enter');
await pg.keyboard.press('Enter'); // first letter on the remote keyboard
await pg.keyboard.press('ArrowUp'); // wrap to the command row
await pg.keyboard.press('ArrowLeft'); // wrap to Save
assert.equal(await editor.locator('button:focus').getAttribute('data-key'), 'save');
await pg.keyboard.press('Enter');
assert.equal(hdmi2(await diag()).name, firstKey, 'a rename can be completed with the remote alone');
await pg.keyboard.press('Enter');
await pg.keyboard.type('Arcade');
assert.ok(await field.evaluate(node => document.activeElement === node), 'hardware typing gives the text field focus');
await pg.evaluate(() => {
  const set = Storage.prototype.setItem;
  Storage.prototype.setItem = function(key, value) {
    if (key === 'mainmenu.input-names.1') throw new Error('Mock storage unavailable');
    return set.call(this, key, value);
  };
  window.__restoreStorage = () => { Storage.prototype.setItem = set; };
});
await field.press('Enter');
assert.ok(await editor.isVisible(), 'storage failure keeps the editable draft open');
assert.equal(await field.inputValue(), 'Arcade');
assert.equal(hdmi2(await diag()).name, firstKey);
await pg.evaluate(() => window.__restoreStorage());
await field.press('Enter');
assert.equal(hdmi2(await diag()).name, 'Arcade');
assert.ok((await diag()).sources.includes('Arcade (empty)'));
await pg.evaluate(() => sessionStorage.setItem('mock.hdmi2', 'connected'));
await pg.keyboard.press('Escape');
assert.equal((await diag()).mode, 'settings');
await pg.keyboard.press('Enter'); // returning to the hub retained the Input Settings selection
await pg.waitForFunction(() => window.__diag().inputSettings.rows.some(row => row.name === 'Arcade' && row.connected));
assert.equal(hdmi2(await diag()).name, 'Arcade');
await reloadInventory();
assert.equal(hdmi2(await diag()).name, 'Arcade', 'the physical HDMI port keeps its name after relaunch');
await selectHome(item => item.label === 'INPUTS');
await pg.keyboard.press('Enter');
const aliasRow = (await diag()).sources.indexOf('Arcade');
assert.notEqual(aliasRow, -1, 'the Inputs chooser shows the alias');
const currentSource = await pg.evaluate(() => window.__lab.S.lsel);
for (let i = 0; i < Math.abs(aliasRow - currentSource); i++) await pg.keyboard.press(aliasRow < currentSource ? 'ArrowUp' : 'ArrowDown');
await pg.keyboard.press('Enter');
await pg.waitForFunction(() => document.documentElement.classList.contains('through'));
assert.equal((await calls()).filter(call => call.startsWith('setSource ')).at(-1), 'setSource HDMI2');
await pg.keyboard.press('Escape'); // close passthrough
await pg.keyboard.press('Escape'); // leave the Inputs chooser
await openInputSettings();
await selectInput('HDMI 2');
await pg.keyboard.press('Enter');
await field.fill('');
await field.press('Enter');
assert.equal(hdmi2(await diag()).name, 'HDMI 2', 'an empty alias restores the default name');
await pg.evaluate(() => sessionStorage.removeItem('mock.hdmi2'));
console.log('Input Settings remote typing, cancel, save, reconnect, relaunch, source selection and default-name reset passed.');
// Use the normal remote controls throughout. Start from an older saved menu with a hidden app.
await pg.evaluate(() => localStorage.setItem('mainmenu.menu.1', JSON.stringify({ order: ['inputs', 'spotify', 'youtube'], hidden: ['disney'] })));
await reloadInventory();
await openApps();
const globoplay = row => row.label.toLowerCase() === 'globoplay';
const hasGloboplayShortcut = d => d.menu.some(a => a.appId === 'org.tizen.globoplayaria');
d = await diag();
const rows = d.menuSettings.rows;
assert.ok(rows.find(globoplay)?.hidden, 'uncurated installed app starts hidden');
assert.ok(rows.find(row => row.key === 'disney')?.hidden, 'keep previously hidden apps');
assert.ok(d.menu.findIndex(a => a.label === 'SPOTIFY') < d.menu.findIndex(a => a.label === 'YOUTUBE'), 'keep the saved Home order');
assert.ok(!hasGloboplayShortcut(d));
assert.ok(!rows.some(row => /Main Menu|RunningAppsService|SpotifyRecomendationsService/i.test(row.label)));
assert.equal(rows.filter(row => row.label.toUpperCase() === 'PRIME VIDEO').length, 1, 'ignore duplicate placeholder');
assert.equal(rows.some(row => row.key === 'moonlight'), Boolean(process.env.FULL));

await selectRow(globoplay);
await pg.keyboard.press('Enter');
assert.ok(hasGloboplayShortcut(await diag()));
await pg.keyboard.press('ArrowLeft');
const moved = (await diag()).menuSettings;
assert.equal(moved.selected, rows.findIndex(globoplay) - 1);
const beforeMove = moved.rows[moved.selected + 1].key;
const keyGloboplay = moved.rows[moved.selected].key;
await reloadInventory();
d = await diag();
assert.ok(hasGloboplayShortcut(d), 'new shortcut survives relaunch');
const order = d.menuSettings.rows.map(row => row.key);
assert.equal(order[order.indexOf(keyGloboplay) + 1], beforeMove, 'new order survives relaunch');
await selectHome(item => item.appId === 'org.tizen.globoplayaria');
await pg.keyboard.press('Enter');
await pg.waitForFunction(() => window.__calls.includes('launch org.tizen.globoplayaria'));

// An uninstalled app disappears from both menus. Its chosen visibility survives a reinstall.
await pg.evaluate(() => {
  window.__setHidden(true);
  sessionStorage.setItem('mock.uninstalled', 'org.tizen.globoplayaria');
  window.__setHidden(false);
});
await pg.waitForFunction(() => !window.__diag().menuSettings.rows.some(r => r.label.toLowerCase() === 'globoplay'));
d = await diag();
assert.ok(!d.menuSettings.rows.some(globoplay));
assert.ok(!hasGloboplayShortcut(d));
await pg.evaluate(() => sessionStorage.removeItem('mock.uninstalled'));
await reloadInventory();
assert.ok(hasGloboplayShortcut(await diag()));

await openApps();
await selectRow(globoplay);
await pg.keyboard.press('Enter');
assert.ok(!hasGloboplayShortcut(await diag()));
await reloadInventory();
d = await diag();
assert.ok(d.menuSettings.rows.find(globoplay).hidden);
assert.ok(!hasGloboplayShortcut(d), 'removed shortcut stays hidden after relaunch');

await openApps();
for (const row of (await diag()).menuSettings.rows.filter(row => !row.hidden)) {
  await selectRow(r => r.key === row.key);
  await pg.keyboard.press('Enter');
}
await pg.keyboard.press('Escape');
assert.equal((await diag()).mode, 'settings');
await pg.keyboard.press('Escape');
assert.equal((await diag()).mode, 'home');
assert.deepEqual((await diag()).menu.map(item => item.label), ['SETTINGS']);
await openApps();
assert.ok((await diag()).menuSettings.rows.some(globoplay), 'Apps remains usable after hiding every shortcut');
assert.deepEqual((await diag()).errors, []);
assert.deepEqual(errs.filter(e => !/ERR_FILE_NOT_FOUND/.test(e)), []);
console.log('Apps inventory, visibility, launch, saved order, upgrade, uninstall/reinstall and empty Home passed.');
// Device Care can cover the launcher without a visibilitychange. Only a fresh SDK inventory confirms removal.
const waitPhase = phase => pg.waitForFunction(expected =>
  window.__diag().menuSettings.removal?.phase === expected, phase, { timeout: 6000 });
const xbox = 'GHI3a0zMSx.XboxGamePass';
const pendingKey = 'mainmenu.pending-removal.1';
const pendingTarget = () => pg.evaluate(key => JSON.parse(localStorage.getItem(key)), pendingKey);
const launches = async () => (await calls()).filter(call => call.startsWith('launch '));
const blue = () => pg.evaluate(() =>
  window.dispatchEvent(new KeyboardEvent('keydown', { keyCode: 406, bubbles: true, cancelable: true })));
assert.ok((await calls()).some(call => call.startsWith('keys ') && call.includes('ColorF3Blue')));
for (const row of (await diag()).menuSettings.rows.filter(r => r.key === 'inputs' || r.appId === 'org.volt.apps')) {
  await selectRow(r => r.key === row.key);
  const before = (await diag()).menuSettings;
  await pg.keyboard.press('Delete');
  assert.ok(!(await diag()).menuSettings.removal);
  assert.deepEqual((await diag()).menuSettings.rows, before.rows);
}

await selectRow(row => row.appId === xbox);
await pg.keyboard.press('Enter'); // short OK shows this shortcut on Home
const xboxRow = (await diag()).menuSettings.rows.find(row => row.appId === xbox);
assert.equal(xboxRow.hidden, false);
const initialLaunches = await launches();
await pg.keyboard.down('Enter');
await pg.waitForTimeout(800);
await pg.keyboard.down('Enter'); // auto-repeat while held
await pg.keyboard.up('Enter');
await waitPhase('guide');
d = await diag();
assert.equal(d.menuSettings.removal.key, xboxRow.key);
assert.equal(d.menuSettings.removal.label, xboxRow.label);
assert.equal((await pendingTarget()).appId, xbox);
assert.deepEqual(d.menuSettings.rows.find(row => row.appId === xbox), xboxRow);
await pg.keyboard.press('Escape');
assert.ok(!(await diag()).menuSettings.removal);
assert.equal(await pendingTarget(), null);
assert.equal((await diag()).mode, 'apps');

async function checkInventory({visibilityChange = false, removed = false, fail = false} = {}) {
  await blue();
  await waitPhase('guide');
  await pg.evaluate(({visibilityChange, removed, fail, xbox}) => {
    if (visibilityChange) window.__setHidden(true);
    if (removed) sessionStorage.setItem('mock.uninstalled', xbox);
    window.__holdInventory = true;
    window.__finishInventory = null;
    window.__failInventory = fail;
    if (visibilityChange) window.__setHidden(false);
  }, {visibilityChange, removed, fail, xbox});
  if (!visibilityChange) await pg.keyboard.press('Enter'); // return from a Settings overlay manually
  await pg.waitForFunction(() => typeof window.__finishInventory === 'function', null, {timeout: 7000});
  await waitPhase('checking');
  const pending = await diag();
  assert.equal(pending.mode, 'apps');
  assert.ok(pending.menu.some(item => item.appId === xbox), 'keep the shortcut until a fresh inventory arrives');
  await pg.evaluate(() => { window.__holdInventory = false; window.__finishInventory(); });
  await waitPhase(fail ? 'error' : removed ? 'removed' : 'present');
  if (visibilityChange) await pg.waitForTimeout(1500); // resume animation
  assert.equal((await diag()).mode, 'apps');
}

await checkInventory();
d = await diag();
assert.deepEqual(d.menuSettings.rows[d.menuSettings.selected], xboxRow);
await pg.keyboard.press('Escape');
await checkInventory({visibilityChange:true, removed:true, fail:true});
assert.ok((await diag()).menuSettings.rows.some(row => row.appId === xbox), 'failed read preserves the known app');
await pg.keyboard.press('Escape');
await pg.evaluate(() => { window.__failInventory = false; sessionStorage.removeItem('mock.uninstalled'); });
await checkInventory({removed:true});
d = await diag();
assert.ok(!d.menu.some(item => item.appId === xbox));
assert.ok(!d.menuSettings.rows.some(row => row.appId === xbox));
assert.ok(d.menuSettings.selected >= 0 && d.menuSettings.selected < d.menuSettings.rows.length);
await pg.keyboard.press('Escape');
assert.ok(!(await diag()).menuSettings.removal);
assert.equal((await diag()).mode, 'apps');
assert.deepEqual(await launches(), initialLaunches, 'removal never launches an external app');

// Check both an interrupted Device Care visit and a pending Samsung Apps handoff saved by 0.10.0.
for (const phase of ['guide', 'opening']) {
  await pg.evaluate(() => {
    sessionStorage.removeItem('mock.uninstalled');
    sessionStorage.setItem('mock.noStore', '1');
  });
  await reloadInventory();
  await openApps();
  await selectRow(row => row.appId === xbox);
  await blue();
  await waitPhase('guide');
  await pg.evaluate(({key, phase, id}) => {
    const target = JSON.parse(localStorage.getItem(key));
    localStorage.setItem(key, JSON.stringify({ ...target, phase }));
    window.__setHidden(true);
    sessionStorage.setItem('mock.uninstalled', id);
  }, {key: pendingKey, phase, id: xbox});
  await reloadInventory();
  await waitPhase('removed');
  d = await diag();
  assert.equal(d.mode, 'apps');
  assert.ok(!d.menu.some(item => item.appId === xbox));
  assert.ok(!d.menuSettings.rows.some(row => row.appId === xbox));
  assert.equal(await pendingTarget(), null);
  assert.deepEqual(await launches(), []);
  assert.deepEqual(d.errors, []);
}
console.log('Device Care removal guide, on-demand and resume checks, cancellation, read failure and migration passed.');
await br.close();
