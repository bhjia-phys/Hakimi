import type { ResearchEvalCheckResult } from '../research-harness';
import type {
  BenchmarkAdapter,
  BenchmarkAdapterRunInput,
  BenchmarkAdapterRunResult,
  BenchmarkAdapterOutcome,
} from './types';

export const EXTERNAL_JOB_SUBMISSION_ADAPTER_ID = 'adapter.external.job-submission';
export const EXTERNAL_JOB_SUBMISSION_ACTION_ID = 'benchmark.submit_external_job';
export const EXTERNAL_JOB_SUBMISSION_CHECK_ID = 'check.external-job.submission';
export const DEFAULT_EXTERNAL_JOB_SUBMISSION_CASE_ID = 'case.external.job-submission';

export type ExternalJobBackendKind = 'scheduler' | 'mcp' | 'hpc' | 'manual';

export interface ExternalJobBackendDescriptor {
  readonly kind: ExternalJobBackendKind;
  readonly name?: string | undefined;
  readonly queue?: string | undefined;
  readonly command?: string | undefined;
  readonly endpoint?: string | undefined;
}

export interface ExternalJobSubmissionPayload {
  readonly backend: ExternalJobBackendDescriptor;
  readonly jobScript?: string | undefined;
  readonly jobId?: string | undefined;
  readonly schedulerOutput?: string | undefined;
  readonly status?: 'submitted' | 'prepared' | 'blocked' | undefined;
  readonly dryRun?: boolean | undefined;
  readonly artifactRefs?: readonly string[] | undefined;
  readonly evidenceRefs?: readonly string[] | undefined;
}

export const EXTERNAL_JOB_SUBMISSION_ADAPTER: BenchmarkAdapter = {
  id: EXTERNAL_JOB_SUBMISSION_ADAPTER_ID,
  title: 'External job submission receipt contract',
  domain: 'external/job-submission',
  supportedActionIds: [EXTERNAL_JOB_SUBMISSION_ACTION_ID],
  run(input: BenchmarkAdapterRunInput): BenchmarkAdapterRunResult {
    const caseId = input.caseId ?? DEFAULT_EXTERNAL_JOB_SUBMISSION_CASE_ID;
    const parsed = parseExternalJobSubmissionPayload(input.payload);
    const baseEvidenceRefs = [
      `benchmark:${caseId}`,
      EXTERNAL_JOB_SUBMISSION_ADAPTER_ID,
      ...(input.sourceRefs ?? []),
    ];
    if (parsed === undefined) {
      return result({
        caseId,
        outcome: 'blocked',
        observation:
          'External job submission blocked; payload must provide a backend descriptor and a scheduler receipt, prepared dry-run, or blocked status.',
        output: { validationError: 'invalid-external-job-submission-payload' },
        evidenceRefs: baseEvidenceRefs,
        artifactRefs: [],
      });
    }

    const normalized = normalizeExternalJobSubmission(parsed);
    const evidenceRefs = [
      ...baseEvidenceRefs,
      `external-job-backend:${parsed.backend.kind}`,
      ...(parsed.backend.name === undefined ? [] : [`external-job-backend:${parsed.backend.name}`]),
      ...(parsed.jobId === undefined ? [] : [`job:${parsed.jobId}`]),
      ...(parsed.jobScript === undefined ? [] : [`job-script:${parsed.jobScript}`]),
      ...(parsed.evidenceRefs ?? []),
    ];
    const artifactRefs = parsed.artifactRefs ?? [];

    return result({
      caseId,
      outcome: normalized.outcome,
      observation: normalized.observation,
      output: {
        backend: parsed.backend,
        jobScript: parsed.jobScript,
        jobId: parsed.jobId,
        schedulerOutput: parsed.schedulerOutput,
        status: normalized.status,
        dryRun: parsed.dryRun === true,
      },
      evidenceRefs,
      artifactRefs,
    });
  },
};

function normalizeExternalJobSubmission(input: ExternalJobSubmissionPayload): {
  readonly outcome: BenchmarkAdapterOutcome;
  readonly status: 'submitted' | 'prepared' | 'blocked';
  readonly observation: string;
} {
  if (input.status === 'blocked') {
    return {
      outcome: 'blocked',
      status: 'blocked',
      observation: 'External job submission was explicitly blocked before scheduler dispatch.',
    };
  }
  if (hasText(input.jobId) || input.status === 'submitted') {
    return {
      outcome: 'pass',
      status: 'submitted',
      observation: `External job submission recorded${hasText(input.jobId) ? ` with job id ${input.jobId}` : ''}.`,
    };
  }
  if (input.dryRun === true || input.status === 'prepared') {
    return {
      outcome: 'inconclusive',
      status: 'prepared',
      observation:
        'External job submission prepared but not dispatched; a scheduler receipt is still required.',
    };
  }
  return {
    outcome: 'blocked',
    status: 'blocked',
    observation:
      'External job submission lacks a scheduler receipt; record the job id, a prepared dry-run, or an explicit blocked status.',
  };
}

