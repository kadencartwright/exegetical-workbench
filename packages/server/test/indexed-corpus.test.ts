import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { readFileSync, mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';
import { createInterface } from 'node:readline';
import { createReadStream } from 'node:fs';
import { corpusRecords, type Corpus } from '@exegetical/corpus';
import { corpusAdapter } from '../src/corpus-adapter';
import { d1Corpus } from '../src/d1-corpus';
import { database } from './helpers';
let directory:string,sqlite:ReturnType<typeof database>['sqlite'],db:D1Database;
beforeEach(()=>{directory=mkdtempSync(join(tmpdir(),'ew-index-'));const result=database();sqlite=result.sqlite;db=result.db;});
afterEach(()=>{sqlite.close();rmSync(directory,{recursive:true,force:true});});
async function load(corpus:Corpus,ndjson=false) {
 const input=join(directory,ndjson?'corpus.ndjson':'corpus.json'),sql=join(directory,'corpus.sql');
 writeFileSync(input,ndjson?[...corpusRecords(corpus)].map(r=>JSON.stringify(r)).join('\n'):JSON.stringify(corpus));
 const catalog=join(directory,'catalog.json');writeFileSync(catalog,JSON.stringify({schemaVersion:1,coverage:corpus.coverage,manifests:corpus.manifests,importMode:corpus.importMode}));
 execFileSync(process.execPath,['scripts/index-corpus.mjs',input,sql,...(ndjson?[catalog]:[])],{cwd:new URL('..',import.meta.url),encoding:'utf8'});
 for await(const line of createInterface({input:createReadStream(sql),crlfDelay:Infinity}))if(line&&!line.startsWith('--'))sqlite.exec(line);
 return JSON.parse(readFileSync(sql+'.report.json','utf8'));
}
describe('indexed D1 corpus selection and streamed offline import',()=>{
 it('preserves passage, token, syntax, citation and concordance evidence with shared query semantics',async()=>{
  // Use the small checked-in seed input, even when a full imported snapshot exceeds Node string limits.
  execFileSync(process.execPath,['--experimental-strip-types','src/cli.ts','build','--sample','--out',join(directory,'seed.json')],{cwd:new URL('../../corpus/',import.meta.url),encoding:'utf8'});
  const corpus=JSON.parse(readFileSync(join(directory,'seed.json'),'utf8')) as Corpus;
  await load(corpus,true);const indexed=d1Corpus(db),pure=corpusAdapter(corpus);
  const token=corpus.passages[0]!.editions.flatMap(e=>e.tokens).find(t=>t.lemma)!;
  const cases:[any,Record<string,string>][]=[['passage',{ref:'Matthew 28:19'}],['passage',{ref:'Matt 28:18-20'}],['syntax',{ref:'Matt.28.19'}],['token',{id:token.id}],['citations',{ref:'Matt.28.19'}],['concordance',{lemma:token.lemma!}],['distribution',{lemma:token.lemma!}],['coverage',{}]];
  for(const [operation,params] of cases)expect((await indexed.query(operation,params)).data,operation).toEqual((await pure.query(operation,params)).data);
  await expect(indexed.query('passage',{ref:'not-a-ref'})).rejects.toMatchObject({code:'invalid-reference',status:400});
  const plan=sqlite.prepare("EXPLAIN QUERY PLAN SELECT json FROM corpus_records WHERE kind='passage' AND json_extract(json,'$.ref')='Matt.28.19'").all();expect(JSON.stringify(plan)).toContain('INDEX');
 });
 it('streams NDJSON metadata and reassembles records exceeding SQL statement length without corrupting Unicode',async()=>{
  const provenance={source:'test-fixture',edition:'protocol-fixture',version:'1',license:'CC0',locator:'fixture',reviewStatus:'upstream' as const,deepLink:'/fixture',upstreamUrl:'https://example.invalid'};
  const corpus:Corpus={schemaVersion:1,passages:[],sources:[{id:'test-fixture',title:'Synthetic storage test',path:'fixture',originalUrl:'https://example.invalid',provenance,coverage:{sourceId:'test-fixture',status:'loaded',scope:'Test only',limitations:[]}}],pages:[{id:'fixture-page',sourceId:'test-fixture',locator:{id:'fixture-page',kind:'unpaginated',label:'Synthetic test'},text:"Unicode preservation 😀 ' ".repeat(12000),startOffset:0,provenance}],citations:[],coverage:[{sourceId:'test-fixture',status:'loaded',scope:'Test only',limitations:[]}],manifests:[]};
  const report=await load(corpus,true);expect(report.maxStatementBytes).toBeLessThan(100000);
  const page=await d1Corpus(db).query('source-page',{locator:'fixture-page'});expect(page.data).toMatchObject(corpus.pages[0]);
  expect((await d1Corpus(db).query('sources',{q:'Unicode preservation'})).data).toHaveLength(1);
  expect(sqlite.prepare('SELECT count(*) AS n FROM corpus_import_chunks').get()?.n).toBe(0);
 });
});
