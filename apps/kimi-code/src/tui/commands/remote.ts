import { isAbsolute } from 'node:path';

import {
  parseRemoteOptions,
  runRemoteControl,
  type RemoteCliOptions,
} from '#/cli/sub/remote/index';

import { NO_ACTIVE_SESSION_MESSAGE } from '../constant/kimi-tui';
import { formatErrorMessage } from '../utils/event-payload';
import type { SlashCommandHost } from './dispatch';

export async function handleRemoteCommand(host: SlashCommandHost, args: string): Promise<void> {
  const session = host.session;
  if (session === undefined) {
    host.showError(NO_ACTIVE_SESSION_MESSAGE);
    return;
  }

  let options;
  try {
    options = parseRemoteOptions({
      session: session.id,
      ...parseRemoteSlashArgs(args),
    });
  } catch (error) {
    host.showError(formatErrorMessage(error));
    return;
  }

  host.setExitForegroundTask(async () => {
    try {
      await runRemoteControl(options);
    } catch (error) {
      process.stderr.write(`Failed to start remote control: ${formatErrorMessage(error)}\n`);
      process.exitCode = 1;
    }
  });
  await host.stop();
}

export function parseRemoteSlashArgs(args: string): Pick<RemoteCliOptions, 'ttl' | 'cloudflared'> {
  const tokens = tokenizeRemoteArgs(args);
  let ttl: string | undefined;
  let cloudflared: string | undefined;

  for (let index = 0; index < tokens.length; index += 1) {
    const token = tokens[index]!;
    const equals = token.indexOf('=');
    const name = equals === -1 ? token : token.slice(0, equals);
    const inlineValue = equals === -1 ? undefined : token.slice(equals + 1);
    if (name !== '--ttl' && name !== '--cloudflared') {
      throw new Error(`Unknown /remote option: ${name}`);
    }

    const value = inlineValue ?? tokens[index + 1];
    if (value === undefined || value.length === 0 || (inlineValue === undefined && value.startsWith('--'))) {
      throw new Error(`${name} requires a value`);
    }
    if (inlineValue === undefined) index += 1;

    if (name === '--ttl') {
      if (ttl !== undefined) throw new Error('--ttl may only be specified once');
      ttl = value;
    } else {
      if (cloudflared !== undefined) {
        throw new Error('--cloudflared may only be specified once');
      }
      if (!isAbsolute(value)) {
        throw new Error('--cloudflared must be an absolute executable path');
      }
      cloudflared = value;
    }
  }

  return { ttl, cloudflared };
}

export function tokenizeRemoteArgs(input: string): string[] {
  const tokens: string[] = [];
  let token = '';
  let quote: "'" | '"' | undefined;
  let escaped = false;
  let started = false;

  for (const char of input) {
    if (escaped) {
      token += char;
      escaped = false;
      started = true;
      continue;
    }
    if (char === '\\' && quote === undefined) {
      escaped = true;
      started = true;
      continue;
    }
    if (quote !== undefined) {
      if (char === quote) quote = undefined;
      else token += char;
      started = true;
      continue;
    }
    if (char === "'" || char === '"') {
      quote = char;
      started = true;
      continue;
    }
    if (/\s/u.test(char)) {
      if (started) {
        tokens.push(token);
        token = '';
        started = false;
      }
      continue;
    }
    token += char;
    started = true;
  }

  if (escaped || quote !== undefined) {
    throw new Error('Invalid /remote arguments: unterminated quote or escape');
  }
  if (started) tokens.push(token);
  return tokens;
}
