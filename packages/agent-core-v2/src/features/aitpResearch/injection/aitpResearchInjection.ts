/**
 * `aitpResearch` domain — Research Mode context injection.
 *
 * Owns the `aitp_research` context-injection provider: while AITP Research
 * Mode is active, it injects a compressed `ResearchStatusSnapshot` — current
 * focus, current question, latest committed checkpoint, AITP health, alerts,
 * question counts — plus active semantic guidance that tells the model when
 * to create questions, set focus, update questions (only on semantic change),
 * and run checkpoints (durable boundaries only). Inactive mode injects
 * nothing (zero disclosure). The provider reconciles at every step head and
 * re-emits after compaction or undo. Bound at Agent scope.
 */

import { Service } from '#/_base/di/service';
import { IAgentContextInjectorService } from '#/agent/contextInjector/contextInjector';
import { IAgentAitpModeService } from '#/features/aitpResearch/mode/agentAitpMode';
import { IAgentResearchService } from '#/features/aitpResearch/research/agentResearch';

import type { IAitpResearchInjection } from './aitpResearchInjectionContract';

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
      injector.register(AITP_RESEARCH_INJECTION_VARIANT, () => {
        if (!this.mode.isActive) return undefined;
        return this.renderSnapshot();
      }),
    );
  }

  private renderSnapshot(): string {
    const snapshot = this.research.getSnapshot();
    const lines: string[] = [
      '## AITP Research Mode',
      `Mode: ${snapshot.mode} · Loop: ${snapshot.loopStatus}`,
    ];

    if (snapshot.currentQuestion !== undefined) {
      lines.push(`Current Question: ${snapshot.currentQuestion.wording}`);
      lines.push(
        `  workflow: ${snapshot.currentQuestion.workflow} · epistemic: ${snapshot.currentQuestion.epistemic} · persistence: ${snapshot.currentQuestion.persistence}`,
      );
    }

    if (snapshot.currentFocus !== undefined) {
      const action = snapshot.currentFocus.boundedAction ?? '(no bounded action set)';
      lines.push(`Focus: ${action}`);
    }

    if (snapshot.latestCommittedCheckpoint !== undefined) {
      lines.push(
        `Last committed checkpoint: ${snapshot.latestCommittedCheckpoint.checkpointId}` +
          (snapshot.latestCommittedCheckpoint.entryId !== undefined
            ? ` (entry: ${snapshot.latestCommittedCheckpoint.entryId})`
            : ''),
      );
    }

    lines.push(
      `AITP health: ${snapshot.aitpHealth.phase}` +
        (snapshot.aitpHealth.lastError !== undefined
          ? ` — ${snapshot.aitpHealth.lastError}`
          : ''),
    );

    if (snapshot.alerts.length > 0) {
      lines.push('Alerts:');
      for (const alert of snapshot.alerts.slice(0, 5)) {
        lines.push(`  [${alert.kind}] ${alert.message}`);
      }
    }

    lines.push(
      `Questions: ${snapshot.openQuestionCount} open · ${snapshot.activeQuestionCount} active · ${snapshot.blockedQuestionCount} blocked`,
    );

    lines.push('');
    lines.push('### Research state guidance');
    lines.push(
      '- If there is no current question, CreateResearchQuestion before taking any bounded action.',
    );
    lines.push(
      '- Before each bounded action, SetResearchFocus to declare the question and the next concrete step.',
    );
    lines.push(
      '- UpdateResearchQuestion only when the epistemic, workflow, or assessment state semantically changes (new evidence, falsification, failure, or sustained no-progress). Update assessment only when the scientific interpretation changes; do not update for ordinary tool calls or AITP reads.',
    );
    lines.push(
      '- CreateResearchLine for a distinct research objective and UpdateResearchLine only when its title, objective, status, or scientific assessment changes. Keep line assessments concise and semantic.',
    );
    lines.push(
      '- At a durable boundary (a committed result, a line conclusion, or a decision to persist), ProposeResearchCheckpoint then CommitResearchCheckpoint. Reserve checkpoints for genuine scientific milestones, not every turn.',
    );
    lines.push(
      '- Use Grep over .aitp/topic/ only to locate candidate entries; the canonical full read of any Entry must go through aitp_show. If aitp_show fails, report the real error — do not Read the Markdown file to simulate a successful show.',
    );
    lines.push(
      '- Research Lines and AITP workstreams are different namespaces. When names diverge (e.g. "magnetic-groups" vs "magnetic-symmetry"), you may read from either, but persisting an alias or creating a registry entry requires an explicit researcher decision first.',
    );
    lines.push(
      '- A candidate research question can be created as working state, but do not SetResearchFocus or write a durable AITP decision until the question is confirmed.',
    );

    return lines.join('\n');
  }
}
