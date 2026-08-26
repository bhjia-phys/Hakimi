/**
 * `aitpResearch` tests — official AITP golden fixture conformance.
 *
 * Exercises the Hakimi transport parsers against the committed AITP 0.8.0
 * golden payloads without invoking a live CLI or depending on an external
 * checkout.
 */

import { createHash } from 'node:crypto';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import {
  parseCheckReport,
  parseEnterResult,
  parseListResult,
  parseShowResult,
} from '#/features/aitpResearch/types';

import { AITP_GOLDEN_FIXTURE_METADATA } from './fixtures/aitp-0.8.0/metadata';

const FIXTURE_DIR = join(import.meta.dirname, 'fixtures/aitp-0.8.0');
const FIXTURE_NAMES = [
  'enter.json',
  'enter-after-save.json',
  'list.json',
  'show.json',
  'check.json',
  'check-workstream.json',
] as const;

function loadFixture(name: string): unknown {
  return JSON.parse(readFileSync(join(FIXTURE_DIR, name), 'utf8')) as unknown;
}

function sha256(name: string): string {
  return createHash('sha256')
    .update(readFileSync(join(FIXTURE_DIR, name)))
    .digest('hex');
}

describe('official AITP 0.8.0 golden fixture conformance', () => {
  it('keeps fixture provenance and the complete local snapshot', () => {
    expect(AITP_GOLDEN_FIXTURE_METADATA).toMatchObject({
      sourceRepository: 'AITP-Research-Protocol',
      sourcePath: 'tests/ledger/fixtures/golden',
      aitpCommit: 'eae1bce5eba367a5f6db6ba73ff0912dd3a5e290',
      pluginVersion: '0.8.0',
    });
    expect(AITP_GOLDEN_FIXTURE_METADATA.files.map(({ name }) => name)).toEqual(FIXTURE_NAMES);
    expect(readdirSync(FIXTURE_DIR).filter((name) => name.endsWith('.json')).sort()).toEqual(
      [...FIXTURE_NAMES].sort(),
    );

    for (const file of AITP_GOLDEN_FIXTURE_METADATA.files) {
      expect(sha256(file.name)).toBe(file.sha256);
    }
  });

  it('parses enter and enter-after-save, including the newer-active signal', () => {
    const enter = parseEnterResult(loadFixture('enter.json'));
    expect(enter).toMatchObject({
      schema: 'aitp/enter-0.2',
      memory_status: 'available',
      root: '<golden-store>',
      topic: { id: 'nio', title: 'Magnetic NiO' },
      counts: {
        active: 6,
        superseded: 1,
        unresolved_failures: 1,
        malformed: 0,
        omitted_active: 0,
        active_newer_than_latest_working_note: 0,
      },
      warnings: [],
    });

    const afterSave = parseEnterResult(loadFixture('enter-after-save.json'));
    expect(afterSave).toMatchObject({
      schema: 'aitp/enter-0.2',
      root: '<golden-store>',
      topic: { id: 'nio' },
      counts: {
        active: 7,
        superseded: 1,
        unresolved_failures: 1,
        malformed: 0,
        omitted_active: 0,
        active_newer_than_latest_working_note: 1,
      },
      warnings: [],
    });
    expect(afterSave.recent_entries[0]?.id).toBe('entry-88888888888888888888888888888888');
  });

  it('parses the list and preserves active versus superseded counts', () => {
    const list = parseListResult(loadFixture('list.json'));

    expect(list).toMatchObject({
      schema: 'aitp/list-0.1',
      root: '<golden-store>',
      count: 7,
      warnings: [],
    });
    expect(list.entries).toHaveLength(7);
    expect(list.entries.filter((entry) => entry.status === 'active')).toHaveLength(6);
    expect(list.entries.filter((entry) => entry.status === 'superseded')).toHaveLength(1);
  });

  it('parses the superseded show payload and its frontmatter', () => {
    const show = parseShowResult(loadFixture('show.json'));

    expect(show).toMatchObject({
      schema: 'aitp/show-0.1',
      root: '<golden-store>',
      id: 'entry-44444444444444444444444444444444',
      status: 'superseded',
      legacy_derived: false,
    });
    if (show.status !== 'superseded') throw new Error('Expected the official show fixture to be superseded');
    expect(show.frontmatter).toMatchObject({
      schema: 'aitp/lite-entry-0.1',
      id: 'entry-44444444444444444444444444444444',
      topic: 'nio',
      kind: 'result',
    });
    expect(show.body).toContain('old cutoff');
  });

  it('parses warning-only and scoped check reports with their counts', () => {
    const warningOnly = parseCheckReport(loadFixture('check.json'));
    expect(warningOnly).toMatchObject({
      schema: 'aitp/check-report-0.1',
      status: 'findings',
      root: '<golden-store>',
      counts: { entries: 7, notes: 2, errors: 0, warnings: 1 },
    });
    expect(warningOnly.findings).toEqual([
      expect.objectContaining({
        level: 'warning',
        code: 'empty_topic_goal',
      }),
    ]);

    const scoped = parseCheckReport(loadFixture('check-workstream.json'));
    if (scoped.schema !== 'aitp/check-report-0.2') {
      throw new Error('Expected the official scoped check fixture to use check-report-0.2');
    }
    expect(scoped).toMatchObject({
      schema: 'aitp/check-report-0.2',
      status: 'findings',
      root: '<golden-store>',
      workstream: 'crpa',
      counts: {
        entries: 2,
        notes: 0,
        errors: 1,
        warnings: 1,
        by_code: {
          hash_mismatch: { errors: 1, warnings: 0 },
          invalid_timestamp: { errors: 0, warnings: 1 },
        },
        outside_scope: { errors: 3, warnings: 1 },
      },
    });
    expect(scoped.findings.map((finding) => `${finding.level}:${finding.code}`)).toEqual([
      'error:hash_mismatch',
      'warning:invalid_timestamp',
    ]);
  });
});
