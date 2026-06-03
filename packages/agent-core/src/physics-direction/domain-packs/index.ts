import { FQHE_CS_LENSES } from './fqhe-cs';
import { LIBRPA_HEAD_WING_LENSES } from './librpa-head-wing';

/**
 * @deprecated Use file-backed `.aitp` domain profiles/workflow recipes,
 * `compileDomainPackManifest`, and `ResearchContextPack.domainPack` for
 * runtime domain behavior. These exports remain only for compatibility with
 * early proof-of-shape tests.
 */
export { FQHE_CS_LENSES } from './fqhe-cs';
export { LIBRPA_HEAD_WING_LENSES } from './librpa-head-wing';

/**
 * @deprecated Use `ResearchContextPack.domainPack` to drive runtime lenses and
 * tool exposure from file-backed `.aitp` sources.
 */
export const DEFAULT_PHYSICS_LENSES = [
  ...FQHE_CS_LENSES,
  ...LIBRPA_HEAD_WING_LENSES,
] as const;
