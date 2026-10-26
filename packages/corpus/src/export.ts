import { mkdir, open, rename, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import type { Corpus } from './models.ts';
import { corpusRecords, recordPartition } from './storage.ts';
import { sha256 } from './import.ts';
/** Atomic streamed snapshot: never stringify the whole corpus at once. */
export async function writeCorpusJson(corpus:Corpus,path:string):Promise<void> {
 await mkdir(resolve(path,'..'),{recursive:true});const tmp=path+'.tmp',f=await open(tmp,'w');
 try{await f.write('{');let first=true;for(const [key,value] of Object.entries(corpus)){if(!first)await f.write(',');first=false;await f.write(JSON.stringify(key)+':');if(Array.isArray(value)){await f.write('[');for(let i=0;i<value.length;i++)await f.write((i?',':'')+JSON.stringify(value[i]));await f.write(']');}else await f.write(JSON.stringify(value));}await f.write('}\n');}finally{await f.close();}await rename(tmp,path);
}
const sqlString=(value:unknown)=>value===undefined||value===null?'NULL':`'${String(value).replace(/'/g,"''")}'`;
/** R2 shards + D1 SQL + NDJSON. Filesystem only: never deploys/uploads. */
export async function exportCorpusStorage(corpus:Corpus,directory:string):Promise<{records:number;sqlBytes:number;maxStatementBytes:number;r2Objects:number}> {
 await mkdir(directory,{recursive:true});const sql=await open(resolve(directory,'standalone-corpus.sql'),'w'),ndjson=await open(resolve(directory,'corpus.ndjson'),'w');
 const shards=new Map<string,{id:string;data:unknown}[]>(),counts:Record<string,number>={};let records=0,sqlBytes=0,maxStatementBytes=0;
 const writeSql=async(statement:string)=>{const bytes=Buffer.byteLength(statement);if(bytes>100000)throw new Error(`D1 statement exceeds 100 KB (${bytes})`);sqlBytes+=bytes;maxStatementBytes=Math.max(maxStatementBytes,bytes);await sql.write(statement+'\n');};
 try {
  await writeSql('CREATE TABLE IF NOT EXISTS corpus_records (kind TEXT NOT NULL,id TEXT NOT NULL,book TEXT,lemma TEXT,form TEXT,edition TEXT,ref TEXT,end_ref TEXT,source_id TEXT,json TEXT,r2_key TEXT NOT NULL,PRIMARY KEY(kind,id));');
  for(const record of corpusRecords(corpus)){
   const {kind,id,book,lemma,form,edition,ref,endRef,sourceId,json}=record,key=`records/${kind}/${recordPartition(id)}.json`,shard=shards.get(key)??[];shard.push({id,data:json});shards.set(key,shard);
   const serialized=JSON.stringify(json);const inline=Buffer.byteLength(serialized)>70000?undefined:serialized;
   const statement=`INSERT OR REPLACE INTO corpus_records(kind,id,book,lemma,form,edition,ref,end_ref,source_id,json,r2_key) VALUES(${[kind,id,book,lemma,form,edition,ref,endRef,sourceId,inline,key].map(sqlString).join(',')});`;
   await writeSql(statement);await ndjson.write(JSON.stringify(record)+'\n');records++;counts[kind]=(counts[kind]??0)+1;
  }
  for(const statement of ['CREATE INDEX IF NOT EXISTS corpus_ref ON corpus_records(kind,book,ref);','CREATE INDEX IF NOT EXISTS corpus_lemma ON corpus_records(kind,lemma,book,edition,form);','CREATE INDEX IF NOT EXISTS corpus_source ON corpus_records(kind,source_id);'])await writeSql(statement);
 }finally{await sql.close();await ndjson.close();}
 const objects:{key:string;sha256:string;bytes:number}[]=[];
 for(const [key,records] of shards){const path=resolve(directory,'r2',key);await mkdir(resolve(path,'..'),{recursive:true});const json=JSON.stringify(records);await writeFile(path,json);objects.push({key,sha256:sha256(json),bytes:Buffer.byteLength(json)});}
 const {passages,syntax,lexicon,crossreferences,sources,pages,citations,...metadata}=corpus;
 const catalog={...metadata,storageVersion:1,counts,books:[...new Set(passages.map(p=>p.ref.split('.')[0]))],references:passages.map(p=>p.ref),objects};
 await mkdir(resolve(directory,'r2'),{recursive:true});await writeFile(resolve(directory,'r2/catalog.json'),JSON.stringify(catalog));
 await writeFile(resolve(directory,'export-report.json'),JSON.stringify({records,counts,sqlBytes,maxStatementBytes,r2Objects:objects.length,largestR2Object:Math.max(...objects.map(o=>o.bytes)),catalogSha256:sha256(JSON.stringify(catalog))},null,2)+'\n');
 return {records,sqlBytes,maxStatementBytes,r2Objects:objects.length};
}
