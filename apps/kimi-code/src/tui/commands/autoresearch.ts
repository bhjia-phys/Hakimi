import { ErrorCodes, isKimiError, type AutoresearchSnapshot } from '@moonshot-ai/kimi-code-sdk';

import { LLM_NOT_SET_MESSAGE } from '../constant/kimi-tui';
import { formatErrorMessage } from '../utils/event-payload';
import type { SlashCommandHost } from './dispatch';

const DEFAULT_OPERATOR = 'human';

export type ParsedAutoresearchCommand =
  | { readonly kind: 'status' }
  | { readonly kind: 'pause'; readonly reason?: string | undefined }
  | { readonly kind: 'resume'; readonly operator?: string | undefined }
  | { readonly kind: 'stop'; readonly reason?: string | undefined; readonly operator?: string | undefined }
  | {
      readonly kind: 'start';
      readonly topicId: string;
      readonly objective: string;
      readonly researchQuestion: string;
      readonly operator: string;
      readonly title?: string | undefined;
      readonly claimId?: string | undefined;
      readonly aitpSessionId?: string | undefined;
      readonly hypothesis?: string | undefined;
      readonly replace: boolean;
    }
  | { readonly kind: 'error'; readonly message: string; readonly severity?: 'error' | 'hint' };

export function parseAutoresearchCommand(rawArgs: string): ParsedAutoresearchCommand {
  const args = rawArgs.trim();
  if (args.length === 0 || args === 'status') return { kind: 'status' };
  const tokens = tokenizeArgs(args);
  const first = tokens[0];
  if (first === 'pause') {
    return { kind: 'pause', reason: tokens.slice(1).join(' ').trim() || undefined };
  }
  if (first === 'resume') {
    const parsed = parseOptions(tokens.slice(1));
    return { kind: 'resume', operator: parsed.options['operator'] };
  }
  if (first === 'stop') {
    const parsed = parseOptions(tokens.slice(1));
    return {
      kind: 'stop',
      reason: parsed.rest.join(' ').trim() || undefined,
      operator: parsed.options['operator'],
    };
  }

  let replace = false;
  let startTokens = tokens;
  if (first === 'replace') {
    replace = true;
    startTokens = tokens.slice(1);
  } else if (first === 'start') {
    startTokens = tokens.slice(1);
  }
  const parsed = parseOptions(startTokens);
  const topicId = parsed.options['topic'] ?? parsed.options['topicId'];
  const question = parsed.options['question'] ?? parsed.options['q'] ?? parsed.rest.join(' ').trim();
  const objective = parsed.options['objective'] ?? parsed.options['obj'] ?? question;
  if (topicId === undefined || topicId.trim().length === 0) {
    return {
      kind: 'error',
      severity: 'hint',
      message:
        'Provide an AITP topic, e.g. `/autoresearch start --topic fqhe --question "Check the source support"`.',
    };
  }
  if (question.trim().length === 0) {
    return {
      kind: 'error',
      severity: 'hint',
      message:
        'Provide a research question with `--question` or as trailing text after the options.',
    };
  }
  return {
    kind: 'start',
    topicId,
    objective,
    researchQuestion: question,
    operator: parsed.options['operator'] ?? DEFAULT_OPERATOR,
    title: parsed.options['title'],
    claimId: parsed.options['claim'] ?? parsed.options['claimId'],
    aitpSessionId: parsed.options['aitpSession'] ?? parsed.options['aitpSessionId'],
    hypothesis: parsed.options['hypothesis'],
    replace,
  };
}

export async function handleAutoresearchCommand(
  host: SlashCommandHost,
  args: string,
): Promise<void> {
  const parsed = parseAutoresearchCommand(args);
  switch (parsed.kind) {
    case 'error':
      if (parsed.severity === 'hint') host.showStatus(parsed.message);
      else host.showError(parsed.message);
      return;
    case 'status':
      await showAutoresearchStatus(host);
      return;
    case 'pause':
      await pauseAutoresearch(host, parsed.reason);
      return;
    case 'resume':
      await resumeAutoresearch(host, parsed.operator);
      return;
    case 'stop':
      await stopAutoresearch(host, parsed.reason, parsed.operator);
      return;
    case 'start':
      await startAutoresearch(host, parsed);
      return;
  }
}

async function startAutoresearch(
  host: SlashCommandHost,
  parsed: Extract<ParsedAutoresearchCommand, { kind: 'start' }>,
): Promise<void> {
  if (host.state.appState.model.trim().length === 0 || host.session === undefined) {
    host.showError(LLM_NOT_SET_MESSAGE);
    return;
  }
  let snapshot: AutoresearchSnapshot;
  try {
    snapshot = await host.requireSession().startAutoresearch({
      topicId: parsed.topicId,
      objective: parsed.objective,
      researchQuestion: parsed.researchQuestion,
      operator: parsed.operator,
      title: parsed.title,
      claimId: parsed.claimId,
      aitpSessionId: parsed.aitpSessionId,
      hypothesis: parsed.hypothesis,
      replace: parsed.replace,
    });
  } catch (error) {
    if (isKimiError(error) && error.code === ErrorCodes.AUTORESEARCH_ALREADY_EXISTS) {
      host.showError(
        'An autoresearch run already exists. Use `/autoresearch replace --topic <topic> --question <question>` to replace it, or `/autoresearch status` to inspect it.',
      );
      return;
    }
    host.showError(formatErrorMessage(error));
    return;
  }
  host.track('autoresearch_start', {
    topic_id: snapshot.topicId,
    operator: snapshot.operator,
    replace: parsed.replace,
  });
  host.showNotice(
    'Autoresearch started',
    `AITP run ${snapshot.aitpRunId}: ${snapshot.status}/${snapshot.phase}`,
  );
  host.sendNormalUserInput(
    [
      `Work on the AITP-backed autoresearch run ${snapshot.aitpRunId}.`,
      `Topic: ${snapshot.topicId}.`,
      `Research question: ${snapshot.researchQuestion}`,
      'Use AITP slices and ResearchAction to audit the question. Keep process events in the AITP research run; do not promote claim trust without explicit validation.',
    ].join('\n'),
  );
}

