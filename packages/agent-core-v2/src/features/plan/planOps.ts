/**
 * `plan` domain — wire Model (`PlanModel`) and the `plan_mode.enter`
 * (`planModeEnter`) / `plan_mode.cancel` (`planModeCancel`) / `plan_mode.exit`
 * (`planModeExit`) Ops that mirror the plan-mode lifecycle into a persisted,
 * replayable `{ active, id }` state, plus the `plan.revision`
 * (`planRevision`) Op that records a submitted plan revision as a
 * reference-only fact.
 *
 * The Model holds the persistent, replayable fields — whether plan mode is
 * active, the plan id, and the last recorded revision version per plan id —
 * wrapped in `contextMemory`'s checkpoint protocol so plan mode stays aligned
 * with conversation undo. The lifecycle records keep exactly v1's field set
 * (`{ id }`); the plan file path is NOT persisted — it is derived from the id
 * at read time, matching v1's `restoreEnter`.
 * Plan content is recorded separately: every ExitPlanMode submit snapshots
 * the plan file into blob storage and persists a `plan.revision` record
 * carrying only the reference (`{ id, version, path, sha256, bytes }`, `path`
 * homeDir-relative) — never the content. `revisionCount` tracks the latest
 * version per plan id so `recordRevision` can mint the next version
 * replay-consistently; it is kept across enter/exit so a re-entered plan id
 * continues its counter instead of overwriting earlier blobs. Each `apply`
 * returns the same reference on a no-op (re-entering the same plan, or
 * cancelling/exiting while already inactive) so the wire's
 * reference-equality gate stays quiet. The side effects — `telemetryContext`
 * mode, plan-directory/file fs I/O, the blob write, and the
 * `agent.status.updated` planMode slice — are NOT part of `apply`: they run
 * after `wire.dispatch` on the live path, and `wire.replay` rebuilds the
 * Model silently from the persisted `plan_mode.*` / `plan.revision` records.
 * The legacy `toReplay: plan_updated` projection is dropped (inert — nothing
 * reads it). `plan.revision` carries a `toEvent` so the live transcript
 * projector can map it onto a marker plus the plan badge; replay never emits
 * it.
 */

import { z } from 'zod';

import {
  defineCheckpointedModel,
  type Checkpointed,
} from '#/agent/contextMemory/conversationTime';
import type { PlanResolution, PlanResolutionOutcome } from './plan';

export interface PlanState {
  readonly active: boolean;
  readonly id?: string;
  readonly revisionCount?: Readonly<Record<string, number>>;
  readonly resolution?: PlanResolution;
}

export type PlanModelState = Checkpointed<PlanState>;

export const PlanModel = defineCheckpointedModel('plan', (): PlanState => ({ active: false }));

export const planModeEnter = PlanModel.defineOp('plan_mode.enter', {
  schema: z.object({ id: z.string() }),
  apply: (s, p) =>
    s.current.active
      ? s
      : { ...s, current: { active: true, id: p.id, revisionCount: s.current.revisionCount } },
  toEvent: () => ({ type: 'agent.status.updated' as const, planMode: true }),
});

declare module '#/wire/types' {
  interface PersistedOpMap {
    'plan_mode.enter': typeof planModeEnter;
    'plan_mode.cancel': typeof planModeCancel;
    'plan_mode.exit': typeof planModeExit;
    'plan.revision': typeof planRevision;
    'plan.resolution': typeof planResolution;
  }
}

export const planModeCancel = PlanModel.defineOp('plan_mode.cancel', {
  schema: z.object({ id: z.string().optional() }),
  apply: (s, p) =>
    !s.current.active || (p.id !== undefined && p.id !== s.current.id)
      ? s
      : { ...s, current: { active: false, revisionCount: s.current.revisionCount, resolution: s.current.resolution } },
  toEvent: () => ({ type: 'agent.status.updated' as const, planMode: false }),
});

export const planModeExit = PlanModel.defineOp('plan_mode.exit', {
  schema: z.object({ id: z.string().optional() }),
  apply: (s, p) =>
    !s.current.active || (p.id !== undefined && p.id !== s.current.id)
      ? s
      : { ...s, current: { active: false, revisionCount: s.current.revisionCount, resolution: s.current.resolution } },
  toEvent: () => ({ type: 'agent.status.updated' as const, planMode: false }),
});

export interface PlanRevisionRecordedEvent {
  readonly id: string;
  readonly version: number;
  readonly path: string;
  readonly sha256: string;
  readonly bytes: number;
}

export interface PlanResolutionRecordedEvent extends PlanResolution {
  readonly type: 'plan.resolution';
}

declare module '#/app/event/eventBus' {
  interface DomainEventMap {
    'plan.revision': PlanRevisionRecordedEvent;
    'plan.resolution': PlanResolutionRecordedEvent;
  }
}

export const planRevision = PlanModel.defineOp('plan.revision', {
  schema: z.object({
    id: z.string(),
    version: z.number().int().positive(),
    path: z.string(),
    sha256: z.string(),
    bytes: z.number(),
  }),
  apply: (s, p) => {
    const currentVersion = s.current.revisionCount?.[p.id] ?? 0;
    if (p.version <= currentVersion) return s;
    return {
      ...s,
      current: {
        ...s.current,
        revisionCount: { ...s.current.revisionCount, [p.id]: p.version },
      },
    };
  },
  toEvent: (p) => ({
    type: 'plan.revision' as const,
    id: p.id,
    version: p.version,
    path: p.path,
    sha256: p.sha256,
    bytes: p.bytes,
  }),
});

export const planResolution = PlanModel.defineOp('plan.resolution', {
  schema: z.object({
    planId: z.string(),
    planRevision: z.number().int().nonnegative(),
    outcome: z.enum([
      'approved',
      'auto_approved',
      'revise',
      'rejected',
      'rejected_and_exited',
      'dismissed',
    ] satisfies readonly PlanResolutionOutcome[]),
    selectedLabel: z.string().min(1).max(80).optional(),
  }).strict(),
  apply: (s, p) => {
    if (!s.current.active || s.current.id !== p.planId) return s;
    const current = s.current.resolution;
    if (current !== undefined && p.planRevision <= current.planRevision) return s;
    const resolution: PlanResolution = {
      planId: p.planId,
      planRevision: p.planRevision,
      outcome: p.outcome,
      selectedLabel: p.selectedLabel,
    };
    return { ...s, current: { ...s.current, resolution } };
  },
  toEvent: (p) => ({
    type: 'plan.resolution' as const,
    planId: p.planId,
    planRevision: p.planRevision,
    outcome: p.outcome,
    selectedLabel: p.selectedLabel,
  }),
});
