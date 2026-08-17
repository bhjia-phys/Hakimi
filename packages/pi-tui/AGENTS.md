# pi-tui Agent Guide

`packages/pi-tui` is a vendored pi-tui fork. This checkout is based on kimi-code 0.35.0 (`@moonshot-ai/pi-tui` 0.84.1); local fixes are applied directly to the source rather than through pnpm patches. The 0.35.0 upstream baseline already includes several former Hakimi fixes, so distinguish upstream-carried invariants from the remaining local divergences when syncing again.

## Upstream-carried invariants

These behaviors are no longer local diffs against kimi-code 0.35.0, but their guarding tests must remain green after a future sync:

1. **`src/components/editor.ts` — `wordWrapLine` single-grapheme recursion guard**: when a segment cannot be split further and is wider than `maxWidth`, do not recurse. The guard is based on grapheme count so it handles ZWJ emoji correctly. Guarding tests: "wordWrapLine narrow width" and "Editor narrow width rendering" in `test/editor.test.ts`.
2. **`src/tui.ts` — `Container.render` width clamp**: clamp the entry-point width to at least 1. Guarding test: "Container width clamping" in `test/tui-render.test.ts`.
3. **`src/tui-main-screen.ts` — overwide-line truncation**: `doRender` truncates overwide lines through the `asciiVisibleWidth` fast path and falls back to `visibleWidth` for non-ASCII text. Guarding tests: "TUI overwide line handling" in `test/tui-render.test.ts` and "asciiVisibleWidth" in `test/truncate-to-width.test.ts`.
4. **Component negative-width guards**: Text, Markdown, TruncatedText, and Editor clamp `repeat` counts to zero or greater. Guarding tests are the corresponding "negative width safety" and narrow-width cases.
5. **`src/tui-main-screen.ts` — per-frame processed-line reuse**: reference-identical raw lines reuse their processed output and cached Kitty image ids when terminal width is unchanged. Guarding test: "TUI steady-frame processed-line reuse" in `test/tui-render.test.ts`.
6. **`src/components/markdown.ts` — `CjkBoundaryUrlTokenizer` autolink CJK boundary**: marked's GFM autolink absorbs CJK/full-width punctuation right after a bare URL into the link text and href; the tokenizer cuts the match at the first CJK punctuation before the ASCII backpedal. Guarding tests: the bare-URL CJK cases in the "Links" group in `test/markdown.test.ts`.
7. **`src/components/editor.ts` — opt-in inline slash autocomplete (`inlineSlashTrigger`)**: when enabled, `/` after whitespace mid-input auto-triggers autocomplete, and typing further token characters re-triggers the request. Off by default — prose slashes keep upstream behavior. Guarding tests: the "Inline slash trigger" group in `test/editor.test.ts`.
8. **`src/autocomplete.ts` / `src/components/select-list.ts` / `src/components/editor.ts` — `data` on autocomplete items + Enter non-submit for marked completions**: autocomplete items may carry an opaque `data` record; when `data.inlineSkill` is set, confirming with Enter applies without submitting. Guarding tests: "does not submit when confirming an inline-marked completion with Enter" and "still submits when confirming an unmarked slash completion with Enter" in `test/editor.test.ts`.

## Acceptance after syncing from upstream

- `pnpm --filter @moonshot-ai/pi-tui test` must pass in full; any failure among the guarding tests above means a local divergence was overwritten and lost.

## Testing

- This package's tests run with `node --test` (`pnpm --filter @moonshot-ai/pi-tui test`), not vitest; the root `vitest run` does not execute them — CI covers them through the dedicated `test-pi-tui` job in `.github/workflows/ci.yml`.
- Prefer adding new narrow-width tests to the existing test file of the corresponding component.
