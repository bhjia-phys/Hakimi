import type {
  PhysicsLens,
  PhysicsLensApplicabilityInput,
  PhysicsLensApplicabilityResult,
} from './types';

interface NormalizedPhysicsDirectionInput {
  readonly domain?: string | undefined;
  readonly text: string;
  readonly objectKinds: ReadonlySet<string>;
  readonly relationKinds: ReadonlySet<string>;
  readonly contextTags: ReadonlySet<string>;
}

export function checkPhysicsLensApplicability(
  lens: PhysicsLens,
  input: PhysicsLensApplicabilityInput,
): PhysicsLensApplicabilityResult {
  const normalized = normalizePhysicsDirectionInput(input);
  const rejectionReasons: string[] = [];
  const diagnostics: string[] = [];

  if (normalized.domain && !isDomainCompatible(lens, normalized.domain)) {
    rejectionReasons.push(`Input domain ${normalized.domain} is outside lens domains.`);
  }

  const rejectedObjects = intersect(lens.rejectObjectKinds ?? [], normalized.objectKinds);
  if (rejectedObjects.length > 0) {
    rejectionReasons.push(`Rejected object kinds present: ${rejectedObjects.join(', ')}.`);
  }

  const rejectedTags = intersect(lens.rejectContextTags ?? [], normalized.contextTags);
  if (rejectedTags.length > 0) {
    rejectionReasons.push(`Rejected context tags present: ${rejectedTags.join(', ')}.`);
  }

  const matchedObjectKinds = intersect(lens.requiredObjectKinds, normalized.objectKinds);
  const missingObjectKinds = lens.requiredObjectKinds.filter(
    (kind) => !normalized.objectKinds.has(normalizeToken(kind)),
  );

  const requiredRelations = lens.requiredRelationKinds ?? [];
  const matchedRelationKinds = intersect(requiredRelations, normalized.relationKinds);
  const missingRelationKinds =
    requiredRelations.length > 0 && matchedRelationKinds.length === 0 ? requiredRelations : [];

  const matchedContextTags = intersect(lens.supportingContextTags ?? [], normalized.contextTags);

  if (missingObjectKinds.length > 0) {
    diagnostics.push(`Missing required object kinds: ${missingObjectKinds.join(', ')}.`);
  }
  if (missingRelationKinds.length > 0) {
    diagnostics.push(
      `Need at least one relation cue among: ${missingRelationKinds.join(', ')}.`,
    );
  }

  const status = determineStatus({
    rejectionReasons,
    missingObjectKinds,
    missingRelationKinds,
  });
  const score = scoreLens({
    status,
    lens,
    matchedObjectKinds,
    matchedRelationKinds,
    matchedContextTags,
  });

  return {
    lens,
    status,
    confidence: confidenceForScore(score, status),
    score,
    matchedObjectKinds,
    missingObjectKinds,
    matchedRelationKinds,
    missingRelationKinds,
    matchedContextTags,
    rejectionReasons,
    diagnostics,
    caveats: lens.caveats,
    guidingQuestions: lens.guidingQuestions,
    requiredChecks: lens.requiredChecks,
    suggestedActionBindings: lens.suggestedActionBindings,
    suggestedActions:
      lens.suggestedActions ?? lens.suggestedActionBindings.map((binding) => binding.actionId),
    expansionHandles: lens.expansionHandles ?? [],
  };
}

export function normalizePhysicsDirectionInput(
  input: PhysicsLensApplicabilityInput,
): NormalizedPhysicsDirectionInput {
  const text = [
    input.topic ?? '',
    input.prompt ?? '',
    ...(input.capsuleIds ?? []),
    ...(input.codeRegionTags ?? []),
  ]
    .join(' ')
    .toLowerCase();
  const objectKinds = new Set<string>();
  const relationKinds = new Set<string>();
  const contextTags = new Set<string>();

  addAll(objectKinds, input.activeObjectKinds ?? []);
  addAll(relationKinds, input.activeRelationKinds ?? []);
  addAll(contextTags, input.contextTags ?? []);
  addAll(contextTags, input.codeRegionTags ?? []);
  inferObjects(text, objectKinds);
  inferRelations(text, relationKinds);
  inferContextTags(text, contextTags);

  return {
    domain: input.domain ? normalizeToken(input.domain) : undefined,
    text,
    objectKinds,
    relationKinds,
    contextTags,
  };
}

function determineStatus(input: {
  readonly rejectionReasons: readonly string[];
  readonly missingObjectKinds: readonly string[];
  readonly missingRelationKinds: readonly string[];
}): PhysicsLensApplicabilityResult['status'] {
  if (input.rejectionReasons.length > 0) return 'rejected';
  if (input.missingObjectKinds.length > 0 || input.missingRelationKinds.length > 0) {
    return 'needs_context';
  }
  return 'applicable';
}

