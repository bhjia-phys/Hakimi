import { describe, expect, it } from 'vitest';

import { classifyResearchTool } from '#/features/aitpResearch/research/researchExecutionPolicy';

describe('Research operation routing without work capabilities', () => {
  it.each(['GetResearchStatus', 'BeginResearchAction', 'TodoList', 'select_tools', 'aitp_show'])(
    'routes control operation %s', (name) => {
      expect(classifyResearchTool(name)).toEqual({ kind: 'control' });
    },
  );

  it.each(['ReadResearchCheckpointEvidence', 'CommitResearchCheckpoint', 'aitp_record_prepare', 'aitp_record_save'])(
    'retains owned record persistence routing for %s', (name) => {
      expect(classifyResearchTool(name)).toEqual({ kind: 'checkpoint_persistence' });
    },
  );

  it.each(['aitp_note_prepare', 'aitp_note_save'])('retains Note persistence routing for %s', (name) => {
    expect(classifyResearchTool(name)).toEqual({ kind: 'distillation_persistence' });
  });

  it.each([
    'Bash', 'Read', 'ReadMediaFile', 'Grep', 'Glob', 'Edit', 'Write', 'WebSearch', 'FetchURL',
    'TaskList', 'TaskOutput', 'TaskStop', 'Agent', 'AgentSwarm', 'TowerSpawn', 'TowerStatus',
    'CronCreate', 'CronDelete', 'mcp__papers__lookup', 'unknown_plugin_tool',
  ])('does not assign an additional Research capability to %s', (name) => {
    expect(classifyResearchTool(name)).toEqual({ kind: 'work' });
  });
});
