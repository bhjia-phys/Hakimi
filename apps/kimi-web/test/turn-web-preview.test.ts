// apps/kimi-web/test/turn-web-preview.test.ts
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import type { ToolCall, ToolMedia } from '../src/types';
import { findTurnPreviewTarget } from '../src/lib/turnWebPreview';

function tool(name: string, over: Partial<ToolCall> = {}): ToolCall {
  return { id: 'tool-1', name, arg: '· x', status: 'ok', ...over };
}

function media(kind: ToolMedia['kind'], over: Partial<ToolMedia> = {}): ToolMedia {
  return { kind, url: 'media://file-store/abc', ...over };
}

describe('findTurnPreviewTarget', () => {
  it('returns null when the turn carries no target', () => {
    expect(findTurnPreviewTarget(undefined)).toBeNull();
    expect(findTurnPreviewTarget([])).toBeNull();
    expect(findTurnPreviewTarget([tool('bash', {})])).toBeNull();
  });

  // ---- artifact-file: Write/Edit extension whitelist ----------------------

  it('targets a Write of a whitelisted file backed by a tool result', () => {
    const target = findTurnPreviewTarget([
      tool('write', {
        arg: '{"path":"src/pages/index.html","content":"<h1>hi</h1>"}',
        output: ['Wrote file: src/pages/index.html'],
      }),
    ]);
    expect(target).toEqual({ kind: 'artifact-file', path: 'src/pages/index.html' });
  });

  it('targets an Edit of a whitelisted file backed by a tool result', () => {
    const target = findTurnPreviewTarget([
      tool('edit', {
        arg: '{"path":"docs/guide.md","old_string":"a","new_string":"b"}',
        outputText: 'Updated 1 line in docs/guide.md',
      }),
    ]);
    expect(target).toEqual({ kind: 'artifact-file', path: 'docs/guide.md' });
  });

  it('accepts the whole whitelist, case-insensitively', () => {
    const exts = ['md', 'MDX', 'html', 'HTM', 'pdf', 'SVG', 'png', 'jpg', 'JPEG', 'webp'];
    for (const ext of exts) {
      const target = findTurnPreviewTarget([
        tool('write', { arg: `{"path":"out/file.${ext}"}`, output: ['ok'] }),
      ]);
      expect(target?.kind).toBe('artifact-file');
    }
  });

  it('targets only an extension from the whitelist', () => {
    // Evidence is present, so each null below is the extension gate, not the
    // tool-result gate.
    expect(findTurnPreviewTarget([tool('write', { arg: '{"path":"src/main.ts"}', output: ['ok'] })])).toBeNull();
    expect(findTurnPreviewTarget([tool('write', { arg: '{"path":"package.json"}', output: ['ok'] })])).toBeNull();
    expect(findTurnPreviewTarget([tool('write', { arg: '{"path":"no-extension"}', output: ['ok'] })])).toBeNull();
  });

  it('requires a real tool result — ok Write/Edit without output does NOT trigger', () => {
    // messagesToTurns can settle a dangling running call to 'ok' with no
    // toolResult; a path alone is not evidence the file was produced.
    expect(findTurnPreviewTarget([tool('write', { arg: '{"path":"src/x.md"}' })])).toBeNull();
    expect(findTurnPreviewTarget([tool('edit', { arg: '{"path":"src/x.md"}' })])).toBeNull();
    expect(findTurnPreviewTarget([tool('multi_edit', { arg: '{"file_path":"src/x.md","edits":[]}' })])).toBeNull();
  });

  it('targets a successful Write/Edit backed by output or outputText', () => {
    const byOutput = findTurnPreviewTarget([
      tool('write', { arg: '{"path":"src/x.md"}', output: ['Wrote file: src/x.md'] }),
    ]);
    expect(byOutput).toEqual({ kind: 'artifact-file', path: 'src/x.md' });
    const byOutputText = findTurnPreviewTarget([
      tool('edit', { arg: '{"path":"src/x.md"}', outputText: 'Updated 1 line in src/x.md' }),
    ]);
    expect(byOutputText).toEqual({ kind: 'artifact-file', path: 'src/x.md' });
  });

  it('supports a multi_edit whose input names one top-level path', () => {
    const target = findTurnPreviewTarget([
      tool('multi_edit', {
        arg: '{"file_path":"guide.md","edits":[{"old_string":"a","new_string":"b"}]}',
        output: ['Applied 1 edit to guide.md'],
      }),
    ]);
    expect(target).toEqual({ kind: 'artifact-file', path: 'guide.md' });
  });

  it('rejects a multi_edit with no reliable single top-level path', () => {
    // Per-edit paths only — no single top-level file to open (evidence present,
    // so the null comes from the path logic).
    expect(
      findTurnPreviewTarget([
        tool('multi_edit', {
          arg: '{"edits":[{"file_path":"a.md"},{"file_path":"b.md"}]}',
          output: ['Applied 2 edits'],
        }),
      ]),
    ).toBeNull();
    // Ambiguous top-level keys disagree on the file.
    expect(
      findTurnPreviewTarget([
        tool('multi_edit', { arg: '{"path":"a.md","file_path":"b.md","edits":[]}', output: ['ok'] }),
      ]),
    ).toBeNull();
  });

  // ---- Read / plain text never trigger -----------------------------------

  it('does NOT target a Read, even of a whitelisted path with a dev URL', () => {
    expect(
      findTurnPreviewTarget([
        tool('read', { arg: '{"path":"src/report.md"}', outputText: 'Local: http://localhost:5173/' }),
      ]),
    ).toBeNull();
    expect(findTurnPreviewTarget([tool('read', { arg: '{"path":"docs/guide.md"}', output: ['ok'] })])).toBeNull();
  });

  // ---- errors never trigger ----------------------------------------------

  it('does NOT target a failed or errored tool', () => {
    expect(
      findTurnPreviewTarget([tool('write', { status: 'error', arg: '{"path":"src/x.md"}', output: ['x'] })]),
    ).toBeNull();
    expect(
      findTurnPreviewTarget([tool('bash', { status: 'error', outputText: 'Local: http://localhost:5173/' })]),
    ).toBeNull();
    expect(
      findTurnPreviewTarget([tool('bash', { status: 'running', outputText: 'Local: http://localhost:5173/' })]),
    ).toBeNull();
  });

  // ---- artifact-media -----------------------------------------------------

  it('targets image and video media produced by an ok tool', () => {
    const image = media('image');
    expect(findTurnPreviewTarget([tool('bash', { media: image })])).toEqual({
      kind: 'artifact-media',
      media: image,
    });
    const video = media('video');
    expect(findTurnPreviewTarget([tool('bash', { media: video })])).toEqual({
      kind: 'artifact-media',
      media: video,
    });
  });

  it('does NOT target audio media', () => {
    expect(findTurnPreviewTarget([tool('bash', { media: media('audio') })])).toBeNull();
  });

  // ---- assistant text is ignored ------------------------------------------

  it('does NOT scan assistant text for URLs', () => {
    // The old assistant-text fallback is gone: the function takes no text and
    // prose URL text never triggers a target.
    expect(
      findTurnPreviewTarget([tool('bash', { outputText: 'no url here' })]),
    ).toBeNull();
  });

  // ---- artifact beats web -------------------------------------------------

  it('prefers the artifact over a dev-server URL in tool output', () => {
    const target = findTurnPreviewTarget([
      tool('write', { arg: '{"path":"src/pages/index.html"}', output: ['Wrote it'] }),
      tool('bash', { outputText: 'Local: http://localhost:5173/' }),
    ]);
    expect(target).toEqual({ kind: 'artifact-file', path: 'src/pages/index.html' });
  });

  it('prefers media over a dev-server URL in tool output', () => {
    const shot = media('image');
    const target = findTurnPreviewTarget([
      tool('bash', { media: shot }),
      tool('bash', { outputText: 'Local: http://localhost:5173/' }),
    ]);
    expect(target).toEqual({ kind: 'artifact-media', media: shot });
  });

  it('takes the FIRST artifact in call order', () => {
    const target = findTurnPreviewTarget([
      tool('write', { arg: '{"path":"a.md"}', output: ['ok'] }),
      tool('write', { arg: '{"path":"b.html"}', output: ['ok'] }),
    ]);
    expect(target).toEqual({ kind: 'artifact-file', path: 'a.md' });
  });

  // ---- web fallback: tool output only -------------------------------------

  it('uses a safe URL from tool output when no artifact exists', () => {
    expect(
      findTurnPreviewTarget([tool('functions.Bash', { outputText: 'Local: http://localhost:5173/' })]),
    ).toEqual({ kind: 'web', url: 'http://localhost:5173/' });
    expect(
      findTurnPreviewTarget([tool('plugin.run', { output: ['Local: http://127.0.0.1:8080/'] })]),
    ).toEqual({ kind: 'web', url: 'http://127.0.0.1:8080/' });
  });

  it('prefers outputText over the line-shaped output when both exist', () => {
    const target = findTurnPreviewTarget([
      tool('bash', {
        outputText: 'Local: http://localhost:5173/',
        output: ['Local: http://[::1]:8080/'],
      }),
    ]);
    expect(target).toEqual({ kind: 'web', url: 'http://localhost:5173/' });
  });

  it('falls back to the newline-joined output when outputText is missing', () => {
    const target = findTurnPreviewTarget([
      tool('bash', { output: ['Local: http://localhost:5173/', 'ready in 320 ms'] }),
    ]);
    expect(target).toEqual({ kind: 'web', url: 'http://localhost:5173/' });
  });

  it('takes only the FIRST safe URL when a single tool prints several', () => {
    const target = findTurnPreviewTarget([
      tool('bash', { outputText: 'one http://localhost:5173/ two http://127.0.0.1:8080/x' }),
    ]);
    expect(target).toEqual({ kind: 'web', url: 'http://localhost:5173/' });
  });

  it('returns the first bash call in call order across several tools', () => {
    const target = findTurnPreviewTarget([
      tool('bash', { outputText: 'no url here' }),
      tool('bash', { outputText: 'http://localhost:5173/a' }),
      tool('bash', { outputText: 'http://127.0.0.1:8080/b' }),
    ]);
    expect(target).toEqual({ kind: 'web', url: 'http://localhost:5173/a' });
  });

  it('returns null when no tool printed a safe local URL', () => {
    expect(
      findTurnPreviewTarget([tool('bash', { outputText: 'Deploy at https://preview.example.com:443/' })]),
    ).toBeNull();
    expect(findTurnPreviewTarget([tool('bash', { outputText: 'docs at https://localhost/x' })])).toBeNull();
  });

  // ---- standalone preview-card switch (ChatPane/SideChatPanel wiring) ------
  // Static source guard for the `previewCards` opt-out (no jsdom/component
  // tests run here): the BTW side chat must never render the card, because its
  // main action would only replace the panel that already hosts the transcript.

  const chatPaneSource = readFileSync(
    fileURLToPath(new URL('../src/components/chat/ChatPane.vue', import.meta.url)),
    'utf-8',
  );
  const sideChatPaneSource = readFileSync(
    fileURLToPath(new URL('../src/components/chat/SideChatPanel.vue', import.meta.url)),
    'utf-8',
  );

  it('ChatPane declares previewCards with a default of true', () => {
    expect(chatPaneSource).toContain('previewCards?: boolean;');
    expect(chatPaneSource).toContain('previewCards: true,');
  });

  it('ChatPane gates both standalone preview card branches on previewCards', () => {
    expect(chatPaneSource).toContain('v-if="previewCards && artifactPreviewTarget(turn)"');
    expect(chatPaneSource).toContain('v-else-if="previewCards && webPreviewTarget(turn)"');
  });

  it('SideChatPanel opts out of the standalone preview cards', () => {
    expect(sideChatPaneSource).toContain(':preview-cards="false"');
  });
});