<!-- apps/kimi-web/src/components/chat/ConversationToc.vue -->
<script setup lang="ts">
import { computed } from 'vue';
import { useI18n } from 'vue-i18n';
import type { ChatTurn } from '../../types';

export interface ConversationTocItem {
  id: string;
  role: ChatTurn['role'];
  no: number;
  title: string;
}

const props = defineProps<{
  items: ConversationTocItem[];
  /** Query currently owning the viewport middle. */
  activeTurnId: string | null;
  mobile?: boolean;
  sessionLoading?: boolean;
  /** Temporarily hidden while a wide table actually covers the rail. */
  occluded?: boolean;
}>();

const emit = defineEmits<{
  select: [turnId: string];
}>();

const { t } = useI18n();

const visible = computed(
  () => !props.mobile && !props.sessionLoading && props.items.length > 0,
);
</script>

<template>
  <!-- Conversation outline: a vertical list of short bars (one per user query),
       fixed to the right edge of the chat. Hovering reveals labels to the left. -->
  <nav
    v-if="visible"
    class="conversation-toc"
    :class="{ 'toc-clipped': occluded }"
    :aria-label="t('conversation.toc')"
    :aria-hidden="occluded ? true : undefined"
  >
    <div class="toc-scroll">
      <button
        v-for="item in items"
        :key="item.id"
        type="button"
        class="toc-row"
        :class="{ active: activeTurnId === item.id }"
        @click="emit('select', item.id)"
      >
        <span class="toc-bar" />
        <span class="toc-label">{{ item.title }}</span>
      </button>
    </div>
  </nav>
</template>

<style scoped>
.conversation-toc {
  position: absolute;
  z-index: var(--z-sticky);
  top: 50%;
  right: var(--space-5);
  transform: translateY(-50%);
  display: flex;
  flex-direction: column;
  justify-content: center;
  opacity: 0.5;
  transition: opacity var(--duration-base) var(--ease-out);
}
/* Keep a generous hover target around the narrow collapsed rail. Labels open
   toward the conversation, so the rail remains visible at ordinary widths. */
.conversation-toc::before {
  content: "";
  position: absolute;
  top: 0;
  bottom: 0;
  left: -48px;
  right: -14px;
  z-index: 0;
}
.conversation-toc:hover,
.conversation-toc:focus-within { opacity: 1; }

.toc-scroll {
  position: relative;
  z-index: 1;
  display: flex;
  flex-direction: column;
  gap: 7px;
  padding: 8px 0;
  max-height: calc(100vh - 200px);
  overflow-y: auto;
  scrollbar-width: none;
}
.toc-scroll::-webkit-scrollbar { display: none; }

.toc-row {
  display: flex;
  flex-direction: row-reverse;
  align-items: center;
  gap: 10px;
  height: 18px;
  padding: 0;
  border: none;
  background: transparent;
  color: var(--color-text-muted);
  font-family: var(--font-ui);
  font-size: var(--text-sm);
  text-align: right;
  cursor: pointer;
  white-space: nowrap;
}
.toc-row:focus-visible { outline: none; box-shadow: var(--p-focus-ring); }

.toc-bar {
  flex: none;
  width: 3px;
  height: 14px;
  border-radius: var(--radius-full);
  background: var(--color-accent);
  opacity: 0.3;
  transition:
    opacity var(--duration-fast) var(--ease-out),
    height var(--duration-fast) var(--ease-out);
}
.toc-label {
  display: block;
  max-width: 0;
  overflow: hidden;
  opacity: 0;
  text-overflow: ellipsis;
  transition:
    max-width 220ms var(--ease-out),
    opacity var(--duration-fast) var(--ease-out),
    color var(--duration-fast) var(--ease-out);
}

/* Hover / focus: enlarge bars and reveal labels toward the conversation. */
.conversation-toc:hover .toc-bar,
.conversation-toc:focus-within .toc-bar { height: 18px; opacity: 0.5; }
.conversation-toc:hover .toc-label,
.conversation-toc:focus-within .toc-label { max-width: 220px; opacity: 1; }

.toc-row.active .toc-bar { opacity: 1; height: 18px; }
.toc-row.active .toc-label { color: var(--color-accent); font-weight: var(--weight-medium); }
.toc-row:hover .toc-bar { opacity: 1; }
.toc-row:hover .toc-label { color: var(--color-text); }

/* Wide tables may temporarily cover the rail; hide it only for that overlap. */
.conversation-toc.toc-clipped {
  visibility: hidden;
  pointer-events: none;
}
</style>
