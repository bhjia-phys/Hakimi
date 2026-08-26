/**
 * `providerUsage` domain — `IProviderUsageService` implementation.
 *
 * Resolves usage through four supported routes: managed Kimi OAuth providers
 * (`managed:kimi-code`) delegate to `IOAuthService.getManagedUsage`; the
 * official `api.kimi.com/coding` API-key provider calls `fetchManagedUsage`
 * (pinned to the fixed official `/v1/usages` endpoint, validated by the
 * strict `officialKimiCodeUsageUrl` base check); the managed OpenAI Codex
 * provider (`managed:openai-codex`) uses the existing OAuth token provider /
 * request auth and calls `fetchCodexUsage` against the fixed official
 * `wham/usage` URL (only the official `chatgpt.com/backend-api/codex` base is
 * accepted); and the exact-base OpenCode Go provider calls
 * `fetchOpenCodeGoUsage` against the fixed `opencode.ai/zen/go/v1/usage`
 * endpoint. Any other provider is `unsupported`, never guessed. Effective
 * endpoints resolve inline first and fall back to the provider-definition env
 * bag (key and base URL alike), so discovery and explicit queries see the same
 * endpoint. Error text is scrubbed at this boundary: the API-key routes redact
 * their credential from untrusted remote text inside the fetch adapters, and
 * the managed OAuth routes replace every error with a fixed message (plus the
 * safe HTTP status) because this layer does not hold the refresh credential
 * needed to redact an echoed one. An omitted query targets every identifiable
 * supported usage provider; a caller-supplied signal stops the loop and the
 * in-flight fetches. Bound at App scope.
 */

import {
  OPENAI_CODEX_PROVIDER_NAME,
  fetchCodexUsage,
  fetchManagedUsage,
  fetchOpenCodeGoUsage,
  isManagedKimiCode,
  officialCodexUsageUrl,
  officialKimiCodeUsageUrl,
  opencodeGoUsageUrl,
  type BearerRequestAuth,
} from '@moonshot-ai/kimi-code-oauth';
import { ScopeActivation, registerScopedService } from '#/_base/di/scope';
import { IOAuthService } from '#/app/auth/auth';
import { LifecycleScope } from '#/app/scopes';
import { nonEmpty } from '#/kosong/model/modelAuth';
import {
  IProviderService,
  type ProviderConfig,
} from '#/kosong/provider/provider';
import { explainProviderEndpoint } from '#/kosong/provider/providerDefinition';

import {
  IProviderUsageService,
  type ProviderUsageResult,
} from './providerUsage';

interface ResolvedEndpoint {
  readonly baseUrl?: string;
  readonly apiKey?: string;
}

export const MANAGED_OAUTH_USAGE_ERROR_MESSAGE =
  'Failed to query usage for the managed OAuth provider. The provider login may need to be refreshed (run /login).';

export const CODEX_OAUTH_USAGE_ERROR_MESSAGE =
  'Failed to query usage for the OpenAI Codex provider. The provider login may need to be refreshed (run /login).';

export class ProviderUsageService implements IProviderUsageService {
  declare readonly _serviceBrand: undefined;

  constructor(
    @IProviderService private readonly providerService: IProviderService,
    @IOAuthService private readonly oauth: IOAuthService,
  ) {}

  async queryUsage(
    providerId?: string,
    options?: { readonly signal?: AbortSignal },
  ): Promise<readonly ProviderUsageResult[]> {
    const targets = providerId === undefined ? this.usageProviderIds() : [providerId];
    const results: ProviderUsageResult[] = [];
    for (const target of targets) {
      if (options?.signal?.aborted === true) break;
      try {
        results.push(await this.queryOne(target, this.providerService.get(target), options?.signal));
      } catch {
        // Per-provider isolation: an unexpected failure of one provider must
        // not abort the whole batch. The fixed message never leaks the
        // exception text, which could carry credential material.
        results.push({
          kind: 'error',
          provider: target,
          message: `Failed to query usage for provider ${target}.`,
        });
      }
    }
    return results;
  }

  private async queryOne(
    providerId: string,
    config: ProviderConfig | undefined,
    signal?: AbortSignal,
  ): Promise<ProviderUsageResult> {
    if (isManagedKimiCode(providerId)) {
      return this.queryManagedOAuth(providerId, signal);
    }
    if (providerId === OPENAI_CODEX_PROVIDER_NAME) {
      return this.queryCodexOAuth(providerId, config, signal);
    }
    return this.queryApiKeyProvider(providerId, config, signal);
  }

  private usageProviderIds(): readonly string[] {
    const ids: string[] = [];
    for (const [id, config] of Object.entries(this.providerService.list())) {
      if (isManagedKimiCode(id) || id === OPENAI_CODEX_PROVIDER_NAME) {
        ids.push(id);
        continue;
      }
      const endpoint = this.resolveEndpoint(config);
      if (
        officialKimiCodeUsageUrl(endpoint.baseUrl) !== undefined ||
        opencodeGoUsageUrl(endpoint.baseUrl) !== undefined
      ) {
        ids.push(id);
      }
    }
    return ids;
  }

