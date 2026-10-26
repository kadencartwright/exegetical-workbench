import { readFile, mkdir, writeFile } from 'node:fs/promises';
const input = new URL('../../../data/generated/corpus.json', import.meta.url);
const output = new URL('../.generated/corpus.json', import.meta.url);
let corpus;
try {
  corpus = JSON.parse(await readFile(input, 'utf8'));
  if (corpus.schemaVersion !== 1 || !['passages', 'sources', 'pages', 'citations', 'coverage', 'manifests'].every(key => Array.isArray(corpus[key]))) throw new Error('Unsupported corpus snapshot shape');
} catch (error) {
  if (error.code !== 'ENOENT') throw error;
  corpus = { schemaVersion: 1, passages: [], syntax: [], sources: [], pages: [], citations: [], manifests: [], coverage: [{ sourceId: 'corpus', status: 'not-loaded', scope: 'No generated snapshot', limitations: ['Run npm run build --workspace @exegetical/corpus, then rebuild the server. No corpus has been searched.'] }] };
}
await mkdir(new URL('../.generated/', import.meta.url), { recursive: true });
await writeFile(output, JSON.stringify(corpus));
console.log(`Prepared corpus snapshot: ${corpus.passages.length} passages, ${corpus.sources.length} reception sources.`);
