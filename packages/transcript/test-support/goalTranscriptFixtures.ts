import type { HistoryWireRecord } from '../src/history/foldFacts';
import type { GoalMeta } from '../src/model/meta';

export interface GoalTranscriptEventFixture {
  readonly snapshot: {
    readonly objective: string;
    readonly status: 'active' | 'paused' | 'blocked' | 'complete';
    readonly completionCriterion?: string;
    readonly tokensUsed: number;
    readonly budget: { readonly tokenBudget: number | null };
    readonly waitingFor?: { readonly taskIds: readonly string[]; readonly policy: 'any' | 'all' };
  } | null;
  readonly change?: Record<string, unknown>;
}

export interface GoalTranscriptScenario {
  readonly name: string;
  readonly records: readonly HistoryWireRecord[];
  readonly events: readonly GoalTranscriptEventFixture[];
  readonly expectedGoal: GoalMeta | undefined;
  readonly expectedColdGoal?: GoalMeta | undefined;
  readonly expectedGoalMarkers: number;
}

const active = {
  objective: 'ship it',
  status: 'active',
  completionCriterion: 'tests green',
  tokensUsed: 0,
  budget: { tokenBudget: null },
} as const;

const waitLease = { taskIds: ['task-1'], policy: 'any' } as const;
const activeWaiting = { ...active, waitingFor: waitLease } as const;

export const goalTranscriptScenarios: readonly GoalTranscriptScenario[] = [
  {
    name: 'create then blocked',
    records: [
      { type: 'goal.create', objective: 'ship it', completionCriterion: 'tests green', time: 1000 },
      { type: 'goal.update', status: 'blocked', tokensUsed: 12, time: 2000 },
    ],
    events: [
      { snapshot: active },
      { snapshot: { ...active, status: 'blocked', tokensUsed: 12 } },
    ],
    expectedGoal: {
      objective: 'ship it',
      status: 'blocked',
      completionCriterion: 'tests green',
      budgetUsed: 12,
    },
    expectedGoalMarkers: 2,
  },
  {
    name: 'active wait lease survives cold restore',
    records: [
      { type: 'goal.create', objective: 'ship it', completionCriterion: 'tests green', time: 1000 },
      { type: 'goal.update', waitingFor: waitLease, time: 2000 },
      { type: 'goal.update', tokensUsed: 3, time: 3000 },
    ],
    events: [
      { snapshot: active },
      { snapshot: activeWaiting },
      { snapshot: { ...activeWaiting, tokensUsed: 3 } },
    ],
    expectedGoal: {
      objective: 'ship it',
      status: 'active',
      completionCriterion: 'tests green',
      budgetUsed: 3,
      waitingFor: waitLease,
    },
    expectedGoalMarkers: 3,
  },
  {
    name: 'complete then clear',
    records: [
      { type: 'goal.create', objective: 'ship it', completionCriterion: 'tests green', time: 1000 },
      { type: 'goal.update', status: 'complete', tokensUsed: 12, time: 2000 },
      { type: 'goal.clear', time: 3000 },
    ],
    events: [
      { snapshot: active },
      { snapshot: { ...active, status: 'complete', tokensUsed: 12 } },
      { snapshot: null },
    ],
    expectedGoal: undefined,
    expectedGoalMarkers: 3,
  },
  {
    name: 'cancel clears active goal',
    records: [
      { type: 'goal.create', objective: 'ship it', completionCriterion: 'tests green', time: 1000 },
      { type: 'goal.clear', time: 2000 },
    ],
    events: [{ snapshot: active }, { snapshot: null }],
    expectedGoal: undefined,
    expectedGoalMarkers: 2,
  },
  {
    name: 'replace clears the old goal before creating the new goal',
    records: [
      { type: 'goal.create', objective: 'old goal', time: 1000 },
      { type: 'goal.clear', time: 2000 },
      { type: 'goal.create', objective: 'ship it', completionCriterion: 'tests green', time: 3000 },
    ],
    events: [
      {
        snapshot: {
          objective: 'old goal',
          status: 'active',
          tokensUsed: 0,
          budget: { tokenBudget: null },
        },
      },
      { snapshot: null },
      { snapshot: active },
    ],
    expectedGoal: {
      objective: 'ship it',
      status: 'active',
      completionCriterion: 'tests green',
      budgetUsed: 0,
    },
    expectedColdGoal: {
      objective: 'ship it',
      status: 'paused',
      completionCriterion: 'tests green',
      budgetUsed: 0,
    },
    expectedGoalMarkers: 3,
  },
  {
    name: 'restore normalizes active to paused',
    records: [
      { type: 'goal.create', objective: 'ship it', completionCriterion: 'tests green', time: 1000 },
      { type: 'goal.update', status: 'paused', time: 2000 },
    ],
    events: [{ snapshot: active }, { snapshot: { ...active, status: 'paused' } }],
    expectedGoal: {
      objective: 'ship it',
      status: 'paused',
      completionCriterion: 'tests green',
      budgetUsed: 0,
    },
    expectedGoalMarkers: 2,
  },
];

export const stableMutationScenario = {
  mutation: {
    id: 'mutation-1',
    at: 1000,
    kind: 'update' as const,
    goalId: 'g1',
    status: 'blocked' as const,
  },
  record: {
    type: 'goal.update',
    status: 'blocked',
    mutation: {
      id: 'mutation-1',
      at: 1000,
      kind: 'update',
      goalId: 'g1',
      status: 'blocked',
    },
    time: 1001,
  } satisfies HistoryWireRecord,
};

export const forkedGoalRecords: readonly HistoryWireRecord[] = [
  { type: 'goal.create', objective: 'ship it', time: 1000 },
  { type: 'forked', time: 2000 },
];
