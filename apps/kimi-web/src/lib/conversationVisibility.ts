export function shouldShowEmptyConversation(
  turnCount: number,
  sessionLoading: boolean,
): boolean {
  return turnCount === 0 && !sessionLoading;
}

export function shouldShowChatDock(
  turnCount: number,
  sessionLoading: boolean,
): boolean {
  return turnCount > 0 || sessionLoading;
}
