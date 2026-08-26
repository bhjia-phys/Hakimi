// apps/kimi-web/src/lib/turnWebPreview.ts
// Pick the SINGLE preview target for an assistant turn — the target for the
// standalone preview card appended to that reply. The turn's own artifacts win:
// a Write/Edit of a previewable file backed by a real tool result (output
// presence — a dangling running call can settle to 'ok' with no toolResult), or
// image/video media a tool produced. Only when no artifact exists do we fall
// back to a local dev-server URL printed in some non-Read tool's output
// (detectDevServerUrls() remains the security boundary). File paths are NEVER
// guessed from prose or tool output — a Read or any plain-text URL never
// triggers a target, and assistant text is entirely ignored.

import type { ToolCall, TurnPreviewTarget } from '../types';
import { detectDevServerUrls } from './devServerUrl';
import { extractEditPath } from './toolDiff';
import { normalizeToolName } from './toolMeta';

/** File extensions eligible for the artifact-file preview card (compared
 *  case-insensitively). Everything else is not previewable as an artifact. */
const FILE_EXT_WHITELIST = ['md', 'mdx', 'html', 'htm', 'pdf', 'svg', 'png', 'jpg', 'jpeg', 'webp'];

/** Tool-produced media kinds that open the artifact-media preview. */
const MEDIA_KINDS = new Set(['image', 'video']);

/**
 * Whether a file path is artifact-previewable: it must carry an extension from
 * the whitelist. Trailing-dot / extension-less paths return false.
 */
function isPreviewableFile(path: string): boolean {
  const dot = path.lastIndexOf('.');
  if (dot <= 0 || dot === path.length - 1) return false;
  return FILE_EXT_WHITELIST.includes(path.slice(dot + 1).toLowerCase());
}

/**
 * For multi_edit, the single top-level path is only trustworthy when the input
 * names EXACTLY ONE file at the top level (e.g. `{ file_path, edits }`).
 * Per-edit paths, an ambiguous spread across several keys, or a missing top
 * level never produce a path.
 */
function multiEditPath(arg: string): string | undefined {
  const s = arg.trim();
  if (!s.startsWith('{')) return undefined;
  let d: Record<string, unknown>;
  try {
    const v = JSON.parse(s) as unknown;
    if (!v || typeof v !== 'object' || Array.isArray(v)) return undefined;
    d = v as Record<string, unknown>;
  } catch {
    return undefined;
  }
  const names = new Set<string>();
  for (const key of ['path', 'file_path', 'filePath', 'filename']) {
    const value = d[key];
    if (typeof value === 'string' && value.length > 0) names.add(value);
  }
  return names.size === 1 ? [...names][0] : undefined;
}

/** An artifact target from one OK tool call, or null. Media wins within a
 *  tool; a Write/Edit file only counts when a REAL tool result exists — a
 *  dangling running call can settle to 'ok' without any toolResult, so the
 *  file evidence is the presence of `output` / `outputText` — and its path is
 *  previewable. */
function artifactFromTool(tool: ToolCall): TurnPreviewTarget | null {
  if (tool.status !== 'ok') return null;
  if (tool.media && MEDIA_KINDS.has(tool.media.kind)) {
    return { kind: 'artifact-media', media: tool.media };
  }
  const kind = normalizeToolName(tool.name);
  if (kind !== 'write' && kind !== 'edit' && kind !== 'multi_edit') return null;
  if (tool.output === undefined && tool.outputText === undefined) return null;
  const path = kind === 'multi_edit' ? multiEditPath(tool.arg) : extractEditPath(tool.arg);
  if (path && isPreviewableFile(path)) return { kind: 'artifact-file', path };
  return null;
}

/** The first safe dev-server URL in one OK non-Read tool's output, or null. */
function webFromTool(tool: ToolCall): TurnPreviewTarget | null {
  if (tool.status !== 'ok' || normalizeToolName(tool.name) === 'read') return null;
  const stream = tool.outputText ?? tool.output?.join('\n') ?? '';
  const [first] = detectDevServerUrls(stream);
  return first ? { kind: 'web', url: first.url } : null;
}

/**
 * The turn's single preview target, or null. Artifacts are scanned first in
 * call order — the first successful previewable file / produced media wins the
 * whole turn, so a target never depends on prose or URL text. Only when no
 * artifact exists does the web fallback scan tool outputs in call order.
 * Assistant text is deliberately ignored.
 */
export function findTurnPreviewTarget(tools: ToolCall[] | undefined): TurnPreviewTarget | null {
  for (const tool of tools ?? []) {
    const artifact = artifactFromTool(tool);
    if (artifact) return artifact;
  }
  for (const tool of tools ?? []) {
    const web = webFromTool(tool);
    if (web) return web;
  }
  return null;
}