/**
 * In-process dispatcher — resolves a wire triple `(service, method, args)`
 * against a live engine scope and mirrors kap-server's dispatcher semantics
 * (reflection call, non-function members are property reads, `main` agent
 * auto-materialized via `ensureMainAgent`). Scope routing resolves workspace
 * instances through `IWorkspaceInstanceManager` and live sessions through the
 * App `SessionManager`, matching the server's `resolveScope`. Every argument,
 * result, and event payload passes through `wireClone` (a JSON round-trip), so
 * consumers observe byte-identical data no matter whether the call crossed a
 * socket or stayed in-process — and non-serializable leaks fail early.
 *
 * The dispatcher is the server-side enforcement point, with `globalContract`
 * as the method allowlist: unregistered services/methods, call/stream type
 * mismatches, and members outside the contract (engine-only methods such as
 * `markComplete`, or private getters) are rejected, and every args tuple is
 * parsed against the contract's input schema no matter what the client sent —
 * the exact-length tuples also reject smuggled extra arguments (e.g. the
 * goal `actor`). Property reads are limited to zero-arg contract entries.
 * Every failure surfaces as a wire-safe `RPCError` (see `toRPCError`):
 * stacks and causes never cross.
 *
 * Shared by the memory transport and the IPC host, which guarantees ipc and
 * memory behave identically by construction.
 */

import type { ServiceIdentifier } from '@moonshot-ai/agent-core-v2/_base/di/instantiation';
import { isError2 } from '@moonshot-ai/agent-core-v2/_base/errors/errors';
import { ISessionManager } from '@moonshot-ai/agent-core-v2/app/sessionManager/sessionManager';
import { getLiveSessionById } from '@moonshot-ai/agent-core-v2/app/sessionManager/sessionLookup';
import { IWorkspaceInstanceManager } from '@moonshot-ai/agent-core-v2/workspace/workspaceInstance/workspaceInstanceManager';
import { IAgentLifecycleService } from '@moonshot-ai/agent-core-v2/session/agentLifecycle/agentLifecycle';
import { ensureMainAgent } from '@moonshot-ai/agent-core-v2/session/agentLifecycle/mainAgent';
import { ISessionInteractionService } from '@moonshot-ai/agent-core-v2/session/interaction/interaction';
import { IEventBus } from '@moonshot-ai/agent-core-v2/app/event/eventBus';
import type { z } from 'zod';

import { globalContract, isStreamingContract } from '../../contract/index.js';
import type { ProcedureContract, StreamingProcedureContract } from '../../contract/types.js';
import type { EventSourceRef, IDisposable, ScopeRef } from '../../core/channel.js';
import { RPCError } from '../../core/errors.js';
import { KlientValidationError, parseInput } from '../../core/validation.js';
import { IEventService, serviceTokens } from './serviceRegistry.js';

/** Structural minimum of an engine `Scope` / `IScopeHandle`. */
export interface ScopeLike {
  readonly accessor: {
    get<T>(id: ServiceIdentifier<T>): T;
  };
}

/** JSON round-trip so in-process data matches wire data exactly. */
export function wireClone<T>(value: T): T {
  if (value === undefined) return value;
  return JSON.parse(JSON.stringify(value)) as T;
}

export interface MemoryDispatcher {
  call(scope: ScopeRef, service: string, method: string, args: unknown[]): Promise<unknown>;
  stream(scope: ScopeRef, service: string, method: string, args: unknown[]): AsyncIterable<unknown>;
  listen(
    scope: ScopeRef,
    source: EventSourceRef,
    handler: (data: unknown) => void,
    onError?: (error: Error) => void,
  ): IDisposable;
}

const REQUEST_INVALID = 40001;
const NOT_FOUND = 40404;
const INTERNAL_ERROR = 50001;

/**
 * Map any dispatcher failure to a wire-safe `RPCError`:
 * - `RPCError` passes through untouched;
 * - `KlientValidationError` (host-side contract parse) becomes 40001 with
 *   sanitized issue summaries — never the offending payload;
 * - an engine `Error2` becomes 40001 carrying its business `code` and original
 *   `details` under `details`;
 * - anything else is an internal 50001.
 * Messages survive; stacks and causes never do.
 */
export function toRPCError(error: unknown): RPCError {
  if (error instanceof RPCError) return error;
  if (error instanceof KlientValidationError) {
    return new RPCError(
      REQUEST_INVALID,
      error.message,
      error.issues.map((issue) => ({ path: issue.path.map(String).join('.'), message: issue.message })),
    );
  }
  if (isError2(error)) {
    return new RPCError(REQUEST_INVALID, error.message, {
      code: error.code,
      details: error.details,
    });
  }
  return new RPCError(INTERNAL_ERROR, error instanceof Error ? error.message : String(error));
}

