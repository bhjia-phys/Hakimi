/**
 * `skillCatalog` domain — builtin `check-hakimi-docs` skill definition.
 */

import type { SkillDefinition } from '#/app/skillCatalog/types';
import { parseSkillText } from '#/app/skillCatalog/parser';
import CHECK_HAKIMI_DOCS_BODY from './check-hakimi-docs.md?raw';

const PSEUDO_PATH = 'builtin://check-hakimi-docs';

const parsed = parseSkillText({
  skillMdPath: '/builtin/skills/check-hakimi-docs.md',
  skillDirName: 'check-hakimi-docs',
  source: 'builtin',
  text: CHECK_HAKIMI_DOCS_BODY,
});

export const CHECK_HAKIMI_DOCS_SKILL: SkillDefinition = {
  ...parsed,
  path: PSEUDO_PATH,
  dir: PSEUDO_PATH,
  metadata: {
    ...parsed.metadata,
    type: parsed.metadata.type ?? 'inline',
  },
  productSpecific: true,
};
