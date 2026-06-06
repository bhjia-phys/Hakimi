import type {
  PrimitiveToolPolicy,
  ResearchActionDefinition,
  ResearchActionId,
} from './types';

export type PrimitivePlanStepKind =
  | 'inspect'
  | 'search'
  | 'fetch'
  | 'edit'
  | 'run'
  | 'submit'
  | 'capture'
  | 'record';

export type PrimitivePlanApproval =
  | 'none'
  | 'read-only'
  | 'write'
  | 'execute'
  | 'external';

export interface ResearchPrimitivePlanStep {
  readonly id: string;
  readonly kind: PrimitivePlanStepKind;
  readonly title: string;
  readonly toolNames: readonly string[];
  readonly purpose: string;
  readonly expectedEvidence: readonly string[];
  readonly approval: PrimitivePlanApproval;
}

export interface ResearchPrimitivePlanRecording {
  readonly actionId: ResearchActionId;
  readonly expectedOutcome: string;
  readonly evidenceRefs: readonly string[];
  readonly primitiveToolCallIdsRequired: boolean;
}

export interface ResearchPrimitivePlanTemplate {
  readonly id: string;
  readonly actionId: ResearchActionId;
  readonly title: string;
  readonly intent: string;
  readonly primitiveToolPolicy: PrimitiveToolPolicy;
  readonly toolNames: readonly string[];
  readonly steps: readonly ResearchPrimitivePlanStep[];
  readonly recording: ResearchPrimitivePlanRecording;
  readonly followupActionIds: readonly ResearchActionId[];
}

export class ResearchPrimitivePlanRegistry {
  private readonly byActionId = new Map<ResearchActionId, ResearchPrimitivePlanTemplate>();

  register(
    template: ResearchPrimitivePlanTemplate,
    options: { readonly replace?: boolean } = {},
  ): void {
    if (options.replace === true || !this.byActionId.has(template.actionId)) {
      this.byActionId.set(template.actionId, normalizeTemplate(template));
    }
  }

  getPlan(actionId: ResearchActionId): ResearchPrimitivePlanTemplate | undefined {
    return this.byActionId.get(actionId);
  }

  listPlans(): readonly ResearchPrimitivePlanTemplate[] {
    return [...this.byActionId.values()].toSorted((a, b) => a.actionId.localeCompare(b.actionId));
  }
}

