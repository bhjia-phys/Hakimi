/**
 * `aitpResearch` domain — `ISessionAitpAdapter` implementation.
 *
 * Resolves the AITP plugin root from the session skill catalog
 * (`getPluginSkill('aitp-research-protocol', 'aitp')`), discovers the contract
 * identity by strictly reading and validating the shipped
 * `aitp.contract.json` + `kimi.plugin.json` through `IHostFileSystem`, probes
 * Python through the `AitpLauncher`, and exposes the AITP CLI surface (`enter`
 * / `list` / `show` / `check` / `record/note prepare/save`). Strictly consumes
 * the AITP 0.8 adapter contract; never calls `init`, `inventory`, or
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
const SUPPORTED_CONTRACT_SCHEMA = 'aitp/adapter-contract-0.1';
const SUPPORTED_CONTRACT_VERSION = '0.1';

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

export class SessionAitpAdapterService extends Service implements ISessionAitpAdapter {
  declare readonly _serviceBrand: undefined;

  private healthState: AitpAdapterHealth = { phase: 'inactive' };
  private contractIdentity: AitpContractIdentity | null = null;
  private launcher: AitpLauncher | null = null;
  private mutationInFlight = false;

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
    this.healthState = { phase: 'inactive' };
    this.contractIdentity = null;
    this.launcher = null;
    this.mutationInFlight = false;
  }

  async probe(): Promise<AitpAdapterHealth> {
    this.healthState = { ...this.healthState, phase: 'probing' };
    try {
      const identity = await this.resolveIdentityFromCatalog();
      if (identity === null) {
        this.healthState = {
          phase: 'degraded',
          lastCheckAt: Date.now(),
          lastError: 'Could not resolve a compatible AITP plugin contract from skill catalog',
        };
        return this.healthState;
      }
      this.contractIdentity = identity;
      this.launcher = new AitpLauncher(this.hostProcess, {
        launcherScript: identity.launcherPath,
        cwd: this.sessionCtx.cwd,
      });

      const python = await this.launcher.probePython();
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

      this.healthState = {
        phase: 'ready',
        contractVersion: identity.contractVersion,
        pluginVersion: identity.pluginVersion,
        pythonVersion: python,
        lastCheckAt: Date.now(),
      };
      return this.healthState;
    } catch (error) {
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

  async enter(options?: AitpAdapterEnterOptions): Promise<AitpEnterResult> {
    const launcher = this.requireLauncher();
    try {
      const result = await launcher.enter(options?.workstream, options?.recent);
      return result.data;
    } catch (error) {
      this.maybeDegrade(error);
      throw error;
    }
  }

  async list(options?: AitpAdapterListOptions): Promise<AitpListResult> {
    const launcher = this.requireLauncher();
    try {
      const result = await launcher.list(options?.workstream, options?.kind, options?.since);
      return result.data;
    } catch (error) {
      this.maybeDegrade(error);
      throw error;
    }
  }

  async show(options: AitpAdapterShowOptions): Promise<AitpShowResult> {
    const launcher = this.requireLauncher();
    try {
      const result = await launcher.show(options.id);
      return result.data;
    } catch (error) {
      this.maybeDegrade(error);
      throw error;
    }
  }

  async check(options?: AitpAdapterCheckOptions): Promise<AitpCheckReport> {
    const launcher = this.requireLauncher();
    try {
      const result = await launcher.check(options?.workstream);
      return result.data;
    } catch (error) {
      this.maybeDegrade(error, true);
      throw error;
    }
  }

  async recordPrepare(options: AitpAdapterRecordPrepareOptions): Promise<AitpRecordPrepareResult> {
    return this.singleFlight(() => {
      const launcher = this.requireLauncher();
      return launcher.recordPrepare({
        kind: options.kind,
        authority: options.authority,
        createdBy: options.createdBy,
        idempotencyKey: options.idempotencyKey,
        workstreams: options.workstreams,
      });
    }).then((r) => r.data);
  }

  async recordSave(options: AitpAdapterRecordSaveOptions): Promise<AitpRecordSaveResult> {
    return this.singleFlight(() => {
      const launcher = this.requireLauncher();
      return launcher.recordSave(options.draftPath);
    }).then((r) => r.data);
  }

  async notePrepare(options: AitpAdapterNotePrepareOptions): Promise<AitpNotePrepareResult> {
    return this.singleFlight(() => {
      const launcher = this.requireLauncher();
      return launcher.notePrepare({
        mode: options.mode,
        title: options.title,
        createdBy: options.createdBy,
        workstreams: options.workstreams,
      });
    }).then((r) => r.data);
  }

  async noteSave(options: AitpAdapterNoteSaveOptions): Promise<AitpNoteSaveResult> {
    return this.singleFlight(() => {
      const launcher = this.requireLauncher();
      return launcher.noteSave(options.draftPath);
    }).then((r) => r.data);
  }

  private requireLauncher(): AitpLauncher {
    if (this.launcher === null) {
      throw new AitpResearchError(
        AitpResearchErrors.codes.AITP_ADAPTER_NOT_READY,
        'AITP adapter has not been probed. Enter Research Mode first.',
      );
    }
    return this.launcher;
  }

  private async singleFlight<T>(fn: () => Promise<{ readonly data: T }>): Promise<{ readonly data: T }> {
    if (this.mutationInFlight) {
      throw new AitpResearchError(
        AitpResearchErrors.codes.AITP_ADAPTER_SINGLE_FLIGHT,
        'An AITP mutation is already in progress',
      );
    }
    this.mutationInFlight = true;
    try {
      return await fn();
    } finally {
      this.mutationInFlight = false;
    }
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

  private async resolveIdentityFromCatalog(): Promise<AitpContractIdentity | null> {
    const skill = this.skillCatalog.catalog.getPluginSkill(AITP_PLUGIN_ID, AITP_SKILL_NAME);
    if (skill === undefined) return null;
    const skillDir = dirname(skill.path);
    const pluginRoot = await this.findPluginRoot(skillDir);
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
      return null;
    }

    let contract: ContractFile;
    let manifest: ManifestFile;
    try {
      contract = JSON.parse(contractRaw) as ContractFile;
      manifest = JSON.parse(manifestRaw) as ManifestFile;
    } catch {
      return null;
    }

    if (contract.schema !== SUPPORTED_CONTRACT_SCHEMA) return null;
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
      contractVersion: SUPPORTED_CONTRACT_VERSION,
      pluginVersion: contract.plugin.version,
      launcherPath,
      pluginRoot,
    };
  }

  private async findPluginRoot(skillDir: string): Promise<string | null> {
    let current = skillDir;
    for (let i = 0; i < 10; i++) {
      const contractPath = join(current, CONTRACT_FILE);
      const manifestPath = join(current, MANIFEST_FILE);
      let isPluginRoot = false;
      try {
        const [contractStat, manifestStat] = await Promise.all([
          this.hostFs.stat(contractPath),
          this.hostFs.stat(manifestPath),
        ]);
        isPluginRoot = contractStat.isFile && manifestStat.isFile;
      } catch {
      }
      if (isPluginRoot) return current;

      const parent = dirname(current);
      if (parent === current) break;
      current = parent;
    }
    return null;
  }
}
