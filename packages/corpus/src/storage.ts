import type { Corpus } from './models.ts';
import { lexicalKey } from './lexical.ts';
/** Stable bucket key shared by Node exports and Worker R2 readers. */
export function recordPartition(id:string):string {let hash=2166136261;for(const c of id){hash^=c.codePointAt(0)!;hash=Math.imul(hash,16777619);}return (hash>>>0&255).toString(16).padStart(2,'0');}
export interface CorpusRecord {kind:string;id:string;book?:string;lemma?:string;form?:string;edition?:string;ref?:string;endRef?:string;sourceId?:string;json:unknown}
/** Lazy rows avoid constructing another full-corpus JSON string or token array. */
export function* corpusRecords(corpus:Corpus):Generator<CorpusRecord> {
 for(const c of corpus.coverage)yield {kind:'coverage',id:c.sourceId,sourceId:c.sourceId,json:c};
 for(const m of corpus.manifests)yield {kind:'manifest',id:m.id,sourceId:m.id,json:m};
 for(const p of corpus.passages){yield {kind:'passage',id:p.ref,book:p.ref.split('.')[0],ref:p.ref,json:p};for(const e of p.editions)for(const token of e.tokens)yield {kind:'token',id:token.id,book:p.ref.split('.')[0],lemma:token.lemma?lexicalKey(token.lemma):undefined,form:lexicalKey(token.text),edition:e.id,ref:p.ref,sourceId:token.sourceId,json:token};}
 for(const s of corpus.syntax??[])yield {kind:'syntax',id:s.ref,book:s.ref.split('.')[0],ref:s.ref,sourceId:s.sourceId,json:s};
 for(const e of corpus.lexicon??[])yield {kind:'lexicon',id:e.id,lemma:lexicalKey(e.lemma),sourceId:e.sourceId,json:e};
 for(const g of corpus.grammar??[])yield {kind:'grammar',id:g.id,sourceId:g.provenance.source,json:g};
 for(const x of corpus.crossreferences??[])yield {kind:'crossreference',id:x.id,book:x.fromRef.split('.')[0],ref:x.fromRef,endRef:x.endRef,sourceId:x.sourceId,json:x};
 for(const s of corpus.sources)yield {kind:'source',id:s.id,sourceId:s.id,json:s};
 for(const p of corpus.pages)yield {kind:'page',id:p.id,sourceId:p.sourceId,json:p};
 for(const c of corpus.citations)yield {kind:'citation',id:c.id,book:c.reference.ref.split('.')[0],ref:c.reference.ref,endRef:c.reference.endRef,sourceId:c.sourceId,json:c};
 for(const s of corpus.sourceInventory??[])yield {kind:'inventory',id:s.id,json:s};
}
