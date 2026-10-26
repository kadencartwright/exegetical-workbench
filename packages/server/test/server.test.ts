import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { DatabaseSync } from 'node:sqlite';
import { readFileSync } from 'node:fs';
import { createApp, type Env } from '../src/index';
import { d1Notes } from '../src/notes';
import { createServices } from '../src/services';
import { unavailableCorpus } from '../src/corpus';
import { authenticate } from '../src/auth';

// Execute the exact D1 SQL against SQLite, rather than mocking ownership predicates or FTS.
function sqliteD1(sqlite: DatabaseSync): D1Database {
  return { prepare(sql: string) {
    let values: unknown[] = [];
    const statement = {
      bind(...args: unknown[]) { values = args; return statement; },
      async first() { return sqlite.prepare(sql).get(...values as []) ?? null; },
      async all() { return { results: sqlite.prepare(sql).all(...values as []) }; },
      async run() { return { meta: { changes: Number(sqlite.prepare(sql).run(...values as []).changes) } }; },
    };
    return statement;
  } } as unknown as D1Database;
}
let sqlite: DatabaseSync;
let env: Env;
const input = { anchor: { type: 'token', id: 'Matt.28.19.autous' }, body: 'Agreement warrants closer study.', tags: ['grammar'], provenanceTag: 'my-inference' };
const request = (path: string, init?: RequestInit) => new Request(`http://localhost:8787${path}`, init);
beforeEach(() => {
  sqlite = new DatabaseSync(':memory:');
  for(const file of ['0001_notes.sql','0005_research.sql'])sqlite.exec(readFileSync(new URL('../../../migrations/'+file, import.meta.url), 'utf8'));
  env = { DB: sqliteD1(sqlite), APP_ENV: 'development', AUTH_MODE: 'local-development' };
});
afterEach(() => sqlite.close());

describe('authentication boundary', () => {
  it('fails closed in production even with a forged bearer, cookie or user header', async () => {
    const app = createApp();
    for (const path of ['/api/notes', '/api/notes/export', '/mcp']) {
      const response = await app.fetch(request(path, { headers: { Authorization: 'Bearer pretend', Cookie: 'session=pretend', 'X-User-ID': 'owner' } }), { ...env, APP_ENV: 'production' });
      expect(response.status).toBe(503);
      expect(await response.text()).toContain('authentication-not-configured');
    }
  });
  it('requires both explicit local flags and loopback host', async () => {
    await expect(authenticate(new Request('https://example.com/api/notes'), env)).rejects.toThrow();
    await expect(authenticate(request('/api/notes'), { APP_ENV: 'development' })).rejects.toThrow();
    expect(await authenticate(request('/api/notes'), env)).toBe('local-development-user');
  });
  it('rejects cross-origin private requests before reading or writing notes', async () => {
    const response = await createApp().fetch(request('/api/notes', { headers: { Origin: 'https://attacker.example' } }), env);
    expect(response.status).toBe(403);
  });
});

