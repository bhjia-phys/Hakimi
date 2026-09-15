import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { openFileAttachment } from '../src/lib/openFileAttachment';

// The module under test reads the daemon API client; stub the file-byte fetch.
const mocks = vi.hoisted(() => ({ getFileBlob: vi.fn() }));
vi.mock('../src/api', () => ({
  getKimiWebApi: () => ({ getFileBlob: mocks.getFileBlob }),
}));

interface WinHandle {
  location: { href: string };
  close: ReturnType<typeof vi.fn>;
  opener: unknown;
}

interface AnchorHandle {
  href: string;
  download: string;
  click: ReturnType<typeof vi.fn>;
}

describe('openFileAttachment', () => {
  let win: WinHandle;
  let anchor: AnchorHandle;
  let windowOpen: ReturnType<typeof vi.fn>;
  let createObjectURL: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    win = { location: { href: '' }, close: vi.fn(), opener: {} };
    anchor = { href: '', download: '', click: vi.fn() };
    windowOpen = vi.fn().mockReturnValue(win);
    createObjectURL = vi.fn().mockReturnValue('blob:mock-url');
    (globalThis as { window?: unknown }).window = { open: windowOpen };
    (globalThis as { document?: unknown }).document = {
      createElement: vi.fn().mockReturnValue(anchor),
    };
    (globalThis.URL as unknown as { createObjectURL: unknown }).createObjectURL = createObjectURL;
    (globalThis.URL as unknown as { revokeObjectURL: unknown }).revokeObjectURL = vi.fn();
    mocks.getFileBlob.mockResolvedValue(new Blob(['<h1>x</h1>'], { type: 'text/html' }));
  });

  afterEach(() => {
    vi.restoreAllMocks();
    delete (globalThis as { window?: unknown }).window;
    delete (globalThis as { document?: unknown }).document;
  });

  /** The MIME of the blob handed to createObjectURL most recently. */
  function previewedBlobType(): string {
    const blob = createObjectURL.mock.calls.at(-1)?.[0] as Blob;
    return blob.type;
  }

  it('downloads text/html instead of previewing — an active document would run same-origin', async () => {
    const result = await openFileAttachment('f_1', 'page.html', 'text/html');
    expect(result).toBe('downloaded');
    expect(windowOpen).not.toHaveBeenCalled();
    expect(anchor.download).toBe('page.html');
    expect(anchor.href).toBe('blob:mock-url');
    expect(anchor.click).toHaveBeenCalled();
  });

  it('downloads image/svg+xml instead of previewing — SVG carries script when navigated', async () => {
    const result = await openFileAttachment('f_1', 'vector.svg', 'image/svg+xml');
    expect(result).toBe('downloaded');
    expect(windowOpen).not.toHaveBeenCalled();
  });

  it('downloads a .html extension even with an empty recorded MIME', async () => {
    const result = await openFileAttachment('f_1', 'page.html', '');
    expect(result).toBe('downloaded');
  });

  it('renders script source inert: text/* is pinned to text/plain, never executed', async () => {
    const result = await openFileAttachment('f_1', 'a.js', 'text/javascript');
    expect(result).toBe('previewed');
    expect(previewedBlobType()).toBe('text/plain;charset=utf-8');
  });

  it('downloads non-text xml types instead of previewing them', async () => {
    expect(await openFileAttachment('f_1', 'a.xml', 'application/xml')).toBe('downloaded');
    expect(await openFileAttachment('f_1', 'a.xhtml', 'application/xhtml+xml')).toBe('downloaded');
  });

  it('downloads an extensionless file with no usable MIME', async () => {
    expect(await openFileAttachment('f_1', 'Makefile', '')).toBe('downloaded');
  });

  it('previews pdf / safe images / media with their whitelisted MIME', async () => {
    expect(await openFileAttachment('f_1', 'a.pdf', 'application/pdf')).toBe('previewed');
    expect(previewedBlobType()).toBe('application/pdf');
    expect(await openFileAttachment('f_1', 'a.png', 'image/png')).toBe('previewed');
    expect(previewedBlobType()).toBe('image/png');
    expect(await openFileAttachment('f_1', 'a.mp4', 'video/mp4')).toBe('previewed');
    expect(previewedBlobType()).toBe('video/mp4');
  });

  it('previews text but pins the blob to text/plain so it renders inert', async () => {
    // A .html file uploaded with a plain-text label must NOT regain its active
    // type — the blob is re-wrapped, never trusting the recorded content-type.
    const result = await openFileAttachment('f_1', 'evil.html', 'text/plain');
    expect(result).toBe('previewed');
    expect(previewedBlobType()).toBe('text/plain;charset=utf-8');
  });

  it('previews text-ish extensions with an empty MIME as text/plain', async () => {
    const result = await openFileAttachment('f_1', 'notes.md', '');
    expect(result).toBe('previewed');
    expect(previewedBlobType()).toBe('text/plain;charset=utf-8');
  });

  it('severs window.opener on the preview tab', async () => {
    await openFileAttachment('f_1', 'a.pdf', 'application/pdf');
    expect(win.opener).toBeNull();
    expect(win.location.href).toBe('blob:mock-url');
  });

  it('closes the tab and reports failure when the byte fetch fails', async () => {
    mocks.getFileBlob.mockRejectedValue(new Error('401'));
    const result = await openFileAttachment('f_1', 'a.pdf', 'application/pdf');
    expect(result).toBe('failed');
    expect(win.close).toHaveBeenCalled();
  });

  it('reports failure when the download-fallback byte fetch fails', async () => {
    mocks.getFileBlob.mockRejectedValue(new Error('401'));
    const result = await openFileAttachment('f_1', 'page.html', 'text/html');
    expect(result).toBe('failed');
    expect(windowOpen).not.toHaveBeenCalled();
    expect(anchor.click).not.toHaveBeenCalled();
  });

  it('downloads without a name fall back to the file id as filename', async () => {
    const result = await openFileAttachment('f_1', undefined, 'text/html');
    expect(result).toBe('downloaded');
    expect(anchor.download).toBe('f_1');
  });

  it('reports downloaded (not previewed) when the popup is blocked and it saves instead', async () => {
    windowOpen.mockReturnValue(null);
    const result = await openFileAttachment('f_1', 'a.pdf', 'application/pdf');
    expect(result).toBe('downloaded');
    expect(anchor.download).toBe('a.pdf');
    expect(anchor.click).toHaveBeenCalled();
  });
});
