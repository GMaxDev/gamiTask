import { defineConfig } from 'vite';
import { fileURLToPath } from 'node:url';

// Two pages: `/` is the landing (index.html), `/app/` the café itself (app/index.html).
export default defineConfig({
  server: { host: '127.0.0.1' },
  preview: { host: '127.0.0.1' },
  resolve: { alias: { '@shared': fileURLToPath(new URL('../server/src', import.meta.url)) } },
  build: { rollupOptions: { input: { landing: fileURLToPath(new URL('index.html', import.meta.url)), app: fileURLToPath(new URL('app/index.html', import.meta.url)) } } },
});
