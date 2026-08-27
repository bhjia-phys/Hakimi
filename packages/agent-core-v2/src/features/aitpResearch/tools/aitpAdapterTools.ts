/**
 * `aitpResearch` domain — AITP adapter tool contracts and implementations.
 *
 * Active-only tools that expose the AITP adapter surface to the model.
 * Read tools (`aitp_enter`, `aitp_list`, `aitp_show`, `aitp_check`) require
 * `ready` or `degraded` phase; write tools (`aitp_record_prepare/save`,
 * `aitp_note_prepare/save`) require `ready`. Tool schemas use strict Zod
 * enums for Entry kind, authority, and Note mode so invalid values are
 * rejected at the tool boundary before spawning the CLI. Workstream slugs
 * are validated against the canonical regex; workstream arrays reject
 * empty and duplicate elements. String parameters reject whitespace-only input.
 * Bound at Agent scope.
 */

import { z } from 'zod';

import { createDecorator } from '#/_base/di/instantiation';
import type { AgentTool, ToolExecution } from '#/tool/toolContract';
import { toInputJsonSchema } from '#/tool/input-schema';
import { ISessionAitpAdapter } from '#/features/aitpResearch/adapter/sessionAitpAdapter';
import { IAgentAitpModeService } from '#/features/aitpResearch/mode/agentAitpMode';
import { IAgentResearchService } from '#/features/aitpResearch/research/agentResearch';
import { AitpResearchError } from '#/features/aitpResearch/errors';
import type {
  AitpCheckReport,
  AitpRecordPrepareResult,
  AitpRecordSaveResult,
  ResearchCheckpointCheckReceipt,
  ResearchCheckpointReceipt,
  ResearchCheckpointSaveReceipt,
} from '#/features/aitpResearch/types';
import {
  AitpEntryKindSchema,
  AitpAuthoritySchema,
  AitpNoteModeSchema,
  AitpWorkstreamSchema,
} from '#/features/aitpResearch/types';

const ENTRY_KINDS_DESC = 'observation, result, failure, decision, source, code_change, run, closeout';

const NonemptyString = z.string().refine((s) => s.trim().length > 0, { message: 'must be non-empty after trimming' });

const WorkstreamsSchema = z.array(AitpWorkstreamSchema).min(1).refine(
  (arr) => new Set(arr).size === arr.length,
  { message: 'duplicate workstream slugs' },
).optional();

function requireReady(mode: IAgentAitpModeService, adapter: ISessionAitpAdapter): string | undefined {
  if (!mode.isActive) return 'AITP Research Mode is not active. Call EnterAITPMode first.';
  if (!adapter.isReady() && !adapter.isDegraded()) {
    return 'AITP adapter is not ready. Wait for probing to finish.';
  }
  return undefined;
}

function requireReadyStrict(adapter: ISessionAitpAdapter): string | undefined {
  if (!adapter.isReady()) {
    return 'AITP adapter must be in ready phase for write operations.';
  }
  return undefined;
}

function errorResult(message: string) {
  return { isError: true as const, output: message };
}

function ok(data: unknown) {
  return { output: JSON.stringify(data, null, 2) };
}

function toCheckpointCheckReceipt(report: AitpCheckReport): ResearchCheckpointCheckReceipt {
  return {
    status: report.status,
    errors: report.counts.errors,
    warnings: report.counts.warnings,
    findingFingerprints: report.findings.map((finding) =>
      `${finding.level}:${finding.code}:${finding.path}:${finding.message}`,
    ).toSorted(),
    errorFindingFingerprints: report.findings
      .filter((finding) => finding.level === 'error')
      .map((finding) => `${finding.code}:${finding.path}:${finding.message}`)
      .toSorted(),
    checkedAt: Date.now(),
  };
}

function toPrepareReceipt(
  result: AitpRecordPrepareResult,
  idempotencyKey: string | undefined,
  workstreams: readonly string[] | undefined,
): ResearchCheckpointReceipt['prepare'] {
  return result.status === 'prepared'
    ? {
        status: result.status,
        id: result.id,
        path: result.path,
        idempotencyKey,
        workstreams,
      }
    : {
        status: result.status,
        id: entryIdFromPath(result.path),
        path: result.path,
        idempotencyKey: result.idempotency_key,
        workstreams,
      };
}

function toSaveReceipt(
  result: AitpRecordSaveResult,
  draftPath: string,
): ResearchCheckpointSaveReceipt {
  return {
    status: result.status,
    draftPath,
    path: result.path,
    source: 'record_save',
  };
}

