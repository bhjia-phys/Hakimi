import { Text, visibleWidth } from '@moonshot-ai/pi-tui';
import { describe, expect, it } from 'vitest';

import { ActivityPaneComponent } from '#/tui/components/panes/activity-pane';

function createMockSpinner(initialText = 'working') {
  const spinner = new Text(initialText, 0, 0);
  let tip = '';
  let availableWidth = 0;
  const update = () => {
    const fullText = initialText + tip;
    spinner.setText(availableWidth > 0 && visibleWidth(fullText) > availableWidth ? initialText : fullText);
  };
  return {
    spinner: Object.assign(spinner, {
      setTip(value: string) {
        tip = value;
        update();
      },
      setAvailableWidth(width: number) {
        availableWidth = width;
        update();
      },
    }) as unknown as import('#/tui/components/chrome/moon-loader').MoonLoader,
    getTip: () => tip,
  };
}

describe('ActivityPaneComponent', () => {
  it('renders waiting loader after a spacer', () => {
    const { spinner } = createMockSpinner('loading');
    const component = new ActivityPaneComponent({
      mode: 'waiting',
      spinner,
    });

    expect(component.render(80).map((line) => line.trimEnd())).toEqual(['', 'loading']);
  });

  it('renders composing spinner after a spacer', () => {
    const { spinner } = createMockSpinner('working');
    const component = new ActivityPaneComponent({
      mode: 'composing',
      spinner,
    });

    expect(component.render(80).map((line) => line.trimEnd())).toEqual(['', 'working']);
  });

  it('renders the detail line under the waiting spinner', () => {
    const { spinner } = createMockSpinner('working');
    const component = new ActivityPaneComponent({
      mode: 'waiting',
      spinner,
      detail: '429 · rate limited',
    });

    const lines = component
      .render(80)
      .map((line) => line.replaceAll(/\u001B\[[0-9;]*m/g, '').trimEnd());
    expect(lines).toEqual(['', 'working', '    429 · rate limited']);
  });

  it.each(['waiting', 'tool', 'composing'] as const)(
    'renders %s spinner with tip after a spacer',
    (mode) => {
      const { spinner } = createMockSpinner('working');
      const component = new ActivityPaneComponent({
        mode,
        spinner,
        tip: 'ctrl+s: steer mid-turn',
      });

      expect(component.render(80).map((line) => line.trimEnd())).toEqual([
        '',
        'working · Tip: ctrl+s: steer mid-turn',
      ]);
    },
  );

  it.each(['waiting', 'tool', 'composing'] as const)(
    'does not render a tip for %s when none is provided',
    (mode) => {
      const { spinner } = createMockSpinner('working');
      const component = new ActivityPaneComponent({
        mode,
        spinner,
      });

      expect(component.render(80).map((line) => line.trimEnd())).toEqual(['', 'working']);
    },
  );

  it('renders nothing for hidden and inactive thinking modes', () => {
    expect(new ActivityPaneComponent({ mode: 'hidden' }).render(80)).toEqual([]);
    expect(new ActivityPaneComponent({ mode: 'thinking' }).render(80)).toEqual([]);
  });

  it('renders live progress without a second spinner in thinking mode', () => {
    const component = new ActivityPaneComponent({
      mode: 'thinking',
      progress: () => ({
        percent: 35,
        elapsedSeconds: 18,
        toolCallCount: 1,
        animationFrame: 2,
      }),
    });

    const lines = component
      .render(80)
      .map((line) => line.replaceAll(/\u001B\[[0-9;]*m/g, '').trimEnd());
    expect(lines).toHaveLength(1);
    expect(lines[0]).toContain('≈35% · 18s · 1 tool');
  });

  it.each(['waiting', 'tool', 'composing'] as const)(
    'hides the tip for %s when the terminal is too narrow',
    (mode) => {
      const { spinner } = createMockSpinner('working');
      const component = new ActivityPaneComponent({
        mode,
        spinner,
        tip: 'ctrl+s: steer mid-turn',
      });

      // Width 8 is exactly the width of "working" (no spinner frame in the mock).
      expect(component.render(8).map((line) => line.trimEnd())).toEqual(['', 'working']);
    },
  );

  it('renders live progress without rebuilding the spinner row', () => {
    const { spinner } = createMockSpinner('working');
    let progress:
      | {
          percent: number;
          elapsedSeconds: number;
          toolCallCount: number;
          animationFrame: number;
        }
      | undefined;
    const component = new ActivityPaneComponent({
      mode: 'waiting',
      spinner,
      progress: () => progress,
    });

    expect(component.render(80).map((line) => line.trimEnd())).toEqual(['', 'working']);

    progress = { percent: 42, elapsedSeconds: 12, toolCallCount: 2, animationFrame: 0 };
    const first = component
      .render(80)
      .map((line) => line.replaceAll(/\u001B\[[0-9;]*m/g, '').trimEnd());
    expect(first[1]).toBe('working');
    expect(first[2]).toContain('≈42% · 12s · 2 tools');

    progress = { ...progress, animationFrame: 1 };
    const second = component
      .render(80)
      .map((line) => line.replaceAll(/\u001B\[[0-9;]*m/g, '').trimEnd());
    expect(second[1]).toBe('working');
    expect(second[2]).not.toBe(first[2]);
  });

  it('drops the bar and tool count at narrow widths', () => {
    const { spinner } = createMockSpinner('working');
    const component = new ActivityPaneComponent({
      mode: 'tool',
      spinner,
      progress: () => ({
        percent: 42,
        elapsedSeconds: 12,
        toolCallCount: 2,
        animationFrame: 0,
      }),
    });

    const progressLine = component
      .render(10)
      .at(-1)!
      .replaceAll(/\u001B\[[0-9;]*m/g, '')
      .trimEnd();
    expect(progressLine).toContain('≈42%');
    expect(progressLine).not.toContain('[');
    expect(progressLine).not.toContain('tools');
    expect(visibleWidth(progressLine)).toBeLessThanOrEqual(10);
  });

  it('never renders a partial percentage in extremely narrow terminals', () => {
    const { spinner } = createMockSpinner('working');
    const component = new ActivityPaneComponent({
      mode: 'tool',
      spinner,
      progress: () => ({
        percent: 42,
        elapsedSeconds: 12,
        toolCallCount: 2,
        animationFrame: 0,
      }),
    });

    for (const width of [1, 2, 3]) {
      const rendered = component
        .render(width)
        .map((line) => line.replaceAll(/\u001B\[[0-9;]*m/g, '').trimEnd());
      expect(rendered.some((line) => line.includes('≈'))).toBe(false);
    }
    for (const width of [4, 5]) {
      const progressLine = component
        .render(width)
        .map((line) => line.replaceAll(/\u001B\[[0-9;]*m/g, '').trimEnd())
        .find((line) => line.includes('≈'));
      expect(progressLine?.trim()).toBe('≈42%');
    }
  });
});
