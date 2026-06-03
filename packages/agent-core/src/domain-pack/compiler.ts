import { createHash } from 'node:crypto';

import type { DomainProfile, DomainProfileRegistry } from '../domain-profile';
import type { PhysicsCapsule, PhysicsDomainId, PhysicsMemoryRegistry } from '../physics-memory';
import type { ResearchEvalCaseRegistry } from '../research-harness';
import type { WorkFrame } from '../research-action';
import {
  GENERIC_THEORETICAL_PHYSICS_COMPUTATIONAL_WORKFLOW_ID,
  GENERIC_THEORETICAL_PHYSICS_DOMAIN,
  GENERIC_THEORETICAL_PHYSICS_EVAL_ID,
  GENERIC_THEORETICAL_PHYSICS_PROFILE_ID,
  hasComputationalResearchIntent,
  isGenericTheoreticalPhysicsCapsuleId,
  isGenericTheoreticalPhysicsProfileId,
  isGenericTheoreticalPhysicsWorkflowId,
  shouldUseGenericTheoreticalPhysicsFallback,
} from '../research-defaults/theoretical-physics';
import type { WorkflowRecipe, WorkflowRecipeRegistry } from '../workflow-recipe';
import type { DomainPackManifest, DomainPackManifestDiagnostic } from './types';

export interface CompileDomainPackManifestInput {
  readonly domain: PhysicsDomainId;
  readonly domainProfiles?: DomainProfileRegistry | null | undefined;
  readonly workflowRecipes?: WorkflowRecipeRegistry | null | undefined;
  readonly physicsMemory?: PhysicsMemoryRegistry | null | undefined;
  readonly researchHarness?: ResearchEvalCaseRegistry | null | undefined;
  readonly workFrame?: Pick<WorkFrame, 'topic' | 'goal'> | undefined;
  readonly now?: (() => number) | undefined;
}

export function compileDomainPackManifest(
  input: CompileDomainPackManifestInput,
): DomainPackManifest {
  const diagnostics: DomainPackManifestDiagnostic[] = [];
  const profiles = collectProfiles(input, diagnostics);
  const workflows = collectWorkflows(input, profiles, diagnostics);
  const capsules = collectCapsules(input, profiles, diagnostics);
  const evalCaseIds = collectEvalCaseIds(input, profiles, diagnostics);
  const profileIds = profiles.map((profile) => profile.metadata.id);
  const workflowIds = workflows.map((workflow) => workflow.metadata.id);
  const capsuleIds = capsules.map((capsule) => capsule.metadata.id);
  const bridgeCapsuleIds = unique([
    ...profiles.flatMap((profile) => profile.metadata.bridgeCapsules),
    ...capsules
      .filter((capsule) => capsule.metadata.kind === 'Bridge')
      .map((capsule) => capsule.metadata.id),
  ]);
  const actionBindingIds = unique([
    ...workflows.flatMap((workflow) =>
      workflow.metadata.actionBindings.map((binding) => binding.id),
    ),
    ...capsules.flatMap((capsule) =>
      capsule.metadata.actionAffordances.map(
        (affordance) => `binding.${capsule.metadata.id}.${affordance.actionId}`,
      ),
    ),
  ]);
  const actionIds = unique([
    ...workflows.flatMap((workflow) =>
      workflow.metadata.actionBindings.map((binding) => binding.actionId),
    ),
    ...capsules.flatMap((capsule) =>
      capsule.metadata.actionAffordances.map((affordance) => affordance.actionId),
    ),
  ]);
  const requiredTools = unique(
    workflows.flatMap((workflow) => workflow.metadata.requiredTools),
  );
  const contextTags = unique(profiles.flatMap((profile) => profile.metadata.contextTags));

  return {
    id: manifestId({
      domain: input.domain,
      profileIds,
      workflowIds,
      capsuleIds,
      evalCaseIds,
      actionBindingIds,
      requiredTools,
      contextTags,
    }),
    domain: input.domain,
    profileIds,
    workflowIds,
    capsuleIds,
    bridgeCapsuleIds,
    evalCaseIds,
    actionBindingIds,
    actionIds,
    requiredTools,
    contextTags,
    diagnostics,
    compiledAt: input.now?.() ?? Date.now(),
  };
}

