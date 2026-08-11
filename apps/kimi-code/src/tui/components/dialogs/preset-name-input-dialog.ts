import {
  Container,
  Input,
  Key,
  matchesKey,
  truncateToWidth,
  visibleWidth,
  type Focusable,
} from '@moonshot-ai/pi-tui';

import { currentTheme } from '#/tui/theme';

export type PresetNameInputResult =
  | { readonly kind: 'ok'; readonly value: string }
  | { readonly kind: 'cancel' };

const TITLE = 'Create agent preset';
const SUBTITLE = 'Name this preset, then configure its agent model routes.';
const FOOTER = 'Enter submit · Esc cancel';

export class PresetNameInputDialogComponent extends Container implements Focusable {
  focused = false;

  private readonly input = new Input();
  private readonly existingNames: ReadonlySet<string>;
  private readonly onDone: (result: PresetNameInputResult) => void;
  private done = false;
  private validationMessage: string | undefined;

  constructor(
    existingNames: readonly string[],
    onDone: (result: PresetNameInputResult) => void,
  ) {
    super();
    this.existingNames = new Set(existingNames);
    this.onDone = onDone;
    this.input.onSubmit = (value) => {
      this.submit(value);
    };
  }

  handleInput(data: string): void {
    if (this.done) return;
    if (
      matchesKey(data, Key.escape) ||
      matchesKey(data, Key.ctrl('c')) ||
      matchesKey(data, Key.ctrl('d'))
    ) {
      this.cancel();
      return;
    }
    this.validationMessage = undefined;
    this.input.handleInput(data);
  }

  override invalidate(): void {
    super.invalidate();
    this.input.invalidate();
  }

  override render(width: number): string[] {
    this.input.focused = this.focused && !this.done;

    const safeWidth = Math.max(0, width);
    if (safeWidth <= 0) return [''];
    const innerWidth = Math.max(1, safeWidth - 4);
    const pad = '  ';

    const border = (text: string): string => currentTheme.fg('primary', text);
    const titleLine = truncateToWidth(
      currentTheme.boldFg('textStrong', TITLE),
      innerWidth,
      '…',
    );
    const subtitleLine = truncateToWidth(
      currentTheme.fg(
        this.validationMessage === undefined ? 'textDim' : 'error',
        this.validationMessage ?? SUBTITLE,
      ),
      innerWidth,
      '…',
    );
    const footerLine = truncateToWidth(
      currentTheme.fg('textDim', FOOTER),
      innerWidth,
      '…',
    );
    const inputLine = this.input.render(innerWidth)[0] ?? '> ';
    const contentLines = [titleLine, '', subtitleLine, '', inputLine, '', footerLine];

    if (safeWidth < 4) {
      return ['', ...contentLines.map((line) => truncateToWidth(line, safeWidth, '…'))];
    }

    const lines: string[] = [
      '',
      border('╭' + '─'.repeat(safeWidth - 2) + '╮'),
      border('│') + ' '.repeat(safeWidth - 2) + border('│'),
    ];
    for (const content of contentLines) {
      const rightPad = Math.max(0, innerWidth - visibleWidth(content));
      lines.push(border('│') + pad + content + ' '.repeat(rightPad) + border('│'));
    }
    lines.push(border('│') + ' '.repeat(safeWidth - 2) + border('│'));
    lines.push(border('╰' + '─'.repeat(safeWidth - 2) + '╯'));
    lines.push('');

    return lines.map((line) => truncateToWidth(line, safeWidth, '…'));
  }

  private submit(value: string): void {
    if (this.done) return;
    const name = value.trim();
    const validationMessage = validatePresetName(name, this.existingNames);
    if (validationMessage !== undefined) {
      this.validationMessage = validationMessage;
      return;
    }
    this.done = true;
    this.onDone({ kind: 'ok', value: name });
  }

  private cancel(): void {
    if (this.done) return;
    this.done = true;
    this.onDone({ kind: 'cancel' });
  }
}

function validatePresetName(
  name: string,
  existingNames: ReadonlySet<string>,
): string | undefined {
  if (name.length === 0) return 'Preset name cannot be empty.';
  if (existingNames.has(name)) return `Preset "${name}" already exists.`;
  if (
    name.toLowerCase() === 'off' ||
    name.toLowerCase() === 'status' ||
    /^edit\s+/i.test(name)
  ) {
    return `Preset name "${name}" conflicts with a /preset command.`;
  }
  return undefined;
}
