/**
 * `kosong/provider` extractUsage tests — the shared OpenAI-family usage
 * mapper: generic OpenAI cached-token fields, the DeepSeek
 * `prompt_cache_hit_tokens` / `prompt_cache_miss_tokens` split, and the
 * non-negative-integer / consistency validation that keeps an empty or
 * malformed payload from being read as a zero usage.
 */

import { describe, expect, it } from 'vitest';

import { extractUsage } from '#/kosong/provider/bases/openai/openai-common';

describe('extractUsage', () => {
  it('maps the generic OpenAI cached-token shape', () => {
    expect(
      extractUsage({
        prompt_tokens: 100,
        completion_tokens: 50,
        prompt_tokens_details: { cached_tokens: 30 },
      }),
    ).toEqual({ inputOther: 70, output: 50, inputCacheRead: 30, inputCacheCreation: 0 });
  });

  it('maps a top-level cached_tokens field', () => {
    expect(
      extractUsage({ prompt_tokens: 100, completion_tokens: 40, cached_tokens: 25 }),
    ).toEqual({ inputOther: 75, output: 40, inputCacheRead: 25, inputCacheCreation: 0 });
  });

  it('maps the DeepSeek cache hit/miss split', () => {
    expect(
      extractUsage({
        prompt_tokens: 100,
        completion_tokens: 50,
        prompt_cache_hit_tokens: 30,
        prompt_cache_miss_tokens: 70,
      }),
    ).toEqual({ inputOther: 70, output: 50, inputCacheRead: 30, inputCacheCreation: 0 });
  });

  it('returns null for an empty usage object instead of a zero usage', () => {
    expect(extractUsage({})).toBeNull();
  });

  it('returns null for null and non-object usage', () => {
    expect(extractUsage(null)).toBeNull();
    expect(extractUsage(undefined)).toBeNull();
    expect(extractUsage('nope')).toBeNull();
  });

  it('rejects a negative token count', () => {
    expect(extractUsage({ prompt_tokens: -1, completion_tokens: 5 })).toBeNull();
  });

  it('rejects a non-integer token count', () => {
    expect(extractUsage({ prompt_tokens: 1.5, completion_tokens: 5 })).toBeNull();
  });

  it('rejects an inconsistent DeepSeek cache split', () => {
    expect(
      extractUsage({
        prompt_tokens: 100,
        completion_tokens: 50,
        prompt_cache_hit_tokens: 30,
        prompt_cache_miss_tokens: 60,
      }),
    ).toBeNull();
  });

  it('rejects a half-specified DeepSeek cache split', () => {
    expect(
      extractUsage({
        prompt_tokens: 100,
        completion_tokens: 50,
        prompt_cache_hit_tokens: 30,
      }),
    ).toBeNull();
  });

  it('rejects invalid DeepSeek cache fields instead of falling through to the generic branch', () => {
    expect(
      extractUsage({
        prompt_tokens: 100,
        completion_tokens: 5,
        prompt_cache_hit_tokens: -1,
        prompt_cache_miss_tokens: -1,
      }),
    ).toBeNull();
  });

  it('rejects a DeepSeek split missing completion_tokens instead of treating it as zero', () => {
    expect(
      extractUsage({
        prompt_tokens: 100,
        prompt_cache_hit_tokens: 30,
        prompt_cache_miss_tokens: 70,
      }),
    ).toBeNull();
  });

  it('accepts a real all-zero usage', () => {
    expect(
      extractUsage({
        prompt_tokens: 0,
        completion_tokens: 0,
        prompt_cache_hit_tokens: 0,
        prompt_cache_miss_tokens: 0,
      }),
    ).toEqual({ inputOther: 0, output: 0, inputCacheRead: 0, inputCacheCreation: 0 });
  });

  it('rejects a count outside the safe-integer range', () => {
    expect(extractUsage({ prompt_tokens: 2 ** 53, completion_tokens: 0 })).toBeNull();
  });

  it('rejects a missing completion_tokens for the generic OpenAI shape', () => {
    expect(extractUsage({ prompt_tokens: 100 })).toBeNull();
  });
});
