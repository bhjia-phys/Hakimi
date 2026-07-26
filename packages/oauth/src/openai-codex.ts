import { homedir } from 'node:os';
import { join } from 'node:path';

import {
  OAuthConnectionError,
  OAuthError,
  OAuthUnauthorizedError,
  RetryableRefreshError,
} from './errors';
import {
  OAuthManager,
  type LoginOptions,
  type OAuthManagerOptions,
  type OAuthRefreshOutcome,
} from './oauth-manager';
import type { DevicePollResult } from './oauth';
import { FileTokenStorage, type TokenStorage } from './storage';
import type { DeviceAuthorization, OAuthFlowConfig, TokenInfo } from './types';
import type {
  AuthStatus,
  BearerRequestAuth,
  BearerTokenProvider,
} from './toolkit';
import type { ManagedKimiConfigShape } from './managed-kimi-code';

export const OPENAI_CODEX_CLIENT_ID = 'app_EMoamEEZ73f0CkXaXp7hrann';
export const OPENAI_CODEX_ISSUER = 'https://auth.openai.com';
export const OPENAI_CODEX_API_BASE_URL = 'https://chatgpt.com/backend-api/codex';
export const OPENAI_CODEX_PLATFORM_ID = 'openai-codex';
export const OPENAI_CODEX_PROVIDER_NAME = 'managed:openai-codex';
export const OPENAI_CODEX_OAUTH_KEY = 'oauth/openai-codex';

const OPENAI_CODEX_ORIGINATOR = 'hakimi';
const OPENAI_CODEX_DEVICE_PATH = '/api/accounts/deviceauth/usercode';
const OPENAI_CODEX_DEVICE_TOKEN_PATH = '/api/accounts/deviceauth/token';
const OPENAI_CODEX_TOKEN_PATH = '/oauth/token';
const OPENAI_CODEX_DEVICE_POLLING_MARGIN_SECONDS = 3;
const DEFAULT_TOKEN_LIFETIME_SECONDS = 3600;
const DEFAULT_SCOPE = 'openid profile email offline_access';

export interface OpenAICodexOAuthRef {
  readonly storage: 'file' | 'keyring';
  readonly key: string;
  readonly oauthHost?: string | undefined;
}

export interface OpenAICodexTokenResponse {
  readonly id_token?: string | undefined;
  readonly access_token: string;
  readonly refresh_token: string;
  readonly expires_in?: number | undefined;
  readonly scope?: string | undefined;
  readonly token_type?: string | undefined;
}

export interface OpenAICodexClaims {
  readonly chatgpt_account_id?: string | undefined;
  readonly organizations?: readonly { readonly id?: string | undefined }[] | undefined;
  readonly 'https://api.openai.com/auth'?:
    | { readonly chatgpt_account_id?: string | undefined }
    | undefined;
}

interface EncodedDeviceCode {
  readonly deviceAuthId: string;
  readonly userCode: string;
}

interface OpenAICodexModel {
  readonly id: string;
  readonly displayName: string;
  readonly maxContextSize: number;
  readonly maxInputSize: number;
  readonly supportEfforts: readonly string[];
}

const OPENAI_CODEX_MODELS: readonly OpenAICodexModel[] = [
  {
    id: 'gpt-5.5',
    displayName: 'GPT-5.5 (ChatGPT)',
    maxContextSize: 272_000,
    maxInputSize: 272_000,
    supportEfforts: ['low', 'medium', 'high', 'xhigh'],
  },
  {
    id: 'gpt-5.4',
    displayName: 'GPT-5.4 (ChatGPT)',
    maxContextSize: 272_000,
    maxInputSize: 272_000,
    supportEfforts: ['low', 'medium', 'high', 'xhigh'],
  },
  {
    id: 'gpt-5.4-mini',
    displayName: 'GPT-5.4 mini (ChatGPT)',
    maxContextSize: 272_000,
    maxInputSize: 272_000,
    supportEfforts: ['low', 'medium', 'high', 'xhigh'],
  },
  {
    id: 'gpt-5.2',
    displayName: 'GPT-5.2 (ChatGPT)',
    maxContextSize: 272_000,
    maxInputSize: 272_000,
    supportEfforts: ['low', 'medium', 'high', 'xhigh'],
  },
] as const;

