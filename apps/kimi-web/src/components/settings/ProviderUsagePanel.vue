<script setup lang="ts">
import { onMounted } from 'vue';
import { useI18n } from 'vue-i18n';
import type { ProviderUsageResult, ProviderUsageRow } from '../../api/types';
import { useKimiWebClient } from '../../composables/useKimiWebClient';
import {
  formatProviderCurrency,
  formatProviderUsageReset,
  providerUsageBadgeVariant,
  providerUsageBarPercent,
  providerUsagePercent,
  providerUsageRemaining,
  providerUsageRemainingPercent,
} from '../../lib/providerUsage';
import Badge from '../ui/Badge.vue';
import Button from '../ui/Button.vue';
import Card from '../ui/Card.vue';

const { t, locale } = useI18n();
withDefaults(defineProps<{ embedded?: boolean }>(), {
  embedded: false,
});
const {
  providerUsage,
  providerUsageLoading,
  providerUsageLoaded,
  providerUsageError,
  refreshProviderUsage,
} = useKimiWebClient();

onMounted(() => {
  void refreshProviderUsage();
});

function usageLabel(row: ProviderUsageRow): string {
  if (row.name) return row.name;
  if (row.window) {
    return t('settings.usageWindow', {
      duration: row.window.duration,
      unit: t(`settings.usageUnits.${row.window.unit}`),
    });
  }
  return t('settings.usageLimit');
}

function usageValue(row: ProviderUsageRow): string {
  const usedPercent = providerUsagePercent(row);
  const remaining = providerUsageRemaining(row);
  if (remaining === null) {
    const values = `${row.used} / ${row.limit}`;
    return usedPercent === null ? values : `${values} (${usedPercent}%)`;
  }
  // Lead with what is left (clamped at 0 for display); the reset time below
  // stays visible for every row.
  const left = Math.max(0, remaining);
  const remainingPercent = providerUsageRemainingPercent(row);
  if (remainingPercent === null) {
    return t('settings.usageLeft', { count: String(left) });
  }
  return t('settings.usageLeftWithPercent', {
    count: String(left),
    percent: String(remainingPercent),
  });
}

function resetLabel(row: ProviderUsageRow): string | null {
  const formatted = formatProviderUsageReset(row.resetAt, locale.value);
  return formatted === null ? null : t('settings.usageResetsAt', { time: formatted });
}

function extraBalance(result: Extract<ProviderUsageResult, { kind: 'ok' }>): string | null {
  const extra = result.extraUsage;
  return extra === null
    ? null
    : formatProviderCurrency(extra.balanceCents, extra.currency, locale.value);
}

function monthlyUsage(result: Extract<ProviderUsageResult, { kind: 'ok' }>): string | null {
  const extra = result.extraUsage;
  if (extra === null) return null;
  const used = formatProviderCurrency(extra.monthlyUsedCents, extra.currency, locale.value);
  if (!extra.monthlyChargeLimitEnabled || extra.monthlyChargeLimitCents <= 0) {
    return t('settings.usageMonthlyNoLimit', { used });
  }
  const limit = formatProviderCurrency(
    extra.monthlyChargeLimitCents,
    extra.currency,
    locale.value,
  );
  return t('settings.usageMonthlyWithLimit', { used, limit });
}
</script>

