import { describe, expect, it } from 'vitest';
import {
  shouldShowChatDock,
  shouldShowEmptyConversation,
} from '../src/lib/conversationVisibility';

describe('conversation visibility', () => {
  it('keeps the central Composer for an empty transcript, including active Research', () => {
    expect(shouldShowChatDock(0, false)).toBe(false);
    expect(shouldShowEmptyConversation(0, false)).toBe(true);
  });

  it('shows the dock instead of the empty layout while loading or after turns arrive', () => {
    expect(shouldShowChatDock(0, true)).toBe(true);
    expect(shouldShowEmptyConversation(0, true)).toBe(false);
    expect(shouldShowChatDock(1, false)).toBe(true);
    expect(shouldShowEmptyConversation(1, false)).toBe(false);
  });
});