async function showAutoresearchStatus(host: SlashCommandHost): Promise<void> {
  const { autoresearch } = await host.requireSession().getAutoresearch();
  host.track('autoresearch_status', { status: autoresearch?.status ?? 'none' });
  if (autoresearch === null) {
    host.showStatus('No autoresearch run set. Start one with `/autoresearch start --topic <topic> --question <question>`.');
    return;
  }
  host.showNotice(
    'Autoresearch status',
    [
      `${autoresearch.status}/${autoresearch.phase}`,
      `AITP run ${autoresearch.aitpRunId}`,
      `topic ${autoresearch.topicId}`,
      `operator ${autoresearch.operator}`,
      autoresearch.stopReason === undefined ? undefined : `reason ${autoresearch.stopReason}`,
    ].filter((line): line is string => line !== undefined).join('\n'),
  );
}

async function pauseAutoresearch(host: SlashCommandHost, reason?: string): Promise<void> {
  try {
    await host.requireSession().pauseAutoresearch({ reason });
  } catch (error) {
    if (isKimiError(error) && error.code === ErrorCodes.AUTORESEARCH_NOT_FOUND) {
      host.showStatus('No autoresearch run to pause.');
      return;
    }
    host.showError(formatErrorMessage(error));
    return;
  }
  host.track('autoresearch_pause');
  host.showStatus('Autoresearch paused.');
}

async function resumeAutoresearch(host: SlashCommandHost, operator?: string): Promise<void> {
  if (host.state.appState.model.trim().length === 0 || host.session === undefined) {
    host.showError(LLM_NOT_SET_MESSAGE);
    return;
  }
  let snapshot: AutoresearchSnapshot;
  try {
    snapshot = await host.requireSession().resumeAutoresearch({ operator });
  } catch (error) {
    if (isKimiError(error) && error.code === ErrorCodes.AUTORESEARCH_NOT_FOUND) {
      host.showStatus('No autoresearch run to resume.');
      return;
    }
    host.showError(formatErrorMessage(error));
    return;
  }
  host.track('autoresearch_resume', { topic_id: snapshot.topicId });
  host.sendNormalUserInput(
    `Resume the AITP-backed autoresearch run ${snapshot.aitpRunId} for topic ${snapshot.topicId}.`,
  );
}

async function stopAutoresearch(
  host: SlashCommandHost,
  reason?: string,
  operator?: string,
): Promise<void> {
  try {
    await host.requireSession().stopAutoresearch({ reason, operator });
  } catch (error) {
    if (isKimiError(error) && error.code === ErrorCodes.AUTORESEARCH_NOT_FOUND) {
      host.showStatus('No autoresearch run to stop.');
      return;
    }
    host.showError(formatErrorMessage(error));
    return;
  }
  host.track('autoresearch_stop');
  host.showStatus('Autoresearch stopped.');
}

function parseOptions(tokens: readonly string[]): {
  readonly options: Readonly<Record<string, string>>;
  readonly rest: readonly string[];
} {
  const options: Record<string, string> = {};
  const rest: string[] = [];
  for (let index = 0; index < tokens.length; index++) {
    const token = tokens[index]!;
    if (!token.startsWith('--')) {
      rest.push(token);
      continue;
    }
    const withoutPrefix = token.slice(2);
    const equals = withoutPrefix.indexOf('=');
    if (equals >= 0) {
      options[toCamelCase(withoutPrefix.slice(0, equals))] = withoutPrefix.slice(equals + 1);
      continue;
    }
    const key = toCamelCase(withoutPrefix);
    const next = tokens[index + 1];
    if (next === undefined || next.startsWith('--')) {
      options[key] = 'true';
      continue;
    }
    options[key] = next;
    index += 1;
  }
  return { options, rest };
}

function tokenizeArgs(raw: string): string[] {
  const tokens: string[] = [];
  let current = '';
  let quote: '"' | "'" | undefined;
  for (let index = 0; index < raw.length; index++) {
    const char = raw[index]!;
    if (quote !== undefined) {
      if (char === quote) {
        quote = undefined;
      } else {
        current += char;
      }
      continue;
    }
    if (char === '"' || char === "'") {
      quote = char;
      continue;
    }
    if (/\s/.test(char)) {
      if (current.length > 0) {
        tokens.push(current);
        current = '';
      }
      continue;
    }
    current += char;
  }
  if (current.length > 0) tokens.push(current);
  return tokens;
}

function toCamelCase(value: string): string {
  return value.replace(/-([a-z])/g, (_match, char: string) => char.toUpperCase());
}
