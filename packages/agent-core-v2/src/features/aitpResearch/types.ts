/**
 * `aitpResearch` domain — pure types and zod-safe DTOs for the AITP Research
 * Mode feature.
 *
 * Defines the three-axis research state model (workflow / epistemic /
 * persistence), the mode lifecycle phases, the adapter contract types, the
 * `ResearchStatusSnapshot`, and the `HumanSteeringCommand` union. No scoped
 * state — only types and zod schemas. Scope-agnostic.
 */

import { z } from 'zod';

export type AitpModePhase = 'inactive' | 'probing' | 'ready' | 'degraded';

export type ResearchLoopStatus = 'active' | 'paused';

export type AitpModeEntryActor = 'user' | 'model';

export type QuestionWorkflow = 'open' | 'active' | 'deferred' | 'blocked' | 'closed' | 'cancelled';

export type QuestionEpistemic = 'unknown' | 'candidate' | 'supported' | 'contradicted' | 'inconclusive';

export type QuestionPersistence = 'working' | 'pending_commit' | 'committed' | 'degraded';

export interface ResearchLine {
  readonly slug: string;
  readonly title: string;
  readonly objective?: string;
  readonly assessment?: string;
  readonly status: 'active' | 'paused' | 'completed' | 'blocked';
  readonly createdAt: number;
  readonly revision: number;
}

export interface ResearchQuestion {
  readonly id: string;
  readonly lineSlug: string;
  readonly wording: string;
  readonly assessment?: string;
  readonly priority: number;
  readonly neededEvidence: readonly string[];
  readonly evidenceRefs: readonly string[];
  readonly falsifierRefs: readonly string[];
  readonly nextBoundedAction?: string;
  readonly workflow: QuestionWorkflow;
  readonly epistemic: QuestionEpistemic;
  readonly persistence: QuestionPersistence;
  readonly revision: number;
}

export interface ResearchFocus {
  readonly questionId: string;
  readonly boundedAction?: string;
  readonly revision: number;
}

export interface ResearchCheckpoint {
  readonly checkpointId: string;
  readonly questionId?: string;
  readonly lineSlug?: string;
  readonly assessment?: string;
  readonly nextAction?: string;
  readonly idempotencyKey: string;
  readonly persistence: QuestionPersistence;
  readonly committedEntryId?: string;
  readonly createdAt: number;
}

export interface ResearchLineCreationInput {
  readonly slug: string;
  readonly title: string;
  readonly objective?: string;
  readonly assessment?: string;
}

export interface ResearchLineUpdateInput {
  readonly slug: string;
  readonly expectedRevision?: number;
  readonly title?: string;
  readonly objective?: string;
  readonly status?: ResearchLine['status'];
  readonly assessment?: string;
  readonly reason?: string;
}

export interface ResearchCommittedCursor {
  readonly checkpointId: string;
  readonly entryId?: string;
  readonly committedAt: number;
}

export interface ResearchStatusSnapshot {
  readonly mode: AitpModePhase;
  readonly loopStatus: ResearchLoopStatus;
  readonly currentLineSlug?: string;
  readonly currentFocus?: ResearchFocus;
  readonly currentQuestion?: ResearchQuestion;
  readonly questions: readonly ResearchQuestion[];
  readonly lines: readonly ResearchLine[];
  readonly openQuestionCount: number;
  readonly activeQuestionCount: number;
  readonly blockedQuestionCount: number;
  readonly alerts: readonly ResearchAlert[];
  readonly goalSummary?: { readonly status: string; readonly remainingTurns?: number };
  readonly aitpHealth: AitpAdapterHealth;
  readonly pendingCheckpoint?: ResearchCheckpoint;
  readonly latestCommittedCheckpoint?: ResearchCommittedCursor;
  readonly revision: number;
}

export interface ResearchAlert {
  readonly kind: 'contradiction' | 'blocked' | 'reopened' | 'commit_failed' | 'degraded' | 'stale';
  readonly message: string;
  readonly questionId?: string;
  readonly lineSlug?: string;
}

