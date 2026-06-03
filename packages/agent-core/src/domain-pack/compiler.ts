import { createHash } from 'node:crypto';

import type { DomainProfile, DomainProfileRegistry } from '../domain-profile';
import type { PhysicsCapsule, PhysicsDomainId, PhysicsMemoryRegistry } from '../physics-memory';
import type { ResearchEvalCaseRegistry } from '../research-harness';
import type { WorkflowRecipe, WorkflowRecipeRegistry } from '../workflow-recipe';
import type { DomainPackManifest, DomainPackManifestDiagnostic } from './types';

export interface CompileDomainPackManifestInput {
  readonly domain: PhysicsDomainId;
  readonly domainProfiles?: DomainProfileRegistry | null | undefined;
  readonly workflowRecipes?: WorkflowRecipeRegistry | null | undefined;
  readonly physicsMemory?: PhysicsMemoryRegistry | null | undefined;
  readonly researchHarness?: ResearchEvalCaseRegistry | null | undefined;
  readonly now?: (() => number) | undefined;
}

export function compileDomainPackManifest(
  input: CompileDomainPackManifestInput,
): DomainPackManifest {
  const diagnostics: DomainPackManifestDiagnostic[] = [];
  const profiles = collectProfiles(input, diagnostics);
  const workflows = collectWorkflows(input, profiles, diagnostics);
  const capsules = collectCapsules(input, profiles, diagnostics);
  const evalCaseIds = collectEvalCaseIds(input, diagnostics);
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
  return input.domainProfiles.listProfiles({ domain: input.domain });
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
    if (workflow.metadata.domain !== input.domain) {
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
    if (capsule.metadata.domain !== input.domain) {
      diagnostics.push({
        severity: 'warning',
        code: 'cross-domain-profile-capsule',
        message: `Physics capsule "${capsuleId}" belongs to domain "${capsule.metadata.domain}", not "${input.domain}".`,
        source: 'physics-memory',
        refId: capsuleId,
      });
    }
  }
  return input.physicsMemory.listCapsules({ domain: input.domain });
}

function collectEvalCaseIds(
  input: CompileDomainPackManifestInput,
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
  return input.researchHarness
    .listEvalCases({ domain: input.domain })
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

function safeId(input: string): string {
  return input.replaceAll(/[^a-zA-Z0-9_.-]/g, '-');
}