function toExistingSaveReceipt(path: string): ResearchCheckpointSaveReceipt {
  return {
    status: 'already_saved',
    draftPath: path,
    path,
    source: 'prepare_existing',
  };
}

function entryIdFromPath(path: string): string | undefined {
  const name = path.slice(path.lastIndexOf('/') + 1);
  if (!name.startsWith('entry-') || !name.endsWith('.md')) return undefined;
  return name.slice(0, -3);
}

function isCanonicalEntryPath(path: string): boolean {
  const prefix = '.aitp/topic/entries/';
  const name = path.slice(prefix.length);
  return path.startsWith(prefix) && name.startsWith('entry-') && name.endsWith('.md');
}

function bindCheckpointReceipt(
  research: IAgentResearchService,
  receipt: ResearchCheckpointReceipt,
): void {
  if (research.getPendingCheckpoint() !== null) {
    research.bindPendingCheckpointReceipt(receipt);
  }
}

export const AitpEnterInputSchema = z.object({
  workstream: AitpWorkstreamSchema.optional(),
  recent: z.number().int().positive().optional(),
}).strict();
export type AitpEnterInput = z.infer<typeof AitpEnterInputSchema>;
export interface IAitpEnterTool extends AgentTool<AitpEnterInput> { readonly _serviceBrand: undefined; }
export const IAitpEnterTool = createDecorator<IAitpEnterTool>('aitpEnterTool');

export class AitpEnterTool implements IAitpEnterTool {
  declare readonly _serviceBrand: undefined;
  readonly name = 'aitp_enter' as const;
  readonly description = 'Enter or resume an AITP research workspace. Returns recent entries, unresolved failures, next action, recent notes, counts, and warnings. Use at the start and end of a research session.';
  readonly parameters: Record<string, unknown> = toInputJsonSchema(AitpEnterInputSchema);

  constructor(
    @ISessionAitpAdapter private readonly adapter: ISessionAitpAdapter,
    @IAgentAitpModeService private readonly mode: IAgentAitpModeService,
  ) {}

  resolveExecution(args: AitpEnterInput): ToolExecution {
    return {
      description: 'AITP enter',
      approvalRule: this.name,
      execute: async () => {
        const err = requireReady(this.mode, this.adapter);
        if (err !== undefined) return errorResult(err);
        try {
          const result = await this.adapter.enter({ workstream: args.workstream, recent: args.recent });
          return ok(result);
        } catch (error) {
          if (error instanceof AitpResearchError) return errorResult(error.message);
          throw error;
        }
      },
    };
  }
}

export const AitpListInputSchema = z.object({
  workstream: AitpWorkstreamSchema.optional(),
  kind: AitpEntryKindSchema.optional(),
  since: NonemptyString.optional(),
}).strict();
export type AitpListInput = z.infer<typeof AitpListInputSchema>;
export interface IAitpListTool extends AgentTool<AitpListInput> { readonly _serviceBrand: undefined; }
export const IAitpListTool = createDecorator<IAitpListTool>('aitpListTool');

export class AitpListTool implements IAitpListTool {
  declare readonly _serviceBrand: undefined;
  readonly name = 'aitp_list' as const;
  readonly description = `List canonical AITP ledger entries with optional kind, since (ISO date/timestamp), and workstream filters. Superseded entries remain visible. Valid kinds: ${ENTRY_KINDS_DESC}. Use aitp_show for one complete entry and grep over .aitp/topic/ for full-text search.`;
  readonly parameters: Record<string, unknown> = toInputJsonSchema(AitpListInputSchema);

  constructor(
    @ISessionAitpAdapter private readonly adapter: ISessionAitpAdapter,
    @IAgentAitpModeService private readonly mode: IAgentAitpModeService,
  ) {}

  resolveExecution(args: AitpListInput): ToolExecution {
    return {
      description: 'AITP list',
      approvalRule: this.name,
      execute: async () => {
        const err = requireReady(this.mode, this.adapter);
        if (err !== undefined) return errorResult(err);
        try {
          const result = await this.adapter.list({ workstream: args.workstream, kind: args.kind, since: args.since });
          return ok(result);
        } catch (error) {
          if (error instanceof AitpResearchError) return errorResult(error.message);
          throw error;
        }
      },
    };
  }
}

export const AitpShowInputSchema = z.object({ id: NonemptyString }).strict();
export type AitpShowInput = z.infer<typeof AitpShowInputSchema>;
export interface IAitpShowTool extends AgentTool<AitpShowInput> { readonly _serviceBrand: undefined; }
export const IAitpShowTool = createDecorator<IAitpShowTool>('aitpShowTool');

