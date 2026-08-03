import {
  loadRuntimeConfigSafe,
  readConfigFile,
  readConfigFileForUpdate,
  writeConfigFile,
  type KimiConfig,
  type OAuthRef,
} from '@moonshot-ai/agent-core';
import {
  applyManagedKimiCodeConfig,
  applyManagedKimiCodeLogoutConfig,
  applyOpenAICodexConfig,
  KIMI_CODE_PROVIDER_NAME,
  KimiOAuthToolkit,
  OPENAI_CODEX_ISSUER,
  OPENAI_CODEX_OAUTH_KEY,
  OPENAI_CODEX_PROVIDER_NAME,
  OpenAICodexOAuthToolkit,
  removeOpenAICodexConfig,
  resolveKimiCodeLoginAuth,
  resolveKimiCodeRuntimeAuth,
  type AuthManagedUsageResult,
  type AuthStatus,
  type BearerTokenProvider,
  type FetchCompleteFeedbackUploadResult,
  type FetchFeedbackUploadError,
  type FetchSubmitFeedbackResult,
  type KimiHostIdentity,
  type KimiOAuthLoginOptions,
  type KimiOAuthTokenRef,
  type ManagedKimiConfigShape,
  type OAuthRefreshOutcome,
} from '@moonshot-ai/kimi-code-oauth';

import { mapOAuthTokenError } from '#/oauth-error';

export interface KimiAuthSubmitFeedbackInput {
  readonly content: string;
  readonly sessionId: string;
  readonly version: string;
  readonly os: string;
  readonly model: string | null;
  readonly contact?: string;
  readonly info?: Record<string, unknown>;
}

export interface KimiAuthCreateFeedbackUploadUrlInput {
  readonly feedbackId: number;
  readonly filename: string;
  readonly size: number;
  readonly sha256: string;
}

export interface KimiAuthCompleteFeedbackUploadPart {
  readonly partNumber: number;
  readonly etag: string;
}

export interface KimiAuthCompleteFeedbackUploadInput {
  readonly uploadId: number;
  readonly parts: readonly KimiAuthCompleteFeedbackUploadPart[];
}

export interface KimiAuthFeedbackUploadPart {
  readonly partNumber: number;
  readonly url: string;
  readonly method: string;
  readonly size: number;
}

export interface KimiAuthCreateFeedbackUploadUrlOk {
  readonly kind: 'ok';
  readonly uploadId: number;
  readonly parts: readonly KimiAuthFeedbackUploadPart[];
}

export type KimiAuthCreateFeedbackUploadUrlResult =
  | KimiAuthCreateFeedbackUploadUrlOk
  | FetchFeedbackUploadError;

export type KimiAuthLoginOptions = Omit<KimiOAuthLoginOptions, 'provisionConfig'>;

export interface KimiAuthLoginResult {
  readonly providerName: string;
  readonly ok: true;
  readonly defaultModel: string;
  readonly defaultThinking: boolean;
  readonly configPath?: string | undefined;
}

export interface KimiAuthLogoutResult {
  readonly providerName: string;
  readonly ok: true;
}

export interface KimiAuthFacadeOptions {
  readonly homeDir: string;
  readonly configPath: string;
  readonly identity?: KimiHostIdentity | undefined;
  readonly onConfigUpdated?: ((config: KimiConfig) => void) | undefined;
  readonly onRefresh?: ((outcome: OAuthRefreshOutcome) => void) | undefined;
}

type SDKManagedConfig = KimiConfig & ManagedKimiConfigShape;

export class KimiAuthFacade {
  private readonly toolkit: KimiOAuthToolkit<SDKManagedConfig>;
  private readonly openAICodexToolkit: OpenAICodexOAuthToolkit;

  constructor(private readonly options: KimiAuthFacadeOptions) {
    this.toolkit = new KimiOAuthToolkit<SDKManagedConfig>({
      homeDir: options.homeDir,
      identity: options.identity,
      onRefresh: options.onRefresh,
      configAdapter: {
        configPath: options.configPath,
        // Write-path base read: strict (a salvaged base would drop the user's
        // broken-but-fixable sections on rewrite) with an actionable message.
        read: () => readConfigFileForUpdate(options.configPath) as SDKManagedConfig,
        write: async (config) => {
          await writeConfigFile(options.configPath, config);
        },
        apply: applyManagedKimiCodeConfig,
        remove: applyManagedKimiCodeLogoutConfig,
      },
    });
    this.openAICodexToolkit = new OpenAICodexOAuthToolkit({
      homeDir: options.homeDir,
      userAgent:
        options.identity === undefined
          ? 'hakimi'
          : `${options.identity.userAgentProduct}/${options.identity.version}`,
      onRefresh: options.onRefresh,
    });
  }

  async status(providerName?: string | undefined): Promise<AuthStatus> {
    if (providerName === OPENAI_CODEX_PROVIDER_NAME) {
      return this.openAICodexToolkit.status(this.openAICodexOAuthRef());
    }
    return this.toolkit.status(providerName, this.resolveRuntimeManagedAuth(providerName).oauthRef);
  }

