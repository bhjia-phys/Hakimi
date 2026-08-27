/**
 * `aitpResearch` domain — durable checkpoint verification implementation.
 *
 * Verifies that a saved AITP Entry is the expected active Entry and compares
 * the post-save check with the pre-save baseline, allowing unchanged legacy
 * errors while rejecting newly introduced errors. It performs no Research wire
 * mutations; the Research service decides whether the verified receipt may
 * advance the committed cursor. Bound at Agent scope.
 */

import { Service } from '#/_base/di/service';
import { AitpResearchError, AitpResearchErrors } from '../errors';
import { ISessionAitpAdapter } from '../adapter/sessionAitpAdapter';
import type {
  AitpCheckReport,
  ResearchCheckpointCheckReceipt,
} from '../types';

import {
  IDurableCommitService,
  type DurableCommitCheckInput,
  type DurableCommitCheckResult,
} from './durableCommit';

export class DurableCommitService extends Service implements IDurableCommitService {
  declare readonly _serviceBrand: undefined;

  constructor(
    @ISessionAitpAdapter private readonly adapter: ISessionAitpAdapter,
  ) {
    super();
  }

  async verifyEntry(entryId: string): Promise<void> {
    try {
      const shown = await this.adapter.show({ id: entryId });
      if (shown.id !== entryId || shown.status !== 'active') {
        throw new AitpResearchError(
          AitpResearchErrors.codes.AITP_CHECKPOINT_DEGRADED,
          `AITP entry ${entryId} was not returned as an active matching entry`,
        );
      }
    } catch (error) {
      throw this.asBarrierError(error);
    }
  }

  async checkAfterSave(input: DurableCommitCheckInput): Promise<DurableCommitCheckResult> {
    let report: AitpCheckReport;
    try {
      report = await this.adapter.check(
        input.workstreams?.length === 1
          ? { workstream: input.workstreams[0] }
          : undefined,
      );
    } catch (error) {
      throw this.asBarrierError(error);
    }

    const postSaveCheck = toCheckpointCheckReceipt(report, input.preSaveCheck);
    if ((postSaveCheck.newErrorFindingFingerprints?.length ?? 0) > 0) {
      throw new AitpResearchError(
        AitpResearchErrors.codes.AITP_CHECKPOINT_DEGRADED,
        `AITP check reports ${postSaveCheck.newErrorFindingFingerprints!.length} new error finding(s) after commit. Checkpoint remains pending.`,
      );
    }

    return { postSaveCheck };
  }

  private asBarrierError(error: unknown): AitpResearchError {
    if (error instanceof AitpResearchError) return error;
    return new AitpResearchError(
      AitpResearchErrors.codes.AITP_CHECKPOINT_DEGRADED,
      `AITP commit barrier failed: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
}

function toCheckpointCheckReceipt(
  report: AitpCheckReport,
  baseline: ResearchCheckpointCheckReceipt,
): ResearchCheckpointCheckReceipt {
  const findingFingerprints = report.findings.map((finding) =>
    `${finding.level}:${finding.code}:${finding.path}:${finding.message}`,
  ).toSorted();
  const errorFindingFingerprints = report.findings
    .filter((finding) => finding.level === 'error')
    .map((finding) => `${finding.code}:${finding.path}:${finding.message}`)
    .toSorted();
  const baselineErrors = new Set(baseline.errorFindingFingerprints);
  return {
    status: report.status,
    errors: report.counts.errors,
    warnings: report.counts.warnings,
    findingFingerprints,
    errorFindingFingerprints,
    newErrorFindingFingerprints: errorFindingFingerprints.filter(
      (fingerprint) => !baselineErrors.has(fingerprint),
    ),
    preExistingErrorFindingFingerprints: errorFindingFingerprints.filter(
      (fingerprint) => baselineErrors.has(fingerprint),
    ),
    checkedAt: Date.now(),
  };
}
