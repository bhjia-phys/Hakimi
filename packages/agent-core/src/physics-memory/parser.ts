import { readFile } from 'node:fs/promises';

import { parseFrontmatter, FrontmatterError } from '../skill/parser';
import {
  isPhysicsCapsuleKind,
  isReliabilityState,
  type ActionAffordance,
  type BridgeSpec,
  type CheckContract,
  type ExpansionHandle,
  type GraphRef,
  type PhysicsCapsule,
  type PhysicsCapsuleMetadata,
  type PhysicsMemorySource,
  type ScopeSpec,
} from './types';

export class PhysicsMemoryParseError extends Error {
  readonly reason?: unknown;

  constructor(message: string, cause?: unknown) {
    super(message);
    this.name = 'PhysicsMemoryParseError';
    if (cause !== undefined) this.reason = cause;
  }
}

export interface ParsePhysicsCapsuleOptions {
  readonly path: string;
  readonly source: PhysicsMemorySource;
}

export interface ParsePhysicsCapsuleTextOptions extends ParsePhysicsCapsuleOptions {
  readonly text: string;
}

export async function parsePhysicsCapsuleFromFile(
  options: ParsePhysicsCapsuleOptions,
): Promise<PhysicsCapsule> {
  let text: string;
  try {
    text = await readFile(options.path, 'utf8');
  } catch (error) {
    throw new PhysicsMemoryParseError(`Failed to read physics capsule ${options.path}`, error);
  }
  return parsePhysicsCapsuleText({ ...options, text });
}

export function parsePhysicsCapsuleText(options: ParsePhysicsCapsuleTextOptions): PhysicsCapsule {
  let parsed;
  try {
    parsed = parseFrontmatter(options.text);
  } catch (error) {
    if (error instanceof FrontmatterError) {
      throw new PhysicsMemoryParseError(
        `Invalid frontmatter in ${options.path}: ${error.message}`,
        error,
      );
    }
    throw error;
  }

  if (!isRecord(parsed.data)) {
    throw new PhysicsMemoryParseError(`Missing frontmatter mapping in ${options.path}`);
  }

  const raw = normalizeKeys(parsed.data);
  const metadata = parseMetadata(raw, options.path);
  return {
    metadata,
    path: options.path,
    body: parsed.body.trim(),
    source: options.source,
  };
}

function parseMetadata(raw: Record<string, unknown>, filePath: string): PhysicsCapsuleMetadata {
  const id = requiredString(raw, 'id', filePath);
  const kind = requiredString(raw, 'kind', filePath);
  const domain = requiredString(raw, 'domain', filePath);
  const title = requiredString(raw, 'title', filePath);
  const reliability = requiredString(raw, 'reliability', filePath);

  if (!isPhysicsCapsuleKind(kind)) {
    throw new PhysicsMemoryParseError(`Invalid capsule kind "${kind}" in ${filePath}`);
  }
  if (!isReliabilityState(reliability)) {
    throw new PhysicsMemoryParseError(`Invalid reliability state "${reliability}" in ${filePath}`);
  }

  const sourceRefs = requiredStringArray(raw, 'sourceRefs', filePath);
  return {
    id,
    kind,
    domain,
    title,
    reliability,
    symbols: stringArray(raw['symbols']),
    assumes: stringArray(raw['assumes']),
    dependsOn: stringArray(raw['dependsOn']),
    sourceRefs,
    graphRefs: graphRefs(raw['graphRefs'], filePath),
    expansionHandles: expansionHandles(raw['expansionHandles'], filePath),
    requiredChecks: checkContracts(raw['requiredChecks'], filePath),
    actionAffordances: actionAffordances(raw['actionAffordances'], filePath),
    scope: scopeSpec(raw['scope']),
    allowCrossDomain: raw['allowCrossDomain'] === true,
    bridge: bridgeSpec(raw['bridge'], filePath),
  };
}

function normalizeKeys(raw: Record<string, unknown>): Record<string, unknown> {
  const aliases: Readonly<Record<string, string>> = {
    depends_on: 'dependsOn',
    source_refs: 'sourceRefs',
    graph_refs: 'graphRefs',
    expansion_handles: 'expansionHandles',
    required_checks: 'requiredChecks',
    action_affordances: 'actionAffordances',
    allow_cross_domain: 'allowCrossDomain',
    from_domain: 'fromDomain',
    to_domain: 'toDomain',
    capsule_refs: 'capsuleRefs',
  };
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(raw)) {
    out[aliases[key] ?? key] = value;
  }
  return out;
}

