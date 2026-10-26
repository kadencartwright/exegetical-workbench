import { XMLParser, XMLValidator } from 'fast-xml-parser';
import type { Edition, Provenance, SourceManifest, Token } from './models.ts';
export const provenanceFor = (m: SourceManifest, locator: string): Provenance => ({source:m.id,edition:m.id==='macula'?'Macula SBLGNT':m.id.toUpperCase(),version:m.revision,license:m.license,locator,reviewStatus:'upstream',deepLink:`/study/${locator}`,upstreamUrl:m.upstreamUrl});
export function parseVerseText(input: string, manifest: SourceManifest): Map<string,Edition> {
 const result=new Map<string,Edition>();
 for(const line of input.replace(/^\uFEFF/,'').split(/\r?\n/)) {
  const m=/^(Matt|Matthew) (\d+):(\d+)\t(.+)$/.exec(line); if(!m)continue;
  const ref=`Matt.${m[2]}.${m[3]}`,text=m[4]!.trim(), provenance=provenanceFor(manifest,ref);
  result.set(ref,{id:manifest.id,label:manifest.id.toUpperCase(),language:manifest.id==='bsb'?'en':'el',text,tokens:text.split(/\s+/).map((text,i)=>({id:`${manifest.id}:${ref}:${i+1}`,text,sourceId:manifest.id,provenance})),provenance});
 }
 if(!result.size)throw new Error(`No supported Matthew verse rows in ${manifest.id}`);
 return result;
}
export interface SyntaxNode { kind: string; attributes: Record<string,string>; text?: string; children: SyntaxNode[] }
export interface Syntax { ref: string; sourceId: string; trees: SyntaxNode[]; tokens: Token[]; provenance: Provenance }
const safe=new Set(['ref','after','class','type','lemma','normalized','strong','number','gender','case','gloss','morph','unicode','person','voice','tense','mood','referent','role','rule','xml:id']);
/** Lowfat ordered XML parser; copies an explicit attribute allowlist, never whole upstream objects. */
export function parseMacula(xml: string, manifest: SourceManifest, selectedRef='Matt.28.19'): Syntax {
 if(/<!DOCTYPE|<!ENTITY/i.test(xml))throw new Error('DTD/entity declarations are not accepted');
 const valid=XMLValidator.validate(xml); if(valid!==true)throw new Error(`Invalid Macula XML: ${valid.err.msg}`);
 const raw=new XMLParser({ignoreAttributes:false,attributeNamePrefix:'',preserveOrder:true,trimValues:false,parseTagValue:false}).parse(xml) as Record<string,unknown>[];
 const tokens:Token[]=[], provenance=provenanceFor(manifest,selectedRef);
 function visit(items: Record<string,unknown>[]): SyntaxNode[] {
  return items.flatMap(item=>{
   const tag=Object.keys(item).find(k=>k!==':@'&&k!=='#text'); if(!tag||tag.startsWith('?'))return [];
   const attrs=(item[':@']??{}) as Record<string,string>;
   if(tag==='w') {
    const m=/^MAT (\d+):(\d+)!(\d+)$/.exec(attrs.ref??''); if(!m||`Matt.${m[1]}.${m[2]}`!==selectedRef)return [];
    const parts=item[tag] as Record<string,unknown>[]; const text=parts.map(p=>String(p['#text']??'')).join('');
    const morphology={code:attrs.morph,gender:attrs.gender,number:attrs.number,case:attrs.case,description:['class','person','number','gender','case','tense','voice','mood'].map(k=>attrs[k]).filter(Boolean).join(', ')};
    tokens.push({id:`sblgnt:${selectedRef}:${m[3]}`,text,lemma:attrs.lemma,gloss:attrs.gloss,morphology,sourceId:manifest.id,upstreamId:attrs['xml:id'],referents:attrs.referent?.split(/\s+/),provenance});
    return [{kind:'word',attributes:Object.fromEntries(Object.entries(attrs).filter(([k])=>safe.has(k))),text,children:[]}];
   }
   const children=Array.isArray(item[tag])?visit(item[tag] as Record<string,unknown>[]):[];
   if(!children.length)return [];
   return [{kind:tag,attributes:Object.fromEntries(Object.entries(attrs).filter(([k])=>safe.has(k))),children}];
  });
 }
 const trees=visit(raw); tokens.sort((a,b)=>Number(a.id.split(':').at(-1))-Number(b.id.split(':').at(-1)));
 if(!tokens.length)throw new Error(`No Macula words for ${selectedRef}`);
 return {ref:selectedRef,sourceId:manifest.id,trees,tokens,provenance};
}