function scoreLens(input: {
  readonly status: PhysicsLensApplicabilityResult['status'];
  readonly lens: PhysicsLens;
  readonly matchedObjectKinds: readonly string[];
  readonly matchedRelationKinds: readonly string[];
  readonly matchedContextTags: readonly string[];
}): number {
  if (input.status === 'rejected') return 0;
  const objectScore =
    input.lens.requiredObjectKinds.length === 0
      ? 0.25
      : 0.4 * (input.matchedObjectKinds.length / input.lens.requiredObjectKinds.length);
  const requiredRelationCount = input.lens.requiredRelationKinds?.length ?? 0;
  const relationScore =
    requiredRelationCount === 0 ? 0.2 : input.matchedRelationKinds.length > 0 ? 0.25 : 0;
  const contextScore = Math.min(0.25, input.matchedContextTags.length * 0.08);
  const base = input.status === 'applicable' ? 0.1 : 0;
  return roundScore(base + objectScore + relationScore + contextScore);
}

function confidenceForScore(
  score: number,
  status: PhysicsLensApplicabilityResult['status'],
): PhysicsLensApplicabilityResult['confidence'] {
  if (status === 'rejected' || score < 0.5) return 'low';
  if (score < 0.75) return 'medium';
  return 'high';
}

function isDomainCompatible(lens: PhysicsLens, domain: string): boolean {
  return lens.domains.some((lensDomain) => {
    const normalizedLensDomain = normalizeToken(lensDomain);
    return (
      normalizedLensDomain === domain ||
      domain.startsWith(`${normalizedLensDomain}/`) ||
      normalizedLensDomain.startsWith(`${domain}/`)
    );
  });
}

function inferObjects(text: string, output: Set<string>): void {
  if (matchesAny(text, ['charge', 'fractional charge', 'quasiparticle', 'anyon', 'e/m', 'q*'])) {
    output.add('charge');
  }
  if (matchesAny(text, ['flux', 'phi', 'magnetic flux', 'flux quantum'])) {
    output.add('flux');
  }
  if (matchesAny(text, ['external electromagnetic flux', 'external em flux'])) {
    output.add('external_em_flux');
  }
  if (matchesAny(text, ['emergent', 'chern-simons flux', 'statistical flux', 'cs flux'])) {
    output.add('emergent_cs_flux');
  }
  if (matchesAny(text, ['berry curvature flux', 'momentum-space flux', 'momentum space flux'])) {
    output.add('berry_curvature_flux');
  }
  if (matchesAny(text, ['formula', 'equation'])) {
    output.add('formula');
  }
  if (matchesAny(text, ['code', 'implementation', 'file', 'call site', 'call-site'])) {
    output.add('code_region');
  }
  if (
    matchesAny(text, [
      'degree of freedom',
      'degrees of freedom',
      'dynamical variable',
      'particle',
      'matter',
      'field',
      'wavepacket',
      'wave packet',
      'distribution',
      'operator',
      'motion',
      'dynamics',
      'move',
      'moves',
      'moving',
      '有质量',
      '物质',
      '粒子',
      '场',
      '波包',
      '怎么动',
    ])
  ) {
    output.add('dynamical_degree');
  }
  if (
    matchesAny(text, [
      'observable',
      'observables',
      'measure',
      'measurement',
      'flux',
      'survival',
      'hitting time',
      'trajectory',
      'correlator',
      'response',
      'energy',
      'probability',
      'current',
      'absorption rate',
      '观测量',
      '能流',
      '存活',
      '到达时间',
      '轨迹',
    ])
  ) {
    output.add('observable');
  }
}