export const DEFAULT_RESEARCH_PRIMITIVE_PLAN_TEMPLATES = [
  plan({
    actionId: 'scope.open_work_frame',
    title: 'Open isolated work frame',
    intent: 'Create or select the topic-local research state before any source, graph, or code work.',
    primitiveToolPolicy: 'none',
    steps: [
      step({
        id: 'open-frame',
        kind: 'record',
        title: 'Open the frame through ResearchAction',
        toolNames: ['ResearchAction'],
        purpose: 'Create a WorkFrame keyed by domain, topic, and goal so later actions remain session-local.',
        expectedEvidence: ['work_frame_id', 'topic', 'domain'],
      }),
    ],
    recording: recording('scope.open_work_frame', ['work_frame_id']),
    followupActionIds: ['scope.compile_context_pack'],
  }),
  plan({
    actionId: 'scope.compile_context_pack',
    title: 'Compile topic context pack',
    intent: 'Bound the current topic context from memory, ledger, workflows, and action bindings.',
    primitiveToolPolicy: 'none',
    steps: [
      step({
        id: 'compile-pack',
        kind: 'record',
        title: 'Compile context through ResearchAction',
        toolNames: ['ResearchAction', 'PhysicsMemory', 'ResearchLedger'],
        purpose: 'Create a bounded pack without pulling unrelated topic state into the session.',
        expectedEvidence: ['context_pack_id', 'action_binding_ids', 'diagnostics'],
      }),
    ],
    recording: recording('scope.compile_context_pack', ['context_pack_id']),
    followupActionIds: ['graph.query_dependency_closure'],
  }),
  plan({
    actionId: 'scope.declare_convention_set',
    title: 'Record convention set',
    intent: 'Capture notation, units, signs, and normalization before derivation or code mapping.',
    primitiveToolPolicy: 'none',
    steps: [
      step({
        id: 'capture-conventions',
        kind: 'capture',
        title: 'Capture convention statement',
        toolNames: ['ResearchLedger', 'ResearchAction'],
        purpose: 'Record the convention set as ledger evidence and keep it tied to the active WorkFrame.',
        expectedEvidence: ['ledger_event_id', 'convention_set_id'],
      }),
    ],
    recording: recording('scope.declare_convention_set', ['ledger_event_id']),
    followupActionIds: ['validate.check_convention'],
  }),
  plan({
    actionId: 'graph.query_dependency_closure',
    title: 'Query dependency closure',
    intent: 'Trace graph dependencies for a claim, formula, derivation step, or capsule proposal.',
    primitiveToolPolicy: 'none',
    steps: [
      step({
        id: 'query-graph',
        kind: 'inspect',
        title: 'Run dependency query',
        toolNames: ['ResearchAction', 'PhysicsMemory'],
        purpose: 'Use the built-in graph query executor and keep dependency evidence typed.',
        expectedEvidence: ['graph_node_ids', 'graph_edges', 'diagnostics'],
      }),
      step({
        id: 'record-closure',
        kind: 'record',
        title: 'Record closure result',
        toolNames: ['ResearchAction', 'ResearchLedger'],
        purpose: 'Attach the query result to the semantic action record for later validation.',
        expectedEvidence: ['evidence_ref', 'graph_refs'],
      }),
    ],
    recording: recording('graph.query_dependency_closure', ['graph:dependency_closure']),
    followupActionIds: ['validate.check_dependency_closure'],
  }),
  plan({
    actionId: 'graph.compile_edges',
    title: 'Compile graph edges',
    intent: 'Turn typed research objects into relation candidates without promoting unchecked claims.',
    primitiveToolPolicy: 'none',
    steps: [
      step({
        id: 'inspect-objects',
        kind: 'inspect',
        title: 'Inspect source objects',
        toolNames: ['PhysicsMemory', 'ResearchLedger'],
        purpose: 'Read the typed objects and evidence that justify each proposed edge.',
        expectedEvidence: ['object_ids', 'source_refs'],
      }),
      step({
        id: 'record-edges',
        kind: 'record',
        title: 'Record relation candidates',
        toolNames: ['ResearchLedger', 'ResearchAction'],
        purpose: 'Record graph-edge candidates as provisional ledger evidence.',
        expectedEvidence: ['ledger_event_id', 'graph_refs'],
      }),
    ],
    recording: recording('graph.compile_edges', ['ledger_event_id', 'graph_refs']),
    followupActionIds: ['graph.query_dependency_closure'],
  }),
  plan({
    actionId: 'source.search_literature',
    title: 'Search literature sources',
    intent: 'Find candidate papers, docs, or primary sources and keep the search trail auditable.',
    primitiveToolPolicy: 'read-only',
    steps: [
      step({
        id: 'search-indexes',
        kind: 'search',
        title: 'Search source indexes',
        toolNames: ['WebSearch'],
        purpose: 'Search for candidate source pages or papers using precise physics terms.',
        expectedEvidence: ['query', 'result_urls', 'result_titles'],
      }),
      step({
        id: 'fetch-candidates',
        kind: 'fetch',
        title: 'Fetch candidate sources',
        toolNames: ['FetchURL', 'Read'],
        purpose: 'Fetch abstracts, PDFs, notes, or local files that can support later extraction.',
        expectedEvidence: ['source_url_or_path', 'retrieved_excerpt'],
      }),
      step({
        id: 'record-search',
        kind: 'record',
        title: 'Record source candidates',
        toolNames: ['ResearchLedger', 'ResearchAction'],
        purpose: 'Record candidate source refs and primitive tool call ids without promoting claims.',
        expectedEvidence: ['ledger_event_id', 'source_refs', 'primitive_tool_call_ids'],
      }),
    ],
    recording: recording('source.search_literature', ['source_refs', 'ledger_event_id'], true),
    followupActionIds: ['source.capture_source_excerpt'],
  }),
  plan({
    actionId: 'source.capture_source_excerpt',
    title: 'Capture source excerpt',
    intent: 'Capture a concise, source-backed excerpt before extracting formulas or definitions.',
    primitiveToolPolicy: 'read-only',
    steps: [
      step({
        id: 'locate-source',
        kind: 'fetch',
        title: 'Locate source material',
        toolNames: ['WebSearch', 'FetchURL', 'Read'],
        purpose: 'Open the paper, webpage, or local source that contains the relevant statement.',
        expectedEvidence: ['source_url_or_path', 'location_hint'],
      }),
      step({
        id: 'capture-excerpt',
        kind: 'capture',
        title: 'Capture bounded excerpt',
        toolNames: ['ResearchLedger'],
        purpose: 'Store only the needed excerpt with citation/location metadata.',
        expectedEvidence: ['ledger_event_id', 'source_ref', 'excerpt_location'],
      }),
      step({
        id: 'record-action',
        kind: 'record',
        title: 'Record semantic action',
        toolNames: ['ResearchAction'],
        purpose: 'Attribute the captured source refs and primitive fetch/search calls to the action.',
        expectedEvidence: ['evidence_refs', 'primitive_tool_call_ids'],
      }),
    ],
    recording: recording('source.capture_source_excerpt', ['source_ref', 'ledger_event_id'], true),
    followupActionIds: ['source.extract_formula', 'source.extract_definition', 'source.extract_assumption'],
  }),
  plan({
    actionId: 'source.extract_formula',
    title: 'Extract formula candidate',
    intent: 'Turn a source-backed excerpt into a typed formula candidate with source-support obligations.',
    primitiveToolPolicy: 'none',
    steps: sourceExtractionSteps('formula'),
    recording: recording('source.extract_formula', ['formula_id', 'source_ref']),
    followupActionIds: ['validate.check_source_support', 'validate.check_dimension'],
  }),
  plan({
    actionId: 'source.extract_definition',
    title: 'Extract definition candidate',
    intent: 'Turn a source-backed excerpt into a typed definition candidate.',
    primitiveToolPolicy: 'none',
    steps: sourceExtractionSteps('definition'),
    recording: recording('source.extract_definition', ['definition_id', 'source_ref']),
    followupActionIds: ['validate.check_source_support'],
  }),
  plan({
    actionId: 'source.extract_assumption',
    title: 'Extract assumption candidate',
    intent: 'Turn a source-backed excerpt into an assumption with explicit scope.',
    primitiveToolPolicy: 'none',
    steps: sourceExtractionSteps('assumption'),
    recording: recording('source.extract_assumption', ['assumption_id', 'source_ref']),
    followupActionIds: ['validate.check_dependency_closure'],
  }),
  plan({
    actionId: 'derive.propose_route',
    title: 'Propose derivation route',
    intent: 'Sketch a derivation path while keeping the result provisional.',
    primitiveToolPolicy: 'none',
    steps: theorySteps('route'),
    recording: recording('derive.propose_route', ['ledger_event_id']),
    followupActionIds: ['derive.derive_step'],
  }),
  plan({
    actionId: 'derive.derive_step',
    title: 'Derive checked step candidate',
    intent: 'Create a typed derivation-step candidate from formulas, assumptions, and conventions.',
    primitiveToolPolicy: 'none',
    steps: theorySteps('derivation step'),
    recording: recording('derive.derive_step', ['derivation_step_id', 'ledger_event_id']),
    followupActionIds: [
      'validate.check_dimension',
      'validate.check_convention',
      'validate.check_symbol_consistency',
    ],
  }),
  plan({
    actionId: 'derive.transform_formula',
    title: 'Transform formula',
    intent: 'Apply an algebraic transformation while preserving assumptions and conventions.',
    primitiveToolPolicy: 'none',
    steps: theorySteps('transformed formula'),
    recording: recording('derive.transform_formula', ['formula_id', 'ledger_event_id']),
    followupActionIds: ['validate.check_symbol_consistency'],
  }),
  plan({
    actionId: 'derive.specialize_regime',
    title: 'Specialize physical regime',
    intent: 'Specialize a formula or claim to a named physical regime.',
    primitiveToolPolicy: 'none',
    steps: theorySteps('regime-specialized claim'),
    recording: recording('derive.specialize_regime', ['claim_id', 'assumption_ids']),
    followupActionIds: ['validate.check_known_limit'],
  }),
  plan({
    actionId: 'derive.compare_with_known_result',
    title: 'Compare with known result',
    intent: 'Compare a claim with a source-backed formula, theorem, limit, or benchmark.',
    primitiveToolPolicy: 'none',
    steps: theorySteps('known-result comparison'),
    recording: recording('derive.compare_with_known_result', ['ledger_event_id', 'source_ref']),
    followupActionIds: ['validate.check_known_limit'],
  }),
  plan({
    actionId: 'physics.apply_direction_lens',
    title: 'Apply physics direction lens',
    intent: 'Evaluate an applicability-gated physics lens before graph expansion.',
    primitiveToolPolicy: 'none',
    steps: theorySteps('direction-lens decision'),
    recording: recording('physics.apply_direction_lens', ['ledger_event_id', 'lens_id']),
    followupActionIds: ['graph.query_dependency_closure'],
  }),
  plan({
    actionId: 'aitp.record_route_choice',
    title: 'Record AITP route choice',
    intent:
      'Preserve the live route choice from route_state as process context without promoting it as evidence.',
    primitiveToolPolicy: 'none',
    steps: routeStateSteps('route choice'),
    recording: recording('aitp.record_route_choice', ['route_id', 'ledger_event_id']),
    followupActionIds: ['aitp.record_research_state'],
  }),
  plan({
    actionId: 'aitp.record_failed_route_lesson',
    title: 'Record failed route lesson',
    intent:
      'Preserve why a blocked or abandoned route failed so the local process can avoid repeating it.',
    primitiveToolPolicy: 'none',
    steps: routeStateSteps('failed route lesson'),
    recording: recording('aitp.record_failed_route_lesson', ['route_id', 'lesson', 'ledger_event_id']),
    followupActionIds: ['aitp.record_research_state'],
  }),
  plan({
    actionId: 'aitp.checkpoint_before_route_switch',
    title: 'Checkpoint before route switch',
    intent:
      'Checkpoint the current route state before pivoting or abandoning the live route.',
    primitiveToolPolicy: 'none',
    steps: routeStateSteps('route switch checkpoint'),
    recording: recording('aitp.checkpoint_before_route_switch', ['from_route_id', 'to_route_id', 'ledger_event_id']),
    followupActionIds: ['aitp.record_route_choice', 'aitp.record_research_state'],
  }),
  plan({
    actionId: 'aitp.record_exploratory_record',
    title: 'Record AITP exploratory process record',
    intent:
      'Persist a formed brainstorming, question-decomposition, source-asset, backtrace, or steering record through AITP without promoting it as evidence.',
    primitiveToolPolicy: 'none',
    steps: [
      step({
        id: 'execute-aitp-exploration-write',
        kind: 'record',
        title: 'Write exploratory record through AITP',
        toolNames: ['ResearchAction'],
        purpose:
          'Call ResearchAction.execute_aitp_write_bridge with recordExploratoryRecord using the current ContextPack writeBridge payload.',
        expectedEvidence: ['aitp:exploratory_record:<id>', 'write_bridge_operation'],
      }),
    ],
    recording: recording('aitp.record_exploratory_record', ['aitp:exploratory_record:<id>']),
    followupActionIds: ['scope.compile_context_pack'],
  }),
  plan({
    actionId: 'aitp.register_source_asset',
    title: 'Register AITP source asset',
    intent:
      'Persist canonical identity, version anchors, hashes, and provenance links for raw source material through AITP.',
    primitiveToolPolicy: 'none',
    steps: [
      step({
        id: 'execute-aitp-source-asset-write',
        kind: 'record',
        title: 'Write source asset through AITP',
        toolNames: ['ResearchAction'],
        purpose:
          'Call ResearchAction.execute_aitp_write_bridge with registerSourceAsset after the source identity is formed.',
        expectedEvidence: ['aitp:source_asset:<id>', 'source_asset_identity'],
      }),
    ],
    recording: recording('aitp.register_source_asset', ['aitp:source_asset:<id>']),
    followupActionIds: ['trace.follow_source_dependency', 'scope.compile_context_pack'],
  }),
  plan({
    actionId: 'aitp.record_reference_location',
    title: 'Record AITP reference location',
    intent:
      'Persist an orientation-only source pointer through AITP before using a paper, note, citation target, or local file as evidence.',
    primitiveToolPolicy: 'none',
    steps: [
      step({
        id: 'execute-aitp-reference-location-write',
        kind: 'record',
        title: 'Write reference location through AITP',
        toolNames: ['ResearchAction'],
        purpose:
          'Call ResearchAction.execute_aitp_write_bridge with recordReferenceLocation once the source location is precise.',
        expectedEvidence: ['aitp:reference_location:<id>', 'source_location'],
      }),
    ],
    recording: recording('aitp.record_reference_location', ['aitp:reference_location:<id>']),
    followupActionIds: ['trace.follow_source_dependency', 'aitp.record_evidence'],
  }),
  plan({
    actionId: 'aitp.record_evidence',
    title: 'Record AITP evidence',
    intent:
      'Persist formed, claim-local evidence through AITP after source, tool, or artifact links are explicit.',
    primitiveToolPolicy: 'none',
    steps: [
      step({
        id: 'execute-aitp-evidence-write',
        kind: 'record',
        title: 'Write evidence through AITP',
        toolNames: ['ResearchAction'],
        purpose:
          'Call ResearchAction.execute_aitp_write_bridge with recordEvidence using typed refs instead of a prose-only summary.',
        expectedEvidence: ['aitp:evidence:<id>', 'claim_id', 'supports_outputs'],
      }),
    ],
    recording: recording('aitp.record_evidence', ['aitp:evidence:<id>']),
    followupActionIds: ['scope.compile_context_pack'],
  }),
  plan({
    actionId: 'aitp.record_tool_run',
    title: 'Record AITP tool run',
    intent:
      'Persist computation, benchmark, source-audit, or validation-tool provenance through AITP before evidence or validation result records cite it.',
    primitiveToolPolicy: 'none',
    steps: [
      step({
        id: 'execute-aitp-tool-run-write',
        kind: 'record',
        title: 'Write tool run through AITP',
        toolNames: ['ResearchAction'],
        purpose:
          'Call ResearchAction.execute_aitp_write_bridge with recordToolRun after the primitive tool execution or manual audit result is formed.',
        expectedEvidence: ['aitp:tool_run:<id>', 'recipe_id', 'inputs', 'outputs'],
      }),
    ],
    recording: recording('aitp.record_tool_run', ['aitp:tool_run:<id>']),
    followupActionIds: ['aitp.record_evidence', 'aitp.record_validation_result'],
  }),
  plan({
    actionId: 'aitp.create_open_obligation',
    title: 'Create AITP open obligation',
    intent:
      'Persist a formed gap as an AITP proof obligation before treating the gap as resolved or relying on the claim.',
    primitiveToolPolicy: 'none',
    steps: [
      step({
        id: 'execute-aitp-obligation-write',
        kind: 'record',
        title: 'Write proof obligation through AITP',
        toolNames: ['ResearchAction'],
        purpose:
          'Call ResearchAction.execute_aitp_write_bridge with createProofObligation using the current ContextPack writeBridge payload.',
        expectedEvidence: ['aitp:proof_obligation:<id>', 'generated_obligation_id'],
      }),
    ],
    recording: recording('aitp.create_open_obligation', ['aitp:proof_obligation:<id>']),
    followupActionIds: ['scope.compile_context_pack'],
  }),
  plan({
    actionId: 'aitp.create_validation_contract',
    title: 'Create AITP validation contract',
    intent:
      'Persist required checks, failure modes, and required evidence outputs before relying on a risky claim or derivation.',
    primitiveToolPolicy: 'none',
    steps: [
      step({
        id: 'execute-aitp-validation-contract-write',
        kind: 'record',
        title: 'Write validation contract through AITP',
        toolNames: ['ResearchAction'],
        purpose:
          'Call ResearchAction.execute_aitp_write_bridge with createValidationContract before treating later checks as trust-relevant.',
        expectedEvidence: ['aitp:validation_contract:<id>', 'required_checks'],
      }),
    ],
    recording: recording('aitp.create_validation_contract', ['aitp:validation_contract:<id>']),
    followupActionIds: ['scope.compile_context_pack'],
  }),
  plan({
    actionId: 'aitp.record_validation_result',
    title: 'Record AITP validation result',
    intent:
      'Persist the checked outputs, covered failure modes, tool run, and validation status through AITP.',
    primitiveToolPolicy: 'none',
    steps: [
      step({
        id: 'execute-aitp-validation-result-write',
        kind: 'record',
        title: 'Write validation result through AITP',
        toolNames: ['ResearchAction'],
        purpose:
          'Call ResearchAction.execute_aitp_write_bridge with recordValidationResult after the primitive validation evidence exists.',
        expectedEvidence: ['aitp:validation_result:<id>', 'tool_run_id', 'checked_outputs'],
      }),
    ],
    recording: recording('aitp.record_validation_result', ['aitp:validation_result:<id>']),
    followupActionIds: ['scope.compile_context_pack'],
  }),
  plan({
    actionId: 'aitp.request_human_checkpoint',
    title: 'Request trust-boundary checkpoint',
    intent: 'Pause at an AITP trust boundary and collect an explicit human decision before treating trust as updated.',
    primitiveToolPolicy: 'none',
    steps: [
      step({
        id: 'execute-aitp-checkpoint-request',
        kind: 'record',
        title: 'Create checkpoint request through AITP',
        toolNames: ['ResearchAction'],
        purpose:
          'Call ResearchAction.execute_aitp_write_bridge with requestHumanCheckpoint before asking the human to decide.',
        expectedEvidence: ['aitp:human_checkpoint:<id>', 'trust_boundary_reason'],
      }),
      step({
        id: 'ask-human-checkpoint',
        kind: 'capture',
        title: 'Ask for checkpoint decision',
        toolNames: ['AskUserQuestion'],
        purpose:
          'Ask whether the trust-boundary transition is approved, blocked, or should stay provisional.',
        expectedEvidence: ['human_checkpoint_decision', 'trust_boundary_reason'],
      }),
      step({
        id: 'record-checkpoint',
        kind: 'record',
        title: 'Record checkpoint result',
        toolNames: ['ResearchAction', 'ResearchLedger'],
        purpose:
          'Record the human checkpoint outcome as semantic action evidence without claiming that Hakimi updated AITP trust.',
        expectedEvidence: ['ledger_event_id', 'human_checkpoint_decision', 'aitp:human_checkpoint:<id>'],
      }),
    ],
    recording: recording('aitp.request_human_checkpoint', [
      'aitp:human_checkpoint:<id>',
      'human_checkpoint_decision',
      'ledger_event_id',
    ]),
    followupActionIds: ['aitp.record_research_state'],
  }),
  plan({
    actionId: 'validate.check_dimension',
    title: 'Check dimensions',
    intent: 'Validate dimensional consistency of a formula or derivation step.',
    primitiveToolPolicy: 'none',
    steps: validationSteps('dimension check'),
    recording: recording('validate.check_dimension', ['ledger_event_id', 'check_result']),
    followupActionIds: [],
  }),
  plan({
    actionId: 'validate.check_convention',
    title: 'Check conventions',
    intent: 'Validate notation, sign, units, and normalization conventions.',
    primitiveToolPolicy: 'none',
    steps: validationSteps('convention check'),
    recording: recording('validate.check_convention', ['ledger_event_id', 'check_result']),
    followupActionIds: [],
  }),
  plan({
    actionId: 'validate.check_symbol_consistency',
    title: 'Check symbols',
    intent: 'Validate symbol closure and prevent notation drift.',
    primitiveToolPolicy: 'none',
    steps: validationSteps('symbol consistency check'),
    recording: recording('validate.check_symbol_consistency', ['ledger_event_id', 'check_result']),
    followupActionIds: [],
  }),
  plan({
    actionId: 'validate.check_known_limit',
    title: 'Check known limit',
    intent: 'Compare a candidate claim against known limits or special cases.',
    primitiveToolPolicy: 'none',
    steps: validationSteps('known-limit check'),
    recording: recording('validate.check_known_limit', ['ledger_event_id', 'check_result']),
    followupActionIds: [],
  }),
  plan({
    actionId: 'validate.check_source_support',
    title: 'Check source support',
    intent: 'Verify that a candidate object has explicit supporting source refs.',
    primitiveToolPolicy: 'none',
    steps: [
      step({
        id: 'inspect-source-refs',
        kind: 'inspect',
        title: 'Inspect source refs',
        toolNames: ['ResearchLedger', 'Read', 'FetchURL'],
        purpose: 'Read the referenced ledger event, local file, or fetched source location.',
        expectedEvidence: ['source_ref', 'excerpt_location'],
      }),
      step({
        id: 'record-source-check',
        kind: 'record',
        title: 'Record source-support check',
        toolNames: ['ResearchAction', 'ResearchLedger'],
        purpose: 'Record whether the source directly supports the candidate object.',
        expectedEvidence: ['ledger_event_id', 'check_result'],
      }),
    ],
    recording: recording('validate.check_source_support', ['ledger_event_id', 'check_result']),
    followupActionIds: [],
  }),
  plan({
    actionId: 'validate.check_dependency_closure',
    title: 'Check dependency closure',
    intent: 'Validate that a candidate object has all required dependencies linked.',
    primitiveToolPolicy: 'none',
    steps: [
      step({
        id: 'query-closure',
        kind: 'inspect',
        title: 'Query closure',
        toolNames: ['ResearchAction', 'PhysicsMemory'],
        purpose: 'Run the built-in dependency query and inspect unresolved dependencies.',
        expectedEvidence: ['graph_refs', 'diagnostics'],
      }),
      step({
        id: 'record-closure-check',
        kind: 'record',
        title: 'Record closure check',
        toolNames: ['ResearchAction', 'ResearchLedger'],
        purpose: 'Record pass, fail, or blocked outcome for the dependency closure obligation.',
        expectedEvidence: ['ledger_event_id', 'check_result'],
      }),
    ],
    recording: recording('validate.check_dependency_closure', ['ledger_event_id', 'check_result']),
    followupActionIds: [],
  }),
  plan({
    actionId: 'code.inspect_git_history',
    title: 'Inspect git history',
    intent: 'Inspect commit history for a code region, symbol, or feature intent.',
    primitiveToolPolicy: 'git-read',
    steps: [
      step({
        id: 'git-log',
        kind: 'inspect',
        title: 'Read git history',
        toolNames: ['Bash'],
        purpose: 'Run read-only git commands such as git log or git show for the target region.',
        expectedEvidence: ['commit_ids', 'git_command_output'],
        approval: 'read-only',
      }),
      step({
        id: 'record-history',
        kind: 'record',
        title: 'Record history observation',
        toolNames: ['ResearchLedger', 'ResearchAction'],
        purpose: 'Attach relevant commits and command outputs as evidence for the code action.',
        expectedEvidence: ['ledger_event_id', 'primitive_tool_call_ids'],
      }),
    ],
    recording: recording('code.inspect_git_history', ['commit_ids', 'ledger_event_id'], true),
    followupActionIds: ['code.inspect_call_sites'],
  }),
  plan({
    actionId: 'code.inspect_call_sites',
    title: 'Inspect code call sites',
    intent: 'Inspect downstream callers, readers, and data-flow consumers before changing a code path.',
    primitiveToolPolicy: 'read-only',
    steps: [
      step({
        id: 'search-symbols',
        kind: 'inspect',
        title: 'Search symbols and call sites',
        toolNames: ['Grep', 'Glob'],
        purpose: 'Locate definitions, call sites, tests, and downstream readers for the target symbol.',
        expectedEvidence: ['matched_files', 'symbol_occurrences'],
      }),
      step({
        id: 'read-code',
        kind: 'inspect',
        title: 'Read relevant code regions',
        toolNames: ['Read'],
        purpose: 'Read the smallest set of files needed to understand call flow and invariants.',
        expectedEvidence: ['code_region_refs', 'invariant_notes'],
      }),
      step({
        id: 'record-call-sites',
        kind: 'record',
        title: 'Record call-site evidence',
        toolNames: ['ResearchLedger', 'ResearchAction'],
        purpose: 'Record the code regions and primitive tool calls that support later mapping or patching.',
        expectedEvidence: ['ledger_event_id', 'primitive_tool_call_ids'],
      }),
    ],
    recording: recording('code.inspect_call_sites', ['code_region_refs', 'ledger_event_id'], true),
    followupActionIds: ['code.map_formula_to_code_region'],
  }),
  plan({
    actionId: 'code.map_formula_to_code',
    title: 'Map formula to code',
    intent: 'Create a formula-to-code mapping candidate.',
    primitiveToolPolicy: 'read-only',
    steps: codeMappingSteps('formula-code mapping'),
    recording: recording('code.map_formula_to_code', ['code_mapping_id', 'code_region_refs'], true),
    followupActionIds: ['code.check_intermediate_observable'],
  }),
  plan({
    actionId: 'code.map_formula_to_code_region',
    title: 'Map formula to code region',
    intent: 'Map formula terms to concrete code regions, intermediate observables, and data flow.',
    primitiveToolPolicy: 'read-only',
    steps: codeMappingSteps('formula-code-region mapping'),
    recording: recording(
      'code.map_formula_to_code_region',
      ['code_mapping_id', 'code_region_refs'],
      true,
    ),
    followupActionIds: ['code.prepare_patch', 'benchmark.run_minimal_case'],
  }),
  plan({
    actionId: 'code.check_intermediate_observable',
    title: 'Check intermediate observable',
    intent: 'Check that a mapped intermediate value matches the formula meaning.',
    primitiveToolPolicy: 'read-only',
    steps: [
      step({
        id: 'inspect-observable',
        kind: 'inspect',
        title: 'Inspect observable code path',
        toolNames: ['Grep', 'Read'],
        purpose: 'Read the code path that materializes the intermediate observable.',
        expectedEvidence: ['code_region_refs', 'observable_name'],
      }),
      step({
        id: 'record-observable-check',
        kind: 'record',
        title: 'Record observable check',
        toolNames: ['ResearchLedger', 'ResearchAction'],
        purpose: 'Record whether the code observable matches the expected formula semantics.',
        expectedEvidence: ['ledger_event_id', 'check_result'],
      }),
    ],
    recording: recording('code.check_intermediate_observable', ['ledger_event_id', 'check_result'], true),
    followupActionIds: ['benchmark.run_minimal_case'],
  }),
  plan({
    actionId: 'code.prepare_patch',
    title: 'Prepare code patch',
    intent: 'Apply a scoped code change after call-site inspection and formula-code mapping.',
    primitiveToolPolicy: 'write-gated',
    steps: [
      step({
        id: 'inspect-before-edit',
        kind: 'inspect',
        title: 'Re-read target code and tests',
        toolNames: ['Read', 'Grep'],
        purpose: 'Confirm the exact edit surface and nearby tests before modifying files.',
        expectedEvidence: ['code_region_refs', 'test_refs'],
      }),
      step({
        id: 'edit-patch',
        kind: 'edit',
        title: 'Apply scoped patch',
        toolNames: ['Edit', 'Write'],
        purpose: 'Use native edit tools for the minimal code or test change required by the mapping.',
        expectedEvidence: ['changed_file_paths', 'edit_tool_call_ids'],
        approval: 'write',
      }),
      step({
        id: 'record-patch-intent',
        kind: 'record',
        title: 'Record patch intent',
        toolNames: ['ResearchLedger', 'ResearchAction'],
        purpose: 'Record what changed, why it follows from the mapping, and which checks remain.',
        expectedEvidence: ['ledger_event_id', 'primitive_tool_call_ids'],
      }),
    ],
    recording: recording('code.prepare_patch', ['changed_file_paths', 'ledger_event_id'], true),
    followupActionIds: ['code.capture_git_diff_observation', 'benchmark.run_minimal_case'],
  }),
  plan({
    actionId: 'code.capture_git_diff_observation',
    title: 'Capture git diff observation',
    intent: 'Capture the current diff as compact evidence for a code or mapping change.',
    primitiveToolPolicy: 'git-read',
    steps: [
      step({
        id: 'read-diff',
        kind: 'inspect',
        title: 'Read git diff',
        toolNames: ['Bash'],
        purpose: 'Run read-only git diff/status commands and capture the meaningful hunks.',
        expectedEvidence: ['git_status', 'diff_hunks'],
        approval: 'read-only',
      }),
      step({
        id: 'record-diff',
        kind: 'record',
        title: 'Record diff observation',
        toolNames: ['ResearchLedger', 'ResearchAction'],
        purpose: 'Attach diff observations to the action trace without committing or reverting anything.',
        expectedEvidence: ['ledger_event_id', 'primitive_tool_call_ids'],
      }),
    ],
    recording: recording('code.capture_git_diff_observation', ['diff_hunks', 'ledger_event_id'], true),
    followupActionIds: ['benchmark.run_minimal_case'],
  }),
  plan({
    actionId: 'benchmark.run_minimal_case',
    title: 'Run minimal benchmark',
    intent: 'Run or prepare the smallest benchmark that can validate a formula-code mapping.',
    primitiveToolPolicy: 'benchmark-gated',
    steps: [
      step({
        id: 'prefer-adapter',
        kind: 'run',
        title: 'Run registered adapter when available',
        toolNames: ['ResearchAction'],
        purpose: 'Use a deterministic in-process benchmark adapter before falling back to shell execution.',
        expectedEvidence: ['adapter_id', 'case_id', 'check_results'],
      }),
      step({
        id: 'shell-run-if-required',
        kind: 'run',
        title: 'Run external command if workflow requires it',
        toolNames: ['Bash'],
        purpose: 'Run only the minimal command required by the workflow and capture logs/artifacts.',
        expectedEvidence: ['command', 'exit_code', 'artifact_refs'],
        approval: 'execute',
      }),
      step({
        id: 'record-benchmark',
        kind: 'record',
        title: 'Record benchmark result',
        toolNames: ['ResearchLedger', 'ResearchAction'],
        purpose: 'Record pass/fail/blocked result with benchmark evidence refs.',
        expectedEvidence: ['benchmark_evidence_refs', 'primitive_tool_call_ids'],
      }),
    ],
    recording: recording('benchmark.run_minimal_case', ['benchmark_evidence_refs'], true),
    followupActionIds: ['memory.propose_capsule'],
  }),
  plan({
    actionId: 'benchmark.submit_external_job',
    title: 'Submit external benchmark job',
    intent: 'Prepare or submit a queued/HPC/external benchmark only through primitive execution tools.',
    primitiveToolPolicy: 'benchmark-gated',
    steps: [
      step({
        id: 'inspect-job-script',
        kind: 'inspect',
        title: 'Inspect job inputs',
        toolNames: ['Read', 'Grep'],
        purpose: 'Read the job script, input files, queue settings, and expected artifact locations.',
        expectedEvidence: ['job_script_path', 'input_refs'],
      }),
      step({
        id: 'submit-job',
        kind: 'submit',
        title: 'Submit through native execution layer',
        toolNames: ['Bash'],
        purpose: 'Use the configured shell, scheduler CLI, or external connector outside ResearchAction.',
        expectedEvidence: ['submission_command', 'job_id', 'scheduler_output'],
        approval: 'external',
      }),
      step({
        id: 'normalize-submission',
        kind: 'record',
        title: 'Normalize submission receipt',
        toolNames: ['ResearchAction'],
        purpose:
          'Run adapter.external.job-submission through ResearchAction.run_benchmark_adapter to validate the native scheduler/MCP/HPC receipt without executing the job.',
        expectedEvidence: ['adapter_id', 'job_id', 'artifact_refs'],
      }),
      step({
        id: 'record-submission',
        kind: 'record',
        title: 'Record job submission',
        toolNames: ['ResearchLedger', 'ResearchAction'],
        purpose: 'Record job id, artifacts to watch, and primitive submission tool call id.',
        expectedEvidence: [
          'ledger_event_id',
          'job_id',
          'external_submission_adapter_result',
          'primitive_tool_call_ids',
        ],
      }),
    ],
    recording: recording(
      'benchmark.submit_external_job',
      ['job_id', 'ledger_event_id', 'adapter.external.job-submission'],
      true,
    ),
    followupActionIds: ['benchmark.run_minimal_case'],
  }),
  plan({
    actionId: 'formalization.build_blueprint',
    title: 'Build formalization blueprint',
    intent: 'Export a proof-assistant-facing dependency blueprint without claiming verification.',
    primitiveToolPolicy: 'none',
    steps: [
      step({
        id: 'build-blueprint',
        kind: 'run',
        title: 'Build blueprint through ResearchAction',
        toolNames: ['ResearchAction', 'PhysicsMemory'],
        purpose: 'Use the built-in formalization exporter over selected graph nodes.',
        expectedEvidence: ['formalization_blueprint', 'diagnostics'],
      }),
      step({
        id: 'record-blueprint',
        kind: 'record',
        title: 'Record blueprint evidence',
        toolNames: ['ResearchAction', 'ResearchLedger'],
        purpose: 'Record readiness and human checkpoints for the exported blueprint.',
        expectedEvidence: ['formalization_evidence_ref'],
      }),
    ],
    recording: recording('formalization.build_blueprint', ['formalization_evidence_ref']),
    followupActionIds: [],
  }),
  plan({
    actionId: 'memory.propose_capsule',
    title: 'Propose memory capsule',
    intent: 'Compile checked ledger material into a provisional capsule proposal.',
    primitiveToolPolicy: 'none',
    steps: memorySteps('capsule proposal'),
    recording: recording('memory.propose_capsule', ['capsule_proposal_id', 'ledger_event_id']),
    followupActionIds: ['graph.compile_edges'],
  }),
  plan({
    actionId: 'memory.promote_capsule',
    title: 'Promote memory capsule',
    intent: 'Promote a checked proposal only after obligations and evidence gates pass.',
    primitiveToolPolicy: 'none',
    steps: memorySteps('promoted capsule'),
    recording: recording('memory.promote_capsule', ['capsule_id', 'check_refs']),
    followupActionIds: [],
  }),
  plan({
    actionId: 'memory.reject_or_downgrade',
    title: 'Reject or downgrade capsule',
    intent: 'Preserve negative or downgraded results as explicit research memory.',
    primitiveToolPolicy: 'none',
    steps: memorySteps('failure or downgrade record'),
    recording: recording('memory.reject_or_downgrade', ['failure_mode_id', 'ledger_event_id']),
    followupActionIds: ['harness.build_eval_from_failure'],
  }),
  plan({
    actionId: 'harness.build_eval_from_failure',
    title: 'Build eval from failure',
    intent: 'Turn failed or inconclusive action traces into a reproducible harness candidate.',
    primitiveToolPolicy: 'none',
    steps: [
      step({
        id: 'inspect-trace',
        kind: 'inspect',
        title: 'Inspect failed trace',
        toolNames: ['ResearchLedger', 'ResearchAction', 'Read'],
        purpose: 'Read the failed action trace, artifacts, and minimal reproduction context.',
        expectedEvidence: ['failed_action_ids', 'artifact_refs'],
      }),
      step({
        id: 'record-harness',
        kind: 'record',
        title: 'Record harness candidate',
        toolNames: ['ResearchLedger', 'ResearchAction'],
        purpose: 'Record the eval candidate and the criteria it should check.',
        expectedEvidence: ['harness_candidate_id', 'ledger_event_id'],
      }),
    ],
    recording: recording('harness.build_eval_from_failure', ['harness_candidate_id', 'ledger_event_id']),
    followupActionIds: [],
  }),
] as const satisfies readonly ResearchPrimitivePlanTemplate[];

