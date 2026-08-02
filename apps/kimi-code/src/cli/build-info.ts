declare const __KIMI_CODE_VERSION__: string | undefined;
declare const __KIMI_CODE_CHANNEL__: string | undefined;
declare const __KIMI_CODE_COMMIT__: string | undefined;
declare const __KIMI_CODE_BUILD_TARGET__: string | undefined;
declare const __KIMI_CODE_UPSTREAM_REPOSITORY__: string | undefined;
declare const __KIMI_CODE_UPSTREAM_VERSION__: string | undefined;
declare const __KIMI_CODE_UPSTREAM_COMMIT__: string | undefined;

/**
 * The upstream Kimi Code baseline this Hakimi build derives from. Mirrors
 * `upstream-base.json` (the source of truth) and is injected at build time
 * into bundles that cannot read files at runtime (native SEA).
 */
export interface UpstreamBase {
  readonly repository: string;
  readonly version: string;
  readonly commit: string;
}

export interface KimiBuildInfo {
  readonly version?: string;
  readonly channel?: string;
  readonly commit?: string;
  readonly buildTarget?: string;
  readonly upstream?: UpstreamBase;
}

function optionalBuildString(value: unknown): string | undefined {
  return typeof value === 'string' && value.length > 0 ? value : undefined;
}

function optionalUpstreamBase(): UpstreamBase | undefined {
  if (
    typeof __KIMI_CODE_UPSTREAM_REPOSITORY__ !== 'string' ||
    typeof __KIMI_CODE_UPSTREAM_VERSION__ !== 'string' ||
    typeof __KIMI_CODE_UPSTREAM_COMMIT__ !== 'string'
  ) {
    return undefined;
  }
  const repository = optionalBuildString(__KIMI_CODE_UPSTREAM_REPOSITORY__);
  const version = optionalBuildString(__KIMI_CODE_UPSTREAM_VERSION__);
  const commit = optionalBuildString(__KIMI_CODE_UPSTREAM_COMMIT__);
  if (repository === undefined || version === undefined || commit === undefined) {
    return undefined;
  }
  return { repository, version, commit };
}

export const KIMI_BUILD_INFO: KimiBuildInfo = {
  version:
    typeof __KIMI_CODE_VERSION__ === 'string'
      ? optionalBuildString(__KIMI_CODE_VERSION__)
      : undefined,
  channel:
    typeof __KIMI_CODE_CHANNEL__ === 'string'
      ? optionalBuildString(__KIMI_CODE_CHANNEL__)
      : undefined,
  commit:
    typeof __KIMI_CODE_COMMIT__ === 'string'
      ? optionalBuildString(__KIMI_CODE_COMMIT__)
      : undefined,
  buildTarget:
    typeof __KIMI_CODE_BUILD_TARGET__ === 'string'
      ? optionalBuildString(__KIMI_CODE_BUILD_TARGET__)
      : undefined,
  upstream: optionalUpstreamBase(),
};
