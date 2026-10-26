import { bundledCorpus } from './corpus-adapter';
import { authenticate } from './auth';
import { unavailableCorpus, type CorpusAdapter, type CorpusOperation } from './corpus';
import { ServiceError } from './errors';
import { handleMcp } from './mcp';
import { d1Notes, exportMarkdown, type NotesRepository } from './notes';
import { createServices } from './services';
export interface Env { DB: D1Database; CORPUS_BUCKET?: R2Bucket; APP_ENV?: string; AUTH_MODE?: string; APP_ORIGIN?: string }
const json = (data: unknown, status = 200) => Response.json(data, { status, headers: { 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' } });
const routes: Record<string, [CorpusOperation, string?]> = {
  '/api/passage': ['passage', 'ref'], '/api/token': ['token', 'id'], '/api/syntax': ['syntax', 'ref'], '/api/lexicon': ['lexicon', 'lemma'], '/api/concordance': ['concordance', 'lemma'], '/api/citations': ['citations', 'ref'], '/api/sources/search': ['sources', 'q'], '/api/source-page': ['source-page', 'locator'], '/api/coverage': ['coverage'], '/api/provenance': ['provenance', 'id'],
};
// Injectable adapters make HTTP and MCP use the identical Effect programs.
export function createApp(corpus: CorpusAdapter = unavailableCorpus, notes?: NotesRepository) {
  return { async fetch(request: Request, env: Env): Promise<Response> {
    try {
      const url = new URL(request.url); const path = url.pathname;
      const services = createServices(corpus, notes ?? d1Notes(env.DB));
      if (path === '/mcp') return await handleMcp(request, services, authenticate(request, env));
      if (path === '/api/health') return json({ data: { status: 'ok', auth: 'production-oauth-incomplete', mcp: 'read-only' }, coverage: [], provenance: [] });
      if (path === '/api/notes' || path.startsWith('/api/notes/')) {
        const owner = authenticate(request, env);
        if (path === '/api/notes/export' && request.method === 'GET') return new Response(exportMarkdown((await services.notes(owner)).data), { headers: { 'Content-Type': 'text/markdown; charset=utf-8', 'Content-Disposition': 'attachment; filename="exegetical-notes.md"', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' } });
        if (path === '/api/notes' && request.method === 'GET') return json(await services.notes(owner, url.searchParams.get('anchor') ?? undefined, url.searchParams.get('q') ?? undefined));
        const id = path.startsWith('/api/notes/') ? decodeURIComponent(path.slice('/api/notes/'.length)) : undefined;
        if (id && request.method === 'GET') return json(await services.note(owner, id));
        if ((!id && request.method === 'POST') || (id && request.method === 'PUT')) {
          if (Number(request.headers.get('Content-Length') ?? 0) > 150_000) throw new ServiceError(413, 'too-large', 'Note request is too large.');
          const body = await request.text();
          if (body.length > 150_000) throw new ServiceError(413, 'too-large', 'Note request is too large.');
          let input: unknown; try { input = JSON.parse(body); } catch { throw new ServiceError(400, 'invalid-json', 'Expected JSON.'); }
          return json(await services.save(owner, input, id), id ? 200 : 201);
        }
        return json({ error: { code: 'method-not-allowed' } }, 405);
      }
      const route = routes[path];
      if (route) {
        if (request.method !== 'GET') return json({ error: { code: 'method-not-allowed' } }, 405);
        if (route[1] && !url.searchParams.get(route[1])?.trim()) throw new ServiceError(400, 'missing-parameter', `Required query parameter: ${route[1]}`);
        return json(await services.corpus(route[0], Object.fromEntries(url.searchParams)));
      }
      return json({ error: { code: 'not-found' } }, 404);
    } catch (error) {
      const actual = error;
      return actual instanceof ServiceError ? json({ error: { code: actual.code, message: actual.message } }, actual.status) : json({ error: { code: 'internal-error', message: 'Request failed.' } }, 500);
    }
  } };
}
export default createApp(bundledCorpus);
