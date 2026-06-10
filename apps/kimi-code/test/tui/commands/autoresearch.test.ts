import { describe, expect, it } from 'vitest';

import { parseAutoresearchCommand } from '#/tui/commands/autoresearch';

describe('/autoresearch command parser', () => {
  it('parses a strict start command with AITP scope and operator', () => {
    expect(
      parseAutoresearchCommand(
        'start --topic fqhe --claim claim-edge --operator kimi --question "Does the cited source establish edge counting?" --objective "Audit the edge counting source chain"',
      ),
    ).toEqual({
      kind: 'start',
      topicId: 'fqhe',
      claimId: 'claim-edge',
      operator: 'kimi',
      researchQuestion: 'Does the cited source establish edge counting?',
      objective: 'Audit the edge counting source chain',
      replace: false,
      title: undefined,
      aitpSessionId: undefined,
      hypothesis: undefined,
    });
  });

  it('uses trailing text as the research question for goal-like shorthand', () => {
    expect(
      parseAutoresearchCommand(
        '--topic qg-algebra --operator hakimi Check whether the observer algebra argument is source-supported',
      ),
    ).toMatchObject({
      kind: 'start',
      topicId: 'qg-algebra',
      operator: 'hakimi',
      researchQuestion: 'Check whether the observer algebra argument is source-supported',
      objective: 'Check whether the observer algebra argument is source-supported',
      replace: false,
    });
  });

  it('parses lifecycle subcommands', () => {
    expect(parseAutoresearchCommand('status')).toEqual({ kind: 'status' });
    expect(parseAutoresearchCommand('pause waiting for human approval')).toEqual({
      kind: 'pause',
      reason: 'waiting for human approval',
    });
    expect(parseAutoresearchCommand('resume --operator kimi')).toEqual({
      kind: 'resume',
      operator: 'kimi',
    });
    expect(parseAutoresearchCommand('stop --operator human source boundary failed')).toEqual({
      kind: 'stop',
      reason: 'source boundary failed',
      operator: 'human',
    });
  });
});
