/**
 * `aitpResearch` domain — experimental flag for the AITP Research Mode feature.
 *
 * Declares the `aitp_research_mode` flag (env
 * `KIMI_CODE_EXPERIMENTAL_AITP_RESEARCH_MODE`, default `true`) and registers
 * it at import time. The flag gates the entire AITP Research Mode capability:
 * when off, no AITP I/O, no Research tools/skills, no Research Board. Imported
 * for the registration side effect. App scope.
 */

import { type FlagDefinitionInput, registerFlagDefinition } from '#/app/flag/flagRegistry';

export const aitpResearchModeFlag: FlagDefinitionInput = {
  id: 'aitp_research_mode',
  title: 'AITP Research Mode',
  description:
    'Experimental AITP Research Mode — a joint research capability backed by the AITP evidence ledger. Available by default; when off, all AITP tools, skills, and the Research Board are hidden and zero AITP I/O occurs.',
  env: 'KIMI_CODE_EXPERIMENTAL_AITP_RESEARCH_MODE',
  default: true,
  surface: 'both',
};

registerFlagDefinition(aitpResearchModeFlag);
