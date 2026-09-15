import { fileURLToPath } from 'node:url';

import web from '../../../vite.config';

export default {
  ...web,
  root: import.meta.dirname,
  server: { host: '127.0.0.1', port: 5194, strictPort: true },
  resolve: {
    ...web.resolve,
    alias: [
      ...(web.resolve?.alias ?? []),
      {
        find: /^.*composables\/useKimiWebClient(\.ts)?$/,
        replacement: fileURLToPath(new URL('./stubKimiWebClient.ts', import.meta.url)),
      },
    ],
  },
};
