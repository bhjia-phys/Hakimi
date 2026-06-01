import type { Agent } from '..';
import type {
  CompileResearchLedgerOptions,
  ResearchLedgerCompileResult,
  ResearchLedgerEvent,
  ResearchLedgerRegistry,
  ResearchLedgerWriteInput,
  ResearchLedgerWriteResult,
} from '../../research-ledger';
import { writeResearchLedgerEvent } from '../../research-ledger';
import { join } from 'pathe';

export type ResearchLedgerRecordSource = 'session-start' | 'model-tool' | 'controller' | 'replay';

export interface ResearchLedgerRecordOptions {
  readonly source: ResearchLedgerRecordSource;
  readonly toolCallId?: string | undefined;
}

export interface ResearchLedgerWriteOptions extends ResearchLedgerRecordOptions {
  readonly overwrite?: boolean | undefined;
}

export class ResearchLedgerManager {
  constructor(
    private readonly agent: Agent,
    readonly registry: ResearchLedgerRegistry,
  ) {}

  recordRootsLoaded(source: ResearchLedgerRecordSource): void {
    this.agent.records.logRecord({
      type: 'research_ledger.roots_loaded',
      source,
      roots: this.registry.getRoots(),
      eventCount: this.registry.listEvents().length,
      topics: this.registry.listTopics(),
      domains: this.registry.listDomains(),
      diagnostics: this.registry.getDiagnostics().map((diagnostic) => ({
        severity: diagnostic.severity,
        code: diagnostic.code,
        eventId: diagnostic.eventId,
        path: diagnostic.path,
        rootPath: diagnostic.rootPath,
      })),
    });
  }

  recordEventLoaded(event: ResearchLedgerEvent, options: ResearchLedgerRecordOptions): void {
    this.agent.records.logRecord({
      type: 'research_ledger.event_loaded',
      source: options.source,
      eventId: event.metadata.id,
      topic: event.metadata.topic,
      domain: event.metadata.domain,
      eventType: event.metadata.type,
      ...(options.toolCallId === undefined ? {} : { toolCallId: options.toolCallId }),
    });
  }

  async writeEvent(
    input: Omit<ResearchLedgerWriteInput, 'root'>,
    options: ResearchLedgerWriteOptions,
  ): Promise<ResearchLedgerWriteResult> {
    const root = this.defaultWriteRoot();
    if (this.registry.getEvent(input.metadata.id) !== undefined && input.overwrite !== true) {
      throw new Error(`Research ledger event "${input.metadata.id}" already exists`);
    }
    const result = await writeResearchLedgerEvent({
      ...input,
      root,
      overwrite: options.overwrite ?? input.overwrite,
    });
    this.registry.ensureRoot(root);
    this.registry.register(result.event, { replace: options.overwrite ?? input.overwrite });
    this.recordEventWritten(result.event, result.path, options);
    return result;
  }

  defaultWriteRoot() {
    return (
      this.registry.getRoots().find((root) => root.source === 'project') ?? {
        path: join(this.agent.config.cwd, '.aitp/research-ledger'),
        source: 'project' as const,
      }
    );
  }

  recordEventWritten(
    event: ResearchLedgerEvent,
    path: string,
    options: ResearchLedgerRecordOptions,
  ): void {
    this.agent.records.logRecord({
      type: 'research_ledger.event_written',
      source: options.source,
      eventId: event.metadata.id,
      topic: event.metadata.topic,
      domain: event.metadata.domain,
      eventType: event.metadata.type,
      status: event.metadata.status,
      path,
      ...(options.toolCallId === undefined ? {} : { toolCallId: options.toolCallId }),
    });
  }

  recordProposalsCompiled(
    input: CompileResearchLedgerOptions,
    result: ResearchLedgerCompileResult,
    options: ResearchLedgerRecordOptions,
  ): void {
    this.agent.records.logRecord({
      type: 'research_ledger.proposals_compiled',
      source: options.source,
      topic: input.topic,
      domain: input.domain,
      proposalIds: result.proposals.map((proposal) => proposal.id),
      eventIds: [
        ...new Set(result.proposals.flatMap((proposal) => proposal.eventIds)),
      ].toSorted(),
      diagnostics: result.diagnostics.map((diagnostic) => ({
        severity: diagnostic.severity,
        code: diagnostic.code,
        eventId: diagnostic.eventId,
        proposalId: diagnostic.proposalId,
      })),
      ...(options.toolCallId === undefined ? {} : { toolCallId: options.toolCallId }),
    });
  }
}
