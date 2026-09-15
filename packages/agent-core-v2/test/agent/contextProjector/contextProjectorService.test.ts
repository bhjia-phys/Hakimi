/**
 * Scenario: context projector strips unverifiable encrypted reasoning content
 * from wire `think` parts while keeping the visible thinking summary and all
 * other content, read-side only.
 *
 * Responsibilities: assert the pure `stripEncryptedReasoningParts` transform
 * (multiple think blocks, no-encrypted identity, adjacent user/tool/media
 * content untouched) and the `projectEncryptedStripped` service projection
 * (history projected then stripped, input never mutated). Wiring: real
 * `AgentContextProjectorService` over `TestInstantiationService`. Run:
 * pnpm test -- test/agent/contextProjector/contextProjectorService.test.ts
 */

import { SyncDescriptor } from '#/_base/di/descriptors';
import { DisposableStore } from '#/_base/di/lifecycle';
import { TestInstantiationService } from '#/_base/di/test';
import { ILogService } from '#/_base/log/log';
import {
  IAgentContextProjectorService,
} from '#/agent/contextProjector/contextProjector';
import {
  AgentContextProjectorService,
  stripEncryptedReasoningParts,
} from '#/agent/contextProjector/contextProjectorService';
import { IAgentStateService } from '#/agent/state/agentState';
import { AgentStateService } from '#/agent/state/agentStateService';
import type { Message } from '#/kosong/contract/message';
import { ITelemetryService } from '#/app/telemetry/telemetry';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { recordingTelemetry } from '../../app/telemetry/stubs';

let disposables: DisposableStore;

beforeEach(() => {
  disposables = new DisposableStore();
});

afterEach(() => disposables.dispose());

function createProjector(): {
  readonly projector: IAgentContextProjectorService;
} {
  const ix = disposables.add(new TestInstantiationService());
  ix.stub(ILogService, { info: () => undefined, warn: () => undefined });
  ix.stub(ITelemetryService, recordingTelemetry([]));
  ix.set(IAgentStateService, new AgentStateService());
  ix.set(IAgentContextProjectorService, new SyncDescriptor(AgentContextProjectorService));
  return { projector: ix.get(IAgentContextProjectorService) };
}

describe('stripEncryptedReasoningParts', () => {
  it('drops only the encrypted field of every think part, keeping the summaries', () => {
    const messages: Message[] = [
      {
        role: 'assistant',
        content: [
          { type: 'think', think: 'summary one', encrypted: 'enc-a' },
          { type: 'text', text: 'visible text' },
          { type: 'think', think: 'summary two', encrypted: 'enc-b' },
        ],
        toolCalls: [],
      },
    ];

    const stripped = stripEncryptedReasoningParts(messages);

    expect(stripped).toEqual([
      {
        role: 'assistant',
        content: [
          { type: 'think', think: 'summary one' },
          { type: 'text', text: 'visible text' },
          { type: 'think', think: 'summary two' },
        ],
        toolCalls: [],
      },
    ]);
  });

  it('returns the same array when no think part carries encrypted content', () => {
    const messages: Message[] = [
      { role: 'user', content: [{ type: 'text', text: 'hello' }], toolCalls: [] },
      {
        role: 'assistant',
        content: [
          { type: 'think', think: 'plain summary' },
          { type: 'text', text: 'ok' },
        ],
        toolCalls: [],
      },
    ];

    expect(stripEncryptedReasoningParts(messages)).toBe(messages);
  });

  it('leaves adjacent messages and user, tool, and media content untouched', () => {
    const assistant: Message = {
      role: 'assistant',
      content: [{ type: 'think', think: 'summary', encrypted: 'enc-1' }],
      toolCalls: [{ type: 'function', id: 'call-1', name: 'Bash', arguments: '{}' }],
    };
    const userBefore: Message = {
      role: 'user',
      content: [{ type: 'text', text: 'prompt' }],
      toolCalls: [],
    };
    const tool: Message = {
      role: 'tool',
      content: [{ type: 'text', text: 'output' }],
      toolCalls: [],
      toolCallId: 'call-1',
    };
    const userAfter: Message = {
      role: 'user',
      content: [{ type: 'image_url', imageUrl: { url: 'https://example.test/i.png' } }],
      toolCalls: [],
    };

    const stripped = stripEncryptedReasoningParts([userBefore, assistant, tool, userAfter]);

    expect(stripped).toEqual([
      userBefore,
      { ...assistant, content: [{ type: 'think', think: 'summary' }] },
      tool,
      userAfter,
    ]);
    expect(assistant.content).toEqual([{ type: 'think', think: 'summary', encrypted: 'enc-1' }]);
  });
});

describe('AgentContextProjectorService projectEncryptedStripped', () => {
  it('projects history then strips encrypted think content without mutating the input', () => {
    const { projector } = createProjector();
    const history: Message[] = [
      { role: 'user', content: [{ type: 'text', text: 'hello' }], toolCalls: [] },
      {
        role: 'assistant',
        content: [{ type: 'think', think: 'kept summary', encrypted: 'enc-1' }],
        toolCalls: [],
      },
    ];

    const projected = projector.projectEncryptedStripped(history);

    expect(projected[1]?.content).toEqual([{ type: 'think', think: 'kept summary' }]);
    expect(history[1]!.content).toEqual([
      { type: 'think', think: 'kept summary', encrypted: 'enc-1' },
    ]);
  });
});