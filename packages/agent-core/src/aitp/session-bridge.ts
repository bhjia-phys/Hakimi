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
import {
  createAitpCliWriteBridgeExecutor,
  createAitpMcpFirstWriteBridgeExecutor,
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
