<!-- apps/kimi-web/src/components/chat/StatusGlyph.vue -->
<!-- Shared status glyph for dock list rows (todo + background bash/subagent tasks).
     One symbol per state, colored by state — keeps the two lists visually identical. -->
<script setup lang="ts">
import StatusDot from '../ui/StatusDot.vue';

export type StatusGlyphStatus = 'pending' | 'run' | 'done' | 'fail' | 'cancelled' | 'suspended';

const props = defineProps<{ status: StatusGlyphStatus }>();

const GLYPH: Record<StatusGlyphStatus, string> = {
  pending: '○',
  run: '',
  done: '✓',
  fail: '✗',
  cancelled: '⊘',
  suspended: '',
};
</script>

<template>
  <span class="status-glyph" :class="`s-${props.status}`" aria-hidden="true">
    <StatusDot v-if="status === 'run' || status === 'suspended'" :status="status === 'run' ? 'running' : 'suspended'" />
    <template v-else>{{ GLYPH[props.status] }}</template>
  </span>
</template>

<style scoped>
.status-glyph {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  flex: none;
  width: var(--p-ic-md);
  font-size: var(--text-base);
  line-height: 1;
  text-align: center;
  user-select: none;
}
.status-glyph.s-done { color: var(--color-success); }
.status-glyph.s-fail { color: var(--color-danger); }
.status-glyph.s-cancelled { color: var(--color-warning); }
.status-glyph.s-pending { color: var(--color-text-faint); }
</style>
