import { Context, Effect } from 'effect';
import type { Envelope } from '@exegetical/shared';
import { ServiceError } from './errors';
export type CorpusOperation = 'passage' | 'token' | 'syntax' | 'lexicon' | 'concordance' | 'semantic_domain' | 'citations' | 'sources' | 'source-page' | 'coverage' | 'provenance';
export interface CorpusAdapter { query(operation: CorpusOperation, params: Record<string, string>): Envelope<unknown> | Promise<Envelope<unknown>> }
export class Corpus extends Context.Tag('Corpus')<Corpus, CorpusAdapter>() {}
export const queryCorpus = (operation: CorpusOperation, params: Record<string, string>) => Effect.gen(function* () {
  const corpus = yield* Corpus;
  return yield* Effect.tryPromise({ try: () => Promise.resolve(corpus.query(operation, params)), catch: error => error instanceof ServiceError ? error : new ServiceError(503, 'corpus-unavailable', 'The corpus could not be queried.') });
});
export const unavailableCorpus: CorpusAdapter = {
  query(operation, params) {
    const coverage = [{ source: 'corpus', status: 'not-loaded' as const, limitations: ['No corpus package adapter has been loaded. No search or analysis was performed.'] }];
    return { data: operation === 'passage' ? { ref: params.ref, editions: [] } : operation === 'coverage' ? coverage : operation === 'token' || operation === 'source-page' || operation === 'syntax' || operation === 'provenance' ? null : [], coverage, provenance: [] };
  },
};