  private async queryManagedOAuth(
    providerId: string,
    signal?: AbortSignal,
  ): Promise<ProviderUsageResult> {
    const result = await this.oauth.getManagedUsage(providerId, { signal });
    if (result.kind === 'error') {
      // Credential-boundary rule for managed OAuth: this layer does NOT hold
      // the OAuth refresh credential, so it cannot scrub a refresh failure's
      // `error_description` that echoes it. Never forward the raw message —
      // normalize to a fixed, actionable text (the safe HTTP status may pass).
      return {
        kind: 'error',
        provider: providerId,
        message: MANAGED_OAUTH_USAGE_ERROR_MESSAGE,
        status: result.status,
      };
    }
    return {
      kind: 'ok',
      provider: providerId,
      summary: result.summary,
      limits: result.limits,
      extraUsage: result.extraUsage,
    };
  }

  private async queryCodexOAuth(
    providerId: string,
    config: ProviderConfig | undefined,
    signal?: AbortSignal,
  ): Promise<ProviderUsageResult> {
    if (config === undefined) {
      return { kind: 'error', provider: providerId, message: `Provider ${providerId} is not configured.` };
    }
    // Only the official managed Codex base is accepted; `fetchCodexUsage` is
    // itself pinned to the fixed official usage URL, so nothing here can
    // redirect the credential to another host.
    if (officialCodexUsageUrl(this.resolveEndpoint(config).baseUrl) === undefined) {
      return { kind: 'unsupported', provider: providerId, message: 'Usage endpoint is not available for this provider.' };
    }
    let requestAuth: BearerRequestAuth;
    try {
      const tokenProvider = this.oauth.resolveTokenProvider(providerId, config.oauth);
      if (tokenProvider === undefined) {
        return { kind: 'error', provider: providerId, message: `No credential configured for provider ${providerId}.` };
      }
      // Codex request routing needs the account-id headers carried by
      // `getRequestAuth`; a provider that only exposes a bare access token is
      // not usable for usage queries.
      if (tokenProvider.getRequestAuth === undefined) {
        return { kind: 'error', provider: providerId, message: `No credential configured for provider ${providerId}.` };
      }
      requestAuth = await tokenProvider.getRequestAuth();
    } catch {
      // The token provider / refresh path holds the OAuth credential; its
      // failure text may echo it. Normalize to a fixed, actionable message.
      return { kind: 'error', provider: providerId, message: CODEX_OAUTH_USAGE_ERROR_MESSAGE };
    }
    const result = await fetchCodexUsage(requestAuth, { signal });
    if (result.kind === 'error') {
      return {
        kind: 'error',
        provider: providerId,
        message: result.message,
        status: result.status,
      };
    }
    return {
      kind: 'ok',
      provider: providerId,
      summary: result.parsed.summary,
      limits: result.parsed.limits,
      extraUsage: null,
    };
  }

  private async queryApiKeyProvider(
    providerId: string,
    config: ProviderConfig | undefined,
    signal?: AbortSignal,
  ): Promise<ProviderUsageResult> {
    if (config === undefined) {
      return { kind: 'error', provider: providerId, message: `Provider ${providerId} is not configured.` };
    }
    const endpoint = this.resolveEndpoint(config);
    if (officialKimiCodeUsageUrl(endpoint.baseUrl) !== undefined) {
      if (endpoint.apiKey === undefined) {
        return { kind: 'error', provider: providerId, message: `No credential configured for provider ${providerId}.` };
      }
      // `fetchManagedUsage` is pinned to the fixed official `/v1/usages`
      // endpoint — the resolved URL above only decides that this provider is
      // official; nothing here passes a URL to the credential-bearing fetch.
      const result = await fetchManagedUsage(endpoint.apiKey, { signal });
      if (result.kind === 'error') {
        return { kind: 'error', provider: providerId, message: redact(endpoint.apiKey, result.message) };
      }
      return {
        kind: 'ok',
        provider: providerId,
        summary: result.parsed.summary,
        limits: result.parsed.limits,
        extraUsage: result.parsed.extraUsage,
      };
    }
    if (opencodeGoUsageUrl(endpoint.baseUrl) !== undefined) {
      if (endpoint.apiKey === undefined) {
        return { kind: 'error', provider: providerId, message: `No credential configured for provider ${providerId}.` };
      }
      const result = await fetchOpenCodeGoUsage(endpoint.apiKey, { signal });
      if (result.kind === 'error') {
        return { kind: 'error', provider: providerId, message: redact(endpoint.apiKey, result.message) };
      }
      return {
        kind: 'ok',
        provider: providerId,
        summary: result.parsed.summary,
        limits: result.parsed.limits,
        extraUsage: null,
      };
    }
    return { kind: 'unsupported', provider: providerId, message: 'Usage endpoint is not available for this provider.' };
  }

  private resolveEndpoint(config: ProviderConfig): ResolvedEndpoint {
    const inlineApiKey = nonEmpty(config.apiKey);
    const inlineBaseUrl = nonEmpty(config.baseUrl);
    const endpoint =
      config.type === undefined ? {} : explainProviderEndpoint(config.type, config.env ?? {});
    return {
      baseUrl: inlineBaseUrl ?? nonEmpty(endpoint.baseUrl),
      apiKey: inlineApiKey ?? nonEmpty(endpoint.apiKey),
    };
  }
}

function redact(credential: string, message: string): string {
  if (credential.length === 0) return message;
  return message.split(credential).join('[redacted]');
}

registerScopedService(
  LifecycleScope.App,
  IProviderUsageService,
  ProviderUsageService,
  ScopeActivation.OnScopeCreated,
  'providerUsage',
);