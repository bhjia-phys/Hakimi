/**
 * `aitpResearch` domain — `ISessionAitpAdapter` implementation.
 *
 * Resolves the AITP plugin root from the session skill catalog
 * (`getPluginSkill('aitp-research-protocol', 'aitp')`), discovers the contract
 * identity by strictly reading and validating the shipped
 * `aitp.contract.json` + `kimi.plugin.json` through `IHostFileSystem`, probes
 * Python through the `AitpLauncher`, and exposes the AITP CLI surface (`enter`
 * / `list` / `show` / `check` / `record/note prepare/save`). Strictly consumes
 * the AITP 0.8/0.9 adapter contracts; the 0.9 contract adds atomic scoped
 * `record save` preconditions. Never calls `init`, `inventory`, or
 * `backfill --apply`; never writes canonical AITP files directly.
 * `not_initialized` workspaces become `degraded` — the adapter does not
 * auto-init or adopt. Mutations are single-flight: a concurrent mutation is
 * rejected until the current one settles. Inactive adapters are zero-I/O: no
 * probe, no spawn, no CLI call, no filesystem read. `reset()` returns the
 * adapter to its inactive zero-I/O state. Bound at Session scope.
 */

import { dirname, isAbsolute, join } from 'pathe';

import { Service } from '#/_base/di/service';
import { IHostProcessService } from '#/os/interface/hostProcess';
import { IHostFileSystem } from '#/os/interface/hostFileSystem';
import { ILogService } from '#/_base/log/log';
import { ISessionContext } from '#/session/sessionContext/sessionContext';
import { ISessionSkillCatalog } from '#/session/sessionSkillCatalog/skillCatalog';

import { AitpLauncher, isAitpNotInitializedError } from './aitpLauncher';
import {
  ISessionAitpAdapter,
  type AitpAdapterCheckOptions,
  type AitpAdapterEnterOptions,
  type AitpAdapterListOptions,
  type AitpAdapterNotePrepareOptions,
  type AitpAdapterNoteSaveOptions,
  type AitpAdapterRecordPrepareOptions,
  type AitpAdapterRecordSaveOptions,
  type AitpAdapterShowOptions,
} from './sessionAitpAdapter';
import type {
  AitpAdapterHealth,
  AitpCheckReport,
  AitpContractIdentity,
  AitpEnterResult,
  AitpListResult,
  AitpNotePrepareResult,
  AitpNoteSaveResult,
  AitpRecordPrepareResult,
  AitpRecordSaveResult,
  AitpShowResult,
} from '../types';
import { AitpResearchError, AitpResearchErrors } from '../errors';

const AITP_PLUGIN_ID = 'aitp-research-protocol';
const AITP_SKILL_NAME = 'aitp';
const CONTRACT_FILE = 'aitp.contract.json';
const MANIFEST_FILE = 'kimi.plugin.json';
const SUPPORTED_CONTRACTS: ReadonlyMap<string, string> = new Map([
  ['aitp/adapter-contract-0.1', '0.1'],
  ['aitp/adapter-contract-0.2', '0.2'],
] as const);

interface ContractFile {
  readonly schema?: unknown;
  readonly plugin?: {
    readonly name?: unknown;
    readonly version?: unknown;
  };
  readonly python?: {
    readonly launcher?: unknown;
  };
}

interface ManifestFile {
  readonly name?: unknown;
  readonly version?: unknown;
}

interface LifecycleOperation {
  readonly generation: number;
  readonly signal: AbortSignal;
}

function combineSignals(first: AbortSignal, second: AbortSignal | undefined): AbortSignal {
  return second === undefined ? first : AbortSignal.any([first, second]);
}

function isOperationCancelled(error: unknown): error is AitpResearchError {
  return error instanceof AitpResearchError
    && error.code === AitpResearchErrors.codes.AITP_ADAPTER_OPERATION_CANCELLED;
}

export class SessionAitpAdapterService extends Service implements ISessionAitpAdapter {
  declare readonly _serviceBrand: undefined;

  private healthState: AitpAdapterHealth = { phase: 'inactive' };
  private contractIdentity: AitpContractIdentity | null = null;
  private launcher: AitpLauncher | null = null;
  private mutationInFlight = false;
  private lifecycleGeneration = 0;
  private lifecycleController = new AbortController();
  private probeInFlight: {
    readonly generation: number;
    readonly promise: Promise<AitpAdapterHealth>;
  } | undefined;

