import { defineConfig } from 'vite'

export default defineConfig({
  server: { strictPort: true, proxy: { '/api': 'http://127.0.0.1:8787' } },
  build: { outDir: 'dist', target: 'es2022' },
})
