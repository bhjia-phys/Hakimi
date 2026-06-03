# Hakimi Brand And CLI Design

## Goal

Turn the current AITP Agent fork into a user-facing product named Hakimi while keeping Kimi Code compatibility where it protects existing configuration, upstream sync, and package imports.

## Approved Brand Direction

Hakimi is a playful but serious physics research agent: a cat-ear exploration spacecraft seeking truth through physics, code, memory, and evidence. The CLI welcome screen should use a polished pixel-spacecraft logo rather than hand-written ASCII art.

Approved text:

```text
Hakimi
truth-seeking physics research agent

Welcome, researcher.
Curiosity is the engine.
Truth is the destination.

Ready to explore the frontiers of physics knowledge.
```

## Scope

- Product name shown to users becomes `Hakimi`.
- The primary executable becomes `hakimi`.
- The existing `kimi` executable remains as a compatibility alias.
- The TUI welcome panel uses a compact colored pixel logo: a 45-degree cat-ear exploration spacecraft.
- README install instructions use the Hakimi package output and `hakimi` command.

## Compatibility Boundaries

The first implementation will not rename SDK/OAuth package imports, managed OAuth provider ids, or the `.kimi-code` runtime data directory. Those names are still part of upstream Kimi Code compatibility and several tests, docs, and migration flows depend on them.

The npm package may be renamed at the app package layer so `pnpm pack` produces a Hakimi tarball, but internal workspace packages remain `@moonshot-ai/kimi-code-sdk` and `@moonshot-ai/kimi-code-oauth` for now.

## Success Criteria

- `pnpm pack` for `apps/kimi-code` produces a Hakimi-named tarball.
- Installing the tarball exposes `hakimi` and `kimi`.
- `hakimi --version` and `kimi --version` both work.
- `hakimi --help` shows Hakimi product text.
- The TUI welcome component renders `Hakimi`, `truth-seeking physics research agent`, and the approved physics wording.
- Existing focused CLI/TUI tests pass or are updated for the intentional brand change.
