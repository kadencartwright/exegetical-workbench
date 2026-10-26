import type { Corpus, Provenance } from './models.ts';
import type { Syntax } from './bible.ts';
import { normalizeRef, referenceIncludes } from './references.ts';
export type CorpusOperation='passage'|'token'|'syntax'|'lexicon'|'concordance'|'semantic_domain'|'citations'|'sources'|'source-page'|'coverage'|'provenance';
/** Structural adapter for the shared service contract, without filesystem or server dependencies. */
export function createCorpusAdapter(corpus:Corpus & {syntax?:Syntax[]}) {
 const tokens=corpus.passages.flatMap(p=>p.editions.flatMap(e=>e.tokens));
 const provenance=[...corpus.passages.flatMap(p=>p.editions.map(e=>e.provenance)),...corpus.sources.map(s=>s.provenance),...corpus.pages.map(p=>p.provenance)];
 const coverage=corpus.coverage.map(c=>({...c,source:c.sourceId}));
 return {query(operation:CorpusOperation,params:Record<string,string>){
  let data:unknown=null,extra:typeof coverage=[];
  const ref=()=>normalizeRef(params.ref??'');
  switch(operation){
   case 'passage': {const p=corpus.passages.find(p=>p.ref===ref());data=p?{...p,editions:p.editions.filter(e=>!params.editions||params.editions.split(',').includes(e.id))}:null;break;}
   case 'token': {const t=tokens.find(t=>t.id===params.id);data=t?{...t,analyses:[{sourceId:t.sourceId,morphology:t.morphology,provenance:t.provenance}],grammar:[],cautions:['Morphological annotations do not settle interpretation.','No reference grammar treatment has been imported.']}:null;break;}
   case 'syntax': data=corpus.syntax?.find(s=>s.ref===ref())??null;break;
   case 'concordance':data=tokens.filter(t=>t.lemma===params.lemma&&(!params.form||t.text===params.form)&&(!params.book||t.id.split(':')[1]?.startsWith(params.book+'.'))&&(!params.edition||t.id.startsWith(params.edition+':')));break;
   case 'citations': data=corpus.citations.filter(c=>referenceIncludes(c.reference,ref())).sort((a,b)=>(a.date??'9999').localeCompare(b.date??'9999'));break;
   case 'sources': {const q=(params.q??params.query??'').toLocaleLowerCase();data=corpus.sources.filter(s=>(s.title+' '+corpus.pages.filter(p=>p.sourceId===s.id).map(p=>p.text).join(' ')).toLocaleLowerCase().includes(q)&&(!params.author||s.author===params.author)&&(!params.dates||s.date===params.dates));break;}
   case 'source-page':data=corpus.pages.find(p=>p.id===params.locator)??null;break;
   case 'coverage':data=coverage.filter(c=>!params.source||c.source===params.source);break;
   case 'provenance': {const id=params.id??params.resource;data=[...provenance,...tokens.filter(t=>t.id===id).map(t=>t.provenance)].filter(p=>p.locator===id||p.source===id||p.edition===id||tokens.some(t=>t.id===id&&t.provenance===p));break;}
   case 'lexicon':case 'semantic_domain':data=[];extra=[{source:operation,sourceId:operation,status:'not-loaded',scope:'No dataset loaded',limitations:[operation==='semantic_domain'?'UBS semantic domains are excluded from the core pack.':'No standalone lexicon imported; interlinear glosses are not a lexicon.']}];break;
  }
  const unique=new Map<string,Provenance>();
  function collect(value:unknown):void {if(!value||typeof value!=='object')return;if(Array.isArray(value)){value.forEach(collect);return;}const obj=value as Record<string,unknown>;if(obj.source&&obj.edition&&obj.locator&&obj.license){const p=obj as unknown as Provenance;unique.set(`${p.source}:${p.locator}`,p);return;}for(const [key,v] of Object.entries(obj))if(key==='provenance'||typeof v==='object')collect(v);}
  collect(data);
  return {data,coverage:[...coverage,...extra],provenance:[...unique.values()]};
 }};
}
