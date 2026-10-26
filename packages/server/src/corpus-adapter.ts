import { createCorpusAdapter, type Corpus as CorpusData } from '@exegetical/corpus';
import type { CorpusAdapter } from './corpus';
import { ServiceError } from './errors';
/** One scholarly query implementation, shared with the importer. Preserve HTTP error/envelope compatibility. */
export function corpusAdapter(data: CorpusData): CorpusAdapter {
  const adapter = createCorpusAdapter(data);
  return { async query(operation, params) {
    try {
      const result = await adapter.query(operation as Parameters<typeof adapter.query>[0], params);
      if (operation === 'passage' && result.data === null) result.data = { ref: params.ref, editions: [] };
      return result;
    } catch (error) {
      if (['passage', 'syntax', 'citations', 'crossreferences'].includes(operation)) throw new ServiceError(400, 'invalid-reference', 'Expected a supported Scripture reference.');
      throw error;
    }
  } };
}
