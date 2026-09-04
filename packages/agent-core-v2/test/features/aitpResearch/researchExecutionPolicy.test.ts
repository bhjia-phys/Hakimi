import { describe, expect, it } from 'vitest';

import {
  classifyResearchTool,
  isResearchRecordInspection,
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

  it.each([
    ['Read', { path: '.aitp/topic/notes/note-abc123.md' }],
    ['Read', { path: './.aitp/topic/notes/note-with-id.md', limit: 80 }],
    ['Grep', { path: '.aitp/topic/', pattern: '^> method-card:' }],
    ['Grep', { path: './.aitp/topic/notes', pattern: '^> method-card:', output_mode: 'files_with_matches' }],
    ['Grep', { path: '.aitp/topic', pattern: '^> method-observation:' }],
    ['Grep', { path: '.aitp/topic/entries/', pattern: '^> method-observation:' }],
  ])('permits only narrow recorded-knowledge inspection: %s %j', (toolName, args) => {
    expect(isResearchRecordInspection(toolName, args)).toBe(true);
  });

  it.each([
    ['Read', undefined],
    ['Read', { path: '/other/.aitp/topic/notes/note-abc.md' }],
    ['Read', { path: '../.aitp/topic/notes/note-abc.md' }],
    ['Read', { path: '.aitp/local/../topic/notes/note-abc.md' }],
    ['Read', { path: '.aitp/topic/notes/note-../../secret.md' }],
    ['Read', { path: '.aitp/topic/entries/entry-abc.md' }],
    ['Read', { path: '.aitp/topic/TOPIC.md' }],
    ['Read', { path: 'paper.md' }],
    ['Edit', { path: '.aitp/topic/notes/note-abc.md' }],
    ['Write', { path: '.aitp/topic/notes/note-abc.md' }],
    ['Bash', { command: 'rg "^> method-card:" .aitp/topic/' }],
    ['Grep', { pattern: '^> method-card:' }],
    ['Grep', { path: '/other/.aitp/topic', pattern: '^> method-card:' }],
    ['Grep', { path: '.aitp/topic', pattern: '.*' }],
    ['Grep', { path: '.aitp/topic', pattern: '^> method-card:', output_mode: 'content' }],
    ['Grep', { path: '.aitp/topic', pattern: '^> method-card:', output_mode: 'count_matches' }],
    ['Grep', { path: '.aitp/topic/entries', pattern: '^> method-card:' }],
    ['Grep', { path: '.aitp/topic/notes', pattern: '^> method-observation:' }],
    ['mcp__fs__read', { path: '.aitp/topic/notes/note-abc.md' }],
  ])('does not expand inspection into other work: %s %j', (toolName, args) => {
    expect(isResearchRecordInspection(toolName, args)).toBe(false);
  });

  it('accepts canonical capabilities, legacy tool aliases, and exact tool grants only', () => {
    expect(researchCapabilityGranted(['workspace_read'], 'Read', 'workspace_read')).toBe(true);
    expect(researchCapabilityGranted(['read'], 'Read', 'workspace_read')).toBe(true);
    expect(researchCapabilityGranted(['tool:read'], 'Read', 'workspace_read')).toBe(true);
    expect(researchCapabilityGranted(['simulation'], 'Read', 'workspace_read')).toBe(false);
  });
});
