import { describe, expect, it, vi } from 'vitest';

import {
  openUrl,
  resolveOpenUrlCommand,
  type OpenUrlOptions,
} from '#/utils/open-url';
import { isWSL } from '#/utils/platform';

type OpenUrlExec = NonNullable<OpenUrlOptions['exec']>;

const url = 'https://example.test/oauth?client_id=test&state=value';

describe('platform detection', () => {
  it('detects WSL from its environment', () => {
    expect(isWSL({ WSL_DISTRO_NAME: 'Ubuntu' }, () => '')).toBe(true);
    expect(isWSL({ WSLENV: 'PATH/l' }, () => '')).toBe(true);
  });

  it('falls back to /proc/version for WSL detection', () => {
    expect(isWSL({}, () => 'Linux version 5.15.0-microsoft-standard-WSL2')).toBe(true);
    expect(isWSL({}, () => 'Linux version 6.8.0-generic')).toBe(false);
  });
});

describe('resolveOpenUrlCommand', () => {
  it('uses the Windows URL protocol handler under WSL', () => {
    expect(resolveOpenUrlCommand(url, 'linux', true)).toEqual([
      'rundll32.exe',
      ['url.dll,FileProtocolHandler', url],
    ]);
  });

  it.each([
    { platform: 'darwin' as const, expected: ['open', [url]] },
    { platform: 'win32' as const, expected: ['cmd', ['/c', 'start', '', url]] },
    { platform: 'linux' as const, expected: ['xdg-open', [url]] },
  ])('selects the native opener on $platform', ({ platform, expected }) => {
    expect(resolveOpenUrlCommand(url, platform, false)).toEqual(expected);
  });
});

describe('openUrl', () => {
  it('falls back to xdg-open when Windows interop is unavailable', () => {
    const exec = vi.fn(
      (command: string, _args: string[], callback: (error: Error | null) => void) => {
        const error = Object.assign(new Error('interop unavailable'), { code: 'ENOENT' });
        callback(command === 'rundll32.exe' ? error : null);
      },
    );

    openUrl(url, {
      platform: 'linux',
      env: { WSL_DISTRO_NAME: 'Ubuntu' },
      exec: exec as unknown as OpenUrlExec,
    });

    expect(exec).toHaveBeenNthCalledWith(
      1,
      'rundll32.exe',
      ['url.dll,FileProtocolHandler', url],
      expect.any(Function),
    );
    expect(exec).toHaveBeenNthCalledWith(2, 'xdg-open', [url], expect.any(Function));
  });

  it('does not run the fallback for a URL handler numeric exit code', () => {
    const exec = vi.fn(
      (_command: string, _args: string[], callback: (error: Error | null) => void) => {
        callback(Object.assign(new Error('URL handler exited'), { code: 1 }));
      },
    );

    openUrl(url, {
      platform: 'linux',
      env: { WSL_DISTRO_NAME: 'Ubuntu' },
      exec: exec as unknown as OpenUrlExec,
    });

    expect(exec).toHaveBeenCalledOnce();
  });

  it('does not run the fallback after Windows interop succeeds', () => {
    const exec = vi.fn(
      (_command: string, _args: string[], callback: (error: Error | null) => void) => {
        callback(null);
      },
    );

    openUrl(url, {
      platform: 'linux',
      env: { WSL_DISTRO_NAME: 'Ubuntu' },
      exec: exec as unknown as OpenUrlExec,
    });

    expect(exec).toHaveBeenCalledOnce();
  });
});
