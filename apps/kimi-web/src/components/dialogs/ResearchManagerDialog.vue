<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import type {
  ResearchCommand,
  ResearchEvidencePacket,
  ResearchLineStatus,
  ResearchPhase,
  ResearchQuestionEpistemic,
  ResearchQuestionWorkflow,
  ResearchRunStage,
  ResearchSchedulerState,
  ResearchStatusSnapshot,
} from '../../api/types';
import {
  RESEARCH_DECISION_NEXT_PHASES,
  researchCheckpointDraftTargetKey,
  researchEvidenceDraftTargetKey,
  researchManagerAckMatchesDraft,
  researchManagerCheckpointDraftIsStale,
  researchManagerDraftTarget,
  researchManagerLineDraftIsStale,
  researchManagerQuestionDraftIsStale,
  researchManagerScienceDraftIsStale,
  researchRunTerminalStateIsConsistent,
  type ResearchManagerCommandAck,
  type ResearchManagerCommandRequest,
  type ResearchManagerDraftTarget,
} from '../../lib/researchManagerCommand';
import Badge from '../ui/Badge.vue';
import Banner from '../ui/Banner.vue';
import Button from '../ui/Button.vue';
import Dialog from '../ui/Dialog.vue';
import Field from '../ui/Field.vue';
import Input from '../ui/Input.vue';
import Menu from '../ui/Menu.vue';
import MenuItem from '../ui/MenuItem.vue';
import SegmentedControl from '../ui/SegmentedControl.vue';
import Select from '../ui/Select.vue';
import Textarea from '../ui/Textarea.vue';

const props = defineProps<{
  snapshot: ResearchStatusSnapshot | null;
  commandAck?: ResearchManagerCommandAck | null;
}>();
const open = defineModel<boolean>('open', { required: true });
const emit = defineEmits<{ command: [request: ResearchManagerCommandRequest] }>();
const { t } = useI18n();

type Section = 'line' | 'question' | 'science' | 'checkpoint';
type EditorMode = 'create' | 'edit';
type ResearchTerminalState = '' | 'completed' | 'failed' | 'cancelled';

const section = ref<Section>('line');
const lineEditorMode = ref<EditorMode>('edit');
const questionEditorMode = ref<EditorMode>('edit');
const selectedLineSlug = ref('');
const selectedQuestionId = ref('');

const lineSlug = ref('');
const lineTitle = ref('');
const lineObjective = ref('');
const lineAssessment = ref('');
const lineStatus = ref<ResearchLineStatus>('active');

const questionWording = ref('');
const questionAssessment = ref('');
const questionPriority = ref('0');
const questionNeededEvidence = ref('');
const questionNextAction = ref('');
const questionWorkflow = ref<ResearchQuestionWorkflow>('open');
const questionEpistemic = ref<ResearchQuestionEpistemic>('unknown');
const questionReason = ref('');

const checkpointAssessment = ref('');
const checkpointNextAction = ref('');
const checkpointEntryId = ref('');

const decisionResolution = ref('');
const decisionNextPhase = ref<ResearchPhase>('idle');
const evidencePacketId = ref('');
const evidenceKind = ref<ResearchEvidencePacket['kind']>('observation');
const evidenceClaim = ref('');
const evidenceBody = ref('');
const evidenceConfidence = ref<ResearchEvidencePacket['confidence']>('medium');
const runActionId = ref('');
const runCampaign = ref('');
const runJobId = ref('');
const runSourcePin = ref('');
const runBinaryPin = ref('');
const runStage = ref<ResearchRunStage>('unknown');
const runSchedulerState = ref<ResearchSchedulerState>('unknown');
const runTerminalState = ref<ResearchTerminalState>('');
const runArtifactRefs = ref('');

const lineDirty = ref(false);
const questionDirty = ref(false);
const checkpointDirty = ref(false);
const decisionDirty = ref(false);
const evidenceDirty = ref(false);
const runDirty = ref(false);
const lineBaseRevision = ref<number | null>(null);
const questionBaseRevision = ref<number | null>(null);
const questionBaseSnapshotRevision = ref<number | null>(null);
const checkpointBaseRevision = ref<number | null>(null);
const decisionBaseRevision = ref<number | null>(null);
const evidenceBaseRevision = ref<number | null>(null);
const runBaseRevision = ref<number | null>(null);
const checkpointBaseTarget = ref<{
  questionId?: string;
  lineSlug?: string;
} | null>(null);
const checkpointBasePendingCheckpointId = ref<string | null>(null);
const decisionBaseGateId = ref<string | null>(null);
const evidenceBaseTarget = ref<{
  questionId?: string;
  lineSlug?: string;
  actionId?: string;
} | null>(null);
const runBaseActionId = ref<string | null>(null);
const decisionPendingCommandId = ref<number | null>(null);
const evidencePendingCommandId = ref<number | null>(null);
const runPendingCommandId = ref<number | null>(null);
let resettingLine = false;
let resettingQuestion = false;
let resettingCheckpoint = false;
let resettingDecision = false;
let resettingEvidence = false;
let resettingRun = false;
let lineDraftVersion = 0;
let questionDraftVersion = 0;
let checkpointDraftVersion = 0;
let decisionDraftVersion = 0;
let evidenceDraftVersion = 0;
let runDraftVersion = 0;
let nextCommandId = 0;

