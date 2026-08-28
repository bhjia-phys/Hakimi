<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import type {
  ResearchCommand,
  ResearchLineStatus,
  ResearchQuestionEpistemic,
  ResearchQuestionWorkflow,
  ResearchStatusSnapshot,
} from '../../api/types';
import {
  researchManagerAckMatchesDraft,
  researchManagerDraftTarget,
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

type Section = 'line' | 'question' | 'checkpoint';
type EditorMode = 'create' | 'edit';

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

const lineDirty = ref(false);
const questionDirty = ref(false);
const checkpointDirty = ref(false);
const lineBaseRevision = ref<number | null>(null);
const questionBaseRevision = ref<number | null>(null);
let resettingLine = false;
let resettingQuestion = false;
let resettingCheckpoint = false;
let lineDraftVersion = 0;
let questionDraftVersion = 0;
let checkpointDraftVersion = 0;
let nextCommandId = 0;

const sectionOptions = computed(() => [
  { value: 'line', label: t('research.manager.sections.line') },
  { value: 'question', label: t('research.manager.sections.question') },
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
const lineStale = computed(() =>
  lineDirty.value
  && lineEditorMode.value === 'edit'
  && lineBaseRevision.value !== null
  && selectedLine.value !== undefined
  && selectedLine.value.revision !== lineBaseRevision.value,
);
const questionStale = computed(() =>
  questionDirty.value
  && questionEditorMode.value === 'edit'
  && questionBaseRevision.value !== null
  && selectedQuestion.value !== undefined
  && selectedQuestion.value.revision !== questionBaseRevision.value,
);
const modeActive = computed(() => props.snapshot !== null && props.snapshot.mode !== 'inactive');
const canSaveLine = computed(() => lineTitle.value.trim() !== ''
  && (lineEditorMode.value === 'edit' || lineSlug.value.trim() !== ''));
const canSaveQuestion = computed(() => selectedLineSlug.value !== '' && questionWording.value.trim() !== '');
const canCommitCheckpoint = computed(() =>
  props.snapshot?.pendingCheckpoint !== undefined && checkpointEntryId.value.trim() !== '',
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
  checkpointAssessment.value = '';
  checkpointNextAction.value = '';
  checkpointEntryId.value = '';
  checkpointDraftVersion++;
  checkpointDirty.value = false;
  resettingCheckpoint = false;
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
      return;
    }
    if (lineEditorMode.value === 'edit' && !lineDirty.value) resetLineForm();
    if (!lineQuestions.value.some((question) => question.id === selectedQuestionId.value)) {
      selectedQuestionId.value = preferredQuestionId();
      return;
    }
    if (questionEditorMode.value === 'edit' && !questionDirty.value) resetQuestionForm();
  },
);

watch(selectedLineSlug, () => {
  selectedQuestionId.value = preferredQuestionId();
  resetLineForm();
  resetQuestionForm();
});
watch(selectedQuestionId, resetQuestionForm);
watch(lineEditorMode, resetLineForm);
watch(questionEditorMode, resetQuestionForm);

function draftVersion(target: ResearchManagerDraftTarget): number {
  if (target.form === 'line') return lineDraftVersion;
  if (target.form === 'question') return questionDraftVersion;
  return checkpointDraftVersion;
}

function draftContext() {
  return {
    lineEditorMode: lineEditorMode.value,
    lineSlug: lineSlug.value,
    selectedLineSlug: selectedLineSlug.value,
    questionEditorMode: questionEditorMode.value,
    selectedQuestionId: selectedQuestionId.value,
    checkpointEntryId: checkpointEntryId.value,
  };
}

function emitManagerCommand(command: ResearchCommand): void {
  const target = researchManagerDraftTarget(command);
  emit('command', {
    id: ++nextCommandId,
    command,
    draft: target === null ? undefined : { target, version: draftVersion(target) },
  });
}

watch(
  () => props.commandAck,
  (ack) => {
    const draft = ack?.draft;
    if (!open.value || draft === undefined) return;
    if (!researchManagerAckMatchesDraft(draft, draftVersion(draft.target), draftContext())) return;
    if (draft.target.form === 'line') resetLineForm();
    else if (draft.target.form === 'question') resetQuestionForm();
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
  const snapshot = props.snapshot;
  const question = selectedQuestion.value;
  if (snapshot === null || question === undefined) return;
  emitManagerCommand({
    kind: 'set_focus',
    questionId: question.id,
    expectedRevision: snapshot.revision,
    boundedAction: optionalText(questionNextAction.value),
    reason: optionalText(questionReason.value),
  });
}

function emitQuestionTransition(
  kind: 'defer_question' | 'block_question' | 'close_question' | 'reopen_question',
): void {
  const snapshot = props.snapshot;
  const question = selectedQuestion.value;
  if (snapshot === null || question === undefined) return;
  emitManagerCommand({
    kind,
    questionId: question.id,
    expectedRevision: snapshot.revision,
    reason: optionalText(questionReason.value),
  });
}

function proposeCheckpoint(): void {
  const question = selectedQuestion.value;
  emitManagerCommand({
    kind: 'propose_checkpoint',
    questionId: question?.id,
    lineSlug: question === undefined ? optionalText(selectedLineSlug.value) : undefined,
    assessment: optionalText(checkpointAssessment.value),
    nextAction: optionalText(checkpointNextAction.value),
  });
}

function commitCheckpoint(): void {
  const checkpoint = props.snapshot?.pendingCheckpoint;
  const entryId = checkpointEntryId.value.trim();
  if (checkpoint === undefined || entryId === '') return;
  emitManagerCommand({
    kind: 'commit_checkpoint',
    checkpointId: checkpoint.checkpointId,
    entryId,
  });
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
              {{ t('research.manager.staleLine') }}
            </Banner>
            <Field v-if="lineEditorMode === 'create'" :label="t('research.manager.lineSlug')">
              <Input v-model="lineSlug" :placeholder="t('research.manager.lineSlugPlaceholder')" />
            </Field>
            <Field :label="t('research.manager.lineTitle')">
              <Input v-model="lineTitle" />
            </Field>
            <Field :label="t('research.manager.objective')">
              <Textarea v-model="lineObjective" :rows="2" />
            </Field>
            <Field :label="t('research.manager.assessment')">
              <Textarea v-model="lineAssessment" :rows="2" />
            </Field>
            <Field v-if="lineEditorMode === 'edit'" :label="t('research.manager.status')">
              <Select v-model="lineStatus">
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
              {{ t('research.manager.staleQuestion') }}
            </Banner>
            <Field v-if="questionEditorMode === 'edit'" :label="t('research.manager.question')">
              <Select v-model="selectedQuestionId" :disabled="lineQuestions.length === 0">
                <option v-for="question in lineQuestions" :key="question.id" :value="question.id">
                  {{ question.wording }}
                </option>
              </Select>
            </Field>
            <div v-if="questionEditorMode === 'edit' && !selectedQuestion" class="manager-empty">
              {{ t('research.noQuestions') }}
            </div>
            <template v-else>
              <Field :label="t('research.manager.wording')">
                <Textarea v-model="questionWording" :rows="2" />
              </Field>
              <div class="field-grid">
                <Field :label="t('research.manager.priority')">
                  <Input v-model="questionPriority" type="number" />
                </Field>
                <Field v-if="questionEditorMode === 'edit'" :label="t('research.manager.workflowLabel')">
                  <Select v-model="questionWorkflow">
                    <option value="open">{{ t('research.workflow.open') }}</option>
                    <option value="active">{{ t('research.workflow.active') }}</option>
                    <option value="deferred">{{ t('research.workflow.deferred') }}</option>
                    <option value="blocked">{{ t('research.workflow.blocked') }}</option>
                    <option value="closed">{{ t('research.workflow.closed') }}</option>
                    <option value="cancelled">{{ t('research.workflow.cancelled') }}</option>
                  </Select>
                </Field>
                <Field v-if="questionEditorMode === 'edit'" :label="t('research.manager.epistemicLabel')">
                  <Select v-model="questionEpistemic">
                    <option value="unknown">{{ t('research.epistemic.unknown') }}</option>
                    <option value="candidate">{{ t('research.epistemic.candidate') }}</option>
                    <option value="supported">{{ t('research.epistemic.supported') }}</option>
                    <option value="contradicted">{{ t('research.epistemic.contradicted') }}</option>
                    <option value="inconclusive">{{ t('research.epistemic.inconclusive') }}</option>
                  </Select>
                </Field>
              </div>
              <Field :label="t('research.manager.assessment')">
                <Textarea v-model="questionAssessment" :rows="2" />
              </Field>
              <Field :label="t('research.manager.neededEvidence')" :hint="t('research.manager.onePerLine')">
                <Textarea v-model="questionNeededEvidence" :rows="2" />
              </Field>
              <Field v-if="questionEditorMode === 'edit'" :label="t('research.manager.nextAction')">
                <Textarea v-model="questionNextAction" :rows="2" />
              </Field>
              <Field v-if="questionEditorMode === 'edit'" :label="t('research.manager.reason')">
                <Input v-model="questionReason" />
              </Field>
              <div class="form-actions">
                <Button :disabled="!canSaveQuestion" @click="saveQuestion">
                  {{ t('research.manager.saveQuestion') }}
                </Button>
                <Button
                  v-if="questionEditorMode === 'edit'"
                  variant="secondary"
                  :disabled="!selectedQuestion"
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
                <Button variant="ghost" size="sm" @click="emitQuestionTransition('defer_question')">
                  {{ t('research.manager.defer') }}
                </Button>
                <Button variant="ghost" size="sm" @click="emitQuestionTransition('block_question')">
                  {{ t('research.manager.block') }}
                </Button>
                <Button variant="ghost" size="sm" @click="emitQuestionTransition('close_question')">
                  {{ t('research.manager.close') }}
                </Button>
                <Button variant="ghost" size="sm" @click="emitQuestionTransition('reopen_question')">
                  {{ t('research.manager.reopen') }}
                </Button>
              </div>
            </template>
          </section>

          <section v-else class="editor-section">
            <h3>{{ t('research.manager.proposeCheckpoint') }}</h3>
            <p class="section-note">
              {{ selectedQuestion?.wording ?? selectedLine?.title ?? t('research.none') }}
            </p>
            <Field :label="t('research.manager.assessment')">
              <Textarea v-model="checkpointAssessment" :rows="3" />
            </Field>
            <Field :label="t('research.manager.nextAction')">
              <Textarea v-model="checkpointNextAction" :rows="2" />
            </Field>
            <div class="form-actions">
              <Button :disabled="selectedLineSlug === ''" @click="proposeCheckpoint">
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
              >
                <Input v-model="checkpointEntryId" :disabled="!snapshot?.pendingCheckpoint" />
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
