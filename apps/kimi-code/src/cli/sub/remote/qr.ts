/** Terminal QR rendering shared by the foreground remote runners. */

import { toString as qrToString } from 'qrcode';

export function renderTerminalQr(url: string): Promise<string> {
  return qrToString(url, { type: 'terminal', small: true });
}