const sectionOptions = computed(() => [
  { value: 'line', label: t('research.manager.sections.line') },
  { value: 'question', label: t('research.manager.sections.question') },
  { value: 'science', label: t('research.manager.sections.science') },
  { value: 'checkpoint', label: t('research.manager.sections.checkpoint') },
]);
const selectedLine = computed(() =>
  props.snapshot?.lines.find((line) => line.slug === selectedLineSlug.value),
);
const lineQuestions = computed(() =>
  props.snapshot?.questions.filter((question) => question.lineSlug === selectedLineSlug.value) ?? [],
);
const selectedQuestion = computed(() =>
  lineQuestions.value.find((question) => question.id === selectedQuestionId.value),
);
const currentCheckpointTarget = computed<{
  questionId?: string;
  lineSlug?: string;
} | null>(() => {
  if (props.snapshot === null || selectedLineSlug.value === '') return null;
  return selectedQuestion.value === undefined
    ? { lineSlug: selectedLineSlug.value }
    : { questionId: selectedQuestion.value.id };
});
const currentCheckpointTargetKey = computed(() =>
  currentCheckpointTarget.value === null
    ? null
    : researchCheckpointDraftTargetKey(currentCheckpointTarget.value),
);
const checkpointBaseTargetKey = computed(() =>
  checkpointBaseTarget.value === null
    ? null
    : researchCheckpointDraftTargetKey(checkpointBaseTarget.value),
);
const currentPendingCheckpointId = computed(() =>
  props.snapshot?.pendingCheckpoint?.checkpointId ?? null,
);
const lineStale = computed(() => researchManagerLineDraftIsStale(
  lineDirty.value,
  lineEditorMode.value === 'edit',
  lineBaseRevision.value,
  selectedLine.value?.revision ?? null,
));
const questionStale = computed(() => researchManagerQuestionDraftIsStale(
  questionDirty.value,
  questionEditorMode.value === 'edit',
  questionBaseSnapshotRevision.value,
  props.snapshot?.revision ?? null,
  questionBaseRevision.value,
  selectedQuestion.value?.revision ?? null,
));
const checkpointStale = computed(() => researchManagerCheckpointDraftIsStale(
  checkpointDirty.value,
  checkpointBaseRevision.value,
  props.snapshot?.revision ?? null,
  checkpointBaseTargetKey.value,
  currentCheckpointTargetKey.value,
  checkpointBasePendingCheckpointId.value,
  currentPendingCheckpointId.value,
));
const currentDecisionGateId = computed(() => {
  const gate = props.snapshot?.humanGate;
  return gate !== undefined && gate.resolvedAt === undefined ? gate.gateId : null;
});
const currentEvidenceTarget = computed(() => ({
  questionId: selectedQuestion.value?.id,
  lineSlug: selectedLineSlug.value || undefined,
  actionId: props.snapshot?.currentAction?.actionId,
}));
const currentEvidenceTargetKey = computed(() =>
  props.snapshot === null ? null : researchEvidenceDraftTargetKey(currentEvidenceTarget.value),
);
const evidenceBaseTargetKey = computed(() =>
  evidenceBaseTarget.value === null
    ? null
    : researchEvidenceDraftTargetKey(evidenceBaseTarget.value),
);
const currentRunActionId = computed(() =>
  props.snapshot?.currentAction?.actionId
    ?? props.snapshot?.currentRun?.actionId
    ?? props.snapshot?.currentAction?.run?.actionId
    ?? null,
);
const decisionStale = computed(() => researchManagerScienceDraftIsStale(
  decisionDirty.value,
  decisionBaseRevision.value,
  props.snapshot?.revision ?? null,
  decisionBaseGateId.value,
  currentDecisionGateId.value,
));
const evidenceStale = computed(() => researchManagerScienceDraftIsStale(
  evidenceDirty.value,
  evidenceBaseRevision.value,
  props.snapshot?.revision ?? null,
  evidenceBaseTargetKey.value,
  currentEvidenceTargetKey.value,
));
const runStale = computed(() => researchManagerScienceDraftIsStale(
  runDirty.value,
  runBaseRevision.value,
  props.snapshot?.revision ?? null,
  runBaseActionId.value,
  currentRunActionId.value,
));
const modeActive = computed(() => props.snapshot !== null && props.snapshot.mode !== 'inactive');
const canSaveLine = computed(() => lineTitle.value.trim() !== ''
  && (lineEditorMode.value === 'edit' || lineSlug.value.trim() !== '')
  && !lineStale.value);
const canSaveQuestion = computed(() => selectedLineSlug.value !== ''
  && questionWording.value.trim() !== ''
  && !questionStale.value);
const canSteerQuestion = computed(() =>
  selectedQuestion.value !== undefined
  && questionBaseSnapshotRevision.value !== null
  && !questionStale.value,
);
const canProposeCheckpoint = computed(() =>
  checkpointBaseRevision.value !== null
  && checkpointBaseTarget.value !== null
  && !checkpointStale.value,
);
const canCommitCheckpoint = computed(() =>
  checkpointBasePendingCheckpointId.value !== null
  && checkpointEntryId.value.trim() !== ''
  && !checkpointStale.value,
);
const activeAlerts = computed(() =>
  props.snapshot?.alerts.filter((alert) => alert.state === undefined || alert.state === 'active') ?? [],
);
const canResolveDecision = computed(() =>
  decisionBaseGateId.value !== null
  && decisionResolution.value.trim() !== ''
  && !decisionStale.value
  && decisionPendingCommandId.value === null,
);
const canReviewEvidence = computed(() =>
  evidenceBaseRevision.value !== null
  && evidencePacketId.value.trim() !== ''
  && evidenceClaim.value.trim() !== ''
  && evidenceBody.value.trim() !== ''
  && !evidenceStale.value
  && evidencePendingCommandId.value === null,
);
const canObserveRun = computed(() =>
  runBaseRevision.value !== null
  && runBaseActionId.value !== null
  && runCampaign.value.trim() !== ''
  && runJobId.value.trim() !== ''
  && researchRunTerminalStateIsConsistent(
    runSchedulerState.value,
    runTerminalState.value,
  )
  && !runStale.value
  && runPendingCommandId.value === null,
);

function resetLineForm(): void {
  resettingLine = true;
  const line = selectedLine.value;
  try {
    if (lineEditorMode.value === 'create' || line === undefined) {
      lineSlug.value = '';
      lineTitle.value = '';
      lineObjective.value = '';
      lineAssessment.value = '';
      lineStatus.value = 'active';
      lineBaseRevision.value = null;
      return;
    }
    lineSlug.value = line.slug;
    lineTitle.value = line.title;
    lineObjective.value = line.objective ?? '';
    lineAssessment.value = line.assessment ?? '';
    lineStatus.value = line.status;
    lineBaseRevision.value = line.revision;
  } finally {
    lineDraftVersion++;
    lineDirty.value = false;
    resettingLine = false;
  }
}

function resetQuestionForm(): void {
  resettingQuestion = true;
  const question = selectedQuestion.value;
  try {
    questionBaseSnapshotRevision.value = props.snapshot?.revision ?? null;
    if (questionEditorMode.value === 'create' || question === undefined) {
      questionWording.value = '';
      questionAssessment.value = '';
      questionPriority.value = '0';
      questionNeededEvidence.value = '';
      questionNextAction.value = '';
      questionWorkflow.value = 'open';
      questionEpistemic.value = 'unknown';
      questionReason.value = '';
      questionBaseRevision.value = null;
      return;
    }
    questionWording.value = question.wording;
    questionAssessment.value = question.assessment ?? '';
    questionPriority.value = String(question.priority);
    questionNeededEvidence.value = question.neededEvidence.join('\n');
    questionNextAction.value = question.nextBoundedAction ?? '';
    questionWorkflow.value = question.workflow;
    questionEpistemic.value = question.epistemic;
    questionReason.value = '';
    questionBaseRevision.value = question.revision;
  } finally {
    questionDraftVersion++;
    questionDirty.value = false;
    resettingQuestion = false;
  }
}

function resetCheckpointForm(): void {
  resettingCheckpoint = true;
  try {
    checkpointBaseRevision.value = props.snapshot?.revision ?? null;
    checkpointBaseTarget.value = currentCheckpointTarget.value === null
      ? null
      : { ...currentCheckpointTarget.value };
    checkpointBasePendingCheckpointId.value = currentPendingCheckpointId.value;
    checkpointAssessment.value = '';
    checkpointNextAction.value = '';
    checkpointEntryId.value = '';
  } finally {
    checkpointDraftVersion++;
    checkpointDirty.value = false;
    resettingCheckpoint = false;
  }
}

