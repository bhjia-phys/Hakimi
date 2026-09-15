// apps/kimi-web/src/composables/useFilePreview.ts
// File preview: download / path normalization / request-sequence guard. Claims
// the 'file' slot of the shared right-side detail layer.

import { computed, ref, watch, type Ref } from 'vue';
import { useI18n } from 'vue-i18n';
import { getKimiWebApi } from '../api';
import type { FileData, FilePreviewRequest, ToolMedia } from '../types';
import type { useKimiWebClient } from './useKimiWebClient';

type KimiWebClient = ReturnType<typeof useKimiWebClient>;

/** Which occupant currently owns the shared right-side detail layer. */
export type DetailTarget = 'file' | 'diff' | 'thinking' | 'compaction' | 'agent' | 'toolDiff' | 'btw' | 'preview';

/** Whether a url can feed a native <video>/<img> src. A provider reference like
 *  `ms://…` has no local bytes and only yields a broken player, so it's treated
 *  as non-loadable and falls through to the no-preview card. */
export function isPlayableMediaUrl(url: string): boolean {
  return /^(?:https?:|blob:|data:)/i.test(url);
}

export interface UseFilePreviewOptions {
  client: KimiWebClient;
  detailTarget: Ref<DetailTarget | null>;
}

/** Trigger a browser save-as for already-fetched bytes. The object URL is
 *  revoked on a delay — revoking synchronously can cancel the download. */
function saveBlob(blob: Blob, name: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => {
    URL.revokeObjectURL(url);
  }, 60_000);
}

