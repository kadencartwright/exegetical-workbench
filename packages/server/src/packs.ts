import { hebrewGrammar } from './hebrew-grammar';
import { lexicalKey, createCorpusAdapter, referenceOrder, parseReference, normalizeBook, type Corpus } from '@exegetical/corpus';
import type { CorpusAdapter, CorpusOperation } from './corpus';
import { ServiceError } from './errors';
/** Optional packs are separately stored and explicitly installed. Both shells use this adapter. */
export function withPacks(db:D1Database,base:CorpusAdapter):CorpusAdapter {
 const rows=async(kind:string,where='1',args:(string|number)[]=[]) => (await db.prepare(`SELECT json FROM corpus_packs WHERE kind=? AND ${where}`).bind(kind,...args).all<{json:string}>()).results.map(r=>JSON.parse(r.json));
 const covering=async()=> {
  const loaded=(await rows('coverage')).map(c=>({...c,source:c.sourceId}));
  for(const [pack,scope] of [['core','Hebrew, WEB, Westminster Standards, BSB tables'],['sa','Optional UBS dictionaries and semantic domains (CC BY-SA 4.0)'],['nc','Optional LXX (CC BY-NC-SA 4.0)'],['private','Private original-language reception transcriptions']])if(!loaded.some(c=>c.sourceId==='pack:'+pack))loaded.push({source:'pack:'+pack,sourceId:'pack:'+pack,status:'not-loaded',scope,limitations:['This pack was not searched. Install it explicitly before drawing coverage conclusions.']});
  return loaded;
 };
 const envelope=async(data:any)=>({data,coverage:await covering(),provenance:collect(data)});
 const passage=async(ref:string)=>rows('passage','ref=?',[ref]);
 async function getToken(id:string){const found=await rows('token','id=?',[id]);return found[0];}
 const adapter:CorpusAdapter={async query(operation,params){
  try {
   if(['concordance','distribution'].includes(operation)&&params.book)params={...params,book:normalizeBook(params.book)};
   if(['translations','parallel'].includes(operation))params={...params,ref:parseReference(params.ref).ref};
  }catch{throw new ServiceError(400,'invalid-reference','Use a supported biblical reference or book name.');}
  if(operation==='packs')return envelope(await rows('coverage'));
  if(operation==='confessions')return envelope(await rows('confession',params.id?'id=?':'1',params.id?[params.id]:[]));
  if(operation==='translations')return envelope((await rows('translation','ref=?',[params.ref]))[0]??null);
  if(operation==='renderings'){
   const strong=(params.strong||params.lemma).replace(/^([GH])0+(?=\d)/,'$1');
   const result=await db.prepare('SELECT json FROM corpus_pack_renderings WHERE strong=?').bind(strong).first<{json:string}>();
   return envelope(result?JSON.parse(result.json):{strong,renderings:[],status:'No indexed renderings; consult installed pack coverage.'});
  }
  if(operation==='parallel'){
   let map=(await rows('mapping','ref=?',[params.ref]))[0];
   if(!map){let native=params.ref;if(native.startsWith('2Esd.')){const [,c,v]=native.split('.');native=Number(c)<=10?`Ezra.${c}.${v}`:`Neh.${Number(c)-10}.${v}`;}const candidates=(await passage(native)).flatMap(p=>p.editions).filter(e=>e.id==='oshb');if(candidates.length)map={ref:params.ref,hebrewRefs:[native],method:native===params.ref?'Same-number Hebrew comparison; exact correspondence has not been independently verified.':'2 Esdras continuous Ezra–Nehemiah numbering; verse correspondence requires checking.',status:'candidate',provenance:candidates[0].provenance};}
   const hebrew=map? (await Promise.all(map.hebrewRefs.map((r:string)=>passage(r)))).flat().flatMap(p=>p.editions).filter(e=>e.id==='oshb'):[];
   return envelope({ref:params.ref,mapping:map??null,hebrew,status:map?'mapped verse group':'No verified correspondence loaded; use native edition references.'});
  }
  if(operation==='semantic_domain'){
   const domains=await rows('domain',params.id?"(id=? OR json_extract(json,'$.code')=?)":'1',params.id?[params.id,params.id]:[]);
   const entries=domains.length?(await rows('lexicon',"id IN (SELECT record_id FROM corpus_pack_keys WHERE kind='lexicon-domain' AND key=?)",[domains[0].code])):[];
   return envelope({domains:domains.map(d=>({...d,provenance:{...d.provenance,deepLink:'/library?domain='+encodeURIComponent(d.id)}})),entries});
  }
  if(operation==='provenance'){const id=params.id??params.resource;const exact=(await db.prepare('SELECT json FROM corpus_packs WHERE id=?').bind(id).all<{json:string}>()).results.map(r=>JSON.parse(r.json));if(exact.length)return envelope(collect(exact));}
  if(operation==='source-page'){
   const confession=(await rows('confession','id=?',[params.locator]))[0];if(confession)return envelope({id:confession.id,sourceId:confession.provenance.source,locator:{label:confession.id},text:confession.text,provenance:{...confession.provenance,deepLink:'/source-page?locator='+encodeURIComponent(confession.id)}});
   const original=(await rows('original','id=?',[params.locator]))[0];const result=await base.query(operation,params);
   const privatePage=(await rows('page','id=?',[params.locator]))[0];
   return {...result,data:privatePage?{...privatePage,original}:result.data?{...result.data as object,original}:null,provenance:[...result.provenance,...collect(original)]};
  }
  if(operation==='citations'){
   const result=await base.query(operation,params);const p=parseReference(params.ref);const extra=await rows('citation',"ref GLOB ?",[p.book+'.*']);const replaced=new Set(extra.map(c=>c.sourceId));const chosen=extra.filter(c=>referenceOrder(c.reference.endRef??c.reference.ref)>=referenceOrder(`${p.book}.${p.startChapter}.${p.startVerse??0}`)&&referenceOrder(c.reference.ref)<=referenceOrder(`${p.book}.${p.endChapter}.${p.endVerse??999}`));
   return {...result,data:[...(result.data as any[]).filter(c=>!replaced.has(c.sourceId)),...chosen].sort((a,b)=>(a.date??'').localeCompare(b.date??'')),provenance:[...result.provenance,...collect(chosen)]};
  }
  if(operation==='token'){
   const token=await getToken(params.id);
   if(token){const siblings=(await passage(token.ref)).flatMap(p=>p.editions).flatMap(e=>e.tokens);const related=token.referents?.length?await rows('token',"json_extract(json,'$.upstreamId') IN (SELECT value FROM json_each(?))",[JSON.stringify(token.referents)]):[];return envelope({...token,relatedTokens:related,unresolvedReferents:(token.referents??[]).filter((id:string)=>!related.some(t=>t.upstreamId===id)),analyses:siblings.filter(t=>t.text===token.text||(token.strong&&t.strong===token.strong)).map(t=>({source:t.sourceId,morphology:t.morphology,provenance:t.provenance})),grammar:token.sourceId==='lxx'?[]:hebrewGrammar(token),cautions:['Source annotations do not settle interpretation. Hebrew and Greek verse boundaries can differ.']});}
  }
  if(operation==='passage'){
   const result=await base.query(operation,params),selection=parseReference(params.ref),all:any[]=[];for(let chapter=selection.startChapter;chapter<=selection.endChapter;chapter++)all.push(...await rows('passage','ref GLOB ?',[selection.book+'.'+chapter+'.*']));
   const lo=referenceOrder(`${selection.book}.${selection.startChapter}.${selection.startVerse??0}`),hi=referenceOrder(`${selection.book}.${selection.endChapter}.${selection.following?999:selection.endVerse??999}`);
   const extra=all.filter(p=>referenceOrder(p.ref)>=lo&&referenceOrder(p.ref)<=hi);const d=result.data as any, map=new Map<string,any>((d?.passages??(d?[d]:[])).map((p:any)=>[p.ref,{...p,editions:[...(p.editions??[])]}]));
   for(const p of extra){let old=map.get(p.ref);if(!old)map.set(p.ref,old={ref:p.ref,editions:[]});old.editions.push(...p.editions.filter((e:any)=>!params.editions||params.editions.split(',').includes(e.id)));}
   const data=selection.startVerse!==undefined&&!selection.following&&!selection.ref.includes('-')?map.get(selection.ref)??d:{ref:selection.ref,editions:[],passages:[...map.values()].sort((a,b)=>referenceOrder(a.ref)-referenceOrder(b.ref))};
   return {...result,data,coverage:[...result.coverage,...await covering()],provenance:collect(data)};
  }
  if(operation==='syntax'){
   const result=await base.query(operation,params);const extra=await rows('syntax','ref=?',[params.ref]);return extra.length?envelope([... (Array.isArray(result.data)?result.data:result.data?[result.data]:[]),...extra]):result;
  }
  if(operation==='lexicon'){
   const result=await base.query(operation,params);const extra=await rows('lexicon',"id IN (SELECT id FROM corpus_packs WHERE kind='lexicon' AND lemma=? UNION SELECT record_id FROM corpus_pack_keys WHERE kind='lexicon-alias' AND key=?)",[lexicalKey(params.lemma),params.lemma]);return {...result,data:[...result.data as any[],...extra.filter(x=>!params.sources||params.sources.split(',').includes(x.sourceId))],coverage:[...result.coverage,...await covering()],provenance:[...result.provenance,...collect(extra)]};
  }
  if(operation==='concordance'||operation==='distribution'){
   const extra=await rows('token',"lemma=? AND (?='' OR json_extract(json,'$.edition') IN (SELECT value FROM json_each(?))) AND (?='' OR ref GLOB ?) AND (?='' OR form=?)",[lexicalKey(params.lemma),params.edition??'',JSON.stringify((params.edition??'').split(',')),params.book??'',(params.book??'')+'.*',params.form??'',lexicalKey(params.form??'')]);
   const baseEditions=(params.edition??'').split(',').filter(x=>['sblgnt','bsb'].includes(x));
   const baseParams={...params,edition:params.edition&&!baseEditions.length?'__none__':baseEditions.join(',')};
   if(!extra.length){const result=await base.query(operation,baseParams);return {...result,coverage:[...result.coverage,...await covering()]};}
   const baseResult=await base.query('concordance',{...params,edition:params.edition&&!baseEditions.length?'__none__':baseEditions.join(','),offset:'0',limit:'1000'});
   // Retrieve every base occurrence in bounded pages before combining distributions.
   const baseMatches=[...baseResult.data as any[]];if(baseMatches.length===1000){for(let offset=1000;;offset+=1000){const r=await base.query('concordance',{...params,edition:params.edition&&!baseEditions.length?'__none__':baseEditions.join(','),offset:String(offset),limit:'1000'});baseMatches.push(...r.data as any[]);if((r.data as any[]).length<1000)break;}}
   const matches=[...baseMatches,...extra.map(t=>({ref:t.ref,edition:t.edition,token:t}))].sort((a,b)=>referenceOrder(a.ref)-referenceOrder(b.ref)||a.edition.localeCompare(b.edition));
   const corpus:Corpus={schemaVersion:1,passages:[],sources:[],pages:[],citations:[],coverage:[],manifests:[]};const grouped=new Map<string,any>();for(const m of matches){const k=m.ref+':'+m.edition;let p=grouped.get(k);if(!p)grouped.set(k,p={ref:m.ref,editions:[{id:m.edition,tokens:[],provenance:m.token.provenance}]});p.editions[0].tokens.push(m.token);}corpus.passages=[...grouped.values()];const normalized={...params};delete normalized.edition;
   const result=createCorpusAdapter(corpus).query(operation,normalized);return {...result,coverage:[...baseResult.coverage,...await covering()]};
  }
  const result=await base.query(operation,params);if(operation==='coverage'){const packs=(await covering()).filter(c=>!params.source||c.source===params.source);return {...result,data:[...result.data as any[],...packs],coverage:[...result.coverage,...packs]};}return result;
 }};return adapter;
}
function collect(value:any):any[]{const found=new Map();function walk(v:any){if(!v||typeof v!=='object')return;if(v.source&&v.locator&&v.license){found.set(v.source+':'+v.locator,v);return;}for(const x of Object.values(v))walk(x);}walk(value);return [...found.values()];}
