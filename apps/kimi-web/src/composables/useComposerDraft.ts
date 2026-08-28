// apps/kimi-web/src/composables/useComposerDraft.ts
import { nextTick, ref, watch } from 'vue';
import {
  draftStorageKey,
  pendingDraftStorageKey,
  safeGetJson,
  safeGetString,
  safeRemove,
  safeSetJson,
  safeSetString,
} from '../lib/storage';

export interface ComposerDraftDeps {
  /** Active session id — scopes the persisted draft (getter for reactivity). */
  sessionId: () => string | undefined;
}

export interface ComposerCommandSubmission {
  input: string;
  sessionId?: string;
  draftGeneration: number;
}

export type ComposerCommandEvent = string | ComposerCommandSubmission;
export type ComposerCommandRestoreResult = 'restored' | 'pending';

const draftGenerationBySession = new Map<string, number>();

function draftScope(sid: string | undefined): string {
  return sid && sid.length > 0 ? sid : '__new__';
}

function currentDraftGeneration(sid: string | undefined): number {
  return draftGenerationBySession.get(draftScope(sid)) ?? 0;
}

function bumpDraftGeneration(sid: string | undefined): void {
  const key = draftScope(sid);
  draftGenerationBySession.set(key, (draftGenerationBySession.get(key) ?? 0) + 1);
}

function readDraft(sid: string | undefined): string {
  return safeGetString(draftStorageKey(sid)) ?? '';
}

function writeDraft(sid: string | undefined, value: string): void {
  const key = draftStorageKey(sid);
  if (value) safeSetString(key, value);
  else safeRemove(key);
}

function readPendingDrafts(sid: string | undefined): string[] {
  const value = safeGetJson<unknown>(pendingDraftStorageKey(sid));
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : [];
}

function writePendingDrafts(sid: string | undefined, drafts: string[]): void {
  const key = pendingDraftStorageKey(sid);
  if (drafts.length > 0) safeSetJson(key, drafts);
  else safeRemove(key);
}

function enqueuePendingDraft(sid: string | undefined, input: string): void {
  const pending = readPendingDrafts(sid);
  if (!pending.includes(input)) writePendingDrafts(sid, [...pending, input]);
}

function loadDraft(sid: string | undefined): string {
  const saved = readDraft(sid);
  if (saved !== '') return saved;
  const pending = readPendingDrafts(sid);
  const restored = pending[0];
  if (restored === undefined) return '';
  writePendingDrafts(sid, pending.slice(1));
  writeDraft(sid, restored);
  return restored;
}

export function createComposerCommandSubmission(
  input: string,
  sessionId: string | undefined,
): ComposerCommandSubmission {
  return {
    input,
    sessionId,
    draftGeneration: currentDraftGeneration(sessionId),
  };
}

export function restoreComposerCommandSubmission(
  submission: ComposerCommandSubmission,
  activeSessionId: string | undefined,
  applyNow: (input: string) => boolean,
): ComposerCommandRestoreResult {
  const unchanged = currentDraftGeneration(submission.sessionId) === submission.draftGeneration;
  const empty = readDraft(submission.sessionId) === '';
  if (activeSessionId === submission.sessionId && unchanged && empty && applyNow(submission.input)) {
    return 'restored';
  }
  enqueuePendingDraft(submission.sessionId, submission.input);
  return 'pending';
}

/**
 * The composer's text state plus its per-session unsent-draft persistence.
 *
 * The draft is kept in localStorage keyed by session, so switching away and back
 * (or a page refresh) restores whatever the user was typing for that session; it
 * is cleared when the draft is sent/steered. This composable owns the `text`
 * and `textarea` refs, the `autosize` helper, the draft load/save watchers, and
 * the imperative `loadForEdit` handle exposed to the parent.
 */
export function useComposerDraft(deps: ComposerDraftDeps) {
  const { sessionId } = deps;

  const text = ref(loadDraft(sessionId()));
  const textareaRef = ref<HTMLTextAreaElement | null>(null);

  function autosize(): void {
    const el = textareaRef.value;
    if (!el) return;
    // Reset to measure the natural content height, then fit the box to it.
    // The resting height and the upper cap live in CSS (`min-height` /
    // `max-height`); once the content outgrows the cap, `overflow-y: auto`
    // scrolls internally. This keeps a single source of truth for the bounds.
    el.style.height = 'auto';
    el.style.height = `${el.scrollHeight}px`;
  }

  watch(text, (value) => {
    const sid = sessionId();
    bumpDraftGeneration(sid);
    // Persist synchronously so an async command rejection can compare both the
    // generation and stored value without racing Vue's normal post-flush watch.
    writeDraft(sid, value);
    void nextTick(autosize);
  }, { flush: 'sync' });

  // Switching sessions: stash the draft under the OLD session, then load the new
  // session's draft (or its oldest pending command) into the box.
  watch(sessionId, (newSid, oldSid) => {
    if (newSid === oldSid) return;
    writeDraft(oldSid, text.value);
    text.value = loadDraft(newSid);
    void nextTick(autosize);
  });

  /** Imperatively load text into the box for editing (used by "edit & resend the
      last message" after an undo, or by the dock queue panel when the user edits
      a queued prompt). Focuses with the caret at the end. */
  function loadForEdit(value: string): void {
    text.value = value;
    void nextTick(() => {
      const el = textareaRef.value;
      if (!el) return;
      el.focus();
      const pos = value.length;
      el.setSelectionRange(pos, pos);
      autosize();
    });
  }

  /** Explicitly discard the persisted draft for callers that own that intent. */
  function clearDraft(): void {
    writeDraft(sessionId(), '');
  }

  /**
   * Synchronize the post-submit draft before the Composer can unmount. Normally
   * this keeps the just-cleared value; if an older rejected command is pending,
   * it becomes the next non-destructive draft instead.
   */
  function finalizeSubmissionDraft(): void {
    const sid = sessionId();
    if (text.value === '') {
      const restored = loadDraft(sid);
      if (restored !== '') {
        text.value = restored;
        return;
      }
    }
    writeDraft(sid, text.value);
  }

  function captureCommandSubmission(input: string): ComposerCommandSubmission {
    return createComposerCommandSubmission(input, sessionId());
  }

  return {
    text,
    textareaRef,
    autosize,
    loadForEdit,
    clearDraft,
    finalizeSubmissionDraft,
    captureCommandSubmission,
  };
}
