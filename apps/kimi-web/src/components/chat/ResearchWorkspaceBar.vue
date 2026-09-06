<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import type { ResearchStatusSnapshot } from '../../api/types';
import type { ResearchSessionLink } from '../../lib/researchWorkspace';
import Badge from '../ui/Badge.vue';
import Button from '../ui/Button.vue';
import Dialog from '../ui/Dialog.vue';
import Icon from '../ui/Icon.vue';
import Input from '../ui/Input.vue';
import Select from '../ui/Select.vue';
import ResearchOrbitMark from './ResearchOrbitMark.vue';

const props = defineProps<{
  snapshot?: ResearchStatusSnapshot | null;
  sessionId?: string;
  sessions: ResearchSessionLink[];
  policyDisabled?: boolean;
  toggleDisabled?: boolean;
  togglePending?: boolean;
}>();
const emit = defineEmits<{
  selectSession: [id: string];
  browseSessions: [];
  setPolicy: [policy: string];
  toggleMode: [];
}>();
const { t } = useI18n();
const open = ref(false);
const query = ref('');
const active = computed(() => !!props.snapshot && props.snapshot.mode !== 'inactive');
const lineTitle = computed(() => props.snapshot?.lines
  .find((line) => line.slug === props.snapshot?.currentLineSlug)?.title);
const matches = (session: ResearchSessionLink): boolean =>
  [session.title, session.workspace, session.line, session.id].join(' ').toLocaleLowerCase()
    .includes(query.value.trim().toLocaleLowerCase());
const known = computed(() => props.sessions.filter((session) =>
  session.mode !== undefined && session.mode !== 'inactive' && matches(session)));
const other = computed(() => props.sessions.filter((session) =>
  (session.mode === undefined || session.mode === 'inactive') && matches(session)));
const visibleOther = computed(() => other.value.slice(0, 20));
watch(() => props.sessionId, () => { open.value = false; });
watch(open, (value) => { if (!value) query.value = ''; });

function select(id: string): void {
  open.value = false;
  if (id !== props.sessionId) emit('selectSession', id);
}
</script>

