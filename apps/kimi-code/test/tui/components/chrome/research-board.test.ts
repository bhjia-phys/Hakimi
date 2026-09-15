// Scenario: Research Board memory-mode contract.
// Responsibility: the board shows only the mode state, a short purpose hint,
// and the read-only history note — never legacy executor state.
// Wiring: render the public TUI component from protocol-shaped mode snapshots.
// Run: pnpm --filter @bhjia-phys/hakimi exec vitest run test/tui/components/chrome/research-board.test.ts

import { describe, expect, it } from 'vitest';
import { visibleWidth } from '@moonshot-ai/pi-tui';

import { ResearchBoardComponent } from '#/tui/components/chrome/research-board';
import type { ResearchModeSnapshot } from '@bhjia-phys/hakimi-sdk';

function stripAnsi(text: string): string {
  return text.replaceAll(/\u001B\[[0-9;]*m/g, '');
}

function makeSnapshot(
  overrides: Partial<ResearchModeSnapshot> = {},
): ResearchModeSnapshot {
  return {
    enabled: true,
    skillsAvailable: true,
    ...overrides,
  };
}

describe('ResearchBoardComponent', () => {
  it('is hidden without a snapshot or when the mode is disabled', () => {
    const board = new ResearchBoardComponent();
    expect(board.isVisible()).toBe(false);
    expect(board.render(80)).toEqual([]);

    board.setSnapshot(makeSnapshot({ enabled: false }));
    expect(board.isVisible()).toBe(false);
    expect(board.render(80)).toEqual([]);
  });

  it('renders the on-state header and skill availability when enabled', () => {
    const board = new ResearchBoardComponent();
    board.setSnapshot(makeSnapshot());
    expect(board.isVisible()).toBe(true);

    const lines = board.render(100).map(stripAnsi);
    expect(lines[1]).toContain('Research');
    expect(lines[1]).toContain('on');
    expect(lines[1]).toContain('AITP Skills visible');
    // Collapsed hint: knowledge/memory guidance, no legacy executor state.
    expect(lines[2]).toContain('Knowledge in plain files');
    expect(lines.join('\n')).not.toContain('loop');
    expect(lines.join('\n')).not.toContain('checkpoint');
  });

  it('warns when the official AITP Skills are unavailable', () => {
    const board = new ResearchBoardComponent();
    board.setSnapshot(makeSnapshot({ skillsAvailable: false }));
    const lines = board.render(100).map(stripAnsi);
    expect(lines[1]).toContain('AITP Skills unavailable');
  });

  it('expanded mode spells out purpose, knowledge, memory, and read-only history', () => {
    const board = new ResearchBoardComponent();
    board.setSnapshot(makeSnapshot());
    board.setExpanded(true);

    const text = board.render(100).map(stripAnsi).join('\n');
    expect(text).toContain('Purpose:');
    expect(text).toContain('Knowledge:');
    expect(text).toContain('Memory:');
    expect(text).toContain('History:');
    expect(text).toContain('read-only');
    expect(text).toMatch(/never\s+resume\s+automatically/);
  });

  it('truncates the collapsed hint to the render width', () => {
    const board = new ResearchBoardComponent();
    board.setSnapshot(makeSnapshot());
    for (const line of board.render(40)) {
      expect(visibleWidth(line)).toBeLessThanOrEqual(40);
    }
  });

  it('keeps the Todo projection across snapshot updates and clear', () => {
    const board = new ResearchBoardComponent();
    board.setTodos([{ title: 'Task 1', status: 'pending' }]);
    board.setSnapshot(makeSnapshot());
    expect(board.getTodos()).toEqual([{ title: 'Task 1', status: 'pending' }]);
    board.setSnapshot(makeSnapshot({ enabled: false }));
    expect(board.getTodos()).toEqual([{ title: 'Task 1', status: 'pending' }]);
    board.clear();
    expect(board.getSnapshot()).toBeNull();
    expect(board.isVisible()).toBe(false);
  });
});