<template>
  <Card class="usage-card" :class="{ 'usage-card--embedded': embedded }">
    <template #head>
      <div class="usage-head" :class="{ 'usage-head--embedded': embedded }">
        <span v-if="!embedded">{{ t('settings.providerUsage') }}</span>
        <Button
          variant="secondary"
          size="sm"
          :loading="providerUsageLoading"
          @click="refreshProviderUsage()"
        >
          {{ t('settings.refreshUsage') }}
        </Button>
      </div>
    </template>

    <div v-if="providerUsageLoading && !providerUsageLoaded" class="usage-state">
      {{ t('settings.usageLoading') }}
    </div>
    <div v-else-if="providerUsageError" class="usage-state usage-state--error">
      <strong>{{ t('settings.usageQueryFailed') }}</strong>
      <span>{{ providerUsageError }}</span>
    </div>
    <div v-else-if="providerUsage.length === 0" class="usage-state">
      {{ t('settings.usageEmpty') }}
    </div>
    <div v-else class="provider-list">
      <section v-for="result in providerUsage" :key="result.provider" class="provider-usage">
        <div class="provider-head">
          <span class="provider-name">{{ result.provider }}</span>
          <Badge :variant="providerUsageBadgeVariant(result)" size="sm">
            {{ t(`settings.usageStatus.${result.kind}`) }}
          </Badge>
        </div>

        <template v-if="result.kind === 'ok'">
          <div v-if="result.summary" class="usage-row usage-row--summary">
            <div class="usage-row-head">
              <span>{{ usageLabel(result.summary) }}</span>
              <span class="usage-value">{{ usageValue(result.summary) }}</span>
            </div>
            <div v-if="providerUsagePercent(result.summary) !== null" class="usage-track">
              <span :style="{ width: `${providerUsageBarPercent(result.summary)}%` }" />
            </div>
            <span v-if="resetLabel(result.summary)" class="usage-reset">
              {{ resetLabel(result.summary) }}
            </span>
          </div>

          <div v-for="(limit, index) in result.limits" :key="`${result.provider}-${index}`" class="usage-row">
            <div class="usage-row-head">
              <span>{{ usageLabel(limit) }}</span>
              <span class="usage-value">{{ usageValue(limit) }}</span>
            </div>
            <div v-if="providerUsagePercent(limit) !== null" class="usage-track">
              <span :style="{ width: `${providerUsageBarPercent(limit)}%` }" />
            </div>
            <span v-if="resetLabel(limit)" class="usage-reset">{{ resetLabel(limit) }}</span>
          </div>

          <div v-if="result.extraUsage" class="extra-usage">
            <div>
              <span>{{ t('settings.usageExtraBalance') }}</span>
              <strong>{{ extraBalance(result) }}</strong>
            </div>
            <div>
              <span>{{ t('settings.usageMonthly') }}</span>
              <strong>{{ monthlyUsage(result) }}</strong>
            </div>
          </div>
        </template>

        <div v-else class="usage-message">
          <span>{{ result.message }}</span>
          <span v-if="result.status" class="usage-status">HTTP {{ result.status }}</span>
        </div>
      </section>
    </div>
  </Card>
</template>

<style scoped>
.usage-card { margin-top: var(--space-4); }
.usage-card--embedded { margin-top: 0; }
.usage-head { width: 100%; display: flex; align-items: center; justify-content: space-between; gap: var(--space-3); }
.usage-head--embedded { justify-content: flex-end; }
.usage-state { display: flex; flex-direction: column; gap: var(--space-1); font-size: var(--text-sm); color: var(--color-text-muted); }
.usage-state--error { color: var(--color-danger); }
.provider-list { display: flex; flex-direction: column; gap: var(--space-4); }
.provider-usage { display: flex; flex-direction: column; gap: var(--space-3); }
.provider-usage + .provider-usage { padding-top: var(--space-4); border-top: 1px solid var(--color-line); }
.provider-head, .usage-row-head, .extra-usage > div, .usage-message { display: flex; align-items: center; justify-content: space-between; gap: var(--space-3); }
.provider-name { min-width: 0; overflow: hidden; text-overflow: ellipsis; font-family: var(--font-mono); font-size: var(--text-sm); color: var(--color-text); }
.usage-row { display: flex; flex-direction: column; gap: var(--space-1); font-size: var(--text-sm); }
.usage-row--summary { padding: var(--space-3); border-radius: var(--radius-md); background: var(--color-surface-sunken); }
.usage-row-head { color: var(--color-text); }
.usage-value { flex: none; font-family: var(--font-mono); font-size: var(--text-xs); font-weight: var(--weight-medium); color: var(--color-text); }
.usage-track { height: 6px; overflow: hidden; border-radius: var(--radius-full); background: var(--color-line); }
.usage-track > span { display: block; height: 100%; border-radius: var(--radius-full); background: var(--color-accent); }
.usage-reset { font-size: var(--text-xs); color: var(--color-text-faint); }
.extra-usage { display: flex; flex-direction: column; gap: var(--space-2); padding-top: var(--space-3); border-top: 1px solid var(--color-line); font-size: var(--text-sm); }
.extra-usage span { color: var(--color-text-muted); }
.extra-usage strong { color: var(--color-text); font-weight: var(--weight-medium); }
.usage-message { align-items: flex-start; padding: var(--space-3); border-radius: var(--radius-md); background: var(--color-surface-sunken); color: var(--color-text-muted); font-size: var(--text-sm); line-height: var(--leading-normal); }
.usage-status { flex: none; font-family: var(--font-mono); font-size: var(--text-xs); color: var(--color-text-faint); }

@media (max-width: 640px) {
  .provider-head, .usage-row-head, .extra-usage > div, .usage-message { align-items: flex-start; flex-direction: column; gap: var(--space-1); }
}
</style>
