import { OPEN_PLATFORMS } from '@moonshot-ai/kimi-code-oauth';

import { ChoicePickerComponent, type ChoiceOption } from './choice-picker';

const KIMI_CODE_OPTION: ChoiceOption = {
  value: 'kimi-code',
  label: 'Kimi for Coding (OAuth)',
  description: 'Use `hakimi login` / `/login` to provision kimi-code/kimi-for-coding.',
};

const OPENAI_CODEX_OPTION: ChoiceOption = {
  value: 'openai-codex',
  label: 'ChatGPT / OpenAI Codex (OAuth)',
  description: 'Use a ChatGPT subscription through the experimental Codex device login.',
};

const OPEN_PLATFORM_OPTIONS: readonly ChoiceOption[] = OPEN_PLATFORMS.map((platform) => ({
  value: platform.id,
  label: platform.name,
}));

const PLATFORM_OPTIONS: readonly ChoiceOption[] = [
  KIMI_CODE_OPTION,
  ...OPEN_PLATFORM_OPTIONS,
];

export interface PlatformSelectorOptions {
  readonly includeOpenAICodex?: boolean | undefined;
  readonly onSelect: (platformId: string) => void;
  readonly onCancel: () => void;
}

export class PlatformSelectorComponent extends ChoicePickerComponent {
  constructor(opts: PlatformSelectorOptions) {
    super({
      title: 'Select a platform',
      options:
        opts.includeOpenAICodex === true
          ? [KIMI_CODE_OPTION, OPENAI_CODEX_OPTION, ...OPEN_PLATFORM_OPTIONS]
          : [...PLATFORM_OPTIONS],
      onSelect: opts.onSelect,
      onCancel: opts.onCancel,
    });
  }
}