export function registerDefaultResearchPrimitivePlanTemplates(
  registry: ResearchPrimitivePlanRegistry,
): void {
  for (const template of DEFAULT_RESEARCH_PRIMITIVE_PLAN_TEMPLATES) {
    registry.register(template);
  }
}

export function buildPrimitivePlanForAction(
  action: ResearchActionDefinition,
  registry?: ResearchPrimitivePlanRegistry,
): ResearchPrimitivePlanTemplate {
  const registered = registry?.getPlan(action.id) ?? getDefaultPlan(action.id);
  if (registered !== undefined) return mergeActionMetadata(action, registered);
  return fallbackPlan(action);
}

export function primitiveToolNamesForAction(action: ResearchActionDefinition): readonly string[] {
  return buildPrimitivePlanForAction(action).toolNames;
}

function getDefaultPlan(actionId: ResearchActionId): ResearchPrimitivePlanTemplate | undefined {
  return DEFAULT_RESEARCH_PRIMITIVE_PLAN_TEMPLATES.find((template) => template.actionId === actionId);
}

function mergeActionMetadata(
  action: ResearchActionDefinition,
  template: ResearchPrimitivePlanTemplate,
): ResearchPrimitivePlanTemplate {
  return normalizeTemplate({
    ...template,
    title: template.title.length > 0 ? template.title : action.title,
    primitiveToolPolicy: action.primitiveToolPolicy ?? template.primitiveToolPolicy,
    followupActionIds: mergeUnique(template.followupActionIds, action.suggestedNextActions ?? []),
  });
}

