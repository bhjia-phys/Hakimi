import type { Agent } from '..';
import type {
  CompileResearchLedgerOptions,
  ResearchLedgerCompileResult,
  ResearchLedgerEvent,
  ResearchLedgerRegistry,
} from '../../research-ledger';

export type ResearchLedgerRecordSource = 'session-start' | 'model-tool' | 'controller' | 'replay';

export interface ResearchLedgerRecordOptions {
  readonly source: ResearchLedgerRecordSource;
  readonly toolCallId?: string | undefined;
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
