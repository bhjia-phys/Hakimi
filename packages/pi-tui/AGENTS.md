# pi-tui Agent Guide

`packages/pi-tui` is a vendored pi-tui fork. This checkout is based on kimi-code 0.35.0 (`@moonshot-ai/pi-tui` 0.84.1); local fixes are applied directly to the source rather than through pnpm patches. The 0.35.0 upstream baseline already includes several former Hakimi fixes, so distinguish upstream-carried invariants from the remaining local divergences when syncing again.

## Upstream-carried invariants

These behaviors are no longer local diffs against kimi-code 0.35.0, but their guarding tests must remain green after a future sync:

1. **`src/components/editor.ts` — `wordWrapLine` single-grapheme recursion guard**: when a segment cannot be split further and is wider than `maxWidth`, do not recurse. The guard is based on grapheme count so it handles ZWJ emoji correctly. Guarding tests: "wordWrapLine narrow width" and "Editor narrow width rendering" in `test/editor.test.ts`.
2. **`src/tui.ts` — `Container.render` width clamp**: clamp the entry-point width to at least 1. Guarding test: "Container width clamping" in `test/tui-render.test.ts`.
3. **`src/tui-main-screen.ts` — overwide-line truncation**: `doRender` truncates overwide lines through the `asciiVisibleWidth` fast path and falls back to `visibleWidth` for non-ASCII text. Guarding tests: "TUI overwide line handling" in `test/tui-render.test.ts` and "asciiVisibleWidth" in `test/truncate-to-width.test.ts`.
4. **Component negative-width guards**: Text, Markdown, TruncatedText, and Editor clamp `repeat` counts to zero or greater. Guarding tests are the corresponding "negative width safety" and narrow-width cases.
5. **`src/tui-main-screen.ts` — per-frame processed-line reuse**: reference-identical raw lines reuse their processed output and cached Kitty image ids when terminal width is unchanged. Guarding test: "TUI steady-frame processed-line reuse" in `test/tui-render.test.ts`.

## Local divergences from kimi-code 0.35.0

Never overwrite this directory wholesale when syncing from upstream. Re-verify both remaining local fixes and their tests:

1. **`src/tui-main-screen.ts` — stable-height updates above the viewport stay non-destructive**: when an equal-length frame changes only non-image rows above the tracked viewport (for example thinking/subagent spinner ticks), commit those retained-frame changes without clearing the terminal; if the same frame also changes visible rows, clamp the differential repaint to the visible changes. Native scrollback intentionally keeps its prior offscreen bytes until a later full render because repainting them risks duplicate/lost history. Line-count changes and Kitty image crossings retain the upstream full-redraw fallback — do not restore the reverted viewport-anchor/repaint system. Guarding tests: "skips destructive redraws for stable-height updates above the viewport", "repaints visible changes without clearing when the same frame also changes above the viewport", "keeps the full-redraw fallback for above-viewport image changes", and "keeps the full-redraw fallback for above-viewport line-count changes" in `test/tui-render.test.ts`.
2. **`src/tui-main-screen.ts` — destructive clears precede DEC 2026 synchronized output**: `fullRender(true)` emits Kitty cleanup plus `ED2`/`ED3` before `CSI ? 2026 h`; only the replacement frame is enclosed by synchronized-output markers. xterm.js applies erase-command viewport side effects immediately even inside DEC 2026, causing repeated viewport yanks in VS Code during streaming. Guarding test: "emits destructive clears before synchronized full-render output" in `test/tui-render.test.ts`.

## Acceptance after syncing from upstream

- `pnpm --filter @moonshot-ai/pi-tui test` must pass in full; any failure among the guarding tests above means a local divergence was overwritten and lost.

## Testing

- This package's tests run with `node --test` (`pnpm --filter @moonshot-ai/pi-tui test`), not vitest; the root `vitest run` does not execute them — CI covers them through the dedicated `test-pi-tui` job in `.github/workflows/ci.yml`.
- Prefer adding new narrow-width tests to the existing test file of the corresponding component.
