import {
  createAitpCliBridge,
  resolveAitpScopeFromWorkFrame,
  type AitpCliBridge,
  type AitpCliBridgeOptions,
  type AitpCommandRunner,
  type AitpCuratedRagProvider,
  type AitpProcessGraphPromptPart,
  type AitpProcessGraphSliceProvider,
  type AitpRecordRefLookupProvider,
  type AitpRuntimePayloadProfilesProvider,
  type AitpWorkFrameScope,
} from './cli-bridge';
import { compileAitpProcessGraphSlice } from './compiler';
import {
  parseAitpClaimRelationMap,
  type AitpClaimRelationMapProvider,
} from './claim-relation-map';
import {
  parseAitpCuratedRagChunk,
  parseAitpCuratedRagCorpus,
  parseAitpCuratedRagPromotionDraft,
  parseAitpCuratedRagSearchResult,
} from './curated-rag';
import {
  parseAitpLiteratureComparisonDraft,
  type AitpLiteratureComparisonDraftProvider,
} from './literature-comparison-draft';
import {
  parseAitpLiteratureSourceReviewHandoff,
  type AitpLiteratureSourceReviewHandoffProvider,
} from './literature-source-review-handoff';
import { parseAitpRecordRefLookup } from './record-ref-lookup';
import { parseAitpRuntimePayloadProfilesCatalog } from './runtime-payload-profiles';
import type { CompiledAitpProcessGraphSlice } from './types';
import {
  createAitpCliWriteBridgeExecutor,
  createAitpMcpFirstWriteBridgeExecutor,
  normalizeAitpWriteBridgePayload,
  aitpRuntimeBridgeTargetForOperation,
  type AitpMcpWriteBridgeTransport,
  type AitpWriteBridgeExecutor,
} from './write-bridge';
import type { WorkFrame } from '../research-action';

export interface DynamicAitpCliBridgeOptions {
  readonly basePath: () => string;
  readonly command?: string | undefined;
  readonly cwd?: string | undefined;
  readonly timeoutMs?: number | undefined;
  readonly runner?: AitpCommandRunner | undefined;
  readonly limit?: number | undefined;
  readonly resolveScope?:
    | ((workFrame: WorkFrame) => AitpWorkFrameScope | null | undefined)
    | undefined;
}

export interface DynamicAitpMcpFirstBridgeOptions extends DynamicAitpCliBridgeOptions {
  readonly mcpTransport?: AitpMcpWriteBridgeTransport | undefined;
  readonly fallbackOnMcpError?: boolean | undefined;
}

export function createDynamicAitpCliProcessGraphSliceProvider(
  options: DynamicAitpCliBridgeOptions,
): AitpProcessGraphSliceProvider {
  const resolveScope = options.resolveScope ?? resolveAitpScopeFromWorkFrame;
  return {
    async getProcessGraphSlice(input) {
      const scope = resolveScope(input.workFrame);
      if (scope === null || scope === undefined) return null;
      return createDynamicAitpCliBridge(options).readProcessGraphSlice({
        sessionId: scope.sessionId,
        claimId: scope.claimId,
        limit: options.limit,
        activeContext: promptText(input.prompt),
        signal: input.signal,
      });
    },
  };
}

export function createDynamicAitpMcpFirstProcessGraphSliceProvider(
  options: DynamicAitpMcpFirstBridgeOptions,
): AitpProcessGraphSliceProvider {
  const fallback = createDynamicAitpCliProcessGraphSliceProvider(options);
  const resolveScope = options.resolveScope ?? resolveAitpScopeFromWorkFrame;
  return {
    async getProcessGraphSlice(input) {
      const scope = resolveScope(input.workFrame);
      if (scope === null || scope === undefined) return null;
      const transport = options.mcpTransport;
      if (transport === undefined) {
        return fallback.getProcessGraphSlice(input);
      }
      try {
        const payload = await readProcessGraphSliceViaMcp({
          basePath: options.basePath(),
          scope,
          limit: options.limit,
          activeContext: promptText(input.prompt),
          signal: input.signal,
          transport,
        });
        return payload;
      } catch (error) {
        if (options.fallbackOnMcpError === false) throw error;
        return fallback.getProcessGraphSlice(input);
      }
    },
  };
}

