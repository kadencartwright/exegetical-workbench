import { XMLParser, XMLValidator } from 'fast-xml-parser';
import type { Edition, Provenance, SourceManifest, Token } from './models.ts';
import { normalizeBook, normalizeRef } from './references.ts';
export const provenanceFor = (m: SourceManifest, locator: string): Provenance => ({source:m.id,edition:m.id==='macula'?'Macula SBLGNT':m.id.toUpperCase(),version:m.revision,license:m.license,locator,reviewStatus:'upstream',deepLink:`/study/${encodeURIComponent(locator)}`,upstreamUrl:m.upstreamUrl});
export const ntBooks=['Matt','Mark','Luke','John','Acts','Rom','1Cor','2Cor','Gal','Eph','Phil','Col','1Thess','2Thess','1Tim','2Tim','Titus','Phlm','Heb','Jas','1Pet','2Pet','1John','2John','3John','Jude','Rev'];
export function parseVerseText(input: string, manifest: SourceManifest): Map<string,Edition> {
 const result=new Map<string,Edition>();
 for(const line of input.replace(/^\uFEFF/,'').split(/\r?\n/)) {
  const m=/^(.+?) (\d+):(\d+)\t(.*)$/.exec(line); if(!m)continue;
  const book=normalizeBook(m[1]!);if(!ntBooks.includes(book))continue;
  const ref=`${book}.${m[2]}.${m[3]}`,text=m[4]!.trim(), provenance=provenanceFor(manifest,ref);
  if(result.has(ref))throw new Error(`Duplicate verse: ${ref}`);
  result.set(ref,{id:manifest.id,label:manifest.id.toUpperCase(),language:manifest.id==='bsb'?'en':'el',text,...(!text?{textStatus:'empty-upstream' as const}:{}),tokens:(text?text.split(/\s+/):[]).map((text,i)=>({id:`${manifest.id}:${ref}:${i+1}`,text,sourceId:manifest.id,provenance})),provenance});
 }
 if(!result.size)throw new Error(`No supported NT verse rows in ${manifest.id}`);
 return result;
}
export interface SyntaxNode { kind: string; attributes: Record<string,string>; text?: string; children: SyntaxNode[] }
export interface Syntax { ref: string; sourceId: string; trees: SyntaxNode[]; tokens: Token[]; provenance: Provenance; limitations?:string[] }
const safe=new Set(['ref','after','class','type','lemma','normalized','strong','number','gender','case','gloss','morph','unicode','person','voice','tense','mood','referent','role','rule','xml:id']);
const maculaBooks:Record<string,string>=Object.fromEntries(['MAT','MRK','LUK','JHN','ACT','ROM','1CO','2CO','GAL','EPH','PHP','COL','1TH','2TH','1TI','2TI','TIT','PHM','HEB','JAS','1PE','2PE','1JN','2JN','3JN','JUD','REV'].map((code,i)=>[code,ntBooks[i]!]));
export function transliterateGreek(text:string):string {
 const chars:Record<string,string>={α:'a',β:'b',γ:'g',δ:'d',ε:'e',ζ:'z',η:'ē',θ:'th',ι:'i',κ:'k',λ:'l',μ:'m',ν:'n',ξ:'x',ο:'o',π:'p',ρ:'r',σ:'s',ς:'s',τ:'t',υ:'y',φ:'ph',χ:'ch',ψ:'ps',ω:'ō'};
 return [...text.normalize('NFD').replace(/\p{M}/gu,'').toLowerCase()].map(c=>chars[c]??c).join('');
}
/** One XML parse per book; every syntax group is projected onto its verse's words.
 * Cross-verse groups retain their labels/IDs; no new dependency edges are inferred.
 */
