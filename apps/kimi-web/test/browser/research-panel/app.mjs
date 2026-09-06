import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { mkdtemp, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
const { chromium } = createRequire(import.meta.url)(process.env.PLAYWRIGHT_MODULE || 'playwright');
const out = await mkdtemp(join(tmpdir(), 'hakimi-research-app-'));
const browser = await chromium.launch({ headless: true, args: ['--disable-dev-shm-usage'] });
const page = await browser.newPage({ viewport: { width: 1440, height: 1000 }, reducedMotion: 'reduce' });
page.setDefaultTimeout(10000);
const errors = [];
page.on('pageerror', error => errors.push(error.message));
await page.route('**/*', route => route.request().url().startsWith('http://127.0.0.1:5193/')
  && !new URL(route.request().url()).pathname.startsWith('/api/') ? route.continue() : route.abort());
const call = (method, value) => page.evaluate(([method, value]) => window.researchAppHarness[method](value), [method, value]);
const toggle = page.getByRole('button', { name: 'Toggle Research mode', exact: true });
try {
  await page.goto('http://127.0.0.1:5193/?fullApp=1');
  await toggle.waitFor();
  await page.waitForFunction(() => window.researchAppHarness.state().mode === 'ready');
  await page.getByRole('button', { name: 'Research sessions', exact: true }).click();
  await page.getByRole('dialog').waitFor();
  assert.equal(await page.getByRole('button', { name: /Project A.*Current session/ }).isDisabled(), true);
  // All six are discovered through the list, without hydrating five agents.
  assert.equal(await page.getByRole('dialog').getByRole('button', { name: /Project [A-F].*Ready/ }).count(), 6);
  const other = page.getByRole('button', { name: /Project B.*Ready/ });
  await other.waitFor();
  await call('backgroundWork');
  await page.getByRole('dialog').getByRole('button', { name: /Project F updated/ }).waitFor();
  assert.equal((await page.evaluate(() => window.researchAppHarness.calls)).filter(c => c.overviewRead === 'session-f').length, 1);
  await page.screenshot({ path: join(out, 'session-picker.png') });
  assert.deepEqual((await page.evaluate(() => window.researchAppHarness.calls)).filter(c => c.researchRead).map(c => c.researchRead), ['session-a']);
  await other.click();
  await page.waitForFunction(() => window.researchAppHarness.activeSession() === 'session-b' && !window.researchAppHarness.state().loading);
  await page.waitForFunction(() => window.researchAppHarness.state().mode === 'ready');
  assert.ok(page.url().includes('/sessions/session-b'));
  assert.match(await page.locator('.panes').innerText(), /Conversation for session-b/);
  assert.equal(await page.getByRole('dialog').count(), 0);
  // Navigation itself issues no Research commands on any session.
  assert.deepEqual((await page.evaluate(() => window.researchAppHarness.calls)).filter(c => c.command), []);
  await page.screenshot({ path: join(out, 'research-on.png') });
  const draft = page.locator('.chat-dock textarea');
  await draft.fill('Keep this unsent research question');
  await toggle.click();
  await page.waitForFunction(() => window.researchAppHarness.state().mode === 'inactive');
  await page.waitForFunction(() => !document.querySelector('button[aria-label="Toggle Research mode"]').disabled);
  assert.equal(await toggle.getAttribute('aria-pressed'), 'false');
  assert.equal(await page.locator('html').getAttribute('data-research-workspace'), null);
  await page.screenshot({ path: join(out, 'research-off.png') });
  await toggle.click();
  await page.waitForFunction(() => window.researchAppHarness.state().mode === 'ready');
  await page.waitForFunction(() => !document.querySelector('button[aria-label="Toggle Research mode"]').disabled);
  assert.equal(await toggle.getAttribute('aria-pressed'), 'true');
  assert.equal(await draft.inputValue(), 'Keep this unsent research question');
  await call('failCommand', true);
  await toggle.click();
  await page.getByText('Operation failed', { exact: true }).waitFor();
  await page.getByRole('button', { name: 'Show details', exact: true }).click();
  await page.getByText('Fixture command rejected', { exact: false }).first().waitFor();
  assert.equal(await toggle.getAttribute('aria-pressed'), 'true', 'A rejected exit leaves the actual mode on');
  const commands = (await page.evaluate(() => window.researchAppHarness.calls)).filter(c => c.command);
  assert.deepEqual(commands.map(c => [c.id, c.command.kind]), [
    ['session-b', 'exit_mode'], ['session-b', 'enter_mode'], ['session-b', 'exit_mode'],
  ]);
  await page.locator('.ui-toast__close').click();
  // Select a now-observed session through the real navigation path on mobile.
  await call('locale', 'zh');
  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByRole('button', { name: '研究会话', exact: true }).click();
  await page.screenshot({ path: join(out, 'mobile-sessions.png') });
  await page.getByRole('button', { name: /Project A.*就绪/ }).click();
  await page.waitForFunction(() => window.researchAppHarness.activeSession() === 'session-a' && !window.researchAppHarness.state().loading);
  assert.ok(page.url().includes('/sessions/session-a'));
  assert.match(await page.locator('.panes').innerText(), /Conversation for session-a/);
  await page.getByRole('button', { name: '切换 Research 模式', exact: true }).waitFor();
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth === innerWidth), true);
  await page.screenshot({ path: join(out, 'mobile-research.png') });
  assert.deepEqual(errors, []);
  await writeFile(join(out, 'report.json'), JSON.stringify({ passed: true, commands, errors }, null, 2));
  console.log(`Full App Research checks passed: ${out}`);
} catch (error) {
  console.log('Visible page:', (await page.locator('body').innerText()).slice(-3000));
  console.log('Browser errors:', errors);
  console.log('Client state:', await page.evaluate(() => ({ state: window.researchAppHarness?.state(), calls: window.researchAppHarness?.calls })));
  throw error;
} finally { await browser.close(); }
