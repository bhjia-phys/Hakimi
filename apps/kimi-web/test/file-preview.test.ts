// Scenario: right-side file/media preview (useFilePreview) — external actions
// (open/reveal/download) must ride on a VALID normalized workspace path, stay
// available when content reading fails, and never be derived from a media
// display name; blob-backed media has an honest failure state and a clean
// blob-URL lifecycle.
// Wiring: the composable is real; the daemon API client, vue-i18n, and
// URL.createObjectURL are stubbed.
// Run: pnpm --filter @bhjia-phys/hakimi-web exec vitest run test/file-preview.test.ts

import { ref } from 'vue';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useFilePreview, type DetailTarget } from '../src/composables/useFilePreview';
import { hrefToFilePath } from '../src/lib/filePathLinks';
import type { FileData } from '../src/types';

const apiMock = vi.hoisted(() => ({ getFileBlob: vi.fn() }));
vi.mock('../src/api', () => ({
  getKimiWebApi: () => apiMock,
}));
vi.mock('vue-i18n', () => ({
  useI18n: () => ({ t: (key: string) => key }),
}));

type Client = Parameters<typeof useFilePreview>[0]['client'];

function makeClient() {
  return {
    status: ref({ cwd: '/work' }),
    readFileContent: vi.fn(),
    getFileDownloadUrl: vi.fn((path: string) => `/dl/${path}`),
    downloadWorkspaceFile: vi.fn(),
    openWorkspaceFile: vi.fn(async () => true),
    revealWorkspaceFile: vi.fn(async () => true),
  };
}

function makePreview(client: ReturnType<typeof makeClient>) {
  const detailTarget = ref<DetailTarget | null>(null);
  const preview = useFilePreview({ client: client as unknown as Client, detailTarget });
  return { detailTarget, preview };
}

function textFile(path: string): FileData {
  return {
    path,
    content: 'hello',
    encoding: 'utf-8',
    mime: 'text/plain',
    isBinary: false,
    size: 5,
  };
}

function pdfFile(path: string): FileData {
  return {
    path,
    content: '',
    encoding: 'base64',
    mime: 'application/pdf',
    isBinary: true,
    size: 100,
  };
}

const flush = (): Promise<void> => new Promise((resolve) => setTimeout(resolve, 0));

