/**
 * `research` domain — typed evidence packets exchanged with subagents.
 *
 * A packet is an observation from a bounded child task, not a Research state
 * mutation or a scientific conclusion. The main agent reviews packets against
 * the current Research revision and decides whether to record progress or
 * change an assessment. Strict parsing keeps child output outside the Research
 * state machine until that review happens. Protocol-independent: the AITP
 * feature re-exports these symbols, and nothing here knows about AITP.
 * Scope-agnostic.
 */

import { z } from 'zod';

export const ResearchEvidencePacketSchema = z.object({
  packet_id: z.string().min(1).max(200),
  kind: z.enum(['observation', 'result', 'failure', 'derivation', 'literature']),
  claim: z.string().min(1).max(8000),
  evidence: z.string().min(1).max(12000),
  question_id: z.string().min(1).max(200).optional(),
  line_slug: z.string().min(1).max(63).optional(),
  action_id: z.string().min(1).max(200).optional(),
  method: z.string().max(4000).optional(),
  assumptions: z.array(z.string().max(1000)).max(50).default([]),
  tests: z.array(z.string().max(1000)).max(50).default([]),
  artifact_refs: z.array(z.string().max(500)).max(50).default([]),
  source_refs: z.array(z.string().max(500)).max(50).default([]),
  limitations: z.array(z.string().max(1000)).max(50).default([]),
  confidence: z.enum(['low', 'medium', 'high']).default('medium'),
}).strict();

export type ResearchEvidencePacket = z.infer<typeof ResearchEvidencePacketSchema>;

export interface ResearchEvidenceReview {
  readonly packet: ResearchEvidencePacket;
  readonly researchRevision: number;
  readonly questionId?: string;
  readonly lineSlug?: string;
}

export function parseResearchEvidencePacket(raw: unknown): ResearchEvidencePacket {
  return ResearchEvidencePacketSchema.parse(raw);
}