export function parseMaculaBook(xml:string,manifest:SourceManifest):Syntax[] {
 if(/<!DOCTYPE|<!ENTITY/i.test(xml))throw new Error('DTD/entity declarations are not accepted');
 const valid=XMLValidator.validate(xml);if(valid!==true)throw new Error(`Invalid Macula XML: ${valid.err.msg}`);
 const raw=new XMLParser({maxNestedTags:256,ignoreAttributes:false,attributeNamePrefix:'',preserveOrder:true,trimValues:false,parseTagValue:false}).parse(xml) as Record<string,unknown>[];
 const verses=new Map<string,Syntax>();
 function visit(items:Record<string,unknown>[]):Map<string,SyntaxNode[]> {
  const results=new Map<string,SyntaxNode[]>();
  for(const item of items){
   const tag=Object.keys(item).find(k=>k!==':@'&&k!=='#text');if(!tag||tag.startsWith('?')||tag==='p'||tag==='milestone')continue;
   const attrs=(item[':@']??{}) as Record<string,string>,attributes=Object.fromEntries(Object.entries(attrs).filter(([k])=>safe.has(k)));
   if(tag==='w'){
    const m=/^(\w+) (\d+):(\d+)!(\d+)$/.exec(attrs.ref??'');if(!m||!maculaBooks[m[1]!])throw new Error(`Unknown Macula word reference: ${attrs.ref}`);
    const ref=`${maculaBooks[m[1]!]}.${m[2]}.${m[3]}`;
    const syntax=verses.get(ref)??{ref,sourceId:manifest.id,trees:[],tokens:[],provenance:provenanceFor(manifest,ref)};verses.set(ref,syntax);
    const text=(item[tag] as Record<string,unknown>[]).map(p=>String(p['#text']??'')).join('');
    const partOfSpeech=({pron:'pronoun',adj:'adjective',adv:'adverb',conj:'conjunction',prep:'preposition',det:'determiner',num:'numeral',ptcl:'particle',interj:'interjection'} as Record<string,string>)[attrs.class??'']??attrs.class;
    const morphology={code:attrs.morph,gender:attrs.gender,number:attrs.number,case:attrs.case,person:attrs.person,tense:attrs.tense,voice:attrs.voice,mood:attrs.mood,partOfSpeech,description:[partOfSpeech,attrs.person?`${attrs.person} person`:undefined,...['number','gender','case','tense','voice','mood'].map(k=>attrs[k])].filter(Boolean).join(', ')};
    syntax.tokens.push({id:`sblgnt:${ref}:${m[4]}`,text,lemma:attrs.lemma,strong:attrs.strong,gloss:attrs.gloss,transliteration:transliterateGreek(text),morphology,sourceId:manifest.id,upstreamId:attrs['xml:id'],referents:attrs.referent?.split(/\s+/),provenance:syntax.provenance});
    const group=results.get(ref)??[];group.push({kind:'word',attributes,text,children:[]});results.set(ref,group);
   }else {
    const children=Array.isArray(item[tag])?visit(item[tag] as Record<string,unknown>[]):new Map<string,SyntaxNode[]>();
    for(const [ref,nodes] of children){const group=results.get(ref)??[];group.push({kind:tag,attributes,children:nodes});results.set(ref,group);}
   }
  }
  return results;
 }
 const trees=visit(raw);
 for(const [ref,syntax] of verses){syntax.trees=trees.get(ref)??[];syntax.tokens.sort((a,b)=>Number(a.id.split(':').at(-1))-Number(b.id.split(':').at(-1)));const ids=syntax.tokens.map(t=>t.id);if(new Set(ids).size!==ids.length)throw new Error(`Duplicate Macula token ID in ${ref}`);}
 if(!verses.size)throw new Error('No Macula words');return [...verses.values()];
}
export function parseMacula(xml:string,manifest:SourceManifest,selectedRef='Matt.28.19'):Syntax {
 const ref=normalizeRef(selectedRef),verse=parseMaculaBook(xml,manifest).find(s=>s.ref===ref);if(!verse)throw new Error(`No Macula words for ${ref}`);return verse;
}
