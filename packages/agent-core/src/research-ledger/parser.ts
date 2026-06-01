import { readFile } from 'node:fs/promises';

import { FrontmatterError, parseFrontmatter } from '../skill/parser';
import { isPhysicsCapsuleKind, type PhysicsCapsuleKind } from '../physics-memory';
import {
  isResearchLedgerEventStatus,
  isResearchLedgerEventType,
  type ResearchLedgerEvent,
  type ResearchLedgerEventMetadata,
  type ResearchLedgerRoot,
} from './types';

export class ResearchLedgerParseError extends Error {
  readonly reason?: unknown;

  constructor(message: string, cause?: unknown) {
    super(message);
    this.name = 'ResearchLedgerParseError';
    if (cause !== undefined) this.reason = cause;
  }
}

export interface ParseResearchLedgerEventOptions {
  readonly path: string;
  readonly root: ResearchLedgerRoot;
}

export interface ParseResearchLedgerEventTextOptions
  extends ParseResearchLedgerEventOptions {
  readonly text: string;
}

export async function parseResearchLedgerEventFromFile(
  options: ParseResearchLedgerEventOptions,
): Promise<ResearchLedgerEvent> {
  let text: string;
  try {
    text = await readFile(options.path, 'utf8');
  } catch (error) {
    throw new ResearchLedgerParseError(`Failed to read research ledger event ${options.path}`, error);
  }
  return parseResearchLedgerEventText({ ...options, text });
}

export function parseResearchLedgerEventText(
  options: ParseResearchLedgerEventTextOptions,
): ResearchLedgerEvent {
  let parsed;
  try {
    parsed = parseFrontmatter(options.text);
  } catch (error) {
    if (error instanceof FrontmatterError) {
      throw new ResearchLedgerParseError(
        `Invalid frontmatter in ${options.path}: ${error.message}`,
        error,
      );
    }
    throw error;
  }

  if (!isRecord(parsed.data)) {
    throw new ResearchLedgerParseError(`Missing frontmatter mapping in ${options.path}`);
  }

  const raw = normalizeKeys(parsed.data);
  return {
    metadata: parseMetadata(raw, options.path),
    path: options.path,
    body: parsed.body,
    root: options.root,
  };
}

function parseMetadata(
  raw: Record<string, unknown>,
  filePath: string,
): ResearchLedgerEventMetadata {
  const id = requiredString(raw, 'id', filePath);
  const type = requiredString(raw, 'type', filePath);
  const topic = requiredString(raw, 'topic', filePath);
  const domain = requiredString(raw, 'domain', filePath);
  const status = requiredString(raw, 'status', filePath);

  if (!isResearchLedgerEventType(type)) {
    throw new ResearchLedgerParseError(`Invalid research ledger event type "${type}" in ${filePath}`);
  }
  if (!isResearchLedgerEventStatus(status)) {
    throw new ResearchLedgerParseError(
      `Invalid research ledger event status "${status}" in ${filePath}`,
    );
  }

  return {
    id,
    type,
    topic,
    domain,
    status,
    sourceRefs: stringArray(raw['sourceRefs']),
    dependsOn: stringArray(raw['dependsOn']),
    candidateCapsuleKind: candidateCapsuleKind(raw['candidateCapsuleKind'], filePath),
    openQuestions: stringArray(raw['openQuestions']),
    relatedObjects: stringArray(raw['relatedObjects']),
    createdAt: optionalString(raw['createdAt']),
  };
}

function normalizeKeys(raw: Record<string, unknown>): Record<string, unknown> {
  const aliases: Readonly<Record<string, string>> = {
    source_refs: 'sourceRefs',
    depends_on: 'dependsOn',
    candidate_capsule_kind: 'candidateCapsuleKind',
    open_questions: 'openQuestions',
    related_objects: 'relatedObjects',
    created_at: 'createdAt',
  };
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(raw)) {
    out[aliases[key] ?? key] = value;
  }
  return out;
}

function candidateCapsuleKind(
  value: unknown,
  filePath: string,
): PhysicsCapsuleKind | undefined {
  if (value === undefined) return undefined;
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new ResearchLedgerParseError(
      `Frontmatter field "candidateCapsuleKind" must be a string in ${filePath}`,
    );
  }
  const kind = value.trim();
  if (!isPhysicsCapsuleKind(kind)) {
    throw new ResearchLedgerParseError(`Invalid candidate capsule kind "${kind}" in ${filePath}`);
  }
  return kind;
}

function requiredString(raw: Record<string, unknown>, key: string, filePath: string): string {
  const value = raw[key];
  if (typeof value === 'string' && value.trim().length > 0) return value.trim();
  throw new ResearchLedgerParseError(
    `Missing required frontmatter field "${key}" in ${filePath}`,
  );
}

function optionalString(value: unknown): string | undefined {
  if (value instanceof Date) return value.toISOString();
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : undefined;
}

function stringArray(value: unknown): readonly string[] {
  if (value === undefined) return [];
  if (typeof value === 'string' && value.trim().length > 0) return [value.trim()];
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is string => typeof item === 'string' && item.trim().length > 0);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
