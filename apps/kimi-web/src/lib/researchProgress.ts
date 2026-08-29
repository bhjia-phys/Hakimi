import type { ResearchProgressReport } from '../api/types';

export type ResearchProgressSummaryKind =
  | 'workPerformed'
  | 'mainlineImpact'
  | 'uncertainties';

export interface ResearchProgressSummary {
  kind: ResearchProgressSummaryKind;
  text: string;
}

export function researchProgressSummaries(
  progress: ResearchProgressReport,
): ResearchProgressSummary[] {
  const uncertainties = progress.uncertainties
    .map((uncertainty) => uncertainty.trim())
    .filter(Boolean)
    .join(' · ');
  const summaries: ResearchProgressSummary[] = [
    { kind: 'workPerformed', text: progress.workPerformed.trim() },
    { kind: 'mainlineImpact', text: progress.mainlineImpact.trim() },
    { kind: 'uncertainties', text: uncertainties },
  ];
  return summaries.filter((summary) => summary.text !== '');
}