type ScopeKind = 'core' | 'workspace' | 'session' | 'agent';

interface ResolvedScope {
  readonly kind: ScopeKind;
  readonly like: ScopeLike;
}

export function createMemoryDispatcher(root: ScopeLike): MemoryDispatcher {
  /** Mirrors kap-server's `resolveScope`, incl. main-agent materialization. */
  async function resolveScope(scope: ScopeRef): Promise<ResolvedScope> {
    if (scope.workspaceId !== undefined) {
      const workspace = await root.accessor
        .get(IWorkspaceInstanceManager)
        .getOrCreate({ workspaceId: scope.workspaceId });
      void workspace.program;
      return { kind: 'workspace', like: root };
    }
    if (scope.sessionId === undefined) return { kind: 'core', like: root };
    const session = root.accessor.get(ISessionManager).get(scope.sessionId) ?? getLiveSessionById(root.accessor, scope.sessionId);
    if (session === undefined) {
      throw new RPCError(NOT_FOUND, `session not found: ${scope.sessionId}`);
    }
    if (scope.agentId === undefined) return { kind: 'session', like: session };
    if (scope.agentId === 'main') {
      return { kind: 'agent', like: await ensureMainAgent(session) };
    }
    const agent = session.accessor.get(IAgentLifecycleService).get(scope.agentId);
    if (agent === undefined) {
      throw new RPCError(NOT_FOUND, `agent not found: ${scope.agentId}`);
    }
    return { kind: 'agent', like: agent };
  }

  function resolveService(resolved: ResolvedScope, service: string): Record<string, unknown> {
    const token = serviceTokens[service];
    if (token === undefined) {
      throw new RPCError(REQUEST_INVALID, `unknown service: ${service}`);
    }
    return resolved.like.accessor.get(token) as Record<string, unknown>;
  }

  /** The contract is the server-side allowlist: only registered procedures dispatch. */
  function resolveProcedure(
    service: string,
    method: string,
  ): ProcedureContract | StreamingProcedureContract {
    const serviceContract = globalContract[service];
    if (serviceContract === undefined) {
      throw new RPCError(REQUEST_INVALID, `unknown service: ${service}`);
    }
    const procedure = serviceContract[method];
    if (procedure === undefined) {
      throw new RPCError(REQUEST_INVALID, `method not found: ${service}.${method}`);
    }
    return procedure;
  }

  /** Property reads are only allowed for zero-arg contract entries. */
  function isZeroArgProcedure(procedure: ProcedureContract): boolean {
    const { items } = (procedure.input as z.ZodTuple).def;
    return Array.isArray(items) && items.length === 0;
  }

  /** Mirrors kap-server's WS `eventMap` per scope kind. */
  function subscribeStream(
    resolved: ResolvedScope,
    name: string,
    handler: (data: unknown) => void,
  ): IDisposable {
    if (resolved.kind === 'core' && name === 'events') {
      const bus = resolved.like.accessor.get(IEventService);
      return bus.subscribe((event) => {
        handler(wireClone(event));
      });
    }
    if (resolved.kind === 'session' && name === 'interactions') {
      const interaction = resolved.like.accessor.get(ISessionInteractionService);
      return interaction.onDidChangePending(() => {
        handler(wireClone(interaction.listPending()));
      });
    }
    if (resolved.kind === 'session' && name === 'interactions:resolved') {
      const interaction = resolved.like.accessor.get(ISessionInteractionService);
      return interaction.onDidResolve((resolution) => {
        handler(wireClone(resolution));
      });
    }
    if (resolved.kind === 'agent' && name === 'events') {
      const bus = resolved.like.accessor.get(IEventBus);
      return bus.subscribe((event) => {
        handler(wireClone(event));
      });
    }
    throw new RPCError(REQUEST_INVALID, `unknown event stream: ${name} (${resolved.kind})`);
  }

  function subscribeSource(
    resolved: ResolvedScope,
    source: EventSourceRef,
    handler: (data: unknown) => void,
  ): IDisposable {
    if (source.kind === 'stream') {
      return subscribeStream(resolved, source.name, handler);
    }
    if (!/^on[A-Z]/.test(source.event)) {
      throw new RPCError(REQUEST_INVALID, `not an event property: ${source.event}`);
    }
    const instance = resolveService(resolved, source.service);
    const emitter = instance[source.event];
    if (typeof emitter !== 'function') {
      throw new RPCError(REQUEST_INVALID, `event not found: ${source.service}.${source.event}`);
    }
    return (emitter as (listener: (data: unknown) => void) => IDisposable).call(
      instance,
      (data) => {
        handler(wireClone(data));
      },
    );
  }

  return {
    async call(scope, service, method, args) {
      const name = `${service}.${method}`;
      try {
        const procedure = resolveProcedure(service, method);
        if (isStreamingContract(procedure)) {
          throw new RPCError(REQUEST_INVALID, `${name} is a streaming procedure — use stream`);
        }
        // The host never trusts client-side validation: parse unconditionally,
        // then clone so arguments cross the same JSON boundary a socket
        // transport imposes (zod passes `z.unknown()` leaves by reference).
        const wireArgs = wireClone(parseInput(name, procedure, args));
        const resolved = await resolveScope(scope);
        const instance = resolveService(resolved, service);
        const member = instance[method];
        if (member === undefined) {
          throw new RPCError(REQUEST_INVALID, `method not found: ${name}`);
        }
        if (typeof member !== 'function') {
          if (!isZeroArgProcedure(procedure)) {
            throw new RPCError(REQUEST_INVALID, `not a readable property: ${name}`);
          }
          return wireClone(member);
        }
        const result = await (member as (...a: unknown[]) => unknown).apply(instance, wireArgs);
        return wireClone(result);
      } catch (error) {
        throw toRPCError(error);
      }
    },

    stream(scope, service, method, args): AsyncIterable<unknown> {
      const name = `${service}.${method}`;
      return {
        [Symbol.asyncIterator]() {
          let source: AsyncIterator<unknown> | undefined;
          let started: Promise<void> | undefined;
          // Wired only into the modelResolver.generate route below; aborting
          // it for other streams is a no-op (their return() cancels).
          const controller = new AbortController();

          // Contract resolution, input parsing, and scope resolution all
          // happen on the first `next()` — startup failures surface there.
          const ensureStarted = (): Promise<void> => {
            started ??= (async () => {
              const procedure = resolveProcedure(service, method);
              if (!isStreamingContract(procedure)) {
                throw new RPCError(
                  REQUEST_INVALID,
                  `${name} is not a streaming procedure — use call`,
                );
              }
              // Parse + clone the args tuple (same JSON boundary as call()).
              const wireArgs = wireClone(parseInput(name, procedure, args));
              const resolved = await resolveScope(scope);
              // Special case: modelResolver.generate routes to
              // getRequester(modelId).request(input, signal, params) because the
              // catalog has no `generate` method — the facade synthesises the call.
              if (service === 'modelResolver' && method === 'generate') {
                const catalog = resolveService(resolved, 'modelResolver');
                const [modelId, input, params] = wireArgs;
                const requester = (
                  catalog as {
                    getRequester(id: string): {
                      request(...a: unknown[]): AsyncIterable<unknown>;
                    };
                  }
                ).getRequester(modelId as string);
                const iterable = requester.request(input, controller.signal, params);
                source = iterable[Symbol.asyncIterator]();
                return;
              }
              const instance = resolveService(resolved, service);
              const member = instance[method];
              if (typeof member !== 'function') {
                throw new RPCError(REQUEST_INVALID, `not a streaming method: ${name}`);
              }
              // The underlying service method returns an AsyncIterable; we
              // wire-clone each yielded chunk so in-process consumers observe
              // the same data as networked ones.
              const iterable = (member as (...a: unknown[]) => unknown).apply(
                instance,
                wireArgs,
              ) as AsyncIterable<unknown>;
              source = iterable[Symbol.asyncIterator]();
            })();
            return started;
          };

          return {
            async next() {
              try {
                await ensureStarted();
                const result = await source!.next();
                if (result.done) return { done: true, value: undefined };
                return { done: false, value: wireClone(result.value) };
              } catch (error) {
                throw toRPCError(error);
              }
            },
            async return(value?: unknown) {
              try {
                controller.abort();
                await source?.return?.(value);
              } catch (error) {
                throw toRPCError(error);
              }
              return { done: true as const, value: undefined };
            },
          };
        },
      };
    },

    listen(scope, source, handler, onError) {
      // Scope resolution can be async (main-agent materialization); the
      // subscription attaches once settled. Disposing early cancels it.
      let inner: IDisposable | undefined;
      let disposed = false;
      void resolveScope(scope).then(
        (resolved) => {
          if (disposed) return;
          try {
            inner = subscribeSource(resolved, source, handler);
          } catch (error) {
            onError?.(toRPCError(error));
          }
        },
        (error: unknown) => {
          onError?.(toRPCError(error));
        },
      );
      return {
        dispose: () => {
          disposed = true;
          inner?.dispose();
        },
      };
    },
  };
}
