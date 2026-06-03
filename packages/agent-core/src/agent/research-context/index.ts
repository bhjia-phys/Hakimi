import type { Agent } from '..';
import {
  compileResearchContextPack,
  type CompileResearchContextPackOptions,
  type ResearchContextPack,
  type ResearchContextPackId,
  type ResearchContextRecordSource,
} from '../../research-context';

export interface ResearchContextRecordOptions {
  readonly source: ResearchContextRecordSource;
  readonly toolCallId?: string | undefined;
}

export interface CompileResearchContextForWorkFrameInput
  extends Omit<CompileResearchContextPackOptions, 'workFrame'> {
  readonly workFrameId?: string | undefined;
  readonly attachToWorkFrame?: boolean | undefined;
}

export class ResearchContextManager {
  private readonly packs = new Map<ResearchContextPackId, ResearchContextPack>();

  constructor(private readonly agent: Agent) {}

  compileForWorkFrame(
    input: CompileResearchContextForWorkFrameInput,
    options: ResearchContextRecordOptions,
  ): ResearchContextPack {
    const frame =
      input.workFrameId === undefined
        ? this.agent.workFrames.active
        : this.agent.workFrames.requireFrame(input.workFrameId);
    if (frame === undefined) {
      throw new Error('ResearchContext compile requires an active WorkFrame or workFrameId.');
    }
    const pack = compileResearchContextPack({
      workFrame: frame,
      domainProfiles: this.agent.domainProfiles,
      workflowRecipes: this.agent.workflowRecipes,
      physicsMemory: this.agent.physicsMemory?.registry,
      researchLedger: this.agent.researchLedger?.registry,
      researchHarness: this.agent.researchHarness,
      reliabilityFloor: input.reliabilityFloor,
      bridgePolicy: input.bridgePolicy,
      includeLedgerStatuses: input.includeLedgerStatuses,
      limits: input.limits,
    });
    this.packs.set(pack.id, pack);
    this.recordContextCompiled(pack, options);
    if (input.attachToWorkFrame !== false) {
      this.agent.workFrames.attachContextPack(frame.id, pack.id, {
        source: options.source,
        toolCallId: options.toolCallId,
      });
    }
    return pack;
  }

  listPacks(): readonly ResearchContextPack[] {
    return [...this.packs.values()].toSorted((a, b) => a.id.localeCompare(b.id));
  }

  getPack(id: ResearchContextPackId): ResearchContextPack | undefined {
    return this.packs.get(id);
  }

  requirePack(id: ResearchContextPackId): ResearchContextPack {
    const pack = this.getPack(id);
    if (pack === undefined) throw new Error(`ResearchContextPack "${id}" is not compiled.`);
    return pack;
  }

  restorePack(pack: ResearchContextPack): void {
    this.packs.set(pack.id, pack);
  }

  private recordContextCompiled(
    pack: ResearchContextPack,
    options: ResearchContextRecordOptions,
  ): void {
    this.agent.records.logRecord({
      type: 'research_context.context_compiled',
      source: options.source,
      pack,
      workFrameId: pack.workFrameId,
      contextPackId: pack.id,
      domain: pack.domain,
      topic: pack.topic,
      profileIds: pack.profiles.map((profile) => profile.id),
      workflowIds: pack.workflows.map((workflow) => workflow.id),
      capsuleIds: pack.physics.capsules.map((capsule) => capsule.id),
      ledgerProposalIds: pack.ledger.proposals.map((proposal) => proposal.id),
      actionBindingIds: pack.actionBindings.map((binding) => binding.id),
      domainPackId: pack.domainPack?.id,
      evalCaseIds: pack.domainPack?.evalCaseIds ?? [],
      requiredToolNames: pack.domainPack?.requiredTools ?? [],
      diagnostics: pack.diagnostics.map((diagnostic) => ({
        severity: diagnostic.severity,
        code: diagnostic.code,
        source: diagnostic.source,
        refId: diagnostic.refId,
      })),
      ...(options.toolCallId === undefined ? {} : { toolCallId: options.toolCallId }),
    });
  }
}
