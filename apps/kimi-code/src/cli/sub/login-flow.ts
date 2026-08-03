/**
 * Shared Kimi-for-Coding device-code login flow used by both `hakimi login`
 * and `hakimi acp --login`. Exiting the process is part of the contract:
 * callers MUST treat the returned promise as `Promise<never>`.
 */

import { createKimiHarness } from '@moonshot-ai/kimi-code-sdk';
import { OPENAI_CODEX_PROVIDER_NAME } from '@moonshot-ai/kimi-code-oauth';

import { createKimiCodeHostIdentity } from '#/cli/version';
import { openUrl } from '#/utils/open-url';

export interface LoginFlowOptions {
  readonly enableExperimental?: boolean;
  readonly openBrowser?: boolean;
}

export async function runLoginFlow(
  requestedProvider = 'kimi-code',
  options: LoginFlowOptions = {},
): Promise<never> {
  const identity = createKimiCodeHostIdentity();
  const harness = createKimiHarness({
    identity,
    uiMode: 'cli',
  });
  const normalizedProvider = requestedProvider.trim().toLowerCase();
  const openAICodex =
    normalizedProvider === 'openai-codex' || normalizedProvider === 'chatgpt';
  if (!openAICodex && normalizedProvider !== 'kimi-code' && normalizedProvider !== 'kimi') {
    process.stderr.write(
      `Unknown login provider "${requestedProvider}". Use "kimi-code" or "openai-codex".\n`,
    );
    process.exit(1);
  }
  if (openAICodex) {
    if (options.enableExperimental === true) {
      try {
        await harness.ensureConfigFile();
        await harness.setConfig({
          experimental: { 'openai-codex-oauth': true },
        });
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        process.stderr.write(`Could not enable ChatGPT OAuth: ${message}\n`);
        process.exit(1);
      }
    }
    const features = await harness.getExperimentalFeatures();
    const enabled = features.some(
      (feature) => feature.id === 'openai-codex-oauth' && feature.enabled,
    );
    if (!enabled) {
      process.stderr.write(
        [
          'ChatGPT / OpenAI Codex OAuth is experimental and currently disabled.',
          'Enable it in config.toml with:',
          '[experimental]',
          'openai-codex-oauth = true',
          'Or run: hakimi login --provider openai-codex --enable-experimental',
          '',
        ].join('\n'),
      );
      process.exit(1);
    }
  }
  const providerName = openAICodex ? OPENAI_CODEX_PROVIDER_NAME : undefined;
  const providerLabel = openAICodex ? 'ChatGPT / OpenAI Codex' : 'Kimi-for-Coding';
  const controller = new AbortController();
  process.once('SIGINT', () => {
    controller.abort();
  });
  try {
    const result = await harness.auth.login(providerName, {
      signal: controller.signal,
      onDeviceCode: (data) => {
        const url = data.verificationUriComplete || data.verificationUri;
        // Print the manual fallback before attempting to open the user's
        // browser so headless/browser-opener failures never hide the URL
        // and code needed to complete login.
        process.stderr.write(
          [
            '',
            options.openBrowser === false
              ? `Open this URL for Hakimi ${providerLabel} login: ${url}`
              : `Opening browser for Hakimi ${providerLabel} login: ${url}`,
            `If the browser did not open, paste the URL above and enter code: ${data.userCode}`,
            data.expiresIn !== null && data.expiresIn !== undefined
              ? `Code expires in ${data.expiresIn}s.`
              : undefined,
            'Waiting for authorization to complete...',
            '',
          ]
            .filter((line): line is string => line !== undefined)
            .join('\n'),
        );
        if (options.openBrowser !== false) {
          try {
            openUrl(url);
          } catch {
            // Best effort only: the manual fallback has already been printed.
          }
        }
      },
    });
    process.stderr.write(
      `Logged in to ${providerLabel}. Hakimi model config was provisioned via ${result.providerName}.\n`,
    );
    process.exit(0);
  } catch (error) {
    if (controller.signal.aborted) {
      process.stderr.write('Login cancelled.\n');
    } else {
      const message = error instanceof Error ? error.message : String(error);
      process.stderr.write(`Login failed: ${message}\n`);
    }
    process.exit(1);
  }
}