function collectProfiles(
  input: CompileDomainPackManifestInput,
  diagnostics: DomainPackManifestDiagnostic[],
): readonly DomainProfile[] {
  if (input.domainProfiles === null || input.domainProfiles === undefined) {
    diagnostics.push({
      severity: 'info',
      code: 'domain-profile-registry-disabled',
      message: 'DomainProfile registry is not available for this session.',
      source: 'domain-profile',
    });
    return [];
  }
  for (const diagnostic of input.domainProfiles.getDiagnostics()) {
    diagnostics.push({
      severity: diagnostic.severity,
      code: diagnostic.code,
      message: diagnostic.message,
      source: 'domain-profile',
      refId: diagnostic.profileId,
      path: diagnostic.path,
      rootPath: diagnostic.rootPath,
    });
  }
  const exactProfiles = input.domainProfiles.listProfiles({ domain: input.domain });
  if (
    !shouldUseGenericTheoreticalPhysicsFallback({
      domain: input.domain,
      exactCount: exactProfiles.length,
    })
  ) {
    return exactProfiles;
  }
  const fallback = input.domainProfiles.getProfile(GENERIC_THEORETICAL_PHYSICS_PROFILE_ID);
  if (fallback === undefined) return exactProfiles;
  diagnostics.push({
    severity: 'info',
    code: 'generic-theoretical-physics-profile-fallback',
    message:
      `No domain profile is registered for "${input.domain}"; using the built-in ` +
      `${GENERIC_THEORETICAL_PHYSICS_DOMAIN} research profile as a process scaffold.`,
    source: 'domain-profile',
    refId: fallback.metadata.id,
  });
  return [fallback];
}

function collectWorkflows(
  input: CompileDomainPackManifestInput,
  profiles: readonly DomainProfile[],
  diagnostics: DomainPackManifestDiagnostic[],
): readonly WorkflowRecipe[] {
  if (input.workflowRecipes === null || input.workflowRecipes === undefined) {
    diagnostics.push({
      severity: 'info',
      code: 'workflow-recipe-registry-disabled',
      message: 'WorkflowRecipe registry is not available for this session.',
      source: 'workflow-recipe',
    });
    return [];
  }
  for (const diagnostic of input.workflowRecipes.getDiagnostics()) {
    diagnostics.push({
      severity: diagnostic.severity,
      code: diagnostic.code,
      message: diagnostic.message,
      source: 'workflow-recipe',
      refId: diagnostic.recipeId,
      path: diagnostic.path,
      rootPath: diagnostic.rootPath,
    });
  }
  const profileWorkflowIds = unique(
    profiles.flatMap((profile) => profile.metadata.workflows),
  );
  if (profileWorkflowIds.length === 0) {
    return input.workflowRecipes.listRecipes({ domain: input.domain });
  }

  const byId = new Map<string, WorkflowRecipe>();
  const usingGenericFallback = profiles.some((profile) =>
    isGenericTheoreticalPhysicsProfileId(profile.metadata.id),
  );
  for (const workflowId of profileWorkflowIds) {
    const workflow = input.workflowRecipes.getRecipe(workflowId);
    if (workflow === undefined) {
      diagnostics.push({
        severity: 'warning',
        code: 'missing-profile-workflow',
        message: `Domain profile references missing workflow recipe "${workflowId}".`,
        source: 'workflow-recipe',
        refId: workflowId,
      });
      continue;
    }
    if (
      workflow.metadata.domain !== input.domain &&
      !isGenericTheoreticalPhysicsWorkflowId(workflow.metadata.id)
    ) {
      diagnostics.push({
        severity: 'warning',
        code: 'cross-domain-profile-workflow',
        message: `Workflow recipe "${workflowId}" belongs to domain "${workflow.metadata.domain}", not "${input.domain}".`,
        source: 'workflow-recipe',
        refId: workflowId,
      });
      continue;
    }
    byId.set(workflow.metadata.id, workflow);
  }
  if (usingGenericFallback && input.workFrame !== undefined && hasComputationalResearchIntent(input.workFrame)) {
    const computational = input.workflowRecipes.getRecipe(
      GENERIC_THEORETICAL_PHYSICS_COMPUTATIONAL_WORKFLOW_ID,
    );
    if (computational !== undefined) byId.set(computational.metadata.id, computational);
  }
  return [...byId.values()].toSorted((a, b) => a.metadata.id.localeCompare(b.metadata.id));
}

