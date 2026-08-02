/**
 * `auth` domain (cross-cutting) — web search backend seam.
 *
 * Owns the seam for the `WebSearch` backend. `IWebSearchProviderService`
 * exposes the configured `WebSearchProvider`: a Moonshot search backend
 * (explicit `[services.moonshot_search]` config, or the managed Kimi OAuth
 * provider after a successful login) when one is available, and the no-auth
 * local HTML search provider otherwise — never `undefined`, so the `WebSearch`
 * tool is always registered. `hasWebSearchProvider` answers presence of a real
 * Moonshot backend alone, for hosts that gate on it. The default
 * `WebSearchProviderService` builds the backend itself; tests and hosts that
 * need a custom backend bind `IWebSearchProviderService` directly. Bound at
 * App scope.
 */

import { createDecorator, type ServiceIdentifier } from '#/_base/di/instantiation';

import type { WebSearchProvider } from '#/agent/tools/web-search/web-search';

export type { WebSearchProvider, WebSearchResult } from '#/agent/tools/web-search/web-search';

export interface IWebSearchProviderService {
  readonly _serviceBrand: undefined;

  getWebSearchProvider(): WebSearchProvider;
  hasWebSearchProvider(): boolean;
}

export const IWebSearchProviderService: ServiceIdentifier<IWebSearchProviderService> =
  createDecorator<IWebSearchProviderService>('webSearchProviderService');
