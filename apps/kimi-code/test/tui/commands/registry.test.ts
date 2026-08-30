import {
  BUILTIN_SLASH_COMMANDS,
  findBuiltInSlashCommand,
  parseSlashInput,
  presetArgumentCompletions,
  researchArgumentCompletions,
  resolveSlashCommandAvailability,
  addDirArgumentCompletions,
  sortSlashCommands,
  swarmArgumentCompletions,
  type KimiSlashCommand,
} from '#/tui/commands/index';
import { describe, expect, it } from 'vitest';

describe('parseSlashInput', () => {
  it('parses command names and trimmed args', () => {
    expect(parseSlashInput('/help')).toEqual({ name: 'help', args: '' });
    expect(parseSlashInput('/model   kimi-k2  ')).toEqual({
      name: 'model',
      args: 'kimi-k2',
    });
  });

  it('returns null for non-commands and path-like input', () => {
    expect(parseSlashInput('hello')).toBeNull();
    expect(parseSlashInput('/')).toBeNull();
    expect(parseSlashInput('/   ')).toBeNull();
    expect(parseSlashInput('/some/path')).toBeNull();
    expect(parseSlashInput('/some/path with args')).toBeNull();
  });
});

describe('built-in slash command registry', () => {
  it('finds built-ins by name or alias', () => {
    expect(findBuiltInSlashCommand('exit')?.name).toBe('exit');
    expect(findBuiltInSlashCommand('quit')?.name).toBe('exit');
    expect(findBuiltInSlashCommand('q')?.name).toBe('exit');
    expect(findBuiltInSlashCommand('clear')?.name).toBe('new');
    expect(findBuiltInSlashCommand('bug')?.name).toBe('feedback');
    expect(findBuiltInSlashCommand('btw')?.name).toBe('btw');
    expect(findBuiltInSlashCommand('mcp')?.name).toBe('mcp');
    expect(findBuiltInSlashCommand('status')?.name).toBe('status');
    expect(findBuiltInSlashCommand('usage')?.aliases).not.toContain('status');
    expect(findBuiltInSlashCommand('unknown')).toBeUndefined();
  });

  it('marks plan clear as idle-only while normal plan toggles are always available', () => {
    const plan = findBuiltInSlashCommand('plan');
    expect(plan).toBeDefined();
    expect(resolveSlashCommandAvailability(plan!, '')).toBe('always');
    expect(resolveSlashCommandAvailability(plan!, 'on')).toBe('always');
    expect(resolveSlashCommandAvailability(plan!, 'clear')).toBe('idle-only');
  });

  it('keeps swarm mode changes and swarm tasks idle-only', () => {
    const swarm = findBuiltInSlashCommand('swarm');
    expect(swarm).toBeDefined();
    expect((swarm as KimiSlashCommand).experimentalFlag).toBeUndefined();
    expect(resolveSlashCommandAvailability(swarm!, 'on')).toBe('idle-only');
    expect(resolveSlashCommandAvailability(swarm!, 'off')).toBe('idle-only');
    expect(resolveSlashCommandAvailability(swarm!, 'Ship feature X')).toBe('idle-only');
  });

  it('offers swarm subcommand argument completions', () => {
    const values = (prefix: string): string[] | null => {
      const items = swarmArgumentCompletions(prefix);
      return items === null ? null : items.map((item) => item.value);
    };

    expect(values('')).toEqual(['on', 'off']);
    expect(values('O')).toEqual(['on', 'off']);
    expect(swarmArgumentCompletions('of')).toEqual([
      { value: 'off', label: 'off', description: 'Turn swarm mode off' },
    ]);
    expect(values('on')).toBeNull();
    expect(values('off')).toBeNull();
    expect(values('Ship feature X')).toBeNull();
  });

  it('keeps preset configuration idle-only while status stays available', () => {
    const preset = findBuiltInSlashCommand('preset');
    expect(preset).toBeDefined();
    expect(resolveSlashCommandAvailability(preset!, '')).toBe('idle-only');
    expect(resolveSlashCommandAvailability(preset!, 'edit physics')).toBe('idle-only');
    expect(resolveSlashCommandAvailability(preset!, 'physics')).toBe('idle-only');
    expect(resolveSlashCommandAvailability(preset!, 'status')).toBe('always');
  });

  it('offers preset edit, off, and status argument completions', () => {
    const values = presetArgumentCompletions('')?.map((item) => item.value);
    expect(values).toEqual(['edit', 'off', 'status']);
    expect(presetArgumentCompletions('ed')).toEqual([
      { value: 'edit', label: 'edit', description: 'Create or configure an agent preset' },
    ]);
  });

  it('offers add-dir list and directory argument completions', () => {
    const values = (prefix: string): string[] | null => {
      const items = addDirArgumentCompletions(prefix);
      return items === null ? null : items.map((item) => item.value);
    };

    expect(values('')).toEqual(['list']);
    expect(values('L')).toEqual(['list']);
    expect(values('list')).toBeNull();
    const directoryCompletions = values('/') ?? [];
    expect(directoryCompletions.length).toBeGreaterThan(0);
    expect(directoryCompletions.every((value) => value.startsWith('/') && value.endsWith('/'))).toBe(true);
    expect(directoryCompletions.some((value) => value.startsWith('/.'))).toBe(false);
    expect(values('/.')).toBeNull();
    const homeCompletions = values('~/') ?? [];
    expect(homeCompletions.length).toBeGreaterThan(0);
    expect(homeCompletions.every((value) => value.startsWith('~/') && value.endsWith('/'))).toBe(true);
    expect(homeCompletions.some((value) => value.startsWith('~/.'))).toBe(false);
    expect(homeCompletions.some((value) => value.startsWith('~/sers/'))).toBe(false);
  });

  it('defaults commands without explicit availability to idle-only', () => {
    const command: KimiSlashCommand = {
      name: 'example',
      aliases: [],
      description: 'Example command',
    };

    expect(resolveSlashCommandAvailability(command, '')).toBe('idle-only');
  });

  it('sorts commands by priority descending and name ascending', () => {
    const commands: KimiSlashCommand[] = [
      { name: 'zebra', aliases: [], description: 'Z', priority: 100 },
      { name: 'alpha', aliases: [], description: 'A', priority: 100 },
      { name: 'middle', aliases: [], description: 'M', priority: 50 },
      { name: 'plain', aliases: [], description: 'P' },
    ];

    expect(sortSlashCommands(commands).map((command) => command.name)).toEqual([
      'alpha',
      'zebra',
      'middle',
      'plain',
    ]);
  });

  it('registers goal with subcommand-aware availability', () => {
    const goal = findBuiltInSlashCommand('goal');
    expect(goal).toBeDefined();
    expect((goal as KimiSlashCommand).experimentalFlag).toBeUndefined();
    expect(resolveSlashCommandAvailability(goal!, '')).toBe('always');
    expect(resolveSlashCommandAvailability(goal!, 'status')).toBe('always');
    expect(resolveSlashCommandAvailability(goal!, 'pause')).toBe('always');
    expect(resolveSlashCommandAvailability(goal!, 'cancel')).toBe('always');
    expect(resolveSlashCommandAvailability(goal!, 'next')).toBe('always');
    expect(resolveSlashCommandAvailability(goal!, 'next Ship feature Y')).toBe('always');
    expect(resolveSlashCommandAvailability(goal!, 'next manage')).toBe('always');
    expect(resolveSlashCommandAvailability(goal!, 'status report')).toBe('idle-only');
    expect(resolveSlashCommandAvailability(goal!, 'pause the rollout')).toBe('idle-only');
    expect(resolveSlashCommandAvailability(goal!, 'cancel the migration')).toBe('idle-only');
    // `clear` is no longer a subcommand; it parses as an objective -> idle-only.
    expect(resolveSlashCommandAvailability(goal!, 'clear')).toBe('idle-only');
    expect(resolveSlashCommandAvailability(goal!, 'resume')).toBe('idle-only');
    expect(resolveSlashCommandAvailability(goal!, 'Ship feature X')).toBe('idle-only');
    expect(resolveSlashCommandAvailability(goal!, 'replace Ship feature Y')).toBe('idle-only');
  });

  it('contains the expected command names once', () => {
    const names = BUILTIN_SLASH_COMMANDS.map((command) => command.name);

    expect(new Set(names).size).toBe(names.length);
    expect(names).toEqual(
      expect.arrayContaining([
        'add-dir',
        'compact',
        'btw',
        'editor',
        'exit',
        'export-debug-zip',
        'fork',
        'help',
        'init',
        'login',
        'logout',
        'mcp',
        'model',
        'new',
        'permission',
        'plan',
        'reload',
        'reload-tui',
        'secondary-model',
        'sessions',
        'settings',
        'status',
        'theme',
        'title',
        'undo',
        'usage',
        'version',
        'yolo',
      ]),
    );
  });

  it('keeps TUI reload always available and full reload idle-only', () => {
    const reload = findBuiltInSlashCommand('reload');
    const reloadTui = findBuiltInSlashCommand('reload-tui');

    expect(reload).toBeDefined();
    expect(reloadTui).toBeDefined();
    expect(resolveSlashCommandAvailability(reload!, '')).toBe('idle-only');
    expect(resolveSlashCommandAvailability(reloadTui!, '')).toBe('always');
  });

  it('keeps deprecated subagent model commands resolvable but hidden', () => {
    const command = findBuiltInSlashCommand('secondary-model');
    const alias = findBuiltInSlashCommand('subagent-model');
    expect(command).toBeDefined();
    expect(alias?.name).toBe('secondary-model');
    expect((command as KimiSlashCommand).hidden).toBe(true);
    expect((command as KimiSlashCommand).experimentalFlag).toBeUndefined();
    expect(resolveSlashCommandAvailability(command!, '')).toBe('always');
  });

  it('registers research without an experimental gate and with subcommand-aware availability', () => {
    const research = findBuiltInSlashCommand('research');
    expect(research).toBeDefined();
    expect((research as KimiSlashCommand).experimentalFlag).toBeUndefined();
    // status / pause / resume are always available
    expect(resolveSlashCommandAvailability(research!, '')).toBe('always');
    expect(resolveSlashCommandAvailability(research!, 'status')).toBe('always');
    expect(resolveSlashCommandAvailability(research!, 'pause')).toBe('always');
    expect(resolveSlashCommandAvailability(research!, 'resume')).toBe('always');
    // on / off / manage / question actions are idle-only
    expect(resolveSlashCommandAvailability(research!, 'on')).toBe('idle-only');
    expect(resolveSlashCommandAvailability(research!, 'off')).toBe('idle-only');
    expect(resolveSlashCommandAvailability(research!, 'manage')).toBe('idle-only');
    expect(resolveSlashCommandAvailability(research!, 'edit q1 -- text')).toBe('idle-only');
    expect(resolveSlashCommandAvailability(research!, 'focus q1 -- action')).toBe('idle-only');
    expect(resolveSlashCommandAvailability(research!, 'defer q1')).toBe('idle-only');
  });

  it('offers research subcommand argument completions', () => {
    const values = (prefix: string): string[] | null => {
      const items = researchArgumentCompletions(prefix);
      return items === null ? null : items.map((item) => item.value);
    };
    expect(values('')).toEqual([
      'status', 'on', 'off', 'pause', 'resume', 'manage',
      'edit', 'focus', 'defer', 'block', 'close', 'reopen', 'line',
    ]);
    expect(values('s')).toEqual(['status']);
    expect(values('st')).toEqual(['status']);
    expect(values('status')).toBeNull();
    // After a space, completion returns null (free text)
    expect(researchArgumentCompletions('on ')).toBeNull();
  });
});
