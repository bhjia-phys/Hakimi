import type { AutocompleteItem, SlashCommand } from '@moonshot-ai/pi-tui';

export type SlashCommandAvailability = 'always' | 'idle-only';

export interface KimiSlashCommand<Name extends string = string> extends SlashCommand {
  readonly name: Name;
  readonly aliases: readonly string[];
  readonly description: string;
  readonly priority?: number;
  readonly availability?: SlashCommandAvailability | ((args: string) => SlashCommandAvailability);
  /** Hidden commands remain resolvable for compatibility but stay out of public command lists. */
  readonly hidden?: boolean;
  /** When set, the command is omitted unless this flag is enabled. Accepts any
   *  string so v2-engine flags (registered dynamically via
   *  `registerFlagDefinition`, e.g. `aitp_research_mode`) can gate commands
   *  without a static `FlagId` entry in the v1 catalog. */
  readonly experimentalFlag?: string;
  /**
   * Generic argument autocompletion. `argumentPrefix` is the text typed after
   * `/<command> `; return suggestions or `null`. Declared as a plain function
   * property (not a method) so passing it around is `this`-free. Adapted to
   * pi-tui's `getArgumentCompletions` in the autocomplete setup.
   */
  readonly completeArgs?: (argumentPrefix: string) => AutocompleteItem[] | null;
}

export interface ParsedSlashInput {
  readonly name: string;
  readonly args: string;
}

export type SlashCommandBusyReason = 'streaming' | 'compacting';

export type SlashCommandInvalidReason = 'unknown';