function resetDecisionForm(): void {
  resettingDecision = true;
  try {
    decisionBaseRevision.value = props.snapshot?.revision ?? null;
    decisionBaseGateId.value = currentDecisionGateId.value;
    decisionResolution.value = '';
    decisionNextPhase.value = 'idle';
  } finally {
    decisionDraftVersion++;
    decisionDirty.value = false;
    resettingDecision = false;
  }
}

function resetEvidenceForm(): void {
  resettingEvidence = true;
  try {
    evidenceBaseRevision.value = props.snapshot?.revision ?? null;
    evidenceBaseTarget.value = props.snapshot === null
      ? null
      : { ...currentEvidenceTarget.value };
    evidencePacketId.value = '';
    evidenceKind.value = 'observation';
    evidenceClaim.value = '';
    evidenceBody.value = '';
    evidenceConfidence.value = 'medium';
  } finally {
    evidenceDraftVersion++;
    evidenceDirty.value = false;
    resettingEvidence = false;
  }
}

function resetRunForm(): void {
  resettingRun = true;
  const run = props.snapshot?.currentRun ?? props.snapshot?.currentAction?.run;
  try {
    runBaseRevision.value = props.snapshot?.revision ?? null;
    runBaseActionId.value = currentRunActionId.value;
    runActionId.value = currentRunActionId.value ?? '';
    runCampaign.value = run?.campaign ?? '';
    runJobId.value = run?.jobId ?? '';
    runSourcePin.value = run?.sourcePin ?? '';
    runBinaryPin.value = run?.binaryPin ?? '';
    runStage.value = run?.stage ?? 'unknown';
    runSchedulerState.value = run?.schedulerState ?? 'unknown';
    runTerminalState.value = run?.terminalState ?? '';
    runArtifactRefs.value = run?.artifactRefs.join('\n') ?? '';
  } finally {
    runDraftVersion++;
    runDirty.value = false;
    resettingRun = false;
  }
}

function preferredQuestionId(): string {
  const focusedId = props.snapshot?.currentFocus?.questionId;
  const focused = lineQuestions.value.find((question) => question.id === focusedId);
  return focused?.id ?? lineQuestions.value[0]?.id ?? '';
}

function initializeManager(): void {
  const snapshot = props.snapshot;
  if (snapshot === null) {
    selectedLineSlug.value = '';
    selectedQuestionId.value = '';
  } else {
    selectedLineSlug.value = snapshot.currentLineSlug ?? snapshot.lines[0]?.slug ?? '';
    selectedQuestionId.value = preferredQuestionId();
  }
  resetLineForm();
  resetQuestionForm();
  resetCheckpointForm();
  resetDecisionForm();
  resetEvidenceForm();
  resetRunForm();
}

watch(open, (isOpen) => {
  if (isOpen) initializeManager();
}, { immediate: true });

watch(
  () => props.snapshot,
  (snapshot) => {
    if (!open.value || snapshot === null) return;
    // Live snapshots refresh clean forms but preserve dirty drafts. If an entity
    // disappears entirely, move to the current available selection.
    if (!snapshot.lines.some((line) => line.slug === selectedLineSlug.value)) {
      selectedLineSlug.value = snapshot.currentLineSlug ?? snapshot.lines[0]?.slug ?? '';
    } else if (lineEditorMode.value === 'edit' && !lineDirty.value) {
      resetLineForm();
    }
    if (!lineQuestions.value.some((question) => question.id === selectedQuestionId.value)) {
      selectedQuestionId.value = preferredQuestionId();
    } else if (questionEditorMode.value === 'edit' && !questionDirty.value) {
      resetQuestionForm();
    }
    if (!checkpointDirty.value) resetCheckpointForm();
    if (!decisionDirty.value) resetDecisionForm();
    if (!evidenceDirty.value) resetEvidenceForm();
    if (!runDirty.value) resetRunForm();
  },
);

watch(selectedLineSlug, () => {
  selectedQuestionId.value = preferredQuestionId();
  resetLineForm();
  resetQuestionForm();
  if (!checkpointDirty.value) resetCheckpointForm();
  if (!evidenceDirty.value) resetEvidenceForm();
});
watch(selectedQuestionId, () => {
  resetQuestionForm();
  if (!checkpointDirty.value) resetCheckpointForm();
  if (!evidenceDirty.value) resetEvidenceForm();
});
watch(lineEditorMode, resetLineForm);
watch(questionEditorMode, resetQuestionForm);

function draftVersion(target: ResearchManagerDraftTarget): number {
  if (target.form === 'line') return lineDraftVersion;
  if (target.form === 'question') return questionDraftVersion;
  if (target.form === 'decision') return decisionDraftVersion;
  if (target.form === 'evidence') return evidenceDraftVersion;
  if (target.form === 'run') return runDraftVersion;
  return checkpointDraftVersion;
}

function draftBaseRevision(target: ResearchManagerDraftTarget): number | undefined {
  if (target.form === 'line' && target.mode === 'edit') {
    return lineBaseRevision.value ?? undefined;
  }
  if (target.form === 'question' && target.mode === 'edit') {
    return questionBaseRevision.value ?? undefined;
  }
  if (target.form === 'checkpoint') return checkpointBaseRevision.value ?? undefined;
  if (target.form === 'decision') return decisionBaseRevision.value ?? undefined;
  if (target.form === 'evidence') return evidenceBaseRevision.value ?? undefined;
  if (target.form === 'run') return runBaseRevision.value ?? undefined;
  return undefined;
}

function draftContext() {
  return {
    lineEditorMode: lineEditorMode.value,
    lineSlug: lineSlug.value,
    selectedLineSlug: selectedLineSlug.value,
    questionEditorMode: questionEditorMode.value,
    selectedQuestionId: selectedQuestionId.value,
    decisionGateId: decisionBaseGateId.value ?? '',
    evidenceTargetKey: evidenceBaseTargetKey.value ?? '',
    runActionId: runBaseActionId.value ?? '',
    checkpointEntryId: checkpointEntryId.value,
  };
}

function emitManagerCommand(command: ResearchCommand): void {
  const target = researchManagerDraftTarget(command);
  const request: ResearchManagerCommandRequest = {
    id: ++nextCommandId,
    command,
    draft: target === null
      ? undefined
      : {
          target,
          version: draftVersion(target),
          baseRevision: draftBaseRevision(target),
        },
  };
  if (target?.form === 'decision') decisionPendingCommandId.value = request.id;
  else if (target?.form === 'evidence') evidencePendingCommandId.value = request.id;
  else if (target?.form === 'run') runPendingCommandId.value = request.id;
  emit('command', request);
}

