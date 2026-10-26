import {readFile,mkdir,open,rename} from 'node:fs/promises';
import {resolve} from 'node:path';
import {Effect} from 'effect';
import {importReception,verifyChecksum} from '../src/import.ts';
import {splitPages} from '../src/pages.ts';
const root=resolve(import.meta.dirname,'../../..'),upstream=resolve(root,'../reformed-retrieval');
const pin=JSON.parse(await readFile(resolve(root,'data/manifests/reformed-retrieval.json'),'utf8'));
const corpus=await Effect.runPromise(importReception(upstream,pin)); // Verifies HEAD and every MANIFEST member.
const manifest=new Map((await readFile(resolve(upstream,'MANIFEST.sha256'),'utf8')).trim().split('\n').map(line=>[line.slice(66),line.slice(0,64)]));
await mkdir(resolve(root,'data/generated/packs'),{recursive:true});const output=await open(resolve(root,'data/generated/packs/private.ndjson.tmp'),'w');let aligned=0,unmatched=0;
const emit=async(kind,id,json,cols={})=>output.write(JSON.stringify({pack:'private',kind,id,json,...cols})+'\n');
try{
 for(const source of corpus.sources){
  const candidates=[source.path.replace(/english\.md$/,'latin.txt'),source.path.replace(/english\.md$/,'french.txt')];let original;
  for(const path of candidates){const hash=manifest.get(path);if(!hash)continue;const bytes=await readFile(resolve(upstream,path));verifyChecksum(bytes,hash,path);original={path,language:path.endsWith('french.txt')?'fr':'la',pages:splitPages(source.id,bytes.toString())};break;}
  await emit('source',source.id,source,{source_id:source.id});
  for(const page of corpus.pages.filter(p=>p.sourceId===source.id)){
   await emit('page',page.id,page,{source_id:source.id});
   // Only exact normalized markers are aligned. Never infer paragraph correspondence.
   const matches=original?.pages.filter(p=>p.locator.id===page.locator.id)??[];
   if(matches.length===1&&page.locator.kind!=='unpaginated'){
    aligned++;await emit('original',page.id,{text:matches[0].text,language:original.language,alignmentStatus:'Aligned by exact page marker; paragraph alignment unverified',locator:matches[0].locator,provenance:{...source.provenance,edition:original.path,license:'Private local transcription; redistribution grant not established',locator:page.id,reviewStatus:'Transcription unreviewed',upstreamUrl:`${pin.upstreamUrl}/blob/${pin.revision}/${original.path}`}}, {source_id:source.id});
   }else unmatched++;
  }
 }
 for(const c of corpus.citations)await emit('citation',c.id,c,{ref:c.reference.ref,source_id:c.sourceId});
 // Editorial identification: the page quotes the verse but omits its numerical reference.
 const page=corpus.pages.find(p=>p.sourceId==='1590-beza-de-vera-excommunicatione/parts/part-03-english'&&p.locator.printedPage==='106');
 if(!page||!page.text.includes('Let elders who rule well'))throw new Error('Audited Beza quotation no longer matches its pinned page.');
 const source=corpus.sources.find(s=>s.id===page.sourceId);
 const citation={id:page.id+':identified:1Tim.5.17',sourceId:page.sourceId,title:source.title,date:'1590',locator:page.id,excerpt:page.text,reviewStatus:'AI-assisted, unreviewed; verse identified editorially',deepLink:page.provenance.deepLink,reference:{ref:'1Tim.5.17',raw:'Let elders who rule well',start:page.text.indexOf('Let elders who rule well'),end:page.text.indexOf('Let elders who rule well')+24,versification:'unmapped',uncertain:'Editorial quotation identification; numerical verse reference absent from the source page.'},provenance:page.provenance};
 await emit('citation',citation.id,citation,{ref:'1Tim.5.17',source_id:page.sourceId});

 await emit('coverage','pack:private',{sourceId:'pack:private',status:'partial',scope:`${aligned} exact-marker bilingual pages; ${unmatched} pages without unique alignment`,limitations:['Original transcriptions stay in the user’s local pack; no redistribution license is asserted.','Unpaginated, duplicate or unmatched markers are never silently aligned.','Translations and transcriptions remain unreviewed.']});
 console.log({aligned,unmatched,pages:corpus.pages.length,citations:corpus.citations.length});
}finally{await output.close();}

await rename(resolve(root,'data/generated/packs/private.ndjson.tmp'),resolve(root,'data/generated/packs/private.ndjson'));
