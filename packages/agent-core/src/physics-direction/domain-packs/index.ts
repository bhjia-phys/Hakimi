import { FQHE_CS_LENSES } from './fqhe-cs';
import { LIBRPA_HEAD_WING_LENSES } from './librpa-head-wing';

export { FQHE_CS_LENSES } from './fqhe-cs';
export { LIBRPA_HEAD_WING_LENSES } from './librpa-head-wing';

export const DEFAULT_PHYSICS_LENSES = [
  ...FQHE_CS_LENSES,
  ...LIBRPA_HEAD_WING_LENSES,
] as const;
