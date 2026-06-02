import { readFile } from 'node:fs/promises';

import { parseFrontmatter, FrontmatterError } from '../skill/parser';
import type { CheckContract } from '../physics-memory';
import type {
  ResearchActionBinding,
  ResearchActionOutcome,
  ResearchEvalActionExpectation,
  ResearchEvalCase,
  ResearchEvalFinalStatus,
  ResearchEvalValidation,
} from '../research-action';
import type {
  FileBackedResearchEvalCase,
  ResearchEvalCaseSource,
} from './types';

const ACTION_OUTCOMES = ['pass', 'fail', 'blocked', 'inconclusive'] as const;
const FINAL_STATUSES = [
  'exploratory',
  'provisional',
  'checked',
  'validated',
  'blocked',
] as const;
const CHECK_KINDS = [
  'symbol_closure',
  'dimension',
  'convention',
  'assumption_scope',
  'limiting_case',
  'symmetry',
  'benchmark',
  'code_mapping',
] as const;
const CHECK_SEVERITIES = ['info', 'warning', 'blocking'] as const;

export class ResearchEvalCaseParseError extends Error {
  readonly reason?: unknown;

  constructor(message: string, cause?: unknown) {
    super(message);
    this.name = 'ResearchEvalCaseParseError';
    if (cause !== undefined) this.reason = cause;
  }
}

export interface ParseResearchEvalCaseOptions {
  readonly path: string;
  readonly source: ResearchEvalCaseSource;
}

export interface ParseResearchEvalCaseTextOptions extends ParseResearchEvalCaseOptions {
  readonly text: string;
}

export async function parseResearchEvalCaseFromFile(
  options: ParseResearchEvalCaseOptions,
): Promise<FileBackedResearchEvalCase> {
  let text: string;
  try {
    text = await readFile(options.path, 'utf8');
  } catch (error) {
    throw new ResearchEvalCaseParseError(`Failed to read research eval case ${options.path}`, error);
  }
  return parseResearchEvalCaseText({ ...options, text });
}

export function parseResearchEvalCaseText(
  options: ParseResearchEvalCaseTextOptions,
): FileBackedResearchEvalCase {
  let parsed;
  try {
    parsed = parseFrontmatter(options.text);
  } catch (error) {
    if (error instanceof FrontmatterError) {
      throw new ResearchEvalCaseParseError(
        `Invalid frontmatter in ${options.path}: ${error.message}`,
        error,
      );
    }
    throw error;
  }

  if (!isRecord(parsed.data)) {
    throw new ResearchEvalCaseParseError(`Missing frontmatter mapping in ${options.path}`);
  }

  const raw = normalizeKeys(parsed.data);
  const kind = requiredString(raw, 'kind', options.path);
  if (kind !== 'research_eval_case') {
    throw new ResearchEvalCaseParseError(
      `Invalid research eval case kind "${kind}" in ${options.path}`,
    );
  }

  const sourceRefs = requiredStringArray(raw, 'sourceRefs', options.path);
  const evalCase: ResearchEvalCase = {
    id: requiredString(raw, 'id', options.path),
    title: requiredString(raw, 'title', options.path),
    task: requiredString(raw, 'task', options.path),
    domain: optionalString(raw, 'domain'),
    capsuleRefs: stringArray(raw['capsuleRefs']),
    actionSequence: [
      ...actionExpectations(raw['actionSequence'], 'actionSequence', options.path),
      ...actionBindings(raw['requiredActionBindings'], 'requiredActionBindings', options.path),
    ],
    validations: validations(raw, options.path),
    timeoutSeconds: optionalNumber(raw, 'timeoutSeconds', options.path),
  };

  return {
    evalCase,
    path: options.path,
    body: parsed.body.trim(),
    source: options.source,
    sourceRefs,
  };
}

function validations(
  raw: Record<string, unknown>,
  filePath: string,
): readonly ResearchEvalValidation[] {
  const out: ResearchEvalValidation[] = [];
  for (const item of objectArray(raw['validations'], 'validations', filePath)) {
    const type = requiredItemString(item, 'type', 'validations', filePath);
    switch (type) {
      case 'action_outcome':
        out.push({
          type,
          actionId: requiredItemString(item, 'actionId', 'validations', filePath),
          outcome: actionOutcome(requiredItemString(item, 'outcome', 'validations', filePath), filePath),
        });
        break;
      case 'evidence_ref':
        out.push({
          type,
          pattern: requiredItemString(item, 'pattern', 'validations', filePath),
        });
        break;
      case 'required_check':
        out.push({
          type,
          check: checkContract(
            isRecord(item['check']) ? normalizeKeys(item['check']) : item,
            filePath,
          ),
        });
        break;
      case 'final_status':
        out.push({
          type,
          status: finalStatus(requiredItemString(item, 'status', 'validations', filePath), filePath),
        });
        break;
      case 'forbidden_claim':
        out.push({
          type,
          pattern: requiredItemString(item, 'pattern', 'validations', filePath),
        });
        break;
      default:
        throw new ResearchEvalCaseParseError(
          `Unsupported validation type "${type}" in ${filePath}`,
        );
    }
  }

  const expectedFinalStatus = optionalString(raw, 'expectedFinalStatus');
  if (expectedFinalStatus !== undefined) {
    out.push({
      type: 'final_status',
      status: finalStatus(expectedFinalStatus, filePath),
    });
  }
  for (const pattern of stringArray(raw['forbiddenClaims'])) {
    out.push({
      type: 'forbidden_claim',
      pattern,
    });
  }
  for (const check of objectArray(raw['requiredChecks'], 'requiredChecks', filePath)) {
    out.push({
      type: 'required_check',
      check: checkContract(check, filePath),
    });
  }
  return out;
}