  constructor(
    @ISessionSkillCatalog private readonly skillCatalog: ISessionSkillCatalog,
    @IHostProcessService private readonly hostProcess: IHostProcessService,
    @IHostFileSystem private readonly hostFs: IHostFileSystem,
    @ISessionContext private readonly sessionCtx: ISessionContext,
    @ILogService private readonly log: ILogService,
  ) {
    super();
  }

  get health(): AitpAdapterHealth {
    return this.healthState;
  }

  resolveContractIdentity(): AitpContractIdentity | null {
    return this.contractIdentity;
  }

  isReady(): boolean {
    return this.healthState.phase === 'ready';
  }

  isDegraded(): boolean {
    return this.healthState.phase === 'degraded';
  }

  reset(): void {
    this.lifecycleGeneration += 1;
    this.lifecycleController.abort();
    this.lifecycleController = new AbortController();
    this.probeInFlight = undefined;
    this.healthState = { phase: 'inactive' };
    this.contractIdentity = null;
    this.launcher = null;
    // Keep this lock until the old mutation settles. A reset cannot prove that
    // an external save did not take effect after its process was interrupted.
  }

  override dispose(): void {
    this.reset();
    super.dispose();
  }

  probe(): Promise<AitpAdapterHealth> {
    const operation = this.captureLifecycle();
    if (this.probeInFlight?.generation === operation.generation) {
      return this.probeInFlight.promise;
    }
    const promise = this.runProbe(operation);
    this.probeInFlight = { generation: operation.generation, promise };
    void promise.then(
      () => { this.clearProbeInFlight(promise); },
      () => { this.clearProbeInFlight(promise); },
    );
    return promise;
  }

  async enter(options?: AitpAdapterEnterOptions): Promise<AitpEnterResult> {
    return this.executeRead(options, (launcher, signal) =>
      launcher.enter(options?.workstream, options?.recent, { signal }),
    );
  }

  async list(options?: AitpAdapterListOptions): Promise<AitpListResult> {
    return this.executeRead(options, (launcher, signal) =>
      launcher.list(options?.workstream, options?.kind, options?.since, { signal }),
    );
  }

  async show(options: AitpAdapterShowOptions): Promise<AitpShowResult> {
    return this.executeRead(options, (launcher, signal) =>
      launcher.show(options.id, { signal }),
    );
  }

  async check(options?: AitpAdapterCheckOptions): Promise<AitpCheckReport> {
    return this.executeRead(options, (launcher, signal) =>
      launcher.check(options?.workstream, { signal }),
      true,
    );
  }

  async recordPrepare(options: AitpAdapterRecordPrepareOptions): Promise<AitpRecordPrepareResult> {
    return this.singleFlight(options, (launcher, signal) =>
      launcher.recordPrepare({
        kind: options.kind,
        authority: options.authority,
        createdBy: options.createdBy,
        idempotencyKey: options.idempotencyKey,
        workstreams: options.workstreams,
      }, { signal }),
    );
  }

  async recordSave(options: AitpAdapterRecordSaveOptions): Promise<AitpRecordSaveResult> {
    const usesAtomicScope = options.expectedTopic !== undefined || options.exactWorkstream !== undefined;
    if (usesAtomicScope && this.contractIdentity?.contractVersion !== '0.2') {
      throw new AitpResearchError(
        AitpResearchErrors.codes.AITP_ADAPTER_CONTRACT_UNKNOWN,
        'Checkpoint-bound record save requires AITP adapter-contract-0.2.',
      );
    }
    return this.singleFlight(options, (launcher, signal) =>
      launcher.recordSave({
        draftPath: options.draftPath,
        expectedTopic: options.expectedTopic,
        exactWorkstream: options.exactWorkstream,
      }, { signal }),
    );
  }

  async notePrepare(options: AitpAdapterNotePrepareOptions): Promise<AitpNotePrepareResult> {
    return this.singleFlight(options, (launcher, signal) =>
      launcher.notePrepare({
        mode: options.mode,
        title: options.title,
        createdBy: options.createdBy,
        workstreams: options.workstreams,
      }, { signal }),
    );
  }

  async noteSave(options: AitpAdapterNoteSaveOptions): Promise<AitpNoteSaveResult> {
    return this.singleFlight(options, (launcher, signal) =>
      launcher.noteSave(options.draftPath, { signal }),
    );
  }

