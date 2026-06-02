import { readFile } from 'node:fs/promises';

import { parseFrontmatter, FrontmatterError } from '../skill/parser';
import {
  isReliabilityState,
  type ReliabilityState,
} from '../physics-memory';
import type {
  DomainProfile,
  DomainProfileMetadata,
  DomainProfileSource,
} from './types';

export class DomainProfileParseError extends Error {
  readonly reason?: unknown;

  constructor(message: string, cause?: unknown) {
    super(message);
    this.name = 'DomainProfileParseError';
    if (cause !== undefined) this.reason = cause;
  }
}

export interface ParseDomainProfileOptions {
  readonly path: string;
  readonly source: DomainProfileSource;
}

export interface ParseDomainProfileTextOptions extends ParseDomainProfileOptions {
  readonly text: string;
}

export async function parseDomainProfileFromFile(
  options: ParseDomainProfileOptions,
): Promise<DomainProfile> {
  let text: string;
  try {
    text = await readFile(options.path, 'utf8');
  } catch (error) {
    throw new DomainProfileParseError(`Failed to read domain profile ${options.path}`, error);
  }
  return parseDomainProfileText({ ...options, text });
}

export function parseDomainProfileText(options: ParseDomainProfileTextOptions): DomainProfile {
  let parsed;
  try {
    parsed = parseFrontmatter(options.text);
  } catch (error) {
    if (error instanceof FrontmatterError) {
      throw new DomainProfileParseError(
        `Invalid frontmatter in ${options.path}: ${error.message}`,
        error,
      );
    }
    throw error;
  }

  if (!isRecord(parsed.data)) {
    throw new DomainProfileParseError(`Missing frontmatter mapping in ${options.path}`);
  }

  const metadata = parseMetadata(normalizeKeys(parsed.data), options.path);
  return {
    metadata,
    path: options.path,
    body: parsed.body.trim(),
    source: options.source,
  };
}

function parseMetadata(
  raw: Record<string, unknown>,
  filePath: string,
): DomainProfileMetadata {
  const kind = requiredString(raw, 'kind', filePath);
  if (kind !== 'domain_profile') {
    throw new DomainProfileParseError(`Invalid domain profile kind "${kind}" in ${filePath}`);
  }

  const status = requiredString(raw, 'status', filePath);
  if (!isReliabilityState(status)) {
    throw new DomainProfileParseError(`Invalid domain profile status "${status}" in ${filePath}`);
  }

  return {
    id: requiredString(raw, 'id', filePath),
    kind,
    title: requiredString(raw, 'title', filePath),
    domain: requiredString(raw, 'domain', filePath),
    status: status as ReliabilityState,
    sourceRefs: requiredStringArray(raw, 'sourceRefs', filePath),
    conventions: stringArray(raw['conventions']),
    lenses: stringArray(raw['lenses']),
    workflows: stringArray(raw['workflows']),
    capsuleRefs: stringArray(raw['capsuleRefs']),
    bridgeCapsules: stringArray(raw['bridgeCapsules']),
    contextTags: stringArray(raw['contextTags']),
  };
}

function normalizeKeys(raw: Record<string, unknown>): Record<string, unknown> {
  const aliases: Readonly<Record<string, string>> = {
    source_refs: 'sourceRefs',
    capsule_refs: 'capsuleRefs',
    bridge_capsules: 'bridgeCapsules',
    context_tags: 'contextTags',
  };
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(raw)) {
    out[aliases[key] ?? key] = value;
  }
  return out;
}

function requiredString(raw: Record<string, unknown>, key: string, filePath: string): string {
  const value = raw[key];
  if (typeof value === 'string' && value.trim().length > 0) return value.trim();
  throw new DomainProfileParseError(`Missing required frontmatter field "${key}" in ${filePath}`);
}

function stringArray(value: unknown): readonly string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is string => typeof item === 'string' && item.trim().length > 0);
}

function requiredStringArray(
  raw: Record<string, unknown>,
  key: string,
  filePath: string,
): readonly string[] {
  const values = stringArray(raw[key]);
  if (values.length > 0) return values;
  throw new DomainProfileParseError(
    `Missing required non-empty frontmatter field "${key}" in ${filePath}`,
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