watch(
  () => props.commandAck,
  (ack) => {
    if (ack === null || ack === undefined) return;
    if (decisionPendingCommandId.value === ack.id) decisionPendingCommandId.value = null;
    if (evidencePendingCommandId.value === ack.id) evidencePendingCommandId.value = null;
    if (runPendingCommandId.value === ack.id) runPendingCommandId.value = null;

    const draft = ack.draft;
    if (!open.value || !ack.succeeded || draft === undefined) return;
    if (!researchManagerAckMatchesDraft(draft, draftVersion(draft.target), draftContext())) return;
    if (draft.target.form === 'line') resetLineForm();
    else if (draft.target.form === 'question') resetQuestionForm();
    else if (draft.target.form === 'decision') resetDecisionForm();
    else if (draft.target.form === 'evidence') resetEvidenceForm();
    else if (draft.target.form === 'run') resetRunForm();
    else resetCheckpointForm();
  },
);

watch(
  [lineSlug, lineTitle, lineObjective, lineAssessment, lineStatus],
  () => {
    if (resettingLine) return;
    lineDraftVersion++;
    lineDirty.value = true;
  },
  { flush: 'sync' },
);
watch(
  [
    questionWording,
    questionAssessment,
    questionPriority,
    questionNeededEvidence,
    questionNextAction,
    questionWorkflow,
    questionEpistemic,
    questionReason,
  ],
  () => {
    if (resettingQuestion) return;
    questionDraftVersion++;
    questionDirty.value = true;
  },
  { flush: 'sync' },
);
watch(
  [checkpointAssessment, checkpointNextAction, checkpointEntryId],
  () => {
    if (resettingCheckpoint) return;
    checkpointDraftVersion++;
    checkpointDirty.value = true;
  },
  { flush: 'sync' },
);
watch(
  [decisionResolution, decisionNextPhase],
  () => {
    if (resettingDecision) return;
    decisionDraftVersion++;
    decisionDirty.value = true;
  },
  { flush: 'sync' },
);
watch(
  [evidencePacketId, evidenceKind, evidenceClaim, evidenceBody, evidenceConfidence],
  () => {
    if (resettingEvidence) return;
    evidenceDraftVersion++;
    evidenceDirty.value = true;
  },
  { flush: 'sync' },
);
watch(
  runSchedulerState,
  (schedulerState) => {
    if (resettingRun) return;
    runTerminalState.value = schedulerState === 'completed'
      || schedulerState === 'failed'
      || schedulerState === 'cancelled'
      ? schedulerState
      : '';
  },
  { flush: 'sync' },
);
watch(
  [
    runActionId,
    runCampaign,
    runJobId,
    runSourcePin,
    runBinaryPin,
    runStage,
    runSchedulerState,
    runTerminalState,
    runArtifactRefs,
  ],
  () => {
    if (resettingRun) return;
    runDraftVersion++;
    runDirty.value = true;
  },
  { flush: 'sync' },
);

function optionalText(value: string): string | undefined {
  const trimmed = value.trim();
  return trimmed === '' ? undefined : trimmed;
}

function evidenceLines(): string[] | undefined {
  const lines = questionNeededEvidence.value
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean);
  return lines.length === 0 ? undefined : lines;
}

function emitEnter(): void {
  emitManagerCommand({
    kind: 'enter_mode',
    actor: 'user',
    lineSlug: optionalText(selectedLineSlug.value),
  });
}

function emitLoopCommand(kind: 'pause_loop' | 'resume_loop'): void {
  const snapshot = props.snapshot;
  if (snapshot === null) return;
  emitManagerCommand({
    kind,
    expectedRevision: snapshot.revision,
    reason: optionalText(questionReason.value),
  });
}

function emitSwitchLine(): void {
  const snapshot = props.snapshot;
  if (snapshot === null || selectedLineSlug.value === '') return;
  emitManagerCommand({
    kind: 'switch_line',
    lineSlug: selectedLineSlug.value,
    expectedRevision: snapshot.revision,
  });
}

function saveLine(): void {
  if (!canSaveLine.value) return;
  if (lineEditorMode.value === 'create') {
    emitManagerCommand({
      kind: 'create_line',
      slug: lineSlug.value.trim(),
      title: lineTitle.value.trim(),
      objective: optionalText(lineObjective.value),
      assessment: optionalText(lineAssessment.value),
    });
    return;
  }
  const line = selectedLine.value;
  if (line === undefined) return;
  emitManagerCommand({
    kind: 'update_line',
    lineSlug: line.slug,
    expectedRevision: lineBaseRevision.value ?? line.revision,
    title: lineTitle.value.trim(),
    objective: lineObjective.value.trim(),
    status: lineStatus.value,
    assessment: lineAssessment.value.trim(),
  });
}

function saveQuestion(): void {
  if (!canSaveQuestion.value) return;
  const priority = Number(questionPriority.value);
  if (questionEditorMode.value === 'create') {
    emitManagerCommand({
      kind: 'create_question',
      lineSlug: selectedLineSlug.value,
      wording: questionWording.value.trim(),
      assessment: optionalText(questionAssessment.value),
      priority: Number.isFinite(priority) ? priority : undefined,
      neededEvidence: evidenceLines(),
    });
    return;
  }
  const question = selectedQuestion.value;
  if (question === undefined) return;
  emitManagerCommand({
    kind: 'update_question',
    questionId: question.id,
    expectedRevision: questionBaseRevision.value ?? question.revision,
    wording: questionWording.value.trim(),
    assessment: questionAssessment.value.trim(),
    priority: Number.isFinite(priority) ? priority : undefined,
    workflow: questionWorkflow.value,
    epistemic: questionEpistemic.value,
    neededEvidence: evidenceLines() ?? [],
    nextBoundedAction: questionNextAction.value.trim(),
    reason: optionalText(questionReason.value),
  });
}

function emitFocus(): void {
  const expectedRevision = questionBaseSnapshotRevision.value;
  const question = selectedQuestion.value;
  if (!canSteerQuestion.value || expectedRevision === null || question === undefined) return;
  emitManagerCommand({
    kind: 'set_focus',
    questionId: question.id,
    expectedRevision,
    boundedAction: optionalText(questionNextAction.value),
    reason: optionalText(questionReason.value),
  });
}

function emitQuestionTransition(
  kind: 'defer_question' | 'block_question' | 'close_question' | 'reopen_question',
): void {
  const expectedRevision = questionBaseSnapshotRevision.value;
  const question = selectedQuestion.value;
  if (!canSteerQuestion.value || expectedRevision === null || question === undefined) return;
  emitManagerCommand({
    kind,
    questionId: question.id,
    expectedRevision,
    reason: optionalText(questionReason.value),
  });
}