export interface OpenAICodexApplyResult {
  readonly providerName: typeof OPENAI_CODEX_PROVIDER_NAME;
  readonly defaultModel: string;
  readonly defaultThinking: boolean;
  readonly models: readonly string[];
}

export function applyOpenAICodexConfig(
  config: ManagedKimiConfigShape,
  options: {
    readonly oauthKey?: string | undefined;
    readonly oauthHost?: string | undefined;
    readonly preserveDefaultModel?: boolean | undefined;
  } = {},
): OpenAICodexApplyResult {
  const oauthHost = normalizeIssuer(options.oauthHost ?? OPENAI_CODEX_ISSUER);
  const oauthKey = options.oauthKey ?? OPENAI_CODEX_OAUTH_KEY;
  const defaultModel = `${OPENAI_CODEX_PLATFORM_ID}/gpt-5.5`;

  config.providers[OPENAI_CODEX_PROVIDER_NAME] = {
    type: 'openai_responses',
    baseUrl: OPENAI_CODEX_API_BASE_URL,
    generationKwargs: {
      parallel_tool_calls: true,
      tool_choice: 'auto',
      include: ['reasoning.encrypted_content'],
    },
    oauth: {
      storage: 'file',
      key: oauthKey,
      oauthHost,
    },
  };

  const models = config.models ?? {};
  for (const key of Object.keys(models)) {
    if (key.startsWith(`${OPENAI_CODEX_PLATFORM_ID}/`)) {
      delete models[key];
    }
  }
  for (const model of OPENAI_CODEX_MODELS) {
    models[`${OPENAI_CODEX_PLATFORM_ID}/${model.id}`] = {
      provider: OPENAI_CODEX_PROVIDER_NAME,
      model: model.id,
      maxContextSize: model.maxContextSize,
      maxInputSize: model.maxInputSize,
      capabilities: ['thinking', 'always_thinking', 'tool_use', 'image_in'],
      supportEfforts: [...model.supportEfforts],
      defaultEffort: 'medium',
      displayName: model.displayName,
    };
  }
  config.models = models;

  if (options.preserveDefaultModel !== true || config.defaultModel === undefined) {
    config.defaultModel = defaultModel;
    config.thinking = {
      ...config.thinking,
      enabled: true,
      effort: 'medium',
    };
  }

  return {
    providerName: OPENAI_CODEX_PROVIDER_NAME,
    defaultModel,
    defaultThinking: true,
    models: OPENAI_CODEX_MODELS.map((model) => model.id),
  };
}

export function removeOpenAICodexConfig(config: ManagedKimiConfigShape): void {
  delete config.providers[OPENAI_CODEX_PROVIDER_NAME];

  const models = config.models;
  const defaultModel = config.defaultModel;
  const shouldClearDefault =
    defaultModel !== undefined &&
    (defaultModel.startsWith(`${OPENAI_CODEX_PLATFORM_ID}/`) ||
      aliasProvider(models?.[defaultModel]) === OPENAI_CODEX_PROVIDER_NAME);
  if (models !== undefined) {
    for (const [key, alias] of Object.entries(models)) {
      const provider = aliasProvider(alias);
      if (
        provider === OPENAI_CODEX_PROVIDER_NAME ||
        key.startsWith(`${OPENAI_CODEX_PLATFORM_ID}/`)
      ) {
        delete models[key];
      }
    }
  }

  if (shouldClearDefault) {
    config.defaultModel = undefined;
    config.thinking = undefined;
  }
}

