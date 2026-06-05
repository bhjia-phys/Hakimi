import type { ContentPart } from '@moonshot-ai/kosong';

import { DynamicInjector } from './injector';
import { WorkFrameOrchestrator } from '../workframe';

export class ResearchContextInjector extends DynamicInjector {
  protected override readonly injectionVariant = 'research_context';
  private readonly orchestrator: WorkFrameOrchestrator;

  constructor(agent: ConstructorParameters<typeof DynamicInjector>[0]) {
    super(agent);
    this.orchestrator = new WorkFrameOrchestrator(agent);
  }

  protected override async getInjection(): Promise<string | undefined> {
    if (!this.orchestrator.shouldInjectContext(this.injectedAt)) return undefined;
    const latestPrompt = latestUserPrompt(this.agent.context.history);
    if (latestPrompt === undefined) return undefined;
    const prepared = await this.orchestrator.prepareTurnContext(latestPrompt);
    return prepared?.reminder;
  }
}

function latestUserPrompt(
  history: readonly {
    readonly role: string;
    readonly content: readonly ContentPart[];
  }[],
): readonly ContentPart[] | undefined {
  for (let index = history.length - 1; index >= 0; index -= 1) {
    const message = history[index];
    if (message?.role === 'user') return message.content;
  }
  return undefined;
}
