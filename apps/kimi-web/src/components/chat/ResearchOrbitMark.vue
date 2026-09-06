<script setup lang="ts">
import Icon from '../ui/Icon.vue';
defineProps<{ dreaming?: boolean; large?: boolean }>();
</script>

<template>
  <span class="research-orbit-mark" :class="{ 'is-large': large, 'is-dreaming': dreaming }" aria-hidden="true">
    <i class="orbit-mark-ring" />
    <i class="orbit-mark-ellipse" />
    <i v-for="tick in 12" :key="tick" class="orbit-mark-tick" :style="{ transform: `rotate(${tick * 30}deg)` }" />
    <Icon :name="dreaming ? 'sparkles' : 'target'" :size="large ? 'lg' : 'md'" />
  </span>
</template>

<style scoped>
.research-orbit-mark { position: relative; flex: none; display: inline-grid; place-items: center; width: 48px; height: 48px; color: var(--color-accent); }
.orbit-mark-ring { position: absolute; inset: var(--space-2); border: 1px solid var(--color-accent-bd); border-radius: var(--radius-full); }
.orbit-mark-ellipse { position: absolute; inset: var(--space-1) var(--space-3); border: 1px solid var(--color-accent); border-radius: var(--radius-full); transform: rotate(45deg); opacity: 0.75; }
.orbit-mark-tick { position: absolute; inset: 0; }
.orbit-mark-tick::before { content: ''; position: absolute; top: 0; left: calc(50% - 1px); height: 3px; border-left: 1px solid var(--color-accent-bd); }
.orbit-mark-tick:nth-child(3n)::before { height: 5px; border-color: var(--color-accent); }
.is-large { width: 104px; height: 104px; }
.is-large .orbit-mark-ring { inset: var(--space-3); }
.is-large .orbit-mark-ellipse { inset: var(--space-2) var(--space-6); }
.is-dreaming .orbit-mark-ellipse { transform: rotate(-45deg); }
</style>
