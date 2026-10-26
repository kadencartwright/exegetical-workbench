import { XMLParser, XMLValidator } from 'fast-xml-parser';
import type { CrossReference, LexiconEntry, SourceManifest } from './models.ts';
import { provenanceFor } from './bible.ts';
import { normalizeRef } from './references.ts';
/** Stored as text, never trusted HTML. Preserve lexical wording; remove presentation markup. */
export function plainText(text:string):string {
 return text.replace(/<br\s*\/?\s*>|<lb\s*\/?\s*>/gi,'\n').replace(/<[^>]*>/g,'').replace(/&(?:amp|lt|gt|quot|apos|nbsp);/g,m=>({'&amp;':'&','&lt;':'<','&gt;':'>','&quot;':'"','&apos;':"'",'&nbsp;':' '}[m]!)).replace(/&#(x[\da-f]+|\d+);/gi,(_,n:string)=>String.fromCodePoint(n[0]==='x'?parseInt(n.slice(1),16):Number(n))).replace(/[ \t]+/g,' ').trim();
}
export const lexicalKey=(value:string)=>value.normalize('NFD').replace(/\p{M}/gu,'').toLowerCase().replace(/ς/g,'σ').trim();
export const strongKey=(value:string)=>value.replace(/^G0*/i,'').replace(/^0+/,'');
export function parseStepLexicon(text:string,manifest:SourceManifest):{entries:LexiconEntry[];omitted:number} {
 const entries:LexiconEntry[]=[],seen=new Map<string,number>();let omitted=0;
 for(const line of text.split(/\r?\n/)){
  if(!/^G\d+\t/.test(line))continue;const fields=line.split('\t');if(fields.length<8)throw new Error(`Invalid STEP lexical row: ${fields[0]}`);
  // Teknia material is used "with permission" upstream, but no separate sublicensing grant was located.
  if(/\(MT\)/.test(fields.slice(7).join('\t'))){omitted++;continue;}
  const [strong,, ,lemma,transliteration,,gloss]=fields,definition=plainText(fields.slice(7).join('\t'));
  const serial=(seen.get(strong!)??0)+1;seen.set(strong!,serial);const id=`${manifest.id}:${strong}:${serial}`;
  entries.push({id,sourceId:manifest.id,lemma:lemma!,aliases:lemma!.split(/[,;]/).map(s=>s.trim()),strong,transliteration,gloss,definition,provenance:{...provenanceFor(manifest,id),edition:'STEP TBESG',deepLink:`/lexicon?lemma=${encodeURIComponent(lemma!)}`}});
 }
 if(!entries.length)throw new Error('No STEP lexicon entries');return {entries,omitted};
}
/** TEI entry content is projected into plain text; source entry IDs and page numbers retained. */
export function parseAbbottSmith(xml:string,manifest:SourceManifest):LexiconEntry[] {
 if(/<!DOCTYPE|<!ENTITY/i.test(xml))throw new Error('DTD/entity declarations are not accepted');
 const valid=XMLValidator.validate(xml);if(valid!==true)throw new Error(`Invalid Abbott-Smith XML: ${valid.err.msg}`);
 const entries:LexiconEntry[]=[];let page='';
 const parser=new XMLParser({ignoreAttributes:false,attributeNamePrefix:'',preserveOrder:true,trimValues:false,parseTagValue:false});
 const raw=parser.parse(xml) as Record<string,unknown>[];
 const textOf=(items:Record<string,unknown>[]):string=>items.map(item=>Object.entries(item).filter(([k])=>k!==':@').map(([k,v])=>k==='#text'?String(v):Array.isArray(v)?textOf(v as Record<string,unknown>[]):'').join('')).join('');
 function visit(items:Record<string,unknown>[]):void {for(const item of items){const attrs=(item[':@']??{}) as Record<string,string>;if(item.pb)page=attrs.n??page;
  for(const [tag,value] of Object.entries(item)){if(tag==='entry'){
   const content=value as Record<string,unknown>[],body=textOf(content),orths:string[]=[];
   const find=(nodes:Record<string,unknown>[])=>{for(const n of nodes)for(const [k,v] of Object.entries(n)){if(k==='orth'&&Array.isArray(v))orths.push(textOf(v as Record<string,unknown>[]));else if(k!==':@'&&Array.isArray(v))find(v as Record<string,unknown>[]);}};find(content);
   const foreign:string[]=[];const getForeign=(nodes:Record<string,unknown>[])=>{for(const node of nodes)for(const [k,v] of Object.entries(node)){if(k==='foreign'&&Array.isArray(v)&&(node[':@'] as Record<string,string>|undefined)?.['xml:lang']==='grc')foreign.push(textOf(v as Record<string,unknown>[]));else if(k!==':@'&&Array.isArray(v))getForeign(v as Record<string,unknown>[]);}};if(!orths.length)getForeign(content);
   const lemma=attrs.n?.split('|')[0]?.trim()??orths[0]?.trim()??foreign[0]?.split(',')[0]?.trim();if(!lemma)throw new Error(`Abbott-Smith entry without orth: ${attrs.n}`);
   const entryId=attrs['xml:id']??attrs.n??String(entries.length+1),id=`abbott-smith:${entryId}`;
   entries.push({id,sourceId:manifest.id,lemma,aliases:[lemma,...orths.flatMap(o=>o.split(/[,;]/).map(s=>s.trim()))],strong:/\|G(\d+)/.exec(attrs.n??'')?.[1],definition:body.replace(/\s+/g,' ').trim(),provenance:{...provenanceFor(manifest,id),edition:'Abbott-Smith (1922), TEI',locator:`${id}${page?`:p:${page}`:''}`,deepLink:`/lexicon?lemma=${encodeURIComponent(lemma)}`,upstreamUrl:`${manifest.upstreamUrl}/blob/${manifest.revision}/abbott-smith.tei.xml`}});
  }else if(tag!==':@'&&Array.isArray(value))visit(value as Record<string,unknown>[]);}
 }}visit(raw);
 if(!entries.length)throw new Error('No Abbott-Smith entries');return entries;
}
export function parseCrossReferences(text:string,manifest:SourceManifest):CrossReference[] {
 const result:CrossReference[]=[];
 for(const [i,line] of text.split(/\r?\n/).entries()){
  if(!line.trim()||line.startsWith('From Verse'))continue;
  const [from,target,votes]=line.split('\t');if(!from||!target||!/^[-\d]+$/.test(votes??''))throw new Error(`Invalid cross-reference row ${i+1}`);
  const [start,end]=target.split('-'),fromRef=normalizeRef(from),toRef=normalizeRef(start!);const id=`openbible:${i}`;
  result.push({id,sourceId:manifest.id,fromRef,toRef,...(end?{endRef:normalizeRef(end)}:{}),votes:Number(votes),provenance:{...provenanceFor(manifest,id),edition:'OpenBible cross-references',locator:`cross_references.txt:${i+1}`,deepLink:`/study/${fromRef}`}});
 }return result;
}
