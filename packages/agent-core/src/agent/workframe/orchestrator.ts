import type { Agent } from '..';
import type { PromptOrigin } from '../context';
import {
  detectAitpCuratedRagMoment,
  type AitpLiteratureSourceReviewHandoff,
  type AitpLiteratureSourceReviewHandoffInput,
  type AitpCuratedRagMoment,
  type AitpClaimRelationMap,
  type CompiledAitpProcessGraphSlice,
} from '../../aitp';
import type { AitpCuratedRagSearchResult } from '../../aitp/curated-rag';
import type {
  ResearchContextCuratedRagCarriedRefRepairResultSummary,
  ResearchContextPack,
  ResearchContextSourceContextReviewOutcomeSummary,
} from '../../research-context';
import { renderResearchContextPackReminder } from './context-pack';
import type { WorkFrame } from '../../research-action';
import { buildRuntimeToolExposurePlan } from '../tool-exposure';

export interface PreparedResearchTurnContext {
  readonly frame: WorkFrame;
  readonly pack: ResearchContextPack;
  readonly reminder: string;
}

const CURATED_RAG_CONTEXT_LIMIT = 3;

export class WorkFrameOrchestrator {
  constructor(private readonly agent: Agent) {}

  async prepareTurnContext(input: readonly { readonly type?: string; readonly text?: string }[]): Promise<PreparedResearchTurnContext | undefined> {
    const frame = this.inferFrame(input);
    if (frame === undefined) return undefined;
    if (this.agent.workFrames.active?.id !== frame.id) {
      this.agent.workFrames.switch(frame.id, { source: 'controller' });
    }
    const [freshAitp, freshClaimRelationMap] = await Promise.all([
      this.readAitpProcessGraphSlice(frame, input),
      this.readAitpClaimRelationMap(frame),
    ]);
    const aitp = freshAitp ?? this.cachedAitpContext(frame);
    const claimRelationMap =
      freshClaimRelationMap ?? this.cachedAitpClaimRelationMap(frame);
    const curatedRagMoment = detectAitpCuratedRagMoment({ prompt: input, workFrame: frame, aitp });
    const curatedRag = await this.searchCuratedRag(curatedRagMoment);
    const carriedRefRepair = detectCuratedRagCarriedRefRepair(input);
    const carriedRefRepairResult = detectCuratedRagCarriedRefRepairResult(input);
    const sourceContextReviewOutcome = detectSourceContextReviewOutcome(input);
    const literatureSourceReviewRequest = detectLiteratureSourceReviewRequest(input);
    const literatureSourceReviewHandoff = await this.readLiteratureSourceReviewHandoff(
      literatureSourceReviewRequest,
    );
    const pack = this.agent.researchContext.compileForWorkFrame(
      {
        workFrameId: frame.id,
        aitp,
        claimRelationMap,
        curatedRag,
        curatedRagReasonIds: curatedRagMoment?.reasons,
        curatedRagCarriedRefRepairActive: carriedRefRepair.active,
        curatedRagCarriedRefRepairTriggerTerms: carriedRefRepair.triggerTerms,
        curatedRagCarriedRefRepairFailureCode: carriedRefRepair.failureCode,
        curatedRagCarriedRefRepairFailurePath: carriedRefRepair.failurePath,
        curatedRagCarriedRefRepairResult: carriedRefRepairResult,
        sourceContextReviewOutcome,
        literatureSourceReviewHandoff,
      },
      { source: 'controller' },
    );
    this.agent.tools.applyRuntimeToolExposure(buildRuntimeToolExposurePlan(pack), {
      source: 'controller',
    });
    return {
      frame: this.agent.workFrames.requireFrame(frame.id),
      pack,
      reminder: renderResearchContextPackReminder(pack),
    };
  }

  private async searchCuratedRag(
    moment: AitpCuratedRagMoment | undefined,
  ): Promise<AitpCuratedRagSearchResult | undefined> {
    if (moment === undefined) return undefined;
    const provider = this.agent.aitpCuratedRagProvider;
    if (provider === undefined) return undefined;
    try {
      return await provider.searchCuratedRagCorpus({
        query: moment.query,
        limit: CURATED_RAG_CONTEXT_LIMIT,
      });
    } catch (error) {
      this.agent.log.warn('AITP curated RAG provider failed; continuing without RAG context', {
        error,
      });
      return undefined;
    }
  }