export interface AitpAdapterHealth {
  readonly phase: AitpModePhase;
  readonly contractVersion?: string;
  readonly pluginVersion?: string;
  readonly pythonVersion?: string;
  readonly lastCheckAt?: number;
  readonly lastError?: string;
  readonly notInitialized?: boolean;
}

export type HumanSteeringCommand =
  | { readonly kind: 'set_focus'; readonly questionId: string; readonly expectedRevision: number; readonly boundedAction?: string; readonly reason?: string }
  | { readonly kind: 'update_question'; readonly questionId: string; readonly expectedRevision: number; readonly wording?: string; readonly assessment?: string; readonly priority?: number; readonly workflow?: QuestionWorkflow; readonly epistemic?: QuestionEpistemic; readonly neededEvidence?: readonly string[]; readonly nextBoundedAction?: string; readonly reason?: string }
  | { readonly kind: 'switch_line'; readonly lineSlug: string; readonly expectedRevision: number; readonly reason?: string }
  | { readonly kind: 'pause_loop'; readonly expectedRevision: number; readonly reason?: string }
  | { readonly kind: 'resume_loop'; readonly expectedRevision: number; readonly reason?: string }
  | { readonly kind: 'reopen_question'; readonly questionId: string; readonly expectedRevision: number; readonly reason?: string }
  | { readonly kind: 'defer_question'; readonly questionId: string; readonly expectedRevision: number; readonly reason?: string }
  | { readonly kind: 'block_question'; readonly questionId: string; readonly expectedRevision: number; readonly reason?: string }
  | { readonly kind: 'close_question'; readonly questionId: string; readonly expectedRevision: number; readonly reason?: string };

export interface AitpContractIdentity {
  readonly contractVersion: string;
  readonly pluginVersion: string;
  readonly launcherPath: string;
  readonly pluginRoot: string;
}

export const AitpEntryKindSchema = z.enum([
  'observation', 'result', 'failure', 'decision',
  'source', 'code_change', 'run', 'closeout',
]);
export type AitpEntryKind = z.infer<typeof AitpEntryKindSchema>;

export const AitpAuthoritySchema = z.enum(['human', 'agent', 'source', 'tool']);
export type AitpAuthority = z.infer<typeof AitpAuthoritySchema>;

export const AitpNoteModeSchema = z.enum(['working', 'theory']);
export type AitpNoteMode = z.infer<typeof AitpNoteModeSchema>;

export const AitpWorkstreamSchema = z.string().regex(/^[a-z0-9][a-z0-9-]{0,62}$/);

export const AitpErrorEnvelopeSchema = z.object({
  status: z.literal('error'),
  code: z.string().min(1),
  message: z.string(),
}).strict();
export type AitpErrorEnvelope = z.infer<typeof AitpErrorEnvelopeSchema>;

const AitpWarningSchema = z.object({
  code: z.string(),
  path: z.string(),
  message: z.string(),
}).strict();

const AitpEnterCountsSchema = z.object({
  active: z.number().int().nonnegative(),
  superseded: z.number().int().nonnegative(),
  unresolved_failures: z.number().int().nonnegative(),
  malformed: z.number().int().nonnegative(),
  omitted_active: z.number().int().nonnegative(),
  active_newer_than_latest_working_note: z.number().int().nonnegative().nullable(),
}).strict();

const AitpEnterEntrySchema = z.object({
  id: z.string(),
  kind: AitpEntryKindSchema,
  summary: z.string(),
  limitations: z.array(z.string()),
  authority: AitpAuthoritySchema,
  created_at: z.string(),
  refs: z.array(z.record(z.string(), z.unknown())),
  source: z.string(),
  legacy_derived: z.boolean(),
}).strict();

const AitpEnterNoteSchema = z.object({
  id: z.string(),
  title: z.string(),
  mode: AitpNoteModeSchema,
  review_state: z.string(),
  created_at: z.string(),
  summary: z.string(),
  source: z.string(),
  legacy_derived: z.boolean(),
}).strict();

