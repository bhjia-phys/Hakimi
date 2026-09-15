/**
 * `aitpResearch` domain — explicit rejection of retired host execution APIs.
 * Historical wire records remain readable; no retired command changes them.
 */

import { AitpResearchError, AitpResearchErrors } from '../errors';

export function retiredResearchOperation(): never {
  throw new AitpResearchError(
    AitpResearchErrors.codes.RESEARCH_RETIRED,
    'This Research execution API is retired. Historical records are preserved, not completed or discarded. Use project knowledge files and official AITP Skills with their CLI fallback for research memory.',
  );
}
