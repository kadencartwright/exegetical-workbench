import { createHash } from 'node:crypto';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { resolve, relative, isAbsolute } from 'node:path';
import { execFileSync } from 'node:child_process';
import { Effect } from 'effect';
import type { Corpus, SourceManifest, Source, SourcePage, Citation } from './models.ts';
import { parseVerseText, parseMacula, provenanceFor } from './bible.ts';
import { splitPages } from './pages.ts';
import { extractReferences } from './references.ts';
export class ImportError extends Error { readonly _tag='ImportError'; }
export const sha256=(bytes: Uint8Array|string)=>createHash('sha256').update(bytes).digest('hex');
export function verifyChecksum(bytes:Uint8Array|string,expected:string,label='source'): void { if(!/^[a-f0-9]{64}$/.test(expected)||sha256(bytes)!==expected)throw new ImportError(`Checksum mismatch: ${label}`); }
export function safePath(root:string,path:string): string { const full=resolve(root,path),rel=relative(resolve(root),full); if(rel==='..'||rel.startsWith('../')||isAbsolute(rel))throw new ImportError(`Unsafe manifest path: ${path}`);return full; }
export function parseChecksumManifest(text:string): Map<string,string> { const entries=new Map<string,string>(); for(const line of text.split(/\r?\n/)){if(!line.trim())continue;const m=/^([a-f0-9]{64}) [ *](.+)$/.exec(line);if(!m)throw new ImportError('Malformed checksum manifest');if(entries.has(m[2]!))throw new ImportError(`Duplicate manifest entry: ${m[2]}`);entries.set(m[2]!,m[1]!);}return entries; }
export interface ReceptionPin {revision:string;manifestSha256:string;upstreamUrl:string;licensePolicy:string}
/** Read-only source import. Every manifest entry is checked before eligible text is imported. */
export const importReception=(root:string,pin:ReceptionPin,only?:string[])=>Effect.tryPromise({try:async()=>{
 const rev=execFileSync('git',['rev-parse','HEAD'],{cwd:root,encoding:'utf8'}).trim(); if(rev!==pin.revision)throw new ImportError(`Reception revision mismatch: ${rev}`);
 const manifest=await readFile(resolve(root,'MANIFEST.sha256'));verifyChecksum(manifest,pin.manifestSha256,'reception MANIFEST.sha256');
 const entries=parseChecksumManifest(manifest.toString()), eligible=new Map<string,string>();
 for(const [path,hash] of entries){const bytes=await readFile(safePath(root,path));verifyChecksum(bytes,hash,path);if(/^completed\/[^/]+\/(?:english\.md|parts\/[^/]+-english\.md)$/.test(path))eligible.set(path,bytes.toString('utf8'));}
 if(only)for(const p of only)if(!eligible.has(p))throw new ImportError(`Not an eligible CC0 manifest path: ${p}`);
 return receptionFromTexts(eligible,pin,only);
},catch:e=>e instanceof ImportError?e:new ImportError(String(e))});
export function receptionFromTexts(eligible:Map<string,string>,pin:ReceptionPin,only?:string[]){
 const sources:Source[]=[],pages:SourcePage[]=[],citations:Citation[]=[];
 // Each translated file is its own coverage unit: no inference that a complete work is loaded.
 for(const [path,text] of eligible){if(only&&!only.includes(path))continue;
  const id=path.replace(/^completed\//,'').replace(/\.md$/,''),title=/^#\s+(.+)$/m.exec(text)?.[1]??id;
  const provenance={source:'reformed-retrieval',edition:path,version:pin.revision,license:'CC0-1.0',locator:`reception:${id}`,reviewStatus:'AI-assisted, unreviewed' as const,deepLink:`/sources/${encodeURIComponent(id)}`,upstreamUrl:`${pin.upstreamUrl}/blob/${pin.revision}/${path}`};
  sources.push({id,title,path,date:/^\d{4}/.exec(id)?.[0],originalUrl:`${pin.upstreamUrl}/tree/${pin.revision}/completed/${path.split('/')[1]}`,provenance,coverage:{sourceId:id,status:'partial',scope:path,limitations:['Only this English file is indexed; work-level completeness not established.','Original transcription is linked upstream, not bundled.','AI-assisted translation; no competent named review established.']}});
  const seen=new Map<string,number>();
  for(const part of splitPages(id,text)){
   const occurrence=(seen.get(part.locator.id)??0)+1;seen.set(part.locator.id,occurrence);
   const pageId=part.locator.id+(occurrence>1?`:occurrence:${occurrence}`:''); const p={...provenance,locator:pageId,deepLink:`/source-page?locator=${encodeURIComponent(pageId)}`};
   pages.push({id:pageId,sourceId:id,...part,provenance:p});
   for(const reference of extractReferences(part.text))citations.push({id:`${pageId}:ref:${reference.start}`,sourceId:id,title,date:/^\d{4}/.exec(id)?.[0],locator:pageId,excerpt:part.text.slice(Math.max(0,reference.start-160),reference.end+240).trim(),reviewStatus:p.reviewStatus,deepLink:p.deepLink,reference,provenance:p});
  }
 }
 return {sources,pages,citations,coverage:{sourceId:'reformed-retrieval',status:'partial' as const,scope:`${sources.length} completed English file units; ${pages.length} page segments; ${citations.length} explicit references`,count:sources.length,limitations:['All pinned manifest files verified; only eligible CC0 completed English indexed.','Uncompleted works, normalized originals and metadata excluded.','Ranges preserved; bare v. references, multi-reference shorthand and versification mapping not resolved.','Repeated compiled/part translations may duplicate citations; no scholarly deduplication asserted.']}};
}
export async function loadManifests(root:string):Promise<SourceManifest[]> {return JSON.parse(await readFile(resolve(root,'data/manifests/sources.json'),'utf8'));}
export async function acquire(manifest:SourceManifest,destination:string):Promise<void>{for(const file of manifest.files){const response=await fetch(file.url);if(!response.ok)throw new ImportError(`HTTP ${response.status}: ${file.url}`);const bytes=new Uint8Array(await response.arrayBuffer());verifyChecksum(bytes,file.sha256,file.url);const path=safePath(destination,`${manifest.id}/${file.path}`);await mkdir(resolve(path,'..'),{recursive:true});await writeFile(path,bytes);}}
export const buildCorpus=(root:string,receptionRoot?:string,only?:string[],downloads?:string)=>Effect.tryPromise({try:async()=>{
 const manifests=await loadManifests(root), passages=new Map<string,Corpus['passages'][number]>(); let syntax:ReturnType<typeof parseMacula>[]=[];
 for(const m of manifests)for(const file of m.files){if(!file.samplePath||!file.sampleSha256)continue;const sourcePath=downloads?safePath(downloads,`${m.id}/${file.path}`):safePath(root,file.samplePath);const bytes=await readFile(sourcePath);verifyChecksum(bytes,downloads?file.sha256:file.sampleSha256,sourcePath);if(downloads&&m.id!=='macula')m.coverage={...m.coverage,scope:'Matthew text from pinned full upstream file; only Matt.28.19 has Macula enrichment',limitations:['Only Matthew text is parsed; other books are not included.','Morphology and syntax coverage remains Matt.28.19 only.']};
 if(m.id==='macula'){syntax.push(parseMacula(bytes.toString(),m));continue;}
 for(const [ref,edition] of parseVerseText(bytes.toString(),m)){const p=passages.get(ref)??{ref,editions:[]};p.editions.push(edition);passages.set(ref,p);}}
 for(const s of syntax){const e=passages.get(s.ref)?.editions.find(e=>e.id==='sblgnt');if(e)e.tokens=s.tokens;}
 const pin=JSON.parse(await readFile(resolve(root,'data/manifests/reformed-retrieval.json'),'utf8')) as ReceptionPin;
 let reception;
 if(receptionRoot)reception=await Effect.runPromise(importReception(receptionRoot,pin,only));
 else {const sample=JSON.parse(await readFile(resolve(root,'data/manifests/reception-sample.json'),'utf8')) as {path:string;samplePath:string;sha256:string};const bytes=await readFile(safePath(root,sample.samplePath));verifyChecksum(bytes,sample.sha256,sample.path);reception=receptionFromTexts(new Map([[sample.path,bytes.toString('utf8')]]),pin);reception.coverage.limitations[0]='Bundled focused English sample only; the remaining upstream corpus has not been searched.';}
 const corpus:Corpus & {syntax:typeof syntax}={schemaVersion:1,passages:[...passages.values()],syntax,sources:reception?.sources??[],pages:reception?.pages??[],citations:reception?.citations??[],manifests,coverage:[...manifests.map(m=>m.coverage),reception?.coverage??{sourceId:'reformed-retrieval',status:'not-loaded',scope:'No reception checkout supplied',limitations:['Run build --reception /path/to/pinned/repository']} ]};
 corpus.scriptureIndex={};for(const citation of corpus.citations)(corpus.scriptureIndex[citation.reference.ref]??=[]).push(citation.id);
 return corpus;
},catch:e=>e instanceof ImportError?e:new ImportError(String(e))});
