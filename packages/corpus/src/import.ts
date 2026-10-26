import { createHash } from 'node:crypto';
import { readFile, mkdir, writeFile, readdir } from 'node:fs/promises';
import { resolve, relative, isAbsolute } from 'node:path';
import { execFileSync } from 'node:child_process';
import { inflateRawSync } from 'node:zlib';
import { Effect } from 'effect';
import type { Corpus, SourceManifest, Source, SourcePage, Citation, SourceInventory, LexiconEntry, CrossReference } from './models.ts';
import { parseVerseText, parseMaculaBook, provenanceFor, ntBooks } from './bible.ts';
import { splitPages } from './pages.ts';
import { parseStepLexicon, parseAbbottSmith, parseCrossReferences } from './lexical.ts';
import { extractReferences, referenceOrder } from './references.ts';
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
 const reception=receptionFromTexts(eligible,pin,only), sourceInventory:SourceInventory[]=[];
 const tracked=execFileSync('git',['ls-tree','-r','--name-only',pin.revision,'--','completed','uncompleted'],{cwd:root,encoding:'utf8'}).trim().split('\n').filter(Boolean);
 const allPaths=[...new Set([...entries.keys(),...tracked])];
 for(const state of ['completed','uncompleted'] as const){
  let dirs:string[]=[];try{dirs=(await readdir(resolve(root,state),{withFileTypes:true})).filter(d=>d.isDirectory()).map(d=>d.name);}catch(error){if((error as NodeJS.ErrnoException).code!=='ENOENT')throw error;}
  for(const dir of dirs){const id=`${state}/${dir}`,paths=allPaths.filter(p=>p.startsWith(id+'/')),importedPaths=paths.filter(p=>eligible.has(p)&&(!only||only.includes(p)));
   sourceInventory.push({id,state:state==='completed'?'completed':'in-progress',importedPaths,omitted:paths.filter(p=>!importedPaths.includes(p)).map(path=>({path,reason:state==='uncompleted'?'Outside upstream CC0 path scope; in-progress/untranslated material not redistributed.':eligible.has(path)?'Excluded by explicit --only selection.':'Normalized originals/metadata are outside upstream CC0 scope.'})),upstreamUrl:`${pin.upstreamUrl}/tree/${pin.revision}/${id}`});
  }
 }
 reception.coverage.limitations.push(`${sourceInventory.filter(s=>s.state==='in-progress').length} in-progress works inventoried with omitted path reasons; these were not searched.`);
 return {...reception,sourceInventory};
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
export async function loadManifests(root:string):Promise<SourceManifest[]> {const manifests=JSON.parse(await readFile(resolve(root,'data/manifests/sources.json'),'utf8')) as SourceManifest[];for(const m of manifests)if(m.licenseSha256)verifyChecksum(await readFile(safePath(root,m.licenseFile)),m.licenseSha256,m.licenseFile);return manifests;}
export async function acquire(manifest:SourceManifest,destination:string):Promise<void>{for(const file of manifest.files){const response=await fetch(file.url);if(!response.ok)throw new ImportError(`HTTP ${response.status}: ${file.url}`);const bytes=new Uint8Array(await response.arrayBuffer());verifyChecksum(bytes,file.sha256,file.url);const path=safePath(destination,`${manifest.id}/${file.path}`);await mkdir(resolve(path,'..'),{recursive:true});await writeFile(path,bytes);}}
/** Single-member ZIP parser, using the verified central directory and built-in DEFLATE. */
export function unzipMember(bytes:Uint8Array,name:string):Uint8Array {
 const b=Buffer.from(bytes);for(let i=0;i+46<=b.length;i++)if(b.readUInt32LE(i)===0x02014b50){
  const size=b.readUInt32LE(i+20),method=b.readUInt16LE(i+10),n=b.readUInt16LE(i+28),extra=b.readUInt16LE(i+30),comment=b.readUInt16LE(i+32),offset=b.readUInt32LE(i+42);
  if(b.subarray(i+46,i+46+n).toString()===name){if(b.readUInt32LE(offset)!==0x04034b50)throw new ImportError('Invalid ZIP local header');const start=offset+30+b.readUInt16LE(offset+26)+b.readUInt16LE(offset+28),data=b.subarray(start,start+size);if(data.length!==size)throw new ImportError('Truncated ZIP member');if(method===0)return data;if(method===8)return inflateRawSync(data);throw new ImportError(`Unsupported ZIP compression ${method}`);}
  i+=45+n+extra+comment;
 }throw new ImportError(`Missing ZIP member: ${name}`);
}
export const buildCorpus=(root:string,receptionRoot?:string,only?:string[],downloads?:string)=>Effect.tryPromise({try:async()=>{
 const manifests=await loadManifests(root), passages=new Map<string,Corpus['passages'][number]>(),syntax:ReturnType<typeof parseMaculaBook>=[],lexicon:LexiconEntry[]=[],crossreferences:CrossReference[]=[];
 for(const m of manifests){let loaded=0,omitted=0;
  for(const file of m.files){
   if(!downloads&&(!file.samplePath||!file.sampleSha256))continue;
   const sourcePath=downloads?safePath(downloads,`${m.id}/${file.path}`):safePath(root,file.samplePath!);
   const bytes=await readFile(sourcePath);verifyChecksum(bytes,downloads?file.sha256:file.sampleSha256!,sourcePath);
   if(m.id==='macula'){const parsed=parseMaculaBook(bytes.toString(),m);syntax.push(...parsed);loaded+=parsed.length;}
   else if(m.id==='sblgnt'||m.id==='bsb'){const parsed=parseVerseText(bytes.toString(),m);loaded+=parsed.size;for(const [ref,edition] of parsed){const p=passages.get(ref)??{ref,editions:[]};if(p.editions.some(e=>e.id===edition.id))throw new ImportError(`Duplicate edition ${edition.id} ${ref}`);p.editions.push(edition);passages.set(ref,p);}}
   else if(m.id==='step-tbesg'){const parsed=parseStepLexicon(bytes.toString(),m);lexicon.push(...parsed.entries);loaded+=parsed.entries.length;omitted+=parsed.omitted;}
   else if(m.id==='abbott-smith'&&file.path.endsWith('.xml')){const entries=parseAbbottSmith(bytes.toString(),m);lexicon.push(...entries);loaded+=entries.length;}
   else if(m.id==='openbible'){const refs=parseCrossReferences(Buffer.from(unzipMember(bytes,'cross_references.txt')).toString('utf8'),m);for(const x of refs)crossreferences.push(x);loaded+=refs.length;}
  }
  const excludedLsj=m.id==='step-lsj';
  m.coverage={sourceId:m.id,status:!loaded?'not-loaded':!downloads||omitted?'partial':'loaded',count:loaded,scope:!downloads?`Focused sample: ${loaded} records`:excludedLsj?'Acquired for audit only; no LSJ entries redistributed':`${loaded} imported ${m.id==='macula'?'verse syntax records':m.id==='sblgnt'||m.id==='bsb'?'NT verse rows':'records'}`,limitations:excludedLsj?['STEP TFLSJ identifies a Perseus-derived full LSJ; independent permissive upstream rights for that digital edition were not established. Use Abbott-Smith and TBESG instead.']:!downloads?['Focused test sample; full upstream not searched.']:m.id==='sblgnt'||m.id==='bsb'?['Entire pinned NT text imported. Edition omissions/additions are preserved; no TVTMS versification alignment asserted.','Empty upstream verse rows are retained as textStatus=empty-upstream; no replacement text is fabricated. BSB translation tables/reverse alignment not imported.']:m.id==='macula'?['Full pinned SBLGNT lowfat books imported; upstream omissions and analysis disagreements are preserved.','Syntax groups crossing verse boundaries are projected onto each verse; referents remain upstream IDs.','UBS ln/domain and unlicensed english/mandarin attributes excluded.']:m.id==='step-tbesg'?[`${omitted} Teknia (MT) definition rows excluded: independent redistribution permission was not established. Definitions are plain text projections; source markup is not executed.`]:m.coverage.limitations};
 }
 for(const s of syntax){const e=passages.get(s.ref)?.editions.find(e=>e.id==='sblgnt');if(e)e.tokens=s.tokens;else throw new ImportError(`Macula verse missing SBLGNT text: ${s.ref}`);}
 if(downloads)for(const id of ['sblgnt','bsb']){const importedBooks=new Set([...passages.values()].filter(p=>p.editions.some(e=>e.id===id)).map(p=>p.ref.split('.')[0]));if(ntBooks.some(b=>!importedBooks.has(b)))throw new ImportError(`Incomplete NT book coverage: ${id}`);}
 const pin=JSON.parse(await readFile(resolve(root,'data/manifests/reformed-retrieval.json'),'utf8')) as ReceptionPin;
 let reception:ReturnType<typeof receptionFromTexts>&{sourceInventory?:SourceInventory[]};
 if(receptionRoot)reception=await Effect.runPromise(importReception(receptionRoot,pin,only));
 else {const sample=JSON.parse(await readFile(resolve(root,'data/manifests/reception-sample.json'),'utf8')) as {path:string;samplePath:string;sha256:string};const bytes=await readFile(safePath(root,sample.samplePath));verifyChecksum(bytes,sample.sha256,sample.path);reception=receptionFromTexts(new Map([[sample.path,bytes.toString('utf8')]]),pin);reception.coverage.limitations[0]='Bundled focused English sample only; the remaining upstream corpus has not been searched.';}
 const grammar=JSON.parse(await readFile(resolve(root,'data/grammar/entries.json'),'utf8')) as NonNullable<Corpus['grammar']>;
 const corpus:Corpus & {syntax:typeof syntax}={schemaVersion:1,importMode:downloads?'full':'sample',passages:[...passages.values()].sort((a,b)=>referenceOrder(a.ref)-referenceOrder(b.ref)),syntax,lexicon,grammar,crossreferences,sourceInventory:reception.sourceInventory??[],sources:reception.sources,pages:reception.pages,citations:reception.citations,manifests,coverage:[...manifests.map(m=>m.coverage),reception.coverage,{sourceId:'grammar',status:'partial',count:grammar.length,scope:'Verified public-domain grammar links and bounded application explanations',limitations:['Selected categories and passages; not a digitized complete grammar or a claim of scholarly consensus.','Smyth describes primarily classical Greek; Robertson addresses NT usage.']}]};
 corpus.scriptureIndex={};for(const citation of corpus.citations)(corpus.scriptureIndex[citation.reference.ref]??=[]).push(citation.id);
 return corpus;
},catch:e=>e instanceof ImportError?e:new ImportError(String(e))});

export { exportCorpusStorage, writeCorpusJson } from './export.ts';
