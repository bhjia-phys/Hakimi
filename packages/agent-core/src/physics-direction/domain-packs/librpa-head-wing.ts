import type { PhysicsLens } from '../types';

export const LIBRPA_HEAD_WING_LENSES = [
  {
    id: 'librpa_head_wing_formula_code_mapping',
    title: 'LibRPA head-wing formula-code mapping lens',
    domains: ['librpa', 'librpa/head-wing'],
    summary:
      'Use formula-code mapping, call-site closure, intermediate observables, and a smoke benchmark before trusting a head-wing change.',
    requiredObjectKinds: ['formula', 'code_region'],
    requiredRelationKinds: [
      'formula_code_mapping',
      'downstream_call_site',
      'intermediate_observable',
    ],
    supportingContextTags: ['librpa', 'head_wing', 'code_change'],
    caveats: [
      'A local head-wing edit can affect downstream readers, cached intermediates, and benchmark baselines.',
      'A passing build is not enough; at least one mapped intermediate observable should be checked.',
    ],
    guidingQuestions: [
      'Which formula term is represented by the edited code region?',
      'Which call sites and readers consume the modified head-wing quantity?',
      'What minimal benchmark or fixture can expose a wrong mapping?',
    ],
    requiredChecks: [
      {
        id: 'check.librpa-head-wing.code-mapping',
        kind: 'code_mapping',
        severity: 'blocking',
        description: 'Head-wing formula-code mappings must close call sites and observables.',
      },
      {
        id: 'check.librpa-head-wing.benchmark',
        kind: 'benchmark',
        severity: 'blocking',
        description: 'Run or record a minimal head-wing smoke benchmark before validation.',
      },
    ],
    suggestedActionBindings: [
      {
        id: 'binding.librpa-head-wing.inspect-call-sites',
        actionId: 'code.inspect_call_sites',
        domainId: 'librpa/head-wing',
        workflowId: 'workflow.librpa.head-wing.formula-code-mapping',
        lensId: 'librpa_head_wing_formula_code_mapping',
        priority: 'blocking',
      },
      {
        id: 'binding.librpa-head-wing.map-formula-code-region',
        actionId: 'code.map_formula_to_code_region',
        domainId: 'librpa/head-wing',
        workflowId: 'workflow.librpa.head-wing.formula-code-mapping',
        lensId: 'librpa_head_wing_formula_code_mapping',
        checkId: 'check.librpa-head-wing.code-mapping',
        priority: 'blocking',
      },
      {
        id: 'binding.librpa-head-wing.capture-git-diff',
        actionId: 'code.capture_git_diff_observation',
        domainId: 'librpa/head-wing',
        workflowId: 'workflow.librpa.head-wing.formula-code-mapping',
        lensId: 'librpa_head_wing_formula_code_mapping',
        priority: 'high',
      },
      {
        id: 'binding.librpa-head-wing.run-minimal-case',
        actionId: 'benchmark.run_minimal_case',
        domainId: 'librpa/head-wing',
        workflowId: 'workflow.librpa.head-wing.formula-code-mapping',
        lensId: 'librpa_head_wing_formula_code_mapping',
        checkId: 'check.librpa-head-wing.benchmark',
        adapterId: 'adapter.librpa.head-wing-smoke',
        priority: 'blocking',
      },
    ],
    expansionHandles: [
      {
        kind: 'code',
        ref: 'lens:librpa_head_wing_formula_code_mapping',
        title: 'LibRPA head-wing formula-code mapping direction check',
      },
    ],
  },
] as const satisfies readonly PhysicsLens[];
