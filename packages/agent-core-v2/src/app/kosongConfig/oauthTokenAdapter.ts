/**
 * `kosongConfig` domain — `IModelOAuthTokens` implementation.
 *
 * Delegates kosong's OAuth token port to `IOAuthService` and owns the
 * `auth.login_required` error contract: kosong's model catalog only sees
 * the port.
 */

import { LifecycleScope } from '#/app/scopes';

import { ScopeActivation, registerScopedService } from '#/_base/di/scope';
import { Error2 } from '#/_base/errors/errors';
import { OPENAI_CODEX_PROVIDER_NAME } from '@moonshot-ai/kimi-code-oauth';

import { IOAuthService } from '#/app/auth/auth';
import { AuthErrors } from '#/app/auth/errors';
import { IFlagService } from '#/app/flag/flag';
import { nonEmpty } from '#/kosong/model/modelAuth';
import { IModelOAuthTokens } from '#/kosong/model/modelOAuth';
import type { OAuthRef } from '#/kosong/provider/provider';
import type { ProviderRequestAuth } from '#/kosong/contract/provider';

import { OPENAI_CODEX_OAUTH_FLAG_ID } from './flag';

export class ModelOAuthTokenAdapter implements IModelOAuthTokens {
  declare readonly _serviceBrand: undefined;

  constructor(
    @IOAuthService private readonly oauth: IOAuthService,
    @IFlagService private readonly flags: IFlagService,
  ) {}

  async hasCachedAccessToken(provider: string, oauthRef: OAuthRef): Promise<boolean> {
    try {
      const token = await this.oauth.getCachedAccessToken(provider, oauthRef);
      return nonEmpty(token) !== undefined;
    } catch {
      return false;
    }
  }

  async getAccessToken(
    provider: string,
    oauthRef: OAuthRef,
    options?: { readonly force?: boolean },
  ): Promise<string> {
    this.assertProviderEnabled(provider);
    const tokenProvider = this.oauth.resolveTokenProvider(provider, oauthRef);
    if (tokenProvider === undefined) throw loginRequired(provider);
    const token = await tokenProvider.getAccessToken(
      options?.force === true ? { force: true } : undefined,
    );
    if (token.trim().length === 0) throw loginRequired(provider);
    return token;
  }

  async getRequestAuth(
    provider: string,
    oauthRef: OAuthRef,
    options?: { readonly force?: boolean },
  ): Promise<ProviderRequestAuth> {
    this.assertProviderEnabled(provider);
    const tokenProvider = this.oauth.resolveTokenProvider(provider, oauthRef);
    if (tokenProvider === undefined) throw loginRequired(provider);
    const tokenOptions = options?.force === true ? { force: true } : undefined;
    const auth =
      tokenProvider.getRequestAuth === undefined
        ? { apiKey: await tokenProvider.getAccessToken(tokenOptions) }
        : await tokenProvider.getRequestAuth(tokenOptions);
    if (auth.apiKey === undefined || auth.apiKey.trim().length === 0) {
      throw loginRequired(provider);
    }
    return auth;
  }

  private assertProviderEnabled(provider: string): void {
    if (provider === OPENAI_CODEX_PROVIDER_NAME && !this.flags.enabled(OPENAI_CODEX_OAUTH_FLAG_ID)) {
      throw new Error2(
        AuthErrors.codes.AUTH_LOGIN_REQUIRED,
        'ChatGPT / OpenAI Codex OAuth is experimental. Enable it with /experiments first.',
      );
    }
  }
}

function loginRequired(providerKey: string): Error2 {
  return new Error2(
    AuthErrors.codes.AUTH_LOGIN_REQUIRED,
    `OAuth provider "${providerKey}" requires login before it can be used.`,
  );
}

registerScopedService(
LifecycleScope.App,
  IModelOAuthTokens,
  ModelOAuthTokenAdapter,
  ScopeActivation.OnScopeCreated,
  'kosongConfig',
);
