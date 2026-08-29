import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { nextTick, ref } from 'vue';
import {
  createComposerCommandSubmission,
  restoreComposerCommandSubmission,
  useComposerDraft,
} from '../src/composables/useComposerDraft';
import { draftStorageKey, pendingDraftStorageKey } from '../src/lib/storage';

function memoryStorage(): Storage {
  const map = new Map<string, string>();
  return {
    get length() {
      return map.size;
    },
    clear: () => {
      map.clear();
    },
    getItem: (key: string) => map.get(key) ?? null,
    key: (index: number) => Array.from(map.keys())[index] ?? null,
    removeItem: (key: string) => {
      map.delete(key);
    },
    setItem: (key: string, value: string) => {
      map.set(key, value);
    },
  };
}

function setup(initialSid: string | undefined) {
  const sid = ref(initialSid);
  const draft = useComposerDraft({ sessionId: () => sid.value });
  return {
    draft,
    text: draft.text,
    setSid: (next: string | undefined) => {
      sid.value = next;
    },
  };
}

describe('useComposerDraft', () => {
  let original: Storage | undefined;

  beforeEach(() => {
    original = (globalThis as { localStorage?: Storage }).localStorage;
    Object.defineProperty(globalThis, 'localStorage', {
      value: memoryStorage(),
      configurable: true,
      writable: true,
    });
  });

  afterEach(() => {
    if (original === undefined) {
      delete (globalThis as { localStorage?: Storage }).localStorage;
    } else {
      Object.defineProperty(globalThis, 'localStorage', {
        value: original,
        configurable: true,
        writable: true,
      });
    }
  });

  it('loads the stored draft for the session on init', () => {
    globalThis.localStorage.setItem(draftStorageKey('s1'), 'saved draft');
    const { text } = setup('s1');
    expect(text.value).toBe('saved draft');
  });

  it('starts empty when the session has no stored draft', () => {
    const { text } = setup('s1');
    expect(text.value).toBe('');
  });

  it('persists the draft when the text changes', async () => {
    const { text } = setup('s1');
    text.value = 'hello';
    await nextTick();
    expect(globalThis.localStorage.getItem(draftStorageKey('s1'))).toBe('hello');
  });

  it('clears the stored draft when the text is emptied', async () => {
    globalThis.localStorage.setItem(draftStorageKey('s1'), 'x');
    const { text } = setup('s1');
    text.value = '';
    await nextTick();
    expect(globalThis.localStorage.getItem(draftStorageKey('s1'))).toBeNull();
  });

  it('saves the old draft and loads the new one on session switch', async () => {
    const { text, setSid } = setup('s1');
    text.value = 'draft-s1';
    await nextTick();
    globalThis.localStorage.setItem(draftStorageKey('s2'), 'draft-s2');

    setSid('s2');
    await nextTick();

    expect(globalThis.localStorage.getItem(draftStorageKey('s1'))).toBe('draft-s1');
    expect(text.value).toBe('draft-s2');
  });

  it('loadForEdit replaces the text', () => {
    const { draft } = setup('s1');
    draft.loadForEdit('edit me');
    expect(draft.text.value).toBe('edit me');
  });

  it('autosize fits the textarea height to its content', () => {
    const { draft } = setup('s1');
    const style: Record<string, string> = {};
    const el = { scrollHeight: 120, style };
    draft.textareaRef.value = el as unknown as HTMLTextAreaElement;

    draft.autosize();
    expect(style.height).toBe('120px');
  });

  it('autosize shrinks the textarea when content is removed', () => {
    const { draft } = setup('s1');
    const style: Record<string, string> = {};
    const el = { scrollHeight: 120, style };
    draft.textareaRef.value = el as unknown as HTMLTextAreaElement;

    draft.autosize();
    el.scrollHeight = 40;
    draft.autosize();
    expect(style.height).toBe('40px');
  });

  it('autosize is a no-op before the textarea mounts', () => {
    const { draft } = setup('s1');
    expect(() => {
      draft.autosize();
    }).not.toThrow();
  });

  it('clearDraft removes the persisted draft synchronously', async () => {
    // Regression: when the first message of an empty session is submitted, the
    // optimistic user turn unmounts the composer before the post-flush text
    // watcher can clear the draft. clearDraft must therefore clear it
    // synchronously so a remount does not reload the stale text.
    globalThis.localStorage.setItem(draftStorageKey('s1'), 'stale draft');
    const { draft } = setup('s1');
    draft.clearDraft();
    // No nextTick — the write is synchronous.
    expect(globalThis.localStorage.getItem(draftStorageKey('s1'))).toBeNull();

    // Simulate the remount after the optimistic turn: a fresh composable
    // instance for the same session should start empty, not restore the draft.
    const { text } = setup('s1');
    expect(text.value).toBe('');
    await nextTick();
    expect(globalThis.localStorage.getItem(draftStorageKey('s1'))).toBeNull();
  });

  it('does not overwrite text entered while a rejected command is pending', () => {
    const { draft, text } = setup('s1');
    text.value = '/research pause';
    text.value = '';
    draft.finalizeSubmissionDraft();
    const submission = draft.captureCommandSubmission('/research pause');

    text.value = 'new draft';
    let applied = false;
    expect(
      restoreComposerCommandSubmission(submission, 's1', () => {
        applied = true;
        return true;
      }),
    ).toBe('pending');

    expect(applied).toBe(false);
    expect(text.value).toBe('new draft');
    expect(globalThis.localStorage.getItem(draftStorageKey('s1'))).toBe('new draft');
    expect(JSON.parse(globalThis.localStorage.getItem(pendingDraftStorageKey('s1'))!)).toEqual([
      '/research pause',
    ]);

    // Once the newer draft is submitted, the rejected command becomes the next
    // draft instead of remaining stranded behind the now-empty text.
    text.value = '';
    draft.finalizeSubmissionDraft();
    expect(text.value).toBe('/research pause');
  });

  it('restores a rejected command when the hidden Composer remounts', () => {
    const submission = createComposerCommandSubmission('/research status', 's1');

    expect(
      restoreComposerCommandSubmission(submission, 's1', () => false),
    ).toBe('pending');
    expect(globalThis.localStorage.getItem(draftStorageKey('s1'))).toBeNull();

    const { text } = setup('s1');
    expect(text.value).toBe('/research status');
    expect(globalThis.localStorage.getItem(pendingDraftStorageKey('s1'))).toBeNull();
  });

  it('queues a rejected command for its submitted session after a session switch', () => {
    const submission = createComposerCommandSubmission('/research resume', 's1');
    let applied = false;

    expect(
      restoreComposerCommandSubmission(submission, 's2', () => {
        applied = true;
        return true;
      }),
    ).toBe('pending');

    expect(applied).toBe(false);
    expect(globalThis.localStorage.getItem(draftStorageKey('s2'))).toBeNull();
    expect(globalThis.localStorage.getItem(pendingDraftStorageKey('s2'))).toBeNull();

    const { text } = setup('s1');
    expect(text.value).toBe('/research resume');
  });
});
