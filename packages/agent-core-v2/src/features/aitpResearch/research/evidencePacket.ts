/**
 * `aitpResearch` domain — typed evidence packets exchanged with subagents
 * (compatibility re-export).
 *
 * The canonical implementation lives in the protocol-independent
 * `features/research/evidencePacket`; this module keeps the old import path
 * working by re-exporting it unchanged.
 */

export * from '#/features/research/evidencePacket';
