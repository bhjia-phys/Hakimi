/**
 * `sessionAgentProfileCatalog` domain — per-session explicit agent-file
 * producer.
 *
 * Loads the runtime-selected agent files from the session-dir copies the
 * session lifecycle persisted at create time (`<sessionDir>/agent-files/`),
 * never from the original paths, so a resumed session keeps exactly the
 * files it was created with — the same snapshot semantics v1 gets from its
 * persisted catalog snapshot. `${base_prompt}` is backed by the user
 * loader's effective default profile. A rejecting load (an invalid
 * `--agent-file`) propagates through `ready` so `bind()` / `load()` awaiters
 * see the error; the session catalog service folds the contribution into its
 * projection once `ready` resolves. Bound at Session scope.
 */

import { createDecorator, type ServiceIdentifier } from '#/_base/di/instantiation';
import { join } from 'pathe';
import { LifecycleScope } from '#/app/scopes';
import { ScopeActivation, registerScopedService } from '#/_base/di/scope';
import {
  DEFAULT_AGENT_PROFILE_NAME,
  type AgentProfile,
  type AgentProfileContext,
  type SystemPromptRenderResult,
} from '#/app/agentProfileCatalog/agentProfileCatalog';
import type { AgentProfileContribution } from '#/app/agentProfileCatalog/agentProfileContribution';
import { IAgentProfileRegistry } from '#/app/agentProfileCatalog/agentProfileRegistry';
import { BUILTIN_AGENT_PROFILE_SOURCE_ID } from '#/app/agentProfileCatalog/builtinAgentProfileLoader';
import { parseAgentFileText } from '#/workspace/workspaceAgentProfileLoader/internal/agentFile';
import { agentProfileFromFile } from '#/workspace/workspaceAgentProfileLoader/internal/agentProfileFromFile';
import {
  isMissingPathError,
  SESSION_EXPLICIT_AGENT_FILES_DIR,
} from '#/workspace/workspaceAgentProfileLoader/internal/paths';
import { IHostFileSystem, type HostDirEntry } from '#/os/interface/hostFileSystem';
import { ISessionContext } from '#/session/sessionContext/sessionContext';

export interface IExplicitFileAgentSource {
  readonly _serviceBrand: undefined;
  readonly ready: Promise<void>;
  contribution(): AgentProfileContribution;
}

export const IExplicitFileAgentSource: ServiceIdentifier<IExplicitFileAgentSource> =
  createDecorator<IExplicitFileAgentSource>('explicitFileAgentSource');

export class ExplicitFileAgentSource implements IExplicitFileAgentSource {
  declare readonly _serviceBrand: undefined;

  private contributionData: AgentProfileContribution = { profiles: [] };
  private readonly readyPromise: Promise<void>;

  constructor(
    @ISessionContext private readonly sessionContext: ISessionContext,
    @IAgentProfileRegistry private readonly registry: IAgentProfileRegistry,
    @IHostFileSystem private readonly fs: IHostFileSystem,
  ) {
    this.readyPromise = this.load().then((contribution) => {
      this.contributionData = contribution;
    });
    void this.readyPromise.catch(() => undefined);
  }

  get ready(): Promise<void> {
    return this.readyPromise;
  }

  contribution(): AgentProfileContribution {
    return this.contributionData;
  }

  private builtinBasePrompt(): (context: AgentProfileContext) => SystemPromptRenderResult {
    const builtinEntry = this.registry
      .entries()
      .find((entry) => entry.sourceId === BUILTIN_AGENT_PROFILE_SOURCE_ID);
    const builtinDefault = builtinEntry?.contribution.profiles.find(
      (profile) => profile.name === DEFAULT_AGENT_PROFILE_NAME,
    );
    return builtinDefault === undefined
      ? (context) => ({
          text: '',
          environment: { cwd: context.cwd ?? '', date: { disclosed: false } },
        })
      : (context) => builtinDefault.renderSystemPrompt(context);
  }

  private async load(): Promise<AgentProfileContribution> {
    const sessionDir = join(this.sessionContext.sessionDir, SESSION_EXPLICIT_AGENT_FILES_DIR);
    let entries: readonly HostDirEntry[];
    try {
      entries = await this.fs.readdir(sessionDir);
    } catch (error) {
      if (isMissingPathError(error)) return { profiles: [] };
      throw error;
    }
    const profiles: AgentProfile[] = [];
    for (const name of entries
      .filter((entry) => entry.isFile)
      .map((entry) => entry.name)
      .toSorted()) {
      const filePath = join(sessionDir, name);
      const text = await this.fs.readText(filePath);
      profiles.push(
        agentProfileFromFile(
          parseAgentFileText({ path: filePath, source: 'explicit', text }),
          (context) => this.builtinBasePrompt()(context),
        ),
      );
    }
    return { profiles };
  }
}

registerScopedService(
  LifecycleScope.Session,
  IExplicitFileAgentSource,
  ExplicitFileAgentSource,
  ScopeActivation.OnScopeCreated,
  'sessionAgentProfileCatalog',
);