  private async runProbe(operation: LifecycleOperation): Promise<AitpAdapterHealth> {
    this.assertCurrent(operation);
    this.healthState = { ...this.healthState, phase: 'probing' };
    try {
      const identity = await this.resolveIdentityFromCatalog(operation);
      this.assertCurrent(operation);
      if (identity === null) {
        this.healthState = {
          phase: 'degraded',
          lastCheckAt: Date.now(),
          lastError: 'Could not resolve a compatible AITP plugin contract from skill catalog',
        };
        return this.healthState;
      }
      const candidate = new AitpLauncher(this.hostProcess, {
        launcherScript: identity.launcherPath,
        cwd: this.sessionCtx.cwd,
      });
      const python = await candidate.probePython({ signal: operation.signal });
      this.assertCurrent(operation);
      if (python === null) {
        this.healthState = {
          phase: 'degraded',
          contractVersion: identity.contractVersion,
          pluginVersion: identity.pluginVersion,
          lastCheckAt: Date.now(),
          lastError: 'No Python 3.11+ found',
        };
        return this.healthState;
      }

      this.contractIdentity = identity;
      // Pin the interpreter selected by the successful compatibility probe.
      // Commands can now reach their OS spawn without a second asynchronous
      // Python search opening a gate-to-mutation phase-change window.
      this.launcher = new AitpLauncher(this.hostProcess, {
        launcherScript: identity.launcherPath,
        cwd: this.sessionCtx.cwd,
        pythonPath: python,
      });
      this.healthState = {
        phase: 'ready',
        contractVersion: identity.contractVersion,
        pluginVersion: identity.pluginVersion,
        pythonVersion: python,
        lastCheckAt: Date.now(),
      };
      return this.healthState;
    } catch (error) {
      this.assertCurrent(operation);
      const message = error instanceof Error ? error.message : String(error);
      this.healthState = {
        phase: 'degraded',
        lastCheckAt: Date.now(),
        lastError: message,
      };
      this.log.warn('aitpResearch: probe failed', { error: message });
      return this.healthState;
    }
  }

  private async executeRead<T>(
    options: { readonly signal?: AbortSignal } | undefined,
    operation: (launcher: AitpLauncher, signal: AbortSignal) => Promise<{ readonly data: T }>,
    checkFailed = false,
  ): Promise<T> {
    const lifecycle = this.captureLifecycle();
    const launcher = this.requireLauncher(lifecycle);
    const signal = combineSignals(lifecycle.signal, options?.signal);
    try {
      const result = await operation(launcher, signal);
      this.assertCurrent(lifecycle);
      return result.data;
    } catch (error) {
      this.assertCurrent(lifecycle);
      if (isOperationCancelled(error)) throw error;
      this.maybeDegrade(error, checkFailed);
      throw error;
    }
  }

  private async singleFlight<T>(
    options: { readonly signal?: AbortSignal },
    operation: (launcher: AitpLauncher, signal: AbortSignal) => Promise<{ readonly data: T }>,
  ): Promise<T> {
    if (this.mutationInFlight) {
      throw new AitpResearchError(
        AitpResearchErrors.codes.AITP_ADAPTER_SINGLE_FLIGHT,
        'An AITP mutation is already in progress',
      );
    }
    const lifecycle = this.captureLifecycle();
    const launcher = this.requireLauncher(lifecycle);
    const signal = combineSignals(lifecycle.signal, options.signal);
    this.mutationInFlight = true;
    try {
      const result = await operation(launcher, signal);
      this.assertMutationCurrent(lifecycle);
      return result.data;
    } catch (error) {
      this.assertMutationCurrent(lifecycle);
      if (isOperationCancelled(error)) throw error;
      throw error;
    } finally {
      this.mutationInFlight = false;
    }
  }

  private captureLifecycle(): LifecycleOperation {
    return {
      generation: this.lifecycleGeneration,
      signal: this.lifecycleController.signal,
    };
  }

  private assertCurrent(operation: LifecycleOperation): void {
    if (operation.generation !== this.lifecycleGeneration || operation.signal.aborted) {
      throw new AitpResearchError(
        AitpResearchErrors.codes.AITP_ADAPTER_OPERATION_CANCELLED,
        'AITP operation was invalidated by Research Mode reset or exit.',
      );
    }
  }

  private assertMutationCurrent(operation: LifecycleOperation): void {
    if (operation.generation !== this.lifecycleGeneration || operation.signal.aborted) {
      throw new AitpResearchError(
        AitpResearchErrors.codes.AITP_ADAPTER_OPERATION_CANCELLED,
        'AITP mutation was invalidated by Research Mode reset or exit and may have completed externally. Inspect canonical AITP state before retrying with the same recovery identity (prepare idempotency key or draft path).',
      );
    }
  }

  private clearProbeInFlight(promise: Promise<AitpAdapterHealth>): void {
    if (this.probeInFlight?.promise === promise) this.probeInFlight = undefined;
  }

