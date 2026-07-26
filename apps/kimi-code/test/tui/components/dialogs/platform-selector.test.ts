import { describe, expect, it, vi } from 'vitest';

import { PlatformSelectorComponent } from '#/tui/components/dialogs/platform-selector';

const ANSI_SGR = /\u001B\[[0-9;]*m/g;

function strip(text: string): string {
  return text.replaceAll(ANSI_SGR, '');
}

describe('PlatformSelectorComponent', () => {
  it('labels the managed OAuth path as Kimi for Coding for Hakimi users', () => {
    const selector = new PlatformSelectorComponent({
      onSelect: vi.fn(),
      onCancel: vi.fn(),
    });

    const output = selector.render(120).map(strip).join('\n');

    expect(output).toContain('Kimi for Coding (OAuth)');
    expect(output).toContain('kimi-code/kimi-for-coding');
    expect(output).not.toContain('Kimi Platform (OAuth)');
    expect(output).not.toContain('ChatGPT / OpenAI Codex');
  });

  it('shows the experimental ChatGPT OAuth path only when requested by the host', () => {
    const selector = new PlatformSelectorComponent({
      includeOpenAICodex: true,
      onSelect: vi.fn(),
      onCancel: vi.fn(),
    });

    const output = selector.render(120).map(strip).join('\n');

    expect(output).toContain('ChatGPT / OpenAI Codex (OAuth)');
    expect(output).toContain('ChatGPT subscription');
  });
});