describe('notes over the shared Effect service and real SQL adapter', () => {
  it('enforces ownership for list, get and update including unknown ids', async () => {
    const services = createServices(unavailableCorpus, d1Notes(env.DB));
    const note = (await services.save('alice', input)).data;
    expect((await services.notes('bob')).data).toEqual([]);
    await expect(services.note('bob', note.id)).rejects.toMatchObject({ status: 404 });
    await expect(services.save('bob', { ...input, body: 'stolen' }, note.id)).rejects.toMatchObject({ status: 404 });
    expect((await services.note('alice', note.id)).data.body).toBe(input.body);
    expect((await services.notes('alice', input.anchor.id, 'Agreement')).data).toHaveLength(1);
    expect((await services.notes('alice', 'other-anchor')).data).toHaveLength(0);
  });
  it('validates anchor and complete quotation provenance without accepting unknown fields', async () => {
    const app = createApp();
    const post = (body: unknown) => app.fetch(request('/api/notes', { method: 'POST', body: JSON.stringify(body) }), env);
    for (const bad of [ { ...input, anchor: { type: 'made-up', id: 'x' } }, { ...input, provenanceTag: 'quoted' }, { ...input, provenanceTag: 'paraphrased', sourceLocator: { locator: 'p. 1' } }, { ...input, owner: 'another-user' }, { ...input, provenanceTag: 'agent-generated' } ]) {
      expect((await post(bad)).status).toBe(400);
    }
    const sourceLocator = { source: 'test-fixture', edition: 'test', version: '1', license: 'CC0-1.0', locator: 'p. 1', reviewStatus: 'fixture' };
    expect((await post({ ...input, provenanceTag: 'quoted', sourceLocator })).status).toBe(201);
  });
  it('updates FTS and exports the user’s notes with anchors and source metadata', async () => {
    const services = createServices(unavailableCorpus, d1Notes(env.DB));
    const note = (await services.save('local-development-user', input)).data;
    await services.save('local-development-user', { ...input, body: 'Updated inference' }, note.id);
    expect((await services.notes('local-development-user', undefined, 'Agreement')).data).toHaveLength(0);
    expect((await services.notes('local-development-user', undefined, 'Updated')).data).toHaveLength(1);
    await services.save('someone-else', { ...input, body: 'secret-other-user' });
    const response = await createApp().fetch(request('/api/notes/export'), env);
    expect(response.headers.get('Content-Type')).toContain('text/markdown');
    const markdown = await response.text();
    expect(markdown).toContain(input.anchor.id);
    expect(markdown).toContain('Updated inference');
    expect(markdown).not.toContain('secret-other-user');
  });
  it('returns validation errors and missing coverage honestly through HTTP', async () => {
    const app = createApp();
    expect((await app.fetch(request('/api/passage'), env)).status).toBe(400);
    const response = await app.fetch(request('/api/passage?ref=Matt.28.19'), env);
    const result = await response.json() as any;
    expect(result.data.editions).toEqual([]);
    expect(result.coverage[0].status).toBe('not-loaded');
    expect((await app.fetch(request('/api/notes/missing'), env)).status).toBe(404);
  });
});

describe('MCP Streamable HTTP', () => {
  async function rpc(method: string, params: unknown = {}, id = 1) {
    const response = await createApp().fetch(request('/mcp', { method: 'POST', headers: { 'Content-Type': 'application/json', Accept: 'application/json, text/event-stream', 'MCP-Protocol-Version': '2025-03-26' }, body: JSON.stringify({ jsonrpc: '2.0', id, method, params }) }), env);
    expect(response.status).toBe(200);
    return response.json() as Promise<any>;
  }
  it('initializes using the supported SDK wire protocol', async () => {
    const result = await rpc('initialize', { protocolVersion: '2025-03-26', capabilities: {}, clientInfo: { name: 'test', version: '1' } });
    expect(result.result.serverInfo.name).toBe('exegetical-workbench');
    expect(result.result.capabilities.tools).toBeDefined();
  });
  it('advertises explicit agent writes in local development and enforces provenance', async () => {
    const result = await rpc('tools/list');
    const tools = result.result.tools;
    expect(tools.map((t: any) => t.name)).toEqual(expect.arrayContaining(['get_passage', 'get_note', 'search_notes', 'coverage', 'provenance']));
    expect(tools.find((t:any)=>t.name==='create_note').annotations.readOnlyHint).toBe(false);
    expect(tools.some((t:any)=>t.name==='delete_note')).toBe(false);
    const attempt = await rpc('tools/call', { name: 'create_note', arguments: {input} });
    expect(attempt.result?.isError).toBeUndefined();
    expect((await createServices(unavailableCorpus, d1Notes(env.DB)).notes('local-development-user')).data[0].provenanceTag).toBe('agent-generated');
  });
  it('carries coverage and restricts note results to the authenticated principal', async () => {
    const services = createServices(unavailableCorpus, d1Notes(env.DB));
    await services.save('another-user', { ...input, body: 'private secret' });
    const result = await rpc('tools/call', { name: 'search_notes', arguments: {} });
    expect(JSON.parse(result.result.content[0].text).data).toEqual([]);
    const corpus = await rpc('tools/call', { name: 'get_passage', arguments: { ref: 'Matt.28.19' } });
    expect(JSON.parse(corpus.result.content[0].text).coverage[0].status).toBe('not-loaded');
  });
});