describe('useFilePreview external actions', () => {
  beforeEach(() => {
    (globalThis.URL as unknown as { createObjectURL: unknown }).createObjectURL = vi
      .fn()
      .mockReturnValue('blob:mock-url');
    (globalThis.URL as unknown as { revokeObjectURL: unknown }).revokeObjectURL = vi.fn();
    apiMock.getFileBlob.mockReset();
    apiMock.getFileBlob.mockResolvedValue(new Blob(['png-bytes']));
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('opens a Markdown link whose href carried a percent-encoded non-ASCII filename', async () => {
    const client = makeClient();
    client.readFileContent.mockResolvedValue(textFile('ppt/example_单图工程.pptx'));
    const { preview } = makePreview(client);

    // Markdown.vue decodes the URI href exactly once at the openFile boundary
    // (hrefToFilePath); the preview then sees the literal workspace path.
    await preview.openFilePreview({
      path: hrefToFilePath('ppt/example_%E5%8D%95%E5%9B%BE%E5%B7%A5%E7%A8%8B.pptx'),
    });

    expect(client.readFileContent).toHaveBeenCalledWith('ppt/example_单图工程.pptx');
    expect(preview.previewError.value).toBeNull();
    preview.revealPreviewFile();
    expect(client.revealWorkspaceFile).toHaveBeenCalledWith('ppt/example_单图工程.pptx');
  });

  it('still rejects a decoded traversal at the workspace boundary', async () => {
    const client = makeClient();
    const { preview } = makePreview(client);

    // `..%2F` decodes to `../` — decoding must not bypass path validation.
    await preview.openFilePreview({ path: hrefToFilePath('..%2Fsecret.txt') });

    expect(preview.previewError.value).toBeTruthy();
    expect(preview.previewExternalActions.value).toBe(false);
    preview.revealPreviewFile();
    expect(client.revealWorkspaceFile).not.toHaveBeenCalled();
    expect(client.readFileContent).not.toHaveBeenCalled();
  });

  it('keeps open/reveal available when a valid-path read fails', async () => {
    const client = makeClient();
    client.readFileContent.mockResolvedValue(null); // daemon failure → null
    const { preview } = makePreview(client);

    await preview.openFilePreview({ path: '/work/docs/a.md', line: 7 });

    expect(client.readFileContent).toHaveBeenCalledWith('docs/a.md');
    expect(preview.previewError.value).toBeTruthy();
    // The read failed, but the path itself is valid — the user can still open
    // the original file or its folder instead of hitting a dead end.
    expect(preview.previewExternalActions.value).toBe(true);

    preview.openPreviewInEditor();
    expect(client.openWorkspaceFile).toHaveBeenCalledWith('docs/a.md', 7);
    preview.revealPreviewFile();
    expect(client.revealWorkspaceFile).toHaveBeenCalledWith('docs/a.md');
  });

  it('never fires external requests for a path outside the workspace', async () => {
    const client = makeClient();
    const { preview } = makePreview(client);

    await preview.openFilePreview({ path: '/etc/passwd' });

    expect(preview.previewError.value).toBeTruthy();
    expect(preview.previewExternalActions.value).toBe(false);
    preview.openPreviewInEditor();
    preview.revealPreviewFile();
    expect(client.openWorkspaceFile).not.toHaveBeenCalled();
    expect(client.revealWorkspaceFile).not.toHaveBeenCalled();
    expect(client.readFileContent).not.toHaveBeenCalled();
  });

  it('uses the normalized (not raw) path for external actions after a successful read', async () => {
    const client = makeClient();
    client.readFileContent.mockResolvedValue(textFile('docs/a.md'));
    const { preview } = makePreview(client);

    await preview.openFilePreview({ path: '/work/docs/a.md' });

    expect(preview.previewError.value).toBeNull();
    expect(preview.previewExternalActions.value).toBe(true);
    preview.revealPreviewFile();
    expect(client.revealWorkspaceFile).toHaveBeenCalledWith('docs/a.md');
  });

  it('treats a bare media display name as NO local path (uploaded chat media)', async () => {
    const client = makeClient();
    const { preview } = makePreview(client);

    // userAttachmentMedia puts the display NAME into media.path — it must not
    // be guessed into a workspace path.
    preview.openMediaPreview({ kind: 'image', url: 'https://example.com/pic.png', path: 'pic.png' });

    expect(preview.previewExternalActions.value).toBe(false);
    preview.openPreviewInEditor();
    preview.revealPreviewFile();
    expect(client.openWorkspaceFile).not.toHaveBeenCalled();
    expect(client.revealWorkspaceFile).not.toHaveBeenCalled();
  });

  it('enables external actions for tool media with a real in-workspace path', async () => {
    const client = makeClient();
    const { preview } = makePreview(client);

    preview.openMediaPreview({
      kind: 'image',
      url: 'data:image/png;base64,AAAA',
      path: '/work/out/pic.png',
    });

    expect(preview.previewExternalActions.value).toBe(true);
    expect(preview.previewDownloadUrl.value).toBe('/dl/out/pic.png');
    preview.revealPreviewFile();
    expect(client.revealWorkspaceFile).toHaveBeenCalledWith('out/pic.png');
  });

  it('keeps external actions when the media blob fetch fails but the path is real', async () => {
    const client = makeClient();
    apiMock.getFileBlob.mockRejectedValue(new Error('401'));
    const { preview } = makePreview(client);

    preview.openMediaPreview({
      kind: 'image',
      url: '/api/v1/files/f_1/content',
      path: '/work/out/pic.png',
      fileId: 'f_1',
    });
    await flush();

    // The bytes couldn't load, but the source path is valid — open/reveal and
    // the path-based download URL stay available.
    expect(preview.previewLoading.value).toBe(false);
    expect(preview.previewFile.value?.sourceUrl).toBeUndefined();
    expect(preview.previewExternalActions.value).toBe(true);
    expect(preview.previewDownloadUrl.value).toBe('/dl/out/pic.png');
    preview.revealPreviewFile();
    expect(client.revealWorkspaceFile).toHaveBeenCalledWith('out/pic.png');
  });

  it('accepts a legal workspace-relative media path', () => {
    const client = makeClient();
    const { preview } = makePreview(client);

    preview.openMediaPreview({
      kind: 'image',
      url: 'data:image/png;base64,AAAA',
      path: 'out/pic.png',
    });

    expect(preview.previewExternalActions.value).toBe(true);
    expect(preview.previewDownloadUrl.value).toBe('/dl/out/pic.png');
    preview.revealPreviewFile();
    expect(client.revealWorkspaceFile).toHaveBeenCalledWith('out/pic.png');
  });

  it('keeps media outside the workspace actionless (no workspace-boundary widening)', async () => {
    const client = makeClient();
    const { preview } = makePreview(client);

    preview.openMediaPreview({ kind: 'image', url: 'data:image/png;base64,AAAA', path: '/tmp/x/pic.png' });

    expect(preview.previewExternalActions.value).toBe(false);
    preview.revealPreviewFile();
    expect(client.revealWorkspaceFile).not.toHaveBeenCalled();
  });

  it('leaves an honest no-preview state when the authenticated media blob fetch fails', async () => {
    const client = makeClient();
    apiMock.getFileBlob.mockRejectedValue(new Error('401'));
    const { preview } = makePreview(client);

    preview.openMediaPreview({
      kind: 'image',
      url: '/api/v1/files/f_1/content',
      path: 'pic.png',
      fileId: 'f_1',
    });
    await flush();

    expect(preview.previewLoading.value).toBe(false);
    // No sourceUrl: the raw getFileUrl URL 401s in <img>, so the no-preview
    // card is shown instead of a broken player.
    expect(preview.previewFile.value?.sourceUrl).toBeUndefined();
  });

  it('creates and revokes the media blob URL across open/close', async () => {
    const client = makeClient();
    const { preview } = makePreview(client);

    preview.openMediaPreview({ kind: 'image', url: '/api/v1/files/f_1/content', fileId: 'f_1' });
    await flush();

    expect(preview.previewFile.value?.sourceUrl).toBe('blob:mock-url');
    preview.closeFilePreview();
    expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:mock-url');
  });

  it('drops the previous normalized path when switching targets', async () => {
    const client = makeClient();
    client.readFileContent.mockResolvedValue(textFile('docs/a.md'));
    const { preview } = makePreview(client);

    await preview.openFilePreview({ path: '/work/docs/a.md' });
    expect(preview.previewExternalActions.value).toBe(true);

    // Switching to an upload media (display name only) must not inherit the
    // previous file's path.
    preview.openMediaPreview({ kind: 'image', url: 'https://example.com/pic.png', path: 'pic.png' });
    expect(preview.previewExternalActions.value).toBe(false);
    expect(preview.previewDownloadUrl.value).toBeNull();
    preview.revealPreviewFile();
    expect(client.revealWorkspaceFile).not.toHaveBeenCalled();
  });

  describe('downloadPreviewAttachment (no-path store media)', () => {
    let anchor: { href: string; download: string; click: ReturnType<typeof vi.fn> };

    beforeEach(() => {
      anchor = { href: '', download: '', click: vi.fn() };
      (globalThis as { document?: unknown }).document = {
        createElement: vi.fn().mockReturnValue(anchor),
      };
    });

    afterEach(() => {
      delete (globalThis as { document?: unknown }).document;
    });

    it('is unavailable for non-store media', async () => {
      const client = makeClient();
      const { preview } = makePreview(client);

      preview.openMediaPreview({ kind: 'image', url: 'https://example.com/pic.png', path: 'pic.png' });

      expect(preview.previewCanDownloadAttachment.value).toBe(false);
      expect(await preview.downloadPreviewAttachment()).toBe(false);
      expect(apiMock.getFileBlob).not.toHaveBeenCalled();
    });

    it('reuses the blob already fetched for the preview', async () => {
      const client = makeClient();
      const { preview } = makePreview(client);

      preview.openMediaPreview({
        kind: 'image',
        url: '/api/v1/files/f_1/content',
        path: 'pic.png',
        fileId: 'f_1',
      });
      await flush();
      expect(preview.previewCanDownloadAttachment.value).toBe(true);

      expect(await preview.downloadPreviewAttachment()).toBe(true);
      // One fetch for the preview, none again for the download.
      expect(apiMock.getFileBlob).toHaveBeenCalledTimes(1);
      expect(anchor.download).toBe('pic.png');
      expect(anchor.click).toHaveBeenCalled();
    });

    it('refetches the blob when the preview fetch failed (download doubles as retry)', async () => {
      const client = makeClient();
      apiMock.getFileBlob.mockRejectedValueOnce(new Error('401'));
      const { preview } = makePreview(client);

      preview.openMediaPreview({
        kind: 'image',
        url: '/api/v1/files/f_1/content',
        path: 'clip.mp4',
        fileId: 'f_1',
      });
      await flush();
      expect(preview.previewFile.value?.sourceUrl).toBeUndefined();

      expect(await preview.downloadPreviewAttachment()).toBe(true);
      expect(apiMock.getFileBlob).toHaveBeenCalledTimes(2);
      expect(anchor.download).toBe('clip.mp4');
    });

    it('returns false and shows an inline error when the retry fetch fails too', async () => {
      const client = makeClient();
      apiMock.getFileBlob.mockRejectedValue(new Error('401'));
      const { preview } = makePreview(client);

      preview.openMediaPreview({
        kind: 'image',
        url: '/api/v1/files/f_1/content',
        path: 'pic.png',
        fileId: 'f_1',
      });
      await flush();

      expect(await preview.downloadPreviewAttachment()).toBe(false);
      expect(anchor.click).not.toHaveBeenCalled();
      // The failure is visible on the current target, and the loaded preview
      // (with its retry download button) stays up.
      expect(preview.previewActionError.value).toBe('filePreview.downloadFailed');
      expect(preview.previewCanDownloadAttachment.value).toBe(true);
      expect(preview.previewFile.value).not.toBeNull();

      // A retry clears the error and succeeds.
      apiMock.getFileBlob.mockResolvedValue(new Blob(['png-bytes']));
      expect(await preview.downloadPreviewAttachment()).toBe(true);
      expect(preview.previewActionError.value).toBeNull();
      expect(anchor.click).toHaveBeenCalled();
    });

    it('aborts a mid-fetch download when the target switches — no cache pollution, no stale download', async () => {
      const client = makeClient();
      // Every getFileBlob call parks its resolver here, in call order.
      const resolvers: Array<(blob: Blob) => void> = [];
      apiMock.getFileBlob.mockImplementation(
        () =>
          new Promise<Blob>((resolve) => {
            resolvers.push(resolve);
          }),
      );
      const { preview } = makePreview(client);

      preview.openMediaPreview({
        kind: 'image',
        url: '/api/v1/files/f_old/content',
        path: 'old.png',
        fileId: 'f_old',
      });
      await flush();
      // call 0: preview fetch (pending) — so the download refetches (call 1).
      const pending = preview.downloadPreviewAttachment();

      // Switch to another attachment before the download fetch resolves
      // (call 2: the new target's own preview fetch, also pending).
      preview.openMediaPreview({
        kind: 'image',
        url: '/api/v1/files/f_new/content',
        path: 'new.png',
        fileId: 'f_new',
      });
      resolvers[1](new Blob(['old-bytes']));
      expect(await pending).toBe(false);

      // The old bytes were neither downloaded nor cached into the new preview.
      expect(anchor.click).not.toHaveBeenCalled();
      expect(preview.previewActionError.value).toBeNull();

      // Downloading the NEW target must fetch its own bytes — a polluted cache
      // would skip this fetch and save old-bytes under new.png.
      const pendingNew = preview.downloadPreviewAttachment();
      expect(apiMock.getFileBlob).toHaveBeenLastCalledWith('f_new');
      resolvers.at(-1)!(new Blob(['new-bytes']));
      expect(await pendingNew).toBe(true);
      expect(anchor.download).toBe('new.png');
    });

    it('aborts a mid-fetch download when the preview is closed', async () => {
      const client = makeClient();
      const resolvers: Array<(blob: Blob) => void> = [];
      apiMock.getFileBlob.mockImplementation(
        () =>
          new Promise<Blob>((resolve) => {
            resolvers.push(resolve);
          }),
      );
      const { preview } = makePreview(client);

      preview.openMediaPreview({
        kind: 'image',
        url: '/api/v1/files/f_1/content',
        path: 'pic.png',
        fileId: 'f_1',
      });
      await flush();
      const pending = preview.downloadPreviewAttachment();
      preview.closeFilePreview();
      resolvers.at(-1)!(new Blob(['bytes']));

      expect(await pending).toBe(false);
      expect(anchor.click).not.toHaveBeenCalled();
    });
  });

  describe('PDF preview (authenticated blob)', () => {
    it('fetches the PDF bytes with auth and revokes the blob URL on close', async () => {
      const client = makeClient();
      client.readFileContent.mockResolvedValue(pdfFile('docs/a.pdf'));
      client.downloadWorkspaceFile.mockResolvedValue(new Blob(['pdf-bytes']));
      const { preview } = makePreview(client);

      await preview.openFilePreview({ path: '/work/docs/a.pdf' });
      await flush();

      expect(client.downloadWorkspaceFile).toHaveBeenCalledWith('docs/a.pdf');
      expect(preview.previewLoading.value).toBe(false);
      expect(preview.previewPdfUrl.value).toBe('blob:mock-url');

      preview.closeFilePreview();
      expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:mock-url');
      expect(preview.previewPdfUrl.value).toBeNull();
    });

    it('discards a stale PDF fetch when the target switched mid-flight', async () => {
      const client = makeClient();
      const resolvers: Array<(blob: Blob) => void> = [];
      client.downloadWorkspaceFile.mockImplementation(
        () =>
          new Promise<Blob>((resolve) => {
            resolvers.push(resolve);
          }),
      );
      client.readFileContent.mockImplementation((p: string) => Promise.resolve(pdfFile(p)));
      const { preview } = makePreview(client);

      await preview.openFilePreview({ path: '/work/a.pdf' });
      await preview.openFilePreview({ path: '/work/b.pdf' });
      resolvers[0]!(new Blob(['a-bytes']));
      await flush();

      // The stale fetch must not create (leak) a blob URL for the old target.
      expect(preview.previewPdfUrl.value).toBeNull();

      resolvers[1]!(new Blob(['b-bytes']));
      await flush();
      expect(preview.previewPdfUrl.value).toBe('blob:mock-url');
      preview.closeFilePreview();
      // Only the live target's blob URL was ever created and revoked.
      expect(URL.createObjectURL).toHaveBeenCalledTimes(1);
      expect(URL.revokeObjectURL).toHaveBeenCalledTimes(1);
    });

    it('shows an inline error and keeps the loaded file when the PDF fetch fails', async () => {
      const client = makeClient();
      client.readFileContent.mockResolvedValue(pdfFile('docs/a.pdf'));
      client.downloadWorkspaceFile.mockRejectedValue(new Error('40101'));
      const { preview } = makePreview(client);

      await preview.openFilePreview({ path: '/work/docs/a.pdf' });
      await flush();

      expect(preview.previewLoading.value).toBe(false);
      expect(preview.previewPdfUrl.value).toBeNull();
      expect(preview.previewActionError.value).toBe('filePreview.pdfLoadFailed');
      expect(preview.previewFile.value).not.toBeNull();
    });

    it('does not fetch bytes for non-PDF files', async () => {
      const client = makeClient();
      client.readFileContent.mockResolvedValue(textFile('docs/a.md'));
      const { preview } = makePreview(client);

      await preview.openFilePreview({ path: '/work/docs/a.md' });

      expect(client.downloadWorkspaceFile).not.toHaveBeenCalled();
      expect(preview.previewPdfUrl.value).toBeNull();
    });
  });

  describe('downloadPreviewFile (workspace file download)', () => {
    let anchor: { href: string; download: string; click: ReturnType<typeof vi.fn> };

    beforeEach(() => {
      anchor = { href: '', download: '', click: vi.fn() };
      (globalThis as { document?: unknown }).document = {
        createElement: vi.fn().mockReturnValue(anchor),
      };
    });

    afterEach(() => {
      delete (globalThis as { document?: unknown }).document;
    });

    it('downloads through the authenticated blob fetch under the file name', async () => {
      const client = makeClient();
      client.readFileContent.mockResolvedValue(textFile('docs/a.md'));
      client.downloadWorkspaceFile.mockResolvedValue(new Blob(['bytes']));
      const { preview } = makePreview(client);

      await preview.openFilePreview({ path: '/work/docs/a.md' });

      expect(await preview.downloadPreviewFile()).toBe(true);
      expect(client.downloadWorkspaceFile).toHaveBeenCalledWith('docs/a.md');
      expect(anchor.download).toBe('a.md');
      expect(anchor.click).toHaveBeenCalled();
    });

    it('reuses the PDF preview bytes instead of refetching', async () => {
      const client = makeClient();
      client.readFileContent.mockResolvedValue(pdfFile('docs/a.pdf'));
      client.downloadWorkspaceFile.mockResolvedValue(new Blob(['pdf-bytes']));
      const { preview } = makePreview(client);

      await preview.openFilePreview({ path: '/work/docs/a.pdf' });
      await flush();

      expect(await preview.downloadPreviewFile()).toBe(true);
      // One fetch for the preview, none again for the download.
      expect(client.downloadWorkspaceFile).toHaveBeenCalledTimes(1);
      expect(anchor.download).toBe('a.pdf');
    });

    it('returns false and shows an inline error when the fetch fails', async () => {
      const client = makeClient();
      client.readFileContent.mockResolvedValue(textFile('docs/a.md'));
      client.downloadWorkspaceFile.mockRejectedValue(new Error('40101'));
      const { preview } = makePreview(client);

      await preview.openFilePreview({ path: '/work/docs/a.md' });

      expect(await preview.downloadPreviewFile()).toBe(false);
      expect(anchor.click).not.toHaveBeenCalled();
      expect(preview.previewActionError.value).toBe('filePreview.downloadFailed');
    });

    it('aborts a mid-fetch download when the preview is closed', async () => {
      const client = makeClient();
      const resolvers: Array<(blob: Blob) => void> = [];
      client.downloadWorkspaceFile.mockImplementation(
        () =>
          new Promise<Blob>((resolve) => {
            resolvers.push(resolve);
          }),
      );
      client.readFileContent.mockResolvedValue(textFile('docs/a.md'));
      const { preview } = makePreview(client);

      await preview.openFilePreview({ path: '/work/docs/a.md' });
      const pending = preview.downloadPreviewFile();
      preview.closeFilePreview();
      resolvers.at(-1)!(new Blob(['bytes']));

      expect(await pending).toBe(false);
      expect(anchor.click).not.toHaveBeenCalled();
    });
  });

  describe('open/reveal failure feedback', () => {
    it('shows an inline error when open fails', async () => {
      const client = makeClient();
      client.readFileContent.mockResolvedValue(textFile('docs/a.md'));
      client.openWorkspaceFile.mockResolvedValue(false);
      const { preview } = makePreview(client);

      await preview.openFilePreview({ path: '/work/docs/a.md' });
      preview.openPreviewInEditor();
      await flush();

      expect(preview.previewActionError.value).toBe('filePreview.openFailed');
    });

    it('shows an inline error when reveal fails', async () => {
      const client = makeClient();
      client.readFileContent.mockResolvedValue(textFile('docs/a.md'));
      client.revealWorkspaceFile.mockResolvedValue(false);
      const { preview } = makePreview(client);

      await preview.openFilePreview({ path: '/work/docs/a.md' });
      preview.revealPreviewFile();
      await flush();

      expect(preview.previewActionError.value).toBe('filePreview.revealFailed');
    });

    it('clears the error on a successful retry', async () => {
      const client = makeClient();
      client.readFileContent.mockResolvedValue(textFile('docs/a.md'));
      client.openWorkspaceFile.mockResolvedValueOnce(false);
      const { preview } = makePreview(client);

      await preview.openFilePreview({ path: '/work/docs/a.md' });
      preview.openPreviewInEditor();
      await flush();
      expect(preview.previewActionError.value).toBe('filePreview.openFailed');

      preview.openPreviewInEditor();
      await flush();
      expect(preview.previewActionError.value).toBeNull();
    });

    it('ignores a stale failure after the target switched', async () => {
      const client = makeClient();
      client.readFileContent.mockImplementation((p: string) => Promise.resolve(textFile(p)));
      const resolvers: Array<(ok: boolean) => void> = [];
      client.revealWorkspaceFile.mockImplementation(
        () =>
          new Promise<boolean>((resolve) => {
            resolvers.push(resolve);
          }),
      );
      const { preview } = makePreview(client);

      await preview.openFilePreview({ path: '/work/a.md' });
      preview.revealPreviewFile();
      await preview.openFilePreview({ path: '/work/b.md' });
      resolvers[0]!(false);
      await flush();

      expect(preview.previewActionError.value).toBeNull();
    });

    it('surfaces a rejected open/reveal call (not just a false result)', async () => {
      const client = makeClient();
      client.readFileContent.mockResolvedValue(textFile('docs/a.md'));
      client.openWorkspaceFile.mockRejectedValue(new Error('network down'));
      client.revealWorkspaceFile.mockRejectedValue(new Error('network down'));
      const { preview } = makePreview(client);

      await preview.openFilePreview({ path: '/work/docs/a.md' });
      preview.openPreviewInEditor();
      await flush();
      expect(preview.previewActionError.value).toBe('filePreview.openFailed');

      preview.revealPreviewFile();
      await flush();
      expect(preview.previewActionError.value).toBe('filePreview.revealFailed');
    });

    it('keeps the error visible when the read itself failed (error-state actions)', async () => {
      const client = makeClient();
      client.readFileContent.mockResolvedValue(null); // daemon failure → error state
      client.revealWorkspaceFile.mockResolvedValue(false);
      const { preview } = makePreview(client);

      await preview.openFilePreview({ path: '/work/docs/a.md' });
      expect(preview.previewError.value).toBeTruthy();

      // The error branch still offers reveal; its failure must be recorded for
      // the error state's inline error line, not dropped.
      preview.revealPreviewFile();
      await flush();
      expect(preview.previewActionError.value).toBe('filePreview.revealFailed');
    });
  });
});
