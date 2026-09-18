import { defineConfig } from 'vite';
import { fileURLToPath } from 'node:url';

export default defineConfig({
  server: { host: '127.0.0.1' },
  preview: { host: '127.0.0.1' },
  resolve: { alias: { '@shared': fileURLToPath(new URL('../server/src', import.meta.url)) } },
});
