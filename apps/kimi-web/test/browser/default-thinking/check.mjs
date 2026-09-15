// From apps/kimi-web:
//   pnpm exec vite --config test/browser/default-thinking/vite.config.ts
//   PLAYWRIGHT_MODULE=/path/to/playwright node test/browser/default-thinking/check.mjs
// Uses an existing browser install. All API requests are mocked, with no daemon
// connection or real config writes; the production config client handles the wire.
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { mkdtemp, mkdir, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';

const { chromium } = createRequire(import.meta.url)(process.env.PLAYWRIGHT_MODULE || 'playwright');
const repoRoot = resolve(import.meta.dirname, '../../../../..');
await mkdir(join(repoRoot, '.tmp'), { recursive: true });
const out = await mkdtemp(join(repoRoot, '.tmp', 'default-thinking-'));
const origin = 'http://127.0.0.1:5196';
const browser = await chromium.launch({
  headless: true,
  executablePath: process.env.CHROMIUM_EXECUTABLE_PATH,
  args: ['--disable-dev-shm-usage'],
});
const page = await browser.newPage({ viewport: { width: 1180, height: 960 } });
const errors = [];
const patches = [];
let configReads = 0;
let releaseSave;
let holdSave = false;
let failSave = false;
const initial = {
  providers: {}, models: {}, default_model: 'example/effort-model',
  default_permission_mode: 'manual', default_plan_mode: false,
  telemetry: false, loop_control: { max_steps_per_turn: 77 },
};
let stored = structuredClone(initial);
page.on('pageerror', (error) => errors.push(error.message));
await page.route('**/*', async (route) => {
  const request = route.request();
  if (request.url() === `${origin}/api/v1/config`) {
    if (request.method() === 'POST') {
      const patch = request.postDataJSON();
      patches.push(patch);
      if (holdSave) await new Promise((resolve) => { releaseSave = resolve; });
      if (failSave) {
        await route.fulfill({ status: 500, json: { code: 50000, message: 'Fixture save failed' } });
        return;
      }
      // Mirror the server's deep merge for this control's two patch shapes.
      stored = {
        ...stored, ...patch,
        thinking: patch.thinking ? { ...stored.thinking, ...patch.thinking } : stored.thinking,
      };
    } else {
      assert.equal(request.method(), 'GET');
      configReads += 1;
    }
    await route.fulfill({ json: { code: 0, data: stored } });
    return;
  }
  if (request.url().startsWith(`${origin}/`) && !request.url().startsWith(`${origin}/api/`)) {
    await route.continue();
  } else {
    await route.abort();
  }
});
const call = (method, arg) => page.evaluate(([method, arg]) =>
  window.defaultThinkingHarness[method](arg), [method, arg]);
const effort = page.getByRole('combobox', { name: 'Default thinking effort', exact: true });
const thinking = page.getByRole('switch', { name: 'Thinking by default', exact: true });
const model = page.getByRole('combobox', { name: 'Default model', exact: true });
const hint = page.locator('#default-thinking-effort-hint');
const shot = (name) => page.screenshot({ path: join(out, `${name}.png`) });
const settled = () => page.waitForFunction(() => !window.defaultThinkingHarness.saving);
const openAgent = () => page.getByRole('tab', { name: 'Agent', exact: true }).click();
const reread = () => call('readConfig');
const selectedText = () => effort.locator('option:checked').innerText();

try {
  await page.goto(origin, { waitUntil: 'networkidle' });
  await openAgent();
  assert.equal(await effort.inputValue(), '');
  assert.equal(await selectedText(), 'High (model default)');
  assert.equal(await thinking.getAttribute('aria-checked'), 'true');
  assert.deepEqual(await effort.locator('option:not([disabled])').evaluateAll((options) => options.map((o) => o.value)), ['low', 'medium', 'high', 'xhigh']);
  assert.deepEqual(patches, [], 'Reading an absent thinking section never writes a preference');

  for (const theme of ['light', 'dark']) {
    await call('theme', theme);
    await thinking.focus();
    await effort.hover();
    await shot(`hover-${theme}`);
    await thinking.press('Tab');
    assert.equal(await effort.evaluate((el) => el.matches(':focus-visible')), true, 'Keyboard focus reaches the selector');
    assert.notEqual(await effort.evaluate((el) => getComputedStyle(el).boxShadow), 'none');
    await shot(`focus-${theme}`);
  }

  // Highest effort must be explicit, even when thinking is disabled. Hold the
  // response to check that a second change cannot race the in-flight write.
  stored = { ...initial, thinking: { enabled: false, effort: 'low' } };
  await reread();
  assert.equal(await effort.inputValue(), 'low');
  assert.equal(await thinking.getAttribute('aria-checked'), 'false');
  holdSave = true;
  await effort.selectOption('xhigh');
  await page.waitForFunction(() => window.defaultThinkingHarness.saving);
  assert.equal(await effort.isDisabled(), true);
  assert.equal(await thinking.isDisabled(), true);
  await effort.evaluate((el) => { el.value = 'medium'; el.dispatchEvent(new Event('change', { bubbles: true })); });
  assert.deepEqual(patches, [{ thinking: { effort: 'xhigh' } }], 'Only effort is patched, including the highest level');
  holdSave = false;
  releaseSave();
  await settled();
  assert.deepEqual(stored, { ...initial, thinking: { enabled: false, effort: 'xhigh' } });
  await reread();
  assert.equal(await effort.inputValue(), 'xhigh');
  assert.equal(await selectedText(), 'Xhigh');
  assert.equal(await thinking.getAttribute('aria-checked'), 'false');
  await page.getByRole('button', { name: 'Close', exact: true }).click();
  await call('reopen');
  await openAgent();
  assert.equal(await effort.inputValue(), 'xhigh', 'Reopening settings preserves the saved value');
  await page.reload({ waitUntil: 'networkidle' });
  await openAgent();
  assert.equal(await effort.inputValue(), 'xhigh', 'A fresh config read restores the explicit highest level');
  assert.equal(await thinking.getAttribute('aria-checked'), 'false');

  // Switching the default model exposes a stale effort, never rewrites it.
  await model.selectOption('example/other-model');
  await settled();
  assert.deepEqual(patches.at(-1), { default_model: 'example/other-model' });
  assert.equal(await effort.inputValue(), 'xhigh');
  assert.equal(await selectedText(), 'Xhigh (unsupported)');
  assert.equal(await effort.locator('option:checked').isDisabled(), true);
  assert.match(await hint.innerText(), /saved effort is not supported/);
  assert.deepEqual(stored.thinking, { enabled: false, effort: 'xhigh' });
  await shot('stale-effort');
  await effort.selectOption('max');
  await settled();
  assert.deepEqual(patches.at(-1), { thinking: { effort: 'max' } });
  assert.deepEqual(stored.thinking, { enabled: false, effort: 'max' });
  await thinking.click();
  await settled();
  assert.deepEqual(patches.at(-1), { thinking: { enabled: true } });
  assert.deepEqual(stored.thinking, { enabled: true, effort: 'max' }, 'The switch preserves effort');

  for (const id of ['example/boolean-model', 'example/no-thinking']) {
    await model.selectOption(id);
    await settled();
    assert.equal(await effort.isDisabled(), true);
    assert.equal(await selectedText(), 'Max (unsupported)');
    assert.match(await hint.innerText(), /does not support adjustable thinking effort/);
  }
  await shot('no-effort-capability');
  const beforeUnavailable = patches.length;
  await call('modelsLoaded', false);
  assert.equal(await effort.isDisabled(), true);
  assert.match(await hint.innerText(), /Choose an available default model/);
  await effort.evaluate((el) => { el.value = 'max'; el.dispatchEvent(new Event('change', { bubbles: true })); });
  assert.equal(patches.length, beforeUnavailable, 'Unavailable models cannot emit effort patches');
  await call('modelsLoaded', true);
  stored = { ...initial, default_model: undefined };
  await reread();
  assert.equal(await effort.isDisabled(), true);
  assert.equal(await selectedText(), 'Unavailable');
  assert.match(await hint.innerText(), /Choose an available default model/);
  await shot('no-default-model');
  assert.equal(patches.length, beforeUnavailable, 'Unavailable states do not silently write config');

  stored = { ...initial, default_model: 'example/always-on' };
  await reread();
  assert.equal(await effort.isDisabled(), false);
  assert.equal(await selectedText(), 'Max (model default)');
  assert.deepEqual(await effort.locator('option:not([disabled])').evaluateAll((options) => options.map((o) => o.value)), ['max']);
  // Real keyboard selection can persist the highest level even when it is the
  // model's only level and was already displayed as the inherited default.
  await effort.focus();
  await effort.press('ArrowDown');
  await settled();
  assert.deepEqual(patches.at(-1), { thinking: { effort: 'max' } });
  assert.deepEqual(stored.thinking, { effort: 'max' }, 'An absent enabled field stays absent');
  await reread();
  assert.equal(await selectedText(), 'Max');

  // A failed write leaves the last authoritative value intact, and re-enables
  // the control for retry; saving the model default records a concrete effort.
  stored = { ...initial, thinking: { enabled: false, effort: 'low' } };
  await reread();
  failSave = true;
  await effort.selectOption('medium');
  await settled();
  assert.equal(await effort.inputValue(), 'low');
  assert.match(await page.evaluate(() => window.defaultThinkingHarness.saveError), /Fixture save failed/);
  assert.deepEqual(stored.thinking, { enabled: false, effort: 'low' });
  failSave = false;
  await effort.selectOption('high');
  await settled();
  assert.deepEqual(patches.at(-1), { thinking: { effort: 'high' } });
  await reread();
  assert.equal(await selectedText(), 'High');
  assert.equal(await thinking.getAttribute('aria-checked'), 'false');

  await call('locale', 'zh');
  const zhEffort = page.getByRole('combobox', { name: '默认思考强度', exact: true });
  assert.equal(await zhEffort.inputValue(), 'high');
  await page.setViewportSize({ width: 390, height: 844 });
  for (const theme of ['light', 'dark']) {
    await call('theme', theme);
    await zhEffort.scrollIntoViewIfNeeded();
    await zhEffort.focus();
    await shot(`mobile-zh-${theme}`);
  }
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true, 'No mobile document overflow');
  assert.equal(await page.locator('.sd').evaluate((el) => el.scrollWidth <= el.clientWidth), true, 'No settings content overflow');
  assert.deepEqual(errors, [], 'No browser errors');
  assert.equal(configReads, 9, 'Persistence checked through repeated production-client config reads');
  await writeFile(join(out, 'report.json'), JSON.stringify({ passed: true, configReads, patches, errors }, null, 2));
  process.stdout.write(`Default-thinking browser checks passed; screenshots: ${out}\n`);
} catch (error) {
  await shot('failure');
  const body = await page.locator('body').innerText();
  await writeFile(join(out, 'failure.json'), JSON.stringify({ errors, body, patches }, null, 2));
  process.stderr.write(`Browser failure: ${JSON.stringify({ errors, body })}; artifacts: ${out}\n`);
  throw error;
} finally {
  releaseSave?.();
  await browser.close();
}