  private async readAitpProcessGraphSlice(
    frame: WorkFrame,
    prompt: readonly { readonly type?: string; readonly text?: string }[],
  ): Promise<CompiledAitpProcessGraphSlice | undefined> {
    const provider = this.agent.aitpProcessGraphProvider;
    if (provider === undefined) return undefined;
    try {
      return (await provider.getProcessGraphSlice({ workFrame: frame, prompt })) ?? undefined;
    } catch (error) {
      this.agent.log.warn('AITP process graph provider failed; continuing without AITP slice', {
        workFrameId: frame.id,
        error,
      });
      return undefined;
    }
  }

  private async readAitpClaimRelationMap(
    frame: WorkFrame,
  ): Promise<AitpClaimRelationMap | undefined> {
    const provider = this.agent.aitpClaimRelationMapProvider;
    if (provider === undefined) return undefined;
    try {
      return (await provider.getClaimRelationMap({ workFrame: frame })) ?? undefined;
    } catch (error) {
      this.agent.log.warn('AITP claim relation map provider failed; continuing without relation map', {
        workFrameId: frame.id,
        error,
      });
      return undefined;
    }
  }

  private async readLiteratureSourceReviewHandoff(
    request: AitpLiteratureSourceReviewHandoffInput | undefined,
  ): Promise<AitpLiteratureSourceReviewHandoff | undefined> {
    if (request === undefined) return undefined;
    const provider = this.agent.aitpLiteratureSourceReviewHandoffProvider;
    if (provider === undefined) return undefined;
    try {
      return await provider.getLiteratureSourceReviewHandoff(request);
    } catch (error) {
      this.agent.log.warn(
        'AITP literature source review handoff provider failed; continuing without handoff context',
        { error },
      );
      return undefined;
    }
  }

  private cachedAitpContext(frame: WorkFrame): CompiledAitpProcessGraphSlice | undefined {
    if (frame.contextPackId === undefined) return undefined;
    return this.agent.researchContext.getPack(frame.contextPackId)?.aitp?.compiled;
  }

  private cachedAitpClaimRelationMap(frame: WorkFrame): AitpClaimRelationMap | undefined {
    if (frame.contextPackId === undefined) return undefined;
    return this.agent.researchContext.getPack(frame.contextPackId)?.aitp?.claimRelationMap?.raw;
  }

  shouldInjectContext(lastInjectionIndex: number | null): boolean {
    if (lastInjectionIndex === null) return true;
    for (let index = lastInjectionIndex + 1; index < this.agent.context.history.length; index += 1) {
      const message = this.agent.context.history[index];
      if (message === undefined) continue;
      if (message.role === 'user') return true;
    }
    return false;
  }

  private inferFrame(input: readonly { readonly type?: string; readonly text?: string }[]): WorkFrame | undefined {
    const frames = this.agent.workFrames.list();
    if (frames.length === 0) return this.openImplicitAitpRecoveryFrame(input);
    if (frames.length === 1) return this.agent.workFrames.requireFrame(frames[0]!.id);

    const prompt = normalizePrompt(input);
    if (prompt.length === 0) {
      return this.agent.workFrames.active ?? this.agent.workFrames.requireFrame(frames[0]!.id);
    }

    const scored = frames
      .map((frame) => ({
        frame,
        score: scoreFrame(frame, prompt, frame.id === this.agent.workFrames.active?.id),
      }))
      .toSorted((a, b) => b.score - a.score || a.frame.id.localeCompare(b.frame.id));
    const winner = scored[0];
    if (winner === undefined) return this.agent.workFrames.active;
    if (winner.score <= 0) return this.agent.workFrames.active ?? winner.frame;
    return winner.frame;
  }