export function parseOpenAICodexJwtClaims(token: string): OpenAICodexClaims | undefined {
  const parts = token.split('.');
  if (parts.length !== 3 || parts[1] === undefined) return undefined;
  try {
    const value: unknown = JSON.parse(Buffer.from(parts[1], 'base64url').toString('utf8'));
    if (!isRecord(value)) return undefined;
    return value as OpenAICodexClaims;
  } catch {
    return undefined;
  }
}

export function extractOpenAICodexAccountId(
  tokens: Pick<OpenAICodexTokenResponse, 'id_token' | 'access_token' | 'refresh_token'>,
): string | undefined {
  for (const token of [tokens.id_token, tokens.access_token]) {
    if (token === undefined) continue;
    const claims = parseOpenAICodexJwtClaims(token);
    if (claims === undefined) continue;
    const nested = claims['https://api.openai.com/auth'];
    const candidates = [
      claims.chatgpt_account_id,
      nested?.chatgpt_account_id,
      claims.organizations?.[0]?.id,
    ];
    for (const candidate of candidates) {
      if (typeof candidate === 'string' && candidate.trim().length > 0) {
        return candidate;
      }
    }
  }
  return undefined;
}

export interface OpenAICodexOAuthToolkitOptions {
  readonly homeDir?: string | undefined;
  readonly credentialsDir?: string | undefined;
  readonly storage?: TokenStorage | undefined;
  readonly fetchImpl?: typeof fetch | undefined;
  readonly now?: (() => number) | undefined;
  readonly sleep?: ((ms: number) => Promise<void>) | undefined;
  readonly refreshThreshold?: ((expiresIn: number) => number) | undefined;
  readonly deviceCodeTimeoutMs?: number | undefined;
  readonly onRefresh?: ((outcome: OAuthRefreshOutcome) => void) | undefined;
  readonly issuer?: string | undefined;
  readonly userAgent?: string | undefined;
}

export interface OpenAICodexLoginOptions extends LoginOptions {
  readonly oauthRef?: OpenAICodexOAuthRef | undefined;
}

export interface OpenAICodexLoginResult {
  readonly providerName: typeof OPENAI_CODEX_PROVIDER_NAME;
  readonly ok: true;
  readonly token: TokenInfo;
}

export class OpenAICodexOAuthToolkit {
  private readonly homeDir: string;
  private readonly storage: TokenStorage;
  private readonly fetchImpl: typeof fetch;
  private readonly now: () => number;
  private readonly issuer: string;
  private readonly userAgent: string;
  private readonly managerOptions: Pick<
    OAuthManagerOptions,
    'sleep' | 'refreshThreshold' | 'deviceCodeTimeoutMs' | 'onRefresh'
  >;
  private readonly managers = new Map<string, OAuthManager>();

  constructor(options: OpenAICodexOAuthToolkitOptions = {}) {
    this.homeDir = options.homeDir ?? defaultKimiHome();
    this.storage =
      options.storage ??
      new FileTokenStorage(options.credentialsDir ?? join(this.homeDir, 'credentials'));
    this.fetchImpl = options.fetchImpl ?? fetch;
    this.now = options.now ?? (() => Math.floor(Date.now() / 1000));
    this.issuer = normalizeIssuer(options.issuer ?? OPENAI_CODEX_ISSUER);
    this.userAgent = nonEmptyOrDefault(options.userAgent, OPENAI_CODEX_ORIGINATOR);
    this.managerOptions = {
      sleep: options.sleep,
      refreshThreshold: options.refreshThreshold,
      deviceCodeTimeoutMs: options.deviceCodeTimeoutMs,
      onRefresh: options.onRefresh,
    };
  }

  async status(oauthRef?: OpenAICodexOAuthRef | undefined): Promise<AuthStatus> {
    return {
      providers: [
        {
          providerName: OPENAI_CODEX_PROVIDER_NAME,
          hasToken: await this.managerFor(oauthRef).hasToken(),
        },
      ],
    };
  }

