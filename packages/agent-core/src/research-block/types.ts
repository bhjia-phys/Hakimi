import type { PhysicsCapsuleId, PhysicsCapsuleKind, PhysicsDomainId } from '../physics-memory';

export interface ResearchBlockFormula {
  readonly id: string;
  readonly expression: string;
  readonly symbols?: readonly string[] | undefined;
}

export interface ResearchBlockStatement {
  readonly id: string;
  readonly statement: string;
}

export interface ResearchBlock {
  readonly id: string;
  readonly topic: string;
  readonly domain: PhysicsDomainId;
  readonly title: string;
  readonly candidateCapsuleKind: PhysicsCapsuleKind;
  readonly localClaims?: readonly ResearchBlockStatement[] | undefined;
  readonly formulas?: readonly ResearchBlockFormula[] | undefined;
  readonly assumptions?: readonly ResearchBlockStatement[] | undefined;
  readonly conventions?: readonly ResearchBlockStatement[] | undefined;
  readonly sourceRefs: readonly string[];
  readonly dependsOn?: readonly PhysicsCapsuleId[] | undefined;
  readonly openQuestions?: readonly string[] | undefined;
  readonly relatedObjects?: readonly string[] | undefined;
  readonly body: string;
}

export interface ResearchBlockCompileDiagnostic {
  readonly severity: 'info' | 'warning' | 'error';
  readonly code: string;
  readonly message: string;
}