<template>
  <header class="research-workspace-bar" :class="{ 'is-inactive': !active }" :aria-label="t('research.workspace.title')">
    <div v-if="active && snapshot" class="research-workspace-identity">
      <ResearchOrbitMark :dreaming="snapshot.planningPolicy === 'dreaming'" />
      <div class="research-workspace-heading">
        <div class="research-workspace-kicker">
          <span>{{ t('research.workspace.title') }}</span>
          <span v-if="snapshot.program" class="research-field-tag" :title="snapshot.program.topicId">{{ snapshot.program.topicId }}</span>
        </div>
        <span class="research-workspace-name" :title="lineTitle ?? snapshot.program?.title">
          {{ lineTitle ?? snapshot.program?.title ?? t('research.lineNotSelected') }}
        </span>
      </div>
    </div>
    <div class="research-workspace-controls">
      <Button :variant="active ? 'primary' : 'secondary'" size="md"
        :aria-pressed="snapshot ? active : undefined" :aria-label="t('research.workspace.toggle')"
        :title="toggleDisabled ? t('research.workspace.toggleBusy') : t('research.workspace.' + (active ? 'turnOff' : 'turnOn'))"
        :disabled="toggleDisabled" :loading="togglePending" @click="emit('toggleMode')">
        <Icon name="target" size="sm" />
        {{ t('research.title') }}
        <span>{{ t('research.workspace.' + (!snapshot ? 'unknown' : active ? 'enabled' : 'disabled')) }}</span>
      </Button>
      <Button variant="secondary" size="md" aria-haspopup="dialog" :aria-expanded="open" @click="open = true">
        <Icon name="list" size="sm" />
        {{ t('research.workspace.sessions') }}
      </Button>
      <Select
        v-if="active && snapshot"
        :key="`${sessionId}:${snapshot.planningPolicy}:${policyDisabled}`"
        class="research-policy-select"
        size="sm"
        :aria-label="t('research.planningPolicy')"
        :title="policyDisabled ? t('research.workspace.policyBusy') : t('research.planningPolicyDescription.' + snapshot.planningPolicy) + ' ' + t('research.workspace.policyBoundary')"
        :model-value="snapshot.planningPolicy"
        :disabled="policyDisabled"
        @update:model-value="emit('setPolicy', $event)"
      >
        <option value="collaborative">{{ t('research.planningPolicyValue.collaborative') }}</option>
        <option value="dreaming">{{ t('research.planningPolicyValue.dreaming') }}</option>
      </Select>
    </div>
  </header>

  <Dialog v-model:open="open" :title="t('research.workspace.sessions')"
    :description="t('research.workspace.navigationOnly')" size="lg" initial-focus="input">
    <template #head>
      <div class="research-switcher-heading">
        <ResearchOrbitMark :dreaming="snapshot?.planningPolicy === 'dreaming'" />
        <div class="research-workspace-heading">
          <span class="research-workspace-kicker">{{ t('research.workspace.navigation') }}</span>
          <h2>{{ t('research.workspace.sessions') }}</h2>
          <p class="research-session-hint">{{ t('research.workspace.navigationOnly') }}</p>
        </div>
      </div>
    </template>
    <div class="research-session-switcher">
      <Input v-model="query" :aria-label="t('research.workspace.search')" :placeholder="t('research.workspace.search')" />
      <p class="research-session-hint">{{ t('research.workspace.observedOnly') }}</p>
      <nav class="research-session-list" :aria-label="t('research.workspace.observed')">
        <Button v-for="session in known" :key="session.id" variant="ghost" class="research-session-row"
          :aria-current="session.id === sessionId ? 'page' : undefined" :disabled="session.id === sessionId" @click="select(session.id)">
          <Icon :name="session.id === sessionId ? 'target' : 'message'" size="md" />
          <span class="research-session-copy">
            <span>{{ session.line ?? session.title }}</span>
            <span v-if="session.line" class="research-session-hint">{{ session.title }}</span>
            <span class="research-session-path" :title="session.workspace + ' · ' + session.id">{{ session.workspace }} · {{ session.id }}</span>
          </span>
          <span class="research-session-badges">
            <Badge v-if="session.id === sessionId" size="sm">{{ t('research.workspace.current') }}</Badge>
            <Badge size="sm" :variant="session.mode === 'degraded' ? 'warning' : 'info'">{{ t('research.phase.' + session.mode) }}</Badge>
            <Badge size="sm" :variant="session.busy ? 'success' : 'neutral'">{{ t('research.workspace.' + (session.busy ? 'running' : 'idle')) }}</Badge>
          </span>
        </Button>
      </nav>
      <p v-if="known.length === 0" class="research-session-hint">{{ t('research.workspace.noObserved') }}</p>
      <p v-if="other.length" class="research-session-hint">{{ t('research.workspace.otherSessions', { count: other.length }) }}</p>
      <nav v-if="other.length" class="research-session-list" :aria-label="t('research.workspace.otherLabel')">
        <Button v-for="session in visibleOther" :key="session.id" variant="ghost" class="research-session-row"
          :disabled="session.id === sessionId" :aria-current="session.id === sessionId ? 'page' : undefined" @click="select(session.id)">
          <Icon name="message" size="md" />
          <span class="research-session-copy">
            <span>{{ session.title }}</span>
            <span class="research-session-path" :title="session.workspace + ' · ' + session.id">{{ session.workspace }} · {{ session.id }}</span>
          </span>
          <Badge size="sm">{{ t('research.workspace.' + (session.mode === undefined ? 'unknown' : 'off')) }}</Badge>
          <Badge v-if="session.id === sessionId" size="sm">{{ t('research.workspace.current') }}</Badge>
        </Button>
      </nav>
    </div>
    <template #foot>
      <Button variant="secondary" @click="open = false; emit('browseSessions')">{{ t('research.workspace.allSessions') }}</Button>
    </template>
  </Dialog>