export function createDynamicAitpCliClaimRelationMapProvider(
  options: DynamicAitpCliBridgeOptions,
): AitpClaimRelationMapProvider {
  const resolveScope = options.resolveScope ?? resolveAitpScopeFromWorkFrame;
  return {
    async getClaimRelationMap(input) {
      const scope = resolveScope(input.workFrame);
      if (scope === null || scope === undefined) return null;
      return createDynamicAitpCliBridge(options).readClaimRelationMap({
        sessionId: scope.sessionId,
        signal: input.signal,
      });
    },
  };
}

export function createDynamicAitpMcpFirstClaimRelationMapProvider(
  options: DynamicAitpMcpFirstBridgeOptions,
): AitpClaimRelationMapProvider {
  const fallback = createDynamicAitpCliClaimRelationMapProvider(options);
  const resolveScope = options.resolveScope ?? resolveAitpScopeFromWorkFrame;
  return {
    async getClaimRelationMap(input) {
      const scope = resolveScope(input.workFrame);
      if (scope === null || scope === undefined) return null;
      const transport = options.mcpTransport;
      if (transport === undefined) {
        return fallback.getClaimRelationMap(input);
      }
      try {
        const target = aitpRuntimeBridgeTargetForOperation('readClaimRelationMap');
        const rawPayload = await transport.callTool({
          toolName: target.mcpInvocation.tool,
          args: mcpArgsForAitpClaimRelationMapRead(options.basePath(), scope),
          signal: input.signal,
        });
        return parseAitpClaimRelationMap(normalizeAitpWriteBridgePayload(rawPayload));
      } catch (error) {
        if (options.fallbackOnMcpError === false) throw error;
        return fallback.getClaimRelationMap(input);
      }
    },
  };
}

export function createDynamicAitpCliWriteBridgeExecutor(
  options: DynamicAitpCliBridgeOptions,
): AitpWriteBridgeExecutor {
  return {
    executeWrite(input) {
      return createAitpCliWriteBridgeExecutor(
        createDynamicAitpCliBridge(options),
      ).executeWrite(input);
    },
  };
}

export function createDynamicAitpCliRuntimePayloadProfilesProvider(
  options: DynamicAitpCliBridgeOptions,
): AitpRuntimePayloadProfilesProvider {
  return {
    getRuntimePayloadProfiles(input = {}) {
      return createDynamicAitpCliBridge(options).readRuntimePayloadProfiles(input);
    },
  };
}

export function createDynamicAitpMcpFirstRuntimePayloadProfilesProvider(
  options: DynamicAitpMcpFirstBridgeOptions,
): AitpRuntimePayloadProfilesProvider {
  const fallback = createDynamicAitpCliRuntimePayloadProfilesProvider(options);
  return {
    async getRuntimePayloadProfiles(input = {}) {
      const transport = options.mcpTransport;
      if (transport === undefined) {
        return fallback.getRuntimePayloadProfiles(input);
      }
      try {
        const target = aitpRuntimeBridgeTargetForOperation('readRuntimePayloadProfiles');
        const rawPayload = await transport.callTool({
          toolName: target.mcpInvocation.tool,
          args: {},
          signal: input.signal,
        });
        return parseAitpRuntimePayloadProfilesCatalog(normalizeAitpWriteBridgePayload(rawPayload));
      } catch (error) {
        if (options.fallbackOnMcpError === false) throw error;
        return fallback.getRuntimePayloadProfiles(input);
      }
    },
  };
}

export function createDynamicAitpCliRecordRefLookupProvider(
  options: DynamicAitpCliBridgeOptions,
): AitpRecordRefLookupProvider {
  return {
    lookupRecordRefs(input) {
      return createDynamicAitpCliBridge(options).lookupRecordRefs(input);
    },
  };
}

