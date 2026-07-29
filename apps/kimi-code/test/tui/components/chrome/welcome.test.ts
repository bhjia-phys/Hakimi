import { visibleWidth } from '@moonshot-ai/pi-tui';
import chalk from 'chalk';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { WelcomeComponent } from '#/tui/components/chrome/welcome';
import { setRainbowDance, type RainbowDanceController } from '#/tui/easter-eggs/dance';
import type { AppState } from '#/tui/types';

const TRUECOLOR_PATTERN = /\u001B\[38;2;(\d+);(\d+);(\d+)m/g;
const ANSI_PATTERN = /\u001B\[[0-9;]*m/g;

const appState: AppState = {
  version: '1.2.3',
  workDir: '/tmp/project',
  additionalDirs: [],
  sessionId: 'ses-1',
  sessionTitle: null,
  model: 'kimi-k2',
  permissionMode: 'manual',
  thinkingEffort: 'off',
  contextUsage: 0,
  contextTokens: 0,
  maxContextTokens: 0,
  isCompacting: false,
  isReplaying: false,
  streamingPhase: 'idle',
  streamingStartTime: 0,
  planMode: false,
  inputMode: 'prompt',
  swarmMode: false,
  theme: 'dark',
  editorCommand: null,
  notifications: { enabled: true, condition: 'unfocused' },
  upgrade: { autoInstall: true },
  availableModels: {},
  availableProviders: {},
  mcpServersSummary: null,
};

function truecolorCodes(text: string): Set<string> {
  const codes = new Set<string>();
  for (const match of text.matchAll(TRUECOLOR_PATTERN)) {
    codes.add(`${match[1]},${match[2]},${match[3]}`);
  }
  return codes;
}

function headerOf(lines: string[]): string {
  return lines.slice(3, 18).join('\n');
}

function plain(text: string): string {
  return text.replace(ANSI_PATTERN, '');
}

function setDanceView(colored: boolean, phase: number): void {
  const dance: RainbowDanceController = {
    colored,
    phase,
    start: () => {},
    stop: () => {},
    dispose: () => {},
  };
  setRainbowDance(dance);
}

describe('WelcomeComponent', () => {
  const previousChalkLevel = chalk.level;

  beforeEach(() => {
    chalk.level = 3;
  });

  afterEach(() => {
    chalk.level = previousChalkLevel;
    setRainbowDance(undefined);
  });

  it('renders the Hakimi physics research banner', () => {
    const text = plain(new WelcomeComponent(appState).render(96).join('\n'));

    expect(text).toContain('Hakimi');
    expect(text).toContain('truth-seeking physics research agent');
    expect(text).toContain('Welcome, researcher.');
    expect(text).toContain('Ready to explore the frontiers of physics knowledge.');
  });

  it('renders the detailed pixel ship with multiple colors by default', () => {
    const header = headerOf(new WelcomeComponent(appState).render(96));
    const codes = truecolorCodes(header);

    expect(codes.size).toBeGreaterThanOrEqual(6);
  });

  it('keeps the high-detail pixel ship instead of an ASCII line drawing', () => {
    const output = plain(new WelcomeComponent(appState).render(120).join('\n'));
    const fullBlock = String.fromCodePoint(0x2588);
    const pixelLines = output.split('\n').filter((line) => line.includes(fullBlock));
    const blockCount = Array.from(output).filter((char) => char === fullBlock).length;

    expect(pixelLines.length).toBeGreaterThanOrEqual(20);
    expect(blockCount).toBeGreaterThanOrEqual(250);
    expect(output).not.toContain('/\\');
    expect(output).not.toContain('[==]');
    expect(output).not.toContain('===>');
  });

  it('paints the banner in rainbow while colored', () => {
    setDanceView(true, 0);
    const codes = truecolorCodes(headerOf(new WelcomeComponent(appState).render(96)));

    expect(codes.size).toBeGreaterThanOrEqual(5);
  });

  it('renders exactly the default banner when not colored', () => {
    const base = headerOf(new WelcomeComponent(appState).render(96));
    setDanceView(false, 5);
    const off = headerOf(new WelcomeComponent(appState).render(96));

    expect(off).toBe(base);
  });

  it('keeps every line within the requested width on narrow terminals', () => {
    for (const width of [0, 1, 2, 4, 10, 39, 80]) {
      for (const line of new WelcomeComponent(appState).render(width)) {
        expect(visibleWidth(line)).toBeLessThanOrEqual(width);
      }
    }
  });
});