export class AitpShowTool implements IAitpShowTool {
  declare readonly _serviceBrand: undefined;
  readonly name = 'aitp_show' as const;
  readonly description = 'Open one exact AITP ledger entry by ID and return its complete frontmatter and body. This is the only canonical way to read a full entry; do not Read the Markdown file directly.';
  readonly parameters: Record<string, unknown> = toInputJsonSchema(AitpShowInputSchema);

  constructor(
    @ISessionAitpAdapter private readonly adapter: ISessionAitpAdapter,
    @IAgentAitpModeService private readonly mode: IAgentAitpModeService,
  ) {}

  resolveExecution(args: AitpShowInput): ToolExecution {
    return {
      description: `AITP show ${args.id}`,
      approvalRule: this.name,
      execute: async () => {
        const err = requireReady(this.mode, this.adapter);
        if (err !== undefined) return errorResult(err);
        try {
          const result = await this.adapter.show({ id: args.id });
          return ok(result);
        } catch (error) {
          if (error instanceof AitpResearchError) return errorResult(error.message);
          throw error;
        }
      },
    };
  }
}

export const AitpCheckInputSchema = z.object({ workstream: AitpWorkstreamSchema.optional() }).strict();
export type AitpCheckInput = z.infer<typeof AitpCheckInputSchema>;
export interface IAitpCheckTool extends AgentTool<AitpCheckInput> { readonly _serviceBrand: undefined; }
export const IAitpCheckTool = createDecorator<IAitpCheckTool>('aitpCheckTool');

export class AitpCheckTool implements IAitpCheckTool {
  declare readonly _serviceBrand: undefined;
  readonly name = 'aitp_check' as const;
  readonly description = 'Validate the whole AITP store read-only and report findings. Exit code 1 means findings were reported (warnings or errors), NOT a failed tool call; read the JSON payload and investigate errors before continuing.';
  readonly parameters: Record<string, unknown> = toInputJsonSchema(AitpCheckInputSchema);

  constructor(
    @ISessionAitpAdapter private readonly adapter: ISessionAitpAdapter,
    @IAgentAitpModeService private readonly mode: IAgentAitpModeService,
    @IAgentResearchService private readonly research: IAgentResearchService,
  ) {}

  resolveExecution(args: AitpCheckInput): ToolExecution {
    return {
      description: 'AITP check',
      approvalRule: this.name,
      execute: async () => {
        const err = requireReady(this.mode, this.adapter);
        if (err !== undefined) return errorResult(err);
        try {
          const result = await this.adapter.check({ workstream: args.workstream });
          const pending = this.research.getPendingCheckpoint();
          if (pending !== null) {
            const receipt = toCheckpointCheckReceipt(result);
            if (pending.receipt?.save !== undefined) {
              // Keep the barrier's post-save evidence stable; an ordinary later
              // check must not rewrite the receipt used for commit verification.
              if (pending.receipt.postSaveCheck === undefined) {
                bindCheckpointReceipt(this.research, { postSaveCheck: receipt });
              }
            } else if (pending.receipt?.preSaveCheck === undefined) {
              bindCheckpointReceipt(this.research, { preSaveCheck: receipt });
            }
          }
          return ok(result);
        } catch (error) {
          if (error instanceof AitpResearchError) return errorResult(error.message);
          throw error;
        }
      },
    };
  }
}

export const AitpRecordPrepareInputSchema = z.object({
  kind: AitpEntryKindSchema,
  authority: AitpAuthoritySchema.optional(),
  created_by: NonemptyString.optional(),
  idempotency_key: NonemptyString.optional(),
  workstreams: WorkstreamsSchema,
  checkpoint_id: NonemptyString.optional(),
}).strict().refine(
  (d) => {
    const auth = d.authority ?? 'agent';
    if (auth === 'agent' && d.created_by === undefined) return false;
    return true;
  },
  { message: 'created_by is required when authority is "agent" (the default)' },
);
export type AitpRecordPrepareInput = z.infer<typeof AitpRecordPrepareInputSchema>;
export interface IAitpRecordPrepareTool extends AgentTool<AitpRecordPrepareInput> { readonly _serviceBrand: undefined; }
export const IAitpRecordPrepareTool = createDecorator<IAitpRecordPrepareTool>('aitpRecordPrepareTool');

export class AitpRecordPrepareTool implements IAitpRecordPrepareTool {
  declare readonly _serviceBrand: undefined;
  readonly name = 'aitp_record_prepare' as const;
  readonly description = `Prepare a new AITP durable-event Entry draft. The result is a draft path only: read the draft, replace every template prompt with real content, then call aitp_record_save. Valid kinds: ${ENTRY_KINDS_DESC}. Use authority "agent" for agent-authored records; created_by is required for agent authority. Pass checkpoint_id only when this Entry is the durable record for that pending Research checkpoint.`;
  readonly parameters: Record<string, unknown> = toInputJsonSchema(AitpRecordPrepareInputSchema);

