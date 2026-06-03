import { describe, expect, it } from 'vitest';

import {
  EXTERNAL_JOB_SUBMISSION_ACTION_ID,
  EXTERNAL_JOB_SUBMISSION_ADAPTER,
  EXTERNAL_JOB_SUBMISSION_ADAPTER_ID,
} from '../../src/benchmark-adapter';

describe('external job submission benchmark adapter', () => {
  it('normalizes a native scheduler receipt without executing the scheduler', () => {
    const result = EXTERNAL_JOB_SUBMISSION_ADAPTER.run({
      caseId: 'case.external.submit',
      sourceRefs: ['tool:Bash', 'job:4242'],
      payload: {
        backend: {
          kind: 'scheduler',
          name: 'slurm',
          queue: 'debug',
          command: 'sbatch job.sh',
        },
        jobScript: 'job.sh',
        jobId: '4242',
        schedulerOutput: 'Submitted batch job 4242',
        artifactRefs: ['artifact:slurm-4242.out'],
        evidenceRefs: ['ledger:event.head-wing-submit'],
      },
    });

    expect(result).toMatchObject({
      adapterId: EXTERNAL_JOB_SUBMISSION_ADAPTER_ID,
      actionId: EXTERNAL_JOB_SUBMISSION_ACTION_ID,
      caseId: 'case.external.submit',
      outcome: 'pass',
    });
    expect(result.evidenceRefs).toEqual(
      expect.arrayContaining([
        'benchmark:case.external.submit',
        'adapter.external.job-submission',
        'tool:Bash',
        'job:4242',
        'external-job-backend:scheduler',
        'external-job-backend:slurm',
        'job-script:job.sh',
        'ledger:event.head-wing-submit',
      ]),
    );
    expect(result.artifactRefs).toEqual(['artifact:slurm-4242.out']);
    expect(result.checkResults[0]).toMatchObject({
      checkId: 'check.external-job.submission',
      status: 'passed',
    });
  });

  it('treats dry-run preparation as inconclusive until a job receipt exists', () => {
    const result = EXTERNAL_JOB_SUBMISSION_ADAPTER.run({
      payload: {
        backend: { kind: 'hpc', name: 'el' },
        jobScript: 'job.sh',
        dryRun: true,
        status: 'prepared',
      },
    });

    expect(result.outcome).toBe('inconclusive');
    expect(result.observation).toContain('prepared but not dispatched');
    expect(result.checkResults[0]?.status).toBe('missing');
  });

  it('blocks invalid payloads instead of inventing a submission result', () => {
    const result = EXTERNAL_JOB_SUBMISSION_ADAPTER.run({
      payload: {
        jobId: '4242',
      },
    });

    expect(result.outcome).toBe('blocked');
    expect(result.output).toEqual({
      validationError: 'invalid-external-job-submission-payload',
    });
    expect(result.checkResults[0]?.status).toBe('missing');
  });
});