function fallbackPlan(action: ResearchActionDefinition): ResearchPrimitivePlanTemplate {
  const policy = action.primitiveToolPolicy ?? 'none';
  return plan({
    actionId: action.id,
    title: action.title,
    intent: action.description,
    primitiveToolPolicy: policy,
    steps: [
      step({
        id: 'inspect-or-prepare',
        kind: fallbackStepKind(policy),
        title: 'Prepare primitive evidence',
        toolNames: fallbackTools(policy),
        purpose: `Collect the primitive evidence required by ${action.id}.`,
        expectedEvidence: ['evidence_refs', 'primitive_tool_call_ids'],
        approval: fallbackApproval(policy),
      }),
      step({
        id: 'record-action',
        kind: 'record',
        title: 'Record semantic action',
        toolNames: ['ResearchAction'],
        purpose: 'Record the outcome and evidence refs without executing primitive work inside ResearchAction.',
        expectedEvidence: ['action_record'],
      }),
    ],
    recording: recording(action.id, ['evidence_refs'], policy !== 'none'),
    followupActionIds: action.suggestedNextActions ?? [],
  });
}

function fallbackTools(policy: PrimitiveToolPolicy): readonly string[] {
  switch (policy) {
    case 'none':
      return ['ResearchAction'];
    case 'read-only':
      return ['Read', 'Grep', 'ResearchLedger', 'ResearchAction'];
    case 'git-read':
    case 'shell-read':
      return ['Bash', 'ResearchLedger', 'ResearchAction'];
    case 'write-gated':
      return ['Read', 'Grep', 'Edit', 'Write', 'ResearchLedger', 'ResearchAction'];
    case 'benchmark-gated':
      return ['ResearchAction', 'Bash', 'ResearchLedger'];
    case 'mcp-gated':
      return ['ResearchAction', 'ResearchLedger'];
  }
}