  async login(options: OpenAICodexLoginOptions = {}): Promise<OpenAICodexLoginResult> {
    const manager = this.managerFor(options.oauthRef);
    let token: TokenInfo;
    if (await manager.hasToken()) {
      try {
        await manager.ensureFresh();
        const stored = await this.storage.load(
          resolveOpenAICodexTokenStorageName(options.oauthRef?.key),
        );
        if (stored === undefined) {
          throw new OAuthUnauthorizedError('OpenAI Codex OAuth token disappeared from storage.');
        }
        token = stored;
      } catch (error) {
        if (!(error instanceof OAuthUnauthorizedError)) throw error;
        token = await manager.login(options);
      }
    } else {
      token = await manager.login(options);
    }
    return {
      providerName: OPENAI_CODEX_PROVIDER_NAME,
      ok: true,
      token,
    };
  }

  async logout(oauthRef?: OpenAICodexOAuthRef | undefined): Promise<void> {
    await this.managerFor(oauthRef).logout();
  }

  async getCachedAccessToken(
    oauthRef?: OpenAICodexOAuthRef | undefined,
  ): Promise<string | undefined> {
    return this.managerFor(oauthRef).getCachedAccessToken();
  }

  tokenProvider(oauthRef?: OpenAICodexOAuthRef | undefined): BearerTokenProvider {
    const manager = this.managerFor(oauthRef);
    const storageName = resolveOpenAICodexTokenStorageName(oauthRef?.key);
    const getRequestAuth = async (
      options?: { readonly force?: boolean | undefined },
    ): Promise<BearerRequestAuth> => {
      const apiKey = await manager.ensureFresh(options);
      const token = await this.storage.load(storageName);
      const accountId =
        token?.accountId ??
        extractOpenAICodexAccountId({
          access_token: apiKey,
          refresh_token: token?.refreshToken ?? '',
          id_token: undefined,
        });
      return {
        apiKey,
        headers: {
          ...(accountId === undefined ? {} : { 'ChatGPT-Account-Id': accountId }),
          originator: OPENAI_CODEX_ORIGINATOR,
          'User-Agent': this.userAgent,
        },
      };
    };
    return {
      getAccessToken: (options) => manager.ensureFresh(options),
      getRequestAuth,
    };
  }

  private managerFor(oauthRef?: OpenAICodexOAuthRef | undefined): OAuthManager {
    if (oauthRef?.storage === 'keyring') {
      throw new OAuthError('OpenAI Codex OAuth keyring storage is not implemented; use file storage.');
    }
    const storageName = resolveOpenAICodexTokenStorageName(oauthRef?.key);
    const issuer = normalizeIssuer(oauthRef?.oauthHost ?? this.issuer);
    const managerKey = `${storageName}\0${issuer}`;
    const existing = this.managers.get(managerKey);
    if (existing !== undefined) return existing;

    const flowConfig: OAuthFlowConfig = {
      name: storageName,
      oauthHost: issuer,
      clientId: OPENAI_CODEX_CLIENT_ID,
    };
    const manager = new OAuthManager({
      config: flowConfig,
      storage: this.storage,
      configDir: this.homeDir,
      now: this.now,
      ...this.managerOptions,
      requestDeviceImpl: (config) =>
        requestOpenAICodexDeviceAuthorization(config, {
          fetchImpl: this.fetchImpl,
          userAgent: this.userAgent,
        }),
      pollDeviceImpl: (config, deviceCode) =>
        pollOpenAICodexDeviceToken(config, deviceCode, {
          fetchImpl: this.fetchImpl,
          userAgent: this.userAgent,
          now: this.now,
        }),
      refreshTokenImpl: async (config, refreshToken) => {
        const previous = await this.storage.load(storageName);
        const refreshed = await refreshOpenAICodexAccessToken(config, refreshToken, {
          fetchImpl: this.fetchImpl,
          now: this.now,
        });
        if (refreshed.accountId !== undefined || previous?.accountId === undefined) {
          return refreshed;
        }
        return { ...refreshed, accountId: previous.accountId };
      },
    });
    this.managers.set(managerKey, manager);
    return manager;
  }
}

