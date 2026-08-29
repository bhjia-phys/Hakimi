/**
 * `aitpResearch` domain — Research phase transition authority (compatibility
 * re-export).
 *
 * The canonical implementation lives in the protocol-independent
 * `features/research/transitions/researchTransitionAuthority`; this module
 * keeps the old import path working by re-exporting it unchanged.
 */

export * from '#/features/research/transitions/researchTransitionAuthority';
