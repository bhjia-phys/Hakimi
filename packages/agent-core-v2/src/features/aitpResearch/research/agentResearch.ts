/**
 * `aitpResearch` domain — `IAgentResearchService` contract.
 *
 * The Agent-scope (main-only) Research state machine. Manages research
 * questions, lines, focus, the three-axis state (workflow / epistemic /
 * persistence), human steering commands, pending/committed checkpoints, the
 * Research Loop scientific state layer (phase / action / progress / state
 * change / human gate), and the `ResearchStatusSnapshot`. Research working
 * state follows conversation undo through the checkpointed `ResearchModel`;
 * the committed cursor does not — once a checkpoint is committed to AITP,
 * conversation undo cannot retract that external fact. Bound at Agent scope.
 */

import { createDecorator } from '#/_base/di/instantiation';

import type { ResearchEvidencePacket, ResearchEvidenceReview } from './evidencePacket';
import type {
  ResearchRunStage,
  ResearchRunState,
  ResearchSchedulerState,
  HumanSteeringCommand,
  ResearchActionKind,
  ResearchActionSpec,
  ResearchCheckpoint,
  ResearchCheckpointReceipt,
  ResearchCommittedCursor,
  ResearchHumanGate,
  ResearchHumanGateKind,
  ResearchLine,
  ResearchLineCreationInput,
  ResearchLineUpdateInput,
  ResearchPhase,
  ResearchProgressLevel,
  ResearchProgressReport,
  ResearchQuestion,
  ResearchScientificSnapshot,
  ResearchStateChange,
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
  readonly expectedRevision?: number;
  readonly questionId?: string;
  readonly lineSlug?: string;
  readonly assessment?: string;
  readonly nextAction?: string;
}

export interface CommitCheckpointInput {
  readonly checkpointId: string;
  readonly entryId: string;
}

export interface PlanActionInput {
  readonly actionId?: string;
  readonly questionId?: string;
  readonly lineSlug?: string;
  readonly kind: ResearchActionKind;
  readonly purpose: string;
  readonly expectedEvidence?: readonly string[];
  readonly stopCondition: string;
  readonly allowedToolKinds?: readonly string[];
  readonly retryOfEntryId?: string;
  readonly requiresHumanApproval?: boolean;
}

export interface RecordProgressInput {
  readonly headline: string;
  readonly question?: string;
  readonly motivation: string;
  readonly workPerformed: string;
  readonly result: string;
  readonly mainlineImpact: string;
  readonly uncertainties?: readonly string[];
  readonly nextAction?: string;
  readonly phaseChange?: { readonly from: ResearchPhase; readonly to: ResearchPhase };
  readonly humanDecision?: string;
  readonly detail?: {
    readonly assumptions?: readonly string[];
    readonly derivation?: string;
    readonly tests?: readonly string[];
    readonly observations?: readonly string[];
    readonly sources?: readonly string[];
    readonly limitations?: readonly string[];
    readonly detailHint?: string;
    readonly artifactRefs?: readonly string[];
  };
}

export interface ConcludeResearchActionInput {
  readonly actionId: string;
  readonly status: 'completed' | 'abandoned';
  readonly progress: Omit<RecordProgressInput, 'phaseChange'>;
}

export interface ResearchActionConclusion {
  readonly action: ResearchActionSpec;
  readonly progress: ResearchProgressReport;
}

export interface RequestHumanDecisionInput {
  readonly gateId?: string;
  readonly kind: ResearchHumanGateKind;
  readonly actionId?: string;
  readonly questionId?: string;
  readonly prompt: string;
}

export interface ResolveHumanDecisionInput {
  readonly gateId: string;
  readonly resolution: string;
  readonly nextPhase: ResearchPhase;
}

export interface ObserveResearchRunInput {
  readonly actionId: string;
  readonly expectedRevision: number;
  readonly campaign: string;
  readonly jobId: string;
  readonly sourcePin?: string;
  readonly binaryPin?: string;
  readonly stage: ResearchRunStage;
  readonly schedulerState: ResearchSchedulerState;
  readonly nextCheckAt?: number;
  readonly terminalState?: ResearchRunState['terminalState'];
  readonly artifactRefs?: readonly string[];
}

export interface IAgentResearchService {
  readonly _serviceBrand: undefined;

  getSnapshot(): ResearchStatusSnapshot;
  getQuestions(): readonly ResearchQuestion[];
  getLines(): readonly ResearchLine[];
  getPendingCheckpoint(): ResearchCheckpoint | null;
  getCommittedCursor(): ResearchCommittedCursor | null;
  getScientificProgress(level: ResearchProgressLevel): ResearchScientificSnapshot;
  reviewEvidencePacket(packet: ResearchEvidencePacket, expectedRevision: number): ResearchEvidenceReview;
  observeRun(input: ObserveResearchRunInput): ResearchRunState;

  createQuestion(input: CreateQuestionInput): ResearchQuestion;
  createLine(input: ResearchLineCreationInput): ResearchLine;
  updateLine(input: UpdateLineInput): ResearchLine;
  updateQuestion(input: UpdateQuestionInput): ResearchQuestion;
  setFocus(questionId: string, boundedAction?: string, expectedRevision?: number): void;
  switchLine(lineSlug: string, expectedRevision?: number): void;
  steer(command: HumanSteeringCommand): void;
  reopenQuestion(questionId: string, reason?: string, expectedRevision?: number): void;
  acknowledgeAlert(fingerprint: string): void;

  proposeCheckpoint(input: ProposeCheckpointInput): ResearchCheckpoint;
  bindPendingCheckpointReceipt(receipt: ResearchCheckpointReceipt): ResearchCheckpoint;
  commitCheckpoint(input: CommitCheckpointInput): Promise<void>;

  planAction(input: PlanActionInput): ResearchActionSpec;
  planAndStartAction(input: PlanActionInput): ResearchActionSpec;
  startAction(actionId: string): void;
  completeAction(actionId: string, status: 'completed' | 'abandoned'): void;
  concludeAction(input: ConcludeResearchActionInput): ResearchActionConclusion;
  recordProgress(input: RecordProgressInput): ResearchProgressReport;
  setPhase(phase: ResearchPhase, reason?: string): ResearchStateChange;
  requestHumanDecision(input: RequestHumanDecisionInput): ResearchHumanGate;
  resolveHumanDecision(input: ResolveHumanDecisionInput): ResearchHumanGate;
}

export const IAgentResearchService =
  createDecorator<IAgentResearchService>('agentResearchService');