const AitpEnterPayloadBase = z.object({
  memory_status: z.enum(['available', 'partial', 'not_established']),
  root: z.string(),
  topic: z.object({
    id: z.string(),
    title: z.string(),
    goal: z.object({ text: z.string(), source: z.string() }).strict(),
  }).strict(),
  recent_entries: z.array(AitpEnterEntrySchema),
  unresolved_failures: z.array(AitpEnterEntrySchema),
  next_action: z.union([
    z.object({
      text: z.string(),
      entry_id: z.string(),
      authority: AitpAuthoritySchema,
      created_at: z.string(),
      source: z.string(),
    }).strict(),
    z.object({ status: z.literal('not_established'), source: z.null() }).strict(),
  ]),
  latest_working_note: z.object({
    id: z.string(),
    created_at: z.string(),
    source: z.string(),
  }).strict().nullable(),
  recent_notes: z.array(AitpEnterNoteSchema),
  counts: AitpEnterCountsSchema,
  warnings: z.array(AitpWarningSchema),
}).strict();

export const AitpEnter0_2Schema = AitpEnterPayloadBase.extend({
  schema: z.literal('aitp/enter-0.2'),
}).strict();

export const AitpEnter0_3Schema = AitpEnterPayloadBase.extend({
  schema: z.literal('aitp/enter-0.3'),
  workstream: AitpWorkstreamSchema,
}).strict();

export const AitpEnterSchema = z.discriminatedUnion('schema', [
  AitpEnter0_2Schema,
  AitpEnter0_3Schema,
]);

const AitpListEntrySchema = z.object({
  id: z.string(),
  kind: AitpEntryKindSchema,
  status: z.enum(['active', 'superseded']),
  created_at: z.string(),
  authority: AitpAuthoritySchema,
  summary: z.string(),
  legacy_derived: z.boolean(),
  source: z.string(),
}).strict();

const AitpListPayloadBase = z.object({
  root: z.string(),
  count: z.number().int().nonnegative(),
  entries: z.array(AitpListEntrySchema),
  warnings: z.array(AitpWarningSchema),
}).strict();

export const AitpList0_1Schema = AitpListPayloadBase.extend({
  schema: z.literal('aitp/list-0.1'),
}).strict();

export const AitpList0_2Schema = AitpListPayloadBase.extend({
  schema: z.literal('aitp/list-0.2'),
  workstream: AitpWorkstreamSchema,
}).strict();

export const AitpListSchema = z.discriminatedUnion('schema', [
  AitpList0_1Schema,
  AitpList0_2Schema,
]);

const AitpShowBaseSchema = z.object({
  schema: z.literal('aitp/show-0.1'),
  root: z.string(),
  id: z.string(),
  source: z.string(),
  legacy_derived: z.boolean(),
  body: z.string(),
});

export const AitpShow0_1Schema = z.discriminatedUnion('status', [
  AitpShowBaseSchema.extend({
    status: z.enum(['active', 'superseded']),
    frontmatter: z.record(z.string(), z.unknown()),
  }).strict(),
  AitpShowBaseSchema.extend({
    status: z.literal('malformed'),
    frontmatter: z.null(),
    warning: AitpWarningSchema,
  }).strict(),
]);

export const AitpShowSchema = AitpShow0_1Schema;

export const AitpCheckFindingSchema = z.object({
  level: z.enum(['error', 'warning']),
  code: z.string(),
  path: z.string(),
  message: z.string(),
}).strict();

const AitpCheckCountsBaseSchema = z.object({
  entries: z.number().int().nonnegative(),
  notes: z.number().int().nonnegative(),
  errors: z.number().int().nonnegative(),
  warnings: z.number().int().nonnegative(),
}).strict();

const AitpCheckCounts0_2Schema = AitpCheckCountsBaseSchema.extend({
  by_code: z.record(z.string(), z.object({
    errors: z.number().int().nonnegative(),
    warnings: z.number().int().nonnegative(),
  }).strict()),
  outside_scope: z.object({
    errors: z.number().int().nonnegative(),
    warnings: z.number().int().nonnegative(),
  }).strict(),
}).strict();

