// Which Chromium the PC-side tools drive: $CHROMIUM (or $EXE) if set, else a system Chromium/Chrome if one is found,
// else the browser Playwright downloads for itself (`npx playwright install chromium`).
import { chromium } from 'playwright';
import fs from 'node:fs';
export function browserPath(wanted) {
  return [wanted, process.env.EXE, process.env.CHROMIUM, '/usr/bin/chromium', '/usr/bin/chromium-browser', '/usr/bin/google-chrome', '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'].find(p => p && fs.existsSync(p));
}
export async function launch(wanted) {
  const exe = browserPath(wanted);
  return chromium.launch({ ...(exe ? { executablePath: exe } : {}), args: ['--allow-file-access-from-files', '--no-sandbox'] });
}