export function createDynamicAitpMcpFirstRecordRefLookupProvider(
  options: DynamicAitpMcpFirstBridgeOptions,
): AitpRecordRefLookupProvider {
  const fallback = createDynamicAitpCliRecordRefLookupProvider(options);
  return {
    async lookupRecordRefs(input) {
      const transport = options.mcpTransport;
      if (transport === undefined) {
        return fallback.lookupRecordRefs(input);
      }
      try {
        const target = aitpRuntimeBridgeTargetForOperation('lookupRecordRefs');
        const rawPayload = await transport.callTool({
          toolName: target.mcpInvocation.tool,
          args: {
            base: options.basePath(),
            refs: [...input.refs],
          },
          signal: input.signal,
        });
        return parseAitpRecordRefLookup(normalizeAitpWriteBridgePayload(rawPayload));
      } catch (error) {
        if (options.fallbackOnMcpError === false) throw error;
        return fallback.lookupRecordRefs(input);
      }
    },
  };
}

export function createDynamicAitpCliCuratedRagProvider(
  options: DynamicAitpCliBridgeOptions,
): AitpCuratedRagProvider {
  return {
    getCuratedRagCorpus(input = {}) {
      return createDynamicAitpCliBridge(options).readCuratedRagCorpus(input);
    },
    searchCuratedRagCorpus(input) {
      return createDynamicAitpCliBridge(options).searchCuratedRagCorpus(input);
    },
    getCuratedRagChunk(input) {
      return createDynamicAitpCliBridge(options).readCuratedRagChunk(input);
    },
    draftCuratedRagPromotion(input) {
      return createDynamicAitpCliBridge(options).draftCuratedRagPromotion(input);
    },
  };
}

export function createDynamicAitpCliLiteratureSourceReviewHandoffProvider(
  options: DynamicAitpCliBridgeOptions,
): AitpLiteratureSourceReviewHandoffProvider {
  return {
    getLiteratureSourceReviewHandoff(input) {
      return createDynamicAitpCliBridge(options).readLiteratureSourceReviewHandoff(input);
    },
  };
}

export function createDynamicAitpCliLiteratureComparisonDraftProvider(
  options: DynamicAitpCliBridgeOptions,
): AitpLiteratureComparisonDraftProvider {
  return {
    getLiteratureComparisonDraft(input) {
      return createDynamicAitpCliBridge(options).readLiteratureComparisonDraft(input);
    },
  };
}