function fallbackStepKind(policy: PrimitiveToolPolicy): PrimitivePlanStepKind {
  switch (policy) {
    case 'write-gated':
      return 'edit';
    case 'benchmark-gated':
      return 'run';
    case 'git-read':
    case 'shell-read':
      return 'inspect';
    case 'mcp-gated':
      return 'fetch';
    case 'none':
    case 'read-only':
      return 'inspect';
  }
}

function fallbackApproval(policy: PrimitiveToolPolicy): PrimitivePlanApproval {
  switch (policy) {
    case 'write-gated':
      return 'write';
    case 'benchmark-gated':
      return 'execute';
    case 'git-read':
    case 'shell-read':
    case 'read-only':
      return 'read-only';
    case 'mcp-gated':
      return 'external';
    case 'none':
      return 'none';
  }
}

function sourceExtractionSteps(kind: string): readonly ResearchPrimitivePlanStep[] {
  return [
    step({
      id: 'inspect-excerpt',
      kind: 'inspect',
      title: `Inspect source-backed ${kind}`,
      toolNames: ['ResearchLedger', 'Read', 'FetchURL'],
      purpose: `Read the source excerpt and location metadata before extracting a ${kind}.`,
      expectedEvidence: ['source_ref', 'excerpt_location'],
    }),
    step({
      id: 'record-candidate',
      kind: 'record',
      title: `Record ${kind} candidate`,
      toolNames: ['ResearchLedger', 'ResearchAction'],
      purpose: `Record the ${kind} candidate and keep its source-support obligation open.`,
      expectedEvidence: [`${kind}_id`, 'ledger_event_id'],
    }),
  ];
}

