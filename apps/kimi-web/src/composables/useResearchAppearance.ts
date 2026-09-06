import { onScopeDispose, toValue, watch, type MaybeRefOrGetter } from 'vue';

/** Temporary presentation only. Never overwrites the user's persisted theme. */
export function useResearchAppearance(
  active: MaybeRefOrGetter<boolean>,
  policy: MaybeRefOrGetter<string | undefined> = undefined,
): void {
  watch(() => [toValue(active), toValue(policy)] as const, ([value, planningPolicy]) => {
    document.documentElement.toggleAttribute('data-research-workspace', value);
    if (value && planningPolicy === 'dreaming') document.documentElement.dataset.researchPolicy = 'dreaming';
    else document.documentElement.removeAttribute('data-research-policy');
  }, { immediate: true, flush: 'sync' });
  onScopeDispose(() => {
    document.documentElement.removeAttribute('data-research-workspace');
    document.documentElement.removeAttribute('data-research-policy');
  });
}