export async function requestOpenAICodexDeviceAuthorization(
  config: OAuthFlowConfig,
  options: {
    readonly fetchImpl?: typeof fetch | undefined;
    readonly userAgent?: string | undefined;
  } = {},
): Promise<DeviceAuthorization> {
  const response = await fetchOAuth(
    options.fetchImpl ?? fetch,
    `${normalizeIssuer(config.oauthHost)}${OPENAI_CODEX_DEVICE_PATH}`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'User-Agent': nonEmptyOrDefault(options.userAgent, OPENAI_CODEX_ORIGINATOR),
      },
      body: JSON.stringify({ client_id: config.clientId }),
    },
    'start OpenAI Codex device authorization',
  );
  if (!response.ok) {
    throw await oauthResponseError(response, 'OpenAI Codex device authorization failed');
  }
  const data = await readJsonRecord(response, 'OpenAI Codex device authorization');
  const deviceAuthId = requiredString(data, 'device_auth_id');
  const userCode = requiredString(data, 'user_code');
  const serverInterval = positiveInteger(data['interval'], 5);
  return {
    userCode,
    deviceCode: encodeDeviceCode({ deviceAuthId, userCode }),
    verificationUri: `${normalizeIssuer(config.oauthHost)}/codex/device`,
    verificationUriComplete: `${normalizeIssuer(config.oauthHost)}/codex/device`,
    expiresIn: null,
    interval: serverInterval + OPENAI_CODEX_DEVICE_POLLING_MARGIN_SECONDS,
  };
}

export async function pollOpenAICodexDeviceToken(
  config: OAuthFlowConfig,
  encodedDeviceCode: string,
  options: {
    readonly fetchImpl?: typeof fetch | undefined;
    readonly userAgent?: string | undefined;
    readonly now?: (() => number) | undefined;
  } = {},
): Promise<DevicePollResult> {
  const device = decodeDeviceCode(encodedDeviceCode);
  const issuer = normalizeIssuer(config.oauthHost);
  const response = await fetchOAuth(
    options.fetchImpl ?? fetch,
    `${issuer}${OPENAI_CODEX_DEVICE_TOKEN_PATH}`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'User-Agent': nonEmptyOrDefault(options.userAgent, OPENAI_CODEX_ORIGINATOR),
      },
      body: JSON.stringify({
        device_auth_id: device.deviceAuthId,
        user_code: device.userCode,
      }),
    },
    'poll OpenAI Codex device authorization',
  );
  if (response.status === 403 || response.status === 404) {
    return {
      kind: 'pending',
      errorCode: 'authorization_pending',
      description: 'Waiting for the user to approve the device code.',
    };
  }
  if (!response.ok) {
    if (response.status === 401) {
      return { kind: 'denied', description: 'OpenAI rejected the device authorization.' };
    }
    throw await oauthResponseError(response, 'OpenAI Codex device authorization polling failed');
  }

  const data = await readJsonRecord(response, 'OpenAI Codex device authorization polling');
  const authorizationCode = requiredString(data, 'authorization_code');
  const codeVerifier = requiredString(data, 'code_verifier');
  const tokenResponse = await exchangeOpenAICodexAuthorizationCode(
    config,
    authorizationCode,
    codeVerifier,
    {
      fetchImpl: options.fetchImpl,
      now: options.now,
    },
  );
  return { kind: 'success', token: tokenResponse };
}

