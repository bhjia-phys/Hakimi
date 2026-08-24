/**
 * Scenario: the builtin agent profile contributions.
 *
 * Pins the code-defined profiles registered at module load: the default
 * `agent` profile carries the Tower entry plus the complete dynamically gated
 * AITP Research tool surface and declares no `subagents` allowlist. The
 * `tower-worker` profile is contributed by the
 * tower Feature instead — see test/features/tower/workerProfile.test.ts. Run
 * with `pnpm --filter @moonshot-ai/agent-core-v2 exec vitest run
 * test/session/agentLifecycle/profile/profiles.test.ts`.
 */

import { describe, expect, it } from 'vitest';

import { getAgentProfileContributions } from '#/app/agentProfileCatalog/contribution';
import '#/session/agentLifecycle/profile/profiles';

function profile(name: string) {
  const found = getAgentProfileContributions().find((p) => p.name === name);
  expect(found, `builtin profile "${name}" is registered`).toBeDefined();
  return found!;
}

describe('builtin agent profiles', () => {
  it('wires capability tools into the default profile', () => {
    const agent = profile('agent');
    expect(agent.tools).toEqual(expect.arrayContaining([
      'EnterAITPMode',
      'ExitAITPMode',
      'GetResearchStatus',
      'CreateResearchLine',
      'UpdateResearchLine',
      'CreateResearchQuestion',
      'UpdateResearchQuestion',
      'SetResearchFocus',
      'ProposeResearchCheckpoint',
      'CommitResearchCheckpoint',
      'aitp_enter',
      'aitp_list',
      'aitp_show',
      'aitp_check',
      'aitp_record_prepare',
      'aitp_record_save',
      'aitp_note_prepare',
      'aitp_note_save',
      'TowerInit',
    ]));

    const researchTools = new Set([
      'EnterAITPMode',
      'ExitAITPMode',
      'GetResearchStatus',
      'CreateResearchLine',
      'UpdateResearchLine',
      'CreateResearchQuestion',
      'UpdateResearchQuestion',
      'SetResearchFocus',
      'ProposeResearchCheckpoint',
      'CommitResearchCheckpoint',
      'aitp_enter',
      'aitp_list',
      'aitp_show',
      'aitp_check',
      'aitp_record_prepare',
      'aitp_record_save',
      'aitp_note_prepare',
      'aitp_note_save',
    ]);
    const tools = agent.tools ?? [];
    const profileResearchTools = tools.filter((tool) => researchTools.has(tool));
    expect(profileResearchTools).toHaveLength(researchTools.size);
    expect(new Set(profileResearchTools)).toEqual(researchTools);

    // No subagents allowlist: enforced when present, so `undefined` keeps
    // user-defined profiles delegatable, tower-worker included.
    expect(agent.subagents).toBeUndefined();
  });
});
