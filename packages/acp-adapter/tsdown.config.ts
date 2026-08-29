import { defineConfig } from 'tsdown';

export default defineConfig({
  entry: ['./src/index.ts'],
  format: ['esm'],
  dts: true,
  outDir: 'dist',
  clean: true,
  deps: {
    neverBundle: [
      '@agentclientprotocol/sdk',
      '@moonshot-ai/agent-core',
      '@bhjia-phys/hakimi-sdk',
      '@moonshot-ai/kosong',
      '@moonshot-ai/kaos',
    ],
  },
});