export async function refreshOpenAICodexAccessToken(
  config: OAuthFlowConfig,
  refreshToken: string,
  options: {
    readonly fetchImpl?: typeof fetch | undefined;
    readonly now?: (() => number) | undefined;
  } = {},
): Promise<TokenInfo> {
  const response = await fetchOAuth(
    options.fetchImpl ?? fetch,
    `${normalizeIssuer(config.oauthHost)}${OPENAI_CODEX_TOKEN_PATH}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'refresh_token',
        refresh_token: refreshToken,
        client_id: config.clientId,
      }).toString(),
    },
    'refresh OpenAI Codex access token',
  );
  if (!response.ok) {
    throw await oauthResponseError(response, 'OpenAI Codex token refresh failed');
  }
  const tokens = await readOpenAICodexTokenResponse(response);
  return tokenInfoFromResponse(tokens, options.now, refreshToken);
}

async function exchangeOpenAICodexAuthorizationCode(
  config: OAuthFlowConfig,
  authorizationCode: string,
  codeVerifier: string,
  options: {
    readonly fetchImpl?: typeof fetch | undefined;
    readonly now?: (() => number) | undefined;
  },
): Promise<TokenInfo> {
  const issuer = normalizeIssuer(config.oauthHost);
  const response = await fetchOAuth(
    options.fetchImpl ?? fetch,
    `${issuer}${OPENAI_CODEX_TOKEN_PATH}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'authorization_code',
        code: authorizationCode,
        redirect_uri: `${issuer}/deviceauth/callback`,
        client_id: config.clientId,
        code_verifier: codeVerifier,
      }).toString(),
    },
    'exchange OpenAI Codex authorization code',
  );
  if (!response.ok) {
    throw await oauthResponseError(response, 'OpenAI Codex token exchange failed');
  }
  return tokenInfoFromResponse(await readOpenAICodexTokenResponse(response), options.now);
}

async function readOpenAICodexTokenResponse(response: Response): Promise<OpenAICodexTokenResponse> {
  const data = await readJsonRecord(response, 'OpenAI Codex token response');
  return {
    access_token: requiredString(data, 'access_token'),
    refresh_token: optionalString(data['refresh_token']) ?? '',
    id_token: optionalString(data['id_token']),
    expires_in: positiveInteger(data['expires_in'], DEFAULT_TOKEN_LIFETIME_SECONDS),
    scope: optionalString(data['scope']),
    token_type: optionalString(data['token_type']),
  };
}

function tokenInfoFromResponse(
  response: OpenAICodexTokenResponse,
  now: (() => number) | undefined,
  fallbackRefreshToken = '',
): TokenInfo {
  const expiresIn = positiveInteger(response.expires_in, DEFAULT_TOKEN_LIFETIME_SECONDS);
  const refreshToken = response.refresh_token || fallbackRefreshToken;
  if (refreshToken.length === 0) {
    throw new OAuthUnauthorizedError('OpenAI Codex token response did not include a refresh token.');
  }
  const accountId = extractOpenAICodexAccountId(response);
  return {
    accessToken: response.access_token,
    refreshToken,
    expiresAt: (now ?? (() => Math.floor(Date.now() / 1000)))() + expiresIn,
    expiresIn,
    scope: response.scope ?? DEFAULT_SCOPE,
    tokenType: response.token_type ?? 'Bearer',
    ...(accountId === undefined ? {} : { accountId }),
  };
}

function resolveOpenAICodexTokenStorageName(key = OPENAI_CODEX_OAUTH_KEY): string {
  if (key === OPENAI_CODEX_PLATFORM_ID || key === OPENAI_CODEX_OAUTH_KEY) {
    return OPENAI_CODEX_PLATFORM_ID;
  }
  if (key.startsWith('oauth/')) {
    const name = key.slice('oauth/'.length);
    if (name.length > 0 && !name.includes('/') && !name.startsWith('.')) return name;
  }
  if (!key.includes('/') && !key.startsWith('.') && key.length > 0) return key;
  throw new OAuthError(`Invalid OpenAI Codex OAuth token key: "${key}".`);
}

function encodeDeviceCode(device: EncodedDeviceCode): string {
  return Buffer.from(JSON.stringify(device), 'utf8').toString('base64url');
}

