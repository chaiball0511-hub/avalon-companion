// 响应式截图：在 375×667 / 390×844 / 430×932 三个手机视口下渲染关键界面。
// 用法（在已安装 playwright + chromium 的 node 工作区运行）：
//   node scripts/responsive_shots.mjs
// 依赖服务运行在 http://localhost:8787

import { createRequire } from 'node:module';
import fs from 'node:fs';
import path from 'node:path';

// playwright 安装在受管的 node 工作区，用绝对基路径解析，避免重复安装/下载。
const require = createRequire('C:/Users/Chloe/.workbuddy/binaries/node/workspace/');
const { chromium } = require('playwright');

const BASE = process.env.BASE_URL ?? 'http://localhost:8787';
const OUT = path.resolve('C:/Users/Chloe/WorkBuddy/2026-08-05-11-22-15/avalon-companion/responsive-shots');
fs.mkdirSync(OUT, { recursive: true });

const VIEWPORTS = [
  { name: 'iphone-se', width: 375, height: 667 },
  { name: 'iphone-12', width: 390, height: 844 },
  { name: 'pixel', width: 430, height: 932 },
];

const screens = [
  { key: 'home', go: async (p) => { await p.goto(BASE + '/', { waitUntil: 'networkidle' }); } },
  { key: 'test-setup', go: async (p) => { await p.goto(BASE + '/test', { waitUntil: 'networkidle' }); } },
  {
    key: 'lobby',
    go: async (p) => {
      await p.goto(BASE + '/test', { waitUntil: 'networkidle' });
      await p.getByRole('button', { name: '开始测试' }).click();
      await p.getByRole('button', { name: '开始游戏' }).waitFor({ timeout: 5000 });
    },
  },
  {
    key: 'reveal',
    go: async (p) => {
      await p.goto(BASE + '/test', { waitUntil: 'networkidle' });
      await p.getByRole('button', { name: '开始测试' }).click();
      await p.getByRole('button', { name: '开始游戏' }).click();
      await p.getByText('查看身份', { timeout: 5000 }).first().waitFor();
    },
  },
  {
    key: 'console',
    go: async (p) => {
      await p.goto(BASE + '/test', { waitUntil: 'networkidle' });
      await p.getByRole('button', { name: '开始测试' }).click();
      await p.getByRole('button', { name: '开始游戏' }).click();
      await p.getByRole('button', { name: '模拟全员确认身份' }).click();
      await p.waitForSelector('.quest-track', { timeout: 5000 });
    },
  },
  {
    key: 'debug-answers',
    go: async (p) => {
      await p.goto(BASE + '/test', { waitUntil: 'networkidle' });
      await p.getByRole('button', { name: '开始测试' }).click();
      await p.getByRole('button', { name: '开始游戏' }).click();
      await p.getByRole('button', { name: '模拟全员确认身份' }).click();
      await p.getByRole('button', { name: '显示测试答案' }).click();
      await p.getByText('全部角色', { timeout: 5000 }).first().waitFor();
    },
  },
];

const errors = [];

const browser = await chromium.launch({ args: ['--no-sandbox', '--disable-setuid-sandbox'] });

// 每个界面使用独立 context，避免测试房被 localStorage 恢复导致跳过设置页。
for (const sc of screens) {
  for (const vp of VIEWPORTS) {
    const ctx = await browser.newContext({
      viewport: { width: vp.width, height: vp.height },
      deviceScaleFactor: 2,
      isMobile: true,
      hasTouch: true,
    });
    const page = await ctx.newPage();
    page.on('pageerror', (e) => errors.push(`[${vp.name}] ${sc.key} pageerror: ${e.message}`));
    page.on('console', (m) => {
      if (m.type() === 'error') errors.push(`[${vp.name}] ${sc.key} console.error: ${m.text()}`);
    });
    try {
      await sc.go(page);
      await page.waitForTimeout(400);
      const file = path.join(OUT, `${vp.name}__${sc.key}.png`);
      await page.screenshot({ path: file, fullPage: false });
      // eslint-disable-next-line no-console
      console.log(`saved ${file}`);
    } catch (err) {
      errors.push(`[${vp.name}] ${sc.key} failed: ${err.message}`);
    }
    await ctx.close();
  }
}

await browser.close();

if (errors.length) {
  console.log('\n--- ISSUES ---');
  for (const e of errors) console.log(e);
  process.exitCode = 1;
} else {
  console.log('\nAll screens captured, no console/page errors.');
}
