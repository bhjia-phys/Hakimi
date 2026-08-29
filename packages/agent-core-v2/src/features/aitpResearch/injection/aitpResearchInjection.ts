/**
 * `aitpResearch` domain — Research Mode context injection.
 *
 * Owns the `aitp_research` context-injection provider: while AITP Research
 * Mode is active and the current turn is admitted as a Research turn (a Goal
 * research continuation), it injects a trimmed scientific Research Loop state —
 * current question, phase, action and run digest, latest progress digest, the
 * single effective next step, the pending human gate, and the attention the
 * model must handle. Ordinary user / system / subagent / cron turns abstain
 * (zero disclosure) even while the mode is active. Verbosity is Brief (full
 * trimmed state) on a new turn or when phase / progress / action / run / next
 * step / attention semantically changed since the last disclosure, Delta (only
 * the changed attention) when only attention moved, and nothing at all when
 * there is no semantic change — duplicate text is never appended. The
 * disclosure carries the snapshot revision / phase / progress timestamp plus
 * action / run / next-step / attention fingerprints so the next step can
 * deduplicate; compaction and undo both drop the prior disclosure or re-arm
 * the new-turn flag, so they re-inject the trimmed state. Inactive mode
 * injects nothing (zero disclosure), and AITP entry / hash / revision /
 * checkpoint ids, receipts, checkpoint history, and finding details never leak
 * into the injected text. Bound at Agent scope.
 */

import { Service } from '#/_base/di/service';
import {
  IAgentContextInjectorService,
  type ContextInjectionContext,
  type ContextInjectionResult,
} from '#/agent/contextInjector/contextInjector';
import { IAgentAitpModeService } from '#/features/aitpResearch/mode/agentAitpMode';
import { IAgentResearchService } from '#/features/aitpResearch/research/agentResearch';
import { IResearchTurnAdmission } from '#/features/aitpResearch/loop/researchTurnAdmission';

import type { IAitpResearchInjection } from './aitpResearchInjectionContract';
import {
  renderResearchInjection,
  resolveResearchVerbosity,
  type InjectionDisclosure,
} from './researchInjectionPresenter';

const AITP_RESEARCH_INJECTION_VARIANT = 'aitp_research';

export class AitpResearchInjection extends Service implements IAitpResearchInjection {
  declare readonly _serviceBrand: undefined;
  constructor(
    @IAgentContextInjectorService injector: IAgentContextInjectorService,
    @IAgentAitpModeService private readonly mode: IAgentAitpModeService,
    @IAgentResearchService private readonly research: IAgentResearchService,
    @IResearchTurnAdmission private readonly admission: IResearchTurnAdmission,
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
    if (!this.admission.isCurrentResearchTurn()) return undefined;
    const snapshot = this.research.getSnapshot();
    const verbosity = resolveResearchVerbosity(context, snapshot);
    if (verbosity === undefined) return undefined;
    return renderResearchInjection(snapshot, verbosity);
  }
}
