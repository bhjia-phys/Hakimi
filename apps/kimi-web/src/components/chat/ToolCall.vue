<!-- apps/kimi-web/src/components/chat/ToolCall.vue -->
<script setup lang="ts">
import { computed, provide } from 'vue';
import type { TurnProgressSnapshot } from '../../lib/turnProgress';
import type { FilePreviewRequest, ToolCall, ToolMedia, WebPreviewTarget } from '../../types';
import { toolProgressKey } from './toolProgressContext';
import { resolveToolRenderer } from './tool-calls/toolRegistry';

const props = withDefaults(
  defineProps<{
    tool: ToolCall;
    mobile?: boolean;
    stackPosition?: 'single' | 'first' | 'middle' | 'last';
    toolDiffPanel?: boolean;
    turnProgress?: TurnProgressSnapshot | null;
  }>(),
  { mobile: false, stackPosition: 'single', toolDiffPanel: false, turnProgress: null },
);

const emit = defineEmits<{
  openMedia: [media: ToolMedia];
  openFile: [target: FilePreviewRequest];
  openToolDiff: [id: string];
  openAgent: [toolCallId: string];
  openPreview: [target: WebPreviewTarget];
}>();

const Renderer = computed(() => resolveToolRenderer(props.tool));
const scopedTurnProgress = computed(() => props.turnProgress);
provide(toolProgressKey, scopedTurnProgress);
</script>

<template>
  <component
    :is="Renderer"
    :tool="tool"
    :mobile="mobile"
    :stack-position="stackPosition"
    :tool-diff-panel="toolDiffPanel"
    :data-scroll-anchor-id="tool.id"
    @open-media="emit('openMedia', $event)"
    @open-file="emit('openFile', $event)"
    @open-tool-diff="emit('openToolDiff', $event)"
    @open-agent="emit('openAgent', $event)"
    @open-preview="emit('openPreview', $event)"
  />
</template>
