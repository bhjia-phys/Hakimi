import { describe, expect, it, vi } from 'vitest';

import { PlatformSelectorComponent } from '#/tui/components/dialogs/platform-selector';

const ANSI_SGR = /\x1b\[[0-9;]*m/g;

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
  });
});