  private requireLauncher(operation: LifecycleOperation): AitpLauncher {
    this.assertCurrent(operation);
    if (this.launcher === null) {
      throw new AitpResearchError(
        AitpResearchErrors.codes.AITP_ADAPTER_NOT_READY,
        'AITP adapter has not been probed. Enter Research Mode first.',
      );
    }
    return this.launcher;
  }

  private maybeDegrade(error: unknown, checkFailed = false): void {
    const notInitialized = isAitpNotInitializedError(error);
    const errorCode: string | undefined = error instanceof AitpResearchError ? error.code : undefined;
    const unavailableCheck = checkFailed && error instanceof AitpResearchError && (
      error.details?.['aitpCode'] !== undefined ||
      errorCode === AitpResearchErrors.codes.AITP_ADAPTER_CONTRACT_UNKNOWN ||
      errorCode === AitpResearchErrors.codes.AITP_ADAPTER_SPAWN_FAILED ||
      errorCode === AitpResearchErrors.codes.AITP_ADAPTER_OUTPUT_LIMIT ||
      errorCode === AitpResearchErrors.codes.AITP_ADAPTER_TIMEOUT
    );
    if (!notInitialized && !unavailableCheck) return;

    const message = error instanceof Error ? error.message : String(error);
    this.healthState = {
      ...this.healthState,
      phase: 'degraded',
      notInitialized: notInitialized ? true : this.healthState.notInitialized,
      lastCheckAt: Date.now(),
      lastError: message,
    };
  }

  private async resolveIdentityFromCatalog(operation: LifecycleOperation): Promise<AitpContractIdentity | null> {
    this.assertCurrent(operation);
    const skill = this.skillCatalog.catalog.getPluginSkill(AITP_PLUGIN_ID, AITP_SKILL_NAME);
    if (skill === undefined) return null;
    const skillDir = dirname(skill.path);
    const pluginRoot = await this.findPluginRoot(skillDir, operation);
    this.assertCurrent(operation);
    if (pluginRoot === null) return null;

    const contractPath = join(pluginRoot, CONTRACT_FILE);
    const manifestPath = join(pluginRoot, MANIFEST_FILE);

    let contractRaw: string;
    let manifestRaw: string;
    try {
      [contractRaw, manifestRaw] = await Promise.all([
        this.hostFs.readText(contractPath),
        this.hostFs.readText(manifestPath),
      ]);
    } catch {
      this.assertCurrent(operation);
      return null;
    }
    this.assertCurrent(operation);

    let contract: ContractFile;
    let manifest: ManifestFile;
    try {
      contract = JSON.parse(contractRaw) as ContractFile;
      manifest = JSON.parse(manifestRaw) as ManifestFile;
    } catch {
      return null;
    }

    const contractVersion = typeof contract.schema === 'string'
      ? SUPPORTED_CONTRACTS.get(contract.schema)
      : undefined;
    if (contractVersion === undefined) return null;
    if (
      contract.plugin?.name !== AITP_PLUGIN_ID ||
      typeof contract.plugin.version !== 'string' ||
      contract.plugin.version.length === 0
    ) return null;
    if (
      manifest.name !== AITP_PLUGIN_ID ||
      manifest.version !== contract.plugin.version
    ) return null;

    const launcher = contract.python?.launcher;
    if (
      typeof launcher !== 'string' ||
      launcher.length === 0 ||
      launcher.trim() !== launcher ||
      isAbsolute(launcher)
    ) return null;
    const launcherPath = join(pluginRoot, launcher);
    if (!launcherPath.startsWith(`${pluginRoot}/`)) return null;

    return {
      contractVersion,
      pluginVersion: contract.plugin.version,
      launcherPath,
      pluginRoot,
    };
  }

  private async findPluginRoot(skillDir: string, operation: LifecycleOperation): Promise<string | null> {
    let current = skillDir;
    for (let i = 0; i < 10; i++) {
      this.assertCurrent(operation);
      const contractPath = join(current, CONTRACT_FILE);
      const manifestPath = join(current, MANIFEST_FILE);
      let isPluginRoot = false;
      try {
        const [contractStat, manifestStat] = await Promise.all([
          this.hostFs.stat(contractPath),
          this.hostFs.stat(manifestPath),
        ]);
        this.assertCurrent(operation);
        isPluginRoot = contractStat.isFile && manifestStat.isFile;
      } catch {
        this.assertCurrent(operation);
      }
      if (isPluginRoot) return current;

      const parent = dirname(current);
      if (parent === current) break;
      current = parent;
    }
    return null;
  }
}
