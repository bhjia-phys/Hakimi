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
    suggestedActions: lens.suggestedActions,
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
