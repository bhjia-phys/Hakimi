import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  launchDetached,
  openFileCommandFor,
  openInAppCommandFor,
  revealFileCommandFor,
} from '../src/lib/fileLaunch';

// launchDetached spawns real desktop programs; stub child_process so tests
// control spawn success/failure without launching anything.
const childProcessMock = vi.hoisted(() => ({ spawn: vi.fn(), spawnSync: vi.fn() }));
vi.mock('node:child_process', () => ({
  spawn: childProcessMock.spawn,
  spawnSync: childProcessMock.spawnSync,
}));

describe('fileLaunch', () => {
  describe('win32 explorer /select, quoting', () => {
    // explorer.exe parses its RAW command line (not argv). Node's default
    // spawn quoting renders a `/select,` argument with spaces as
    // `"/select,\"C:\...\""`, which explorer rejects — it then silently opens
    // the Documents folder. The argument must quote only the path, and the
    // launch must bypass Node's quoting via windowsVerbatimArguments.
    it('revealFileCommandFor quotes only the path and uses verbatim arguments', () => {
      const cmd = revealFileCommandFor('C:\\some dir\\sub\\file.txt', 'win32');
      expect(cmd.command).toBe('explorer.exe');
      expect(cmd.args).toEqual(['/select,"C:\\some dir\\sub\\file.txt"']);
      expect(cmd.windowsVerbatimArguments).toBe(true);
    });

    it('openInAppCommandFor (finder) quotes only the path and uses verbatim arguments', () => {
      const cmd = openInAppCommandFor(
        'finder',
        'C:\\some dir\\sub\\file.txt',
        { isDirectory: false },
        'win32',
      );
      expect(cmd.command).toBe('explorer.exe');
      expect(cmd.args).toEqual(['/select,"C:\\some dir\\sub\\file.txt"']);
      expect(cmd.windowsVerbatimArguments).toBe(true);
    });

    it('openInAppCommandFor (finder) opens directories without /select,', () => {
      const cmd = openInAppCommandFor(
        'finder',
        'C:\\some dir\\sub',
        { isDirectory: true },
        'win32',
      );
      expect(cmd.command).toBe('explorer.exe');
      expect(cmd.args).toEqual(['C:\\some dir\\sub']);
      expect(cmd.windowsVerbatimArguments).toBeUndefined();
    });

    it('drops a trailing backslash so it cannot escape the closing quote', () => {
      const cmd = revealFileCommandFor('C:\\some dir\\sub\\', 'win32');
      expect(cmd.args).toEqual(['/select,"C:\\some dir\\sub"']);
    });

    it('paths without spaces keep the same quoting', () => {
      const cmd = revealFileCommandFor('C:\\proj\\file.txt', 'win32');
      expect(cmd.args).toEqual(['/select,"C:\\proj\\file.txt"']);
      expect(cmd.windowsVerbatimArguments).toBe(true);
    });
  });

  describe('linux opener commands', () => {
    it('openFileCommandFor uses xdg-open with a gio open fallback', () => {
      const cmd = openFileCommandFor('/home/u/proj/file.txt', undefined, {}, 'linux');
      expect(cmd.command).toBe('xdg-open');
      expect(cmd.args).toEqual(['/home/u/proj/file.txt']);
      expect(cmd.fallback).toEqual({ command: 'gio', args: ['open', '/home/u/proj/file.txt'] });
    });

    it('revealFileCommandFor opens the parent directory with a gio fallback', () => {
      const cmd = revealFileCommandFor('/home/u/proj/file.txt', 'linux');
      expect(cmd.command).toBe('xdg-open');
      expect(cmd.args).toEqual(['/home/u/proj']);
      expect(cmd.fallback).toEqual({ command: 'gio', args: ['open', '/home/u/proj'] });
    });

    it('openInAppCommandFor (finder) falls back the same way', () => {
      const cmd = openInAppCommandFor('finder', '/home/u/proj/file.txt', {}, 'linux');
      expect(cmd.command).toBe('xdg-open');
      expect(cmd.args).toEqual(['/home/u/proj']);
      expect(cmd.fallback).toEqual({ command: 'gio', args: ['open', '/home/u/proj'] });
    });

    it('a configured editor keeps the shell command with no fallback', () => {
      const cmd = openFileCommandFor('/home/u/proj/file.txt', 3, { KIMI_CODE_EDITOR: 'code' }, 'linux');
      expect(cmd.shell).toBe(true);
      expect(cmd.command).toBe("code '/home/u/proj/file.txt:3'");
      expect(cmd.fallback).toBeUndefined();
    });

    it('darwin keeps the plain open command with no fallback', () => {
      const cmd = revealFileCommandFor('/Users/u/proj/file.txt', 'darwin');
      expect(cmd).toEqual({ command: 'open', args: ['-R', '/Users/u/proj/file.txt'] });
    });
  });

  describe('WSL open/reveal through Windows Explorer', () => {
    const wslEnv = { WSL_DISTRO_NAME: 'Ubuntu', WSL_INTEROP: '/run/WSL/8_interop' };

    /** Stub the real `wslpath -w` conversion: mapping hit → stdout + exit 0,
     *  miss → exit 1. The builder must pass wslpath's output through verbatim
     *  and must not derive any mapping itself (custom automount roots, drvfs
     *  options, and the distro UNC root are all wslpath's business). */
    function stubWslpath(mapping: Record<string, string>): void {
      childProcessMock.spawnSync.mockImplementation(
        (command: string, args: readonly string[]) => {
          if (command === 'wslpath') {
            const mapped = mapping[args[1] as string];
            return mapped === undefined
              ? { status: 1, stdout: '', stderr: 'wslpath: unknown path' }
              : { status: 0, stdout: `${mapped}\r\n`, stderr: '' };
          }
          return { status: 1, stdout: '', stderr: '' };
        },
      );
    }

    afterEach(() => {
      childProcessMock.spawnSync.mockReset();
    });

    it('openFileCommandFor uses explorer.exe with wslpath -w output verbatim', () => {
      stubWslpath({ '/home/u/proj/file.txt': '\\\\wsl$\\Ubuntu\\home\\u\\proj\\file.txt' });
      const cmd = openFileCommandFor('/home/u/proj/file.txt', undefined, wslEnv, 'linux');
      expect(childProcessMock.spawnSync).toHaveBeenCalledWith(
        'wslpath',
        ['-w', '/home/u/proj/file.txt'],
        expect.objectContaining({ timeout: expect.any(Number) }),
      );
      expect(cmd.command).toBe('explorer.exe');
      expect(cmd.args).toEqual(['\\\\wsl$\\Ubuntu\\home\\u\\proj\\file.txt']);
      // explorer.exe missing (interop disabled) still degrades to xdg-open/gio.
      expect(cmd.fallback).toEqual({
        command: 'xdg-open',
        args: ['/home/u/proj/file.txt'],
        fallback: { command: 'gio', args: ['open', '/home/u/proj/file.txt'] },
      });
    });

    it('passes drvfs and custom-automount paths through wslpath unchanged', () => {
      // A custom automount root (no /mnt/<letter> shape) is exactly what a
      // hand-rolled mapping would get wrong — the command must carry whatever
      // wslpath says.
      stubWslpath({ '/data/proj/file.txt': 'D:\\proj\\file.txt' });
      const cmd = openFileCommandFor('/data/proj/file.txt', undefined, wslEnv, 'linux');
      expect(cmd.command).toBe('explorer.exe');
      expect(cmd.args).toEqual(['D:\\proj\\file.txt']);
    });

    it('revealFileCommandFor opens the containing folder as a plain path argument', () => {
      // explorer.exe parses /select, off its raw command line; the quoting that
      // form needs cannot be reproduced through the WSL interop argv joining,
      // so reveal opens the folder itself — no /select, no verbatim flags.
      stubWslpath({ '/home/u/proj': '\\\\wsl$\\Ubuntu\\home\\u\\proj' });
      const cmd = revealFileCommandFor('/home/u/proj/file.txt', 'linux', wslEnv);
      expect(cmd.command).toBe('explorer.exe');
      expect(cmd.args).toEqual(['\\\\wsl$\\Ubuntu\\home\\u\\proj']);
      expect(cmd.windowsVerbatimArguments).toBeUndefined();
      expect(cmd.fallback).toEqual({
        command: 'xdg-open',
        args: ['/home/u/proj'],
        fallback: { command: 'gio', args: ['open', '/home/u/proj'] },
      });
    });

    it('falls back to the Linux opener when wslpath fails', () => {
      stubWslpath({}); // every conversion exits 1
      const cmd = openFileCommandFor('/home/u/proj/file.txt', undefined, wslEnv, 'linux');
      expect(cmd.command).toBe('xdg-open');
      expect(cmd.fallback).toEqual({ command: 'gio', args: ['open', '/home/u/proj/file.txt'] });
    });

    it('falls back to the Linux opener when wslpath itself is missing', () => {
      childProcessMock.spawnSync.mockImplementation(() => {
        const err = Object.assign(new Error('spawn wslpath ENOENT'), { code: 'ENOENT' });
        return { status: null, stdout: '', stderr: '', error: err };
      });
      const cmd = revealFileCommandFor('/home/u/proj/file.txt', 'linux', wslEnv);
      expect(cmd.command).toBe('xdg-open');
    });

    it('detects WSL from WSL_INTEROP alone (no distro name)', () => {
      stubWslpath({ '/mnt/d/work/a.txt': 'D:\\work\\a.txt' });
      const cmd = openFileCommandFor('/mnt/d/work/a.txt', undefined, { WSL_INTEROP: '/run/WSL/1_interop' }, 'linux');
      expect(cmd.command).toBe('explorer.exe');
      expect(cmd.args).toEqual(['D:\\work\\a.txt']);
    });

    it('does not touch wslpath on plain Linux (no WSL markers)', () => {
      const cmd = revealFileCommandFor('/home/u/proj/file.txt', 'linux', {});
      expect(cmd.command).toBe('xdg-open');
      expect(childProcessMock.spawnSync).not.toHaveBeenCalled();
    });

    it('a configured editor still wins over the WSL opener', () => {
      const cmd = openFileCommandFor('/home/u/proj/file.txt', 3, { ...wslEnv, KIMI_CODE_EDITOR: 'code' }, 'linux');
      expect(cmd.shell).toBe(true);
      expect(cmd.command).toBe("code '/home/u/proj/file.txt:3'");
      expect(childProcessMock.spawnSync).not.toHaveBeenCalled();
    });

    it('openInAppCommandFor (finder) opens the containing folder through explorer.exe on WSL', () => {
      stubWslpath({ '/home/u/proj': '\\\\wsl$\\Ubuntu\\home\\u\\proj' });
      const cmd = openInAppCommandFor('finder', '/home/u/proj/file.txt', {}, 'linux', wslEnv);
      expect(cmd.command).toBe('explorer.exe');
      expect(cmd.args).toEqual(['\\\\wsl$\\Ubuntu\\home\\u\\proj']);
      expect(cmd.windowsVerbatimArguments).toBeUndefined();
    });

    it('openInAppCommandFor (finder) opens directories through explorer.exe on WSL', () => {
      stubWslpath({ '/home/u/proj': '\\\\wsl$\\Ubuntu\\home\\u\\proj' });
      const cmd = openInAppCommandFor('finder', '/home/u/proj', { isDirectory: true }, 'linux', wslEnv);
      expect(cmd.command).toBe('explorer.exe');
      expect(cmd.args).toEqual(['\\\\wsl$\\Ubuntu\\home\\u\\proj']);
    });
  });

  describe('launchDetached linux fallback', () => {
    afterEach(() => {
      childProcessMock.spawn.mockReset();
    });

    /** A fake ChildProcess that emits 'spawn', or 'error' with the given code. */
    function stubSpawn(behavior: (command: string) => { code?: string } | null): void {
      childProcessMock.spawn.mockImplementation((command: string) => {
        const handlers: Record<string, (err?: unknown) => void> = {};
        const failure = behavior(command);
        queueMicrotask(() => {
          if (failure === null) {
            handlers['spawn']?.();
          } else {
            const err = Object.assign(new Error(`spawn ${command} ${failure.code ?? 'EUNKNOWN'}`), {
              code: failure.code,
            });
            handlers['error']?.(err);
          }
        });
        return {
          once(event: string, cb: (err?: unknown) => void) {
            handlers[event] = cb;
            return this;
          },
          unref: () => undefined,
        };
      });
    }

    it('falls back to gio open when xdg-open is missing (ENOENT)', async () => {
      stubSpawn((command) => (command === 'xdg-open' ? { code: 'ENOENT' } : null));
      await launchDetached(revealFileCommandFor('/home/u/proj/file.txt', 'linux'));
      expect(childProcessMock.spawn.mock.calls.map((c) => c[0])).toEqual(['xdg-open', 'gio']);
      const gioCall = childProcessMock.spawn.mock.calls[1];
      expect(gioCall?.[1]).toEqual(['open', '/home/u/proj']);
    });

    it('walks the full chain on WSL: explorer.exe → xdg-open → gio', async () => {
      childProcessMock.spawnSync.mockImplementation((command: string, args: readonly string[]) =>
        command === 'wslpath'
          ? { status: 0, stdout: 'D:\\work\\a.txt\r\n', stderr: '' }
          : { status: 1, stdout: '', stderr: '' },
      );
      stubSpawn((command) => (command === 'gio' ? null : { code: 'ENOENT' }));
      const cmd = openFileCommandFor('/mnt/d/work/a.txt', undefined, { WSL_DISTRO_NAME: 'Ubuntu' }, 'linux');
      await launchDetached(cmd);
      expect(childProcessMock.spawn.mock.calls.map((c) => c[0])).toEqual([
        'explorer.exe',
        'xdg-open',
        'gio',
      ]);
      childProcessMock.spawnSync.mockReset();
    });

    it('reports an actionable error when both openers are missing', async () => {
      stubSpawn(() => ({ code: 'ENOENT' }));
      await expect(
        launchDetached(revealFileCommandFor('/home/u/proj/file.txt', 'linux')),
      ).rejects.toThrow(/no usable system file opener.*xdg-utils/s);
      expect(childProcessMock.spawn.mock.calls.map((c) => c[0])).toEqual(['xdg-open', 'gio']);
    });

    it('does not fall back on a non-ENOENT failure of the primary opener', async () => {
      stubSpawn(() => ({ code: 'EACCES' }));
      await expect(
        launchDetached(revealFileCommandFor('/home/u/proj/file.txt', 'linux')),
      ).rejects.toThrow(/EACCES/);
      expect(childProcessMock.spawn).toHaveBeenCalledTimes(1);
    });

    it('does not attempt the fallback when the primary spawns', async () => {
      stubSpawn(() => null);
      await launchDetached(openFileCommandFor('/home/u/proj/file.txt', undefined, {}, 'linux'));
      expect(childProcessMock.spawn).toHaveBeenCalledTimes(1);
      expect(childProcessMock.spawn.mock.calls[0]?.[0]).toBe('xdg-open');
    });

    it('surfaces the fallback failure when gio errors for another reason', async () => {
      stubSpawn((command) => (command === 'xdg-open' ? { code: 'ENOENT' } : { code: 'EACCES' }));
      await expect(
        launchDetached(revealFileCommandFor('/home/u/proj/file.txt', 'linux')),
      ).rejects.toThrow(/'gio' failed: .*EACCES/s);
    });
  });
});