  private openImplicitAitpRecoveryFrame(
    input: readonly { readonly type?: string; readonly text?: string }[],
  ): WorkFrame | undefined {
    const rawPrompt = promptText(input);
    const prompt = rawPrompt.toLowerCase();
    const topicId = inferAitpTopicId(rawPrompt);
    if (topicId === undefined || !shouldOpenImplicitAitpRecoveryFrame(prompt, this.agent.config.cwd)) {
      return undefined;
    }
    return this.agent.workFrames.open(
      {
        id: `frame.aitp.${safeFrameToken(topicId)}`,
        domain: 'theoretical-physics/general',
        topic: topicId,
        goal: `Restore AITP topic ${topicId} current research state from typed records.`,
        sourceRefs: [`aitp:topic:${topicId}`],
        trustState: 'exploratory',
      },
      { source: 'controller' },
    );
  }
}

function shouldOpenImplicitAitpRecoveryFrame(prompt: string, cwd: string): boolean {
  const normalizedCwd = cwd.toLowerCase().replaceAll('\\', '/');
  const isTheoryWorkspace =
    normalizedCwd.includes('theoretical-physics') ||
    prompt.includes('theoretical physics') ||
    prompt.includes('理论物理');
  if (!isTheoryWorkspace && !prompt.includes('aitp')) return false;
  return [
    'aitp',
    'typed records',
    'typed record',
    'current research state',
    'research state',
    'recovery',
    'recover',
    'restore',
    'continuation',
    'semantic review',
    '恢复',
    '继续',
    '课题',
    '研究状态',
    '当前研究',
  ].some((term) => prompt.includes(term));
}