export function useFilePreview({ client, detailTarget }: UseFilePreviewOptions) {
  const { t } = useI18n();

  const previewTarget = ref<FilePreviewRequest | null>(null);
  const previewFile = ref<FileData | null>(null);
  const previewLoading = ref(false);
  const previewError = ref<string | null>(null);
  // Normalized workspace-relative path of the currently-open preview. Used for
  // the download URL so it matches the server's relative-path contract even when
  // the user opened the preview from an absolute path in the chat.
  const previewNormalizedPath = ref<string | null>(null);
  // Incremented on every openFilePreview call so a slower earlier request can't
  // overwrite the result of a later one (request-sequence guard).
  let previewRequestSeq = 0;
  // Authenticated blob URL backing the current media preview, when the media
  // came from the file store (a bare getFileUrl 401s in <img> under daemon
  // auth). Revoked when the preview is replaced or closed.
  let mediaObjectUrl: string | null = null;
  function revokeMediaObjectUrl(): void {
    if (mediaObjectUrl !== null) {
      URL.revokeObjectURL(mediaObjectUrl);
      mediaObjectUrl = null;
    }
  }
  // Store-backed media keeps its fileId (and the fetched bytes) so an uploaded
  // attachment with NO workspace path still has a download outlet — the blob
  // already fetched for preview is reused, and a failed fetch can be retried.
  const previewMediaFileId = ref<string | null>(null);
  let mediaBlob: Blob | null = null;
  // PDF preview: the bare fs :download URL carries no Bearer token and 40101s
  // in an <iframe> under daemon auth, so the bytes are fetched with auth and
  // served from a blob URL. pdfBlob is retained so the header download reuses
  // the same bytes; both are revoked/cleared with the preview.
  const previewPdfUrl = ref<string | null>(null);
  let pdfBlob: Blob | null = null;
  let pdfObjectUrl: string | null = null;
  function revokePdfObjectUrl(): void {
    if (pdfObjectUrl !== null) {
      URL.revokeObjectURL(pdfObjectUrl);
      pdfObjectUrl = null;
    }
    pdfBlob = null;
    previewPdfUrl.value = null;
  }
  // Inline failure of the attachment download action (e.g. the byte fetch
  // 401'd). Kept separate from previewError so the loaded preview — and its
  // retry download button — stays on screen.
  const previewActionError = ref<string | null>(null);

  const previewDownloadUrl = computed(() => {
    const path = previewNormalizedPath.value;
    return path ? client.getFileDownloadUrl(path) : null;
  });
  // Store-backed media (chat uploads) may have NO workspace path — the
  // path-based download URL is null, but the bytes are still reachable through
  // the authenticated file-store blob (see downloadPreviewAttachment).
  const previewCanDownloadAttachment = computed(() => previewMediaFileId.value !== null);
  // External actions (open / reveal / download) are only meaningful when the
  // preview has a REAL workspace path — never fire requests from a display
  // label (e.g. an uploaded image's file name) or an unvalidated raw path.
  const previewExternalActions = computed(() => previewNormalizedPath.value !== null);

  function trimTrailingSlash(path: string): string {
    return path.length > 1 ? path.replace(/\/+$/, '') : path;
  }

  function normalizeRelativePath(path: string): string {
    const out: string[] = [];
    for (const part of path.split(/[\\/]+/)) {
      if (!part || part === '.') continue;
      if (part === '..') {
        out.pop();
        continue;
      }
      out.push(part);
    }
    return out.join('/');
  }

  function normalizePreviewPath(inputPath: string): { path: string } | { error: string } {
    const raw = inputPath.trim();
    if (!raw) return { error: t('filePreview.errors.emptyPath') };
    if (/^[a-z][a-z0-9+.-]*:\/\//i.test(raw)) {
      return { error: t('filePreview.errors.unsupportedPath') };
    }
    if (raw.startsWith('~')) {
      return { error: t('filePreview.errors.outsideWorkspace') };
    }

    const cwd = trimTrailingSlash(client.status.value.cwd);
    if (raw.startsWith('/')) {
      if (!cwd || (raw !== cwd && !raw.startsWith(`${cwd}/`))) {
        return { error: t('filePreview.errors.outsideWorkspace') };
      }
      const relative = raw === cwd ? '' : raw.slice(cwd.length + 1);
      if (relative.split(/[\\/]+/).includes('..')) {
        return { error: t('filePreview.errors.outsideWorkspace') };
      }
      const path = normalizeRelativePath(relative);
      return path ? { path } : { error: t('filePreview.errors.isDirectory') };
    }

    if (raw.split(/[\\/]+/).includes('..')) {
      return { error: t('filePreview.errors.outsideWorkspace') };
    }

    const path = normalizeRelativePath(raw);
    return path ? { path } : { error: t('filePreview.errors.emptyPath') };
  }

  async function openFilePreview(target: FilePreviewRequest): Promise<void> {
    // Clicking the link for the already-open file toggles the panel closed.
    const current = previewTarget.value;
    if (
      detailTarget.value === 'file' &&
      current &&
      current.path === target.path &&
      current.line === target.line
    ) {
      closeFilePreview();
      return;
    }
    const requestSeq = ++previewRequestSeq;
    revokeMediaObjectUrl();
    revokePdfObjectUrl();
    detailTarget.value = 'file';
    previewFile.value = null;
    previewError.value = null;
    previewLoading.value = true;
    previewTarget.value = target;
    previewNormalizedPath.value = null;
    previewMediaFileId.value = null;
    mediaBlob = null;
    previewActionError.value = null;

    const normalized = normalizePreviewPath(target.path);
    if ('error' in normalized) {
      previewLoading.value = false;
      previewError.value = normalized.error;
      return;
    }
    previewNormalizedPath.value = normalized.path;

    let pdfPath: string | null = null;
    try {
      const result = await client.readFileContent(normalized.path);
      // A newer openFilePreview started while this one was in flight — discard
      // the stale result so the right-side panel shows the latest file.
      if (requestSeq !== previewRequestSeq) return;
      if (result) {
        previewFile.value = { ...result, path: result.path || normalized.path };
        if (result.mime === 'application/pdf' || normalized.path.toLowerCase().endsWith('.pdf')) {
          pdfPath = normalized.path;
        }
      } else {
        // readFileContent swallows daemon failures into null — show the error
        // state instead of a misleading 0-byte "empty file" (the cause is
        // already console.warn'd in readFileContent).
        previewError.value = t('filePreview.errors.loadFailed');
      }
    } catch (err) {
      if (requestSeq !== previewRequestSeq) return;
      previewError.value = err instanceof Error ? err.message : t('filePreview.errors.loadFailed');
    } finally {
      if (requestSeq === previewRequestSeq) {
        previewLoading.value = false;
      }
    }

    // PDF: the iframe loads its src natively and cannot authorize the bare
    // download URL (40101 under daemon auth), so fetch the bytes with the
    // Bearer credential and preview a blob URL. The panel keeps its loading
    // state while the fetch is in flight instead of flashing the no-preview
    // card; a failure falls back to the base64 payload (when the read carried
    // one) plus an inline error. Runs after the finally above so the read's
    // loading reset doesn't cancel the PDF fetch's own loading state.
    if (pdfPath !== null && requestSeq === previewRequestSeq) {
      previewLoading.value = true;
      void client.downloadWorkspaceFile(pdfPath).then((blob) => {
        if (requestSeq !== previewRequestSeq) return;
        pdfBlob = blob;
        pdfObjectUrl = URL.createObjectURL(blob);
        previewPdfUrl.value = pdfObjectUrl;
        previewLoading.value = false;
      }).catch(() => {
        if (requestSeq !== previewRequestSeq) return;
        previewLoading.value = false;
        previewActionError.value = t('filePreview.pdfLoadFailed');
      });
    }
  }

  function mimeFromDataUrl(url: string): string | undefined {
    const match = /^data:([^;,]+)/i.exec(url);
    return match?.[1];
  }

  function openMediaPreview(media: ToolMedia): void {
    if (media.kind !== 'image' && media.kind !== 'video') return;
    const seq = ++previewRequestSeq;
    revokeMediaObjectUrl();
    revokePdfObjectUrl();
    detailTarget.value = 'file';
    previewTarget.value = null;
    previewNormalizedPath.value = null;
    previewError.value = null;
    previewMediaFileId.value = media.fileId ?? null;
    mediaBlob = null;
    previewActionError.value = null;
    // Tool-produced media carries its real source path; chat-upload media only
    // carries the display NAME in `path` (see userAttachmentMedia). A bare
    // file name is never treated as a workspace path — only values that look
    // like paths are normalized, and out-of-workspace ones stay actionless
    // instead of guessing.
    if (media.path !== undefined && /[\\/]/.test(media.path)) {
      const normalized = normalizePreviewPath(media.path);
      if ('path' in normalized) previewNormalizedPath.value = normalized.path;
    }
    const isVideo = media.kind === 'video';
    const base = {
      path: media.path ?? (isVideo ? 'Video' : 'ReadMediaFile image'),
      content: '',
      encoding: 'utf-8' as const,
      mime: media.mimeType ?? mimeFromDataUrl(media.url) ?? (isVideo ? 'video/*' : 'image/*'),
      isBinary: true,
      size: media.bytes ?? 0,
    };
    // The raw URL 401s under daemon auth (browsers load media without the
    // Bearer token), so fetch the bytes with auth and preview a blob URL.
    if (media.fileId) {
      previewLoading.value = true;
      previewFile.value = base;
      void getKimiWebApi().getFileBlob(media.fileId).then((blob) => {
        if (seq !== previewRequestSeq) return;
        mediaBlob = blob;
        // The user may have switched to another detail panel while this was in
        // flight — don't create (and leak) a blob URL for a hidden panel.
        if (detailTarget.value !== 'file' || !previewFile.value) {
          previewLoading.value = false;
          return;
        }
        mediaObjectUrl = URL.createObjectURL(blob);
        previewFile.value = { ...previewFile.value, sourceUrl: mediaObjectUrl };
        previewLoading.value = false;
      }).catch(() => {
        if (seq !== previewRequestSeq) return;
        // Leave sourceUrl unset: the raw getFileUrl URL 401s in <img>/<video>
        // under daemon auth, so "falling back" to it only renders a broken
        // player. The no-preview card (plus open/reveal/download when the
        // media has a real workspace path) is the honest failure state.
        previewLoading.value = false;
      });
    } else {
      previewLoading.value = false;
      // A non-loadable url (e.g. a provider `ms://` reference with no local
      // bytes) can't feed a <video>/<img> src — leave sourceUrl unset so the
      // preview shows the no-preview card instead of a broken player.
      previewFile.value = isPlayableMediaUrl(media.url) ? { ...base, sourceUrl: media.url } : base;
    }
  }

  function resetFilePreview(): void {
    // Invalidate any in-flight authenticated media fetch so it doesn't create a
    // blob URL after the panel is gone (which would leak until the next preview).
    previewRequestSeq += 1;
    previewTarget.value = null;
    previewNormalizedPath.value = null;
    previewMediaFileId.value = null;
    mediaBlob = null;
    previewActionError.value = null;
    previewFile.value = null;
    previewError.value = null;
    previewLoading.value = false;
    revokeMediaObjectUrl();
    revokePdfObjectUrl();
  }

  function closeFilePreview(): void {
    resetFilePreview();
    if (detailTarget.value === 'file') detailTarget.value = null;
  }

  // Revoke/close the preview when the user switches to another detail panel
  // (useDetailPanel only flips detailTarget and does not call closeFilePreview),
  // so an in-flight or already-shown blob URL isn't held while the file panel
  // is hidden.
  watch(detailTarget, (target, oldTarget) => {
    if (oldTarget === 'file' && target !== 'file') resetFilePreview();
  });

  function openPreviewInEditor(): void {
    const path = previewNormalizedPath.value;
    if (!path) return;
    // A failed open (no usable opener on the server, e.g. headless/WSL) must be
    // visible inline instead of a silent no-op — whether the client resolved
    // false or rejected outright. The seq guard keeps a late response from a
    // previous target from polluting the current preview.
    const seq = previewRequestSeq;
    previewActionError.value = null;
    void client.openWorkspaceFile(path, previewTarget.value?.line).then(
      (ok) => {
        if (seq !== previewRequestSeq) return;
        if (!ok) previewActionError.value = t('filePreview.openFailed');
      },
      () => {
        if (seq !== previewRequestSeq) return;
        previewActionError.value = t('filePreview.openFailed');
      },
    );
  }

  function revealPreviewFile(): void {
    const path = previewNormalizedPath.value;
    if (!path) return;
    const seq = previewRequestSeq;
    previewActionError.value = null;
    void client.revealWorkspaceFile(path).then(
      (ok) => {
        if (seq !== previewRequestSeq) return;
        if (!ok) previewActionError.value = t('filePreview.revealFailed');
      },
      () => {
        if (seq !== previewRequestSeq) return;
        previewActionError.value = t('filePreview.revealFailed');
      },
    );
  }

  /**
   * Download the original bytes of a store-backed media attachment that has no
   * workspace path (the path-based downloadUrl doesn't exist for it). Reuses
   * the blob already fetched for preview; refetches when that fetch failed, so
   * the no-preview card's download click doubles as the retry. The display
   * name is only used as the download filename — never resolved as a path.
   * Returns false when the bytes can't be fetched (surfaced via
   * previewActionError) or the target changed mid-fetch.
   */
  async function downloadPreviewAttachment(): Promise<boolean> {
    const fileId = previewMediaFileId.value;
    if (fileId === null) return false;
    // Capture the target identity up front — the fetch below is async, and a
    // target switch/close must neither cache the old bytes into the new
    // preview nor download them under the new preview's name.
    const seq = previewRequestSeq;
    const name = previewFile.value?.path.split(/[\\/]/).pop() ?? fileId;
    previewActionError.value = null;
    let blob = mediaBlob;
    if (blob === null) {
      const fetched: Blob | null = await getKimiWebApi()
        .getFileBlob(fileId)
        .catch(() => null);
      if (seq !== previewRequestSeq) return false;
      if (fetched === null) {
        previewActionError.value = t('filePreview.downloadFailed');
        return false;
      }
      blob = fetched;
      mediaBlob = blob;
    }
    saveBlob(blob, name);
    return true;
  }

  /**
   * Download the previewed workspace file's original bytes. Goes through the
   * authenticated blob fetch — the bare getFileDownloadUrl carries no Bearer
   * token and 40101s as a plain navigation/anchor under daemon auth. Reuses
   * the PDF preview's already-fetched bytes (pdfBlob always belongs to the
   * current preview target). Returns false when the fetch fails (surfaced via
   * previewActionError) or the target changed mid-fetch.
   */
  async function downloadPreviewFile(): Promise<boolean> {
    const path = previewNormalizedPath.value;
    if (path === null) return false;
    const seq = previewRequestSeq;
    const name = path.split(/[\\/]/).pop() ?? path;
    previewActionError.value = null;
    let blob = pdfBlob;
    if (blob === null) {
      const fetched: Blob | null = await client.downloadWorkspaceFile(path).catch(() => null);
      if (seq !== previewRequestSeq) return false;
      if (fetched === null) {
        previewActionError.value = t('filePreview.downloadFailed');
        return false;
      }
      blob = fetched;
    }
    saveBlob(blob, name);
    return true;
  }

  return {
    previewTarget,
    previewFile,
    previewLoading,
    previewError,
    previewDownloadUrl,
    previewExternalActions,
    previewCanDownloadAttachment,
    previewActionError,
    previewPdfUrl,
    openFilePreview,
    openMediaPreview,
    closeFilePreview,
    openPreviewInEditor,
    revealPreviewFile,
    downloadPreviewAttachment,
    downloadPreviewFile,
  };
}