  constructor(
    @ISessionAitpAdapter private readonly adapter: ISessionAitpAdapter,
    @IAgentAitpModeService private readonly mode: IAgentAitpModeService,
    @IAgentResearchService private readonly research: IAgentResearchService,
  ) {}

  resolveExecution(args: AitpRecordPrepareInput): ToolExecution {
    return {
      description: 'AITP record prepare',
      approvalRule: this.name,
      execute: async () => {
        const err = requireReady(this.mode, this.adapter);
        if (err !== undefined) return errorResult(err);
        const werr = requireReadyStrict(this.adapter);
        if (werr !== undefined) return errorResult(werr);
        try {
          const pending = this.research.getPendingCheckpoint();
          if (args.checkpoint_id !== undefined && pending?.checkpointId !== args.checkpoint_id) {
            return errorResult(`No pending Research checkpoint with id ${args.checkpoint_id}.`);
          }
          const bindsCheckpoint = args.checkpoint_id !== undefined && pending !== null;
          const result = await this.adapter.recordPrepare({
            kind: args.kind,
            authority: args.authority,
            createdBy: args.created_by,
            idempotencyKey: bindsCheckpoint ? pending.idempotencyKey : args.idempotency_key,
            workstreams: args.workstreams,
          });
          if (bindsCheckpoint) {
            const prepare = toPrepareReceipt(result, pending.idempotencyKey, args.workstreams);
            bindCheckpointReceipt(this.research, { prepare });
            if (result.status === 'existing' && isCanonicalEntryPath(result.path)) {
              // AITP's idempotency lookup also searches canonical Entries. There is
              // no draft to save in this case, so record the durable hit as an
              // already-saved receipt and establish the check baseline now.
              const preSaveReport = await this.adapter.check(
                args.workstreams?.length === 1 ? { workstream: args.workstreams[0] } : undefined,
              );
              bindCheckpointReceipt(this.research, {
                preSaveCheck: toCheckpointCheckReceipt(preSaveReport),
              });
              bindCheckpointReceipt(this.research, {
                save: toExistingSaveReceipt(result.path),
              });
            }
          }
          return ok(result);
        } catch (error) {
          if (error instanceof AitpResearchError) return errorResult(error.message);
          throw error;
        }
      },
    };
  }
}

export const AitpRecordSaveInputSchema = z.object({
  draft_path: NonemptyString,
  checkpoint_id: NonemptyString.optional(),
}).strict();
export type AitpRecordSaveInput = z.infer<typeof AitpRecordSaveInputSchema>;
export interface IAitpRecordSaveTool extends AgentTool<AitpRecordSaveInput> { readonly _serviceBrand: undefined; }
export const IAitpRecordSaveTool = createDecorator<IAitpRecordSaveTool>('aitpRecordSaveTool');

export class AitpRecordSaveTool implements IAitpRecordSaveTool {
  declare readonly _serviceBrand: undefined;
  readonly name = 'aitp_record_save' as const;
  readonly description = 'Validate and save a prepared AITP Entry draft into the canonical ledger. The draft must already be filled in. Pass checkpoint_id when saving the Entry bound to a pending Research checkpoint so Hakimi records the pre-save baseline and save receipt.';
  readonly parameters: Record<string, unknown> = toInputJsonSchema(AitpRecordSaveInputSchema);

  constructor(
    @ISessionAitpAdapter private readonly adapter: ISessionAitpAdapter,
    @IAgentAitpModeService private readonly mode: IAgentAitpModeService,
    @IAgentResearchService private readonly research: IAgentResearchService,
  ) {}

