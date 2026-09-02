// apps/kimi-web/src/qrcode.d.ts
// Ambient declaration for the `qrcode` package.
//
// The published `@types/qrcode` triple-slash-references `@types/node`
// (`Buffer`, `stream`), which drags Node globals into the browser compilation
// and breaks DOM timer typing (`window = Window & typeof globalThis` merges
// the Node `setTimeout` overloads). The web app only uses the browser canvas
// and SVG renderers, so we declare just those here and stay off the Node
// types entirely. The package's own JS entry remains the runtime.
declare module 'qrcode' {
  export type QRCodeErrorCorrectionLevel =
    | 'L'
    | 'M'
    | 'Q'
    | 'H'
    | 'low'
    | 'medium'
    | 'quartile'
    | 'high';

  export interface QRCodeRenderersOptions {
    width?: number;
    margin?: number;
    errorCorrectionLevel?: QRCodeErrorCorrectionLevel;
    color?: { dark?: string; light?: string };
  }

  /** Render `text` onto a `<canvas>`. Resolves when the QR is drawn. */
  export function toCanvas(
    canvas: HTMLCanvasElement,
    text: string,
    options?: QRCodeRenderersOptions,
  ): Promise<void>;

  /** Render `text` as a string (SVG for the testable helper). */
  export function toString(
    text: string,
    options?: QRCodeRenderersOptions & { type?: 'utf8' | 'svg' | 'terminal' },
  ): Promise<string>;
}