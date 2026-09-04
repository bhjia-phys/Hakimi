// apps/kimi-web/src/lib/remoteShareQr.ts
// QR rendering for the remote-share dialog. Wraps the `qrcode` package so the
// component stays thin and the SVG path is testable in Node (where no canvas
// 2D context exists). The share URL is a bearer credential — it never enters
// logs, telemetry, or localStorage; it only flows into the QR bitmap or the
// system clipboard on explicit user action.

import { toCanvas, toString as qrToString } from 'qrcode';

/** Bitmap edge length for the QR canvas (CSS may scale it down on narrow screens). */
export const REMOTE_SHARE_QR_SIZE = 200;

/**
 * Render `url` onto an existing <canvas>. Resolves `true` when the QR was
 * drawn; `false` for an empty url or a rendering failure (the caller shows an
 * error state instead of a broken image). Never rejects.
 */
export async function renderQrToCanvas(
  canvas: HTMLCanvasElement,
  url: string,
): Promise<boolean> {
  if (!url) return false;
  try {
    await toCanvas(canvas, url, {
      width: REMOTE_SHARE_QR_SIZE,
      margin: 1,
      errorCorrectionLevel: 'M',
      // Fixed high-contrast colors on purpose: QR scanners expect near-black
      // modules on a near-white background regardless of the app theme, so the
      // QR is intentionally theme-independent (see useIsDark/theming rules).
      color: { dark: '#111827', light: '#ffffff' },
    });
    return true;
  } catch {
    return false;
  }
}

/**
 * The same content encoded as an SVG string — deterministic for a given input,
 * which lets tests assert on the output without a decoder. Returns `null` for
 * an empty url or a rendering failure.
 */
export async function remoteShareQrSvg(url: string): Promise<string | null> {
  if (!url) return null;
  try {
    return await qrToString(url, {
      type: 'svg',
      margin: 1,
      errorCorrectionLevel: 'M',
    });
  } catch {
    return null;
  }
}