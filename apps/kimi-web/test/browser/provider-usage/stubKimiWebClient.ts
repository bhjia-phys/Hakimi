// Stub of `useKimiWebClient` for the provider-usage browser harness. The real
// composable bootstraps auth/config/WS; this harness only needs the five
// provider-usage members the panel consumes, so it swaps the composable out via
// a Vite alias and lets `preview.ts` drive the reactive fixture state.
import { ref } from 'vue';

import type { ProviderUsageResult } from '../../../src/api/types';

export const providerUsage = ref<ProviderUsageResult[]>([]);
export const providerUsageLoading = ref(false);
export const providerUsageLoaded = ref(true);
export const providerUsageError = ref<string | null>(null);

export function useKimiWebClient(): {
  providerUsage: typeof providerUsage;
  providerUsageLoading: typeof providerUsageLoading;
  providerUsageLoaded: typeof providerUsageLoaded;
  providerUsageError: typeof providerUsageError;
  refreshProviderUsage: () => Promise<void>;
} {
  return {
    providerUsage,
    providerUsageLoading,
    providerUsageLoaded,
    providerUsageError,
    refreshProviderUsage: async () => {},
  };
}
