import { normalizeRef, referenceIncludes, type Corpus as CorpusData, type Provenance as CorpusProvenance, type Syntax } from '@exegetical/corpus';
import type { Envelope } from '@exegetical/shared';
import { type CorpusAdapter, type CorpusOperation } from './corpus';
import { ServiceError } from './errors';
import snapshot from '../.generated/corpus.json';

export function corpusAdapter(data: CorpusData & { syntax?: Syntax[] }): CorpusAdapter {
  const coverage = data.coverage.map(c => ({ ...c, source: c.sourceId }));
  const envelope = (value: unknown, provenance: CorpusProvenance[] = [], extra: typeof coverage = []): Envelope<unknown> => ({ data: value, coverage: [...coverage, ...extra], provenance });
  const absent = (sourceId: string) => [{ source: sourceId, sourceId, status: 'not-loaded' as const, scope: 'Not imported', limitations: ['This dataset or feature is not loaded; no conclusion can be drawn from empty results.'] }];
  const ref = (input: string) => { try { return normalizeRef(input); } catch { throw new ServiceError(400, 'invalid-reference', 'Expected a single supported verse reference.'); } };
  const tokens = data.passages.flatMap(p => p.editions.flatMap(e => e.tokens));
  return { query(operation: CorpusOperation, p) {
    switch (operation) {
      case 'passage': {
        const reference = ref(p.ref); const passage = data.passages.find(x => x.ref === reference);
        const editions = passage?.editions.filter(e => !p.editions || p.editions.split(',').includes(e.id)) ?? [];
        return envelope({ ref: reference, editions }, editions.flatMap(e => [e.provenance, ...e.tokens.map(t => t.provenance)]));
      }
      case 'token': {
        const token = tokens.find(t => t.id === p.id);
        return envelope(token ? { ...token, analyses: [{ sourceId: token.sourceId, morphology: token.morphology, referents: token.referents, provenance: token.provenance }], grammar: [], cautions: ['Grammar reference links and independently reviewed grammatical cautions are not loaded. Morphology alone does not decide an exegetical argument.'] } : null, token ? [token.provenance] : [], absent('grammar-reference'));
      }
      case 'syntax': {
        const syntax = data.syntax?.find(s => s.ref === ref(p.ref));
        return envelope(syntax ?? null, syntax ? [syntax.provenance] : [], syntax ? [] : absent('syntax'));
      }
      case 'concordance': {
        const matches = data.passages.flatMap(passage => passage.editions.flatMap(edition => edition.tokens.filter(t => t.lemma === p.lemma && (!p.edition || p.edition === edition.id) && (!p.book || passage.ref.split('.')[0] === p.book) && (!p.form || t.text === p.form)).map(token => ({ ref: passage.ref, edition: edition.id, token }))));
        return envelope(matches, matches.map(m => m.token.provenance), [{ source: 'concordance', sourceId: 'concordance', status: 'partial', scope: 'Only imported passages', limitations: ['Not a whole-Bible concordance; distribution outside loaded passages is unknown.'] }]);
      }
      case 'citations': {
        const reference = ref(p.ref); const matches = data.citations.filter(c => referenceIncludes(c.reference, reference));
        return envelope(matches, matches.map(c => c.provenance));
      }
      case 'sources': {
        const query = (p.q ?? p.query ?? '').toLocaleLowerCase();
        const matches = data.sources.filter(s => (!p.author || s.author?.toLocaleLowerCase().includes(p.author.toLocaleLowerCase())) && (!p.dates || s.date === p.dates) && [s.title, ...data.pages.filter(page => page.sourceId === s.id).map(page => page.text)].some(t => t.toLocaleLowerCase().includes(query)));
        return envelope(matches, matches.map(s => s.provenance));
      }
      case 'source-page': {
        const page = data.pages.find(page => page.id === p.locator || page.locator.id === p.locator);
        return envelope(page ?? null, page ? [page.provenance] : []);
      }
      case 'coverage': {
        const all = [...coverage, ...absent('lexicon'), ...absent('semantic-domains'), ...absent('grammar-reference'), ...absent('cross-references')];
        return { data: p.source ? all.filter(c => c.source === p.source) : all, coverage: all, provenance: [] };
      }
      case 'provenance': {
        const id = p.id ?? p.resource;
        const records = [...data.passages.flatMap(passage => passage.editions.map(edition => ({ id: passage.ref, provenance: edition.provenance }))), ...tokens.map(t => ({ id: t.id, provenance: t.provenance })), ...data.pages, ...data.sources, ...data.citations];
        const matching = records.filter(r => r.id === id || r.provenance.source === id || r.provenance.edition === id || r.provenance.locator === id).map(r => r.provenance);
        const found = [...new Map(matching.map(p => [JSON.stringify(p), p])).values()];
        return envelope(found, found);
      }
      case 'lexicon': return envelope([], [], absent('lexicon'));
      case 'semantic_domain': return envelope([], [], absent('semantic-domains'));
    }
  } };
}
export const bundledCorpus = corpusAdapter(snapshot as unknown as CorpusData & { syntax?: Syntax[] });
