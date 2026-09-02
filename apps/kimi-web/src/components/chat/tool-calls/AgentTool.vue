<!-- apps/kimi-web/src/components/chat/tool-calls/AgentTool.vue -->
<!-- The single-subagent `Agent` tool, rendered as a normal tool card: the fixed
     args (description / prompt) and final result show here when expanded, while
     the subagent's LIVE progress streams in the right-side detail panel. The
     trailing "Open" button jumps to that panel. -->
<script setup lang="ts">
import { computed, inject, ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import type { FilePreviewRequest, TaskItem, ToolCall, ToolMedia } from '../../../types';
import { toolGlyph, toolLabel } from '../../../lib/toolMeta';
import Badge from '../../ui/Badge.vue';
import Tooltip from '../../ui/Tooltip.vue';
import ToolRow from '../ToolRow.vue';

const { t } = useI18n();

const props = withDefaults(
  defineProps<{
    tool: ToolCall;
    mobile?: boolean;
    stackPosition?: 'single' | 'first' | 'middle' | 'last';
    toolDiffPanel?: boolean;
  }>(),
  { mobile: false, stackPosition: 'single', toolDiffPanel: false },
);

const emit = defineEmits<{
  openMedia: [media: ToolMedia];
  openFile: [target: FilePreviewRequest];
  openToolDiff: [id: string];
  /** Open this subagent's live progress in the right-side detail panel. */
  openAgent: [toolCallId: string];
}>();

interface AgentInput {
  description?: string;
  subagentType?: string;
  prompt?: string;
}

function parseAgentInput(arg: string): AgentInput {
  if (!arg) return {};
  try {
    const obj = JSON.parse(arg) as Record<string, unknown>;
    return {
      description: typeof obj['description'] === 'string' ? obj['description'] : undefined,
      subagentType: typeof obj['subagent_type'] === 'string' ? obj['subagent_type'] : undefined,
      prompt: typeof obj['prompt'] === 'string' ? obj['prompt'] : undefined,
    };
  } catch {
    return {};
  }
}

const input = computed(() => parseAgentInput(props.tool.arg));
const hasOutput = computed(() => !!props.tool.output && props.tool.output.length > 0);
const canExpand = computed(() => Boolean(input.value.prompt) || hasOutput.value);
const open = ref(props.tool.defaultExpanded === true && canExpand.value);

const status = computed<'running' | 'ok' | 'error'>(() => props.tool.status as 'running' | 'ok' | 'error');
const label = computed(() => toolLabel(props.tool.name));
const glyph = computed(() => toolGlyph(props.tool.name));

// The task resolver reads ConversationPane's reactive TaskItem list, so status
// events update the badges in place. Role can fall back to the immutable tool
// argument; model never does — only the runtime task is authoritative.
const resolveAgentTask = inject<(toolCallId: string) => TaskItem | undefined>('resolveAgentTask');
const resolveAgentTaskId = inject<(toolCallId: string) => string | undefined>('resolveAgentTaskId');
const task = computed(() => resolveAgentTask?.(props.tool.id));
const role = computed(() => task.value?.subagentType || input.value.subagentType);
const model = computed(() => task.value?.model);
const summary = computed(() => input.value.description || role.value || '');

// Hide the "Open detail" button when no live/background subagent task matches
// this tool call (e.g. a completed foreground subagent after a page refresh) —
// otherwise the button emits into a panel that silently no-ops.
const canOpenAgent = computed(() => {
  if (resolveAgentTaskId) return resolveAgentTaskId(props.tool.id) !== undefined;
  if (resolveAgentTask) return task.value !== undefined;
  return true;
});

function toggle(): void {
  if (canExpand.value) open.value = !open.value;
}

watch(
  () => [props.tool.defaultExpanded, props.tool.output?.length, props.tool.status] as const,
  () => {
    if (props.tool.defaultExpanded === true && canExpand.value) open.value = true;
  },
);
</script>

<template>
  <ToolRow
    :status="status"
    :icon="glyph"
    :name="label"
    :arg="!open ? summary : ''"
    :time="tool.timing"
    :open="open"
    :expandable="canExpand"
    :stacked="stackPosition !== 'single'"
    :stack-position="stackPosition"
    @toggle="toggle"
  >
    <template #trailing>
      <button v-if="canOpenAgent" type="button" class="at-open" @click.stop="emit('openAgent', tool.id)">
        {{ t('tasks.openDetail') }}
      </button>
    </template>
    <template v-if="role || model" #metadata>
      <div class="at-metadata">
        <Tooltip v-if="role" :text="`${t('tasks.role')}: ${role}`">
          <Badge variant="neutral" size="sm" class="at-identity at-role" :title="role">
            <span class="at-identity-text">{{ t('tasks.role') }}: {{ role }}</span>
          </Badge>
        </Tooltip>
        <Tooltip v-if="model" :text="`${t('tasks.model')}: ${model}`">
          <Badge variant="neutral" size="sm" class="at-identity at-model" :title="model">
            <span class="at-identity-text">{{ t('tasks.model') }}: {{ model }}</span>
          </Badge>
        </Tooltip>
      </div>
    </template>
    <div v-if="input.prompt" class="at-task">{{ input.prompt }}</div>
    <div v-if="hasOutput" class="bb-code">
      <div v-for="(line, i) in tool.output ?? []" :key="i">{{ line }}</div>
    </div>
  </ToolRow>
</template>

<style scoped>
.at-metadata {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: var(--space-1);
  width: 100%;
  min-width: 0;
}
.at-identity {
  flex: 0 1 auto;
  min-width: 0;
  max-width: 160px;
  overflow: hidden;
}
.at-model {
  max-width: 240px;
}
.at-identity-text {
  display: block;
  min-width: 0;
  max-width: 100%;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.at-open {
  flex: none;
  background: none;
  border: 1px solid var(--color-line);
  border-radius: var(--radius-xs);
  color: var(--color-text-muted);
  font: var(--text-xs) var(--font-ui);
  padding: 1px 7px;
  cursor: pointer;
}
.at-open:hover {
  color: var(--color-text);
  background: var(--color-surface-sunken);
}
@media (max-width: 375px) {
  .at-identity,
  .at-model {
    max-width: 100%;
  }
}
.at-task {
  color: var(--color-text);
  white-space: pre-wrap;
  word-break: break-word;
}
.at-task + .bb-code {
  margin-top: 10px;
}
.bb-code {
  padding: 11px 13px;
  border: 1px solid var(--color-line);
  border-radius: var(--radius-md);
}
</style>
