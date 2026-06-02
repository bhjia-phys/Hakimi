import { LIBRPA_HEAD_WING_SMOKE_BENCHMARK_ADAPTER } from './librpa-head-wing-smoke';
import { BenchmarkAdapterRegistry } from './types';

export function createDefaultBenchmarkAdapterRegistry(): BenchmarkAdapterRegistry {
  const registry = new BenchmarkAdapterRegistry();
  registry.register(LIBRPA_HEAD_WING_SMOKE_BENCHMARK_ADAPTER);
  return registry;
}