function proposeCheckpoint(): void {
  const expectedRevision = checkpointBaseRevision.value;
  const target = checkpointBaseTarget.value;
  if (!canProposeCheckpoint.value || expectedRevision === null || target === null) return;
  emitManagerCommand({
    kind: 'propose_checkpoint',
    expectedRevision,
    questionId: target.questionId,
    lineSlug: target.lineSlug,
    assessment: optionalText(checkpointAssessment.value),
    nextAction: optionalText(checkpointNextAction.value),
  });
}

function commitCheckpoint(): void {
  const checkpointId = checkpointBasePendingCheckpointId.value;
  const entryId = checkpointEntryId.value.trim();
  if (!canCommitCheckpoint.value || checkpointId === null) return;
  emitManagerCommand({
    kind: 'commit_checkpoint',
    checkpointId,
    entryId,
  });
}

function textLines(value: string): string[] {
  return value.split('\n').map((line) => line.trim()).filter(Boolean);
}

function resolveDecision(): void {
  const gateId = decisionBaseGateId.value;
  const resolution = decisionResolution.value.trim();
  if (!canResolveDecision.value || gateId === null) return;
  emitManagerCommand({
    kind: 'resolve_decision',
    gateId,
    resolution,
    nextPhase: decisionNextPhase.value,
  });
}

function reviewEvidence(): void {
  const expectedRevision = evidenceBaseRevision.value;
  const target = evidenceBaseTarget.value;
  if (!canReviewEvidence.value || expectedRevision === null || target === null) return;
  emitManagerCommand({
    kind: 'review_evidence',
    expectedRevision,
    packet: {
      packet_id: evidencePacketId.value.trim(),
      kind: evidenceKind.value,
      claim: evidenceClaim.value.trim(),
      evidence: evidenceBody.value.trim(),
      question_id: target.questionId,
      line_slug: target.lineSlug,
      action_id: target.actionId,
      assumptions: [],
      tests: [],
      artifact_refs: [],
      source_refs: [],
      limitations: [],
      confidence: evidenceConfidence.value,
    },
  });
}

function observeRun(): void {
  const expectedRevision = runBaseRevision.value;
  const actionId = runBaseActionId.value;
  if (!canObserveRun.value || expectedRevision === null || actionId === null) return;
  emitManagerCommand({
    kind: 'observe_run',
    actionId,
    expectedRevision,
    campaign: runCampaign.value.trim(),
    jobId: runJobId.value.trim(),
    sourcePin: optionalText(runSourcePin.value),
    binaryPin: optionalText(runBinaryPin.value),
    stage: runStage.value,
    schedulerState: runSchedulerState.value,
    terminalState: runTerminalState.value || undefined,
    artifactRefs: textLines(runArtifactRefs.value),
  });
}

function acknowledgeAlert(fingerprint: string): void {
  emitManagerCommand({ kind: 'acknowledge_alert', fingerprint });
}
</script>

