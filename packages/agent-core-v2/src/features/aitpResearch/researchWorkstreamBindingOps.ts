/**
 * `aitpResearch` domain — checkpointed explicit Line-to-workstream binding operations.
 *
 * Persists Hakimi-local confirmations and clear operations against exact
 * Research, Line, and observed AITP Topic revisions.
 */

import { z } from 'zod';

import { ResearchLineWorkstreamBindingSchema } from '#/features/research/types';
import { ResearchModel } from './aitpResearchOps';

declare module '#/wire/types' {
  interface PersistedOpMap {
    'research.workstream_binding.confirm': typeof researchConfirmWorkstreamBinding;
    'research.workstream_binding.clear': typeof researchClearWorkstreamBinding;
  }
}

export const researchConfirmWorkstreamBinding = ResearchModel.defineOp(
  'research.workstream_binding.confirm',
  {
    schema: ResearchLineWorkstreamBindingSchema.extend({
      expectedRevision: z.number().int().nonnegative(),
    }).strict(),
    apply: (state, binding) => {
      const program = state.current.program;
      const line = state.current.lines[binding.lineSlug];
      if (
        state.current.revision !== binding.expectedRevision ||
        line === undefined ||
        program === null ||
        program.topicId !== binding.topicId ||
        (program.observedRevision ?? 1) !== binding.observedRevision
      ) return state;
      if (
        (state.current.pendingCheckpoint?.lineSlug === binding.lineSlug) ||
        (state.current.currentAction?.lineSlug === binding.lineSlug &&
          (state.current.currentAction.status === 'planned' ||
            state.current.currentAction.status === 'in_progress'))
      ) return state;
      const bindings = state.current.lineWorkstreamBindings ?? {};
      const current = bindings[binding.lineSlug];
      if (
        current?.confirmationId === binding.confirmationId &&
        current.workstream === binding.workstream &&
        current.topicId === binding.topicId &&
        current.observedRevision === binding.observedRevision &&
        current.confirmedBy === binding.confirmedBy
      ) return state;
      if (current !== undefined) return state;
      const { expectedRevision: _expectedRevision, ...record } = binding;
      return {
        ...state,
        current: {
          ...state.current,
          lines: {
            ...state.current.lines,
            [binding.lineSlug]: { ...line, revision: line.revision + 1 },
          },
          lineWorkstreamBindings: {
            ...bindings,
            [record.lineSlug]: record,
          },
          revision: state.current.revision + 1,
        },
      };
    },
  },
);

export const researchClearWorkstreamBinding = ResearchModel.defineOp(
  'research.workstream_binding.clear',
  {
    schema: z.object({
      binding: ResearchLineWorkstreamBindingSchema,
      // Additive recovery target for legacy/corrupt records whose map key and
      // embedded lineSlug disagree. Older persisted ops omit it and retain
      // the original binding.lineSlug behavior.
      targetLineSlug: z.string().min(1).max(200).optional(),
      expectedRevision: z.number().int().nonnegative(),
    }).strict(),
    apply: (state, input) => {
      const { binding } = input;
      const targetLineSlug = input.targetLineSlug ?? binding.lineSlug;
      const line = state.current.lines[targetLineSlug];
      const bindings = state.current.lineWorkstreamBindings ?? {};
      const current = bindings[targetLineSlug];
      if (
        state.current.revision !== input.expectedRevision ||
        line === undefined ||
        current === undefined ||
        current.confirmationId !== binding.confirmationId ||
        current.workstream !== binding.workstream ||
        current.topicId !== binding.topicId ||
        current.observedRevision !== binding.observedRevision ||
        current.confirmedBy !== binding.confirmedBy ||
        current.confirmedAt !== binding.confirmedAt ||
        state.current.pendingCheckpoint?.lineSlug === targetLineSlug ||
        (state.current.currentAction?.lineSlug === targetLineSlug &&
          (state.current.currentAction.status === 'planned' ||
            state.current.currentAction.status === 'in_progress'))
      ) return state;
      const next = { ...bindings };
      delete next[targetLineSlug];
      return {
        ...state,
        current: {
          ...state.current,
          lines: {
            ...state.current.lines,
            [targetLineSlug]: { ...line, revision: line.revision + 1 },
          },
          lineWorkstreamBindings: next,
          revision: state.current.revision + 1,
        },
      };
    },
  },
);
