import { readConfigFile, writeConfigFile } from '../../config';
import type { KimiConfig, OAuthRef } from '../../config';
import type { OAuthTokenProviderResolver } from '../../session/provider-manager';
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
  type BearerTokenProvider,
  type KimiOAuthLoginOptions,
  type ManagedKimiConfigShape,
} from '@moonshot-ai/kimi-code-oauth';

import type { IEnvironmentService } from '../environment/environment';

type ServicesManagedConfig = KimiConfig & ManagedKimiConfigShape;

type ServicesAuthLoginOptions = Omit<KimiOAuthLoginOptions, 'provisionConfig'>;

interface ServicesAuthLoginResult {
  readonly providerName: string;
  readonly ok: true;
  readonly defaultModel: string;
  readonly defaultThinking: boolean;
  readonly configPath?: string | undefined;
}

interface ServicesAuthLogoutResult {
  readonly providerName: string;
  readonly ok: true;
}

export interface ServicesAuthFacade {
  login(
    providerName?: string | undefined,
    options?: ServicesAuthLoginOptions,
  ): Promise<ServicesAuthLoginResult>;
  logout(providerName?: string | undefined): Promise<ServicesAuthLogoutResult>;
  getCachedAccessToken(
    providerName?: string,
    oauthRef?: OAuthRef | undefined,
  ): Promise<string | undefined>;
  readonly resolveOAuthTokenProvider: OAuthTokenProviderResolver;
}

class ServicesManagedAuthFacade implements ServicesAuthFacade {
  private readonly toolkit: KimiOAuthToolkit<ServicesManagedConfig>;
  private readonly openAICodexToolkit: OpenAICodexOAuthToolkit;

  constructor(
    private readonly options: Pick<IEnvironmentService, 'homeDir' | 'configPath'>,
  ) {
    this.toolkit = new KimiOAuthToolkit<ServicesManagedConfig>({
      homeDir: options.homeDir,
      configAdapter: {
        configPath: options.configPath,
        read: () => readConfigFile(options.configPath) as ServicesManagedConfig,
        write: async (config) => {
          await writeConfigFile(options.configPath, config);
        },
        apply: applyManagedKimiCodeConfig,
        remove: applyManagedKimiCodeLogoutConfig,
      },
    });
    this.openAICodexToolkit = new OpenAICodexOAuthToolkit({
      homeDir: options.homeDir,
      userAgent: 'hakimi-service',
    });
  }

  async login(
    providerName: string | undefined = KIMI_CODE_PROVIDER_NAME,
    options: ServicesAuthLoginOptions = {},
  ): Promise<ServicesAuthLoginResult> {
    if (providerName === OPENAI_CODEX_PROVIDER_NAME) {
      const oauthRef = this.openAICodexOAuthRef(options.oauthRef, options.oauthHost);
      const status = await this.openAICodexToolkit.status(oauthRef);
      const hadToken = status.providers.some((provider) => provider.hasToken);
      await this.openAICodexToolkit.login({
        oauthRef,
        signal: options.signal,
        onDeviceCode: options.onDeviceCode,
      });
      const config = readConfigFile(this.options.configPath) as ServicesManagedConfig;
      const provision = applyOpenAICodexConfig(config, {
        oauthKey: oauthRef.key,
        oauthHost: oauthRef.oauthHost,
        preserveDefaultModel: hadToken,
      });
      await writeConfigFile(this.options.configPath, config);
      return {
        providerName: provision.providerName,
        ok: true,
        defaultModel: provision.defaultModel,
        defaultThinking: provision.defaultThinking,
        configPath: this.options.configPath,
      };
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
    return {
      providerName: result.providerName,
      ok: true,
      defaultModel: result.provision.defaultModel,
      defaultThinking: result.provision.defaultThinking,
      configPath: result.provision.configPath,
    };
  }

  async logout(
    providerName?: string | undefined,
  ): Promise<ServicesAuthLogoutResult> {
    if (providerName === OPENAI_CODEX_PROVIDER_NAME) {
      await this.openAICodexToolkit.logout(this.openAICodexOAuthRef());
      const config = readConfigFile(this.options.configPath) as ServicesManagedConfig;
      removeOpenAICodexConfig(config);
      await writeConfigFile(this.options.configPath, config);
      return {
        providerName: OPENAI_CODEX_PROVIDER_NAME,
        ok: true,
      };
    }
    const result = await this.toolkit.logout(
      providerName,
      this.resolveRuntimeManagedAuth(providerName).oauthRef,
    );
    return {
      providerName: result.providerName,
      ok: result.ok,
    };
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
    if (providerName === OPENAI_CODEX_PROVIDER_NAME) {
      return this.openAICodexToolkit.tokenProvider(this.openAICodexOAuthRef(oauthRef));
    }
    return this.toolkit.tokenProvider(
      providerName,
      this.runtimeOAuthRef(providerName, oauthRef),
    );
  };

  private resolveManagedAuth(providerName?: string | undefined): {
    readonly oauthRef?: OAuthRef | undefined;
    readonly baseUrl?: string | undefined;
  } {
    const name = providerName ?? KIMI_CODE_PROVIDER_NAME;
    const config = readConfigFile(this.options.configPath);
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
    if ((providerName ?? KIMI_CODE_PROVIDER_NAME) !== KIMI_CODE_PROVIDER_NAME) {
      return oauthRef;
    }
    const auth = this.resolveManagedAuth(providerName);
    return resolveKimiCodeRuntimeAuth({
      configuredBaseUrl: auth.baseUrl,
      configuredOAuthRef: oauthRef ?? auth.oauthRef,
    }).oauthRef;
  }

  private openAICodexOAuthRef(
    oauthRef?:
      | OAuthRef
      | {
          readonly storage?: 'file' | 'keyring' | undefined;
          readonly key?: string | undefined;
          readonly oauthHost?: string | undefined;
        }
      | undefined,
    requestedOAuthHost?: string | undefined,
  ): OAuthRef {
    const configured = this.resolveManagedAuth(OPENAI_CODEX_PROVIDER_NAME).oauthRef;
    return {
      storage: oauthRef?.storage ?? configured?.storage ?? 'file',
      key: oauthRef?.key ?? configured?.key ?? OPENAI_CODEX_OAUTH_KEY,
      oauthHost:
        requestedOAuthHost ??
        oauthRef?.oauthHost ??
        configured?.oauthHost ??
        OPENAI_CODEX_ISSUER,
    };
  }
}

export function createManagedAuthFacade(
  env: Pick<IEnvironmentService, 'homeDir' | 'configPath'>,
): ServicesAuthFacade {
  return new ServicesManagedAuthFacade(env);
}