function inferRelations(text: string, output: Set<string>): void {
  if (matchesAny(text, ['ab phase', 'aharonov', 'q phi', 'exp(i q'])) {
    output.add('ab_phase');
  }
  if (matchesAny(text, ['flux insertion', 'laughlin argument', 'pump', 'pumps'])) {
    output.add('flux_insertion');
  }
  if (matchesAny(text, ['large gauge', 'compact u(1)', 'compact u1'])) {
    output.add('large_gauge_transformation');
  }
  if (
    matchesAny(text, ['dirac', 'quantization', 'h/q', '2 pi/q', 'smaller', 'larger']) &&
    matchesAny(text, ['charge', 'fractional charge', 'q*']) &&
    matchesAny(text, ['flux', 'phi'])
  ) {
    output.add('dirac_quantization');
  }
  if (matchesAny(text, ['formula-code', 'formula to code', 'map formula', 'code mapping'])) {
    output.add('formula_code_mapping');
  }
  if (matchesAny(text, ['call site', 'call-site', 'downstream', 'reference'])) {
    output.add('downstream_call_site');
  }
  if (matchesAny(text, ['observable', 'intermediate value', 'head-wing'])) {
    output.add('intermediate_observable');
  }
  if (
    matchesAny(text, [
      'boundary',
      'boundary condition',
      'reflecting',
      'absorbing',
      'wall',
      'cutoff',
      'edge',
      '边界',
      '反射',
      '吸收',
    ])
  ) {
    output.add('boundary_condition');
  }
  if (
    matchesAny(text, [
      'source',
      'sink',
      'bath',
      'measurement',
      'open system',
      'coupling',
      'channel',
      'absorb',
      'absorbing',
      '源',
      '汇',
      '浴',
      '通道',
      '耦合',
    ])
  ) {
    output.add('source_or_sink');
  }
  if (
    matchesAny(text, [
      'scale',
      'limit',
      'regime',
      'cutoff',
      'reach',
      'hitting',
      'hit',
      'arrival',
      'turning point',
      'mass',
      'heavy',
      'light',
      'rate',
      'separation',
      '极限',
      '尺度',
      '质量',
    ])
  ) {
    output.add('scale_separation');
  }
  if (
    matchesAny(text, [
      'reach',
      'reaches',
      'hitting',
      'hit',
      'arrival',
      'turning point',
      'cutoff',
      'wall',
      'support',
      'overlap',
      'tail',
      'known limit',
    ])
  ) {
    output.add('reachability_constraint');
  }
  if (
    matchesAny(text, [
      'model layer',
      'classical',
      'field theory',
      'kinetic',
      'ensemble',
      'effective',
      'toy model',
      'numerical',
      '建模',
      '层次',
      '经典',
      '动理学',
    ])
  ) {
    output.add('model_layer');
  }
}

function inferContextTags(text: string, output: Set<string>): void {
  if (matchesAny(text, ['fqhe', 'fractional quantum hall', 'laughlin'])) {
    output.add('fqhe');
  }
  if (matchesAny(text, ['chern-simons', 'chern simons', 'cs theory', 'k-matrix', 'k matrix'])) {
    output.add('chern_simons');
  }
  if (matchesAny(text, ['topological order', 'anyon'])) {
    output.add('topological_order');
  }
  if (matchesAny(text, ['berry curvature', 'chern number'])) {
    output.add('berry_curvature');
  }
  if (matchesAny(text, ['momentum space', 'momentum-space', 'brillouin'])) {
    output.add('momentum_space');
  }
  if (matchesAny(text, ['librpa', 'rpa', 'gw'])) {
    output.add('librpa');
  }
  if (matchesAny(text, ['head-wing', 'head wing', 'head/wing'])) {
    output.add('head_wing');
  }
  if (matchesAny(text, ['git diff', 'code change', 'implementation'])) {
    output.add('code_change');
  }
  if (matchesAny(text, ['theoretical physics', 'theory', '理论物理'])) {
    output.add('theoretical_physics');
  }
  if (matchesAny(text, ['new topic', 'new problem', 'first-pass', 'from scratch', '全新', '新问题'])) {
    output.add('new_topic');
  }
  if (matchesAny(text, ['boundary', 'wall', 'cutoff', '边界'])) {
    output.add('boundary_condition');
  }
  if (matchesAny(text, ['open system', 'bath', 'measurement', 'absorbing', '开放系统', '测量', '浴'])) {
    output.add('open_system');
  }
  if (matchesAny(text, ['massive matter', 'massive particle', 'massive field', '有质量的物质', '有质量'])) {
    output.add('massive_matter');
  }
  if (matchesAny(text, ['observable', 'survival', 'hitting', 'flux', '观测量', '存活', '能流'])) {
    output.add('observable');
  }
  if (matchesAny(text, ['matter moves', 'matter motion', 'particle motion', 'trajectory', 'wavepacket', 'how massive matter moves'])) {
    output.add('matter_motion');
  }
  if (matchesAny(text, ['hitting time', 'hit time', 'first passage', 'arrival time', 'hitting-time'])) {
    output.add('hitting_time');
  }
  if (matchesAny(text, ['survival probability', 'survival', 'not absorbed'])) {
    output.add('survival_analysis');
  }
  if (matchesAny(text, ['energy flux', 'flux loss', 'absorbed energy'])) {
    output.add('energy_flux');
  }
}

function matchesAny(text: string, needles: readonly string[]): boolean {
  return needles.some((needle) => text.includes(needle));
}

function intersect<T extends string>(
  expected: readonly T[],
  actual: ReadonlySet<string>,
): readonly T[] {
  return expected.filter((item) => actual.has(normalizeToken(item)));
}

function addAll(output: Set<string>, values: readonly string[]): void {
  for (const value of values) {
    output.add(normalizeToken(value));
  }
}

function normalizeToken(value: string): string {
  return value.trim().toLowerCase().replaceAll('-', '_').replaceAll(' ', '_');
}

function roundScore(value: number): number {
  return Math.round(value * 1000) / 1000;
}
