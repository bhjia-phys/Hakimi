import type { CheckContract, PhysicsCapsule } from '../physics-memory';
import type { ResearchBlock, ResearchBlockCompileDiagnostic } from './types';

export interface CompileResearchBlockResult {
  readonly capsule: PhysicsCapsule;
  readonly diagnostics: readonly ResearchBlockCompileDiagnostic[];
}

export function compileResearchBlockToCandidateCapsule(
  block: ResearchBlock,
): CompileResearchBlockResult {
  const diagnostics: ResearchBlockCompileDiagnostic[] = [];
  if (block.sourceRefs.length === 0) {
    diagnostics.push({
      severity: 'warning',
      code: 'missing-source-ref',
      message: 'Candidate capsules should keep source refs even when they remain unpromoted.',
    });
  }
  if ((block.openQuestions ?? []).length > 0) {
    diagnostics.push({
      severity: 'info',
      code: 'open-questions-preserved',
      message: 'Open questions were preserved on the candidate capsule boundary.',
    });
  }

  const capsule: PhysicsCapsule = {
    metadata: {
      id: `capsule.candidate.${block.id}`,
      kind: block.candidateCapsuleKind,
      domain: block.domain,
      title: block.title,
      reliability: 'raw',
      symbols: collectSymbols(block),
      assumes: (block.assumptions ?? []).map((assumption) => assumption.id),
      dependsOn: block.dependsOn ?? [],
      sourceRefs: block.sourceRefs,
      graphRefs: (block.relatedObjects ?? []).map((id) => ({
        kind: 'Concept',
        id,
        relation: 'depends_on',
      })),
      expansionHandles: [
        {
          kind: 'derivation',
          ref: `research-block:${block.id}`,
          title: block.title,
        },
        ...block.sourceRefs.map((ref) => ({
          kind: 'source' as const,
          ref,
        })),
      ],
      requiredChecks: requiredChecksForBlock(block),
      actionAffordances: [
        {
          actionId: 'memory.propose_capsule',
          intent: 'recommended',
          reason: 'Research block reached a capsule boundary but remains unpromoted.',
        },
      ],
      scope: {
        assumptions: (block.assumptions ?? []).map((assumption) => assumption.statement),
      },
      allowCrossDomain: false,
    },
    path: `memory://candidate/${block.id}`,
    body: renderCandidateBody(block),
    source: 'project',
  };
  return { capsule, diagnostics };
}

function collectSymbols(block: ResearchBlock): readonly string[] {
  return [
    ...new Set(
      (block.formulas ?? [])
        .flatMap((formula) => formula.symbols ?? [])
        .map((symbol) => symbol.trim())
        .filter((symbol) => symbol.length > 0),
    ),
  ].toSorted();
}

function requiredChecksForBlock(block: ResearchBlock): readonly CheckContract[] {
  const checks: CheckContract[] = [];
  if ((block.formulas ?? []).length > 0) {
    checks.push({
      id: `check.${block.id}.dimension`,
      kind: 'dimension',
      severity: 'blocking',
      description: 'Formula-bearing candidate capsules require dimensional consistency checks.',
    });
    checks.push({
      id: `check.${block.id}.symbol-closure`,
      kind: 'symbol_closure',
      severity: 'warning',
      description: 'Formula-bearing candidate capsules should close all symbols.',
    });
  }
  if ((block.conventions ?? []).length > 0) {
    checks.push({
      id: `check.${block.id}.convention`,
      kind: 'convention',
      severity: 'blocking',
      description: 'Convention-sensitive candidate capsules require convention checks.',
    });
  }
  if ((block.assumptions ?? []).length > 0) {
    checks.push({
      id: `check.${block.id}.assumption-scope`,
      kind: 'assumption_scope',
      severity: 'warning',
      description: 'Assumptions must keep scope before promotion.',
    });
  }
  return checks;
}

function renderCandidateBody(block: ResearchBlock): string {
  return [
    `# ${block.title}`,
    '',
    block.body.trim(),
    '',
    renderStatements('Local Claims', block.localClaims ?? []),
    renderFormulas(block.formulas ?? []),
    renderStatements('Assumptions', block.assumptions ?? []),
    renderStatements('Conventions', block.conventions ?? []),
    renderList('Open Questions', block.openQuestions ?? []),
  ]
    .filter((section) => section.length > 0)
    .join('\n\n')
    .trimEnd();
}

function renderStatements(
  title: string,
  statements: readonly { readonly id: string; readonly statement: string }[],
): string {
  if (statements.length === 0) return '';
  return [`## ${title}`, '', ...statements.map((item) => `- ${item.id}: ${item.statement}`)].join('\n');
}

function renderFormulas(
  formulas: readonly { readonly id: string; readonly expression: string }[],
): string {
  if (formulas.length === 0) return '';
  return [`## Formulas`, '', ...formulas.map((item) => `- ${item.id}: ${item.expression}`)].join('\n');
}

function renderList(title: string, values: readonly string[]): string {
  if (values.length === 0) return '';
  return [`## ${title}`, '', ...values.map((value) => `- ${value}`)].join('\n');
}
