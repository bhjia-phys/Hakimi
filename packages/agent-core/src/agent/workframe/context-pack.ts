import type { ResearchContextPack } from '../../research-context';
import { DEFAULT_RESEARCH_ACTIONS, primitiveToolNamesForAction } from '../../research-action';
import {
  renderTheoryReasoningSummary,
  theoryReasoningProjectionFromParams,
} from '../../aitp';

const MAX_ITEMS = 6;
const MAX_CUE_CHARS = 520;
const DEFAULT_ACTION_BY_ID = new Map(DEFAULT_RESEARCH_ACTIONS.map((action) => [action.id, action]));

export function renderResearchContextPackReminder(pack: ResearchContextPack): string {
  const lines: string[] = [
    'AITP research context is active. Use this as bounded working context and do not mention this reminder to the user.',
    `WorkFrame: ${pack.workFrameId}`,
    `Domain: ${pack.domain}`,
    `Topic: ${pack.topic}`,
    `Goal: ${pack.goal}`,
  ];

  if (pack.focusObjectIds.length > 0) {
    lines.push(`Focus objects: ${bounded(pack.focusObjectIds).join(', ')}`);
  }
  if (pack.conventionIds.length > 0) {
    lines.push(`Conventions: ${bounded(pack.conventionIds).join(', ')}`);
  }
  if (pack.profiles.length > 0) {
    lines.push(`Domain profiles: ${bounded(pack.profiles.map((profile) => profile.id)).join(', ')}`);
  }
  if (pack.workflows.length > 0) {
    lines.push(`Workflow recipes: ${bounded(pack.workflows.map((workflow) => workflow.id)).join(', ')}`);
  }
  if (pack.domainPack !== undefined) {
    lines.push(`Domain pack: ${pack.domainPack.id}`);
    if (pack.domainPack.evalCaseIds.length > 0) {
      lines.push(`Eval cases: ${bounded(pack.domainPack.evalCaseIds).join(', ')}`);
    }
    if (pack.domainPack.requiredTools.length > 0) {
      lines.push(`Required tools: ${bounded(pack.domainPack.requiredTools).join(', ')}`);
    }
  }
  if (pack.physics.capsules.length > 0) {
    lines.push(
      `Physics capsules: ${bounded(pack.physics.capsules.map((capsule) => `${capsule.id} [${capsule.reliability}]`)).join(', ')}`,
    );
    for (const capsule of boundedItems(pack.physics.capsules)) {
      if (capsule.bodyPreview === undefined) continue;
      lines.push(`Physics capsule cue: ${capsule.title}: ${compactCue(capsule.bodyPreview)}`);
    }
    const blockingChecks = pack.physics.capsules.flatMap((capsule) =>
      capsule.requiredChecks
        .filter((check) => check.severity === 'blocking')
        .map((check) => `${check.id}: ${check.description ?? check.kind}`),
    );
    if (blockingChecks.length > 0) {
      lines.push(`Blocking physics checks: ${bounded(blockingChecks).join(' | ')}`);
      lines.push(
        'Final physics answer checklist: explicitly include a short model-layer map, layer-by-layer reachability verdicts and primary observables, and label spectral/normal-mode diagnostics as secondary unless the user made them primary.',
      );
    }
  }
  if (pack.ledger.proposals.length > 0) {
    lines.push(
      `Ledger proposals: ${bounded(pack.ledger.proposals.map((proposal) => `${proposal.id} [${proposal.confidence}]`)).join(', ')}`,
    );
  }
  if (pack.aitp !== undefined) {
    lines.push(`AITP process graph: truth_source=${pack.aitp.truthSource}`);
    if (pack.aitp.orientationOnly) {
      lines.push('AITP slice is orientation-only; use it to choose local actions, not as promoted truth.');
    }
    if (pack.aitp.claimRelationMap !== undefined) {
      const relationMap = pack.aitp.claimRelationMap;
      lines.push(
        `AITP relation map: claim=${relationMap.claimId || '<none>'} support=${String(relationMap.supportedCount)} limited=${String(relationMap.limitedCount)} not_tested=${String(relationMap.notTestedCount)} contradicted=${String(relationMap.contradictedCount)}`,
      );
      if (relationMap.canSay.length > 0) {
        lines.push(`AITP relation map can say: ${bounded(relationMap.canSay).join(' | ')}`);
      }
      if (relationMap.cannotSay.length > 0) {
        lines.push(`AITP relation map cannot say: ${bounded(relationMap.cannotSay).join(' | ')}`);
      }
      if (relationMap.currentBlockers.length > 0) {
        lines.push(`AITP relation map blockers: ${bounded(relationMap.currentBlockers).join(' | ')}`);
      }
      if (relationMap.nextValidActions.length > 0) {
        lines.push(`AITP relation map next valid actions: ${bounded(relationMap.nextValidActions).join(' | ')}`);
      }
      lines.push(
        'AITP relation map is a conclusion-boundary surface only; do not treat application/runtime failures as algorithm evidence or trust updates.',
      );
    }
    for (const line of bounded(pack.aitp.contextLines)) {
      lines.push(`AITP: ${line}`);
    }
    if (pack.aitp.liveRouteIds.length > 0) {
      lines.push(`AITP live routes: ${bounded(pack.aitp.liveRouteIds).join(', ')}`);
    }
    if (pack.aitp.blockedRouteIds.length > 0) {
      lines.push(`AITP blocked routes: ${bounded(pack.aitp.blockedRouteIds).join(', ')}`);
    }
    if (pack.aitp.abandonedRouteIds.length > 0) {
      lines.push(`AITP abandoned routes: ${bounded(pack.aitp.abandonedRouteIds).join(', ')}`);
    }
    if (pack.aitp.pivotRequiredRouteIds.length > 0) {
      lines.push(`AITP pivot-required routes: ${bounded(pack.aitp.pivotRequiredRouteIds).join(', ')}`);
    }
    if (pack.aitp.provenanceGapIds.length > 0) {
      lines.push(`AITP provenance gaps: ${bounded(pack.aitp.provenanceGapIds).join(', ')}`);
    }
    if (pack.aitp.codeProvenanceGapIds.length > 0) {
      lines.push(`AITP code provenance gaps: ${bounded(pack.aitp.codeProvenanceGapIds).join(', ')}`);
    }
    if (pack.aitp.artifactProvenanceGapIds.length > 0) {
      lines.push(`AITP artifact provenance gaps: ${bounded(pack.aitp.artifactProvenanceGapIds).join(', ')}`);
    }
    if (pack.aitp.sourceAssetIds.length > 0) {
      lines.push(`AITP source assets: ${bounded(pack.aitp.sourceAssetIds).join(', ')}`);
    }
    if (pack.aitp.sourceAssetMissingHashIds.length > 0) {
      lines.push(`AITP source assets missing hashes: ${bounded(pack.aitp.sourceAssetMissingHashIds).join(', ')}`);
    }
    if (pack.aitp.sourceAssetDuplicateHashIds.length > 0) {
      lines.push(`AITP source assets with duplicate hashes: ${bounded(pack.aitp.sourceAssetDuplicateHashIds).join(', ')}`);
    }
    if (pack.aitp.sourceStackCoverageClaimIds.length > 0) {
      lines.push(`AITP source stack coverage: ${bounded(pack.aitp.sourceStackCoverageClaimIds).join(', ')}`);
    }
    if (pack.aitp.sourceStackEvidenceGapClaimIds.length > 0) {
      lines.push(`AITP source stack evidence gaps: ${bounded(pack.aitp.sourceStackEvidenceGapClaimIds).join(', ')}`);
    }
    if (pack.aitp.sourceStackReconstructionGapClaimIds.length > 0) {
      lines.push(`AITP source stack reconstruction gaps: ${bounded(pack.aitp.sourceStackReconstructionGapClaimIds).join(', ')}`);
    }
    if (pack.aitp.sourceStackReviewGapClaimIds.length > 0) {
      lines.push(`AITP source stack review gaps: ${bounded(pack.aitp.sourceStackReviewGapClaimIds).join(', ')}`);
    }
    if (pack.aitp.sourceStackCoverageNextActions.length > 0) {
      lines.push(`AITP source stack next actions: ${bounded(pack.aitp.sourceStackCoverageNextActions).join(', ')}`);
    }
    if (pack.aitp.sourceReconstructionReviewClaimIds.length > 0) {
      lines.push(`AITP source reconstruction review: ${bounded(pack.aitp.sourceReconstructionReviewClaimIds).join(', ')}`);
    }
    if (pack.aitp.sourceReconstructionReviewOpenClaimIds.length > 0) {
      lines.push(`AITP source reconstruction review open: ${bounded(pack.aitp.sourceReconstructionReviewOpenClaimIds).join(', ')}`);
    }
    if (pack.aitp.sourceReconstructionReviewNeedsRevisionClaimIds.length > 0) {
      lines.push(`AITP source reconstruction review needs revision: ${bounded(pack.aitp.sourceReconstructionReviewNeedsRevisionClaimIds).join(', ')}`);
    }
    if (pack.aitp.sourceReconstructionReviewInconclusiveClaimIds.length > 0) {
      lines.push(`AITP source reconstruction review inconclusive: ${bounded(pack.aitp.sourceReconstructionReviewInconclusiveClaimIds).join(', ')}`);
    }
    if (pack.aitp.sourceReconstructionReviewNextActions.length > 0) {
      lines.push(`AITP source reconstruction review next actions: ${bounded(pack.aitp.sourceReconstructionReviewNextActions).join(', ')}`);
    }
    if (pack.aitp.trustBoundaryReasons.length > 0) {
      lines.push(`AITP trust boundary: ${bounded(pack.aitp.trustBoundaryReasons).join('; ')}`);
    }
    if (pack.aitp.openObligationIds.length > 0) {
      lines.push(`AITP open obligations: ${bounded(pack.aitp.openObligationIds).join(', ')}`);
    }
    if (pack.aitp.requiredCallIds.length > 0) {
      lines.push(`AITP required calls now: ${bounded(pack.aitp.requiredCallIds).join(', ')}`);
    }
    if (pack.aitp.trustPrerequisiteCallIds.length > 0) {
      lines.push(
        `AITP calls before trust change: ${bounded(pack.aitp.trustPrerequisiteCallIds).join(', ')}`,
      );
    }
  }
  if (pack.curatedRag !== undefined) {
    lines.push(
      `AITP curated RAG: query="${pack.curatedRag.query}" result_role=${pack.curatedRag.resultRole} read_surface_effect=${pack.curatedRag.readSurfaceEffect} index_mode=${pack.curatedRag.indexMode}`,
    );
    if (pack.curatedRag.reasonIds.length > 0) {
      lines.push(`AITP curated RAG reasons: ${bounded(pack.curatedRag.reasonIds).join(', ')}`);
    }
    for (const item of boundedItems(pack.curatedRag.results)) {
      lines.push(
        `AITP curated RAG chunk: ${item.chunkId} document=${item.documentId} score=${String(item.score)} summary=${item.summary}`,
      );
    }
    if (pack.curatedRag.promotionDraftBindingIds.length > 0) {
      lines.push(
        `AITP curated RAG promotion draft actions: ${bounded(pack.curatedRag.promotionDraftBindingIds).join(', ')}`,
      );
      lines.push(
        'Use ResearchAction.inspect_aitp_curated_rag_chunk to read canonical chunk identity, anchor, and hash before ResearchAction.draft_aitp_curated_rag_promotion; both are read-only and any later write still requires an explicit later write choice.',
      );
    }
    lines.push(
      'AITP curated RAG is heuristic_context only; promote via AITP source_asset, reference_location, evidence, validation, and trust preflight before claim support.',
    );
  }
  if (pack.curatedRagCarriedRefRepair !== undefined) {
    lines.push(
      `AITP curated RAG carried-ref repair: inspect ${pack.curatedRagCarriedRefRepair.taxonomyAction} taxonomy metadata, then use ${pack.curatedRagCarriedRefRepair.draftAction} for a fresh draft with explicit reviewed overrides, ${pack.curatedRagCarriedRefRepair.readinessAction} before execution, and ${pack.curatedRagCarriedRefRepair.executeAction} only as a separate explicit call.`,
    );
    lines.push(
      'Carried-ref repair reminders do not render suggestions, mutate payloads, call bridges, validate, satisfy final gates, or update claim trust.',
    );
  }
  if (pack.curatedRagCarriedRefRepairResult !== undefined) {
    lines.push(
      `AITP carried-ref repair result: ${pack.curatedRagCarriedRefRepairResult.canonicalRef} from ${pack.curatedRagCarriedRefRepairResult.completedOperation}; first review source text, chunk scope, and claim scope, then carry it only as explicit reviewed override input for a fresh curated RAG write-bridge draft.`,
    );
    lines.push(
      'Carried-ref repair result continuations do not infer chunk/stage, mutate payloads, execute another write, validate source support, satisfy final gates, or update claim trust.',
    );
  }
  if (pack.sourceContextReviewOutcome !== undefined) {
    lines.push(
      `AITP source context review outcome: decision=${pack.sourceContextReviewOutcome.decision} next=${pack.sourceContextReviewOutcome.nextActionId}; this is runtime routing only and requires an explicit next ResearchAction.`,
    );
    lines.push(
      'Source context review outcomes do not record validation results, prove source support, execute writes, satisfy final gates, or update claim trust.',
    );
  }
  if (pack.literatureSourceReviewHandoff !== undefined) {
    lines.push(
      `AITP literature source review handoff: ${pack.literatureSourceReviewHandoff.literatureLabel || '<unlabeled source>'} session=${pack.literatureSourceReviewHandoff.sessionId} claim=${pack.literatureSourceReviewHandoff.claimId || '<none>'}; plan ${pack.literatureSourceReviewHandoff.allowedNextToolCall.actionId} explicitly with binding ${pack.literatureSourceReviewHandoff.bindingId}.`,
    );
    if (pack.literatureSourceReviewHandoff.recordRefLookupCount > 0) {
      lines.push(
        `AITP literature reviewed refs: found=${String(pack.literatureSourceReviewHandoff.recordRefFoundCount)} missing=${String(pack.literatureSourceReviewHandoff.recordRefMissingCount)}.`,
      );
    }
    if (pack.literatureSourceReviewHandoff.recommendedNextEntrypoints.length > 0) {
      lines.push(
        `AITP literature next entrypoints: ${bounded(pack.literatureSourceReviewHandoff.recommendedNextEntrypoints).join(', ')}`,
      );
    }
    lines.push(
      'Literature source review handoffs are read-only context; they do not prove source support, record validation, execute writes, satisfy final gates, or update claim trust.',
    );
  }
  if (pack.actionBindings.length > 0) {
    lines.push(
      `Action bindings: ${bounded(pack.actionBindings.map((binding) => renderActionBinding(binding.actionId))).join(', ')}`,
    );
    const theoryBindings = pack.actionBindings
      .map((binding) => ({
        actionId: binding.actionId,
        theoryReasoning: theoryReasoningProjectionFromParams(binding.params),
      }))
      .filter((item): item is { actionId: string; theoryReasoning: NonNullable<typeof item.theoryReasoning> } =>
        item.theoryReasoning !== undefined,
      );
    for (const item of boundedItems(theoryBindings)) {
      lines.push(
        `Theory reasoning for ${item.actionId}: ${renderTheoryReasoningSummary(item.theoryReasoning)}`,
      );
    }
    if (theoryBindings.length > MAX_ITEMS) {
      lines.push(`Theory reasoning omitted: ${String(theoryBindings.length - MAX_ITEMS)} more binding(s).`);
    }
    lines.push(
      'For bound actions, call ResearchAction.plan_primitive_tools before native tools and record primitive_tool_call_ids back through the ResearchAction result.',
    );
  }
  if (pack.diagnostics.length > 0) {
    lines.push(
      `Diagnostics: ${bounded(pack.diagnostics.map((diagnostic) => `${diagnostic.severity}:${diagnostic.code}`)).join(', ')}`,
    );
  }

  lines.push(
    'Keep simple answers light. Use this context for research turns, cross-block links, code-impact checks, and evidence-backed reasoning.',
  );
  return lines.join('\n');
}

function renderActionBinding(actionId: string): string {
  const action = DEFAULT_ACTION_BY_ID.get(actionId);
  if (action === undefined) return actionId;
  const tools = primitiveToolNamesForAction(action);
  if (tools.length === 0) return actionId;
  return `${actionId} [tools: ${bounded(tools).join(', ')}]`;
}

function bounded(values: readonly string[]): readonly string[] {
  if (values.length <= MAX_ITEMS) return values;
  return [...values.slice(0, MAX_ITEMS), `...(+${String(values.length - MAX_ITEMS)} more)`];
}

function boundedItems<T>(values: readonly T[]): readonly T[] {
  if (values.length <= MAX_ITEMS) return values;
  return values.slice(0, MAX_ITEMS);
}

function compactCue(value: string): string {
  const compact = value.replace(/\s+/g, ' ').trim();
  if (compact.length <= MAX_CUE_CHARS) return compact;
  return `${compact.slice(0, MAX_CUE_CHARS - 3).trim()}...`;
}
