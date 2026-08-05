import { createRequire } from 'node:module';
import fs from 'node:fs';
const OUT = 'C:/Users/Chloe/WorkBuddy/2026-08-05-11-22-15/avalon-companion/errors.log';
const log = (msg) => { fs.appendFileSync(OUT, msg + '\n'); };
fs.writeFileSync(OUT, '--- start ---\n');
try {
  log('require ok');
  const require = createRequire('C:/Users/Chloe/.workbuddy/binaries/node/workspace/');
  const { chromium } = require('playwright');
  log('launch');
  const b = await chromium.launch({ args: ['--no-sandbox'] });
  const ctx = await b.newContext({ viewport: { width: 390, height: 844 } });
  const p = await ctx.newPage();
  const errs = [];
  p.on('pageerror', e => { errs.push('PAGE: ' + e.message); log('pageerror: ' + e.message); });
  p.on('console', m => { if (m.type() === 'error') { errs.push('CONS: ' + m.text()); log('console: ' + m.text()); } });
  p.on('requestfailed', r => { errs.push('NET: ' + r.url() + ' ' + (r.failure()?.errorText ?? '')); log('requestfailed: ' + r.url()); });
  log('goto home');
  await p.goto('http://localhost:8787/', { waitUntil: 'networkidle' });
  await p.waitForTimeout(800);
  log('goto test');
  await p.goto('http://localhost:8787/test', { waitUntil: 'networkidle' });
  await p.waitForTimeout(800);
  await b.close();
  log('--- done, count=' + errs.length + ' ---');
  for (const e of errs) log(' >> ' + e);
} catch (e) {
  log('CATCH: ' + (e?.stack ?? e));
}
log('--- end ---');