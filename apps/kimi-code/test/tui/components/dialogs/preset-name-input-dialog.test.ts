import { visibleWidth } from '@moonshot-ai/pi-tui';
import { describe, expect, it } from 'vitest';

import {
  PresetNameInputDialogComponent,
  type PresetNameInputResult,
} from '#/tui/components/dialogs/preset-name-input-dialog';

const ESC = String.fromCodePoint(27);
const ANSI_RE = /\u001B\[[0-9;]*m/g;

function stripAnsi(text: string): string {
  return text.replaceAll(ANSI_RE, '');
}

function makeDialog(existingNames: readonly string[] = []): {
  dialog: PresetNameInputDialogComponent;
  collected: PresetNameInputResult[];
} {
  const collected: PresetNameInputResult[] = [];
  const dialog = new PresetNameInputDialogComponent(existingNames, (result) => {
    collected.push(result);
  });
  dialog.focused = true;
  return { dialog, collected };
}

function type(dialog: PresetNameInputDialogComponent, value: string): void {
  for (const character of value) dialog.handleInput(character);
}

describe('PresetNameInputDialogComponent', () => {
  it('renders the creation prompt and stays within narrow widths', () => {
    const { dialog } = makeDialog();
    const text = stripAnsi(dialog.render(60).join('\n'));

    expect(text).toContain('Create agent preset');
    expect(text).toContain('Name this preset');
    expect(text).toContain('Enter submit · Esc cancel');
    expect(text).toContain('╭');
    expect(text).toContain('╯');

    for (const width of [39, 20, 10, 4]) {
      for (const line of dialog.render(width)) {
        expect(visibleWidth(line)).toBeLessThanOrEqual(width);
      }
    }
  });

  it('submits a trimmed preset name', () => {
    const { dialog, collected } = makeDialog();
    type(dialog, '  physics  ');
    dialog.handleInput('\r');

    expect(collected).toEqual([{ kind: 'ok', value: 'physics' }]);
  });

  it('keeps the dialog open for empty, duplicate, and reserved names', () => {
    const empty = makeDialog();
    empty.dialog.handleInput('\r');
    expect(empty.collected).toEqual([]);
    expect(stripAnsi(empty.dialog.render(60).join('\n'))).toContain(
      'Preset name cannot be empty.',
    );

    const duplicate = makeDialog(['fast']);
    type(duplicate.dialog, 'fast');
    duplicate.dialog.handleInput('\r');
    expect(duplicate.collected).toEqual([]);
    expect(stripAnsi(duplicate.dialog.render(60).join('\n'))).toContain(
      'Preset "fast" already exists.',
    );

    const reserved = makeDialog();
    type(reserved.dialog, 'status');
    reserved.dialog.handleInput('\r');
    expect(reserved.collected).toEqual([]);
    expect(stripAnsi(reserved.dialog.render(60).join('\n'))).toContain(
      'conflicts with a /preset command.',
    );
  });

  it('cancels with Esc and only completes once', () => {
    const cancelled = makeDialog();
    cancelled.dialog.handleInput(ESC);
    cancelled.dialog.handleInput(ESC);
    expect(cancelled.collected).toEqual([{ kind: 'cancel' }]);

    const submitted = makeDialog();
    type(submitted.dialog, 'fast');
    submitted.dialog.handleInput('\r');
    submitted.dialog.handleInput('\r');
    submitted.dialog.handleInput(ESC);
    expect(submitted.collected).toEqual([{ kind: 'ok', value: 'fast' }]);
  });
});
