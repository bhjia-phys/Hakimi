/**
 * `aitpResearch` domain — bounded checkpoint evidence inspection.
 *
 * Reads one explicitly selected workspace file through the agent runtime and
 * returns a byte-exact digest plus a bounded excerpt for the pending record.
 * Research owns checkpoint freshness; workspace context owns the root; normal
 * tool permissions still apply. No shell, writes, ledger parsing or scientific
 * acceptance. Symlink confinement is checked, not an OS isolation guarantee.
 * Bound at Agent scope through the Research feature.
 */

import { createHash } from 'node:crypto';
import { z } from 'zod';
import { createDecorator } from '#/_base/di/instantiation';
import { IAgentRuntimeService } from '#/agent/runtimeBinding/agentRuntime';
import { ISessionWorkspaceContext } from '#/session/workspaceContext/workspaceContext';
import { RuntimeWorkspaceView } from '#/runtime/runtimeWorkspaceView';
import { ToolAccesses, type AgentTool, type ToolExecution } from '#/tool/toolContract';
import { toInputJsonSchema } from '#/tool/input-schema';
import { literalRulePattern } from '#/tool/rule-match';
import { IAgentResearchService } from '../research/agentResearch';

export const CheckpointEvidenceInputSchema = z.object({
  checkpoint_id: z.string().min(1),
  expected_revision: z.number().int().nonnegative(),
  path: z.string().min(1).max(4096),
  offset: z.number().int().nonnegative().default(0),
}).strict();
type Input = z.infer<typeof CheckpointEvidenceInputSchema>;
export interface IReadResearchCheckpointEvidenceTool extends AgentTool<Input> {}
export const IReadResearchCheckpointEvidenceTool = createDecorator<IReadResearchCheckpointEvidenceTool>('readResearchCheckpointEvidenceTool');

export class ReadResearchCheckpointEvidenceTool implements IReadResearchCheckpointEvidenceTool {
  declare readonly _serviceBrand: undefined;
  readonly name = 'ReadResearchCheckpointEvidence';
  readonly description = 'Read one existing workspace evidence file for the exact pending checkpoint (maximum 8 MiB). Returns its byte-exact sha256 pin and up to 16000 characters, starting at offset. Use this after ConcludeResearchAction instead of Bash hashing or generic Read. This selects evidence for a record, not new analysis; it neither verifies scientific claims nor saves AITP. Canonical .aitp records use aitp_show. Requires current expected_revision from GetResearchStatus.';
  readonly parameters = toInputJsonSchema(CheckpointEvidenceInputSchema);

  constructor(
    @IAgentRuntimeService private readonly runtime: IAgentRuntimeService,
    @ISessionWorkspaceContext private readonly workspace: ISessionWorkspaceContext,
    @IAgentResearchService private readonly research: IAgentResearchService,
  ) {}

  resolveExecution(input: Input): ToolExecution {
    const args = CheckpointEvidenceInputSchema.parse(input);
    const parts = args.path.replaceAll('\\', '/').split('/');
    if (parts.some((part) => part === '..' || part === '.aitp' || part === '.git') ||
      args.path.includes('\0') || /^[~/\\]|^[a-zA-Z]:/.test(args.path)) {
      return { isError: true, output: 'Select an exact workspace-relative evidence file outside .aitp and .git; no traversal or absolute paths.' };
    }
    const inspected = this.runtime.inspect();
    const view = new RuntimeWorkspaceView(inspected, { workDir: this.workspace.workDir, additionalDirs: [] });
    const path = view.resolve(args.path);
    return {
      approvalRule: literalRulePattern(this.name, path),
      accesses: ToolAccesses.readFile(path),
      display: { kind: 'file_io', operation: 'read', path },
      execute: async ({ signal }) => {
        const lease = this.runtime.acquire(['fs']);
        try {
          this.research.assertCheckpointEvidenceAccess(args.checkpoint_id, args.expected_revision);
          if (lease.runtime.identity.generation !== inspected.identity.generation) throw new Error('Runtime changed; retry evidence inspection.');
          const fs = lease.runtime.fs!;
          const root = await fs.realpath(view.workDir);
          const resolved = await fs.realpath(path);
          const relative = inspected.path.relative(root, resolved);
          if (relative === '' || relative === '..' || relative.startsWith(`..${inspected.path.separator}`) ||
            inspected.path.isAbsolute(relative) || relative.split(inspected.path.separator).some((p) => p === '.aitp' || p === '.git')) {
            throw new Error('Evidence symlink escapes the workspace or points into protected metadata.');
          }
          signal.throwIfAborted();
          const before = await fs.stat(resolved);
          const maxBytes = 8 * 1024 * 1024;
          if (!before.isFile || before.size > maxBytes) throw new Error('Evidence must be a regular file no larger than 8 MiB.');
          const bytes = await fs.readBytes(resolved, maxBytes + 1);
          const after = await fs.stat(resolved);
          if (bytes.length > maxBytes || bytes.length !== before.size || before.size !== after.size ||
            before.mtimeMs !== after.mtimeMs || before.ino !== after.ino || await fs.realpath(path) !== resolved) {
            throw new Error('Evidence changed during inspection; retry without using this observation.');
          }
          signal.throwIfAborted();
          this.research.assertCheckpointEvidenceAccess(args.checkpoint_id, args.expected_revision);
          let text: string | undefined;
          try { text = new TextDecoder('utf-8', { fatal: true }).decode(bytes); } catch { text = undefined; }
          return { output: JSON.stringify({
            checkpoint_id: args.checkpoint_id, target: args.path,
            at: `sha256:${createHash('sha256').update(bytes).digest('hex')}`,
            bytes: bytes.length, offset: args.offset,
            excerpt: text?.slice(args.offset, args.offset + 16000),
            truncated: text !== undefined && text.length > args.offset + 16000,
            note: 'Observed bytes only. AITP save validates the pin again; scientific relevance and conclusions require review.',
          }) };
        } catch (error) {
          return { isError: true, output: error instanceof Error ? error.message : String(error) };
        } finally {
          lease.dispose();
        }
      },
    };
  }
}