function theorySteps(objectName: string): readonly ResearchPrimitivePlanStep[] {
  return [
    step({
      id: 'inspect-prerequisites',
      kind: 'inspect',
      title: 'Inspect prerequisites',
      toolNames: ['PhysicsMemory', 'ResearchLedger'],
      purpose: `Read formulas, assumptions, conventions, and source refs needed for the ${objectName}.`,
      expectedEvidence: ['input_object_ids', 'assumption_ids', 'convention_ids'],
    }),
    step({
      id: 'record-candidate',
      kind: 'record',
      title: `Record ${objectName}`,
      toolNames: ['ResearchLedger', 'ResearchAction'],
      purpose: `Record the provisional ${objectName} with obligations instead of promoting it immediately.`,
      expectedEvidence: ['ledger_event_id', 'generated_obligation_ids'],
    }),
  ];
}

function routeStateSteps(recordName: string): readonly ResearchPrimitivePlanStep[] {
  return [
    step({
      id: 'inspect-route-state',
      kind: 'inspect',
      title: 'Inspect route state',
      toolNames: ['ResearchAction', 'ResearchLedger'],
      purpose: `Read the active ContextPack route_state projection before recording the ${recordName}.`,
      expectedEvidence: ['route_id', 'route_status', 'context_pack_id'],
    }),
    step({
      id: 'record-route-state-action',
      kind: 'record',
      title: `Record ${recordName}`,
      toolNames: ['ResearchLedger', 'ResearchAction'],
      purpose:
        'Record pass, blocked, or inconclusive with route refs; do not treat ordinary route moments as final-gate blockers.',
      expectedEvidence: ['ledger_event_id', 'route_refs'],
    }),
  ];
}

