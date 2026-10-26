import { afterAll, describe, expect, it } from 'vitest';
import { DatabaseSync } from 'node:sqlite';
import { readdirSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { d1Corpus } from '../src/d1-corpus';
import { createApp, type Env } from '../src/index';
import type { CorpusOperation } from '../src/corpus';
const directory=resolve('.wrangler/state/v3/d1/miniflare-D1DatabaseObject');
const path=process.env.EW_FULL_CORPUS_DB??join(directory,readdirSync(directory).find(n=>n.endsWith('.sqlite')&&n!=='metadata.sqlite')!);
const sqlite=new DatabaseSync(path,{readOnly:true});
const db={prepare(sql:string){let values:unknown[]=[];const statement={bind(...args:unknown[]){values=args;return statement;},async first(){return sqlite.prepare(sql).get(...values as [])??null;},async all(){return {results:sqlite.prepare(sql).all(...values as [])};}};return statement;}} as unknown as D1Database;
const corpus=d1Corpus(db),app=createApp(corpus),env:Env={DB:db,APP_ENV:'development',AUTH_MODE:'local-development'};
afterAll(()=>sqlite.close());
const query=async(operation:CorpusOperation,p:Record<string,string>={})=>(await corpus.query(operation,p)).data as any;
const http=async(path:string)=>{const r=await app.fetch(new Request('http://localhost:8787'+path),env);expect(r.status).toBe(200);return await r.json() as any;};
describe('full imported corpus over actual indexed D1, HTTP and MCP',()=>{
 it('serves complete work coverage, original-witness links and cross-verse referents',async()=>{
  const coverage=await query('coverage');
  expect(coverage.filter((c:any)=>c.inventory)).toHaveLength(110);
  expect(coverage.filter((c:any)=>c.inventory?.state==='in-progress')).toHaveLength(28);
  const citation=(await query('citations',{ref:'Matt.28.19'}))[0];
  const page=await query('source-page',{locator:citation.locator});
  expect(page.originalUrl).toMatch(/\/tree\/[a-f0-9]+\/completed\//);
  expect((await http('/api/source?id='+encodeURIComponent(citation.sourceId))).data.originalUrl).toBe(page.originalUrl);
  let row:{id:string;ref:string;target_ref:string}|undefined;
  for(const item of sqlite.prepare("SELECT json FROM corpus_records WHERE kind='token' AND json_extract(json,'$.referents[0]') IS NOT NULL LIMIT 500").all()) {
    const token=JSON.parse(String(item.json));
    for(const upstream of token.referents??[]){const match=sqlite.prepare("SELECT json_extract(json,'$.ref') AS ref FROM corpus_records WHERE kind='token' AND json_extract(json,'$.upstreamId')=?").get(upstream);if(match&&match.ref!==token.ref){row={id:token.id,ref:token.ref,target_ref:String(match.ref)};break;}}
    if(row)break;
  }
  expect(row).toBeTruthy();
  const token=await query('token',{id:String(row!.id)});
  expect(token.relatedTokens.some((t:any)=>t.id.split(':')[1]===row!.target_ref)).toBe(true);
 });
 it('aligns differing NT verse groups without renumbering source tokens',async()=>{
  const p=await query('passage',{ref:'2Cor.13.13'});
  expect(p.editions.find((e:any)=>e.id==='bsb').sourceRefs).toEqual(['2Cor.13.14']);
  expect(p.editions.find((e:any)=>e.id==='bsb').text).toContain('grace');
  const q=await query('passage',{ref:'2Cor.13.14',refEdition:'bsb'});
  expect(q.editions.find((e:any)=>e.id==='sblgnt').tokens[0].id).toMatch(/^sblgnt:2Cor\.13\.13:/);
  const acts=await query('passage',{ref:'Acts.19.40'});
  expect(acts.editions.find((e:any)=>e.id==='bsb').sourceRefs).toEqual(['Acts.19.40','Acts.19.41']);
 });
 it('contains full imported counts and searches the NT beyond the original sample',async()=>{
  const counts=Object.fromEntries(sqlite.prepare('SELECT kind,count(*) AS n FROM corpus_records GROUP BY kind').all().map(r=>[r.kind,r.n]));
  expect(counts).toMatchObject({passage:7959,syntax:7939,lexicon:17188,crossreference:344799,source:311,page:2347,citation:5318,inventory:110});
  const empty=sqlite.prepare("SELECT r.id FROM corpus_records r,json_each(r.json,'$.editions') e WHERE r.kind='passage' AND json_extract(e.value,'$.textStatus')='empty-upstream'").all();expect(empty).toHaveLength(16);
  expect((await query('passage',{ref:String(empty[0]!.id)})).editions.some((e:any)=>e.id==='bsb'&&e.textStatus==='empty-upstream'&&e.text==='')).toBe(true);
  expect((await query('passage',{ref:'John 3:16'})).editions.map((e:any)=>e.id)).toEqual(expect.arrayContaining(['sblgnt','bsb']));
  expect((await query('passage',{ref:'Rev 22:21'})).editions.length).toBeGreaterThan(0);
  expect((await query('passage',{ref:'Rom 8:28-30'})).passages).toHaveLength(3);
  expect((await query('syntax',{ref:'Rom 8:28-30'}))).toHaveLength(3);
  expect((await http('/api/passage?ref=John.3.16')).provenance.length).toBeGreaterThan(1);
 });
 it('preserves Matthew 28:19 sourced morphology, referent comparison and real grammar links',async()=>{
  const token=await query('token',{id:'sblgnt:Matt.28.19:8'});
  expect(token.text.normalize('NFD').replace(/\p{M}/gu,'')).toBe('αυτους');expect(token.lemma).toBe('ἑαυτοῦ');expect(token.morphology.gender).toBe('masculine');
  expect(token.agreement.some((a:any)=>a.observation.includes('neuter'))).toBe(true);
  expect(token.grammar.some((g:any)=>/Robertson/.test(g.title+' '+g.provenance.edition))).toBe(true);
  expect(token.grammar.every((g:any)=>g.url.startsWith('https://')&&g.locator&&g.canEstablish&&g.cannotEstablish)).toBe(true);
 });
 it('returns imported standalone lexicons, full concordance counts, crossreferences and reception locators',async()=>{
  const entries=await query('lexicon',{lemma:'αὐτός'});expect(entries.length).toBeGreaterThan(1);expect(new Set(entries.map((e:any)=>e.sourceId)).size).toBeGreaterThan(1);
  expect((await query('lexicon',{lemma:'G846'})).length).toBeGreaterThan(0);
  const matches=await query('concordance',{lemma:'G846',limit:'10',offset:'10'});expect(matches).toHaveLength(10);expect(matches[0]).toHaveProperty('token.provenance');
  const all=await query('distribution',{lemma:'G846'});expect(all.total).toBeGreaterThan(100);expect(all.books.length).toBeGreaterThan(10);
  const filtered=await query('distribution',{lemma:'G846',book:'Matthew'});expect(filtered.books).toHaveLength(1);expect(filtered.books[0].book).toBe('Matt');expect(filtered.total).toBeLessThan(all.total);
  expect((await query('crossreferences',{ref:'Matt.28.19'})).length).toBeGreaterThan(10);
  const citations=await query('citations',{ref:'Matt.28.19'});expect(citations.length).toBeGreaterThanOrEqual(14);
  const page=await query('source-page',{locator:citations[0].locator});expect(page.text.length).toBeGreaterThan(20);expect(page.provenance.reviewStatus).toBe('AI-assisted, unreviewed');
  expect((await query('sources',{q:'baptism'})).length).toBeGreaterThan(0);
  expect((await query('provenance',{resource:'sblgnt'})).length).toBeGreaterThan(7900);
  const missing=await corpus.query('lexicon',{lemma:'no-such-lemma-xyz'});expect(missing.data).toEqual([]);expect(missing.coverage.some(c=>c.source==='lexicon'&&c.status==='not-loaded')).toBe(false);
 });
 it('exposes the same evidence chain using real MCP tool calls with read-only annotations',async()=>{
  const rpc=async(name:string,args:Record<string,string>)=>{const r=await app.fetch(new Request('http://localhost:8787/mcp',{method:'POST',headers:{'Content-Type':'application/json',Accept:'application/json, text/event-stream'},body:JSON.stringify({jsonrpc:'2.0',id:1,method:'tools/call',params:{name,arguments:args}})}),env);expect(r.status).toBe(200);const result=await r.json() as any;expect(result.result.isError).not.toBe(true);return JSON.parse(result.result.content[0].text);};
  for(const [name,args] of [['get_token',{id:'sblgnt:Matt.28.19:8'}],['lexicon_lookup',{lemma:'αὐτός'}],['citations_of',{ref:'Matt.28.19'}],['crossreferences',{ref:'Matt.28.19'}],['distribution',{lemma:'G846'}],['get_syntax',{ref:'Matt.28.19'}]] as [string,Record<string,string>][]) {const response=await rpc(name,args);expect(response.data).toBeTruthy();expect(response.coverage.length).toBeGreaterThan(0);if(name!=='distribution')expect(response.provenance.length).toBeGreaterThan(0);}
 });
});
