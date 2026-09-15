// From apps/kimi-web: pnpm exec vite --config test/browser/research-panel/vite.config.ts
// Then: PLAYWRIGHT_MODULE=/path/to/playwright node test/browser/research-panel/check.mjs
// Uses an existing browser install; never connects to a research session or backend.
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
const { chromium } = createRequire(import.meta.url)(process.env.PLAYWRIGHT_MODULE || 'playwright');
const out = await mkdtemp(join(tmpdir(), 'hakimi-research-panel-'));
const browser = await chromium.launch({ headless: true, args: ['--disable-dev-shm-usage'] });
const page = await browser.newPage({ viewport: { width: 1180, height: 960 } });
const errors = [];
page.on('pageerror', error => errors.push(error.message));
await page.route('**/*', route => route.request().url().startsWith('http://127.0.0.1:5193/')
  ? route.continue() : route.abort());
const trigger = page.getByRole('button', { name: 'Research', exact: true });
const hide = page.getByRole('button', { name: 'Hide panel', exact: true });
const board = page.locator('.research-floating-board');
const call = (method, arg) => page.evaluate(([method, arg]) => window.researchPanelHarness[method](arg), [method, arg]);
const visible = async locator => assert.equal(await locator.isVisible(), true);
try {
  await page.goto('http://127.0.0.1:5193/', { waitUntil: 'networkidle' });
  await page.waitForFunction(() => !!window.researchPanelHarness);
  await visible(trigger);
  assert.equal(await board.isVisible(), false, 'Starts collapsed');
  assert.equal(await page.locator('.research-board').count(), 1, 'Only one Board in empty conversation');
  const emptyComposer = await page.locator('.empty-composer').boundingBox();
  await trigger.click();
  await visible(hide);
  // The minimal board states the mode, its purpose, and the read-only history note.
  const body = await board.innerText();
  assert.match(body, /On/, 'Shows the on state');
  assert.match(body, /AITP Skills visible/, 'Shows skill visibility');
  assert.match(body, /read-only/, 'Marks legacy records read-only');
  assert.deepEqual(await page.locator('.empty-composer').boundingBox(), emptyComposer, 'No empty composer shift');
  await hide.press('Escape');
  assert.equal(await trigger.evaluate(el => el === document.activeElement), true, 'Escape restores focus');
  assert.deepEqual(await page.evaluate(() => window.researchPanelHarness.commands), [], 'Escape must not interrupt Research');
  await call('conversation');
  await visible(trigger);
  assert.equal(await page.locator('.research-board').count(), 1, 'One Board after first turn');
  await page.waitForTimeout(200);
  const dock = await page.locator('.chat-dock').boundingBox();
  const chat = await page.locator('.chat-scroll').boundingBox();
  await trigger.click();
  await visible(hide);
  await hide.click();
  assert.deepEqual(await page.locator('.chat-dock').boundingBox(), dock, 'Collapse does not resize composer');
  assert.deepEqual(await page.locator('.chat-scroll').boundingBox(), chat, 'Collapse does not resize chat');
  for (const theme of ['light', 'dark']) {
    await call('theme', theme);
    await trigger.click();
    await hide.hover();
    await page.screenshot({ path: join(out, `hover-${theme}.png`) });
    await hide.press('Tab');
    await page.keyboard.press('Shift+Tab');
    assert.equal(await hide.evaluate(el => el.matches(':focus-visible')), true);
    await hide.click();
  }
  await trigger.click();
  const panelBox = await board.boundingBox();
  assert.ok(panelBox.y + panelBox.height <= dock.y, 'Panel stops above dock');
  await page.screenshot({ path: join(out, 'open-dark.png') });
  await call('session', 'session-b');
  await visible(trigger);
  assert.equal(await board.isVisible(), false, 'Session change resets panel');
  await call('loading', true);
  assert.equal(await page.locator('.research-floating').count(), 0, 'Loading cannot show previous session board');
  await call('loading', false);
  await visible(trigger);
  await call('reveal');
  await visible(hide);
  await hide.click();
  await call('mode', 'off');
  assert.equal(await page.locator('.research-floating').count(), 0, 'Disabled mode hides the panel');
  await call('mode', 'on');
  await visible(trigger);
  await trigger.click();
  await call('preview');
  assert.ok((await board.boundingBox()).x + (await board.boundingBox()).width
    <= (await page.locator('.fixture-preview').boundingBox()).x, 'Panel stays inside chat beside existing preview');
  await page.screenshot({ path: join(out, 'alongside-preview.png') });
  // Remove the simulated preview before testing the narrow standalone chat.
  await page.reload({ waitUntil: 'networkidle' });
  await page.setViewportSize({ width: 390, height: 844 });
  await call('locale', 'zh');
  await page.getByRole('button', { name: 'Research', exact: true }).click();
  await call('conversation');
  for (const theme of ['light', 'dark']) {
    await call('theme', theme);
    await page.screenshot({ path: join(out, `mobile-${theme}.png`) });
  }
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth === innerWidth), true, 'No mobile document overflow');
  assert.equal(await board.evaluate(el => el.scrollWidth <= el.clientWidth), true, 'Board has no horizontal overflow');
  await page.getByRole('button', { name: '隐藏面板', exact: true }).press('Escape');
  await visible(page.getByRole('button', { name: 'Research', exact: true }));
  assert.deepEqual(errors, [], 'No browser errors');
  await writeFile(join(out, 'report.json'), JSON.stringify({ passed: true, errors }, null, 2));
  console.log(`Research panel browser checks passed; screenshots: ${out}`);
} finally {
  await browser.close();
}
