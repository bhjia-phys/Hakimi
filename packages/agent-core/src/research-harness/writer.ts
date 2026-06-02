import { promises as fs } from 'node:fs';

import { dump as dumpYaml } from 'js-yaml';
import { join, relative, resolve } from 'pathe';

import type { HarnessCandidate, ResearchActionBinding, ResearchEvalCase, ResearchEvalValidation } from '../research-action';
import {
  promoteHarnessCandidateToEvalCase,
} from './runner';
import { parseResearchEvalCaseText } from './parser';
import type {
  FileBackedResearchEvalCase,
  PromoteHarnessCandidateInput,
  ResearchEvalCaseRoot,
} from './types';

export class ResearchEvalCaseWriteError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ResearchEvalCaseWriteError';
  }
}

export interface ResearchEvalCaseWriteInput {
  readonly root: ResearchEvalCaseRoot;
  readonly evalCase: ResearchEvalCase;
  readonly sourceRefs: readonly string[];
  readonly body: string;
  readonly overwrite?: boolean | undefined;
  readonly mkdir?: typeof fs.mkdir | undefined;
  readonly writeFile?: typeof fs.writeFile | undefined;
  readonly pathExists?: ((path: string) => Promise<boolean>) | undefined;
}

export interface HarnessCandidateEvalWriteInput
  extends Omit<PromoteHarnessCandidateInput, 'candidate'> {
  readonly root: ResearchEvalCaseRoot;
  readonly candidate: HarnessCandidate;
  readonly sessionId?: string | undefined;
  readonly sourceRefs?: readonly string[] | undefined;
  readonly body?: string | undefined;
  readonly overwrite?: boolean | undefined;
  readonly mkdir?: typeof fs.mkdir | undefined;
  readonly writeFile?: typeof fs.writeFile | undefined;
  readonly pathExists?: ((path: string) => Promise<boolean>) | undefined;
}

export interface ResearchEvalCaseWriteResult {
  readonly evalFile: FileBackedResearchEvalCase;
  readonly path: string;
  readonly created: boolean;
}

export async function writeHarnessCandidateEvalCase(
  input: HarnessCandidateEvalWriteInput,
): Promise<ResearchEvalCaseWriteResult> {
  const evalCase = promoteHarnessCandidateToEvalCase({
    candidate: input.candidate,
    id: input.id ?? scopedHarnessEvalCaseId(input.candidate, input.sessionId),
    title: input.title,
    task: input.task,
    domain: input.domain,
    actionSequence: input.actionSequence,
    additionalValidations: input.additionalValidations,
    timeoutSeconds: input.timeoutSeconds,
  });
  const sourceRefs =
    input.sourceRefs ?? candidateSourceRefs(input.candidate, input.sessionId);
  return writeResearchEvalCase({
    root: input.root,
    evalCase,
    sourceRefs,
    body: input.body ?? defaultHarnessCandidateBody(input.candidate),
    overwrite: input.overwrite,
    mkdir: input.mkdir,
    writeFile: input.writeFile,
    pathExists: input.pathExists,
  });
}

export async function writeResearchEvalCase(
  input: ResearchEvalCaseWriteInput,
): Promise<ResearchEvalCaseWriteResult> {
  validateEvalCase(input.evalCase, input.sourceRefs);
  const rootPath = resolve(input.root.path);
  const domainSlug = stableEvalPathSlug(input.evalCase.domain ?? 'general', 'domain');
  const evalSlug = stableEvalPathSlug(input.evalCase.id, 'eval case');
  const dir = join(rootPath, domainSlug);
  const path = resolve(dir, `${evalSlug}.md`);
  assertWithinRoot(rootPath, path);

  const pathExists = input.pathExists ?? defaultPathExists;
  const exists = await pathExists(path);
  if (exists && input.overwrite !== true) {
    throw new ResearchEvalCaseWriteError(`Research eval case file already exists: ${path}`);
  }

  const text = renderResearchEvalCaseText({
    evalCase: input.evalCase,
    sourceRefs: input.sourceRefs,
    body: input.body,
  });
  const evalFile = parseResearchEvalCaseText({
    path,
    source: input.root.source,
    text,
  });

  await (input.mkdir ?? fs.mkdir)(dir, { recursive: true });
  await (input.writeFile ?? fs.writeFile)(path, text, 'utf8');
  return { evalFile, path, created: !exists };
}

export function renderResearchEvalCaseText(input: {
  readonly evalCase: ResearchEvalCase;
  readonly sourceRefs: readonly string[];
  readonly body: string;
}): string {
  return [
    '---',
    dumpYaml(frontmatterForEvalCase(input.evalCase, input.sourceRefs), {
      lineWidth: 100,
      noRefs: true,
      sortKeys: false,
    }).trimEnd(),
    '---',
    '',
    input.body.trimEnd(),
    '',
  ].join('\n');
}

export function stableEvalPathSlug(value: string, label: string): string {
  if (value.includes('\\')) {
    throw new ResearchEvalCaseWriteError(`Unsafe ${label} path slug source: "${value}"`);
  }
  const slug = value
    .trim()
    .replaceAll(/[^A-Za-z0-9._/-]+/g, '-')
    .replaceAll(/\/+/g, '-')
    .replaceAll(/^[._-]+|[._-]+$/g, '');
  if (slug.length === 0) {
    throw new ResearchEvalCaseWriteError(`Cannot derive ${label} path slug from "${value}"`);
  }
  if (slug === '.' || slug === '..' || slug.includes('..')) {
    throw new ResearchEvalCaseWriteError(`Unsafe ${label} path slug: "${slug}"`);
  }
  return slug;
}