  async login(
    providerName: string | undefined = KIMI_CODE_PROVIDER_NAME,
    options: KimiAuthLoginOptions = {},
  ): Promise<KimiAuthLoginResult> {
    if (providerName === OPENAI_CODEX_PROVIDER_NAME) {
      return this.loginOpenAICodex(options);
    }
    const auth = this.resolveManagedAuth(providerName);
    const loginAuth = resolveKimiCodeLoginAuth({
      configuredBaseUrl: auth.baseUrl,
      configuredOAuthRef: auth.oauthRef,
      requestedBaseUrl: options.baseUrl,
      requestedOAuthHost: options.oauthHost,
    });
    const result = await this.toolkit.login(providerName, {
      ...options,
      baseUrl: loginAuth.baseUrl,
      oauthHost: loginAuth.oauthHost,
      oauthRef: options.oauthRef ?? loginAuth.oauthRef,
      provisionConfig: true,
    });
    if (result.provision === undefined) {
      throw new Error('Kimi auth login did not provision model config.');
    }
    const updated = readConfigFile(this.options.configPath);
    this.options.onConfigUpdated?.(updated);
    return {
      providerName: result.providerName,
      ok: true,
      defaultModel: result.provision.defaultModel,
      defaultThinking: result.provision.defaultThinking,
      configPath: result.provision.configPath,
    };
  }

  async logout(providerName?: string | undefined): Promise<KimiAuthLogoutResult> {
    if (providerName === OPENAI_CODEX_PROVIDER_NAME) {
      await this.openAICodexToolkit.logout(this.openAICodexOAuthRef());
      const config = readConfigFileForUpdate(this.options.configPath) as SDKManagedConfig;
      removeOpenAICodexConfig(config);
      await writeConfigFile(this.options.configPath, config);
      const updated = readConfigFile(this.options.configPath);
      this.options.onConfigUpdated?.(updated);
      return { providerName: OPENAI_CODEX_PROVIDER_NAME, ok: true };
    }
    const result = await this.toolkit.logout(
      providerName,
      this.resolveRuntimeManagedAuth(providerName).oauthRef,
    );
    const updated = readConfigFile(this.options.configPath);
    this.options.onConfigUpdated?.(updated);
    return {
      providerName: result.providerName,
      ok: result.ok,
    };
  }

  async getManagedUsage(providerName?: string | undefined): Promise<AuthManagedUsageResult> {
    const auth = this.resolveRuntimeManagedAuth(providerName);
    return this.toolkit.getManagedUsage(providerName, {
      oauthRef: auth.oauthRef,
      baseUrl: auth.baseUrl,
    });
  }

  async submitFeedback(
    input: KimiAuthSubmitFeedbackInput,
    providerName?: string | undefined,
  ): Promise<FetchSubmitFeedbackResult> {
    const auth = this.resolveRuntimeManagedAuth(providerName);
    return this.toolkit.submitFeedback(
      {
        session_id: input.sessionId,
        content: input.content,
        version: input.version,
        os: input.os,
        model: input.model,
        contact: input.contact,
        info: input.info,
      },
      providerName,
      {
        oauthRef: auth.oauthRef,
        baseUrl: auth.baseUrl,
      },
    );
  }

  async createFeedbackUploadUrl(
    input: KimiAuthCreateFeedbackUploadUrlInput,
    providerName?: string | undefined,
  ): Promise<KimiAuthCreateFeedbackUploadUrlResult> {
    const auth = this.resolveRuntimeManagedAuth(providerName);
    const result = await this.toolkit.createFeedbackUploadUrl(
      {
        file_hash: input.sha256,
        file_name: input.filename,
        file_size: input.size,
        feedback_id: input.feedbackId,
      },
      providerName,
      {
        oauthRef: auth.oauthRef,
        baseUrl: auth.baseUrl,
      },
    );
    if (result.kind !== 'ok') return result;
    return {
      kind: 'ok',
      uploadId: result.upload_id,
      parts: result.parts.map((part) => ({
        partNumber: part.part_number,
        url: part.url,
        method: part.method,
        size: part.size,
      })),
    };
  }

  async completeFeedbackUpload(
    input: KimiAuthCompleteFeedbackUploadInput,
    providerName?: string | undefined,
  ): Promise<FetchCompleteFeedbackUploadResult> {
    const auth = this.resolveRuntimeManagedAuth(providerName);
    return this.toolkit.completeFeedbackUpload(
      {
        upload_id: input.uploadId,
        parts: input.parts.map((part) => ({ part_number: part.partNumber, etag: part.etag })),
      },
      providerName,
      {
        oauthRef: auth.oauthRef,
        baseUrl: auth.baseUrl,
      },
    );
  }