function validationSteps(checkName: string): readonly ResearchPrimitivePlanStep[] {
  return [
    step({
      id: 'inspect-target',
      kind: 'inspect',
      title: `Inspect target for ${checkName}`,
      toolNames: ['PhysicsMemory', 'ResearchLedger'],
      purpose: 'Read the target object, assumptions, conventions, and prior checks.',
      expectedEvidence: ['target_object_id', 'dependency_refs'],
    }),
    step({
      id: 'record-check',
      kind: 'record',
      title: `Record ${checkName}`,
      toolNames: ['ResearchLedger', 'ResearchAction'],
      purpose: 'Record pass, fail, blocked, or inconclusive with explicit evidence.',
      expectedEvidence: ['ledger_event_id', 'check_result'],
    }),
  ];
}

function codeMappingSteps(objectName: string): readonly ResearchPrimitivePlanStep[] {
  return [
    step({
      id: 'search-code',
      kind: 'inspect',
      title: 'Search code regions',
      toolNames: ['Grep', 'Glob'],
      purpose: 'Locate definitions, call sites, tests, and data-flow readers related to the formula terms.',
      expectedEvidence: ['matched_files', 'symbol_occurrences'],
    }),
    step({
      id: 'read-code-and-formula',
      kind: 'inspect',
      title: 'Read code and formula context',
      toolNames: ['Read', 'PhysicsMemory', 'ResearchLedger'],
      purpose: `Compare formula terms with concrete code regions to build the ${objectName}.`,
      expectedEvidence: ['formula_id', 'code_region_refs', 'observable_names'],
    }),
    step({
      id: 'record-mapping',
      kind: 'record',
      title: `Record ${objectName}`,
      toolNames: ['ResearchLedger', 'ResearchAction'],
      purpose: 'Record the mapping and generated obligations for observables and benchmarks.',
      expectedEvidence: ['code_mapping_id', 'ledger_event_id', 'generated_obligation_ids'],
    }),
  ];
}