<template>
  <Dialog
    v-model:open="open"
    :title="t('research.manager.title')"
    :description="t('research.manager.description')"
    size="xl"
    height="fixed"
  >
    <div class="research-manager">
      <div class="manager-toolbar">
        <div class="manager-state">
          <Badge :variant="modeActive ? 'success' : 'neutral'" dot>
            {{ t(`research.phase.${snapshot?.mode ?? 'inactive'}`) }}
          </Badge>
          <Badge v-if="snapshot" :variant="snapshot.loopStatus === 'paused' ? 'warning' : 'neutral'">
            {{ t(`research.loop.${snapshot.loopStatus}`) }}
          </Badge>
        </div>
        <div class="manager-actions">
          <Button v-if="!modeActive" size="sm" @click="emitEnter">
            {{ t('research.manager.enter') }}
          </Button>
          <Button v-else variant="danger-soft" size="sm" @click="emitManagerCommand({ kind: 'exit_mode' })">
            {{ t('research.manager.exit') }}
          </Button>
          <Button
            v-if="snapshot?.loopStatus === 'active'"
            variant="secondary"
            size="sm"
            @click="emitLoopCommand('pause_loop')"
          >
            {{ t('research.manager.pause') }}
          </Button>
          <Button
            v-else-if="snapshot"
            variant="secondary"
            size="sm"
            @click="emitLoopCommand('resume_loop')"
          >
            {{ t('research.manager.resume') }}
          </Button>
        </div>
      </div>

      <div class="manager-layout">
        <aside class="line-panel">
          <div class="panel-heading">
            <strong>{{ t('research.lines') }}</strong>
            <Button variant="ghost" size="sm" @click="lineEditorMode = 'create'; section = 'line'">
              {{ t('research.manager.newLine') }}
            </Button>
          </div>
          <Menu v-if="(snapshot?.lines.length ?? 0) > 0" class="line-menu">
            <MenuItem
              v-for="line in snapshot?.lines ?? []"
              :key="line.slug"
              :active="line.slug === selectedLineSlug"
              @click="selectedLineSlug = line.slug; lineEditorMode = 'edit'"
            >
              <span class="line-option-copy">
                <span class="line-option-title">{{ line.title }}</span>
                <code>{{ line.slug }}</code>
              </span>
              <Badge size="sm" :variant="line.status === 'blocked' ? 'warning' : 'neutral'">
                {{ t(`research.lineStatus.${line.status}`) }}
              </Badge>
            </MenuItem>
          </Menu>
          <div v-if="(snapshot?.lines.length ?? 0) === 0" class="manager-empty">
            {{ t('research.noLines') }}
          </div>
        </aside>

        <main class="editor-panel">
          <SegmentedControl v-model="section" :options="sectionOptions" size="sm" />

          <section v-if="section === 'line'" class="editor-section">
            <div class="section-heading">
              <h3>{{ t(`research.manager.${lineEditorMode}Line`) }}</h3>
              <div v-if="selectedLine && lineEditorMode === 'edit'" class="inline-actions">
                <Button
                  variant="secondary"
                  size="sm"
                  :disabled="snapshot?.currentLineSlug === selectedLine.slug"
                  @click="emitSwitchLine"
                >
                  {{ t('research.manager.switchLine') }}
                </Button>
              </div>
            </div>
            <Banner v-if="lineStale" variant="warning">
              <span>{{ t('research.manager.staleLine') }}</span>
              <Button variant="secondary" size="sm" @click="resetLineForm">
                {{ t('research.manager.reloadDraft') }}
              </Button>
            </Banner>
            <Field
              v-if="lineEditorMode === 'create'"
              :label="t('research.manager.lineSlug')"
              control-id="research-manager-line-slug"
            >
              <Input
                id="research-manager-line-slug"
                v-model="lineSlug"
                :placeholder="t('research.manager.lineSlugPlaceholder')"
              />
            </Field>
            <Field :label="t('research.manager.lineTitle')" control-id="research-manager-line-title">
              <Input id="research-manager-line-title" v-model="lineTitle" />
            </Field>
            <Field :label="t('research.manager.objective')" control-id="research-manager-line-objective">
              <Textarea id="research-manager-line-objective" v-model="lineObjective" :rows="2" />
            </Field>
            <Field :label="t('research.manager.assessment')" control-id="research-manager-line-assessment">
              <Textarea id="research-manager-line-assessment" v-model="lineAssessment" :rows="2" />
            </Field>
            <Field
              v-if="lineEditorMode === 'edit'"
              :label="t('research.manager.status')"
              control-id="research-manager-line-status"
            >
              <Select id="research-manager-line-status" v-model="lineStatus">
                <option value="active">{{ t('research.lineStatus.active') }}</option>
                <option value="paused">{{ t('research.lineStatus.paused') }}</option>
                <option value="completed">{{ t('research.lineStatus.completed') }}</option>
                <option value="blocked">{{ t('research.lineStatus.blocked') }}</option>
              </Select>
            </Field>
            <div class="form-actions">
              <Button :disabled="!canSaveLine" @click="saveLine">
                {{ t('research.manager.saveLine') }}
              </Button>
              <Button
                v-if="lineEditorMode === 'create' && selectedLine"
                variant="secondary"
                @click="lineEditorMode = 'edit'"
              >
                {{ t('common.cancel') }}
              </Button>
            </div>
          </section>

          <section v-else-if="section === 'question'" class="editor-section">
            <div class="section-heading">
              <h3>{{ t(`research.manager.${questionEditorMode}Question`) }}</h3>
              <Button
                variant="ghost"
                size="sm"
                :disabled="selectedLineSlug === ''"
                @click="questionEditorMode = 'create'"
              >
                {{ t('research.manager.newQuestion') }}
              </Button>
            </div>
            <Banner v-if="questionStale" variant="warning">
              <span>{{ t('research.manager.staleQuestion') }}</span>
              <Button variant="secondary" size="sm" @click="resetQuestionForm">
                {{ t('research.manager.reloadDraft') }}
              </Button>
            </Banner>
            <Field
              v-if="questionEditorMode === 'edit'"
              :label="t('research.manager.question')"
              control-id="research-manager-question-selector"
            >
              <Select
                id="research-manager-question-selector"
                v-model="selectedQuestionId"
                :disabled="lineQuestions.length === 0"
              >
                <option v-for="question in lineQuestions" :key="question.id" :value="question.id">
                  {{ question.wording }}
                </option>
              </Select>
            </Field>
            <div v-if="questionEditorMode === 'edit' && !selectedQuestion" class="manager-empty">
              {{ t('research.noQuestions') }}
            </div>
            <template v-else>
              <Field :label="t('research.manager.wording')" control-id="research-manager-question-wording">
                <Textarea id="research-manager-question-wording" v-model="questionWording" :rows="2" />
              </Field>
              <div class="field-grid">
                <Field :label="t('research.manager.priority')" control-id="research-manager-question-priority">
                  <Input id="research-manager-question-priority" v-model="questionPriority" type="number" />
                </Field>
                <Field
                  v-if="questionEditorMode === 'edit'"
                  :label="t('research.manager.workflowLabel')"
                  control-id="research-manager-question-workflow"
                >
                  <Select id="research-manager-question-workflow" v-model="questionWorkflow">
                    <option value="open">{{ t('research.workflow.open') }}</option>
                    <option value="active">{{ t('research.workflow.active') }}</option>
                    <option value="deferred">{{ t('research.workflow.deferred') }}</option>
                    <option value="blocked">{{ t('research.workflow.blocked') }}</option>
                    <option value="closed">{{ t('research.workflow.closed') }}</option>
                    <option value="cancelled">{{ t('research.workflow.cancelled') }}</option>
                  </Select>
                </Field>
                <Field
                  v-if="questionEditorMode === 'edit'"
                  :label="t('research.manager.epistemicLabel')"
                  control-id="research-manager-question-epistemic"
                >
                  <Select id="research-manager-question-epistemic" v-model="questionEpistemic">
                    <option value="unknown">{{ t('research.epistemic.unknown') }}</option>
                    <option value="candidate">{{ t('research.epistemic.candidate') }}</option>
                    <option value="supported">{{ t('research.epistemic.supported') }}</option>
                    <option value="contradicted">{{ t('research.epistemic.contradicted') }}</option>
                    <option value="inconclusive">{{ t('research.epistemic.inconclusive') }}</option>
                  </Select>
                </Field>
              </div>
              <Field :label="t('research.manager.assessment')" control-id="research-manager-question-assessment">
                <Textarea id="research-manager-question-assessment" v-model="questionAssessment" :rows="2" />
              </Field>
              <Field
                :label="t('research.manager.neededEvidence')"
                :hint="t('research.manager.onePerLine')"
                control-id="research-manager-question-needed-evidence"
              >
                <Textarea
                  id="research-manager-question-needed-evidence"
                  v-model="questionNeededEvidence"
                  :rows="2"
                />
              </Field>
              <Field
                v-if="questionEditorMode === 'edit'"
                :label="t('research.manager.nextAction')"
                control-id="research-manager-question-next-action"
              >
                <Textarea id="research-manager-question-next-action" v-model="questionNextAction" :rows="2" />
              </Field>
              <Field
                v-if="questionEditorMode === 'edit'"
                :label="t('research.manager.reason')"
                control-id="research-manager-question-reason"
              >
                <Input id="research-manager-question-reason" v-model="questionReason" />
              </Field>
              <div class="form-actions">
                <Button :disabled="!canSaveQuestion" @click="saveQuestion">
                  {{ t('research.manager.saveQuestion') }}
                </Button>
                <Button
                  v-if="questionEditorMode === 'edit'"
                  variant="secondary"
                  :disabled="!canSteerQuestion"
                  @click="emitFocus"
                >
                  {{ t('research.manager.setFocus') }}
                </Button>
                <Button
                  v-if="questionEditorMode === 'create' && selectedQuestion"
                  variant="secondary"
                  @click="questionEditorMode = 'edit'"
                >
                  {{ t('common.cancel') }}
                </Button>
              </div>
              <div v-if="questionEditorMode === 'edit' && selectedQuestion" class="transition-actions">
                <span>{{ t('research.manager.transition') }}</span>
                <Button
                  variant="ghost"
                  size="sm"
                  :disabled="!canSteerQuestion"
                  @click="emitQuestionTransition('defer_question')"
                >
                  {{ t('research.manager.defer') }}
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  :disabled="!canSteerQuestion"
                  @click="emitQuestionTransition('block_question')"
                >
                  {{ t('research.manager.block') }}
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  :disabled="!canSteerQuestion"
                  @click="emitQuestionTransition('close_question')"
                >
                  {{ t('research.manager.close') }}
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  :disabled="!canSteerQuestion"
                  @click="emitQuestionTransition('reopen_question')"
                >
                  {{ t('research.manager.reopen') }}
                </Button>
              </div>
            </template>
          </section>

          <section v-else-if="section === 'science'" class="editor-section">
            <div class="science-control">
              <h3>{{ t('research.manager.humanDecision') }}</h3>
              <Banner v-if="decisionStale" variant="warning">
                <span>{{ t('research.manager.staleDecision') }}</span>
                <Button variant="secondary" size="sm" @click="resetDecisionForm">
                  {{ t('research.manager.reloadDraft') }}
                </Button>
              </Banner>
              <Banner v-if="snapshot?.humanGate && snapshot.humanGate.resolvedAt === undefined" variant="warning">
                {{ snapshot.humanGate.prompt }}
              </Banner>
              <div v-else class="manager-empty">{{ t('research.manager.noHumanGate') }}</div>
              <Field :label="t('research.manager.resolution')" control-id="research-manager-decision-resolution">
                <Textarea
                  id="research-manager-decision-resolution"
                  v-model="decisionResolution"
                  :rows="2"
                  :disabled="decisionBaseGateId === null || decisionPendingCommandId !== null"
                />
              </Field>
              <Field :label="t('research.manager.nextPhase')" control-id="research-manager-decision-next-phase">
                <Select
                  id="research-manager-decision-next-phase"
                  v-model="decisionNextPhase"
                  :disabled="decisionBaseGateId === null || decisionPendingCommandId !== null"
                >
                  <option
                    v-for="phase in RESEARCH_DECISION_NEXT_PHASES"
                    :key="phase"
                    :value="phase"
                  >
                    {{ t(`research.sciencePhase.${phase}`) }}
                  </option>
                </Select>
              </Field>
              <Button :disabled="!canResolveDecision" @click="resolveDecision">
                {{ t('research.manager.resolveDecision') }}
              </Button>
            </div>

            <div class="science-control">
              <h3>{{ t('research.manager.activeAlerts') }}</h3>
              <div v-if="activeAlerts.length === 0" class="manager-empty">
                {{ t('research.manager.noActiveAlerts') }}
              </div>
              <Banner v-for="alert in activeAlerts" v-else :key="alert.fingerprint" variant="warning">
                <span>{{ alert.message }}</span>
                <Button variant="secondary" size="sm" @click="acknowledgeAlert(alert.fingerprint)">
                  {{ t('research.manager.acknowledge') }}
                </Button>
              </Banner>
            </div>

            <div class="science-control">
              <h3>{{ t('research.manager.reviewEvidence') }}</h3>
              <Banner v-if="evidenceStale" variant="warning">
                <span>{{ t('research.manager.staleEvidence') }}</span>
                <Button variant="secondary" size="sm" @click="resetEvidenceForm">
                  {{ t('research.manager.reloadDraft') }}
                </Button>
              </Banner>
              <div class="field-grid">
                <Field :label="t('research.manager.packetId')" control-id="research-manager-evidence-packet-id">
                  <Input id="research-manager-evidence-packet-id" v-model="evidencePacketId" />
                </Field>
                <Field :label="t('research.manager.evidenceKind')" control-id="research-manager-evidence-kind">
                  <Select id="research-manager-evidence-kind" v-model="evidenceKind">
                    <option value="observation">{{ t('research.manager.evidenceKinds.observation') }}</option>
                    <option value="result">{{ t('research.manager.evidenceKinds.result') }}</option>
                    <option value="failure">{{ t('research.manager.evidenceKinds.failure') }}</option>
                    <option value="derivation">{{ t('research.manager.evidenceKinds.derivation') }}</option>
                    <option value="literature">{{ t('research.manager.evidenceKinds.literature') }}</option>
                  </Select>
                </Field>
                <Field :label="t('research.manager.confidence')" control-id="research-manager-evidence-confidence">
                  <Select id="research-manager-evidence-confidence" v-model="evidenceConfidence">
                    <option value="low">{{ t('research.manager.confidenceLevels.low') }}</option>
                    <option value="medium">{{ t('research.manager.confidenceLevels.medium') }}</option>
                    <option value="high">{{ t('research.manager.confidenceLevels.high') }}</option>
                  </Select>
                </Field>
              </div>
              <Field :label="t('research.manager.claim')" control-id="research-manager-evidence-claim">
                <Textarea id="research-manager-evidence-claim" v-model="evidenceClaim" :rows="2" />
              </Field>
              <Field :label="t('research.manager.evidence')" control-id="research-manager-evidence-body">
                <Textarea id="research-manager-evidence-body" v-model="evidenceBody" :rows="3" />
              </Field>
              <Button :disabled="!canReviewEvidence" @click="reviewEvidence">
                {{ t('research.manager.reviewEvidence') }}
              </Button>
            </div>

            <div class="science-control">
              <h3>{{ t('research.manager.observeRun') }}</h3>
              <Banner v-if="runStale" variant="warning">
                <span>{{ t('research.manager.staleRun') }}</span>
                <Button variant="secondary" size="sm" @click="resetRunForm">
                  {{ t('research.manager.reloadDraft') }}
                </Button>
              </Banner>
              <Banner
                v-if="!researchRunTerminalStateIsConsistent(runSchedulerState, runTerminalState)"
                variant="warning"
              >
                {{ t('research.manager.runTerminalMismatch') }}
              </Banner>
              <div class="field-grid">
                <Field :label="t('research.manager.actionId')" control-id="research-manager-run-action-id">
                  <Input id="research-manager-run-action-id" v-model="runActionId" disabled />
                </Field>
                <Field :label="t('research.manager.campaign')" control-id="research-manager-run-campaign">
                  <Input id="research-manager-run-campaign" v-model="runCampaign" />
                </Field>
                <Field :label="t('research.manager.jobId')" control-id="research-manager-run-job-id">
                  <Input id="research-manager-run-job-id" v-model="runJobId" />
                </Field>
              </div>
              <div class="field-grid">
                <Field :label="t('research.manager.runStage')" control-id="research-manager-run-stage">
                  <Select id="research-manager-run-stage" v-model="runStage">
                    <option value="queued">{{ t('research.runStage.queued') }}</option>
                    <option value="running">{{ t('research.runStage.running') }}</option>
                    <option value="scf">{{ t('research.runStage.scf') }}</option>
                    <option value="band">{{ t('research.runStage.band') }}</option>
                    <option value="analyzing">{{ t('research.runStage.analyzing') }}</option>
                    <option value="completed">{{ t('research.runStage.completed') }}</option>
                    <option value="failed">{{ t('research.runStage.failed') }}</option>
                    <option value="unknown">{{ t('research.runStage.unknown') }}</option>
                  </Select>
                </Field>
                <Field :label="t('research.manager.schedulerState')" control-id="research-manager-run-scheduler-state">
                  <Select id="research-manager-run-scheduler-state" v-model="runSchedulerState">
                    <option value="pending">{{ t('research.manager.schedulerStates.pending') }}</option>
                    <option value="running">{{ t('research.manager.schedulerStates.running') }}</option>
                    <option value="completed">{{ t('research.manager.schedulerStates.completed') }}</option>
                    <option value="failed">{{ t('research.manager.schedulerStates.failed') }}</option>
                    <option value="cancelled">{{ t('research.manager.schedulerStates.cancelled') }}</option>
                    <option value="unknown">{{ t('research.manager.schedulerStates.unknown') }}</option>
                  </Select>
                </Field>
                <Field :label="t('research.manager.terminalState')" control-id="research-manager-run-terminal-state">
                  <Select id="research-manager-run-terminal-state" v-model="runTerminalState">
                    <option value="">{{ t('research.none') }}</option>
                    <option value="completed">{{ t('research.manager.schedulerStates.completed') }}</option>
                    <option value="failed">{{ t('research.manager.schedulerStates.failed') }}</option>
                    <option value="cancelled">{{ t('research.manager.schedulerStates.cancelled') }}</option>
                  </Select>
                </Field>
              </div>
              <div class="field-grid">
                <Field :label="t('research.manager.sourcePin')" control-id="research-manager-run-source-pin">
                  <Input id="research-manager-run-source-pin" v-model="runSourcePin" />
                </Field>
                <Field :label="t('research.manager.binaryPin')" control-id="research-manager-run-binary-pin">
                  <Input id="research-manager-run-binary-pin" v-model="runBinaryPin" />
                </Field>
              </div>
              <Field
                :label="t('research.manager.artifactRefs')"
                :hint="t('research.manager.onePerLine')"
                control-id="research-manager-run-artifact-refs"
              >
                <Textarea id="research-manager-run-artifact-refs" v-model="runArtifactRefs" :rows="2" />
              </Field>
              <Button :disabled="!canObserveRun" @click="observeRun">
                {{ t('research.manager.observeRun') }}
              </Button>
            </div>
          </section>

          <section v-else class="editor-section">
            <h3>{{ t('research.manager.proposeCheckpoint') }}</h3>
            <Banner v-if="checkpointStale" variant="warning">
              <span>{{ t('research.manager.staleCheckpoint') }}</span>
              <Button variant="secondary" size="sm" @click="resetCheckpointForm">
                {{ t('research.manager.reloadDraft') }}
              </Button>
            </Banner>
            <p class="section-note">
              {{ selectedQuestion?.wording ?? selectedLine?.title ?? t('research.none') }}
            </p>
            <Field :label="t('research.manager.assessment')" control-id="research-manager-checkpoint-assessment">
              <Textarea id="research-manager-checkpoint-assessment" v-model="checkpointAssessment" :rows="3" />
            </Field>
            <Field :label="t('research.manager.nextAction')" control-id="research-manager-checkpoint-next-action">
              <Textarea id="research-manager-checkpoint-next-action" v-model="checkpointNextAction" :rows="2" />
            </Field>
            <div class="form-actions">
              <Button :disabled="!canProposeCheckpoint" @click="proposeCheckpoint">
                {{ t('research.manager.propose') }}
              </Button>
            </div>

            <div class="checkpoint-commit">
              <div class="section-heading">
                <h3>{{ t('research.manager.commitCheckpoint') }}</h3>
                <code>{{ snapshot?.pendingCheckpoint?.checkpointId ?? t('research.none') }}</code>
              </div>
              <Field
                :label="t('research.manager.entryId')"
                :hint="t('research.manager.entryIdHint')"
                control-id="research-manager-checkpoint-entry-id"
              >
                <Input
                  id="research-manager-checkpoint-entry-id"
                  v-model="checkpointEntryId"
                  :disabled="!snapshot?.pendingCheckpoint"
                />
              </Field>
              <Button :disabled="!canCommitCheckpoint" @click="commitCheckpoint">
                {{ t('research.manager.commit') }}
              </Button>
            </div>
          </section>
        </main>
      </div>
    </div>
  </Dialog>
