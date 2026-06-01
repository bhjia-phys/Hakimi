import type { ResearchActionDefinition } from './types';
import type { ResearchObligation } from './obligation';

export interface RecommendedResearchAction {
  readonly action: ResearchActionDefinition;
  readonly obligationIds: readonly string[];
  readonly score: number;
  readonly reasons: readonly string[];
}

export interface RecommendResearchActionsOptions {
  readonly actions: readonly ResearchActionDefinition[];
  readonly obligations: readonly ResearchObligation[];
  readonly limit?: number;
}

export function recommendResearchActions(
  options: RecommendResearchActionsOptions,
): readonly RecommendedResearchAction[] {
  const open = options.obligations.filter((obligation) => obligation.status === 'open');
  const byAction = new Map<string, ResearchObligation[]>();
  for (const obligation of open) {
    const bucket = byAction.get(obligation.requiredActionId) ?? [];
    bucket.push(obligation);
    byAction.set(obligation.requiredActionId, bucket);
  }

  const recommendations = options.actions
    .map((action) => {
      const obligations = byAction.get(action.id) ?? [];
      if (obligations.length === 0) return undefined;
      return recommendationFor(action, obligations);
    })
    .filter((item): item is RecommendedResearchAction => item !== undefined)
    .toSorted((a, b) => b.score - a.score || a.action.id.localeCompare(b.action.id));

  return recommendations.slice(0, options.limit ?? recommendations.length);
}

function recommendationFor(
  action: ResearchActionDefinition,
  obligations: readonly ResearchObligation[],
): RecommendedResearchAction {
  const score = obligations.reduce((sum, obligation) => sum + obligationScore(obligation), 0);
  return {
    action,
    obligationIds: obligations.map((obligation) => obligation.id).toSorted(),
    score,
    reasons: obligations.map((obligation) => obligation.reason),
  };
}

function obligationScore(obligation: ResearchObligation): number {
  return severityScore(obligation) + kindRiskScore(obligation);
}

function severityScore(obligation: ResearchObligation): number {
  switch (obligation.severity) {
    case 'blocking':
      return 100;
    case 'important':
      return 50;
    case 'advisory':
      return 10;
  }
}

function kindRiskScore(obligation: ResearchObligation): number {
  switch (obligation.kind) {
    case 'convention_check':
      return 30;
    case 'dimension_check':
      return 25;
    case 'known_limit':
      return 20;
    case 'dependency_closure':
      return 18;
    case 'code_mapping':
      return 18;
    case 'benchmark':
      return 16;
    case 'source_support':
      return 15;
    case 'symbol_closure':
      return 12;
    case 'human_decision':
      return 8;
  }
}
