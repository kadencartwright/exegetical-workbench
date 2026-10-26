import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createReadStream } from 'node:fs';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { createInterface } from 'node:readline';
import { createCorpusAdapter, lexicalKey, ntBooks, type Corpus, type CorpusRecord, type LexiconEntry, type Token, type Distribution, type Citation, type SourceInventory } from '../src/index.ts';
const root=new URL('../../../',import.meta.url).pathname;
test('full pinned NT, lexicons, crossrefs and reception acceptance from streamed export', {skip:process.env.CORPUS_FULL!=='1'}, async()=>{
 const catalog=JSON.parse(await readFile(root+'data/generated/storage/r2/catalog.json','utf8'));
 const corpus:Corpus={schemaVersion:1,passages:[],syntax:[],sources:[],pages:[],citations:[],coverage:catalog.coverage,manifests:catalog.manifests,grammar:catalog.grammar,lexicon:[],crossreferences:[],sourceInventory:[]};
 const counts:Record<string,number>={},editionRefs=new Map<string,Set<string>>(),syntaxRefs=new Set<string>(),lexicalCounts:Record<string,number>={},maxBytes:Record<string,number>={},ethnos:Token[]=[],greekTokenIds=new Set<string>(),referents=new Set<string>(),emptySlots:string[]=[];let greekTokens=0,parseableTokens=0,autous:Token|undefined,fullMatt;
 for await(const line of createInterface({input:createReadStream(root+'data/generated/storage/corpus.ndjson'),crlfDelay:Infinity})){
  const r=JSON.parse(line) as CorpusRecord;counts[r.kind]=(counts[r.kind]??0)+1;maxBytes[r.kind]=Math.max(maxBytes[r.kind]??0,Buffer.byteLength(JSON.stringify(r.json)));
  if(r.kind==='passage'){const p=r.json as Corpus['passages'][number];for(const e of p.editions){const refs=editionRefs.get(e.id)??new Set<string>();refs.add(p.ref);editionRefs.set(e.id,refs);if(e.textStatus==='empty-upstream')emptySlots.push(`${e.id}:${p.ref}`);}if(p.ref==='Matt.28.19'){fullMatt=p;corpus.passages.push(p);}}
  if(r.kind==='syntax'){syntaxRefs.add(r.id);if(r.ref==='Matt.28.19')corpus.syntax!.push(r.json as NonNullable<Corpus['syntax']>[number]);}
  if(r.kind==='token'&&r.edition==='sblgnt'){const t=r.json as Token;greekTokens++;if(t.morphology?.description)parseableTokens++;greekTokenIds.add(t.upstreamId!);for(const id of t.referents??[])referents.add(id);if(lexicalKey(t.lemma??'')===lexicalKey('ἔθνος'))ethnos.push(t);if(t.id==='sblgnt:Matt.28.19:8')autous=t;}
  if(r.kind==='lexicon'){const e=r.json as LexiconEntry;lexicalCounts[e.sourceId]=(lexicalCounts[e.sourceId]??0)+1;if([e.lemma,...e.aliases??[]].some(l=>['εθνοσ','αυτοσ'].includes(lexicalKey(l))))corpus.lexicon!.push(e);}
  if(r.kind==='crossreference'&&r.ref==='Matt.28.19')corpus.crossreferences!.push(r.json as NonNullable<Corpus['crossreferences']>[number]);
  if(r.kind==='source')corpus.sources.push(r.json as Corpus['sources'][number]);
  if(r.kind==='citation')corpus.citations.push(r.json as Citation);
  if(r.kind==='inventory')corpus.sourceInventory!.push(r.json as SourceInventory);
 }
 assert.equal(counts.passage,7959);assert.equal(editionRefs.get('sblgnt')!.size,7939);assert.equal(editionRefs.get('bsb')!.size,7957);assert.equal(syntaxRefs.size,7939);
 for(const [id,refs] of editionRefs){assert.equal(new Set([...refs].map(ref=>ref.split('.')[0])).size,27,id);for(const book of ntBooks)assert.ok([...refs].some(ref=>ref.startsWith(book+'.')),`${id} ${book}`);}
 assert.deepEqual([...syntaxRefs].sort(),[...editionRefs.get('sblgnt')!].sort());assert.equal(parseableTokens,greekTokens);assert.equal(autous?.morphology?.gender,'masculine');assert.equal(autous?.referents?.[0],'n40028019006');
 assert.equal(emptySlots.length,16);assert.ok(emptySlots.includes('bsb:John.5.4'));assert.equal(counts.crossreference,344799);assert.equal(lexicalCounts['step-tbesg'],11035);assert.equal(lexicalCounts['abbott-smith'],6153);assert.equal(counts.source,311);assert.equal(counts.page,2347);assert.ok(counts.citation!>=5318);
 const inventory=corpus.sourceInventory!;assert.equal(inventory.filter(w=>w.state==='completed').length,82);assert.equal(inventory.filter(w=>w.state==='in-progress').length,28);assert.ok(inventory.filter(w=>w.state==='in-progress').every(w=>!w.importedPaths.length&&w.omitted.length));
 const a=createCorpusAdapter(corpus),token=a.query('token',{id:'sblgnt:Matt.28.19:8'}).data as {grammar:{id:string}[];agreement:{relatedTokenId:string}[]};assert.ok(token.grammar.some(g=>g.id==='robertson-matt-28-19'));assert.equal(token.agreement[0]!.relatedTokenId,'sblgnt:Matt.28.19:6');
 assert.equal((a.query('lexicon',{lemma:'ἔθνος'}).data as LexiconEntry[]).length,2);assert.ok((a.query('crossreferences',{ref:'Mt 28:19'}).data as unknown[]).length>20);
 const mattCitations=a.query('citations',{ref:'Mt 28:19'}).data as Citation[];assert.ok(mattCitations.length>=14);assert.ok(mattCitations.every(c=>c.reviewStatus==='AI-assisted, unreviewed'));
 // Independent raw-XML word count, separate from the importer and adapter.
 const macula=corpus.manifests.find(m=>m.id==='macula')!;let rawEthnos=0;for(const f of macula.files){const xml=await readFile(root+'data/downloads/macula/'+f.path,'utf8');rawEthnos+=[...xml.matchAll(/\blemma="ἔθνος"/g)].length;}assert.equal(ethnos.length,rawEthnos);
 const concordance:Corpus={...corpus,passages:[]};const byRef=new Map<string,Token[]>();for(const t of ethnos){const ref=t.id.split(':')[1]!,tokens=byRef.get(ref)??[];tokens.push(t);byRef.set(ref,tokens);}for(const [ref,tokens] of byRef)concordance.passages.push({ref,editions:[{...fullMatt!.editions.find(e=>e.id==='sblgnt')!,tokens}]});
 const ca=createCorpusAdapter(concordance),distribution=ca.query('distribution',{lemma:'ἔθνος'}).data as Distribution;assert.equal(distribution.total,rawEthnos);assert.equal((ca.query('concordance',{lemma:'ἔθνος',limit:'1000'}).data as unknown[]).length,rawEthnos);const mattCount=ethnos.filter(t=>t.id.includes(':Matt.')).length;assert.equal((ca.query('distribution',{lemma:'ἔθνος',book:'Matthew'}).data as Distribution).total,mattCount);
 const missingReferents=[...referents].filter(id=>!greekTokenIds.has(id));const sbl=editionRefs.get('sblgnt')!,bsb=editionRefs.get('bsb')!;
 const report={verifiedAt:'2026-10-26',counts,editionVerses:{sblgnt:sbl.size,bsbSlots:bsb.size,bsbNonempty:bsb.size-emptySlots.length,emptySlots},greekTokens,parseableTokens,referentTargets:referents.size,unresolvedReferentTargets:missingReferents.length,unresolvedReferentExamples:missingReferents.slice(0,20),lexicalCounts,ethnosDistribution:distribution,matthew2819:{citations:mattCitations.length,crossreferences:corpus.crossreferences!.length,masculineToken:autous,grammar:token.grammar},editionDifferences:{sblgntOnly:[...sbl].filter(r=>!bsb.has(r)),bsbOnly:[...bsb].filter(r=>!sbl.has(r))},inventory:{completed:82,inProgress:28,importedFiles:311},maxRecordBytes:maxBytes};
 await mkdir(root+'data/audits',{recursive:true});await writeFile(root+'data/audits/m1-full-import.json',JSON.stringify(report,null,2)+'\n');
});
