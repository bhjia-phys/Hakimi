import {
  createAitpCliBridge,
  resolveAitpScopeFromWorkFrame,
  type AitpCliBridge,
  type AitpCliBridgeOptions,
  type AitpCommandRunner,
  type AitpProcessGraphPromptPart,
  type AitpProcessGraphSliceProvider,
  type AitpWorkFrameScope,
} from './cli-bridge';
import { compileAitpProcessGraphSlice } from './compiler';
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
