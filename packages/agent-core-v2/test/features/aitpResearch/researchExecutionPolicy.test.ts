import { describe, expect, it } from 'vitest';

import {
  classifyResearchTool,
  researchCapabilityGranted,
} from '#/features/aitpResearch/research/researchExecutionPolicy';

describe('Research execution capability policy', () => {
  it('keeps lifecycle and status tools outside action-work capabilities', () => {
    expect(classifyResearchTool('GetResearchStatus')).toEqual({ kind: 'control' });
    expect(classifyResearchTool('BeginResearchAction')).toEqual({ kind: 'control' });
    expect(classifyResearchTool('TodoList')).toEqual({ kind: 'control' });
    expect(classifyResearchTool('select_tools')).toEqual({ kind: 'control' });
    expect(classifyResearchTool('aitp_show')).toEqual({ kind: 'control' });
    expect(classifyResearchTool('aitp_record_save')).toEqual({
      kind: 'checkpoint_persistence',
    });
    expect(classifyResearchTool('aitp_note_save')).toEqual({
      kind: 'distillation_persistence',
    });
  });

  it.each([
    ['Read', 'workspace_read'],
    ['Grep', 'workspace_read'],
    ['Edit', 'workspace_write'],
    ['WebSearch', 'web_search'],
    ['FetchURL', 'web_fetch'],
    ['Bash', 'shell'],
    ['TaskOutput', 'task'],
    ['Agent', 'subagent'],
    ['AgentSwarm', 'subagent'],
    ['CronCreate', 'scheduler'],
  ] as const)('classifies %s as %s', (toolName, capability) => {
    expect(classifyResearchTool(toolName)).toEqual({ kind: 'work', capability });
  });

  it('requires an exact grant for an unclassified plugin or MCP tool', () => {
    const classified = classifyResearchTool('mcp__papers__lookup');
    expect(classified).toEqual({
      kind: 'work',
      capability: 'tool:mcp__papers__lookup',
    });
    if (classified.kind !== 'work') throw new Error('Expected work classification');
    expect(researchCapabilityGranted(['workspace_read'], 'mcp__papers__lookup', classified.capability)).toBe(false);
    expect(researchCapabilityGranted(['tool:mcp__papers__lookup'], 'mcp__papers__lookup', classified.capability)).toBe(true);
  });

  it('accepts canonical capabilities, legacy tool aliases, and exact tool grants only', () => {
    expect(researchCapabilityGranted(['workspace_read'], 'Read', 'workspace_read')).toBe(true);
    expect(researchCapabilityGranted(['read'], 'Read', 'workspace_read')).toBe(true);
    expect(researchCapabilityGranted(['tool:read'], 'Read', 'workspace_read')).toBe(true);
    expect(researchCapabilityGranted(['simulation'], 'Read', 'workspace_read')).toBe(false);
  });
});