function frontmatterForEvalCase(
  evalCase: ResearchEvalCase,
  sourceRefs: readonly string[],
): Record<string, unknown> {
  return {
    id: evalCase.id,
    kind: 'research_eval_case',
    title: evalCase.title,
    task: evalCase.task,
    ...(evalCase.domain === undefined ? {} : { domain: evalCase.domain }),
    source_refs: [...sourceRefs],
    capsule_refs: [...evalCase.capsuleRefs],
    action_sequence: evalCase.actionSequence.map(actionExpectationFrontmatter),
    validations: evalCase.validations.map(validationFrontmatter),
    ...(evalCase.timeoutSeconds === undefined
      ? {}
      : { timeout_seconds: evalCase.timeoutSeconds }),
  };
}

function actionExpectationFrontmatter(
  expectation: ResearchEvalCase['actionSequence'][number],
): string | Record<string, unknown> {
  if (typeof expectation === 'string') return expectation;
  return actionBindingFrontmatter(expectation);
}

function actionBindingFrontmatter(binding: ResearchActionBinding): Record<string, unknown> {
  return {
    id: binding.id,
    action_id: binding.actionId,
    ...(binding.domainId === undefined ? {} : { domain_id: binding.domainId }),
    ...(binding.workflowId === undefined ? {} : { workflow_id: binding.workflowId }),
    ...(binding.lensId === undefined ? {} : { lens_id: binding.lensId }),
    ...(binding.checkId === undefined ? {} : { check_id: binding.checkId }),
    ...(binding.adapterId === undefined ? {} : { adapter_id: binding.adapterId }),
    ...(binding.objectRefs === undefined ? {} : { object_refs: [...binding.objectRefs] }),
    ...(binding.params === undefined ? {} : { params: binding.params }),
    ...(binding.reason === undefined ? {} : { reason: binding.reason }),
    ...(binding.priority === undefined ? {} : { priority: binding.priority }),
  };
}

function validationFrontmatter(validation: ResearchEvalValidation): Record<string, unknown> {
  switch (validation.type) {
    case 'action_outcome':
      return {
        type: validation.type,
        action_id: validation.actionId,
        outcome: validation.outcome,
      };
    case 'evidence_ref':
      return {
        type: validation.type,
        pattern: validation.pattern,
      };
    case 'required_check':
      return {
        type: validation.type,
        check: {
          id: validation.check.id,
          kind: validation.check.kind,
          severity: validation.check.severity,
          ...(validation.check.description === undefined
            ? {}
            : { description: validation.check.description }),
        },
      };
    case 'final_status':
      return {
        type: validation.type,
        status: validation.status,
      };
    case 'forbidden_claim':
      return {
        type: validation.type,
        pattern: validation.pattern,
      };
  }
}

function validateEvalCase(evalCase: ResearchEvalCase, sourceRefs: readonly string[]): void {
  const required = [
    ['id', evalCase.id],
    ['title', evalCase.title],
    ['task', evalCase.task],
  ] as const;
  for (const [field, value] of required) {
    if (typeof value !== 'string' || value.trim().length === 0) {
      throw new ResearchEvalCaseWriteError(`Research eval case requires ${field}.`);
    }
  }
  if (sourceRefs.length === 0) {
    throw new ResearchEvalCaseWriteError('Research eval case requires at least one source ref.');
  }
}

function scopedHarnessEvalCaseId(
  candidate: HarnessCandidate,
  sessionId: string | undefined,
): string | undefined {
  if (sessionId === undefined || sessionId.trim().length === 0) return undefined;
  const base = candidate.id.replace('harness.candidate.', 'harness.eval.');
  return `${base}.session.${stableEvalPathSlug(sessionId, 'session')}`;
}

function candidateSourceRefs(
  candidate: HarnessCandidate,
  sessionId?: string | undefined,
): readonly string[] {
  const refs =
    candidate.evidenceRefs.length > 0
      ? candidate.evidenceRefs
      : [`action:${candidate.sourceActionId}:${candidate.sourceCallId}`];
  if (sessionId === undefined || sessionId.trim().length === 0) return refs;
  return [...refs, `session:${sessionId}`];
}

function defaultHarnessCandidateBody(candidate: HarnessCandidate): string {
  return [
    `Candidate generated from ${candidate.sourceActionId} (${candidate.sourceCallId}).`,
    '',
    `Outcome: ${candidate.outcome}.`,
    '',
    'Evidence refs:',
    ...candidateSourceRefs(candidate).map((ref) => `- ${ref}`),
  ].join('\n');
}

function assertWithinRoot(rootPath: string, targetPath: string): void {
  const rel = relative(rootPath, targetPath);
  if (rel.startsWith('..') || rel === '') {
    throw new ResearchEvalCaseWriteError(`Research eval case path escapes root: ${targetPath}`);
  }
}

async function defaultPathExists(path: string): Promise<boolean> {
  try {
    await fs.stat(path);
    return true;
  } catch {
    return false;
  }
}