</template>

<style scoped>
.research-manager {
  min-height: 0;
  display: flex;
  flex-direction: column;
  gap: var(--space-4);
}
.manager-toolbar,
.manager-state,
.manager-actions,
.section-heading,
.inline-actions,
.form-actions,
.transition-actions {
  display: flex;
  align-items: center;
  gap: var(--space-2);
}
.manager-toolbar,
.section-heading {
  justify-content: space-between;
}
.manager-state,
.manager-actions,
.form-actions,
.transition-actions {
  flex-wrap: wrap;
}
.manager-layout {
  min-height: 0;
  display: grid;
  grid-template-columns: minmax(180px, 0.8fr) minmax(0, 2fr);
  gap: var(--space-4);
}
.line-panel {
  min-width: 0;
  padding-right: var(--space-3);
  border-right: 1px solid var(--color-line);
  display: flex;
  flex-direction: column;
  gap: var(--space-1);
  overflow-y: auto;
}
.panel-heading {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-2);
  padding-bottom: var(--space-2);
}
.line-option-copy {
  min-width: 0;
  display: flex;
  flex: 1;
  flex-direction: column;
  gap: var(--space-1);
}
.line-option-title {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.editor-panel {
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: var(--space-4);
}
.editor-section {
  display: grid;
  gap: var(--space-3);
}
.science-control {
  display: grid;
  gap: var(--space-3);
  padding: var(--space-3);
  border: 1px solid var(--color-line);
  border-radius: var(--radius-md);
  background: var(--color-surface-raised);
}
h3 {
  margin: 0;
  color: var(--color-text);
  font-size: var(--text-base);
  font-weight: var(--weight-medium);
}
.field-grid {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: var(--space-3);
}
.transition-actions {
  padding-top: var(--space-3);
  border-top: 1px solid var(--color-line);
  color: var(--color-text-muted);
  font-size: var(--text-sm);
}
.checkpoint-commit {
  margin-top: var(--space-3);
  padding-top: var(--space-4);
  border-top: 1px solid var(--color-line);
  display: grid;
  gap: var(--space-3);
}
.section-note,
.manager-empty {
  margin: 0;
  color: var(--color-text-faint);
  font-size: var(--text-sm);
}
.manager-empty {
  padding: var(--space-5) var(--space-2);
  text-align: center;
}
code {
  color: var(--color-text-muted);
  font-family: var(--font-mono);
  font-size: var(--text-xs);
}

@media (max-width: 640px) {
  .manager-toolbar,
  .section-heading {
    align-items: flex-start;
    flex-direction: column;
  }
  .manager-layout {
    grid-template-columns: 1fr;
  }
  .line-panel {
    max-height: 180px;
    padding-right: 0;
    padding-bottom: var(--space-3);
    border-right: none;
    border-bottom: 1px solid var(--color-line);
  }
  .field-grid {
    grid-template-columns: 1fr;
  }
}
</style>