function result(input: {
  readonly caseId: string;
  readonly outcome: BenchmarkAdapterOutcome;
  readonly observation: string;
  readonly output: unknown;
  readonly evidenceRefs: readonly string[];
  readonly artifactRefs: readonly string[];
}): BenchmarkAdapterRunResult {
  return {
    adapterId: EXTERNAL_JOB_SUBMISSION_ADAPTER_ID,
    caseId: input.caseId,
    domain: 'external/job-submission',
    actionId: EXTERNAL_JOB_SUBMISSION_ACTION_ID,
    outcome: input.outcome,
    observation: input.observation,
    output: input.output,
    evidenceRefs: input.evidenceRefs,
    artifactRefs: input.artifactRefs,
    checkResults: [checkResult(checkStatus(input.outcome), input.evidenceRefs)],
  };
}

function parseExternalJobSubmissionPayload(
  value: unknown,
): ExternalJobSubmissionPayload | undefined {
  if (!isRecord(value)) return undefined;
  const backend = parseBackend(value['backend']);
  if (backend === undefined) return undefined;
  const status = optionalStatus(value['status']);
  if (status === undefined && value['status'] !== undefined) return undefined;
  const dryRun = optionalBoolean(value['dryRun']);
  if (dryRun === undefined && value['dryRun'] !== undefined) return undefined;
  const artifactRefs = optionalStringArray(value['artifactRefs']);
  if (artifactRefs === undefined && value['artifactRefs'] !== undefined) return undefined;
  const evidenceRefs = optionalStringArray(value['evidenceRefs']);
  if (evidenceRefs === undefined && value['evidenceRefs'] !== undefined) return undefined;
  return {
    backend,
    jobScript: optionalString(value['jobScript']),
    jobId: optionalString(value['jobId']),
    schedulerOutput: optionalString(value['schedulerOutput']),
    status,
    dryRun,
    artifactRefs,
    evidenceRefs,
  };
}

function parseBackend(value: unknown): ExternalJobBackendDescriptor | undefined {
  if (!isRecord(value)) return undefined;
  const kind = value['kind'];
  if (kind !== 'scheduler' && kind !== 'mcp' && kind !== 'hpc' && kind !== 'manual') {
    return undefined;
  }
  return {
    kind,
    name: optionalString(value['name']),
    queue: optionalString(value['queue']),
    command: optionalString(value['command']),
    endpoint: optionalString(value['endpoint']),
  };
}

function checkStatus(outcome: BenchmarkAdapterOutcome): ResearchEvalCheckResult['status'] {
  switch (outcome) {
    case 'pass':
      return 'passed';
    case 'fail':
      return 'failed';
    case 'blocked':
      return 'missing';
    case 'inconclusive':
      return 'missing';
  }
}

function checkResult(
  status: ResearchEvalCheckResult['status'],
  evidenceRefs: readonly string[],
): ResearchEvalCheckResult {
  return {
    checkId: EXTERNAL_JOB_SUBMISSION_CHECK_ID,
    kind: 'benchmark',
    status,
    evidenceRefs,
  };
}

function optionalStatus(value: unknown): ExternalJobSubmissionPayload['status'] | undefined {
  if (value === undefined) return undefined;
  return value === 'submitted' || value === 'prepared' || value === 'blocked'
    ? value
    : undefined;
}

function optionalBoolean(value: unknown): boolean | undefined {
  if (value === undefined) return undefined;
  return typeof value === 'boolean' ? value : undefined;
}

function optionalString(value: unknown): string | undefined {
  return typeof value === 'string' && value.length > 0 ? value : undefined;
}

function optionalStringArray(value: unknown): readonly string[] | undefined {
  if (value === undefined) return undefined;
  if (!Array.isArray(value)) return undefined;
  const out: string[] = [];
  for (const item of value) {
    if (typeof item !== 'string' || item.length === 0) return undefined;
    out.push(item);
  }
  return out;
}

function hasText(value: string | undefined): value is string {
  return value !== undefined && value.length > 0;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
