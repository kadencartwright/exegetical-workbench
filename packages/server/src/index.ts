import { withPacks } from './packs';
import { d1Research, researchEnvelope } from './research';
import { d1Corpus } from './d1-corpus';
import { handleOAuth, mcpResource, requireOAuthConfig, type OAuthEnv } from './oauth';
import { authenticate } from './auth';
import { unavailableCorpus, type CorpusAdapter, type CorpusOperation } from './corpus';
import { ServiceError } from './errors';
import { handleMcp } from './mcp';
import { d1Notes, exportMarkdown, type NotesRepository } from './notes';
import { createServices } from './services';
export interface Env { DB: D1Database; CORPUS_BUCKET?: R2Bucket; ASSETS?: Fetcher; APP_ENV?: string; AUTH_MODE?: string; APP_ORIGIN?: string; GITHUB_ALLOWED_USER_ID?: string }
const json = (data: unknown, status = 200) => Response.json(data, { status, headers: { 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' } });
const routes: Record<string, [CorpusOperation, string?]> = {
  '/api/packs':['packs'], '/api/confessions':['confessions'], '/api/translations':['translations','ref'], '/api/renderings':['renderings','strong'], '/api/parallel':['parallel','ref'],
  '/api/passage': ['passage', 'ref'], '/api/token': ['token', 'id'], '/api/syntax': ['syntax', 'ref'], '/api/lexicon': ['lexicon', 'lemma'], '/api/concordance': ['concordance', 'lemma'], '/api/citations': ['citations', 'ref'], '/api/sources/search': ['sources', 'q'], '/api/source': ['source', 'id'], '/api/source-page': ['source-page', 'locator'], '/api/grammar': ['grammar'], '/api/crossreferences': ['crossreferences', 'ref'], '/api/distribution': ['distribution', 'lemma'], '/api/semantic-domain': ['semantic_domain', 'id'], '/api/coverage': ['coverage'], '/api/provenance': ['provenance', 'id'],
};
// Injectable adapters make HTTP and MCP use the identical Effect programs.
export function createApp(corpus: CorpusAdapter = unavailableCorpus, notes?: NotesRepository) {
  return { async fetch(request: Request, env: Env): Promise<Response> {
    try {
      const url = new URL(request.url); const path = url.pathname;
      const services = createServices(corpus, notes ?? d1Notes(env.DB), d1Research(env.DB));
      if (path === '/mcp') return await handleMcp(request, services, await authenticate(request, env), env.APP_ENV === 'development' && env.AUTH_MODE === 'local-development');
      if (path === '/api/health') return json({ data: { status: 'ok', auth: env.AUTH_MODE === 'github' ? 'github-oauth' : env.AUTH_MODE === 'local-development' ? 'local-development' : 'not-configured', mcp: 'read; writes require mcp:write consent (enabled in explicit local development)' }, coverage: [], provenance: [] });
      if(path==='/api/research/export'&&request.method==='GET'){
       const owner=await authenticate(request,env),notes=(await services.notes(owner)).data,links=await services.links(owner),disputes=await services.disputes(owner);
       const markdown=exportMarkdown(notes)+'\n# Note links\n\n'+links.map(l=>`${l.from} ${l.relation} ${l.to} (${l.provenanceTag})`).join('\n')+'\n\n# Disputations\n\n'+disputes.map(d=>`## ${d.question}\n\nProvenance: ${d.provenanceTag}\n\n`+d.positions.map(p=>`### ${p.title}\n\n${p.premises.map(id=>'Note '+id).join('\n')}`).join('\n\n')+'\n\nDivergences: '+JSON.stringify(d.divergences)+'\n\nTimeline: '+JSON.stringify(d.timeline)).join('\n\n');
       return new Response(markdown,{headers:{'Content-Type':'text/markdown; charset=utf-8','Content-Disposition':'attachment; filename="exegetical-research.md"','Cache-Control':'no-store'}});
      }
      if (path === '/api/note-links'  || path === '/api/disputes' || path.startsWith('/api/disputes/')) {
        const owner=await authenticate(request,env);
        const envelope=researchEnvelope;
        const id=path.startsWith('/api/disputes/')?decodeURIComponent(path.slice(14).split('/')[0]!):undefined;
        if(request.method==='GET')return json(envelope(path==='/api/note-links'?await services.links(owner,url.searchParams.get('note')??undefined):path.endsWith('/history')&&id?await services.disputeHistory(owner,id):await services.disputes(owner,id)));
        if(request.method!=='POST'&&request.method!=='PUT')throw new ServiceError(405,'method-not-allowed','Use GET, POST or PUT.');
        if(env.AUTH_MODE==='github'&&request.headers.get('Origin')!==env.APP_ORIGIN)throw new ServiceError(403,'origin-rejected','Same-origin research writes required.');
        const raw=await request.text();if(raw.length>150000)throw new ServiceError(413,'too-large','Research request too large.');
        let input:any;try{input=JSON.parse(raw);}catch{throw new ServiceError(400,'invalid-json','Expected JSON.');}
        return json(envelope(path==='/api/note-links'?await services.link(owner,input):await services.saveDispute(owner,input.dispute,id,input.revision)),id?200:201);
      }
      if (path === '/api/notes' || path.startsWith('/api/notes/')) {
        const owner = await authenticate(request, env);
        if (path === '/api/notes/export' && request.method === 'GET') return new Response(exportMarkdown((await services.notes(owner)).data), { headers: { 'Content-Type': 'text/markdown; charset=utf-8', 'Content-Disposition': 'attachment; filename="exegetical-notes.md"', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' } });
        if (path === '/api/notes' && request.method === 'GET') return json(await services.notes(owner, url.searchParams.get('anchor') ?? undefined, url.searchParams.get('q') ?? undefined));
        const id = path.startsWith('/api/notes/') ? decodeURIComponent(path.slice('/api/notes/'.length)) : undefined;
        if (id && request.method === 'GET') return json(await services.note(owner, id));
        if ((!id && request.method === 'POST') || (id && request.method === 'PUT')) {
          if (env.AUTH_MODE === 'github' && request.headers.get('Origin') !== env.APP_ORIGIN) throw new ServiceError(403, 'origin-rejected', 'Same-origin note writes required.');
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
// All production corpus reads and browser assets are private, alongside notes and MCP.
export default { async fetch(request: Request, env: OAuthEnv, ctx: ExecutionContext): Promise<Response> {
  try {
    const url = new URL(request.url); const path = url.pathname;
    const authResponse = await handleOAuth(request, env, ctx); if (authResponse) return authResponse;
    const app = createApp(withPacks(env.DB,d1Corpus(env.DB, env.CORPUS_BUCKET)));
    if (path === '/mcp' || path.startsWith('/.well-known/oauth-protected-resource')) {
      if (env.APP_ENV === 'development' && env.AUTH_MODE === 'local-development') return app.fetch(request, env);
      requireOAuthConfig(request, env);
      return mcpResource(env, (r,e,owner,scopes) => handleMcp(r, createServices(withPacks(e.DB,d1Corpus(e.DB,e.CORPUS_BUCKET)), d1Notes(e.DB), d1Research(e.DB)), owner, scopes.includes('mcp:write'))).fetch(request, env, ctx);
    }
    if (path !== '/api/health') {
      try { await authenticate(request, env); }
      catch (error) { if (error instanceof ServiceError && error.status === 401 && !path.startsWith('/api/')) return Response.redirect(`${env.APP_ORIGIN}/auth/login?returnTo=${encodeURIComponent(path+url.search)}`,302); throw error; }
    }
    if (path.startsWith('/api/')) return app.fetch(request, env);
    if (env.ASSETS) return env.ASSETS.fetch(request);
    return json({ error: {code:'assets-not-built'} },503);
  } catch (error) { return error instanceof ServiceError ? json({error:{code:error.code,message:error.message}},error.status) : json({error:{code:'service-unavailable'}},503); }
} };