function decodeDeviceCode(value: string): EncodedDeviceCode {
  try {
    const decoded: unknown = JSON.parse(Buffer.from(value, 'base64url').toString('utf8'));
    if (!isRecord(decoded)) throw new TypeError('not an object');
    return {
      deviceAuthId: requiredString(decoded, 'deviceAuthId'),
      userCode: requiredString(decoded, 'userCode'),
    };
  } catch (error) {
    throw new OAuthError('Invalid OpenAI Codex device authorization state.', { cause: error });
  }
}

async function fetchOAuth(
  fetchImpl: typeof fetch,
  url: string,
  init: RequestInit,
  action: string,
): Promise<Response> {
  try {
    return await fetchImpl(url, init);
  } catch (error) {
    throw new OAuthConnectionError(`Failed to ${action}: ${errorMessage(error)}`, {
      cause: error,
    });
  }
}

async function oauthResponseError(response: Response, message: string): Promise<OAuthError> {
  const status = response.status;
  const detail = await readOAuthErrorDetail(response);
  const fullMessage = `${message} (${String(status)})${detail === undefined ? '.' : `: ${detail}`}`;
  if (status === 401 || status === 403) {
    return new OAuthUnauthorizedError(fullMessage);
  }
  if (status === 429 || status >= 500) {
    return new RetryableRefreshError(fullMessage);
  }
  return new OAuthError(fullMessage);
}

async function readOAuthErrorDetail(response: Response): Promise<string | undefined> {
  let value: unknown;
  try {
    value = await response.json();
  } catch {
    return undefined;
  }
  if (!isRecord(value)) return undefined;
  const error = isRecord(value['error']) ? value['error'] : value;
  const code = safeOAuthErrorText(error['code']);
  const message = safeOAuthErrorText(error['message'] ?? error['error_description']);
  if (code === 'unsupported_country_region_territory') {
    return [
      message ?? 'Country, region, or territory not supported.',
      `[${code}]`,
      'Use a network location where OpenAI services are supported and permitted.',
      'Hakimi honors HTTP_PROXY, HTTPS_PROXY, and NO_PROXY.',
    ].join(' ');
  }
  if (message !== undefined && code !== undefined) return `${message} [${code}]`;
  return message ?? code;
}

function safeOAuthErrorText(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined;
  const text = value
    .replaceAll(/[\u0000-\u001F\u007F]/g, ' ')
    .replaceAll(/\s+/g, ' ')
    .trim()
    .slice(0, 240);
  return text.length === 0 ? undefined : text;
}

async function readJsonRecord(response: Response, label: string): Promise<Record<string, unknown>> {
  let value: unknown;
  try {
    value = await response.json();
  } catch (error) {
    throw new OAuthError(`${label} was not valid JSON.`, { cause: error });
  }
  if (!isRecord(value)) {
    throw new OAuthError(`${label} was not a JSON object.`);
  }
  return value;
}

function requiredString(record: Record<string, unknown>, key: string): string {
  const value = optionalString(record[key]);
  if (value === undefined) {
    throw new OAuthError(`OpenAI Codex response is missing "${key}".`);
  }
  return value;
}

function optionalString(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim().length > 0 ? value : undefined;
}

function nonEmptyOrDefault(value: string | undefined, fallback: string): string {
  const trimmed = value?.trim();
  return trimmed === undefined || trimmed.length === 0 ? fallback : trimmed;
}

function aliasProvider(alias: unknown): string | undefined {
  if (!isRecord(alias)) return undefined;
  return optionalString(alias['provider']);
}

function positiveInteger(value: unknown, fallback: number): number {
  const parsed =
    typeof value === 'number'
      ? value
      : typeof value === 'string' && value.trim().length > 0
        ? Number.parseInt(value, 10)
        : Number.NaN;
  return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : fallback;
}

function normalizeIssuer(value: string): string {
  return value.trim().replace(/\/+$/, '');
}

function defaultKimiHome(): string {
  const override = process.env['KIMI_CODE_HOME'];
  if (override !== undefined && override.length > 0) return override;
  return join(homedir(), '.kimi-code');
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