export function createDynamicAitpMcpFirstCuratedRagProvider(
  options: DynamicAitpMcpFirstBridgeOptions,
): AitpCuratedRagProvider {
  const fallback = createDynamicAitpCliCuratedRagProvider(options);
  return {
    async getCuratedRagCorpus(input = {}) {
      const transport = options.mcpTransport;
      if (transport === undefined) {
        return fallback.getCuratedRagCorpus(input);
      }
      try {
        const target = aitpRuntimeBridgeTargetForOperation('readCuratedRagCorpus');
        const rawPayload = await transport.callTool({
          toolName: target.mcpInvocation.tool,
          args: { base: options.basePath() },
          signal: input.signal,
        });
        return parseAitpCuratedRagCorpus(normalizeAitpWriteBridgePayload(rawPayload));
      } catch (error) {
        if (options.fallbackOnMcpError === false) throw error;
        return fallback.getCuratedRagCorpus(input);
      }
    },
    async searchCuratedRagCorpus(input) {
      const transport = options.mcpTransport;
      if (transport === undefined) {
        return fallback.searchCuratedRagCorpus(input);
      }
      try {
        const target = aitpRuntimeBridgeTargetForOperation('searchCuratedRagCorpus');
        const args: Record<string, unknown> = {
          base: options.basePath(),
          query: input.query,
        };
        if (input.limit !== undefined) args['limit'] = input.limit;
        const rawPayload = await transport.callTool({
          toolName: target.mcpInvocation.tool,
          args,
          signal: input.signal,
        });
        return parseAitpCuratedRagSearchResult(normalizeAitpWriteBridgePayload(rawPayload));
      } catch (error) {
        if (options.fallbackOnMcpError === false) throw error;
        return fallback.searchCuratedRagCorpus(input);
      }
    },
    async getCuratedRagChunk(input) {
      const transport = options.mcpTransport;
      if (transport === undefined) {
        return fallback.getCuratedRagChunk!(input);
      }
      try {
        const target = aitpRuntimeBridgeTargetForOperation('readCuratedRagChunk');
        const rawPayload = await transport.callTool({
          toolName: target.mcpInvocation.tool,
          args: {
            base: options.basePath(),
            chunk_id: input.chunkId,
          },
          signal: input.signal,
        });
        return parseAitpCuratedRagChunk(normalizeAitpWriteBridgePayload(rawPayload));
      } catch (error) {
        if (options.fallbackOnMcpError === false) throw error;
        return fallback.getCuratedRagChunk!(input);
      }
    },
    async draftCuratedRagPromotion(input) {
      const transport = options.mcpTransport;
      if (transport === undefined) {
        return fallback.draftCuratedRagPromotion!(input);
      }
      try {
        const target = aitpRuntimeBridgeTargetForOperation('draftCuratedRagPromotion');
        const args: Record<string, unknown> = {
          base: options.basePath(),
          chunk_id: input.chunkId,
        };
        if (input.topicId !== undefined) args['topic_id'] = input.topicId;
        if (input.claimId !== undefined) args['claim_id'] = input.claimId;
        if (input.connectorId !== undefined) args['connector_id'] = input.connectorId;
        if (input.promotionIntent !== undefined) args['promotion_intent'] = input.promotionIntent;
        const rawPayload = await transport.callTool({
          toolName: target.mcpInvocation.tool,
          args,
          signal: input.signal,
        });
        return parseAitpCuratedRagPromotionDraft(normalizeAitpWriteBridgePayload(rawPayload));
      } catch (error) {
        if (options.fallbackOnMcpError === false) throw error;
        return fallback.draftCuratedRagPromotion!(input);
      }
    },
  };
}

export function createDynamicAitpMcpFirstLiteratureSourceReviewHandoffProvider(
  options: DynamicAitpMcpFirstBridgeOptions,
): AitpLiteratureSourceReviewHandoffProvider {
  const fallback = createDynamicAitpCliLiteratureSourceReviewHandoffProvider(options);
  return {
    async getLiteratureSourceReviewHandoff(input) {
      const transport = options.mcpTransport;
      if (transport === undefined) {
        return fallback.getLiteratureSourceReviewHandoff(input);
      }
      try {
        const target = aitpRuntimeBridgeTargetForOperation('readLiteratureSourceReviewHandoff');
        const args: Record<string, unknown> = {
          base: options.basePath(),
          session_id: input.sessionId,
          uri: input.uri,
          label: input.label,
          short_summary: input.shortSummary,
          detected_relevance: input.detectedRelevance,
        };
        if (input.externalId !== undefined) args['external_id'] = input.externalId;
        if (input.optionalClaimId !== undefined) args['optional_claim_id'] = input.optionalClaimId;
        if (input.scopedOutput !== undefined) args['scoped_output'] = input.scopedOutput;
        if (input.reviewedRefs !== undefined) args['reviewed_refs'] = [...input.reviewedRefs];
        const rawPayload = await transport.callTool({
          toolName: target.mcpInvocation.tool,
          args,
          signal: input.signal,
        });
        return parseAitpLiteratureSourceReviewHandoff(
          normalizeAitpWriteBridgePayload(rawPayload),
        );
      } catch (error) {
        if (options.fallbackOnMcpError === false) throw error;
        return fallback.getLiteratureSourceReviewHandoff(input);
      }
    },
  };
}

