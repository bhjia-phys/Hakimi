/**
 * `subagent` domain — resume-time model-binding reconciliation.
 *
 * Waits for the Session profile catalog, applies active `[subagent]` preset
 * field overrides to an existing agent profile, and preserves profiles that
 * explicitly own their binding policy. This helper is stateless and shared by
 * the Agent and AgentSwarm resume routes.
 */

import type { IConfigService } from '#/app/config/config';
import type { IFlagService } from '#/app/flag/flag';
import type { AgentProfile } from '#/app/agentProfileCatalog/agentProfileCatalog';
import type { IAgentProfileService, ProfileData } from '#/agent/profile/profile';
import type { IModelCatalog } from '#/kosong/model/catalog';
import type { ISessionAgentProfileCatalog } from '#/session/sessionAgentProfileCatalog/sessionAgentProfileCatalog';

import {
  resolveSubagentBinding,
  type SubagentRouteKind,
} from './configSection';

export async function refreshSubagentBindingOnResume(
  config: IConfigService,
  flags: IFlagService,
  catalog: ISessionAgentProfileCatalog,
  modelCatalog: IModelCatalog,
  profileService: IAgentProfileService,
  caller: ProfileData,
  route: SubagentRouteKind,
): Promise<ProfileData> {
  await catalog.ready;
  const current = profileService.data();
  const profileName = current.profileName;
  if (profileName === undefined) return current;

  const profile: AgentProfile | undefined = catalog.get(profileName);
  if (profile?.preserveBindingOnResume === true) return current;

  if (caller.modelAlias === undefined || current.modelAlias === undefined) return current;
  const resolution = resolveSubagentBinding(config, flags, modelCatalog, {
    route,
    profileName,
    modelPreference: profile?.modelPreference,
    caller: {
      modelAlias: caller.modelAlias,
      thinkingLevel: caller.thinkingLevel,
    },
  });
  const modelChanged = resolution.model !== current.modelAlias;
  const thinkingChanged =
    resolution.thinking !== undefined && resolution.thinking !== current.thinkingLevel;
  const clearsLegacyThinking =
    resolution.thinking === undefined && resolution.modelSource === 'legacy-secondary';
  if (modelChanged || thinkingChanged || clearsLegacyThinking) {
    profileService.rebind({
      modelAlias: resolution.model,
      thinkingLevel: resolution.thinking,
    });
  }
  return profileService.data();
}
