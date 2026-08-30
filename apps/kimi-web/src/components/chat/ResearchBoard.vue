<script setup lang="ts">
import { computed, ref, useId, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import type {
  ResearchAlert,
  ResearchCheckpointCheckReceipt,
  ResearchCheckpointReceipt,
  ResearchModePhase,
  ResearchQuestion,
  ResearchRunState,
  ResearchStatusSnapshot,
} from '../../api/types';
import {
  buildResearchBoardCompactSlots,
  presentResearchAlertClassification,
  selectResearchBoardExpandedRecord,
  type ResearchBoardAttentionSlot,
  type ResearchBoardGoalSlot,
  type ResearchBoardNextSlot,
  type ResearchBoardNowSlot,
} from '../../lib/researchBoardPresentation';
import Badge from '../ui/Badge.vue';
import Banner from '../ui/Banner.vue';
import Button from '../ui/Button.vue';
import Card from '../ui/Card.vue';
import Icon from '../ui/Icon.vue';

const props = defineProps<{
  snapshot: ResearchStatusSnapshot;
  forceExpanded?: number;
}>();
const emit = defineEmits<{ manage: [] }>();
const { locale, t } = useI18n();
const expanded = ref(false);
const instanceId = useId();
const detailsId = instanceId + '-research-details';
const detailsHeadingId = instanceId + '-research-details-heading';

watch(
  () => props.forceExpanded,
  () => {
    expanded.value = true;
  },
);

const phaseVariant = computed<'neutral' | 'info' | 'success' | 'warning'>(() => {
  const phase: ResearchModePhase = props.snapshot.mode;
  if (phase === 'ready') return 'success';
  if (phase === 'degraded') return 'warning';
  if (phase === 'probing') return 'info';
  return 'neutral';
});

const compactSlots = computed(() => buildResearchBoardCompactSlots(props.snapshot));
const expandedRecord = computed(() => selectResearchBoardExpandedRecord(props.snapshot));
const goalSlot = computed(() =>
  compactSlots.value.find((slot): slot is ResearchBoardGoalSlot => slot.kind === 'goal'),
);
const attentionSlot = computed(() =>
  compactSlots.value.find(
    (slot): slot is ResearchBoardAttentionSlot => slot.kind === 'attention',
  ),
);
const nowSlot = computed(() =>
  compactSlots.value.find((slot): slot is ResearchBoardNowSlot => slot.kind === 'now'),
);
const nextSlot = computed(() =>
  compactSlots.value.find((slot): slot is ResearchBoardNextSlot => slot.kind === 'next'),
);

const currentLine = computed(() =>
  props.snapshot.lines.find((line) => line.slug === props.snapshot.currentLineSlug),
);
const focusedQuestion = computed<ResearchQuestion | undefined>(() => {
  const id = props.snapshot.currentFocus?.questionId;
  if (id === undefined) return props.snapshot.currentQuestion;
  return props.snapshot.questions.find((question) => question.id === id)
    ?? props.snapshot.currentQuestion;
});
const orderedLines = computed(() => {
  const current = currentLine.value;
  if (current === undefined) return props.snapshot.lines;
  return [
    current,
    ...props.snapshot.lines.filter((line) => line.slug !== current.slug),
  ];
});
const orderedQuestions = computed(() => {
  const currentId = focusedQuestion.value?.id;
  if (currentId === undefined) return props.snapshot.questions;
  const current = props.snapshot.questions.find((question) => question.id === currentId)
    ?? focusedQuestion.value;
  if (current === undefined) return props.snapshot.questions;
  return [
    current,
    ...props.snapshot.questions.filter((question) => question.id !== currentId),
  ];
});
const orderedAlerts = computed(() =>
  props.snapshot.alerts.toSorted((a, b) => {
    const activeRank = (alert: ResearchAlert): number =>
      alert.state === undefined || alert.state === 'active' ? 0 : 1;
    return activeRank(a) - activeRank(b) || a.createdAt - b.createdAt;
  }),
);
const expandedRuns = computed<ResearchRunState[]>(() => {
  const runs = [props.snapshot.currentRun, props.snapshot.currentAction?.run]
    .filter((run): run is ResearchRunState => run !== undefined);
  return runs.filter((run, index) =>
    runs.findIndex((candidate) =>
      candidate.actionId === run.actionId
      && candidate.campaign === run.campaign
      && candidate.jobId === run.jobId) === index);
});

const attentionText = computed(() => {
  const slot = attentionSlot.value;
  if (slot === undefined) return '';
  if (slot.source === 'maintenance') {
    return t('research.degradedReasonValue.' + slot.text);
  }
  return slot.text;
});
const attentionTitle = computed(() => {
  const slot = attentionSlot.value;
  if (slot?.source === 'human_gate') return t('research.humanGate');
  if (slot?.source === 'maintenance') return t('research.degradedReason');
  if (slot?.source === 'alert') return t('research.alertKind.' + slot.alertKind);
  return t('research.adapterHealth');
});
const maintenanceFreshness = computed(() => {
  const maintenance = props.snapshot.aitpMaintenance;
  if (maintenance?.activeNewerThanWorkingNote === true) {
    return t('research.workingNoteStale');
  }
  if (maintenance?.latestWorkingNoteAt === undefined) {
    return t('research.researchGoalNotEstablished');
  }
  if (maintenance.activeNewerThanWorkingNote === false) {
    return t('research.workingNoteCurrent');
  }
  return t('research.workingNoteUnknown');
});

function formatTimestamp(timestamp: number | undefined): string {
  if (timestamp === undefined || !Number.isFinite(timestamp)) return t('research.none');
  const date = new Date(timestamp);
  if (Number.isNaN(date.getTime())) return t('research.none');
  return new Intl.DateTimeFormat(locale.value, {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(date);
}

function alertState(alert: ResearchAlert): string {
  if (alert.state !== undefined) return alert.state;
  return alert.acknowledgedAt === undefined ? 'active' : 'acknowledged';
}

function alertVariant(alert: ResearchAlert): 'warning' | 'danger' {
  return presentResearchAlertClassification(alert) === 'active_blocker'
    && alertState(alert) === 'active'
    ? 'danger'
    : 'warning';
}

interface ReceiptLine {
  key: string;
  label: string;
  value: string;
}

function checkpointCheckLines(
  prefix: 'preSaveCheck' | 'postSaveCheck',
  check: ResearchCheckpointCheckReceipt | undefined,
): ReceiptLine[] {
  if (check === undefined) return [];
  const lines: ReceiptLine[] = [{
    key: prefix,
    label: t('research.' + prefix),
    value: `${check.status} · ${t('research.errorCount', { count: check.errors })} · ${t('research.warningCount', { count: check.warnings })} · ${formatTimestamp(check.checkedAt)}`,
  }];
  const append = (suffix: string, label: string, values: string[] | undefined): void => {
    if (values === undefined || values.length === 0) return;
    lines.push({ key: `${prefix}-${suffix}`, label, value: values.join(' · ') });
  };
  append('findings', t('research.findingFingerprints'), check.findingFingerprints);
  append('errors', t('research.errorFindingFingerprints'), check.errorFindingFingerprints);
  append('new-errors', t('research.newErrorFindingFingerprints'), check.newErrorFindingFingerprints);
  append(
    'existing-errors',
    t('research.preExistingErrorFindingFingerprints'),
    check.preExistingErrorFindingFingerprints,
  );
  return lines;
}

function checkpointReceiptLines(
  receipt: ResearchCheckpointReceipt | undefined,
): ReceiptLine[] {
  if (receipt === undefined) return [];
  const lines: ReceiptLine[] = [];
  const prepare = receipt.prepare;
  if (prepare !== undefined) {
    lines.push({
      key: 'prepare',
      label: t('research.prepareReceipt'),
      value: prepare.status,
    });
    if (prepare.id !== undefined) {
      lines.push({ key: 'prepare-id', label: t('research.receiptId'), value: prepare.id });
    }
    lines.push({ key: 'prepare-path', label: t('research.path'), value: prepare.path });
    if (prepare.idempotencyKey !== undefined) {
      lines.push({
        key: 'prepare-idempotency',
        label: t('research.idempotencyKey'),
        value: prepare.idempotencyKey,
      });
    }
    if (prepare.workstreams !== undefined && prepare.workstreams.length > 0) {
      lines.push({
        key: 'prepare-workstreams',
        label: t('research.workstreams'),
        value: prepare.workstreams.join(' · '),
      });
    }
  }
  const save = receipt.save;
  if (save !== undefined) {
    lines.push({ key: 'save', label: t('research.saveReceipt'), value: save.status });
    lines.push({ key: 'save-draft', label: t('research.draftPath'), value: save.draftPath });
    lines.push({ key: 'save-path', label: t('research.path'), value: save.path });
    if (save.source !== undefined) {
      lines.push({ key: 'save-source', label: t('research.source'), value: save.source });
    }
  }
  lines.push(...checkpointCheckLines('preSaveCheck', receipt.preSaveCheck));
  lines.push(...checkpointCheckLines('postSaveCheck', receipt.postSaveCheck));
  return lines;
}

function isFocusedQuestion(question: ResearchQuestion): boolean {
  return question.id === focusedQuestion.value?.id;
}
</script>

<template>
  <Card
    class="research-board"
    :class="{ 'is-expanded': expanded }"
    role="region"
    :aria-label="t('research.title')"
  >
    <template #head>
      <div class="research-head">
        <div class="research-identity">
          <Icon name="target" size="md" />
          <span class="research-title">{{ t('research.title') }}</span>
          <Badge :variant="phaseVariant" size="sm" dot>
            {{ t('research.phase.' + snapshot.mode) }}
          </Badge>
          <Badge :variant="snapshot.loopStatus === 'paused' ? 'warning' : 'neutral'" size="sm">
            {{ t('research.loop.' + snapshot.loopStatus) }}
          </Badge>
        </div>
        <code v-if="snapshot.currentLineSlug" class="research-head-line">
          {{ snapshot.currentLineSlug }}
        </code>
        <div class="research-actions">
          <Button variant="ghost" size="sm" @click="emit('manage')">
            {{ t('research.manage') }}
          </Button>
          <Button
            variant="ghost"
            size="sm"
            :aria-expanded="expanded"
            :aria-controls="detailsId"
            @click="expanded = !expanded"
          >
            <Icon :name="expanded ? 'chevron-up' : 'chevron-down'" size="sm" />
            {{ expanded ? t('research.collapse') : t('research.expand') }}
          </Button>
        </div>
      </div>
    </template>

    <div v-show="!expanded" class="research-compact" :aria-label="t('research.compactSummary')">
      <div class="research-compact-row research-compact-goal">
        <span class="research-slot-label">{{ t('research.researchGoal') }}</span>
        <strong class="research-slot-value research-goal-value">
          {{ goalSlot?.text ?? t('research.researchGoalNotEstablished') }}
        </strong>
      </div>

      <Banner v-if="attentionSlot" class="research-compact-attention" variant="warning">
        <span class="research-slot-label">{{ t('research.attention') }}</span>
        <span class="research-attention-value">
          <strong>{{ attentionTitle }}</strong>
          <span>{{ attentionText }}</span>
        </span>
        <Badge v-if="attentionSlot.additionalCount > 0" size="sm" variant="warning">
          {{ t('research.moreAttention', { count: attentionSlot.additionalCount }) }}
        </Badge>
      </Banner>

      <div class="research-compact-row">
        <span class="research-slot-label">{{ t('research.now') }}</span>
        <span class="research-slot-value">
          <Badge size="sm" variant="info">
            {{ t('research.sciencePhase.' + snapshot.phase) }}
          </Badge>
          <span v-if="nowSlot" class="research-slot-copy">{{ nowSlot.text }}</span>
          <span v-else class="research-slot-copy research-muted">{{ t('research.nowNotRecorded') }}</span>
        </span>
        <Badge v-if="nowSlot?.source === 'run'" size="sm">
          {{ t('research.runStage.' + nowSlot.stage) }}
        </Badge>
        <Badge v-else-if="nowSlot?.source === 'action'" size="sm">
          {{ t('research.actionStatus.' + nowSlot.status) }}
        </Badge>
      </div>

      <div class="research-compact-row">
        <span class="research-slot-label">{{ t('research.nextAction') }}</span>
        <span class="research-slot-value">
          <span v-if="nextSlot" class="research-slot-copy">{{ nextSlot.text }}</span>
          <span v-else class="research-slot-copy research-muted">{{ t('research.nextNotRecorded') }}</span>
        </span>
        <Badge
          v-if="nextSlot"
          size="sm"
          :variant="nextSlot.freshness === 'blocked' || nextSlot.freshness === 'stale' ? 'warning' : 'neutral'"
        >
          {{ t('research.nextStepSource.' + nextSlot.source) }}
        </Badge>
      </div>
    </div>

    <div
      v-show="expanded"
      :id="detailsId"
      class="research-expanded"
      :aria-labelledby="detailsHeadingId"
      tabindex="0"
    >
      <h3 :id="detailsHeadingId" class="sr-only">{{ t('research.details') }}</h3>

      <section class="research-section">
        <div class="research-section-head">
          <div>
            <span class="research-section-kicker">{{ t('research.overview') }}</span>
            <h4>{{ t('research.direction') }}</h4>
          </div>
          <code>{{ t('research.revision', { count: snapshot.revision }) }}</code>
        </div>
        <dl class="research-fields">
          <div class="research-field research-feature-field">
            <dt>{{ t('research.researchGoal') }}</dt>
            <dd>{{ snapshot.program?.goalText ?? t('research.researchGoalNotEstablished') }}</dd>
          </div>
          <div v-if="snapshot.program" class="research-field">
            <dt>{{ t('research.program') }}</dt>
            <dd>
              <strong>{{ snapshot.program.title }}</strong>
              <span><strong>{{ t('research.topicId') }}:</strong> <code>{{ snapshot.program.topicId }}</code></span>
              <span>{{ t('research.programSource') }}: {{ snapshot.program.goalSource }}</span>
              <span>{{ formatTimestamp(snapshot.program.establishedAt) }}</span>
            </dd>
          </div>
          <div v-if="expandedRecord.period" class="research-field">
            <dt>{{ t('research.researchPeriod') }}</dt>
            <dd>
              <span class="research-inline-meta">
                <code>{{ expandedRecord.period.id }}</code>
                <Badge size="sm" :variant="expandedRecord.period.endedAt === undefined ? 'success' : 'neutral'">
                  {{ expandedRecord.period.endedAt === undefined ? t('research.periodActive') : t('research.periodEnded') }}
                </Badge>
                <span>{{ t('research.loopCount', { count: expandedRecord.period.loopCount }) }}</span>
              </span>
              <span>
                <strong>{{ t('research.currentLine') }}:</strong>
                <code>{{ expandedRecord.period.lineSlug }}</code>
              </span>
              <span v-if="expandedRecord.period.currentQuestionId">
                <strong>{{ t('research.currentQuestion') }}:</strong>
                <code>{{ expandedRecord.period.currentQuestionId }}</code>
              </span>
              <span>
                <strong>{{ t('research.startedAt') }}:</strong>
                {{ formatTimestamp(expandedRecord.period.startedAt) }}
              </span>
              <span v-if="expandedRecord.period.endedAt !== undefined">
                <strong>{{ t('research.endedAt') }}:</strong>
                {{ formatTimestamp(expandedRecord.period.endedAt) }}
              </span>
              <span v-if="expandedRecord.period.summary">{{ expandedRecord.period.summary }}</span>
            </dd>
          </div>
          <div v-if="snapshot.goalSummary" class="research-field">
            <dt>{{ t('research.milestone') }}</dt>
            <dd>
              <span>{{ snapshot.goalSummary.objective }}</span>
              <span class="research-inline-meta">
                <Badge
                  size="sm"
                  :variant="snapshot.goalSummary.status === 'blocked' ? 'warning' : snapshot.goalSummary.status === 'complete' ? 'success' : 'neutral'"
                >
                  {{ t('research.goalStatusValue.' + snapshot.goalSummary.status) }}
                </Badge>
                <span v-if="snapshot.goalSummary.remainingTurns !== undefined">
                  {{ t('research.remainingTurns', { count: snapshot.goalSummary.remainingTurns }) }}
                </span>
                <span v-if="snapshot.goalSummary.turnBudget !== undefined">
                  {{ t('research.turnBudget', { count: snapshot.goalSummary.turnBudget }) }}
                </span>
              </span>
              <span v-if="snapshot.goalSummary.completionCriterion">
                <strong>{{ t('research.completionCriterion') }}:</strong>
                {{ snapshot.goalSummary.completionCriterion }}
              </span>
              <span v-if="snapshot.goalSummary.terminalReason">
                <strong>{{ t('research.terminalReason') }}:</strong>
                {{ snapshot.goalSummary.terminalReason }}
              </span>
              <span v-if="snapshot.goalSummary.waitingFor">
                <strong>{{ t('research.waitingFor') }}:</strong>
                {{ t('research.waitingForTasks', {
                  policy: t('research.waitPolicy.' + snapshot.goalSummary.waitingFor.policy),
                  count: snapshot.goalSummary.waitingFor.taskIds.length,
                }) }}
              </span>
              <span v-if="snapshot.goalSummary.waitingFor?.taskIds.length" class="research-inline-meta">
                <strong>{{ t('research.waitingTaskIds') }}:</strong>
                <code v-for="taskId in snapshot.goalSummary.waitingFor.taskIds" :key="taskId">
                  {{ taskId }}
                </code>
              </span>
            </dd>
          </div>
          <div class="research-field">
            <dt>{{ t('research.focus') }}</dt>
            <dd>
              <span>
                <strong>{{ currentLine?.title ?? snapshot.currentLineSlug ?? t('research.none') }}</strong>
                <code v-if="snapshot.currentLineSlug">{{ snapshot.currentLineSlug }}</code>
              </span>
              <span>{{ focusedQuestion?.wording ?? t('research.none') }}</span>
              <span v-if="focusedQuestion?.assessment" class="research-muted">
                {{ focusedQuestion.assessment }}
              </span>
              <span v-if="focusedQuestion?.nextBoundedAction">
                <strong>{{ t('research.boundedNextAction') }}:</strong>
                {{ focusedQuestion.nextBoundedAction }}
              </span>
              <span v-if="snapshot.currentFocus?.boundedAction">
                <strong>{{ t('research.focusBoundedAction') }}:</strong>
                {{ snapshot.currentFocus.boundedAction }}
              </span>
              <span v-if="snapshot.currentFocus" class="research-inline-meta research-muted">
                <span>{{ t('research.questionId') }} <code>{{ snapshot.currentFocus.questionId }}</code></span>
                <span>{{ t('research.revision', { count: snapshot.currentFocus.revision }) }}</span>
              </span>
            </dd>
          </div>
          <div class="research-field">
            <dt>{{ t('research.nextAction') }}</dt>
            <dd>
              <span>{{ nextSlot?.text ?? t('research.nextNotRecorded') }}</span>
              <span v-if="snapshot.effectiveNextStep" class="research-inline-meta">
                <Badge
                  size="sm"
                  :variant="snapshot.effectiveNextStep.freshness === 'current' ? 'success' : 'warning'"
                >
                  {{ t('research.nextStepSource.' + snapshot.effectiveNextStep.source) }}
                </Badge>
                <span>{{ t('research.freshness.' + snapshot.effectiveNextStep.freshness) }}</span>
              </span>
              <template v-if="snapshot.effectiveNextStep">
                <span class="research-muted">
                  {{ t('research.observedAt') }}: {{ formatTimestamp(snapshot.effectiveNextStep.observedAt) }}
                </span>
                <span
                  v-if="Object.values(snapshot.effectiveNextStep.derivedFrom).some(Boolean)"
                  class="research-inline-meta research-muted"
                >
                  <strong>{{ t('research.derivedFrom') }}:</strong>
                  <span v-if="snapshot.effectiveNextStep.derivedFrom.actionId">
                    {{ t('research.actionId') }} <code>{{ snapshot.effectiveNextStep.derivedFrom.actionId }}</code>
                  </span>
                  <span v-if="snapshot.effectiveNextStep.derivedFrom.entryId">
                    {{ t('research.entryId') }} <code>{{ snapshot.effectiveNextStep.derivedFrom.entryId }}</code>
                  </span>
                  <span v-if="snapshot.effectiveNextStep.derivedFrom.questionId">
                    {{ t('research.questionId') }} <code>{{ snapshot.effectiveNextStep.derivedFrom.questionId }}</code>
                  </span>
                  <span v-if="snapshot.effectiveNextStep.derivedFrom.lineSlug">
                    {{ t('research.lineId') }} <code>{{ snapshot.effectiveNextStep.derivedFrom.lineSlug }}</code>
                  </span>
                </span>
              </template>
            </dd>
          </div>
          <div v-if="expandedRecord.status" class="research-field">
            <dt>{{ t('research.researchStatus') }}</dt>
            <dd>
              <span class="research-inline-meta">
                <Badge
                  size="sm"
                  :variant="expandedRecord.status.health === 'ok' ? 'success' : expandedRecord.status.health === 'blocked' ? 'warning' : 'info'"
                >
                  {{ t('research.statusHealth.' + expandedRecord.status.health) }}
                </Badge>
                <span>{{ t('research.sciencePhase.' + expandedRecord.status.phase) }}</span>
              </span>
              <span v-if="expandedRecord.status.currentLineSlug">
                <strong>{{ t('research.currentLine') }}:</strong>
                <code>{{ expandedRecord.status.currentLineSlug }}</code>
              </span>
              <span v-if="expandedRecord.status.currentQuestionId">
                <strong>{{ t('research.currentQuestion') }}:</strong>
                <code>{{ expandedRecord.status.currentQuestionId }}</code>
              </span>
              <span v-if="expandedRecord.status.currentActionId">
                <strong>{{ t('research.actionId') }}:</strong>
                <code>{{ expandedRecord.status.currentActionId }}</code>
              </span>
              <span v-if="expandedRecord.status.nextStep">
                <strong>{{ t('research.nextAction') }}:</strong>
                {{ expandedRecord.status.nextStep }}
              </span>
              <span
                v-for="(attention, index) in expandedRecord.status.attention"
                :key="index"
              >
                <strong>{{ t('research.attention') }}:</strong>
                {{ attention }}
              </span>
            </dd>
          </div>
        </dl>
      </section>

      <section class="research-section">
        <div class="research-section-head">
          <div>
            <span class="research-section-kicker">{{ t('research.execution') }}</span>
            <h4>{{ t('research.currentWork') }}</h4>
          </div>
          <Badge size="sm" variant="info">{{ t('research.sciencePhase.' + snapshot.phase) }}</Badge>
        </div>
        <dl class="research-fields">
          <div v-if="snapshot.recentStateChange" class="research-field">
            <dt>{{ t('research.recentChange') }}</dt>
            <dd>
              <span>{{ snapshot.recentStateChange.summary }}</span>
              <span class="research-muted">
                {{ t('research.sciencePhase.' + snapshot.recentStateChange.beforePhase) }}
                →
                {{ t('research.sciencePhase.' + snapshot.recentStateChange.afterPhase) }}
                · {{ formatTimestamp(snapshot.recentStateChange.changedAt) }}
              </span>
              <span v-if="snapshot.recentStateChange.actionId">
                <strong>{{ t('research.actionId') }}:</strong>
                <code>{{ snapshot.recentStateChange.actionId }}</code>
              </span>
            </dd>
          </div>
          <div v-if="snapshot.latestProgress" class="research-field research-feature-field">
            <dt>{{ t('research.progress') }}</dt>
            <dd>
              <strong>{{ snapshot.latestProgress.headline }}</strong>
              <span v-if="snapshot.latestProgress.question">
                <strong>{{ t('research.progressQuestion') }}:</strong>
                {{ snapshot.latestProgress.question }}
              </span>
              <span><strong>{{ t('research.motivation') }}:</strong> {{ snapshot.latestProgress.motivation }}</span>
              <span><strong>{{ t('research.workPerformed') }}:</strong> {{ snapshot.latestProgress.workPerformed }}</span>
              <span><strong>{{ t('research.result') }}:</strong> {{ snapshot.latestProgress.result }}</span>
              <span><strong>{{ t('research.mainlineImpact') }}:</strong> {{ snapshot.latestProgress.mainlineImpact }}</span>
              <span v-if="snapshot.latestProgress.nextAction">
                <strong>{{ t('research.nextAction') }}:</strong>
                {{ snapshot.latestProgress.nextAction }}
              </span>
              <span v-if="snapshot.latestProgress.humanDecision">
                <strong>{{ t('research.humanDecision') }}:</strong>
                {{ snapshot.latestProgress.humanDecision }}
              </span>
              <span v-if="snapshot.latestProgress.phaseChange" class="research-muted">
                {{ t('research.phaseChange') }}:
                {{ t('research.sciencePhase.' + snapshot.latestProgress.phaseChange.from) }}
                →
                {{ t('research.sciencePhase.' + snapshot.latestProgress.phaseChange.to) }}
              </span>
              <span class="research-muted">{{ formatTimestamp(snapshot.latestProgress.recordedAt) }}</span>
            </dd>
          </div>
          <div v-else class="research-field">
            <dt>{{ t('research.progress') }}</dt>
            <dd class="research-muted">{{ t('research.noProgress') }}</dd>
          </div>
          <div v-if="snapshot.currentAction" class="research-field">
            <dt>{{ t('research.currentAction') }}</dt>
            <dd>
              <span class="research-inline-meta">
                <code>{{ snapshot.currentAction.actionId }}</code>
                <Badge size="sm">{{ t('research.actionKind.' + snapshot.currentAction.kind) }}</Badge>
                <Badge size="sm">{{ t('research.actionStatus.' + snapshot.currentAction.status) }}</Badge>
              </span>
              <strong>{{ snapshot.currentAction.purpose }}</strong>
              <span
                v-if="snapshot.currentAction.questionId || snapshot.currentAction.lineSlug"
                class="research-inline-meta research-muted"
              >
                <span v-if="snapshot.currentAction.questionId">
                  {{ t('research.questionId') }} <code>{{ snapshot.currentAction.questionId }}</code>
                </span>
                <span v-if="snapshot.currentAction.lineSlug">
                  {{ t('research.lineId') }} <code>{{ snapshot.currentAction.lineSlug }}</code>
                </span>
              </span>
              <span v-if="snapshot.currentAction.expectedEvidence.length > 0">
                <strong>{{ t('research.expectedEvidence') }}:</strong>
                {{ snapshot.currentAction.expectedEvidence.join(' · ') }}
              </span>
              <span><strong>{{ t('research.stopCondition') }}:</strong> {{ snapshot.currentAction.stopCondition }}</span>
              <span v-if="snapshot.currentAction.allowedToolKinds.length > 0">
                <strong>{{ t('research.allowedTools') }}:</strong>
                {{ snapshot.currentAction.allowedToolKinds.join(' · ') }}
              </span>
              <span>
                <strong>{{ t('research.requiresApproval') }}:</strong>
                {{ snapshot.currentAction.requiresHumanApproval ? t('research.yes') : t('research.no') }}
              </span>
              <span v-if="snapshot.currentAction.retryOfEntryId">
                <strong>{{ t('research.retryOf') }}:</strong>
                <code>{{ snapshot.currentAction.retryOfEntryId }}</code>
              </span>
              <span class="research-muted">
                {{ t('research.createdAt') }}: {{ formatTimestamp(snapshot.currentAction.createdAt) }}
              </span>
              <span v-if="snapshot.currentAction.completedAt !== undefined" class="research-muted">
                {{ t('research.completedAt') }}: {{ formatTimestamp(snapshot.currentAction.completedAt) }}
              </span>
            </dd>
          </div>
          <div v-if="expandedRecord.plan" class="research-field research-feature-field">
            <dt>{{ t('research.researchPlan') }}</dt>
            <dd>
              <span class="research-inline-meta">
                <code>{{ expandedRecord.plan.planId }}</code>
                <Badge size="sm">{{ t('research.planStatus.' + expandedRecord.plan.status) }}</Badge>
                <span>{{ t('research.researchRevision', { count: expandedRecord.plan.researchRevision }) }}</span>
              </span>
              <strong>{{ expandedRecord.plan.objective }}</strong>
              <span class="research-inline-meta research-plan-refs">
                <span v-if="expandedRecord.plan.programId">
                  {{ t('research.programId') }} <code>{{ expandedRecord.plan.programId }}</code>
                </span>
                <span v-if="expandedRecord.plan.periodId">
                  {{ t('research.periodId') }} <code>{{ expandedRecord.plan.periodId }}</code>
                </span>
                <span v-if="expandedRecord.plan.lineSlug">
                  {{ t('research.lineId') }} <code>{{ expandedRecord.plan.lineSlug }}</code>
                </span>
                <span v-if="expandedRecord.plan.questionId">
                  {{ t('research.questionId') }} <code>{{ expandedRecord.plan.questionId }}</code>
                </span>
                <span v-if="expandedRecord.plan.lineRevision !== undefined">
                  {{ t('research.lineRevision', { count: expandedRecord.plan.lineRevision }) }}
                </span>
                <span v-if="expandedRecord.plan.questionRevision !== undefined">
                  {{ t('research.questionRevision', { count: expandedRecord.plan.questionRevision }) }}
                </span>
              </span>
              <div v-if="expandedRecord.plan.steps.length > 0">
                <strong>{{ t('research.planSteps') }}:</strong>
                <ol class="research-record-list">
                  <li v-for="(step, index) in expandedRecord.plan.steps" :key="index">{{ step }}</li>
                </ol>
              </div>
              <div v-if="expandedRecord.plan.expectedEvidence.length > 0">
                <strong>{{ t('research.expectedEvidence') }}:</strong>
                <ul class="research-record-list">
                  <li v-for="(evidence, index) in expandedRecord.plan.expectedEvidence" :key="index">
                    {{ evidence }}
                  </li>
                </ul>
              </div>
              <span><strong>{{ t('research.stopCondition') }}:</strong> {{ expandedRecord.plan.stopCondition }}</span>
              <span v-if="expandedRecord.plan.resolution">
                <strong>{{ t('research.planResolution') }}:</strong>
                <code>{{ expandedRecord.plan.resolution.planId }}</code>
                · {{ t('research.planRevision', { count: expandedRecord.plan.resolution.planRevision }) }}
                · {{ t('research.planOutcome.' + expandedRecord.plan.resolution.outcome) }}
                <template v-if="expandedRecord.plan.resolution.selectedLabel">
                  · {{ expandedRecord.plan.resolution.selectedLabel }}
                </template>
              </span>
            </dd>
          </div>
          <div
            v-for="run in expandedRuns"
            :key="run.actionId + ':' + run.campaign + ':' + run.jobId"
            class="research-field"
          >
            <dt>{{ t('research.currentRun') }}</dt>
            <dd>
              <span class="research-inline-meta">
                <strong>{{ run.campaign }}</strong>
                <code>{{ run.jobId }}</code>
                <Badge size="sm" variant="info">{{ t('research.runStage.' + run.stage) }}</Badge>
                <Badge size="sm">{{ t('research.schedulerState.' + run.schedulerState) }}</Badge>
              </span>
              <span><strong>{{ t('research.actionId') }}:</strong> <code>{{ run.actionId }}</code></span>
              <span>{{ t('research.lastObserved') }}: {{ formatTimestamp(run.lastObservedAt) }}</span>
              <span v-if="run.nextCheckAt !== undefined">
                {{ t('research.nextCheck') }}: {{ formatTimestamp(run.nextCheckAt) }}
              </span>
              <span v-if="run.terminalState">
                {{ t('research.terminalState') }}: {{ run.terminalState }}
              </span>
              <span v-if="run.sourcePin"><strong>{{ t('research.sourcePin') }}:</strong> <code>{{ run.sourcePin }}</code></span>
              <span v-if="run.binaryPin"><strong>{{ t('research.binaryPin') }}:</strong> <code>{{ run.binaryPin }}</code></span>
              <span v-if="run.artifactRefs.length > 0">
                <strong>{{ t('research.artifacts') }}:</strong>
                {{ run.artifactRefs.join(' · ') }}
              </span>
            </dd>
          </div>
        </dl>
      </section>

      <section
        v-if="snapshot.humanGate || snapshot.alerts.length > 0 || snapshot.aitpMaintenance?.degradedReason || snapshot.aitpHealth.lastError"
        class="research-section"
      >
        <div class="research-section-head">
          <div>
            <span class="research-section-kicker">{{ t('research.decisions') }}</span>
            <h4>{{ t('research.attention') }}</h4>
          </div>
          <Badge size="sm" :variant="orderedAlerts.length > 0 ? 'warning' : 'neutral'">
            {{ t('research.counts.alerts', { count: orderedAlerts.length }) }}
          </Badge>
        </div>
        <div class="research-notices">
          <Banner
            v-if="snapshot.humanGate"
            :variant="snapshot.humanGate.resolvedAt === undefined ? 'warning' : 'info'"
          >
            <span class="research-notice-copy">
              <strong>{{ t('research.humanGate') }}</strong>
              <span>{{ snapshot.humanGate.prompt }}</span>
              <span class="research-muted">
                {{ t('research.humanGateKind.' + snapshot.humanGate.kind) }}
                ·
                {{ snapshot.humanGate.resolvedAt === undefined ? t('research.open') : t('research.resolved') }}
              </span>
              <span class="research-inline-meta research-muted">
                <span>{{ t('research.gateId') }} <code>{{ snapshot.humanGate.gateId }}</code></span>
                <span v-if="snapshot.humanGate.actionId">
                  {{ t('research.actionId') }} <code>{{ snapshot.humanGate.actionId }}</code>
                </span>
                <span v-if="snapshot.humanGate.questionId">
                  {{ t('research.questionId') }} <code>{{ snapshot.humanGate.questionId }}</code>
                </span>
              </span>
              <span class="research-muted">
                {{ t('research.createdAt') }}: {{ formatTimestamp(snapshot.humanGate.createdAt) }}
                <template v-if="snapshot.humanGate.resolvedAt !== undefined">
                  · {{ t('research.resolvedAt') }}: {{ formatTimestamp(snapshot.humanGate.resolvedAt) }}
                </template>
              </span>
              <span v-if="snapshot.humanGate.resolution">
                <strong>{{ t('research.resolution') }}:</strong>
                {{ snapshot.humanGate.resolution }}
              </span>
            </span>
          </Banner>
          <Banner v-if="snapshot.aitpMaintenance?.degradedReason" variant="warning">
            <span class="research-notice-copy">
              <strong>{{ t('research.degradedReason') }}</strong>
              <span>{{ t('research.degradedReasonValue.' + snapshot.aitpMaintenance.degradedReason) }}</span>
            </span>
          </Banner>
          <Banner v-if="snapshot.aitpHealth.lastError" variant="warning">
            <span class="research-notice-copy">
              <strong>{{ t('research.adapterHealth') }}</strong>
              <span>{{ snapshot.aitpHealth.lastError }}</span>
            </span>
          </Banner>
          <Banner
            v-for="alert in orderedAlerts"
            :key="alert.fingerprint"
            :variant="alertVariant(alert)"
          >
            <span class="research-notice-copy">
              <span class="research-inline-meta">
                <strong>{{ t('research.alertKind.' + alert.kind) }}</strong>
                <Badge size="sm">{{ t('research.alertState.' + alertState(alert)) }}</Badge>
                <Badge size="sm">
                  {{ t('research.alertClassification.' + presentResearchAlertClassification(alert)) }}
                </Badge>
              </span>
              <span>{{ alert.message }}</span>
              <span v-if="alert.reason"><strong>{{ t('research.reason') }}:</strong> {{ alert.reason }}</span>
              <span class="research-inline-meta research-muted">
                <span>{{ t('research.fingerprint') }} <code>{{ alert.fingerprint }}</code></span>
                <span v-if="alert.source">{{ t('research.source') }} {{ alert.source }}</span>
                <span v-if="alert.questionId">{{ t('research.questionId') }} <code>{{ alert.questionId }}</code></span>
                <span v-if="alert.lineSlug">{{ t('research.lineId') }} <code>{{ alert.lineSlug }}</code></span>
                <span v-if="alert.relatedEntryId">{{ t('research.entryId') }} <code>{{ alert.relatedEntryId }}</code></span>
                <span v-if="alert.workstream">{{ t('research.workstream') }} <code>{{ alert.workstream }}</code></span>
                <span v-if="alert.retryOfEntryId">{{ t('research.retryOf') }} <code>{{ alert.retryOfEntryId }}</code></span>
              </span>
              <span class="research-muted">
                {{ t('research.createdAt') }}: {{ formatTimestamp(alert.createdAt) }}
                <template v-if="alert.acknowledgedAt !== undefined">
                  · {{ t('research.acknowledgedAt') }}: {{ formatTimestamp(alert.acknowledgedAt) }}
                </template>
              </span>
            </span>
          </Banner>
        </div>
      </section>

      <section class="research-section">
        <div class="research-section-head">
          <div>
            <span class="research-section-kicker">{{ t('research.structure') }}</span>
            <h4>{{ t('research.researchMap') }}</h4>
          </div>
          <div class="research-counts">
            <Badge size="sm">{{ t('research.counts.open', { count: snapshot.openQuestionCount }) }}</Badge>
            <Badge size="sm" variant="info">{{ t('research.counts.active', { count: snapshot.activeQuestionCount }) }}</Badge>
            <Badge size="sm" :variant="snapshot.blockedQuestionCount > 0 ? 'warning' : 'neutral'">
              {{ t('research.counts.blocked', { count: snapshot.blockedQuestionCount }) }}
            </Badge>
          </div>
        </div>
        <div class="research-map-grid">
          <div class="research-collection">
            <h5>{{ t('research.lines') }} <span>{{ snapshot.lines.length }}</span></h5>
            <p v-if="orderedLines.length === 0" class="research-empty">{{ t('research.noLines') }}</p>
            <article
              v-for="line in orderedLines"
              v-else
              :key="line.slug"
              class="research-item"
              :class="{ current: line.slug === snapshot.currentLineSlug }"
            >
              <div class="research-item-head">
                <strong>{{ line.title }}</strong>
                <Badge size="sm" :variant="line.status === 'blocked' ? 'warning' : 'neutral'">
                  {{ t('research.lineStatus.' + line.status) }}
                </Badge>
                <code>{{ line.slug }}</code>
              </div>
              <p v-if="line.objective"><strong>{{ t('research.objective') }}:</strong> {{ line.objective }}</p>
              <p v-if="line.assessment" class="research-muted">{{ line.assessment }}</p>
              <p class="research-muted">
                {{ t('research.revision', { count: line.revision }) }}
                · {{ t('research.createdAt') }} {{ formatTimestamp(line.createdAt) }}
              </p>
            </article>
          </div>
          <div class="research-collection">
            <h5>{{ t('research.questions') }} <span>{{ snapshot.questions.length }}</span></h5>
            <p v-if="orderedQuestions.length === 0" class="research-empty">{{ t('research.noQuestions') }}</p>
            <article
              v-for="question in orderedQuestions"
              v-else
              :key="question.id"
              class="research-item"
              :class="{ current: isFocusedQuestion(question) }"
            >
              <div class="research-item-head">
                <strong>{{ question.wording }}</strong>
                <code>{{ question.id }}</code>
              </div>
              <div class="research-tags">
                <Badge size="sm">{{ t('research.workflow.' + question.workflow) }}</Badge>
                <Badge size="sm" variant="info">{{ t('research.epistemic.' + question.epistemic) }}</Badge>
                <Badge size="sm">{{ t('research.persistence.' + question.persistence) }}</Badge>
                <span>{{ t('research.priority', { count: question.priority }) }}</span>
                <span>{{ t('research.lineId') }} <code>{{ question.lineSlug }}</code></span>
                <span>{{ t('research.revision', { count: question.revision }) }}</span>
              </div>
              <p v-if="question.assessment" class="research-muted">{{ question.assessment }}</p>
              <p v-if="question.neededEvidence.length > 0">
                <strong>{{ t('research.neededEvidence') }}:</strong>
                {{ question.neededEvidence.join(' · ') }}
              </p>
              <p v-if="question.evidenceRefs.length > 0">
                <strong>{{ t('research.evidenceRefs') }}:</strong>
                {{ question.evidenceRefs.join(' · ') }}
              </p>
              <p v-if="question.falsifierRefs.length > 0">
                <strong>{{ t('research.falsifierRefs') }}:</strong>
                {{ question.falsifierRefs.join(' · ') }}
              </p>
              <p v-if="question.nextBoundedAction">
                <strong>{{ t('research.boundedNextAction') }}:</strong>
                {{ question.nextBoundedAction }}
              </p>
            </article>
          </div>
        </div>
      </section>

      <section class="research-section">
        <div class="research-section-head">
          <div>
            <span class="research-section-kicker">{{ t('research.grounding') }}</span>
            <h4>{{ t('research.evidenceAndUncertainty') }}</h4>
          </div>
        </div>
        <dl class="research-fields">
          <div class="research-field">
            <dt>{{ t('research.focusedQuestionEvidence') }}</dt>
            <dd v-if="focusedQuestion">
              <span v-if="focusedQuestion.neededEvidence.length > 0">
                <strong>{{ t('research.neededEvidence') }}:</strong>
                {{ focusedQuestion.neededEvidence.join(' · ') }}
              </span>
              <span v-if="focusedQuestion.evidenceRefs.length > 0">
                <strong>{{ t('research.evidenceRefs') }}:</strong>
                {{ focusedQuestion.evidenceRefs.join(' · ') }}
              </span>
              <span v-if="focusedQuestion.falsifierRefs.length > 0">
                <strong>{{ t('research.falsifierRefs') }}:</strong>
                {{ focusedQuestion.falsifierRefs.join(' · ') }}
              </span>
              <span
                v-if="focusedQuestion.neededEvidence.length === 0 && focusedQuestion.evidenceRefs.length === 0 && focusedQuestion.falsifierRefs.length === 0"
                class="research-muted"
              >
                {{ t('research.noneRecorded') }}
              </span>
            </dd>
            <dd v-else class="research-muted">{{ t('research.none') }}</dd>
          </div>
          <div v-if="snapshot.latestProgress" class="research-field">
            <dt>{{ t('research.progressEvidence') }}</dt>
            <dd>
              <span v-if="snapshot.latestProgress.uncertainties.length > 0">
                <strong>{{ t('research.uncertainties') }}:</strong>
                {{ snapshot.latestProgress.uncertainties.join(' · ') }}
              </span>
              <template v-if="snapshot.latestProgress.detail">
                <span v-if="snapshot.latestProgress.detail.assumptions?.length">
                  <strong>{{ t('research.assumptions') }}:</strong>
                  {{ snapshot.latestProgress.detail.assumptions.join(' · ') }}
                </span>
                <span v-if="snapshot.latestProgress.detail.derivation">
                  <strong>{{ t('research.derivation') }}:</strong>
                  {{ snapshot.latestProgress.detail.derivation }}
                </span>
                <span v-if="snapshot.latestProgress.detail.tests?.length">
                  <strong>{{ t('research.tests') }}:</strong>
                  {{ snapshot.latestProgress.detail.tests.join(' · ') }}
                </span>
                <span v-if="snapshot.latestProgress.detail.observations?.length">
                  <strong>{{ t('research.observations') }}:</strong>
                  {{ snapshot.latestProgress.detail.observations.join(' · ') }}
                </span>
                <span v-if="snapshot.latestProgress.detail.sources?.length">
                  <strong>{{ t('research.sources') }}:</strong>
                  {{ snapshot.latestProgress.detail.sources.join(' · ') }}
                </span>
                <span v-if="snapshot.latestProgress.detail.limitations?.length">
                  <strong>{{ t('research.limitations') }}:</strong>
                  {{ snapshot.latestProgress.detail.limitations.join(' · ') }}
                </span>
                <span v-if="snapshot.latestProgress.detail.artifactRefs?.length">
                  <strong>{{ t('research.artifacts') }}:</strong>
                  {{ snapshot.latestProgress.detail.artifactRefs.join(' · ') }}
                </span>
                <span v-if="snapshot.latestProgress.detail.detailHint" class="research-muted">
                  {{ snapshot.latestProgress.detail.detailHint }}
                </span>
              </template>
              <span
                v-if="snapshot.latestProgress.uncertainties.length === 0 && !snapshot.latestProgress.detail"
                class="research-muted"
              >
                {{ t('research.noneRecorded') }}
              </span>
            </dd>
          </div>
          <div v-else class="research-field">
            <dt>{{ t('research.progressEvidence') }}</dt>
            <dd class="research-muted">{{ t('research.noProgress') }}</dd>
          </div>
        </dl>
      </section>

      <section class="research-section">
        <div class="research-section-head">
          <div>
            <span class="research-section-kicker">{{ t('research.provenance') }}</span>
            <h4>{{ t('research.persistenceAndHealth') }}</h4>
          </div>
          <Badge
            :variant="snapshot.aitpHealth.phase === 'ready' ? 'success' : snapshot.aitpHealth.phase === 'degraded' ? 'warning' : 'info'"
            size="sm"
            dot
          >
            {{ t('research.phase.' + snapshot.aitpHealth.phase) }}
          </Badge>
        </div>
        <div class="research-persistence-grid">
          <div class="research-collection">
            <h5>{{ t('research.checkpoints') }}</h5>
            <dl class="research-fields">
              <div class="research-field">
                <dt>{{ t('research.pendingCheckpoint') }}</dt>
                <dd v-if="snapshot.pendingCheckpoint">
                  <span class="research-inline-meta">
                    <code>{{ snapshot.pendingCheckpoint.checkpointId }}</code>
                    <Badge size="sm">{{ t('research.persistence.' + snapshot.pendingCheckpoint.persistence) }}</Badge>
                  </span>
                  <span v-if="snapshot.pendingCheckpoint.committedEntryId">
                    <strong>{{ t('research.committedEntryId') }}:</strong>
                    <code>{{ snapshot.pendingCheckpoint.committedEntryId }}</code>
                  </span>
                  <span
                    v-if="snapshot.pendingCheckpoint.questionId || snapshot.pendingCheckpoint.lineSlug"
                    class="research-inline-meta research-muted"
                  >
                    <span v-if="snapshot.pendingCheckpoint.questionId">
                      {{ t('research.questionId') }} <code>{{ snapshot.pendingCheckpoint.questionId }}</code>
                    </span>
                    <span v-if="snapshot.pendingCheckpoint.questionRevision !== undefined">
                      {{ t('research.questionRevision', { count: snapshot.pendingCheckpoint.questionRevision }) }}
                    </span>
                    <span v-if="snapshot.pendingCheckpoint.lineSlug">
                      {{ t('research.lineId') }} <code>{{ snapshot.pendingCheckpoint.lineSlug }}</code>
                    </span>
                  </span>
                  <span v-if="snapshot.pendingCheckpoint.assessment">{{ snapshot.pendingCheckpoint.assessment }}</span>
                  <span v-if="snapshot.pendingCheckpoint.nextAction">
                    <strong>{{ t('research.nextAction') }}:</strong>
                    {{ snapshot.pendingCheckpoint.nextAction }}
                  </span>
                  <span><strong>{{ t('research.idempotencyKey') }}:</strong> <code>{{ snapshot.pendingCheckpoint.idempotencyKey }}</code></span>
                  <span class="research-muted">
                    {{ t('research.createdAt') }}: {{ formatTimestamp(snapshot.pendingCheckpoint.createdAt) }}
                  </span>
                  <span
                    v-for="line in checkpointReceiptLines(snapshot.pendingCheckpoint.receipt)"
                    :key="line.key"
                  >
                    <strong>{{ line.label }}:</strong> <code>{{ line.value }}</code>
                  </span>
                </dd>
                <dd v-else class="research-muted">{{ t('research.none') }}</dd>
              </div>
              <div class="research-field">
                <dt>{{ t('research.committedCheckpoint') }}</dt>
                <dd v-if="snapshot.latestCommittedCheckpoint">
                  <span><strong>{{ t('research.checkpointId') }}:</strong> <code>{{ snapshot.latestCommittedCheckpoint.checkpointId }}</code></span>
                  <span v-if="snapshot.latestCommittedCheckpoint.entryId">
                    <strong>{{ t('research.entryId') }}:</strong>
                    <code>{{ snapshot.latestCommittedCheckpoint.entryId }}</code>
                  </span>
                  <span>{{ t('research.committedAt') }}: {{ formatTimestamp(snapshot.latestCommittedCheckpoint.committedAt) }}</span>
                  <span
                    v-for="line in checkpointReceiptLines(snapshot.latestCommittedCheckpoint.receipt)"
                    :key="line.key"
                  >
                    <strong>{{ line.label }}:</strong> <code>{{ line.value }}</code>
                  </span>
                </dd>
                <dd v-else class="research-muted">{{ t('research.none') }}</dd>
              </div>
              <div v-if="snapshot.committedCheckpointHistory?.length" class="research-field">
                <dt>{{ t('research.committedHistory') }}</dt>
                <dd>
                  <div
                    v-for="checkpoint in snapshot.committedCheckpointHistory"
                    :key="checkpoint.checkpointId + ':' + checkpoint.committedAt"
                    class="research-history-entry"
                  >
                    <span class="research-inline-meta">
                      <span>{{ t('research.checkpointId') }} <code>{{ checkpoint.checkpointId }}</code></span>
                      <span v-if="checkpoint.entryId">{{ t('research.entryId') }} <code>{{ checkpoint.entryId }}</code></span>
                      <span>{{ formatTimestamp(checkpoint.committedAt) }}</span>
                    </span>
                    <span
                      v-for="line in checkpointReceiptLines(checkpoint.receipt)"
                      :key="line.key"
                    >
                      <strong>{{ line.label }}:</strong> <code>{{ line.value }}</code>
                    </span>
                  </div>
                </dd>
              </div>
            </dl>
          </div>

          <div class="research-collection">
            <h5>{{ t('research.adapterHealth') }}</h5>
            <dl class="research-fields">
              <div class="research-field">
                <dt>{{ t('research.adapter') }}</dt>
                <dd>
                  <span class="research-inline-meta">
                    <Badge
                      :variant="snapshot.aitpHealth.phase === 'ready' ? 'success' : snapshot.aitpHealth.phase === 'degraded' ? 'warning' : 'info'"
                      size="sm"
                    >
                      {{ t('research.phase.' + snapshot.aitpHealth.phase) }}
                    </Badge>
                    <span v-if="snapshot.aitpHealth.notInitialized">{{ t('research.notInitialized') }}</span>
                  </span>
                  <span v-if="snapshot.aitpHealth.contractVersion">{{ t('research.contractVersion') }} {{ snapshot.aitpHealth.contractVersion }}</span>
                  <span v-if="snapshot.aitpHealth.pluginVersion">{{ t('research.pluginVersion') }} {{ snapshot.aitpHealth.pluginVersion }}</span>
                  <span v-if="snapshot.aitpHealth.pythonVersion">Python {{ snapshot.aitpHealth.pythonVersion }}</span>
                  <span v-if="snapshot.aitpHealth.lastCheckAt !== undefined">{{ t('research.lastCheck') }}: {{ formatTimestamp(snapshot.aitpHealth.lastCheckAt) }}</span>
                </dd>
              </div>
              <div v-if="snapshot.aitpMaintenance" class="research-field">
                <dt>{{ t('research.maintenance') }}</dt>
                <dd>
                  <span class="research-inline-meta">
                    <Badge :variant="snapshot.aitpMaintenance.status === 'degraded' ? 'warning' : 'success'" size="sm">
                      {{ t('research.phase.' + snapshot.aitpMaintenance.status) }}
                    </Badge>
                    <span>{{ t('research.memoryStatus.' + snapshot.aitpMaintenance.memoryStatus) }}</span>
                  </span>
                  <span v-if="snapshot.aitpMaintenance.workstream">
                    <strong>{{ t('research.workstream') }}:</strong>
                    {{ snapshot.aitpMaintenance.workstream }}
                  </span>
                  <span v-if="snapshot.aitpMaintenance.topic">
                    <strong>{{ t('research.maintenanceTopic') }}:</strong>
                    {{ snapshot.aitpMaintenance.topic.title }}
                    · <code>{{ snapshot.aitpMaintenance.topic.id }}</code>
                    · {{ snapshot.aitpMaintenance.topic.goalText }}
                    · {{ snapshot.aitpMaintenance.topic.goalSource }}
                  </span>
                  <span>{{ t('research.refreshed') }}: {{ formatTimestamp(snapshot.aitpMaintenance.refreshedAt) }}</span>
                  <span>
                    <strong>{{ t('research.workingNote') }}:</strong>
                    {{ maintenanceFreshness }}
                    <template v-if="snapshot.aitpMaintenance.latestWorkingNoteAt !== undefined">
                      · {{ formatTimestamp(snapshot.aitpMaintenance.latestWorkingNoteAt) }}
                    </template>
                  </span>
                  <span>
                    <strong>{{ t('research.unresolvedFailures') }}:</strong>
                    {{ snapshot.aitpMaintenance.unresolvedFailureCount }}
                  </span>
                  <span v-if="snapshot.aitpMaintenance.nextAction">
                    <strong>{{ t('research.recordedHandoffNext') }}:</strong>
                    {{ snapshot.aitpMaintenance.nextAction }}
                  </span>
                  <span v-if="snapshot.aitpMaintenance.nextActionDetails" class="research-muted">
                    {{ snapshot.aitpMaintenance.nextActionDetails.text }}
                    · {{ snapshot.aitpMaintenance.nextActionDetails.authority }}
                    · {{ snapshot.aitpMaintenance.nextActionDetails.source }}
                    · <code>{{ snapshot.aitpMaintenance.nextActionDetails.entryId }}</code>
                    <template v-if="snapshot.aitpMaintenance.nextActionDetails.createdAt !== undefined">
                      · {{ formatTimestamp(snapshot.aitpMaintenance.nextActionDetails.createdAt) }}
                    </template>
                  </span>
                  <span>
                    <strong>{{ t('research.structuralCheck') }}:</strong>
                    {{ snapshot.aitpMaintenance.check.status }}
                    <template v-if="snapshot.aitpMaintenance.check.counts">
                      · {{ t('research.entryCount', { count: snapshot.aitpMaintenance.check.counts.entries }) }}
                      · {{ t('research.noteCount', { count: snapshot.aitpMaintenance.check.counts.notes }) }}
                      · {{ t('research.errorCount', { count: snapshot.aitpMaintenance.check.counts.errors }) }}
                      · {{ t('research.warningCount', { count: snapshot.aitpMaintenance.check.counts.warnings }) }}
                    </template>
                  </span>
                  <span v-if="snapshot.aitpMaintenance.warningSummaries.length > 0">
                    <strong>{{ t('research.warningCodes') }}:</strong>
                    {{ snapshot.aitpMaintenance.warningSummaries.map((warning) => warning.code).join(' · ') }}
                  </span>
                  <span v-if="snapshot.aitpMaintenance.check.findingCodes.length > 0">
                    <strong>{{ t('research.findingCodes') }}:</strong>
                    {{ snapshot.aitpMaintenance.check.findingCodes.join(' · ') }}
                  </span>
                </dd>
              </div>
            </dl>
            <div v-if="snapshot.aitpMaintenance?.unresolvedFailures.length" class="research-failures">
              <h6>{{ t('research.unresolvedFailureDetails') }}</h6>
              <article
                v-for="failure in snapshot.aitpMaintenance.unresolvedFailures"
                :key="failure.entryId"
                class="research-item"
              >
                <div class="research-item-head">
                  <code>{{ failure.entryId }}</code>
                  <Badge size="sm" variant="warning">{{ failure.kind }}</Badge>
                  <span>{{ failure.authority }}</span>
                </div>
                <p>{{ failure.summary }}</p>
                <p class="research-muted">
                  {{ [failure.workstream, failure.source].filter(Boolean).join(' · ') }}
                  <template v-if="failure.createdAt !== undefined">
                    · {{ formatTimestamp(failure.createdAt) }}
                  </template>
                </p>
              </article>
            </div>
          </div>
        </div>
      </section>
    </div>
  </Card>
</template>

<style scoped>
.research-board {
  margin: var(--space-2) var(--dock-inline-right) var(--space-1) var(--dock-inline-left);
}

.research-board :deep(.ui-card__body) {
  padding: 0;
}

.research-head {
  width: 100%;
  min-width: 0;
  display: grid;
  grid-template-columns: minmax(0, auto) minmax(0, 1fr) auto;
  align-items: center;
  gap: var(--space-3);
}

.research-identity,
.research-actions,
.research-inline-meta,
.research-counts,
.research-tags,
.research-item-head {
  min-width: 0;
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: var(--space-2);
}

.research-title {
  color: var(--color-text);
  font-weight: var(--weight-semibold);
}

.research-head-line {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.research-actions {
  justify-content: flex-end;
  flex-wrap: nowrap;
}

.research-compact {
  display: grid;
}

.research-compact-row {
  min-width: 0;
  display: grid;
  grid-template-columns: minmax(88px, 0.18fr) minmax(0, 1fr) auto;
  align-items: center;
  gap: var(--space-3);
  padding: var(--space-3) var(--space-4);
}

.research-compact-row + .research-compact-row,
.research-compact-attention + .research-compact-row,
.research-compact-row + .research-compact-attention {
  border-top: 1px solid var(--color-line);
}

.research-compact-goal {
  padding-block: var(--space-4);
}

.research-slot-label,
.research-section-kicker {
  color: var(--color-text-faint);
  font-family: var(--font-mono);
  font-size: var(--text-xs);
  font-weight: var(--weight-medium);
  letter-spacing: 0.04em;
  text-transform: uppercase;
}

.research-slot-value {
  min-width: 0;
  display: flex;
  align-items: center;
  gap: var(--space-2);
  overflow: hidden;
  color: var(--color-text);
  font-size: var(--text-sm);
  line-height: var(--leading-normal);
}

.research-slot-copy {
  min-width: 0;
  display: -webkit-box;
  overflow: hidden;
  overflow-wrap: anywhere;
  -webkit-box-orient: vertical;
  -webkit-line-clamp: 2;
}

.research-goal-value {
  display: -webkit-box;
  overflow: hidden;
  -webkit-box-orient: vertical;
  -webkit-line-clamp: 2;
  font-size: var(--text-base);
  font-weight: var(--weight-medium);
}

.research-compact-attention {
  margin: var(--space-2) var(--space-3);
}

.research-compact-attention :deep(.ui-banner__text) {
  min-width: 0;
  width: 100%;
  display: grid;
  grid-template-columns: minmax(88px, 0.18fr) minmax(0, 1fr) auto;
  align-items: center;
  gap: var(--space-3);
}

.research-attention-value,
.research-notice-copy {
  min-width: 0;
  display: grid;
  gap: var(--space-1);
  overflow-wrap: anywhere;
}

.research-attention-value {
  grid-template-columns: auto minmax(0, 1fr);
  color: var(--color-text);
  font-size: var(--text-sm);
}

.research-attention-value > span {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.research-expanded {
  max-height: min(68vh, 760px);
  overflow: auto;
  overscroll-behavior: contain;
}

.research-expanded:focus-visible {
  outline: none;
  box-shadow: var(--p-focus-ring-strong);
}

.research-section {
  min-width: 0;
  padding: var(--space-5) var(--space-4);
}

.research-section + .research-section {
  border-top: 1px solid var(--color-line);
}

.research-section-head {
  min-width: 0;
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: var(--space-4);
  margin-bottom: var(--space-4);
}

.research-section-head h4 {
  margin: var(--space-1) 0 0;
  color: var(--color-text);
  font-size: var(--text-lg);
  font-weight: var(--weight-semibold);
  line-height: var(--leading-tight);
}

.research-fields {
  min-width: 0;
  margin: 0;
}

.research-field {
  min-width: 0;
  display: grid;
  grid-template-columns: minmax(120px, 0.22fr) minmax(0, 1fr);
  gap: var(--space-4);
  padding: var(--space-3) 0;
  border-top: 1px solid var(--color-line);
}

.research-field:first-child {
  border-top: 0;
}

.research-feature-field dd {
  color: var(--color-text);
  font-size: var(--text-base);
}

.research-field dt {
  color: var(--color-text-faint);
  font-family: var(--font-mono);
  font-size: var(--text-xs);
  line-height: var(--leading-normal);
}

.research-field dd {
  min-width: 0;
  margin: 0;
  display: grid;
  gap: var(--space-2);
  color: var(--color-text-muted);
  font-size: var(--text-sm);
  line-height: var(--leading-normal);
  overflow-wrap: anywhere;
  white-space: pre-wrap;
}

.research-field dd strong,
.research-item strong,
.research-notice-copy strong {
  color: var(--color-text);
  font-weight: var(--weight-medium);
}

.research-plan-refs > span {
  display: inline-flex;
  align-items: center;
  gap: var(--space-1);
}

.research-record-list {
  margin: var(--space-2) 0 0;
  padding-inline-start: var(--space-5);
  display: grid;
  gap: var(--space-1);
  color: var(--color-text-muted);
}

.research-history-entry {
  display: grid;
  gap: var(--space-2);
  padding-block: var(--space-2);
}

.research-history-entry + .research-history-entry {
  border-top: 1px solid var(--color-line);
}

.research-notices {
  display: grid;
  gap: var(--space-2);
}

.research-notices :deep(.ui-banner) {
  align-items: flex-start;
}

.research-notices :deep(.ui-banner__text) {
  min-width: 0;
}

.research-map-grid,
.research-persistence-grid {
  min-width: 0;
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: var(--space-6);
}

.research-collection {
  min-width: 0;
}

.research-collection h5 {
  margin: 0 0 var(--space-2);
  color: var(--color-text);
  font-size: var(--text-sm);
  font-weight: var(--weight-medium);
}

.research-collection h5 span {
  color: var(--color-text-faint);
  font-family: var(--font-mono);
  font-size: var(--text-xs);
}

.research-item {
  min-width: 0;
  padding: var(--space-3) 0 var(--space-3) var(--space-3);
  border-top: 1px solid var(--color-line);
  border-left: 2px solid transparent;
}

.research-item.current {
  border-left-color: var(--color-accent);
}

.research-item p {
  margin: var(--space-2) 0 0;
  color: var(--color-text-muted);
  font-size: var(--text-sm);
  line-height: var(--leading-normal);
  overflow-wrap: anywhere;
  white-space: pre-wrap;
}

.research-item-head strong {
  min-width: min(220px, 100%);
  flex: 1;
  overflow-wrap: anywhere;
}

.research-tags {
  margin-top: var(--space-2);
  color: var(--color-text-faint);
  font-size: var(--text-xs);
}

.research-failures {
  margin-top: var(--space-4);
}

.research-failures h6 {
  margin: 0;
  color: var(--color-text);
  font-size: var(--text-sm);
  font-weight: var(--weight-medium);
}

.research-muted,
.research-empty {
  color: var(--color-text-faint);
}

.research-empty {
  margin: 0;
  padding: var(--space-3) 0;
  font-size: var(--text-sm);
}

code {
  color: var(--color-text-muted);
  font-family: var(--font-mono);
  font-size: var(--text-xs);
  overflow-wrap: anywhere;
}

.sr-only {
  position: absolute;
  width: 1px;
  height: 1px;
  padding: 0;
  margin: -1px;
  overflow: hidden;
  clip: rect(0, 0, 0, 0);
  white-space: nowrap;
  border: 0;
}

@media (max-width: 760px) {
  .research-head {
    grid-template-columns: minmax(0, 1fr) auto;
  }

  .research-head-line {
    display: none;
  }

  .research-compact-row,
  .research-compact-attention :deep(.ui-banner__text) {
    grid-template-columns: minmax(76px, 0.22fr) minmax(0, 1fr) auto;
    gap: var(--space-2);
  }

  .research-map-grid,
  .research-persistence-grid {
    grid-template-columns: 1fr;
  }
}

@media (max-width: 520px) {
  .research-head {
    display: flex;
    align-items: flex-start;
    flex-wrap: wrap;
  }

  .research-identity {
    flex: 1 1 100%;
  }

  .research-actions {
    width: 100%;
    justify-content: flex-end;
  }

  .research-compact-row,
  .research-compact-attention :deep(.ui-banner__text) {
    grid-template-columns: 72px minmax(0, 1fr);
  }

  .research-compact-row > :last-child:not(:nth-child(2)),
  .research-compact-attention :deep(.ui-banner__text) > :last-child:not(:nth-child(2)) {
    grid-column: 2;
    justify-self: start;
  }

  .research-attention-value {
    grid-template-columns: 1fr;
  }

  .research-field {
    grid-template-columns: minmax(92px, 0.28fr) minmax(0, 1fr);
    gap: var(--space-3);
  }

  .research-section {
    padding: var(--space-4) var(--space-3);
  }
}

@media (max-width: 640px) {
  .research-actions :deep(.ui-button) {
    min-height: 44px;
  }
}
</style>