</template>

<style scoped>
.research-workspace-bar {
  position: relative;
  display: flex;
  flex: none;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-4);
  padding: var(--space-3) var(--space-6);
  border-bottom: 1px solid var(--color-line);
  background: var(--color-surface-sunken);
}
.research-workspace-bar::after { content: ''; position: absolute; bottom: -1px; left: var(--space-6); width: 112px; border-bottom: 2px solid var(--color-accent); }
.research-workspace-bar.is-inactive { justify-content: flex-end; }
.research-workspace-bar.is-inactive::after { display: none; }
.research-workspace-identity, .research-workspace-controls {
  display: flex;
  align-items: center;
  gap: var(--space-3);
  min-width: 0;
}
.research-workspace-heading { display: grid; gap: var(--space-1); min-width: 0; }
.research-workspace-kicker {
  display: flex;
  align-items: center;
  gap: var(--space-3);
  font-family: var(--font-mono);
  font-size: var(--text-xs);
  color: var(--color-accent);
  letter-spacing: 0.08em;
  text-transform: uppercase;
}
.research-field-tag { max-width: 200px; overflow: hidden; white-space: nowrap; text-overflow: ellipsis; padding-left: var(--space-3); border-left: 1px solid var(--color-line-strong); color: var(--color-text-muted); text-transform: none; letter-spacing: normal; }
.research-workspace-name { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-size: var(--text-base); }
.research-policy-select { width: 148px; }
.research-workspace-controls { flex: none; flex-wrap: wrap; }
.research-session-switcher { display: grid; gap: var(--space-3); }
.research-switcher-heading { display: flex; align-items: center; gap: var(--space-4); min-width: 0; }
.research-switcher-heading h2 { font-size: var(--text-lg); color: var(--color-text); font-weight: var(--weight-medium); }
.research-session-hint { color: var(--color-text-muted); font-size: var(--text-sm); line-height: var(--leading-normal); }
.research-session-list { display: grid; gap: var(--space-2); }
.research-session-row {
  position: relative;
  height: auto;
  width: 100%;
  justify-content: flex-start;
  text-align: left;
  white-space: normal;
  padding: var(--space-3);
  border: 1px solid var(--color-line);
  border-radius: var(--radius-xs) var(--radius-lg) var(--radius-xs) var(--radius-lg);
}
.research-session-row::before { content: ''; position: absolute; left: -1px; top: -1px; width: 14px; height: 14px; border-left: 2px solid var(--color-accent); border-top: 2px solid var(--color-accent); opacity: 0; pointer-events: none; }
.research-session-row:hover::before, .research-session-row[aria-current="page"]::before { opacity: 1; }
.research-session-row[aria-current="page"] { border-color: var(--color-accent); background: var(--color-accent-soft); }
.research-session-row :deep(.ui-button__content) { width: 100%; min-width: 0; }
.research-session-copy { display: grid; gap: var(--space-1); min-width: 0; flex: 1; overflow-wrap: anywhere; }
.research-session-copy > :first-child { color: var(--color-text); line-height: var(--leading-normal); }
.research-session-path { color: var(--color-text-muted); font-size: var(--text-xs); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.research-session-badges { display: grid; justify-items: end; gap: var(--space-1); }
@media (max-width: 640px) {
  .research-workspace-bar { padding: var(--space-3); flex-wrap: wrap; gap: var(--space-2); }
  .research-workspace-controls { width: 100%; justify-content: space-between; }
  .research-workspace-controls :deep(button), .research-policy-select { min-height: 44px; }
  .research-field-tag { display: none; }
  .research-switcher-heading { align-items: flex-start; gap: var(--space-2); }
}
</style>
