import type { AppSession, ResearchCommand, ResearchStatusSnapshot } from '../api/types';

/** A navigation projection, never a second Research store. Unknown means the
 * browser has not observed a snapshot; GET /research would cold-resume an agent,
 * so listing sessions must not issue those requests in the background. */
export interface ResearchSessionLink {
  id: string;
  title: string;
  workspace: string;
  line?: string;
  mode?: ResearchStatusSnapshot['mode'];
  busy: boolean;
}

export function researchSessionLinks(
  sessions: readonly AppSession[],
  snapshots: Readonly<Record<string, ResearchStatusSnapshot>>,
): ResearchSessionLink[] {
  return sessions.filter((session) => !session.archived && !session.parentSessionId)
    .toSorted((a, b) => b.updatedAt.localeCompare(a.updatedAt))
    .map((session) => {
      const snapshot = snapshots[session.id];
      return {
        id: session.id,
        title: session.title,
        workspace: session.cwd,
        line: snapshot?.lines.find((line) => line.slug === snapshot.currentLineSlug)?.title,
        mode: snapshot?.mode,
        busy: session.busy,
      };
    });
}

export function researchPolicyCommand(
  snapshot: ResearchStatusSnapshot | null | undefined,
  policy: string,
  busy: boolean,
): ResearchCommand | null {
  if (!snapshot || snapshot.mode !== 'ready' || busy
    || (policy !== 'collaborative' && policy !== 'dreaming')
    || policy === snapshot.planningPolicy) return null;
  return { kind: 'set_planning_policy', policy, expectedRevision: snapshot.revision };
}
