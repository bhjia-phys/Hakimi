# Hakimi Brand CLI Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rebrand the user-facing CLI as Hakimi with a `hakimi` executable, a `kimi` compatibility alias, and a pixel cat-ear spacecraft welcome panel.

**Architecture:** Keep the rename at the product/app boundary. Update app constants, package metadata, CLI help text, TUI welcome rendering, and docs while preserving SDK/OAuth package imports and `.kimi-code` runtime data compatibility.

**Tech Stack:** TypeScript, Commander, pi-tui, chalk, pnpm workspace, Vitest.

---

### Task 1: App Package And CLI Identity

**Files:**
- Modify: `apps/kimi-code/package.json`
- Modify: `apps/kimi-code/src/constant/app.ts`
- Modify: `apps/kimi-code/src/cli/commands.ts`
- Test: `apps/kimi-code/test/cli/version.test.ts`
- Test: `apps/kimi-code/test/cli/main.test.ts`

- [ ] Update `apps/kimi-code/package.json` so the package name is Hakimi-facing and `bin` exposes both `hakimi` and `kimi`.
- [ ] Update `PRODUCT_NAME` to `Hakimi`, `CLI_COMMAND_NAME` to `hakimi`, and `NPM_PACKAGE_NAME` to the Hakimi package name.
- [ ] Update CLI description/help footer to reference Hakimi.
- [ ] Update CLI tests that intentionally assert user-facing product/package strings.

### Task 2: Pixel Welcome Banner

**Files:**
- Modify: `apps/kimi-code/src/tui/components/chrome/welcome.ts`
- Modify: `apps/kimi-code/src/tui/easter-eggs/dance.ts`
- Test: `apps/kimi-code/test/tui/components/chrome/welcome.test.ts`

- [ ] Replace the old two-line logo with a compact pixel-logo renderer.
- [ ] Render a colored cat-ear spacecraft logo using fixed palette cells.
- [ ] Render approved copy: `Hakimi`, `truth-seeking physics research agent`, and the physics knowledge destination line.
- [ ] Keep the welcome panel responsive by switching to a text-only fallback for narrow widths.
- [ ] Update rainbow dance rendering to use Hakimi text instead of Kimi Code.
- [ ] Add tests that assert the Hakimi text and pixel logo colors render.

### Task 3: README And Install Verification

**Files:**
- Modify: `README.md`

- [ ] Update package build/install commands for the Hakimi tarball.
- [ ] Document `hakimi` as the primary command and `kimi` as compatibility.
- [ ] Run focused tests, typecheck, build, pack, and isolated install verification.
