import { researchEnvelope } from './research';
import { noteInputSchema, noteLinkSchema, disputeInputSchema } from '@exegetical/shared';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { WebStandardStreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js';
import { z } from 'zod';
import type { Services } from './services';
import type { CorpusOperation } from './corpus';
const text = (max = 512) => z.string().trim().min(1).max(max);
export function createMcpServer(services: Services, owner: string, canWrite = false) {
  const server = new McpServer({ name: 'exegetical-workbench', version: '0.0.0' });
  const register = (name: string, description: string, inputSchema: Record<string, z.ZodType>, execute: (args: Record<string, string>) => Promise<unknown>) => {
    server.registerTool(name, { description, inputSchema, annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false } }, async args => {
      try { const result = await execute(args as Record<string, string>); return { content: [{ type: 'text' as const, text: JSON.stringify(result) }] }; }
      catch { return { isError: true, content: [{ type: 'text' as const, text: 'The requested resource is unavailable or does not exist.' }] }; }
    });
  };
  const corpusTool = (name: string, operation: CorpusOperation, schema: Record<string, z.ZodType>) => register(name, 'Read corpus evidence, preserving coverage and provenance. Missing data is not evidence of silence.', schema, args => services.corpus(operation, args));
  corpusTool('confessions','confessions',{id:text().optional()});
  corpusTool('translation_alignment','translations',{ref:text()});
  corpusTool('translation_renderings','renderings',{strong:text()});
  corpusTool('hebrew_parallel','parallel',{ref:text()});
  corpusTool('get_passage', 'passage', { ref: text(), editions: text().optional(), refEdition: z.enum(['sblgnt','bsb']).optional() });
  corpusTool('get_token', 'token', { id: text() });
  corpusTool('get_syntax', 'syntax', { ref: text() });
  corpusTool('lexicon_lookup', 'lexicon', { lemma: text(), sources: text().optional() });
  corpusTool('concordance', 'concordance', { lemma: text(), book: text().optional(), edition: text().optional(), form: text().optional(), offset: z.coerce.string().optional(), limit: z.coerce.string().optional() });
  corpusTool('crossreferences', 'crossreferences', { ref: text() });
  corpusTool('distribution', 'distribution', { lemma: text(), book: text().optional(), edition: text().optional(), form: text().optional() });
  corpusTool('grammar', 'grammar', { category: text().optional(), id: text().optional() });
  corpusTool('semantic_domain', 'semantic_domain', { id: text() });
  corpusTool('citations_of', 'citations', { ref: text() });
  corpusTool('search_sources', 'sources', { query: text(), author: text().optional(), dates: text().optional() });
  corpusTool('get_source_page', 'source-page', { locator: text(1024) });
  corpusTool('coverage', 'coverage', { source: text().optional() });
  corpusTool('provenance', 'provenance', { resource: text() });
  register('search_notes', 'Search only the authenticated user’s private notes.', { q: text().optional(), anchor: text().optional() }, args => services.notes(owner, args.anchor, args.q));
  register('get_note', 'Read only the authenticated user’s private note.', { id: text() }, args => services.note(owner, args.id));
  register('note_links','Read links among the authenticated user’s notes.',{note:text().optional()},async args=>researchEnvelope(await services.links(owner,args.note)));
  register('disputes','Read the authenticated user’s questions, positions and divergence annotations.',{id:text().optional()},async args=>researchEnvelope(await services.disputes(owner,args.id)));
  if(canWrite){
    const write=(name:string,schema:z.ZodType,execute:(input:any)=>Promise<unknown>)=>server.registerTool(name,{description:'Write private research. Every agent write is permanently marked agent-generated until human review.',inputSchema:{input:schema},annotations:{readOnlyHint:false,destructiveHint:false,idempotentHint:false,openWorldHint:false}},async({input})=>{try{return {content:[{type:'text' as const,text:JSON.stringify(await execute(input))}]};}catch{return {isError:true,content:[{type:'text' as const,text:'Invalid input, missing owned evidence, revision conflict or storage unavailable.'}]};}});
    write('create_note',noteInputSchema,input=>services.createAgentNote(owner,input));
    write('link_notes',noteLinkSchema,async input=>researchEnvelope(await services.link(owner,input,true)));
    write('create_dispute',disputeInputSchema,async input=>researchEnvelope(await services.saveDispute(owner,input,undefined,undefined,true)));
  }
  return server;
}
export async function handleMcp(request: Request, services: Services, owner: string, canWrite = false): Promise<Response> {
  const server = createMcpServer(services, owner, canWrite);
  const transport = new WebStandardStreamableHTTPServerTransport({ sessionIdGenerator: undefined, enableJsonResponse: true });
  await server.connect(transport);
  try {
    const response = await transport.handleRequest(request);
    response.headers.set('Cache-Control', 'no-store');
    response.headers.set('X-Content-Type-Options', 'nosniff');
    return response;
  }
  finally { await server.close(); }
}
