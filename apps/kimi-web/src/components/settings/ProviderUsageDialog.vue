<!-- apps/kimi-web/src/components/settings/ProviderUsageDialog.vue -->
<!-- Quick provider-usage overlay for the sidebar footer. The shared panel owns
     fetching and presentation; Dialog owns focus, keyboard, and close behavior. -->
<script setup lang="ts">
import { ref } from 'vue';
import { useI18n } from 'vue-i18n';
import Dialog from '../ui/Dialog.vue';
import ProviderUsagePanel from './ProviderUsagePanel.vue';

const { t } = useI18n();
const emit = defineEmits<{ close: [] }>();
const open = ref(true);
</script>

<template>
  <Dialog
    v-model:open="open"
    :title="t('sidebar.providerUsage')"
    size="lg"
    height="fixed"
    @close="emit('close')"
  >
    <ProviderUsagePanel embedded />
  </Dialog>
</template>
