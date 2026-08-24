/**
 * `aitpResearch` domain — `IAgentResearchService` contract.
 *
 * The Agent-scope (main-only) Research state machine. Manages research
 * questions, lines, focus, the three-axis state (workflow / epistemic /
 * persistence), human steering commands, pending/committed checkpoints, and
 * the `ResearchStatusSnapshot`. Research working state follows conversation
 * undo through the checkpointed `ResearchModel`; the committed cursor does
 * not — once a checkpoint is committed to AITP, conversation undo cannot
 * retract that external fact. Bound at Agent scope.
 */

import { createDecorator } from '#/_base/di/instantiation';

import type {
  HumanSteeringCommand,
  ResearchCheckpoint,
  ResearchCommittedCursor,
  ResearchLine,
  ResearchLineCreationInput,
  ResearchLineUpdateInput,
  ResearchQuestion,
  ResearchStatusSnapshot,
} from '../types';

export interface CreateQuestionInput {
  readonly id?: string;
  readonly lineSlug: string;
  readonly wording: string;
  readonly assessment?: string;
  readonly priority?: number;
  readonly neededEvidence?: readonly string[];
}

export type UpdateLineInput = ResearchLineUpdateInput;

export interface UpdateQuestionInput {
  readonly questionId: string;
  readonly expectedRevision?: number;
  readonly wording?: string;
  readonly assessment?: string;
  readonly priority?: number;
  readonly workflow?: import('../types').QuestionWorkflow;
  readonly epistemic?: import('../types').QuestionEpistemic;
  readonly neededEvidence?: readonly string[];
  readonly nextBoundedAction?: string;
  readonly evidenceRefs?: readonly string[];
  readonly falsifierRefs?: readonly string[];
  readonly reason?: string;
}

export interface ProposeCheckpointInput {
  readonly questionId?: string;
  readonly lineSlug?: string;
  readonly assessment?: string;
  readonly nextAction?: string;
}

export interface CommitCheckpointInput {
  readonly checkpointId: string;
  readonly entryId: string;
}

export interface IAgentResearchService {
  readonly _serviceBrand: undefined;

  getSnapshot(): ResearchStatusSnapshot;
  getQuestions(): readonly ResearchQuestion[];
  getLines(): readonly ResearchLine[];
  getPendingCheckpoint(): ResearchCheckpoint | null;
  getCommittedCursor(): ResearchCommittedCursor | null;

  createQuestion(input: CreateQuestionInput): ResearchQuestion;
  createLine(input: ResearchLineCreationInput): ResearchLine;
  updateLine(input: UpdateLineInput): ResearchLine;
  updateQuestion(input: UpdateQuestionInput): ResearchQuestion;
  setFocus(questionId: string, boundedAction?: string, expectedRevision?: number): void;
  switchLine(lineSlug: string, expectedRevision?: number): void;
  steer(command: HumanSteeringCommand): void;
  reopenQuestion(questionId: string, reason?: string, expectedRevision?: number): void;

  proposeCheckpoint(input: ProposeCheckpointInput): ResearchCheckpoint;
  commitCheckpoint(input: CommitCheckpointInput): Promise<void>;
}

export const IAgentResearchService =
  createDecorator<IAgentResearchService>('agentResearchService');
