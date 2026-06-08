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
  parseAitpCuratedRagCorpus,
  parseAitpCuratedRagPromotionDraft,
  parseAitpCuratedRagSearchResult,
} from './curated-rag';
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
    draftCuratedRagPromotion(input) {
      return createDynamicAitpCliBridge(options).draftCuratedRagPromotion(input);
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
