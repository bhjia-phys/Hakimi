import { readFile } from 'node:fs/promises';

import { parseFrontmatter, FrontmatterError } from '../skill/parser';
import { isReliabilityState, type ReliabilityState } from '../physics-memory';
import type { ResearchActionBinding } from '../research-action';
import type {
  WorkflowRecipe,
  WorkflowRecipeMetadata,
  WorkflowRecipeSource,
} from './types';

export class WorkflowRecipeParseError extends Error {
  readonly reason?: unknown;

  constructor(message: string, cause?: unknown) {
    super(message);
    this.name = 'WorkflowRecipeParseError';
    if (cause !== undefined) this.reason = cause;
  }
}

export interface ParseWorkflowRecipeOptions {
  readonly path: string;
  readonly source: WorkflowRecipeSource;
}

export interface ParseWorkflowRecipeTextOptions extends ParseWorkflowRecipeOptions {
  readonly text: string;
}

export async function parseWorkflowRecipeFromFile(
  options: ParseWorkflowRecipeOptions,
): Promise<WorkflowRecipe> {
  let text: string;
  try {
    text = await readFile(options.path, 'utf8');
  } catch (error) {
    throw new WorkflowRecipeParseError(`Failed to read workflow recipe ${options.path}`, error);
  }
  return parseWorkflowRecipeText({ ...options, text });
}

export function parseWorkflowRecipeText(options: ParseWorkflowRecipeTextOptions): WorkflowRecipe {
  let parsed;
  try {
    parsed = parseFrontmatter(options.text);
  } catch (error) {
    if (error instanceof FrontmatterError) {
      throw new WorkflowRecipeParseError(
        `Invalid frontmatter in ${options.path}: ${error.message}`,
        error,
      );
    }
    throw error;
  }

  if (!isRecord(parsed.data)) {
    throw new WorkflowRecipeParseError(`Missing frontmatter mapping in ${options.path}`);
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
): WorkflowRecipeMetadata {
  const kind = requiredString(raw, 'kind', filePath);
  if (kind !== 'workflow_recipe') {
    throw new WorkflowRecipeParseError(`Invalid workflow recipe kind "${kind}" in ${filePath}`);
  }

  const status = requiredString(raw, 'status', filePath);
  if (!isReliabilityState(status)) {
    throw new WorkflowRecipeParseError(`Invalid workflow recipe status "${status}" in ${filePath}`);
  }

  return {
    id: requiredString(raw, 'id', filePath),
    kind,
    title: requiredString(raw, 'title', filePath),
    domain: requiredString(raw, 'domain', filePath),
    status: status as ReliabilityState,
    sourceRefs: requiredStringArray(raw, 'sourceRefs', filePath),
    actionBindings: actionBindings(raw['actionBindings'], filePath),
    requiredCapsules: stringArray(raw['requiredCapsules']),
    requiredTools: stringArray(raw['requiredTools']),
    failureModes: stringArray(raw['failureModes']),
  };
}

function normalizeKeys(raw: Record<string, unknown>): Record<string, unknown> {
  const aliases: Readonly<Record<string, string>> = {
    source_refs: 'sourceRefs',
    action_bindings: 'actionBindings',
    required_capsules: 'requiredCapsules',
    required_tools: 'requiredTools',
    failure_modes: 'failureModes',
    action_id: 'actionId',
    domain_id: 'domainId',
    workflow_id: 'workflowId',
    lens_id: 'lensId',
    check_id: 'checkId',
    adapter_id: 'adapterId',
    object_refs: 'objectRefs',
  };
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(raw)) {
    if (Array.isArray(value)) {
      out[aliases[key] ?? key] = value.map((item) =>
        isRecord(item) ? normalizeKeys(item) : item,
      );
      continue;
    }
    out[aliases[key] ?? key] = value;
  }
  return out;
}

function actionBindings(value: unknown, filePath: string): readonly ResearchActionBinding[] {
  return objectArray(value, 'actionBindings', filePath).map((item, index) => {
    const actionId = requiredItemString(item, 'actionId', 'actionBindings', filePath);
    return {
      id: optionalItemString(item, 'id') ?? `${actionId}#${String(index + 1)}`,
      actionId,
      domainId: optionalItemString(item, 'domainId'),
      workflowId: optionalItemString(item, 'workflowId'),
      lensId: optionalItemString(item, 'lensId'),
      checkId: optionalItemString(item, 'checkId'),
      adapterId: optionalItemString(item, 'adapterId'),
      objectRefs: stringArray(item['objectRefs']),
      params: isRecord(item['params']) ? item['params'] : undefined,
      reason: optionalItemString(item, 'reason'),
      priority: optionalItemString(item, 'priority') as ResearchActionBinding['priority'],
    };
  });
}

function requiredString(raw: Record<string, unknown>, key: string, filePath: string): string {
  const value = raw[key];
  if (typeof value === 'string' && value.trim().length > 0) return value.trim();
  throw new WorkflowRecipeParseError(`Missing required frontmatter field "${key}" in ${filePath}`);
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
  throw new WorkflowRecipeParseError(
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
    throw new WorkflowRecipeParseError(`Frontmatter field "${key}" must be a list in ${filePath}`);
  }
  return value.map((item, index) => {
    if (!isRecord(item)) {
      throw new WorkflowRecipeParseError(
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
  throw new WorkflowRecipeParseError(
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
