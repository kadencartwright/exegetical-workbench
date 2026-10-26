# @exegetical/corpus

Provenance-bearing NT and reception imports for the Effect services. Runtime exports are pure and Worker-compatible. Network, checksum verification, local reception acquisition and export use the separate Node entry point. No cloud writes, translation generation or agent reasoning.

## Full import

Requires Node >=22.18 and workspace dependencies. Run from repository root:

```sh
# Fetch every pinned biblical/lexical/reference input; validates all byte hashes.
npm run import --workspace @exegetical/corpus -- acquire --source all

# Explicit full import; verifies the entire read-only reception manifest and exact HEAD.
node --max-old-space-size=6144 --experimental-strip-types packages/corpus/src/cli.ts \
  build --refresh --downloads data/downloads \
  --reception /home/agent/code/reformed-retrieval --export

npm run test --workspace @exegetical/corpus
npm run typecheck --workspace @exegetical/corpus
CORPUS_FULL=1 node --experimental-strip-types --test packages/corpus/test/full-import.test.ts
```

`acquire --source ID` supports `sblgnt`, `macula`, `bsb`, `step-tbesg`, `abbott-smith`, `openbible`, and audit-only `step-lsj`. The exact revisions, per-file hashes, license notice hashes, attribution and field exclusions are in `data/manifests/sources.json`. `acquire all` is intentionally separate from ordinary builds; mutable publisher downloads fail on checksum drift. A pin update requires a new source/license audit.

Normal `build` preserves an existing generated corpus, so a web/server build cannot silently replace full data with the former one-verse sample. A fresh corpus CLI build imports the already-acquired full sources and local pinned reception checkout. The root application build does not invoke corpus import. `build --sample` explicitly writes `data/generated/sample-corpus.json`; it cannot replace `corpus.json`. `--only` limits eligible reception English files while still verifying every upstream manifest member. Never label such a restricted run full reception coverage.

## Actual imported coverage

The verified full run includes all 27 SBLGNT books and all 27 Macula SBLGNT lowfat books, full BSB NT text, all TBESG brief Greek lexical rows, full Abbott-Smith TEI entries (including the irregular-verb appendix), the entire OpenBible reference archive, and all eligible pinned reception English files. See `data/audits/m1-full-import.json` for checked counts, edition differences, referent-resolution gaps, Matthew 28:19 evidence and lemma distribution. No absent verse is synthesized or copied between editions.

Macula morphology has plain-English part-of-speech descriptions plus person, number, gender, case, tense, voice and mood. Basic transliteration is an accent-stripped letter transliteration; it is not a pronunciation guide and does not encode rough breathing. Syntax groups are preserved with actual upstream labels and projected onto each verse when a sentence spans verses. Referents remain upstream word IDs. Unresolved targets are enumerated in the full audit rather than guessed. Full source nesting reaches 159 levels in Luke; the parser accepts up to 256 and rejects DTD/entities and excessive depth. UBS `ln/domain`, Cherith `english/mandarin`, and unlisted attributes are excluded by allowlist.

Macula labels Matthew 28:19 αὐτούς with lemma `ἑαυτοῦ` and Strong `848`. Preserve this annotation and show its provenance; do not silently rewrite it to `αὐτός`/846. The two standalone lexicons provide the latter lookup separately. Macula's masculine αὐτούς points to the actual neuter ἔθνη token. Robertson pp. 683–684 explicitly treats this as reference according to sense. Ten source-linked grammar explanations state what their categories can and cannot establish. They are application explanations, never invented quotations or a determination of the corporate/individual dispute.

Reception import includes only upstream CC0 `completed/*/english.md` and `completed/*/parts/*-english.md`. Normalized originals, metadata and all in-progress English are outside that dedication; they are linked, not redistributed. `sourceInventory` lists all 82 completed and 28 in-progress work directories, imported paths and every pinned omitted path with reasons, including README-only projects. Every imported quote remains `AI-assisted, unreviewed`. Compiled/part duplication and work-level completeness have not been adjudicated. Bare verse shorthand, ambiguous Psalm numbering and omitted translations cannot support claims that an author is silent.

## Query and storage contract

See `docs/m1-corpus-contract.md`. `createCorpusAdapter` is the single pure implementation for server and MCP operations. It adds real `lexicon`, `grammar`, `crossreferences`, `distribution`, filtered/paginated `concordance`, range reading and syntax, and work-level coverage inventory. Single-verse passage and syntax shapes are retained. A range passage adds `passages`; `editions` stays empty at its range wrapper. References support book aliases, chapters, closed chapter/verse ranges and chapter-bounded `ff` navigation. Historical `ff` citations remain unexpanded and uncertain. Selected whole-verse NT correspondence groups are audited in `data/manifests/versification.json`; exhaustive TVTMS/Psalm alignment is not claimed. `passage` accepts `refEdition: "sblgnt" | "bsb"` (default SBLGNT), retaining native token IDs and recording mapped source references.

`@exegetical/corpus` exports typed models, parsers, reference utilities, lexical normalization, `corpusRecords`, `recordPartition`, and `createCorpusAdapter`. `@exegetical/corpus/node` exports Effect import functions, acquisition/checksum helpers, `writeCorpusJson`, and `exportCorpusStorage`.

The full streamed snapshot is roughly 455 MB and is **not a Worker module import**. `--export` produces streaming `storage/corpus.ndjson`, R2 shards under `storage/r2/records/{kind}/{partition}.json`, and a small `catalog.json` with counts/coverage/inventory/checksums. Individual R2 objects stay below 1 MB in the verified run. `export-report.json` records actual sizes. The optional `standalone-corpus.sql` uses a dedicated schema with indexed scalar columns and R2 pointers for large payloads; statements are checked against Cloudflare's documented 100 KB limit. Do not mix that alternative schema with the server-owned migration/index pipeline. The server's `index-corpus.mjs` consumes NDJSON into its own D1 schema; services/parent owns runtime bindings, migrations and deployment.

Tests exercise real audited lexical/token/grammar evidence; filter intersections and pagination totals; aliases and ranges; cross-reference intervals; source pin corruption and excluded-file verification; deep trees and prohibited attributes; exact page locators; streaming storage, oversized rows and build preservation. The full acceptance test streams all generated records and independently counts the ἔθνος lemma in raw pinned XML.