function inferAitpTopicId(prompt: string): string | undefined {
  const preferred = prompt.matchAll(/[`'"“”‘’]([A-Za-z0-9][A-Za-z0-9_.-]{2,160})[`'"“”‘’]/g);
  for (const match of preferred) {
    const candidate = normalizeTopicCandidate(match[1]);
    if (candidate !== undefined) return candidate;
  }
  const fallback = prompt.matchAll(/\b[A-Za-z][A-Za-z0-9]+(?:-[A-Za-z0-9]+){1,}\b/g);
  for (const match of fallback) {
    const candidate = normalizeTopicCandidate(match[0]);
    if (candidate !== undefined) return candidate;
  }
  return undefined;
}

function normalizeTopicCandidate(value: string | undefined): string | undefined {
  const candidate = value?.trim();
  if (candidate === undefined || candidate.length === 0) return undefined;
  const normalized = candidate.toLowerCase();
  if (!/^[a-z0-9][a-z0-9_.-]{2,160}$/.test(normalized)) return undefined;
  if (!normalized.includes('-')) return undefined;
  if (
    [
      'aitp-v5',
      'kimi-code',
      'theoretical-physics',
      'typed-records',
      'research-state',
      'current-research-state',
    ].includes(normalized)
  ) {
    return undefined;
  }
  return normalized;
}

function safeFrameToken(value: string): string {
  return value.toLowerCase().replaceAll(/[^a-z0-9]+/g, '-').replaceAll(/^-|-$/g, '').slice(0, 64) || 'topic';
}

function detectSourceContextReviewOutcome(
  input: readonly { readonly type?: string; readonly text?: string }[],
): ResearchContextSourceContextReviewOutcomeSummary | undefined {
  const prompt = promptText(input);
  if (!prompt.toLowerCase().includes('source_context_review_outcome')) return undefined;
  const attrs = extractTagAttrs(prompt, 'source_context_review_outcome');
  if (attrs === undefined) return undefined;
  const decision = sourceContextReviewDecision(attrs.get('decision'));
  const required = {
    callId: attrs.get('call_id'),
    outcome: attrs.get('outcome'),
    reviewedCanonicalRef: attrs.get('reviewed_canonical_ref'),
    reviewedEvidenceRef: attrs.get('reviewed_evidence_ref'),
    claimScope: attrs.get('claim_scope'),
    chunkScope: attrs.get('chunk_scope'),
    rationale: attrs.get('rationale'),
    nextActionId: attrs.get('next_action_id'),
  };
  if (
    decision === undefined ||
    required.callId === undefined ||
    !isResearchActionOutcome(required.outcome) ||
    required.reviewedCanonicalRef === undefined ||
    required.reviewedEvidenceRef === undefined ||
    required.claimScope === undefined ||
    required.chunkScope === undefined ||
    required.rationale === undefined ||
    required.nextActionId === undefined
  ) {
    return undefined;
  }
  if (
    attrs.get('source') !== 'ResearchAction.finish_action_call' ||
    attrs.get('action_id') !== 'source.review_context' ||
    attrs.get('requires_explicit_next_action') !== 'true' ||
    attrs.get('bridge_called') !== 'false' ||
    attrs.get('executes_write_now') !== 'false' ||
    attrs.get('mutates_next_payload_now') !== 'false' ||
    attrs.get('infers_payload_values') !== 'false' ||
    attrs.get('records_validation_result') !== 'false' ||
    attrs.get('source_support_result') !== 'false' ||
    attrs.get('claim_trust_mutation') !== 'none' ||
    attrs.get('can_update_claim_trust') !== 'false'
  ) {
    return undefined;
  }
  if (nextActionIdForSourceReviewDecision(decision) !== required.nextActionId) return undefined;
  return {
    source: 'ResearchAction.finish_action_call',
    actionId: 'source.review_context',
    callId: required.callId,
    outcome: required.outcome,
    decision,
    reviewedCanonicalRef: required.reviewedCanonicalRef,
    reviewedEvidenceRef: required.reviewedEvidenceRef,
    claimScope: required.claimScope,
    chunkScope: required.chunkScope,
    rationale: required.rationale,
    nextActionId: required.nextActionId,
    requiresExplicitNextAction: true,
    bridgeCalled: false,
    executesWriteNow: false,
    mutatesNextPayloadNow: false,
    infersPayloadValues: false,
    recordsValidationResult: false,
    sourceSupportResult: false,
    claimTrustMutation: 'none',
    canUpdateClaimTrust: false,
  };
}

function detectLiteratureSourceReviewRequest(
  input: readonly { readonly type?: string; readonly text?: string }[],
): AitpLiteratureSourceReviewHandoffInput | undefined {
  const prompt = promptText(input);
  if (!prompt.toLowerCase().includes('aitp_literature_source_review_request')) {
    return undefined;
  }
  const attrs = extractTagAttrs(prompt, 'aitp_literature_source_review_request');
  if (attrs === undefined) return undefined;
  const required = {
    sessionId: attrs.get('session_id'),
    uri: attrs.get('uri'),
    label: attrs.get('label'),
    shortSummary: attrs.get('short_summary') ?? attrs.get('summary'),
    detectedRelevance: attrs.get('detected_relevance'),
  };
  if (
    required.sessionId === undefined ||
    required.uri === undefined ||
    required.label === undefined ||
    required.shortSummary === undefined ||
    required.detectedRelevance === undefined
  ) {
    return undefined;
  }
  if (
    attrs.get('read_surface_effect') !== 'handoff_context_only' ||
    attrs.get('read_only') !== 'true' ||
    attrs.get('requires_explicit_next_action') !== 'true' ||
    attrs.get('bridge_called') !== 'false' ||
    attrs.get('executes_write_now') !== 'false' ||
    attrs.get('mutates_next_payload_now') !== 'false' ||
    attrs.get('infers_payload_values') !== 'false' ||
    attrs.get('summary_inputs_trusted') !== 'false' ||
    attrs.get('orientation_only') !== 'true' ||
    attrs.get('can_update_kernel_state') !== 'false' ||
    attrs.get('records_validation_result') !== 'false' ||
    attrs.get('source_support_result') !== 'false' ||
    attrs.get('evidence_created') !== 'false' ||
    attrs.get('validation_created') !== 'false' ||
    attrs.get('write_executed') !== 'false' ||
    attrs.get('trust_update_forbidden') !== 'true' ||
    attrs.get('claim_trust_mutation') !== 'none' ||
    attrs.get('can_update_claim_trust') !== 'false'
  ) {
    return undefined;
  }
  return {
    sessionId: required.sessionId,
    uri: required.uri,
    label: required.label,
    externalId: attrs.get('external_id'),
    shortSummary: required.shortSummary,
    detectedRelevance: required.detectedRelevance,
    optionalClaimId: attrs.get('optional_claim_id') ?? attrs.get('claim_id'),
    scopedOutput: attrs.get('scoped_output'),
    reviewedRefs: commaList(attrs.get('reviewed_refs')),
  };
}

export function isResearchContextInjectionOrigin(origin: PromptOrigin | undefined): boolean {
  return origin?.kind === 'injection' && origin.variant === 'research_context';
}

function normalizePrompt(input: readonly { readonly type?: string; readonly text?: string }[]): string {
  return input
    .filter((part) => part.type === 'text' && typeof part.text === 'string')
    .map((part) => part.text!.toLowerCase())
    .join(' ');
}

function detectCuratedRagCarriedRefRepair(
  input: readonly { readonly type?: string; readonly text?: string }[],
): {
  readonly active: boolean;
  readonly triggerTerms: readonly string[];
  readonly failureCode?: string | undefined;
  readonly failurePath?: string | undefined;
} {
  const prompt = normalizePrompt(input);
  if (prompt.length === 0) return { active: false, triggerTerms: [] };
  const rawPrompt = promptText(input);
  const triggerTerms = [
    'promotion_carried_ref_handoffs',
    'carried_ref_handoff_failure',
    'carried_ref_handoff_diagnostic_taxonomy',
    'carried ref handoff',
    'carried-ref handoff',
  ].filter((term) => prompt.includes(term));
  const repairTerms = ['repair', 'fix', 'malformed', 'failed', 'failure', 'mismatch'].filter((term) =>
    prompt.includes(term),
  );
  if (triggerTerms.length === 0 || repairTerms.length === 0) {
    return { active: false, triggerTerms: [] };
  }
  const failure = extractCarriedRefHandoffFailure(rawPrompt);
  return {
    active: true,
    triggerTerms: [...triggerTerms, ...repairTerms],
    failureCode: failure?.code,
    failurePath: failure?.path,
  };
}

function promptText(input: readonly { readonly type?: string; readonly text?: string }[]): string {
  return input
    .filter((part) => part.type === 'text' && typeof part.text === 'string')
    .map((part) => part.text!)
    .join(' ');
}

function extractCarriedRefHandoffFailure(
  prompt: string,
): { readonly code: string; readonly path: string } | undefined {
  if (!prompt.toLowerCase().includes('carried_ref_handoff_failure')) return undefined;
  const code = extractPromptField(prompt, 'code');
  const path = extractPromptField(prompt, 'path');
  if (code === undefined || path === undefined) return undefined;
  if (!/^promotion_carried_ref_handoffs\[\d+\]\.[A-Za-z0-9_]+$/.test(path)) return undefined;
  return { code, path };
}

function detectCuratedRagCarriedRefRepairResult(
  input: readonly { readonly type?: string; readonly text?: string }[],
): ResearchContextCuratedRagCarriedRefRepairResultSummary | undefined {
  const prompt = promptText(input);
  if (!prompt.toLowerCase().includes('carried_ref_repair_result_summary')) return undefined;
  const attrs = extractTagAttrs(prompt, 'carried_ref_repair_result_summary');
  if (attrs === undefined) return undefined;
  const refKind = repairResultRefKind(attrs.get('ref_kind'));
  const resultKind = repairResultRefKind(attrs.get('result_kind'));
  const required = {
    handoffId: attrs.get('handoff_id'),
    confirmationId: attrs.get('confirmation_id'),
    completedStage: attrs.get('completed_stage'),
    completedOperation: attrs.get('completed_operation'),
    recordId: attrs.get('record_id'),
    canonicalRef: attrs.get('canonical_ref'),
    evidenceRef: attrs.get('evidence_ref'),
    readinessChecklistId: attrs.get('readiness_checklist_id'),
  };
  if (
    refKind === undefined ||
    resultKind === undefined ||
    required.handoffId === undefined ||
    required.confirmationId === undefined ||
    required.completedStage === undefined ||
    required.completedOperation === undefined ||
    required.recordId === undefined ||
    required.canonicalRef === undefined ||
    required.evidenceRef === undefined ||
    required.readinessChecklistId === undefined
  ) {
    return undefined;
  }
  if (
    attrs.get('source') !== 'execute_aitp_write_bridge_result' ||
    attrs.get('reviewed_overrides_required') !== 'true' ||
    attrs.get('readiness_inspection_required') !== 'true' ||
    attrs.get('explicit_execute_precheck_passed') !== 'true' ||
    attrs.get('bridge_called') !== 'true' ||
    attrs.get('result_written_by_aitp') !== 'true'
  ) {
    return undefined;
  }
  return {
    source: 'execute_aitp_write_bridge_result',
    handoffId: required.handoffId,
    confirmationId: required.confirmationId,
    completedStage: required.completedStage,
    completedOperation: required.completedOperation,
    resultKind,
    recordId: required.recordId,
    canonicalRef: required.canonicalRef,
    evidenceRef: required.evidenceRef,
    refKind,
    repairHintOperations: commaList(attrs.get('repair_hint_operations')),
    selectedWriteDiffersFromRepairHints:
      attrs.get('selected_write_differs_from_repair_hints') === 'true',
    readinessChecklistId: required.readinessChecklistId,
    reviewedOverridesRequired: true,
    readinessInspectionRequired: true,
    explicitExecutePrecheckPassed: true,
    bridgeCalled: true,
    resultWrittenByAitp: true,
    nextPayloadMutatedNow: false,
    nextWriteExecutedNow: false,
    recordsValidationResult: false,
    sourceSupportResult: false,
    claimTrustMutation: 'none',
    canUpdateClaimTrust: false,
    requiresExplicitNextDraft: true,
  };
}

function extractTagAttrs(prompt: string, tagName: string): Map<string, string> | undefined {
  const match = new RegExp(`<${tagName}\\s+([^>]*)>`, 'i').exec(prompt);
  if (match?.[1] === undefined) return undefined;
  const attrs = new Map<string, string>();
  for (const attr of match[1].matchAll(/([A-Za-z_][A-Za-z0-9_-]*)="([^"]*)"/g)) {
    if (attr[1] !== undefined && attr[2] !== undefined) attrs.set(attr[1], attr[2]);
  }
  return attrs;
}

function repairResultRefKind(
  value: string | undefined,
): ResearchContextCuratedRagCarriedRefRepairResultSummary['refKind'] | undefined {
  if (value === 'source_asset' || value === 'reference_location' || value === 'evidence') {
    return value;
  }
  return undefined;
}

function sourceContextReviewDecision(
  value: string | undefined,
): ResearchContextSourceContextReviewOutcomeSummary['decision'] | undefined {
  if (
    value === 'extract' ||
    value === 'validate_check_source_support' ||
    value === 'fresh_aitp_draft' ||
    value === 'blocker'
  ) {
    return value;
  }
  return undefined;
}

function isResearchActionOutcome(
  value: string | undefined,
): value is ResearchContextSourceContextReviewOutcomeSummary['outcome'] {
  return value === 'pass' || value === 'fail' || value === 'blocked' || value === 'inconclusive';
}

function nextActionIdForSourceReviewDecision(
  decision: ResearchContextSourceContextReviewOutcomeSummary['decision'],
): string {
  switch (decision) {
    case 'extract':
      return 'source.capture_source_excerpt';
    case 'validate_check_source_support':
      return 'validate.check_source_support';
    case 'fresh_aitp_draft':
      return 'draft_aitp_curated_rag_write_bridge_call';
    case 'blocker':
      return 'aitp.create_open_obligation';
  }
}

function commaList(value: string | undefined): readonly string[] {
  if (value === undefined || value.length === 0) return [];
  return value.split(',').map((item) => item.trim()).filter((item) => item.length > 0);
}

function extractPromptField(prompt: string, field: string): string | undefined {
  const quoted = new RegExp(`\\b${field}\\s*=\\s*["']([^"']+)["']`, 'i').exec(prompt);
  const value = quoted?.[1] ?? new RegExp(`\\b${field}\\s*=\\s*([^\\s>]+)`, 'i').exec(prompt)?.[1];
  if (value === undefined) return undefined;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

function scoreFrame(frame: WorkFrame, prompt: string, active: boolean): number {
  const haystacks = [frame.id, frame.domain, frame.topic, frame.goal];
  let score = active ? 2 : 0;
  for (const haystack of haystacks) {
    for (const token of tokenize(haystack)) {
      if (token.length < 3) continue;
      if (prompt.includes(token)) score += token.length > 8 ? 4 : 3;
    }
  }
  return score;
}

function tokenize(input: string): readonly string[] {
  return input
    .toLowerCase()
    .split(/[^a-z0-9]+/g)
    .map((token) => token.trim())
    .filter((token) => token.length > 0);
}
