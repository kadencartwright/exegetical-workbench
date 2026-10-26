import { DatabaseSync } from 'node:sqlite';
import { readFileSync } from 'node:fs';
export function database() {
  const sqlite = new DatabaseSync(':memory:');
  for (const file of ['0001_notes.sql','0002_auth.sql','0003_corpus.sql','0004_referents.sql']) sqlite.exec(readFileSync(new URL('../../../migrations/'+file, import.meta.url), 'utf8'));
  const db = { prepare(sql:string) { let values:unknown[]=[]; const statement={bind(...args:unknown[]){values=args;return statement;},async first(){return sqlite.prepare(sql).get(...values as [])??null;},async all(){return {results:sqlite.prepare(sql).all(...values as [])};},async run(){return {meta:{changes:Number(sqlite.prepare(sql).run(...values as []).changes)}};}};return statement;} } as unknown as D1Database;
  return {sqlite,db};
}
export function memoryKv() {
  const data = new Map<string,{value:string;expires?:number}>();
  return { async get(key:string, type?:string|{type?:string}) { const r=data.get(key); if(!r||r.expires&&r.expires<=Date.now())return null; const t=typeof type==='string'?type:type?.type; if(t==='json')return JSON.parse(r.value); if(t==='arrayBuffer')return new TextEncoder().encode(r.value).buffer; return r.value; },async put(key:string,value:string,options?:{expirationTtl?:number;expiration?:number}) {data.set(key,{value,expires:options?.expirationTtl?Date.now()+options.expirationTtl*1000:options?.expiration?options.expiration*1000:undefined});},async delete(key:string){data.delete(key);},async list(options?:{prefix?:string}){return {keys:[...data.keys()].filter(k=>k.startsWith(options?.prefix??'')).map(name=>({name})),list_complete:true,cursor:''};} } as unknown as KVNamespace;
}