function memorySteps(objectName: string): readonly ResearchPrimitivePlanStep[] {
  return [
    step({
      id: 'inspect-evidence',
      kind: 'inspect',
      title: 'Inspect ledger evidence',
      toolNames: ['ResearchLedger', 'PhysicsMemory'],
      purpose: `Read checks, source refs, and dependency closure needed for the ${objectName}.`,
      expectedEvidence: ['ledger_event_ids', 'check_refs'],
    }),
    step({
      id: 'record-memory-action',
      kind: 'record',
      title: `Record ${objectName}`,
      toolNames: ['PhysicsMemory', 'ResearchLedger', 'ResearchAction'],
      purpose: `Record the ${objectName} and preserve promotion or downgrade rationale.`,
      expectedEvidence: ['capsule_refs', 'ledger_event_id'],
    }),
  ];
}

function plan(
  input: Omit<ResearchPrimitivePlanTemplate, 'id' | 'toolNames'> & {
    readonly id?: string | undefined;
    readonly toolNames?: readonly string[] | undefined;
  },
): ResearchPrimitivePlanTemplate {
  return normalizeTemplate({
    ...input,
    id: input.id ?? `primitive-plan.${input.actionId}`,
    toolNames: input.toolNames ?? input.steps.flatMap((item) => item.toolNames),
  });
}

function step(
  input: Omit<ResearchPrimitivePlanStep, 'approval'> & {
    readonly approval?: PrimitivePlanApproval | undefined;
  },
): ResearchPrimitivePlanStep {
  return {
    ...input,
    approval: input.approval ?? inferApproval(input),
    toolNames: unique(input.toolNames),
    expectedEvidence: unique(input.expectedEvidence),
  };
}

function recording(
  actionId: ResearchActionId,
  evidenceRefs: readonly string[],
  primitiveToolCallIdsRequired = false,
): ResearchPrimitivePlanRecording {
  return {
    actionId,
    expectedOutcome: 'pass | fail | blocked | inconclusive',
    evidenceRefs: unique(evidenceRefs),
    primitiveToolCallIdsRequired,
  };
}

function normalizeTemplate(
  template: ResearchPrimitivePlanTemplate,
): ResearchPrimitivePlanTemplate {
  return {
    ...template,
    toolNames: unique(template.toolNames),
    steps: template.steps.map((item) => ({
      ...item,
      toolNames: unique(item.toolNames),
      expectedEvidence: unique(item.expectedEvidence),
    })),
    recording: {
      ...template.recording,
      evidenceRefs: unique(template.recording.evidenceRefs),
    },
    followupActionIds: unique(template.followupActionIds),
  };
}

function mergeUnique<T extends string>(left: readonly T[], right: readonly T[]): readonly T[] {
  return unique([...left, ...right]);
}

function inferApproval(input: Pick<ResearchPrimitivePlanStep, 'kind' | 'toolNames'>): PrimitivePlanApproval {
  switch (input.kind) {
    case 'edit':
      return 'write';
    case 'submit':
      return 'external';
    case 'run':
      return input.toolNames.includes('Bash') ? 'execute' : 'none';
    case 'inspect':
    case 'search':
    case 'fetch':
      return 'read-only';
    case 'capture':
    case 'record':
      return 'none';
  }
}

function unique<T extends string>(values: readonly T[]): readonly T[] {
  return values.filter((value, index, array) => value.length > 0 && array.indexOf(value) === index);
}
