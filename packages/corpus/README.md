# @exegetical/corpus

Typed, provenance-bearing corpus imports for the online Effect service. No AI, translation generation, cloud mutation, or deployment. Runtime querying is pure and Worker-compatible; filesystem/network acquisition is a separate Node entry point. Requires Node >=22.18 (native TypeScript stripping), npm workspace dependencies.

## Build and import

From repository root:

```sh
npm run build --workspace @exegetical/corpus
npm run test --workspace @exegetical/corpus
npm run typecheck --workspace @exegetical/corpus

# Read-only local import: exact HEAD and every MANIFEST.sha256 member verified.
npm run import --workspace @exegetical/corpus -- build \
  --reception /home/agent/code/reformed-retrieval

# Restrict the imported English files, while still checking the entire manifest.
npm run import --workspace @exegetical/corpus -- build \
  --reception /home/agent/code/reformed-retrieval \
  --only completed/1561-11-13-baptism-improperly-administered/english.md

# Optional upstream acquisition, separate from ordinary builds. Fails on checksum drift.
npm run import --workspace @exegetical/corpus -- acquire --source sblgnt
npm run import --workspace @exegetical/corpus -- acquire --source bsb
npm run import --workspace @exegetical/corpus -- acquire --source macula
npm run import --workspace @exegetical/corpus -- build --downloads data/downloads
```

Default build writes ignored `data/generated/corpus.json`, using only bundled verified Matthew 28:19 SBLGNT, BSB, sanitized Macula SBLGNT samples, and one genuine CC0 Calvin English translation (printed CO X/1, pp. 214–215). It includes 20 morphologically annotated Greek tokens, one syntax tree, and two reception references (Matthew 28:19 and Hebrews 5:4). It does **not** represent a full Bible or full reception library.

`--downloads` uses the acquired pinned full files and imports Matthew text only (both editions); syntax and morphology enrichment remains Matthew 28:19. Files outside Matthew in BSB are deliberately unparsed. Macula acquisition is about 15 MB, BSB 4.3 MB, SBLGNT Matthew 235 KB. Do not acquire them merely to run the default build. Publisher BSB URL is mutable: its downloaded content is pinned by SHA-256 and fails closed if changed. Updating pins requires a new audit.

## Server/build integration

`src/index.ts` exports models, `parseVerseText`, `parseMacula`, `splitPages`, `normalizeLocator`, reference extraction/range matching, and `createCorpusAdapter`. `@exegetical/corpus/node` exports Effect-based `buildCorpus`/`importReception`, `receptionFromTexts`, verified acquisition, checksum, and manifest helpers. Keep the Node entry point out of Workers. Effect `tryPromise`/`runPromise` and fast-xml-parser ordered XML options were verified against the installed library declarations/source.

Run the corpus build **before** bundling the Worker, then explicitly import generated JSON and inject the adapter into the server's `createApp`:

```ts
import corpus from '../../../data/generated/corpus.json';
import { createCorpusAdapter, type Corpus, type Syntax } from '@exegetical/corpus';
import { createApp } from './index';
const app = createApp(createCorpusAdapter(corpus as Corpus & { syntax: Syntax[] }));
```

Use the bundler's JSON import support or validate/cast it as `Corpus & { syntax?: Syntax[] }` at the integration boundary. `query` structurally matches the shared server `CorpusAdapter`; it returns `{ data, coverage, provenance }`. Coverage objects include `source` for that contract and retain `sourceId`. Token IDs are `sblgnt:Matt.28.19:8`, etc. `sourceId: macula` identifies the annotation provider while the passage remains SBLGNT. Source page lookup uses `page.id`, a normalized string; `page.locator` is structured metadata. Citation locators are these same IDs. Adapter routes use `q` or `query`, `id` or `resource` as appropriate. No server, infra or migration files are changed here.

Corpus JSON includes `schemaVersion`, `passages`, `syntax`, `sources`, `pages`, `citations`, `scriptureIndex`, `coverage`, and biblical source `manifests`. `scriptureIndex` maps explicit starting verse keys to citation IDs; use `referenceIncludes` for inclusive range queries. Source files are individual coverage units, not a claim that their entire work is complete. Current search is in-memory keyword search; no D1/FTS migration is supplied. A larger corpus should live in R2 or be imported into separately agreed D1 tables rather than bundled into a Worker. The explicit JSON boundary avoids modifying another agent's schema.

## Audit and coverage boundaries

See `data/README.md`, `data/manifests/`, and `data/licenses/`. Source data licenses are separate from application MIT. TTESV, UBS `ln`/`domain`, and all unlisted Macula attributes are excluded by allowlist. Macula syntax is retained with actual upstream rule/group labels and referent IDs; it is not a grammar commentary or independently adjudicated analysis. Notably Macula's actual lemma for αὐτούς is `ἑαυτοῦ`; this is preserved, not silently corrected. The sample's referent points to the actual ἔθνη token. Grammatical observations do not settle a corporate-versus-individual reading.

The reception license audit found that **normalized originals and metadata are not CC0**. The importer reads original bytes only to verify the upstream checksum manifest, then excludes them. `originalUrl` links to the pinned upstream unit containing its witness. Original text is not bundled. English is always labeled `AI-assisted, unreviewed`; a claim in upstream prose that it was checked is not treated as named competent review. Titles come from CC0 English headings, dates from file-unit identifiers; authors are not guessed.

Full reception import was verified at revision `808956974894a625f84160761bc3fa9852d662e1`. The verified run imports 311 eligible completed English file units into 2,347 page segments and 5,318 explicit references (including 14 starting at Matthew 28:19). It does not import uncompleted units; compiled/part duplication has not been adjudicated. Unrecognized page styles remain explicitly unpaginated; a missing locator is not replaced with an invented page. Supported styles include CO, PDF p./page plus printed p./page, pipe-delimited witness/part markers, digital frame signatures, and marginal markers. Repeated markers get explicit occurrence suffixes. Bare `v. 19`, chapter-only references, shorthand lists, and Vulgate/LXX/MT Psalm mapping are not resolved; `ff` references carry an uncertainty flag. There is no standalone lexicon, grammar, cross-reference or versification dataset loaded, and those adapter queries report not-loaded.

Tests cover real samples, morphology, forbidden fields, syntax, references/ranges, page formats/signatures/marginal text, provenance/review status, malformed XML and DTD rejection, checksum corruption, revision mismatches, unsafe paths and manifest errors. This is an M1 corpus foundation, not evidence of full M1 acceptance.
