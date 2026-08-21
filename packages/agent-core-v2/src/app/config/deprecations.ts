/**
 * `config` domain — declarative config deprecation detection.
 *
 * Sections declare deprecated keys (`RegisterSectionOptions.deprecations`) or a
 * deprecated whole-section control surface (`RegisterSectionOptions.deprecation`).
 * This module turns their presence in the raw on-disk document into warning
 * `ConfigDiagnostic`s. Detection is read-only: values are never migrated or
 * rewritten, so the warning itself is the migration guide.
 */

import type { ConfigDiagnostic, ConfigSection } from './config';
import { isPlainObject } from './configPure';
import { camelToSnake } from './toml';

export function collectKeyDeprecations(
  rawSnake: Record<string, unknown>,
  sections: readonly ConfigSection[],
): ConfigDiagnostic[] {
  const diagnostics: ConfigDiagnostic[] = [];
  for (const section of sections) {
    const deprecations = section.deprecations;
    if (deprecations === undefined || deprecations.length === 0) continue;
    const snakeDomain = camelToSnake(section.domain);
    const rawSection = rawSnake[snakeDomain];
    if (!isPlainObject(rawSection)) continue;
    for (const deprecation of deprecations) {
      if (rawSection[deprecation.key] === undefined) continue;
      diagnostics.push({
        domain: section.domain,
        severity: 'warning',
        message:
          `[${snakeDomain}] '${deprecation.key}' is deprecated and no longer used; ` +
          `rename it to '${deprecation.replacement}'.` +
          (deprecation.message === undefined ? '' : ` ${deprecation.message}`) +
          ' Run /update-config to fix it.',
      });
    }
  }
  return diagnostics;
}

export function collectSectionDeprecations(
  rawSnake: Record<string, unknown>,
  sections: readonly ConfigSection[],
): ConfigDiagnostic[] {
  const diagnostics: ConfigDiagnostic[] = [];
  for (const section of sections) {
    const deprecation = section.deprecation;
    if (deprecation === undefined) continue;
    const snakeDomain = camelToSnake(section.domain);
    if (!Object.prototype.hasOwnProperty.call(rawSnake, snakeDomain)) continue;
    diagnostics.push({
      domain: section.domain,
      severity: 'warning',
      message:
        `[${snakeDomain}] is deprecated and remains readable only for compatibility; ` +
        `use ${deprecation.replacement} instead.` +
        (deprecation.message === undefined ? '' : ` ${deprecation.message}`),
    });
  }
  return diagnostics;
}
