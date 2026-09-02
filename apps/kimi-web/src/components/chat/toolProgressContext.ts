import type { ComputedRef, InjectionKey } from 'vue';
import type { TurnProgressSnapshot } from '../../lib/turnProgress';

/** Scoped by ToolCall so a renderer's ToolRow only sees its own turn progress. */
export const toolProgressKey: InjectionKey<ComputedRef<TurnProgressSnapshot | null>> =
  Symbol('tool-progress');