function actionExpectations(
  value: unknown,
  key: string,
  filePath: string,
): readonly ResearchEvalActionExpectation[] {
  if (value === undefined) return [];
  if (!Array.isArray(value)) {
    throw new ResearchEvalCaseParseError(`Frontmatter field "${key}" must be a list in ${filePath}`);
  }
  return value.map((item, index) => {
    if (typeof item === 'string' && item.trim().length > 0) return item.trim();
    if (isRecord(item)) {
      return actionBinding(normalizeKeys(item), index, key, filePath);
    }
    throw new ResearchEvalCaseParseError(
      `Frontmatter field "${key}" item ${String(index)} must be a string or mapping in ${filePath}`,
    );
  });
}

function actionBindings(
  value: unknown,
  key: string,
  filePath: string,
): readonly ResearchActionBinding[] {
  return objectArray(value, key, filePath).map((item, index) =>
    actionBinding(item, index, key, filePath),
  );
}

function actionBinding(
  item: Record<string, unknown>,
  index: number,
  key: string,
  filePath: string,
): ResearchActionBinding {
  const actionId = requiredItemString(item, 'actionId', key, filePath);
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
}

function checkContract(raw: Record<string, unknown>, filePath: string): CheckContract {
  const id = optionalString(raw, 'id') ?? optionalString(raw, 'checkId');
  if (id === undefined) {
    throw new ResearchEvalCaseParseError(`Missing required check id in ${filePath}`);
  }
  const kind = requiredString(raw, 'kind', filePath);
  if (!includes(CHECK_KINDS, kind)) {
    throw new ResearchEvalCaseParseError(`Invalid check kind "${kind}" in ${filePath}`);
  }
  const severity = requiredString(raw, 'severity', filePath);
  if (!includes(CHECK_SEVERITIES, severity)) {
    throw new ResearchEvalCaseParseError(`Invalid check severity "${severity}" in ${filePath}`);
  }
  return {
    id,
    kind,
    severity,
    description: optionalString(raw, 'description'),
  };
}

function actionOutcome(value: string, filePath: string): ResearchActionOutcome {
  if (includes(ACTION_OUTCOMES, value)) return value;
  throw new ResearchEvalCaseParseError(`Invalid action outcome "${value}" in ${filePath}`);
}

function finalStatus(value: string, filePath: string): ResearchEvalFinalStatus {
  if (includes(FINAL_STATUSES, value)) return value;
  throw new ResearchEvalCaseParseError(`Invalid final status "${value}" in ${filePath}`);
}

function normalizeKeys(raw: Record<string, unknown>): Record<string, unknown> {
  const aliases: Readonly<Record<string, string>> = {
    source_refs: 'sourceRefs',
    capsule_refs: 'capsuleRefs',
    action_sequence: 'actionSequence',
    required_actions: 'actionSequence',
    required_action_bindings: 'requiredActionBindings',
    expected_final_status: 'expectedFinalStatus',
    forbidden_claims: 'forbiddenClaims',
    required_checks: 'requiredChecks',
    timeout_seconds: 'timeoutSeconds',
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
    if (isRecord(value)) {
      out[aliases[key] ?? key] = normalizeKeys(value);
      continue;
    }
    out[aliases[key] ?? key] = value;
  }
  return out;
}

function requiredString(raw: Record<string, unknown>, key: string, filePath: string): string {
  const value = raw[key];
  if (typeof value === 'string' && value.trim().length > 0) return value.trim();
  throw new ResearchEvalCaseParseError(
    `Missing required frontmatter field "${key}" in ${filePath}`,
  );
}

function optionalString(raw: Record<string, unknown>, key: string): string | undefined {
  const value = raw[key];
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : undefined;
}

function optionalNumber(
  raw: Record<string, unknown>,
  key: string,
  filePath: string,
): number | undefined {
  const value = raw[key];
  if (value === undefined) return undefined;
  if (typeof value === 'number' && Number.isFinite(value) && value > 0) return value;
  throw new ResearchEvalCaseParseError(
    `Frontmatter field "${key}" must be a positive number in ${filePath}`,
  );
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
  throw new ResearchEvalCaseParseError(
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
    throw new ResearchEvalCaseParseError(`Frontmatter field "${key}" must be a list in ${filePath}`);
  }
  return value.map((item, index) => {
    if (!isRecord(item)) {
      throw new ResearchEvalCaseParseError(
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
  throw new ResearchEvalCaseParseError(
    `Frontmatter field "${listKey}" item is missing "${key}" in ${filePath}`,
  );
}

function optionalItemString(raw: Record<string, unknown>, key: string): string | undefined {
  const value = raw[key];
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : undefined;
}

function includes<const T extends readonly string[]>(values: T, value: string): value is T[number] {
  return values.includes(value);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