function graphRefs(value: unknown, filePath: string): readonly GraphRef[] {
  return objectArray(value, 'graphRefs', filePath).map((item) => ({
    kind: requiredItemString(item, 'kind', 'graphRefs', filePath) as GraphRef['kind'],
    id: requiredItemString(item, 'id', 'graphRefs', filePath),
    relation: optionalItemString(item, 'relation') as GraphRef['relation'],
  }));
}

function expansionHandles(value: unknown, filePath: string): readonly ExpansionHandle[] {
  return objectArray(value, 'expansionHandles', filePath).map((item) => ({
    kind: requiredItemString(item, 'kind', 'expansionHandles', filePath) as ExpansionHandle['kind'],
    ref: requiredItemString(item, 'ref', 'expansionHandles', filePath),
    title: optionalItemString(item, 'title'),
  }));
}

function checkContracts(value: unknown, filePath: string): readonly CheckContract[] {
  return objectArray(value, 'requiredChecks', filePath).map((item) => ({
    id: requiredItemString(item, 'id', 'requiredChecks', filePath),
    kind: requiredItemString(item, 'kind', 'requiredChecks', filePath) as CheckContract['kind'],
    severity: requiredItemString(
      item,
      'severity',
      'requiredChecks',
      filePath,
    ) as CheckContract['severity'],
    description: optionalItemString(item, 'description'),
  }));
}

function actionAffordances(value: unknown, filePath: string): readonly ActionAffordance[] {
  return objectArray(value, 'actionAffordances', filePath).map((item) => ({
    actionId: requiredItemString(item, 'action_id', 'actionAffordances', filePath),
    intent: requiredItemString(
      item,
      'intent',
      'actionAffordances',
      filePath,
    ) as ActionAffordance['intent'],
    reason: optionalItemString(item, 'reason'),
  }));
}

function scopeSpec(value: unknown): ScopeSpec | undefined {
  if (!isRecord(value)) return undefined;
  return {
    regimes: stringArray(value['regimes']),
    assumptions: stringArray(value['assumptions']),
    excludes: stringArray(value['excludes']),
  };
}

function bridgeSpec(value: unknown, filePath: string): BridgeSpec | undefined {
  if (value === undefined) return undefined;
  if (!isRecord(value)) {
    throw new PhysicsMemoryParseError(
      `Frontmatter field "bridge" must be a mapping in ${filePath}`,
    );
  }
  const raw = normalizeKeys(value);
  return {
    fromDomain: requiredString(raw, 'fromDomain', filePath),
    toDomain: requiredString(raw, 'toDomain', filePath),
    capsuleRefs: stringArray(raw['capsuleRefs']),
    reason: optionalItemString(raw, 'reason'),
  };
}

function requiredString(raw: Record<string, unknown>, key: string, filePath: string): string {
  const value = raw[key];
  if (typeof value === 'string' && value.trim().length > 0) return value.trim();
  throw new PhysicsMemoryParseError(`Missing required frontmatter field "${key}" in ${filePath}`);
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
  throw new PhysicsMemoryParseError(
    `Missing required non-empty frontmatter field "${key}" in ${filePath}`,
  );
}

function objectArray(
  value: unknown,
  key: string,
  filePath: string,
): readonly Record<string, unknown>[] {
  if (value === undefined) return [];
  if (!Array.isArray(value)) {
    throw new PhysicsMemoryParseError(`Frontmatter field "${key}" must be a list in ${filePath}`);
  }
  return value.map((item, index) => {
    if (!isRecord(item)) {
      throw new PhysicsMemoryParseError(
        `Frontmatter field "${key}" item ${String(index)} must be a mapping in ${filePath}`,
      );
    }
    return normalizeKeys(item);
  });
}

function requiredItemString(
  raw: Record<string, unknown>,
  key: string,
  listKey: string,
  filePath: string,
): string {
  const value = raw[key];
  if (typeof value === 'string' && value.trim().length > 0) return value.trim();
  throw new PhysicsMemoryParseError(
    `Frontmatter field "${listKey}" item is missing "${key}" in ${filePath}`,
  );
}

function optionalItemString(raw: Record<string, unknown>, key: string): string | undefined {
  const value = raw[key];
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : undefined;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
