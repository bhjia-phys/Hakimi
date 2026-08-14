import type { GoalStatus } from '../model/meta';
import type { TranscriptMarker } from '../model/item';

/**
 * Upper bound for a mutation's `at`: the largest epoch-ms value that still
 * survives `new Date(at).toISOString()` (ECMAScript's exact Date ceiling).
 * Same value as `GOAL_MUTATION_MAX_AT` in `@moonshot-ai/protocol`; kept local
 * because this package is browser-safe and cannot import the protocol or
 * engine packages.
 */
export const GOAL_MUTATION_MAX_AT = 8_640_000_000_000_000;

export interface GoalMutationLike {
  readonly id: string;
  readonly at: number;
  readonly kind: 'create' | 'update' | 'clear';
  readonly goalId: string;
  readonly status?: GoalStatus;
}

export function goalMarkerFromMutation(mutation: GoalMutationLike): TranscriptMarker {
  const payload: {
    version: 1;
    mutationId: string;
    kind: GoalMutationLike['kind'];
    goalId: string;
    status?: GoalStatus;
  } = {
    version: 1,
    mutationId: mutation.id,
    kind: mutation.kind,
    goalId: mutation.goalId,
  };
  // A clear (or any status-less mutation) must NOT own a `status: undefined`
  // key: JSON roundtrips drop undefined-valued keys, and a replayed marker
  // whose payload lost the key would no longer compare structurally equal to
  // the original, breaking idempotent re-application.
  if (mutation.status !== undefined) payload.status = mutation.status;
  return {
    kind: 'marker',
    markerId: `goal:${mutation.id}`,
    marker: 'goal',
    payload,
    at: new Date(mutation.at).toISOString(),
  };
}

export function readGoalMutation(value: unknown): GoalMutationLike | undefined {
  if (value === null || typeof value !== 'object') return undefined;
  const mutation = value as Record<string, unknown>;
  const at = mutation['at'];
  if (
    typeof mutation['id'] !== 'string' ||
    typeof at !== 'number' ||
    !Number.isFinite(at) ||
    // Negative epochs predate the protocol's clock and must fall back to the
    // legacy `mN` marker like any other unreadable mutation (0 stays valid).
    at < 0 ||
    // `at` must survive `new Date(at).toISOString()` — an epoch past the Date
    // ceiling would make the marker projection throw, so reject it here and
    // let the fold fall back to the legacy `mN` marker instead. (For a finite
    // non-negative epoch this comparison is exactly the Date-range check.)
    at > GOAL_MUTATION_MAX_AT ||
    (mutation['kind'] !== 'create' && mutation['kind'] !== 'update' && mutation['kind'] !== 'clear') ||
    typeof mutation['goalId'] !== 'string'
  ) {
    return undefined;
  }
  const status = mutation['status'];
  if (
    status !== undefined &&
    status !== 'active' &&
    status !== 'paused' &&
    status !== 'blocked' &&
    status !== 'complete'
  ) {
    return undefined;
  }
  return {
    id: mutation['id'],
    at,
    kind: mutation['kind'],
    goalId: mutation['goalId'],
    status,
  };
}
