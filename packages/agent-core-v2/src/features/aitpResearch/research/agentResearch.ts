/**
 * `aitpResearch` domain — `IAgentResearchService` contract.
 *
 * The Agent-scope (main-only) Research state machine. Manages research
 * questions, lines, focus, the three-axis state (workflow / epistemic /
 * persistence), human steering commands, pending/committed checkpoints, the
 * Research Loop scientific state layer (phase / action / progress / state
 * change / human gate), the topic-bound Program, the auditable Period window
 * (started/ended at mode enter/exit, line switch, and admitted loop
 * boundaries), and the `ResearchStatusSnapshot`. Research working
 * state follows conversation undo through the checkpointed `ResearchModel`;
 * the committed cursor does not — once a checkpoint is committed to AITP,
 * conversation undo cannot retract that external fact. Note I/O requires live
 * verified-commit ownership or a fresh bounded Action with verified canonical
 * basis Entries; restored cursors alone confer no draft permission.
 * Bound at Agent scope.
 */

import { createDecorator } from '#/_base/di/instantiation';
import type { AwaitingHumanExitPhase } from '#/features/research/types';
import type {
  AitpAdapterNotePrepareOptions,
  AitpAdapterNoteSaveOptions,
} from '../adapter/sessionAitpAdapter';

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
  ResearchProgram,
  ResearchGoalAlignment,
  ResearchGoalAlignmentRelation,
  ResearchPeriod,
  ResearchQuestion,
  ResearchScientificSnapshot,
  ResearchStateChange,
  ResearchStatusSnapshot,
  ResearchPlan,
  ResearchPlanV2,
  ResearchPlanV2Milestone,
  ResearchPlanV2DecisionPoint,
  ResearchPlanningPolicy,
  ResearchLineWorkstreamAlignment,
  ResearchLineWorkstreamBinding,
  AitpEntryKind,
  AitpAuthority,
  ResearchCommitProvenance,
  ResearchDurableCommitCandidate,
  AitpNotePrepareResult,
  AitpNoteSaveResult,
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
  readonly expectedRevision: number;
  readonly questionId?: string;
  readonly lineSlug?: string;
  readonly assessment?: string;
  readonly nextAction?: string;
}

export interface CommitCheckpointInput {
  readonly checkpointId: string;
  readonly entryId: string;
}

export interface DiscardHistoricalCheckpointInput {
  readonly checkpointId: string;
  readonly expectedRevision: number;
}

export interface CommitCheckpointResult {
  readonly status: 'committed' | 'already_committed';
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
  readonly planningLevel?: 'simple' | 'planned';
  readonly researchPlanId?: string;
  readonly researchPlanRevision?: number;
  readonly milestoneId?: string;
  readonly actionPlanId?: string;
  readonly actionPlanRevision?: number;
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
  readonly progress: Omit<RecordProgressInput, 'phaseChange' | 'humanDecision'>;
  readonly durability:
    | {
        readonly status: 'no_durable_delta';
        readonly rationale: string;
      }
    | {
        readonly status: 'durable_delta';
        readonly entryKind: AitpEntryKind;
        readonly authority: AitpAuthority;
        readonly provenance: ResearchCommitProvenance;
        readonly rationale: string;
      };
}

export interface ResearchActionConclusion {
  readonly action: ResearchActionSpec;
  readonly progress: ResearchProgressReport;
  readonly commitCandidate?: ResearchDurableCommitCandidate;
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
  readonly nextPhase: AwaitingHumanExitPhase;
}

export interface PrepareResearchPlanInput {
  readonly planId?: string;
  readonly lineSlug?: string;
  readonly questionId?: string;
  readonly objective: string;
  readonly steps: readonly string[];
  readonly expectedEvidence: readonly string[];
  readonly stopCondition: string;
  readonly usePlanMode?: boolean;
}

export interface PrepareResearchPlanV2Input {
  readonly planId?: string;
  readonly expectedRevision?: number;
  readonly objective: string;
  readonly completionCriterion?: string;
  readonly milestones: readonly ResearchPlanV2Milestone[];
  readonly evidenceRequirements: readonly string[];
  readonly decisionPoints: readonly ResearchPlanV2DecisionPoint[];
  readonly assumptions: readonly string[];
  readonly currentMilestoneId: string;
  readonly stopConditions: readonly string[];
  readonly replanConditions: readonly string[];
}

export interface TransitionResearchPlanV2Input {
  readonly planId: string;
  readonly expectedRevision: number;
}

export interface ConfirmGoalAlignmentInput {
  readonly relation: ResearchGoalAlignmentRelation;
  readonly expectedRevision: number;
  readonly goalId: string;
  readonly topicId: string;
  readonly observedRevision: number;
}

export interface ClearGoalAlignmentInput {
  readonly expectedRevision: number;
  readonly goalId: string;
  readonly topicId: string;
  readonly observedRevision: number;
}

export interface ConfirmLineWorkstreamBindingInput {
  readonly lineSlug: string;
  readonly workstream: string;
  readonly expectedRevision: number;
  readonly confirmedBy: 'user' | 'main_agent';
}

export interface ClearLineWorkstreamBindingInput {
  readonly lineSlug: string;
  readonly expectedRevision: number;
  readonly expectedConfirmationId: string;
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
  getProgram(): ResearchProgram | null;
  getGoalAlignment(): ResearchGoalAlignment;
  confirmGoalAlignment(input: ConfirmGoalAlignmentInput): void;
  clearGoalAlignment(input: ClearGoalAlignmentInput): void;
  getLineWorkstreamAlignment(lineSlug: string): ResearchLineWorkstreamAlignment;
  getCurrentWorkstreamAlignment(): ResearchLineWorkstreamAlignment | undefined;
  confirmLineWorkstreamBinding(
    input: ConfirmLineWorkstreamBindingInput,
  ): Promise<ResearchLineWorkstreamBinding>;
  clearLineWorkstreamBinding(input: ClearLineWorkstreamBindingInput): void;
  getPeriod(): ResearchPeriod | null;
  getScientificProgress(level: ResearchProgressLevel): ResearchScientificSnapshot;
  getResearchPlan(): ResearchPlan | null;
  getResearchPlanV2(): ResearchPlanV2 | null;
  getPlanningPolicy(): ResearchPlanningPolicy;
  setPlanningPolicy(policy: ResearchPlanningPolicy, expectedRevision: number): void;
  prepareResearchPlan(input: PrepareResearchPlanInput): Promise<ResearchPlan>;
  finalizeResearchPlan(): Promise<ResearchPlan>;
  discardResearchPlan(): ResearchPlan | null;
  prepareResearchPlanV2(input: PrepareResearchPlanV2Input): ResearchPlanV2;
  activateResearchPlanV2(input: TransitionResearchPlanV2Input): ResearchPlanV2;
  completeResearchPlanV2(input: TransitionResearchPlanV2Input): ResearchPlanV2;
  discardResearchPlanV2(input: TransitionResearchPlanV2Input): ResearchPlanV2;
  noteLoopBoundary(): void;
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
  bindPendingCheckpointReceipt(
    receipt: ResearchCheckpointReceipt,
    expectedCheckpointId?: string,
  ): ResearchCheckpoint;
  discardHistoricalCheckpoint(input: DiscardHistoricalCheckpointInput): ResearchCheckpoint;
  commitCheckpoint(input: CommitCheckpointInput): Promise<CommitCheckpointResult>;
  prepareReviewNote(input: AitpAdapterNotePrepareOptions): Promise<AitpNotePrepareResult>;
  saveReviewNote(input: AitpAdapterNoteSaveOptions): Promise<AitpNoteSaveResult>;

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
