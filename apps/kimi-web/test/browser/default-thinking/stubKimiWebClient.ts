// Settings' unrelated archive actions stay isolated from the user's daemon.
export function useKimiWebClient() {
  return {
    loadArchivedSessions: async () => ({ items: [], hasMore: false }),
    restoreSession: async () => false,
  };
}
