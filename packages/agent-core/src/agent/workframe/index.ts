import type { Agent } from '..';
import {
  createWorkFrame,
  type WorkFrame,
  type WorkFrameTrustState,
} from '../../research-action';
import type { PhysicsDomainId } from '../../physics-memory';

export type WorkFrameRecordSource = 'model-tool' | 'controller' | 'replay';

export interface OpenWorkFrameInput {
  readonly id: string;
  readonly domain: PhysicsDomainId;
  readonly topic: string;
  readonly goal: string;
  readonly contextPackId?: string | undefined;
  readonly activeObjectIds?: readonly string[] | undefined;
  readonly assumptionIds?: readonly string[] | undefined;
  readonly conventionIds?: readonly string[] | undefined;
  readonly sourceRefs?: readonly string[] | undefined;
  readonly openObligationIds?: readonly string[] | undefined;
  readonly trustState?: WorkFrameTrustState | undefined;
}

export interface WorkFrameRecordOptions {
  readonly source: WorkFrameRecordSource;
  readonly toolCallId?: string | undefined;
}

export class WorkFrameManager {
  private readonly frames = new Map<string, WorkFrame>();
  private activeFrameId: string | undefined;

  constructor(private readonly agent: Agent) {}

  get active(): WorkFrame | undefined {
    return this.activeFrameId === undefined ? undefined : this.frames.get(this.activeFrameId);
  }

  open(input: OpenWorkFrameInput, options: WorkFrameRecordOptions): WorkFrame {
    const frame = createWorkFrame(input);
    this.frames.set(frame.id, frame);
    this.activeFrameId = frame.id;
    this.agent.records.logRecord({
      type: 'workframe.opened',
      source: options.source,
      frame,
      ...(options.toolCallId === undefined ? {} : { toolCallId: options.toolCallId }),
    });
    return frame;
  }

  switch(id: string, options: WorkFrameRecordOptions): WorkFrame {
    const frame = this.requireFrame(id);
    this.activeFrameId = frame.id;
    this.agent.records.logRecord({
      type: 'workframe.switched',
      source: options.source,
      frameId: frame.id,
      ...(options.toolCallId === undefined ? {} : { toolCallId: options.toolCallId }),
    });
    return frame;
  }

  close(id: string, options: WorkFrameRecordOptions): void {
    this.requireFrame(id);
    this.frames.delete(id);
    if (this.activeFrameId === id) {
      this.activeFrameId = this.frames.keys().next().value;
    }
    this.agent.records.logRecord({
      type: 'workframe.closed',
      source: options.source,
      frameId: id,
      ...(this.activeFrameId === undefined ? {} : { nextActiveFrameId: this.activeFrameId }),
      ...(options.toolCallId === undefined ? {} : { toolCallId: options.toolCallId }),
    });
  }

  attachContextPack(
    id: string,
    contextPackId: string,
    options: WorkFrameRecordOptions,
  ): WorkFrame {
    const frame = this.requireFrame(id);
    const next: WorkFrame = {
      ...frame,
      contextPackId,
    };
    this.frames.set(id, next);
    this.agent.records.logRecord({
      type: 'workframe.context_attached',
      source: options.source,
      frameId: id,
      contextPackId,
      ...(options.toolCallId === undefined ? {} : { toolCallId: options.toolCallId }),
    });
    return next;
  }

  list(): readonly WorkFrame[] {
    return [...this.frames.values()].map((frame) => ({ ...frame }));
  }

  requireFrame(id: string): WorkFrame {
    const frame = this.frames.get(id);
    if (frame === undefined) throw new Error(`WorkFrame "${id}" is not open`);
    return frame;
  }

  restoreOpened(frame: WorkFrame): void {
    this.frames.set(frame.id, frame);
    this.activeFrameId = frame.id;
  }

  restoreSwitched(frameId: string): void {
    if (this.frames.has(frameId)) this.activeFrameId = frameId;
  }

  restoreClosed(frameId: string, nextActiveFrameId?: string | undefined): void {
    this.frames.delete(frameId);
    this.activeFrameId =
      nextActiveFrameId !== undefined && this.frames.has(nextActiveFrameId)
        ? nextActiveFrameId
        : this.frames.keys().next().value;
  }

  restoreContextAttached(frameId: string, contextPackId: string): void {
    const frame = this.frames.get(frameId);
    if (frame === undefined) return;
    this.frames.set(frameId, {
      ...frame,
      contextPackId,
    });
  }
}
