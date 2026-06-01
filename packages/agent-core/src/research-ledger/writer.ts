import { promises as fs } from 'node:fs';

import { dump as dumpYaml } from 'js-yaml';
import { join, relative, resolve } from 'pathe';

import { parseResearchLedgerEventText } from './parser';
import type {
  ResearchLedgerEvent,
  ResearchLedgerEventMetadata,
  ResearchLedgerRoot,
} from './types';

export class ResearchLedgerWriteError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ResearchLedgerWriteError';
  }
}

export interface ResearchLedgerWriteInput {
  readonly root: ResearchLedgerRoot;
  readonly metadata: Omit<ResearchLedgerEventMetadata, 'createdAt'> & {
    readonly createdAt?: string | undefined;
  };
  readonly body: string;
  readonly overwrite?: boolean | undefined;
  readonly now?: Date | undefined;
  readonly mkdir?: typeof fs.mkdir | undefined;
  readonly writeFile?: typeof fs.writeFile | undefined;
  readonly pathExists?: ((path: string) => Promise<boolean>) | undefined;
}

export interface ResearchLedgerWriteResult {
  readonly event: ResearchLedgerEvent;
  readonly path: string;
  readonly created: boolean;
}

export async function writeResearchLedgerEvent(
  input: ResearchLedgerWriteInput,
): Promise<ResearchLedgerWriteResult> {
  validateRequiredMetadata(input.metadata);
  const rootPath = resolve(input.root.path);
  const topicSlug = stablePathSlug(input.metadata.topic, 'topic');
  const eventSlug = stablePathSlug(input.metadata.id, 'event');
  const dir = join(rootPath, topicSlug, 'events');
  const path = resolve(dir, `${eventSlug}.md`);
  assertWithinRoot(rootPath, path);

  const pathExists = input.pathExists ?? defaultPathExists;
  const exists = await pathExists(path);
  if (exists && input.overwrite !== true) {
    throw new ResearchLedgerWriteError(
      `Research ledger event file already exists: ${path}`,
    );
  }

  const text = renderResearchLedgerEventText({
    metadata: {
      ...input.metadata,
      createdAt: input.metadata.createdAt ?? (input.now ?? new Date()).toISOString(),
    },
    body: input.body,
  });
  const event = parseResearchLedgerEventText({
    path,
    root: { ...input.root, path: rootPath },
    text,
  });

  await (input.mkdir ?? fs.mkdir)(dir, { recursive: true });
  await (input.writeFile ?? fs.writeFile)(path, text, 'utf8');
  return { event, path, created: !exists };
}

export function renderResearchLedgerEventText(input: {
  readonly metadata: ResearchLedgerEventMetadata;
  readonly body: string;
}): string {
  return [
    '---',
    dumpYaml(frontmatterForMetadata(input.metadata), {
      lineWidth: 100,
      noRefs: true,
      sortKeys: false,
    }).trimEnd(),
    '---',
    '',
    input.body.trimEnd(),
    '',
  ].join('\n');
}

export function stablePathSlug(value: string, label: string): string {
  if (value.includes('/') || value.includes('\\')) {
    throw new ResearchLedgerWriteError(`Unsafe ${label} path slug source: "${value}"`);
  }
  const slug = value
    .trim()
    .replaceAll(/[^A-Za-z0-9._-]+/g, '-')
    .replaceAll(/^[._-]+|[._-]+$/g, '');
  if (slug.length === 0) {
    throw new ResearchLedgerWriteError(`Cannot derive ${label} path slug from "${value}"`);
  }
  if (slug === '.' || slug === '..' || slug.includes('..')) {
    throw new ResearchLedgerWriteError(`Unsafe ${label} path slug: "${slug}"`);
  }
  return slug;
}

function frontmatterForMetadata(metadata: ResearchLedgerEventMetadata): Record<string, unknown> {
  return {
    id: metadata.id,
    type: metadata.type,
    topic: metadata.topic,
    domain: metadata.domain,
    status: metadata.status,
    source_refs: [...metadata.sourceRefs],
    depends_on: [...metadata.dependsOn],
    ...(metadata.candidateCapsuleKind === undefined
      ? {}
      : { candidate_capsule_kind: metadata.candidateCapsuleKind }),
    open_questions: [...metadata.openQuestions],
    related_objects: [...metadata.relatedObjects],
    ...(metadata.createdAt === undefined ? {} : { created_at: metadata.createdAt }),
  };
}

function validateRequiredMetadata(metadata: ResearchLedgerWriteInput['metadata']): void {
  const required = [
    ['id', metadata.id],
    ['type', metadata.type],
    ['topic', metadata.topic],
    ['domain', metadata.domain],
    ['status', metadata.status],
  ] as const;
  for (const [field, value] of required) {
    if (typeof value !== 'string' || value.trim().length === 0) {
      throw new ResearchLedgerWriteError(`Research ledger event requires ${field}.`);
    }
  }
  if (metadata.sourceRefs.length === 0) {
    throw new ResearchLedgerWriteError(
      'Research ledger event requires at least one source ref.',
    );
  }
}

function assertWithinRoot(rootPath: string, targetPath: string): void {
  const rel = relative(rootPath, targetPath);
  if (rel.startsWith('..') || rel === '') {
    throw new ResearchLedgerWriteError(
      `Research ledger event path escapes root: ${targetPath}`,
    );
  }
}

async function defaultPathExists(path: string): Promise<boolean> {
  try {
    await fs.stat(path);
    return true;
  } catch {
    return false;
  }
}
