import { defineConfig } from 'vitest/config';
import { fileURLToPath } from 'node:url';
export default defineConfig({ test: { server: { deps: { inline: ['@cloudflare/workers-oauth-provider'] } } }, resolve: { alias: { 'cloudflare:workers': fileURLToPath(new URL('./test/worker-entrypoint.ts', import.meta.url)) } } });
