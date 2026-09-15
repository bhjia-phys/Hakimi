/**
 * Official DeepSeek account balance query.
 *
 * Only explicit official HTTPS bases resolve to the fixed balance endpoint.
 * Daily/monthly token consumption is not returned by this API; callers must
 * distinguish locally estimated spend from these authoritative balances.
 */

import { fetchBearerUsageJson, type UsageFetchOptions } from './usage-fetch';
import { isRecord } from './utils';

export const DEEPSEEK_BALANCE_URL = 'https://api.deepseek.com/user/balance';

export interface DeepSeekBalance {
  readonly currency: 'CNY' | 'USD';
  readonly total: string;
  readonly granted: string;
  readonly toppedUp: string;
}

export type FetchDeepSeekBalanceResult =
  | {
      readonly kind: 'ok';
      readonly isAvailable: boolean;
      readonly balances: readonly DeepSeekBalance[];
    }
  | {
      readonly kind: 'error';
      readonly message: string;
      readonly status?: number;
    };

export function officialDeepSeekBalanceUrl(baseUrl: string | undefined): string | undefined {
  if (baseUrl === undefined) return undefined;
  try {
    const url = new URL(baseUrl);
    if (
      url.protocol !== 'https:' ||
      url.hostname !== 'api.deepseek.com' ||
      url.port !== '' ||
      url.username !== '' ||
      url.password !== '' ||
      url.search !== '' ||
      url.hash !== ''
    ) return undefined;
    const path = url.pathname.replace(/\/+$/, '');
    return path === '' || path === '/v1' || path === '/anthropic'
      ? DEEPSEEK_BALANCE_URL
      : undefined;
  } catch {
    return undefined;
  }
}

function isDecimal(value: unknown): value is string {
  return typeof value === 'string' && value.length <= 128 &&
    /^-?(?:0|[1-9]\d*)(?:\.\d+)?$/.test(value) && Number.isFinite(Number(value));
}

export function parseDeepSeekBalancePayload(payload: unknown): FetchDeepSeekBalanceResult {
  const invalid: FetchDeepSeekBalanceResult = {
    kind: 'error',
    message: 'DeepSeek returned an invalid account balance response.',
  };
  if (!isRecord(payload) || typeof payload['is_available'] !== 'boolean' ||
      !Array.isArray(payload['balance_infos']) || payload['balance_infos'].length === 0) return invalid;
  const balances: DeepSeekBalance[] = [];
  const currencies = new Set<string>();
  for (const entry of payload['balance_infos']) {
    if (!isRecord(entry)) return invalid;
    const currency = entry['currency'];
    const total = entry['total_balance'];
    const granted = entry['granted_balance'];
    const toppedUp = entry['topped_up_balance'];
    if ((currency !== 'CNY' && currency !== 'USD') || currencies.has(currency) ||
        !isDecimal(total) || !isDecimal(granted) || !isDecimal(toppedUp)) return invalid;
    currencies.add(currency);
    balances.push({ currency, total, granted, toppedUp });
  }
  return { kind: 'ok', isAvailable: payload['is_available'], balances };
}

export interface FetchDeepSeekBalanceOptions extends UsageFetchOptions {}

export async function fetchDeepSeekBalance(
  apiKey: string,
  options: FetchDeepSeekBalanceOptions = {},
): Promise<FetchDeepSeekBalanceResult> {
  const result = await fetchBearerUsageJson(
    DEEPSEEK_BALANCE_URL,
    apiKey,
    {},
    {
      unauthorized: 'Authorization failed. Please check your DeepSeek API key.',
      notFound: 'The official DeepSeek balance endpoint is unavailable.',
      statusPrefix: 'Failed to query DeepSeek balance',
    },
    options,
  );
  return result.kind === 'error' ? result : parseDeepSeekBalancePayload(result.json);
}
