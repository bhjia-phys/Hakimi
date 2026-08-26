/**
 * `aitpResearch` domain — Research Mode context injection.
 *
 * Owns the `aitp_research` context-injection provider: while AITP Research
 * Mode is active, it injects the scientific Research Loop state — current
 * question, phase, current action, latest progress, mainline impact, next
 * step, and any pending human gate — plus active semantic guidance. Verbosity
 * is Brief (full guidance) on a new turn or when progress changed since the
 * last disclosure, and Detail (compressed summary) within the same turn. The
 * disclosure carries the snapshot revision / phase / progress timestamp so
 * the next step can decide; compaction and undo both re-arm the new-turn flag
 * or drop the prior disclosure, so they re-inject the full guidance. Inactive
 * mode injects nothing (zero disclosure), and AITP entry / hash / revision /
 * checkpoint ids never leak into the injected text. Bound at Agent scope.
 */

import { Service } from '#/_base/di/service';
import {
  IAgentContextInjectorService,
  type ContextInjectionContext,
  type ContextInjectionResult,
} from '#/agent/contextInjector/contextInjector';
import { IAgentAitpModeService } from '#/features/aitpResearch/mode/agentAitpMode';
import { IAgentResearchService } from '#/features/aitpResearch/research/agentResearch';

import type { IAitpResearchInjection } from './aitpResearchInjectionContract';
import {
  renderResearchInjection,
  type InjectionDisclosure,
  type InjectionVerbosity,
} from './researchInjectionPresenter';

const AITP_RESEARCH_INJECTION_VARIANT = 'aitp_research';

export class AitpResearchInjection extends Service implements IAitpResearchInjection {
  declare readonly _serviceBrand: undefined;
  constructor(
    @IAgentContextInjectorService injector: IAgentContextInjectorService,
    @IAgentAitpModeService private readonly mode: IAgentAitpModeService,
    @IAgentResearchService private readonly research: IAgentResearchService,
  ) {
    super();

    this._register(
      injector.register<InjectionDisclosure>(
        AITP_RESEARCH_INJECTION_VARIANT,
        (context) => this.render(context),
      ),
    );
  }

  private render(
    context: ContextInjectionContext<InjectionDisclosure>,
  ): ContextInjectionResult<InjectionDisclosure> | undefined {
    if (!this.mode.isActive) return undefined;
    const snapshot = this.research.getSnapshot();
    const verbosity = resolveVerbosity(context, snapshot);
    return renderResearchInjection(snapshot, verbosity);
  }
}

function resolveVerbosity(
  context: ContextInjectionContext<InjectionDisclosure>,
  snapshot: ReturnType<IAgentResearchService['getSnapshot']>,
): InjectionVerbosity {
  if (context.isNewTurn) return 'brief';
  const last = context.lastDisclosure;
  if (last === undefined) return 'brief';
  const progressChanged = snapshot.latestProgress?.recordedAt !== last.progressRecordedAt;
  if (progressChanged) return 'brief';
  if (snapshot.phase !== last.phase) return 'brief';
  return 'detail';
}
