import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { defineConfig } from 'vitest/config';

const appRoot = import.meta.dirname;

export default defineConfig({
  resolve: {
    alias: [
      { find: '@', replacement: resolve(appRoot, 'src') },
      {
        find: '@moonshot-ai/agent-core/session/store',
        replacement: fileURLToPath(
          new URL('../../packages/agent-core/src/session/store/index.ts', import.meta.url),
        ),
      },
      {
        find: /^@moonshot-ai\/agent-core$/,
        replacement: fileURLToPath(
          new URL('../../packages/agent-core/src/index.ts', import.meta.url),
        ),
      },
    ],
  },
  test: {
    name: 'cli',
    env: {
      KIMI_LOG_LEVEL: 'off',
    },
    include: ['test/**/*.test.ts', 'test/**/*.test.tsx'],
  },
});