  async getCachedAccessToken(
    providerName?: string,
    oauthRef?: OAuthRef | undefined,
  ): Promise<string | undefined> {
    if (providerName === OPENAI_CODEX_PROVIDER_NAME) {
      return this.openAICodexToolkit.getCachedAccessToken(
        this.openAICodexOAuthRef(oauthRef),
      );
    }
    return this.toolkit.getCachedAccessToken(
      providerName,
      this.runtimeOAuthRef(providerName, oauthRef),
    );
  }

  readonly resolveOAuthTokenProvider = (
    providerName: string,
    oauthRef?: OAuthRef | undefined,
  ): BearerTokenProvider => {
    const provider =
      providerName === OPENAI_CODEX_PROVIDER_NAME
        ? this.openAICodexToolkit.tokenProvider(this.openAICodexOAuthRef(oauthRef))
        : this.toolkit.tokenProvider(
            providerName,
            this.runtimeOAuthRef(providerName, oauthRef),
          );
    return {
      getAccessToken: async (options) => {
        try {
          return await provider.getAccessToken(options);
        } catch (error) {
          // Classify OAuth token failures into the public KimiError protocol;
          // unrecognized errors are rethrown raw (see mapOAuthTokenError).
          throw mapOAuthTokenError(error, providerName) ?? error;
        }
      },
      getRequestAuth: async (options) => {
        try {
          if (provider.getRequestAuth !== undefined) {
            return await provider.getRequestAuth(options);
          }
          return { apiKey: await provider.getAccessToken(options) };
        } catch (error) {
          throw mapOAuthTokenError(error, providerName) ?? error;
        }
      },
    };
  };

  private async loginOpenAICodex(
    options: KimiAuthLoginOptions,
  ): Promise<KimiAuthLoginResult> {
    const oauthRef = this.openAICodexOAuthRef(options.oauthRef, options.oauthHost);
    const status = await this.openAICodexToolkit.status(oauthRef);
    const hadToken = status.providers.some((provider) => provider.hasToken);
    await this.openAICodexToolkit.login({
      oauthRef,
      signal: options.signal,
      onDeviceCode: options.onDeviceCode,
    });

    const config = readConfigFileForUpdate(this.options.configPath) as SDKManagedConfig;
    const provision = applyOpenAICodexConfig(config, {
      oauthKey: oauthRef.key,
      oauthHost: oauthRef.oauthHost,
      preserveDefaultModel: hadToken,
    });
    await writeConfigFile(this.options.configPath, config);
    const updated = readConfigFile(this.options.configPath);
    this.options.onConfigUpdated?.(updated);
    return {
      providerName: provision.providerName,
      ok: true,
      defaultModel: provision.defaultModel,
      defaultThinking: provision.defaultThinking,
      configPath: this.options.configPath,
    };
  }

  private resolveManagedAuth(providerName?: string | undefined): {
    readonly oauthRef?: OAuthRef | undefined;
    readonly baseUrl?: string | undefined;
  } {
    const name = providerName ?? KIMI_CODE_PROVIDER_NAME;
    // Read path: token/status resolution must work off a degraded config
    // instead of failing the session when an unrelated section is broken.
    // Write paths (the toolkit's configAdapter.read) stay strict.
    const config = loadRuntimeConfigSafe(this.options.configPath).config;
    const provider = config.providers[name];
    return {
      oauthRef: provider?.oauth,
      baseUrl: provider?.baseUrl,
    };
  }

  private resolveRuntimeManagedAuth(providerName?: string | undefined): {
    readonly oauthRef: OAuthRef;
    readonly baseUrl?: string | undefined;
  } {
    const auth = this.resolveManagedAuth(providerName);
    return resolveKimiCodeRuntimeAuth({
      configuredBaseUrl: auth.baseUrl,
      configuredOAuthRef: auth.oauthRef,
    });
  }

  private runtimeOAuthRef(
    providerName: string | undefined,
    oauthRef?: OAuthRef | undefined,
  ): OAuthRef | undefined {
    if ((providerName ?? KIMI_CODE_PROVIDER_NAME) !== KIMI_CODE_PROVIDER_NAME) return oauthRef;
    const auth = this.resolveManagedAuth(providerName);
    return resolveKimiCodeRuntimeAuth({
      configuredBaseUrl: auth.baseUrl,
      configuredOAuthRef: oauthRef ?? auth.oauthRef,
    }).oauthRef;
  }

  private openAICodexOAuthRef(
    oauthRef?: OAuthRef | KimiOAuthTokenRef,
    requestedOAuthHost?: string | undefined,
  ): OAuthRef {
    const configured = this.resolveManagedAuth(OPENAI_CODEX_PROVIDER_NAME).oauthRef;
    const storage = oauthRef !== undefined && 'storage' in oauthRef ? oauthRef.storage : undefined;
    return {
      storage: storage ?? configured?.storage ?? 'file',
      key: oauthRef?.key ?? configured?.key ?? OPENAI_CODEX_OAUTH_KEY,
      oauthHost:
        requestedOAuthHost ?? oauthRef?.oauthHost ?? configured?.oauthHost ?? OPENAI_CODEX_ISSUER,
    };
  }
}