const AitpCheckPayloadBase = z.object({
  root: z.string(),
  status: z.enum(['clean', 'findings']),
  findings: z.array(AitpCheckFindingSchema),
}).strict();

export const AitpCheckReport0_1Schema = AitpCheckPayloadBase.extend({
  schema: z.literal('aitp/check-report-0.1'),
  counts: AitpCheckCountsBaseSchema,
}).strict();

export const AitpCheckReport0_2Schema = AitpCheckPayloadBase.extend({
  schema: z.literal('aitp/check-report-0.2'),
  counts: AitpCheckCounts0_2Schema,
  workstream: AitpWorkstreamSchema,
}).strict();

export const AitpCheckReportSchema = z.discriminatedUnion('schema', [
  AitpCheckReport0_1Schema,
  AitpCheckReport0_2Schema,
]);

export const AitpRecordPrepare0_Schema = z.discriminatedUnion('status', [
  z.object({
    status: z.literal('prepared'),
    id: z.string(),
    path: z.string(),
    save_command: z.string(),
  }).strict(),
  z.object({
    status: z.literal('existing'),
    path: z.string(),
    idempotency_key: z.string(),
  }).strict(),
]);
export type AitpRecordPrepareResult = z.infer<typeof AitpRecordPrepare0_Schema>;

export const AitpRecordSave0_Schema = z.object({
  status: z.enum(['saved', 'already_saved']),
  path: z.string(),
}).strict();
export type AitpRecordSaveResult = z.infer<typeof AitpRecordSave0_Schema>;

export const AitpNotePrepare0_Schema = z.object({
  status: z.literal('prepared'),
  id: z.string(),
  path: z.string(),
  save_command: z.string(),
}).strict();
export type AitpNotePrepareResult = z.infer<typeof AitpNotePrepare0_Schema>;

export const AitpNoteSave0_Schema = z.object({
  status: z.enum(['saved', 'already_saved']),
  path: z.string(),
}).strict();
export type AitpNoteSaveResult = z.infer<typeof AitpNoteSave0_Schema>;

export type AitpEnterResult = z.infer<typeof AitpEnterSchema>;
export type AitpListResult = z.infer<typeof AitpListSchema>;
export type AitpShowResult = z.infer<typeof AitpShowSchema>;
export type AitpCheckReport = z.infer<typeof AitpCheckReportSchema>;
export type AitpCheckFinding = z.infer<typeof AitpCheckFindingSchema>;

export function parseEnterResult(raw: unknown): AitpEnterResult {
  return AitpEnterSchema.parse(raw);
}

export function parseListResult(raw: unknown): AitpListResult {
  return AitpListSchema.parse(raw);
}

export function parseShowResult(raw: unknown): AitpShowResult {
  return AitpShowSchema.parse(raw);
}

export function parseCheckReport(raw: unknown): AitpCheckReport {
  return AitpCheckReportSchema.parse(raw);
}

export function parseRecordPrepareResult(raw: unknown): AitpRecordPrepareResult {
  return AitpRecordPrepare0_Schema.parse(raw);
}

export function parseRecordSaveResult(raw: unknown): AitpRecordSaveResult {
  return AitpRecordSave0_Schema.parse(raw);
}

export function parseNotePrepareResult(raw: unknown): AitpNotePrepareResult {
  return AitpNotePrepare0_Schema.parse(raw);
}

export function parseNoteSaveResult(raw: unknown): AitpNoteSaveResult {
  return AitpNoteSave0_Schema.parse(raw);
}

export function parseErrorEnvelope(raw: unknown): AitpErrorEnvelope {
  return AitpErrorEnvelopeSchema.parse(raw);
}

export const QuestionWorkflowSchema = z.enum([
  'open', 'active', 'deferred', 'blocked', 'closed', 'cancelled',
]);
export const QuestionEpistemicSchema = z.enum([
  'unknown', 'candidate', 'supported', 'contradicted', 'inconclusive',
]);
export const QuestionPersistenceSchema = z.enum([
  'working', 'pending_commit', 'committed', 'degraded',
]);
