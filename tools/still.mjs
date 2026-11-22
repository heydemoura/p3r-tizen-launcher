// usage: node tools/still.mjs "<query>" out.png
import { launch } from './lib/browser.mjs';
const [,, query, out] = process.argv;
const br = await launch();
const pg = await br.newPage({ viewport: { width: 1920, height: 1080 } });
pg.on('console', m => { if (m.type() === 'error') console.log('console error:', m.text()); });
pg.on('pageerror', e => console.log('page error:', e.message));
await pg.goto(`file://${process.cwd()}/index.html?capture=1&${query}`);
await pg.waitForFunction(() => window.ready, null, { timeout: 30000 });
await pg.screenshot({ path: out }); await br.close();