function collectCapsules(
  input: CompileDomainPackManifestInput,
  profiles: readonly DomainProfile[],
  diagnostics: DomainPackManifestDiagnostic[],
): readonly PhysicsCapsule[] {
  if (input.physicsMemory === null || input.physicsMemory === undefined) {
    diagnostics.push({
      severity: 'info',
      code: 'physics-memory-registry-disabled',
      message: 'PhysicsMemory registry is not available for this session.',
      source: 'physics-memory',
    });
    return [];
  }
  for (const diagnostic of input.physicsMemory.getDiagnostics()) {
    diagnostics.push({
      severity: diagnostic.severity,
      code: diagnostic.code,
      message: diagnostic.message,
      source: 'physics-memory',
      refId: diagnostic.capsuleId,
      path: diagnostic.path,
      rootPath: diagnostic.rootPath,
    });
  }
  for (const capsuleId of unique(
    profiles.flatMap((profile) => [
      ...profile.metadata.capsuleRefs,
      ...profile.metadata.bridgeCapsules,
    ]),
  )) {
    const capsule = input.physicsMemory.getCapsule(capsuleId);
    if (capsule === undefined) {
      diagnostics.push({
        severity: 'warning',
        code: 'missing-profile-capsule',
        message: `Domain profile references missing physics capsule "${capsuleId}".`,
        source: 'physics-memory',
        refId: capsuleId,
      });
      continue;
    }
    if (
      capsule.metadata.domain !== input.domain &&
      !isGenericTheoreticalPhysicsCapsuleId(capsule.metadata.id)
    ) {
      diagnostics.push({
        severity: 'warning',
        code: 'cross-domain-profile-capsule',
        message: `Physics capsule "${capsuleId}" belongs to domain "${capsule.metadata.domain}", not "${input.domain}".`,
        source: 'physics-memory',
        refId: capsuleId,
      });
    }
  }
  const exactCapsules = input.physicsMemory.listCapsules({ domain: input.domain });
  const usingGenericFallback = profiles.some((profile) =>
    isGenericTheoreticalPhysicsProfileId(profile.metadata.id),
  );
  if (!usingGenericFallback) {
    return exactCapsules;
  }
  return uniqueCapsules([
    ...exactCapsules,
    ...input.physicsMemory.listCapsules({ domain: GENERIC_THEORETICAL_PHYSICS_DOMAIN }),
  ]);
}

function collectEvalCaseIds(
  input: CompileDomainPackManifestInput,
  profiles: readonly DomainProfile[],
  diagnostics: DomainPackManifestDiagnostic[],
): readonly string[] {
  if (input.researchHarness === null || input.researchHarness === undefined) {
    diagnostics.push({
      severity: 'info',
      code: 'research-harness-registry-disabled',
      message: 'ResearchEvalCase registry is not available for this session.',
      source: 'research-harness',
    });
    return [];
  }
  for (const diagnostic of input.researchHarness.getDiagnostics()) {
    diagnostics.push({
      severity: diagnostic.severity,
      code: diagnostic.code,
      message: diagnostic.message,
      source: 'research-harness',
      refId: diagnostic.evalCaseId,
      path: diagnostic.path,
      rootPath: diagnostic.rootPath,
    });
  }
  const exactEvalCaseIds = input.researchHarness
    .listEvalCases({ domain: input.domain })
    .map((evalCase) => evalCase.evalCase.id);
  if (exactEvalCaseIds.length > 0) return exactEvalCaseIds;
  if (!profiles.some((profile) => isGenericTheoreticalPhysicsProfileId(profile.metadata.id))) {
    return [];
  }
  return input.researchHarness
    .listEvalCases({ domain: GENERIC_THEORETICAL_PHYSICS_DOMAIN })
    .filter((evalCase) => evalCase.evalCase.id === GENERIC_THEORETICAL_PHYSICS_EVAL_ID)
    .map((evalCase) => evalCase.evalCase.id);
}

function manifestId(input: {
  readonly domain: string;
  readonly profileIds: readonly string[];
  readonly workflowIds: readonly string[];
  readonly capsuleIds: readonly string[];
  readonly evalCaseIds: readonly string[];
  readonly actionBindingIds: readonly string[];
  readonly requiredTools: readonly string[];
  readonly contextTags: readonly string[];
}): string {
  const hash = createHash('sha256')
    .update(JSON.stringify(input))
    .digest('hex')
    .slice(0, 12);
  return `domain-pack.${safeId(input.domain)}.${hash}`;
}

function unique(values: readonly string[]): readonly string[] {
  return [...new Set(values.filter((value) => value.length > 0))].toSorted();
}

function uniqueCapsules(capsules: readonly PhysicsCapsule[]): readonly PhysicsCapsule[] {
  const byId = new Map<string, PhysicsCapsule>();
  for (const capsule of capsules) {
    if (!byId.has(capsule.metadata.id)) byId.set(capsule.metadata.id, capsule);
  }
  return [...byId.values()].toSorted((a, b) => a.metadata.id.localeCompare(b.metadata.id));
}

function safeId(input: string): string {
  return input.replaceAll(/[^a-zA-Z0-9_.-]/g, '-');
}
