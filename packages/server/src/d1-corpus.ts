import { referenceOrder, parseReference, parallelReferences, referenceEdition, normalizeBook, lexicalKey, strongKey, type Corpus } from '@exegetical/corpus';
import type { Envelope } from '@exegetical/shared';
import { corpusAdapter } from './corpus-adapter';
import type { CorpusAdapter, CorpusOperation } from './corpus';
import { ServiceError } from './errors';
const normalize = lexicalKey;
const empty = (): Corpus => ({ schemaVersion: 1, passages: [], sources: [], pages: [], citations: [], coverage: [], manifests: [] });
const props: Record<string,string> = { passage:'passages', syntax:'syntax', source:'sources', page:'pages', citation:'citations', coverage:'coverage', manifest:'manifests', lexicon:'lexicon', grammar:'grammar', crossreference:'crossreferences', inventory:'sourceInventory' };
/** Indexed D1 selection; the corpus package owns scholarly interpretation/envelope semantics. */
export function d1Corpus(db: D1Database, bucket?: R2Bucket): CorpusAdapter {
  async function records(where: string, values: (string|number)[] = []) {
    const rows = (await db.prepare(`SELECT kind,id,json,r2_key FROM corpus_records WHERE ${where}`).bind(...values).all<{kind:string;id:string;json:string|null;r2_key?:string}>()).results;
    const shards = new Map<string, {id:string;data:unknown}[]>();
    for (const row of rows) if (row.json===null) {
      if (!bucket || !row.r2_key) throw new ServiceError(503,'corpus-shard-unavailable','An indexed R2 corpus shard is unavailable.');
      if (!shards.has(row.r2_key)) { const object=await bucket.get(row.r2_key); if(!object)throw new ServiceError(503,'corpus-shard-unavailable','Missing indexed corpus shard.'); shards.set(row.r2_key,await object.json()); }
      const value=shards.get(row.r2_key)!.find(v=>v.id===row.id); if(!value)throw new ServiceError(503,'corpus-shard-unavailable','Indexed record is absent from its shard.'); row.json=JSON.stringify(value.data);
    }
    return rows as {kind:string;id:string;json:string}[];
  }
  return { async query(operation: CorpusOperation, params) {
    if (['passage','syntax','citations','crossreferences'].includes(operation)) { try { parseReference(params.ref); } catch { throw new ServiceError(400,'invalid-reference','Expected a supported Scripture reference.'); } }
    const corpus = empty();
    const add = (rows: {kind:string;json:string}[]) => { for (const r of rows) { const key = props[r.kind]; if (key) ((corpus as unknown as Record<string,unknown[]>)[key] ??= []).push(JSON.parse(r.json)); } };
    const metadata = await records("kind IN ('coverage','grammar','catalog')"); add(metadata);
    const counts:Record<string,number> = JSON.parse(metadata.find(r=>r.kind==='catalog')?.json??'{}').counts??{};
    if (!corpus.coverage.length) corpus.coverage.push({ sourceId:'corpus', status:'not-loaded', scope:'No indexed corpus', limitations:['Import the pinned corpus SQL into this D1 database. No corpus search was performed.'] });
    const range = () => { const r=parseReference(params.ref); return [referenceOrder(`${r.book}.${r.startChapter}.${r.startVerse??0}`),referenceOrder(`${r.book}.${r.endChapter}.${r.following?999:r.endVerse??999}`)]; };
    if (operation === 'passage' || operation === 'syntax') {
      let selection; try { selection = parseReference(params.ref); } catch { throw new ServiceError(400,'invalid-reference','Expected a supported Scripture reference.'); }
      if (selection.startVerse !== undefined && selection.startChapter === selection.endChapter && selection.startVerse === selection.endVerse && !selection.following) add(await records("kind=? AND json_extract(json,'$.ref')=?",[operation, selection.ref]));
      else for (let chapter=selection.startChapter; chapter<=selection.endChapter; chapter++) add(await records("kind=? AND json_extract(json,'$.ref') GLOB ?",[operation,`${selection.book}.${chapter}.*`]));
      if(operation==='passage'){const existing=new Set(corpus.passages.map(p=>p.ref));const required=new Set(corpus.passages.flatMap(p=>Object.values(parallelReferences(p.ref,referenceEdition(params.refEdition))).flat()));for(const ref of required)if(!existing.has(ref))add(await records("kind='passage' AND id=?",[ref]));}
      if(operation==='syntax') for(const s of corpus.syntax??[]) add(await records("kind='passage' AND id=?",[s.ref]));
    } else if (operation === 'token') {
      const token = (await records("kind='token' AND (id=? OR json_extract(json,'$.upstreamId')=?)", [params.id,params.id]))[0];
      if (token) { const t = JSON.parse(token.json); add(await records("kind='passage' AND id=?", [t.ref]));
        const loaded=new Set([t.ref]);for(const upstreamId of t.referents??[]){const target=(await records("kind='token' AND json_extract(json,'$.upstreamId')=?",[upstreamId]))[0];if(target){const ref=JSON.parse(target.json).ref;if(!loaded.has(ref)){add(await records("kind='passage' AND id=?",[ref]));loaded.add(ref);}}}
      }
    } else if (operation === 'concordance' || operation === 'distribution') {
      const clauses = ["kind='token'", "id IN (SELECT record_id FROM corpus_lexical_keys WHERE kind='token' AND key IN (?,?))"]; const values: string[] = [normalize(params.lemma),strongKey(params.lemma)];
      if (params.edition) { clauses.push("json_extract(json,'$.edition')=?"); values.push(params.edition); }
      if (params.form) { clauses.push("json_extract(json,'$.normalizedForm')=?"); values.push(normalize(params.form)); }
      if (params.book) { let book; try { book=normalizeBook(params.book); } catch { throw new ServiceError(400,'invalid-reference','Unknown concordance book.'); } clauses.push("json_extract(json,'$.ref') GLOB ?"); values.push(book+'.*'); params={...params,book}; }
      const matches = await records(clauses.join(' AND '), values);
      matches.sort((a,b)=>{const x=JSON.parse(a.json),y=JSON.parse(b.json);return referenceOrder(x.ref)-referenceOrder(y.ref)||x.edition.localeCompare(y.edition)||Number(x.id.split(':').at(-1))-Number(y.id.split(':').at(-1));});
      // Load just the occurrences of this lemma, not every passage in the NT.
      const passages = new Map<string, any>();
      for (const r of matches) { const t = JSON.parse(r.json); let p = passages.get(t.ref); if (!p) passages.set(t.ref,p={ref:t.ref,editions:[]}); let e=p.editions.find((e:any)=>e.id===t.edition); if (!e) p.editions.push(e={id:t.edition,tokens:[],provenance:t.provenance}); const {ref,edition,normalizedLemma,normalizedForm,...token}=t; e.tokens.push(token); }
      corpus.passages = [...passages.values()];
    } else if (operation === 'citations') {
      const [lo,hi]=range(); add(await records("kind='citation' AND id IN (SELECT record_id FROM corpus_ranges WHERE kind='citation' AND start_order<=? AND end_order>=?)",[hi!,lo!]));
    } else if (operation === 'crossreferences') { const [lo,hi]=range(); add(await records("kind='crossreference' AND id IN (SELECT record_id FROM corpus_ranges WHERE kind='crossreference' AND start_order<=? AND end_order>=?)",[hi!,lo!])); }
    else if (operation === 'lexicon') {
      add(await records("kind='lexicon' AND id IN (SELECT record_id FROM corpus_lexical_keys WHERE kind='lexicon' AND key IN (?,?))", [normalize(params.lemma),strongKey(params.lemma)]));
    } else if (operation === 'source-page') {add(await records("kind='page' AND id=?", [params.locator]));for(const page of corpus.pages)add(await records("kind='source' AND id=?",[page.sourceId]));}
    else if(operation==='source')add(await records("kind='source' AND id=?",[params.id]));
    else if(operation==='coverage')add(await records("kind='inventory'"));
    else if (operation === 'sources') {
      const q = (params.q ?? params.query ?? '').trim();
      if (q) {
        const term = '"'+q.replaceAll('"','""')+'"';
        add(await records("kind='source' AND id IN (SELECT DISTINCT source_id FROM corpus_pages_fts WHERE corpus_pages_fts MATCH ?)",[term]));
        // The indexed page search already matched; title matching is included separately.
        add(await records("kind='source' AND instr(lower(json_extract(json,'$.title')),lower(?))>0", [q]));
        corpus.sources = [...new Map(corpus.sources.map(s=>[s.id,s])).values()];
        params = {...params,q:'',query:''};
      } else add(await records("kind='source'"));
    } else if (operation === 'provenance') {
      const id = params.id ?? params.resource;
      const rows = await records("id=? OR (kind='edition' AND json_extract(json,'$.ref')=?) OR json_extract(json,'$.provenance.source')=? OR json_extract(json,'$.provenance.locator')=? OR json_extract(json,'$.provenance.edition')=?",[id,id,id,id,id]);
      const provenance = rows.flatMap(r=> { const v=JSON.parse(r.json); return v.provenance?[v.provenance]:v.editions?.map((e:any)=>e.provenance)??[]; });
      const unique = [...new Map(provenance.map((p:any)=>[JSON.stringify(p),p])).values()];
      return { data:unique,coverage:corpus.coverage.map(c=>({...c,source:c.sourceId})),provenance:unique } as Envelope<unknown>;
    }
    const result = await corpusAdapter(corpus).query(operation, params);
    // An empty indexed selection is different from a dataset missing globally.
    result.coverage = result.coverage.filter(c=>!(c.status==='not-loaded' && ((c.source==='lexicon' && counts.lexicon>0)||(c.source==='openbible' && counts.crossreference>0))));
    return result;
  } };
}
