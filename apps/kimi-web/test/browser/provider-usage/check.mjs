// Provider-usage panel browser harness.
// From apps/kimi-web:
//   pnpm exec vite --config test/browser/provider-usage/vite.config.ts
// Then:
//   PLAYWRIGHT_MODULE=/path/to/playwright node test/browser/provider-usage/check.mjs
// Uses an existing browser install; never connects to a backend (the composable
// is stubbed via a Vite alias and all state is fixture-driven).
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { mkdtemp, mkdir, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
const { chromium } = createRequire(import.meta.url)(process.env.PLAYWRIGHT_MODULE || 'playwright');
const repoRoot = resolve(import.meta.dirname, '../../../../..');
await mkdir(join(repoRoot, '.tmp'), { recursive: true });
const out = await mkdtemp(join(repoRoot, '.tmp', 'provider-usage-'));
const browser = await chromium.launch({
  headless: true,
  executablePath: process.env.CHROMIUM_EXECUTABLE_PATH,
  args: ['--disable-dev-shm-usage'],
});
const page = await browser.newPage({ viewport: { width: 820, height: 1100 } });
const errors = [];
page.on('pageerror', (error) => errors.push(error.message));
await page.route('**/*', (route) =>
  route.request().url().startsWith('http://127.0.0.1:5194/') ? route.continue() : route.abort());
const call = (method, arg) => page.evaluate(([method, arg]) => window.providerUsageHarness[method](arg), [method, arg]);
const hasText = async (text) => assert.match(await page.locator('body').innerText(), new RegExp(text));
const lacksText = async (text) => assert.doesNotMatch(await page.locator('body').innerText(), new RegExp(text));
const shot = (name) => page.screenshot({ path: join(out, `${name}.png`) });
try {
  await page.goto('http://127.0.0.1:5194/', { waitUntil: 'networkidle' });
  await page.waitForFunction(() => !!window.providerUsageHarness);

  // Default empty state.
  await hasText('No provider usage information is available');

  // Normal state (light + dark).
  await call('state', 'normal');
  await hasText('Recorded locally by Hakimi');
  await hasText('Official account balance');
  await hasText('CNY');
  await hasText('USD');
  await shot('normal-light');
  await call('theme', 'dark');
  await shot('normal-dark');
  await call('theme', 'light');

  // Expandable token details: hover + focus + expand/collapse.
  const details = page.getByRole('button', { name: 'Details', exact: true }).first();
  await details.hover();
  await shot('details-hover');
  await details.focus();
  await page.keyboard.press('Tab');
  await page.keyboard.press('Shift+Tab');
  assert.equal(await details.evaluate((el) => el.matches(':focus-visible')), true, 'Details button focus-visible');
  await shot('details-focus');
  await details.click();
  await hasText('Cache read');
  await hasText('Input');
  await hasText('Output');
  await shot('details-expanded');

  // No-data state.
  await call('state', 'no-data');
  await hasText('No requests recorded yet');
  await hasText('Today');
  await hasText('This month');
  assert.equal(await page.locator('.metered-period').count(), 2);
  assert.deepEqual(await page.locator('.metered-tokens').allTextContents(), ['0 tokens', '0 tokens']);
  assert.deepEqual(await page.locator('.metered-cost').allTextContents(), ['—', '—']);
  await shot('no-data');

  await call('state', 'unknown-tracking');
  await hasText('Tracking start unavailable');
  await hasText('2,000 tokens');
  await lacksText('No requests recorded yet');
  await shot('unknown-tracking');

  // Balance error still shows local stats.
  await call('state', 'balance-error');
  await hasText('Balance query failed: Balance endpoint unavailable');
  await hasText('Recorded locally by Hakimi');
  await shot('balance-error');

  await call('state', 'balance-unavailable');
  await hasText('Insufficient balance for API calls');
  await hasText('CNY');
  await hasText('¥0.00');
  await shot('balance-unavailable');

  await call('state', 'balance-empty');
  await hasText('No balance data');
  await shot('balance-empty');

  await call('state', 'tiny-balance');
  assert.match(await page.locator('.metered-balance-total').innerText(), /<¥0\.01/);
  await shot('tiny-balance');

  // Partial + pending/missing/unpriced flags.
  await call('state', 'partial');
  await hasText('Incomplete period');
  await hasText('pending');
  await hasText('missing usage');
  await hasText('unpriced');
  await shot('partial');

  // Degraded flag.
  await call('state', 'degraded');
  await hasText('Degraded recording');
  await shot('degraded');

  // Tiny positive cost must not render a misleading 0.00.
  await call('state', 'tiny');
  await hasText('<¥0.01');
  await lacksText('¥0.00');
  await shot('tiny');

  // Unknown cost renders the unknown marker, not zero.
  await call('state', 'unknown');
  await hasText('—');
  await shot('unknown');

  // zh locale render.
  await call('locale', 'zh');
  await call('state', 'normal');
  await hasText('本机 Hakimi 记录，非官方账单');
  await hasText('官方账户余额');
  await shot('zh-light');
  await call('theme', 'dark');
  await shot('zh-dark');
  await hasText('费用为估算');

  await page.setViewportSize({ width: 390, height: 844 });
  await call('state', 'partial');
  await shot('zh-mobile-dark');
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), true, 'No mobile horizontal overflow');
  await call('theme', 'light');
  await shot('zh-mobile-light');

  assert.deepEqual(errors, [], 'No browser errors');
  await writeFile(join(out, 'report.json'), JSON.stringify({ passed: true, errors }, null, 2));
  process.stdout.write(`Provider-usage browser checks passed; screenshots: ${out}\n`);
} finally {
  await browser.close();
}
