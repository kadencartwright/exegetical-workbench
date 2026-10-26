import { readFile, mkdir, open, rename, stat } from 'node:fs/promises';
import { createReadStream } from 'node:fs';
import { createInterface } from 'node:readline';
import { resolve, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { lexicalKey, strongKey, referenceOrder, corpusRecords } from '@exegetical/corpus';
// Offline, streamed preparation. Never deploys or changes a remote database.
const generated=fileURLToPath(new URL('../../../data/generated/',import.meta.url));
let input=process.argv[2]?resolve(process.argv[2]):join(generated,'storage/corpus.ndjson');
if(!process.argv[2]) { try { await stat(join(generated,'storage/export-report.json')); } catch { input=join(generated,'corpus.json'); } }
const out=process.argv[3]?resolve(process.argv[3]):join(generated,'corpus-index.sql');
await mkdir(dirname(out),{recursive:true});
const file=await open(out+'.tmp','w');
await mkdir(out+'.parts',{recursive:true});let partNumber=0,partBytes=0;const parts=[];let part;
async function partWrite(text){if(!part||partBytes+Buffer.byteLength(text)>16_000_000){if(part)await part.close();const path=join(out+'.parts',String(partNumber++).padStart(4,'0')+'.sql');parts.push(path);part=await open(path,'w');partBytes=0;}await part.write(text);partBytes+=Buffer.byteLength(text);}
let pending='',count=0,maxStatementBytes=0,counts={}; const metadataIds=new Set();
async function sql(statement) {
 const bytes=Buffer.byteLength(statement);if(bytes>=100000)throw new Error('Generated SQL exceeds the D1 statement limit');maxStatementBytes=Math.max(maxStatementBytes,bytes);
 pending+=statement+'\n';if(pending.length>262144){await file.write(pending);await partWrite(pending);pending='';}
}
const quote = value => "'" + String(value).replaceAll("'", "''") + "'";
async function record(kind,id,data,outer={}) {
 if(kind==='coverage'||kind==='manifest'){const key=kind+':'+id;if(metadataIds.has(key))return;metadataIds.add(key);}
 const value=kind==='token'?{...data,ref:outer.ref,edition:outer.edition,normalizedLemma:outer.lemma??lexicalKey(data.lemma??''),normalizedForm:outer.form??lexicalKey(data.text)}:data;
 const json=JSON.stringify(value);counts[kind]=(counts[kind]??0)+1;
 if(Buffer.byteLength(json)>1_900_000)throw new Error(`Record exceeds D1 row limit: ${kind}:${id}; partition it upstream.`);
 const columns=[kind,id,outer.book,outer.lemma,outer.form,outer.edition,outer.ref,outer.endRef,outer.sourceId].map(v=>v===undefined?'NULL':quote(v)).join(',');
 const insert=`INSERT INTO corpus_records(kind,id,book,lemma,form,edition,ref,end_ref,source_id,json) VALUES(${columns},${quote(json)});`;
 if(Buffer.byteLength(insert)<90000)await sql(insert);
 else {
  await sql('DELETE FROM corpus_import_chunks;');
  // Array.from retains surrogate pairs; no UTF-16 half-character crosses an SQL statement.
  const chars=Array.from(json);
  for(let i=0;i<chars.length;i+=10000)await sql(`INSERT INTO corpus_import_chunks VALUES(${i},${quote(chars.slice(i,i+10000).join(''))});`);
  await sql(`INSERT INTO corpus_records(kind,id,book,lemma,form,edition,ref,end_ref,source_id,json) SELECT ${columns},group_concat(chunk,'') FROM (SELECT chunk FROM corpus_import_chunks ORDER BY sequence);`);
  await sql('DELETE FROM corpus_import_chunks;');
 }
 count++;
 if(kind==='passage')for(const e of value.editions)await record('edition',`${id}:${e.id}`,{ref:id,provenance:e.provenance},{ref:id,edition:e.id});
 if(kind==='lexicon'||kind==='token')for(const key of new Set([value.lemma,...(value.aliases??[]),value.strong].filter(Boolean).flatMap(v=>[lexicalKey(v),strongKey(v)])))await sql(`INSERT OR IGNORE INTO corpus_lexical_keys VALUES(${quote(kind)},${quote(key)},${quote(id)});`);
 if(kind==='citation'||kind==='crossreference') {
  const start=kind==='citation'?value.reference.ref:value.fromRef,end=kind==='citation'?(value.reference.endRef??start):start;
  await sql(`INSERT INTO corpus_ranges VALUES(${quote(kind)},${referenceOrder(start)},${referenceOrder(end)},${quote(id)});`);
 }
 if(kind==='page')await sql(`INSERT INTO corpus_pages_fts(id,source_id,text) SELECT id,json_extract(json,'$.sourceId'),json_extract(json,'$.text') FROM corpus_records WHERE kind='page' AND id=${quote(id)};`);
}
let metadata;
try {
 await sql('-- Apply migrations first. Corpus index only; notes/auth untouched.');
 for(const table of ['corpus_records','corpus_pages_fts','corpus_lexical_keys','corpus_ranges'])await sql(`DELETE FROM ${table};`);
 if(input.endsWith('.ndjson')) {
  const initial=await stat(input);
  metadata=JSON.parse(await readFile(process.argv[4]?resolve(process.argv[4]):join(dirname(input),'r2/catalog.json'),'utf8'));
  for await(const line of createInterface({input:createReadStream(input),crlfDelay:Infinity}))if(line.trim()){const r=JSON.parse(line);await record(r.kind,r.id,r.json,r);}
  const final=await stat(input);if(initial.size!==final.size||initial.mtimeMs!==final.mtimeMs)throw new Error('Corpus NDJSON changed during indexing; retry after the export completes.');
 } else {
  if((await stat(input)).size>450_000_000)throw new Error('Use storage/corpus.ndjson and r2/catalog.json for a full import; do not read a giant JSON string.');
  const corpus=JSON.parse(await readFile(input,'utf8'));
  if(corpus.schemaVersion!==1||!Array.isArray(corpus.passages))throw new Error('Unsupported corpus');
  metadata=corpus;
  for(const r of corpusRecords(corpus))await record(r.kind,r.id,r.json,r);
 }
 for(const c of metadata.coverage??[])await record('coverage',c.sourceId,c);
 for(const m of metadata.manifests??[])await record('manifest',m.id,m);
 await record('catalog','catalog',{importMode:metadata.importMode??'sample',counts:{...counts}});
 if(pending){await file.write(pending);await partWrite(pending);}
 await file.close();if(part)await part.close();await rename(out+'.tmp',out);
 const report={input,records:count,counts,maxStatementBytes,sqlBytes:(await stat(out)).size,importMode:metadata.importMode??'sample',parts};
 await import('node:fs/promises').then(fs=>fs.writeFile(out+'.report.json',JSON.stringify(report,null,2)+'\n'));
 console.log(JSON.stringify({...report,parts:parts.length}));
} catch(error) {await file.close();throw error;}
