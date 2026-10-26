import alchemy from 'alchemy';
import { Worker, D1Database, R2Bucket, KVNamespace, Assets } from 'alchemy/cloudflare';

// Definition only. Do not run without deployment authorization. Fail before any provisioning if credentials are absent.
const origin = process.env.APP_ORIGIN;
const clientId = process.env.GITHUB_CLIENT_ID;
const clientSecret = process.env.GITHUB_CLIENT_SECRET;
if (!origin || new URL(origin).origin !== origin || !origin.startsWith('https://') || !clientId || !clientSecret) throw new Error('Set canonical HTTPS APP_ORIGIN, GITHUB_CLIENT_ID and GITHUB_CLIENT_SECRET privately before running Alchemy.');
const app = await alchemy('exegetical-workbench');
const notes = await D1Database('notes', { name: 'exegetical-notes', migrationsDir: './migrations', delete: false });
const corpus = await R2Bucket('corpus', { name: 'exegetical-corpus', delete: false });
const oauth = await KVNamespace('oauth', { title: 'exegetical-oauth', delete: false });
const assets = await Assets({ path: './packages/web/dist' });
export const worker = await Worker('api', {
  name: 'exegetical-workbench',
  entrypoint: './packages/server/src/index.ts',
  compatibilityDate: '2026-10-01',
  compatibilityFlags: ['nodejs_compat'],
  assets: { run_worker_first: true, not_found_handling: 'single-page-application' },
  bindings: { DB: notes, CORPUS_BUCKET: corpus, OAUTH_KV: oauth, ASSETS: assets, APP_ENV: 'production', AUTH_MODE: 'github', APP_ORIGIN: origin, GITHUB_CLIENT_ID: clientId, GITHUB_CLIENT_SECRET: alchemy.secret(clientSecret), ...(process.env.GITHUB_ALLOWED_USER_ID ? {GITHUB_ALLOWED_USER_ID:process.env.GITHUB_ALLOWED_USER_ID} : {}) },
});
await app.finalize();