  resolveExecution(args: AitpRecordSaveInput): ToolExecution {
    return {
      description: 'AITP record save',
      approvalRule: this.name,
      execute: async () => {
        const err = requireReady(this.mode, this.adapter);
        if (err !== undefined) return errorResult(err);
        const werr = requireReadyStrict(this.adapter);
        if (werr !== undefined) return errorResult(werr);
        try {
          const pending = this.research.getPendingCheckpoint();
          if (args.checkpoint_id !== undefined && pending?.checkpointId !== args.checkpoint_id) {
            return errorResult(`No pending Research checkpoint with id ${args.checkpoint_id}.`);
          }
          const bindsCheckpoint = args.checkpoint_id !== undefined && pending !== null;
          if (bindsCheckpoint && pending.receipt?.prepare?.path !== args.draft_path) {
            return errorResult(
              `Draft ${args.draft_path} is not the prepared draft bound to checkpoint ${pending.checkpointId}.`,
            );
          }
          if (bindsCheckpoint) {
            const workstreams = pending.receipt?.prepare?.workstreams;
            const checkOptions = workstreams?.length === 1
              ? { workstream: workstreams[0] }
              : undefined;
            const preSaveReport = await this.adapter.check(checkOptions);
            bindCheckpointReceipt(this.research, {
              preSaveCheck: toCheckpointCheckReceipt(preSaveReport),
            });
          }
          const result = await this.adapter.recordSave({
            draftPath: args.draft_path,
          });
          if (bindsCheckpoint) {
            bindCheckpointReceipt(this.research, {
              save: toSaveReceipt(result, args.draft_path),
            });
          }
          return ok(result);
        } catch (error) {
          if (error instanceof AitpResearchError) return errorResult(error.message);
          throw error;
        }
      },
    };
  }
}

export const AitpNotePrepareInputSchema = z.object({
  mode: AitpNoteModeSchema,
  title: NonemptyString,
  created_by: NonemptyString,
  workstreams: WorkstreamsSchema,
}).strict();
export type AitpNotePrepareInput = z.infer<typeof AitpNotePrepareInputSchema>;
export interface IAitpNotePrepareTool extends AgentTool<AitpNotePrepareInput> { readonly _serviceBrand: undefined; }
export const IAitpNotePrepareTool = createDecorator<IAitpNotePrepareTool>('aitpNotePrepareTool');

export class AitpNotePrepareTool implements IAitpNotePrepareTool {
  declare readonly _serviceBrand: undefined;
  readonly name = 'aitp_note_prepare' as const;
  readonly description = 'Prepare a new AITP Note draft (working or theory). The result is a draft path only: read the draft, fill every section and pinned basis_refs, then call aitp_note_save. Use a working note when several durable entries form a conclusion chain a returning session would reconstruct.';
  readonly parameters: Record<string, unknown> = toInputJsonSchema(AitpNotePrepareInputSchema);

  constructor(
    @ISessionAitpAdapter private readonly adapter: ISessionAitpAdapter,
    @IAgentAitpModeService private readonly mode: IAgentAitpModeService,
  ) {}

  resolveExecution(args: AitpNotePrepareInput): ToolExecution {
    return {
      description: 'AITP note prepare',
      approvalRule: this.name,
      execute: async () => {
        const err = requireReady(this.mode, this.adapter);
        if (err !== undefined) return errorResult(err);
        const werr = requireReadyStrict(this.adapter);
        if (werr !== undefined) return errorResult(werr);
        try {
          const result = await this.adapter.notePrepare({
            mode: args.mode,
            title: args.title,
            createdBy: args.created_by,
            workstreams: args.workstreams,
          });
          return ok(result);
        } catch (error) {
          if (error instanceof AitpResearchError) return errorResult(error.message);
          throw error;
        }
      },
    };
  }
}

export const AitpNoteSaveInputSchema = z.object({
  draft_path: NonemptyString,
}).strict();
export type AitpNoteSaveInput = z.infer<typeof AitpNoteSaveInputSchema>;
export interface IAitpNoteSaveTool extends AgentTool<AitpNoteSaveInput> { readonly _serviceBrand: undefined; }
export const IAitpNoteSaveTool = createDecorator<IAitpNoteSaveTool>('aitpNoteSaveTool');

export class AitpNoteSaveTool implements IAitpNoteSaveTool {
  declare readonly _serviceBrand: undefined;
  readonly name = 'aitp_note_save' as const;
  readonly description = 'Validate and save a prepared AITP Note draft into the canonical ledger.';
  readonly parameters: Record<string, unknown> = toInputJsonSchema(AitpNoteSaveInputSchema);

  constructor(
    @ISessionAitpAdapter private readonly adapter: ISessionAitpAdapter,
    @IAgentAitpModeService private readonly mode: IAgentAitpModeService,
  ) {}

  resolveExecution(args: AitpNoteSaveInput): ToolExecution {
    return {
      description: 'AITP note save',
      approvalRule: this.name,
      execute: async () => {
        const err = requireReady(this.mode, this.adapter);
        if (err !== undefined) return errorResult(err);
        const werr = requireReadyStrict(this.adapter);
        if (werr !== undefined) return errorResult(werr);
        try {
          const result = await this.adapter.noteSave({
            draftPath: args.draft_path,
          });
          return ok(result);
        } catch (error) {
          if (error instanceof AitpResearchError) return errorResult(error.message);
          throw error;
        }
      },
    };
  }
}