export function createDynamicAitpMcpFirstLiteratureComparisonDraftProvider(
  options: DynamicAitpMcpFirstBridgeOptions,
): AitpLiteratureComparisonDraftProvider {
  const fallback = createDynamicAitpCliLiteratureComparisonDraftProvider(options);
  return {
    async getLiteratureComparisonDraft(input) {
      const transport = options.mcpTransport;
      if (transport === undefined) {
        return fallback.getLiteratureComparisonDraft(input);
      }
      try {
        const target = aitpRuntimeBridgeTargetForOperation('readLiteratureComparisonDraft');
        const args: Record<string, unknown> = {
          base: options.basePath(),
          session_id: input.sessionId,
          comparison_question: input.comparisonQuestion,
          source_refs: [...input.sourceRefs],
        };
        if (input.dimensions !== undefined) args['dimensions'] = [...input.dimensions];
        if (input.optionalClaimId !== undefined) args['optional_claim_id'] = input.optionalClaimId;
        if (input.rationale !== undefined) args['rationale'] = input.rationale;
        const rawPayload = await transport.callTool({
          toolName: target.mcpInvocation.tool,
          args,
          signal: input.signal,
        });
        return parseAitpLiteratureComparisonDraft(
          normalizeAitpWriteBridgePayload(rawPayload),
        );
      } catch (error) {
        if (options.fallbackOnMcpError === false) throw error;
        return fallback.getLiteratureComparisonDraft(input);
      }
    },
  };
}

export function createDynamicAitpMcpFirstWriteBridgeExecutor(
  options: DynamicAitpMcpFirstBridgeOptions,
): AitpWriteBridgeExecutor {
  const fallback = createDynamicAitpCliWriteBridgeExecutor(options);
  return createAitpMcpFirstWriteBridgeExecutor({
    basePath: options.basePath,
    transport: options.mcpTransport,
    fallback,
    fallbackOnMcpError: options.fallbackOnMcpError,
  });
}

function createDynamicAitpCliBridge(options: DynamicAitpCliBridgeOptions): AitpCliBridge {
  return createAitpCliBridge(dynamicBridgeOptions(options));
}

async function readProcessGraphSliceViaMcp(input: {
  readonly basePath: string;
  readonly scope: AitpWorkFrameScope;
  readonly limit?: number | undefined;
  readonly activeContext: string;
  readonly signal?: AbortSignal | undefined;
  readonly transport: AitpMcpWriteBridgeTransport;
}): Promise<CompiledAitpProcessGraphSlice> {
  const target = aitpRuntimeBridgeTargetForOperation('readProcessGraphSlice');
  const rawPayload = await input.transport.callTool({
    toolName: target.mcpInvocation.tool,
    args: mcpArgsForAitpProcessGraphSliceRead(input.basePath, input.scope, input.limit),
    signal: input.signal,
  });
  const payload = normalizeAitpWriteBridgePayload(rawPayload);
  return compileAitpProcessGraphSlice(payload, {
    activeContext: input.activeContext,
  });
}

export function mcpArgsForAitpProcessGraphSliceRead(
  basePath: string,
  scope: AitpWorkFrameScope,
  limit?: number | undefined,
): Readonly<Record<string, unknown>> {
  const args: Record<string, unknown> = {
    base: basePath,
    session_id: scope.sessionId,
  };
  if (scope.claimId !== undefined && scope.claimId.trim().length > 0) {
    args['claim_id'] = scope.claimId.trim();
  }
  if (limit !== undefined) {
    args['limit'] = limit;
  }
  return args;
}

export function mcpArgsForAitpClaimRelationMapRead(
  basePath: string,
  scope: AitpWorkFrameScope,
): Readonly<Record<string, unknown>> {
  return {
    base: basePath,
    session_id: scope.sessionId,
  };
}

function dynamicBridgeOptions(options: DynamicAitpCliBridgeOptions): AitpCliBridgeOptions {
  return {
    basePath: options.basePath(),
    command: options.command,
    cwd: options.cwd,
    timeoutMs: options.timeoutMs,
    runner: options.runner,
  };
}

function promptText(prompt: readonly AitpProcessGraphPromptPart[]): string {
  return prompt
    .filter((part) => part.type === 'text' && typeof part.text === 'string')
    .map((part) => part.text)
    .join('\n');
}
