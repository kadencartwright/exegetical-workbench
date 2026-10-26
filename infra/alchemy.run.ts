import alchemy from 'alchemy';
import { Worker, D1Database, R2Bucket } from 'alchemy/cloudflare';

// Definition only: running this file may provision infrastructure. Never run for local tests.
const app = await alchemy('exegetical-workbench');
const notes = await D1Database('notes', { name: 'exegetical-notes', migrationsDir: './migrations', delete: false });
const corpus = await R2Bucket('corpus', { name: 'exegetical-corpus', delete: false });
export const worker = await Worker('api', {
  name: 'exegetical-workbench',
  entrypoint: './packages/server/src/index.ts',
  compatibilityDate: '2026-10-01',
  compatibilityFlags: ['nodejs_compat'],
  bindings: { DB: notes, CORPUS_BUCKET: corpus, APP_ENV: 'production', AUTH_MODE: 'disabled' },
});
await app.finalize();
