import { describe, expect, it } from 'vitest';
import { type Corpus } from '@exegetical/corpus';
import { corpusAdapter } from '../src/corpus-adapter';
import { createApp, type Env } from '../src/index';
// Structural fixtures only: no invented Bible text or historical claims.
const provenance = { source: 'test-fixture', edition: 'fixture', version: '1', license: 'CC0-1.0', locator: 'test', reviewStatus: 'upstream' as const, deepLink: '/fixture', upstreamUrl: 'https://example.invalid/fixture' };
const corpus: Corpus = { schemaVersion: 1, passages: [{ ref: 'Matt.28.19', editions: [{ id: 'fixture', label: 'Test fixture', language: 'en', text: 'fixture text', tokens: [{ id: 'fixture:Matt.28.19:1', text: 'fixture', lemma: 'test', sourceId: 'test-fixture', provenance }], provenance }] }], sources: [], pages: [], citations: [{ id: 'fixture-citation', sourceId: 'test-fixture', title: 'Test fixture', locator: 'test', excerpt: 'test fixture', reviewStatus: 'upstream', deepLink: '/fixture', provenance, reference: { ref: 'Matt.28.18', endRef: 'Matt.28.20', raw: 'Matthew 28:18–20', start: 0, end: 17, versification: 'unmapped' } }], manifests: [], coverage: [{ sourceId: 'test-fixture', status: 'partial', scope: 'Test fixtures', limitations: ['No research evidence.'] }] };
describe('bundled corpus boundary', () => {
  const adapter = corpusAdapter(corpus);
  it('preserves partial coverage, token provenance and edition filters', async () => {
    const result = await adapter.query('passage', { ref: 'Matthew 28:19' });
    expect((result.data as any).editions[0].tokens[0].id).toBe('fixture:Matt.28.19:1');
    expect(result.coverage[0].status).toBe('partial');
    expect(result.provenance).toContainEqual(provenance);
    expect((await adapter.query('provenance', { resource: 'test-fixture' })).data).toContainEqual(provenance);
    const missing = await adapter.query('passage', { ref: 'John.3.16' });
    expect(missing.data).toEqual({ ref: 'John.3.16', editions: [] });
    expect(missing.coverage[0].limitations).toContain('No research evidence.');
    expect((await adapter.query('passage', { ref: 'Matt.28.19', editions: 'absent' })).data).toEqual({ ref: 'Matt.28.19', editions: [] });
  });
  it('finds inclusive range citations and never substitutes glosses for absent lexicons', async () => {
    expect((await adapter.query('citations', { ref: 'Matt.28.19' })).data).toHaveLength(1);
    const lexical = await adapter.query('lexicon', { lemma: 'test' });
    expect(lexical.data).toEqual([]);
    expect(lexical.coverage.find(c => c.source === 'lexicon')?.status).toBe('not-loaded');
    const concordance = await adapter.query('concordance', { lemma: 'test', book: 'John' });
    expect(concordance.data).toEqual([]);
    expect(concordance.coverage.find(c => c.source === 'concordance')?.status).toBe('partial');
  });
  it('rejects invalid references as client errors through the Effect service', async () => {
    const response = await createApp(adapter).fetch(new Request('https://example.com/api/passage?ref=not-a-verse'), { DB: {} } as Env);
    expect(response.status).toBe(400);
  });
});
