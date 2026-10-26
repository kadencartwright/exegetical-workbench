import { alignedPassage, referenceEdition } from './versification.ts';
import type { Corpus, Provenance, Token, Distribution, GrammarEntry } from './models.ts';
import { normalizeBook, parseReference, selectReferences, referenceOverlaps } from './references.ts';
import { lexicalKey, strongKey } from './lexical.ts';
export type CorpusOperation='passage'|'token'|'syntax'|'lexicon'|'grammar'|'crossreferences'|'distribution'|'concordance'|'semantic_domain'|'citations'|'sources'|'source'|'source-page'|'coverage'|'provenance';
export interface ConcordanceMatch {ref:string;edition:string;token:Token}
export function matchesConcordance(m:ConcordanceMatch,params:Record<string,string>):boolean {
 return (!params.lemma||lexicalKey(m.token.lemma??'')===lexicalKey(params.lemma)||Boolean(m.token.strong&&strongKey(m.token.strong)===strongKey(params.lemma)))&&(!params.form||lexicalKey(m.token.text)===lexicalKey(params.form))&&(!params.book||m.ref.split('.')[0]===normalizeBook(params.book))&&(!params.edition||m.edition===params.edition);
}
export function summarizeDistribution(matches:ConcordanceMatch[]):Distribution {
 const groups=(key:(m:ConcordanceMatch)=>string)=>{const counts=new Map<string,number>();for(const m of matches){const k=key(m);counts.set(k,(counts.get(k)??0)+1);}return [...counts].sort((a,b)=>b[1]-a[1]||a[0].localeCompare(b[0]));};
 return {total:matches.length,books:groups(m=>m.ref.split('.')[0]!).map(([book,count])=>({book,count})),forms:groups(m=>m.token.text).map(([form,count])=>({form,count})),editions:groups(m=>m.edition).map(([edition,count])=>({edition,count}))};
}
export function grammarForToken(token:Token,grammar:GrammarEntry[]):GrammarEntry[] {
 const categories=new Set(['agreement',...Object.entries(token.morphology??{}).filter(([,value])=>value).map(([key])=>key)]);
 if(token.referents?.length)categories.add('referent');
 return grammar.filter(g=>categories.has(g.category));
}
/** Shared pure adapter used by HTTP/MCP; no network/filesystem or server dependency. */
export function createCorpusAdapter(corpus:Corpus) {
 const passages=new Map(corpus.passages.map(p=>[p.ref,p])),tokens=new Map<string,Token>(),upstreamTokens=new Map<string,Token>(),matches:ConcordanceMatch[]=[],lemmaIndex=new Map<string,ConcordanceMatch[]>();
 for(const p of corpus.passages)for(const e of p.editions)for(const token of e.tokens){tokens.set(token.id,token);if(token.upstreamId)upstreamTokens.set(token.upstreamId,token);if(token.lemma){const m={ref:p.ref,edition:e.id,token};matches.push(m);for(const key of new Set([lexicalKey(token.lemma),...(token.strong?[`strong:${strongKey(token.strong)}`]:[])])){const rows=lemmaIndex.get(key)??[];rows.push(m);lemmaIndex.set(key,rows);}}}
 const coverage=corpus.coverage.map(c=>({...c,source:c.sourceId}));
 const absent=(source:string,scope:string)=>({source,sourceId:source,status:'not-loaded' as const,scope,limitations:['No conclusion can be drawn from an unloaded dataset.']});
 return {query(operation:CorpusOperation,params:Record<string,string>){
  let data:unknown=null,extra:typeof coverage=[],calculationProvenance:Provenance[]=[];
  switch(operation){
   case 'passage': {const selected=parseReference(params.ref??''),refs=selectReferences(params.ref??'',passages.keys());const inputEdition=referenceEdition(params.refEdition); const rows=refs.map(ref=>{const aligned=alignedPassage(ref,passages,inputEdition);return {...aligned,editions:aligned.editions.filter(e=>!params.editions||params.editions.split(',').includes(e.id))};});data=selected.startVerse!==undefined&&!selected.following&&!selected.ref.includes('-')?rows[0]??{ref:selected.ref,editions:[]}:{ref:selected.ref,editions:[],passages:rows};break;}
   case 'token': {const t=tokens.get(params.id??'')??upstreamTokens.get(params.id??'');const related=t?.referents?.map(id=>upstreamTokens.get(id)).filter((token):token is Token=>Boolean(token))??[];
    data=t?{...t,relatedTokens:related,unresolvedReferents:(t.referents??[]).filter(id=>!upstreamTokens.has(id)),analyses:[{sourceId:t.sourceId,morphology:t.morphology,referents:t.referents,provenance:t.provenance}],grammar:grammarForToken(t,corpus.grammar??[]),cautions:['Morphological annotations and referent assignments are sourced analyses, not independent adjudications.','Agreement according to sense is possible; morphology alone does not settle corporate versus individual readings.',...(t.id==='sblgnt:Matt.28.19:8'?['Macula labels this lemma ἑαυτοῦ and Strong 848; this source annotation is preserved. The STEP αὐτός / G846 entry is a separate lexical analysis.']:[])],agreement:related.filter(r=>r.morphology?.gender&&t.morphology?.gender&&r.morphology.gender!==t.morphology.gender).map(r=>({relatedTokenId:r.id,observation:`${t.text} is ${t.morphology!.gender}; ${r.text} is ${r.morphology!.gender} in Macula.`,limitation:'The gender difference is observable; it does not by itself invalidate the referent or establish a corporate/individual interpretation.'}))}:null;break;}
   case 'syntax': {const selected=selectReferences(params.ref??'',passages.keys()),rows=(corpus.syntax??[]).filter(s=>selected.includes(s.ref));const r=parseReference(params.ref??'');data=r.startVerse!==undefined&&!r.following&&!r.ref.includes('-')?rows[0]??null:rows;break;}
   case 'concordance':case 'distribution': {const key=/^G?\d+$/i.test(params.lemma??'')?`strong:${strongKey(params.lemma??'')}`:lexicalKey(params.lemma??'');const rows=(params.lemma?lemmaIndex.get(key)??[]:matches).filter(m=>matchesConcordance(m,params));
    const offset=Math.max(0,Number(params.offset)||0),limit=Math.max(1,Math.min(1000,Number(params.limit)||100));data=operation==='distribution'?summarizeDistribution(rows):rows.slice(offset,offset+limit);if(operation==='distribution')calculationProvenance=[...new Map(rows.map(row=>[row.token.provenance.source+':'+row.token.provenance.version,{...row.token.provenance,locator:`concordance:${params.lemma??''}`,deepLink:`/lexicon?lemma=${encodeURIComponent(params.lemma??'')}`}])).values()];break;}
   case 'lexicon': {const strong=/^G?\d+[A-Z]?$/i.test(params.lemma??'')?strongKey(params.lemma!):undefined,query=lexicalKey(params.lemma??'');data=(corpus.lexicon??[]).filter(e=>(!params.sources||params.sources.split(',').includes(e.sourceId))&&(strong?strongKey(e.strong??'')===strong:[e.lemma,...e.aliases??[]].some(lemma=>lexicalKey(lemma)===query)));if(!corpus.lexicon?.length)extra=[absent('lexicon','No standalone lexicon imported')];break;}
   case 'grammar':data=(corpus.grammar??[]).filter(g=>(!params.category||g.category===params.category)&&(!params.id||g.id===params.id));break;
   case 'crossreferences':data=(corpus.crossreferences??[]).filter(c=>referenceOverlaps({ref:c.fromRef,raw:'',start:0,end:0,versification:'unmapped'},params.ref??'')).sort((a,b)=>b.votes-a.votes);if(!corpus.crossreferences?.length)extra=[absent('openbible','No cross-reference dataset imported')];break;
   case 'citations': data=corpus.citations.filter(c=>referenceOverlaps(c.reference,params.ref??'')).sort((a,b)=>(a.date??'9999').localeCompare(b.date??'9999'));break;
   case 'sources': {const q=(params.q??params.query??'').toLocaleLowerCase();data=corpus.sources.filter(s=>(s.title+' '+corpus.pages.filter(p=>p.sourceId===s.id).map(p=>p.text).join(' ')).toLocaleLowerCase().includes(q)&&(!params.author||s.author?.toLocaleLowerCase().includes(params.author.toLowerCase()))&&(!params.dates||s.date===params.dates));break;}
   case 'source':data=corpus.sources.find(s=>s.id===params.id)??null;break;
   case 'source-page':{const page=corpus.pages.find(p=>p.id===params.locator||p.locator.id===params.locator);data=page?{...page,originalUrl:corpus.sources.find(s=>s.id===page.sourceId)?.originalUrl}:null;break;}
   case 'coverage': {const inventory=(corpus.sourceInventory??[]).map(work=>({source:work.id,sourceId:work.id,status:work.importedPaths.length?'partial' as const:'not-loaded' as const,scope:`${work.state}: ${work.importedPaths.length} English files imported; ${work.omitted.length} paths omitted`,limitations:['Work-level completeness and human review are not established by file availability.','Unloaded or in-progress material was not searched.'],inventory:work}));data=[...coverage,...inventory].filter(c=>!params.source||c.source===params.source||params.source==='reformed-retrieval'&&'inventory' in c);break;}
   case 'provenance': {const id=params.id??params.resource,records=[...corpus.passages.flatMap(p=>p.editions.map(e=>({id:p.ref,provenance:e.provenance}))),...[...tokens.values()],...corpus.sources,...corpus.pages,...corpus.citations,...corpus.lexicon??[],...corpus.grammar??[],...corpus.crossreferences??[]];data=records.filter(r=>r.id===id||r.provenance.locator===id||r.provenance.source===id||r.provenance.edition===id).map(r=>r.provenance);break;}
   case 'semantic_domain':data=[];extra=[absent('semantic-domains','UBS semantic domains excluded from the core pack; M2 optional SA pack')];break;
  }
  const unique=new Map<string,Provenance>();
  function collect(value:unknown):void {if(!value||typeof value!=='object')return;if(Array.isArray(value)){value.forEach(collect);return;}const obj=value as Record<string,unknown>;if(obj.source&&obj.edition&&obj.locator&&obj.license){const p=obj as unknown as Provenance;unique.set(`${p.source}:${p.locator}`,p);return;}for(const v of Object.values(obj))if(typeof v==='object')collect(v);}
  collect(data);collect(calculationProvenance);return {data,coverage:[...coverage,...extra],provenance:[...unique.values()]};
 }};
}
