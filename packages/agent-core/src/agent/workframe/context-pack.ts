import type { ResearchContextPack } from '../../research-context';
import { DEFAULT_RESEARCH_ACTIONS, primitiveToolNamesForAction } from '../../research-action';
import {
  renderTheoryReasoningSummary,
  theoryReasoningProjectionFromParams,
} from '../../aitp';

const MAX_ITEMS = 6;
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
