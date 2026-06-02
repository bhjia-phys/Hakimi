import type { Agent } from '..';
import type { PromptOrigin } from '../context';
import type { ResearchContextPack } from '../../research-context';
import { renderResearchContextPackReminder } from './context-pack';
import type { WorkFrame } from '../../research-action';
import { buildRuntimeToolExposurePlan } from '../tool-exposure';

export interface PreparedResearchTurnContext {
  readonly frame: WorkFrame;
  readonly pack: ResearchContextPack;
  readonly reminder: string;
}

export class WorkFrameOrchestrator {
  constructor(private readonly agent: Agent) {}

  prepareTurnContext(input: readonly { readonly type?: string; readonly text?: string }[]): PreparedResearchTurnContext | undefined {
    const frame = this.inferFrame(input);
    if (frame === undefined) return undefined;
    if (this.agent.workFrames.active?.id !== frame.id) {
      this.agent.workFrames.switch(frame.id, { source: 'controller' });
    }
    const pack = this.agent.researchContext.compileForWorkFrame(
      { workFrameId: frame.id },
      { source: 'controller' },
    );
    this.agent.tools.applyRuntimeToolExposure(buildRuntimeToolExposurePlan(pack), {
      source: 'controller',
    });
    return {
      frame: this.agent.workFrames.requireFrame(frame.id),
      pack,
      reminder: renderResearchContextPackReminder(pack),
    };
  }

  shouldInjectContext(lastInjectionIndex: number | null): boolean {
    if (lastInjectionIndex === null) return true;
    for (let index = lastInjectionIndex + 1; index < this.agent.context.history.length; index += 1) {
      const message = this.agent.context.history[index];
      if (message === undefined) continue;
      if (message.role === 'user') return true;
    }
    return false;
  }

  private inferFrame(input: readonly { readonly type?: string; readonly text?: string }[]): WorkFrame | undefined {
    const frames = this.agent.workFrames.list();
    if (frames.length === 0) return undefined;
    if (frames.length === 1) return this.agent.workFrames.requireFrame(frames[0]!.id);

    const prompt = normalizePrompt(input);
    if (prompt.length === 0) {
      return this.agent.workFrames.active ?? this.agent.workFrames.requireFrame(frames[0]!.id);
    }

    const scored = frames
      .map((frame) => ({
        frame,
        score: scoreFrame(frame, prompt, frame.id === this.agent.workFrames.active?.id),
      }))
      .toSorted((a, b) => b.score - a.score || a.frame.id.localeCompare(b.frame.id));
    const winner = scored[0];
    if (winner === undefined) return this.agent.workFrames.active;
    if (winner.score <= 0) return this.agent.workFrames.active ?? winner.frame;
    return winner.frame;
  }
}

export function isResearchContextInjectionOrigin(origin: PromptOrigin | undefined): boolean {
  return origin?.kind === 'injection' && origin.variant === 'research_context';
}

function normalizePrompt(input: readonly { readonly type?: string; readonly text?: string }[]): string {
  return input
    .filter((part) => part.type === 'text' && typeof part.text === 'string')
    .map((part) => part.text!.toLowerCase())
    .join(' ');
}

function scoreFrame(frame: WorkFrame, prompt: string, active: boolean): number {
  const haystacks = [frame.id, frame.domain, frame.topic, frame.goal];
  let score = active ? 2 : 0;
  for (const haystack of haystacks) {
    for (const token of tokenize(haystack)) {
      if (token.length < 3) continue;
      if (prompt.includes(token)) score += token.length > 8 ? 4 : 3;
    }
  }
  return score;
}

function tokenize(input: string): readonly string[] {
  return input
    .toLowerCase()
    .split(/[^a-z0-9]+/g)
    .map((token) => token.trim())
    .filter((token) => token.length > 0);
}
