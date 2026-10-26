# M1 corpus integration contract

Corpus ownership: `packages/corpus`, `data`, and this document. Additive schema version 1; existing passage, token, source, page, citation and envelope shapes remain available. Runtime exports from `@exegetical/corpus` are Worker-safe; acquisition/export functions are only in `@exegetical/corpus/node`.

## Query extensions

Use `createCorpusAdapter` as the shared implementation rather than maintaining a divergent server switch. Existing operations remain; additions are `source`, `grammar`, `crossreferences`, `distribution`. All return `{ data, coverage, provenance }`.

- `lexicon {lemma, sources?}` returns `LexiconEntry[]`: `{id, sourceId, lemma, strong?, transliteration?, gloss?, definition, provenance}`. `sources` is comma-separated; matching tolerates Greek accent/case and accepts Strong IDs. A lexicon is separate from an interlinear gloss. UBS domains remain excluded.
- `grammar {category?, id?}` returns `GrammarEntry[]`: `{id, category, title, summary, canEstablish, cannotEstablish, url, locator, provenance}`. Summaries are explicitly application explanations; upstream links identify real grammar sections, never fabricated quotations.
- `token {id}` preserves the token and adds `analyses`, `grammar: GrammarEntry[]`, `cautions: string[]`, `relatedTokens`, `unresolvedReferents`, and where applicable `agreement: {relatedTokenId, observation, limitation}[]`. Morphological categories select grammar entries; the Matt 28:19 comparison describes masculine/neuter annotations without settling corporate/individual exegesis.
- `crossreferences {ref}` returns `CrossReference[]`: `{id, fromRef, toRef, endRef?, votes, sourceId, provenance}`. These are editorial links, not proof of shared meaning. OT targets may be outside the NT reader.
- `concordance {lemma, book?, form?, edition?, offset?, limit?}` preserves an array of `{ref, edition, token}` matching the server's existing shape. Filters are intersected; book aliases and normalized Greek forms are accepted. Default limit 100, maximum 1000. Distribution covers all matches before pagination.
- `distribution {lemma, book?, form?, edition?}` returns `{total, books: {book,count}[], forms: {form,count}[], editions: {edition,count}[]}`.
- `passage {ref, editions?, refEdition?}` preserves `{ref, editions}` for a single verse; ranges add `passages: Passage[]`, keeping `ref` as the normalized range and `editions: []`. `refEdition` defaults to `sblgnt` and also accepts `bsb`. Selected audited split/merged NT groups combine whole verses while preserving native token IDs, `sourceRefs` and per-part provenance; the UI uses the default convention. Chapter/range navigation uses loaded verses; `ff` ends at the loaded chapter's end and is an application navigation convention, never an inferred historical citation extent.
- `syntax {ref}` preserves a single `Syntax`; ranges return an array. `citations` uses interval overlap. Explicit citation `ff` uncertainty remains unexpanded.

## Storage boundary

`Corpus` adds optional `lexicon`, `grammar`, `crossreferences`, `sourceInventory`, and `syntax` arrays. Full generated data is not a Worker import. The Node exporter writes partitioned R2 JSON objects and a small `catalog.json`, plus streaming NDJSON and D1-compatible SQL with `{kind,id,json}` records and indexes. SQL uses a dedicated `corpus_records` table and never changes private notes tables. The exact R2 keys and D1 query patterns are recorded below. Application D1 uses its separate server-owned index pipeline.

Normal builds preserve an existing generated corpus. Explicit sample builds use a separate sample output; replacing full data requires an explicit import. Full inputs are pinned in `data/manifests/sources.json` with checksum and per-source license notices. Reception import verifies every upstream MANIFEST member read-only. `sourceInventory` lists completed and in-progress works, imported English paths and omitted paths/reasons; an empty citation search never means an author is silent.

## Integration status

Full import and full-data acceptance completed. Parent/services/UI consume additive fields through the shared pure adapter. Evidence is in `data/audits/m1-full-import.json`; generated large artifacts remain ignored locally. The application D1 index has been loaded and verified locally; cloud provisioning is deferred.

## Implemented export layout

`corpus build --refresh --downloads data/downloads --reception /home/agent/code/reformed-retrieval --export` writes `data/generated/corpus.json` atomically using streamed top-level arrays, and `data/generated/storage/{standalone-corpus.sql,corpus.ndjson,export-report.json,r2/}`. Ordinary `build` preserves an existing snapshot, including a full imported corpus. Explicit `build --sample` writes `sample-corpus.json` and cannot replace `corpus.json`.

Alternative standalone SQL schema (distinct from services-owned migration 0003 and its `corpus-index.sql`; do not mix these table layouts): `corpus_records(kind,id,book,lemma,form,edition,ref,end_ref,source_id,json,r2_key,PRIMARY KEY(kind,id))`. Kinds: `passage`, `token`, `syntax`, `lexicon`, `grammar`, `crossreference`, `source`, `page`, `citation`, `inventory`. Indexes cover `(kind,book,ref)`, `(kind,lemma,book,edition,form)`, `(kind,source_id)`. `lemma` and `form` are accent/case-insensitive Greek keys (`lexicalKey`). Query `json` and parse it; when null, fetch `r2_key` and find `{id,data}` by ID. Each SQL statement is checked against Cloudflare's current 100,000-byte limit; payloads over 70 KB use R2. Notes tables are untouched.

R2 keys are `records/{kind}/{recordPartition(id)}.json` (array of `{id,data}`); use the exported deterministic `recordPartition`. `r2/catalog.json` contains coverage, manifests, grammar, sourceInventory, all loaded reference keys, per-kind counts, and every shard's bytes/checksum. It contains no passage/token/syntax/lexicon/crossreference/reception bodies. File export is local only: upload and D1 execution belong to services/parent integration. Keep all large JSON outside the Worker module graph.

For D1 concordance, select `kind='token' AND lemma=?` plus optional `book`, `edition`, `form`; count/group before applying limit/offset. Only annotated Greek tokens have `lemma`. SQL sorts of verse IDs must use numeric chapter/verse parts rather than lexical ordering. For citations, compare interval bounds numerically; do not equate a citation's starting verse index with complete range coverage. Use `referenceOverlaps` for final filtering. Source keyword search can use the page records or a services-owned FTS index.

`Edition` also adds optional `textStatus: 'empty-upstream'`. The full BSB file has 7,957 NT verse slots, including 16 explicitly blank slots (7,941 nonempty texts). These remain `{text:'',tokens:[],textStatus:'empty-upstream'}`. No wording is borrowed from another edition. Macula has 137,741 annotated Greek tokens across 7,939 verse syntax records; its unknown-referent placeholder `n00000000000` is preserved and reported in the audit. `coverage` query data includes additional per-work inventory coverage rows; normal result envelope coverage stays at dataset granularity.

Streaming NDJSON now includes `coverage` and `manifest` record kinds as well as the content kinds above. Consumers must not insert those twice from both NDJSON and catalog metadata. The services-owned SQL pipeline is authoritative for application integration; standalone SQL is an alternative export only.

## Final corpus acceptance and remaining boundaries

All 21 corpus tests pass with `CORPUS_FULL=1`, including the streamed full-data acceptance test. Final record counts: 7,959 union passages; 7,939 SBLGNT/Macula verse records; 7,957 BSB slots (7,941 nonempty); 137,741 Greek tokens with parses; 11,035 TBESG and 6,153 Abbott-Smith lexical entries; 344,799 OpenBible cross-references; 311 reception English file units, 2,347 page segments, 5,318 explicit Scripture citations; 82 completed and 28 in-progress work inventories. ἔθνος has 160 Macula occurrences, independently verified against the raw XML, including 15 in Matthew. Matthew 28:19 has 14 reception citations and 37 OpenBible links. All 6,681 distinct referent targets resolve except the upstream placeholder `n00000000000`.

The exported core supports only the selected audited NT correspondence groups, not exhaustive TVTMS alignment. It does not claim BSB translation-table reverse interlinear/rendering groups, semantic domains, resolved bare/shorthand historical citations, adjudicated duplicates, independent human review, or permissive rights to TFLSJ/in-progress reception/original transcriptions. These are explicit gaps, not claims that the authors are silent. Current single-verse IDs remain edition-specific; see audit for exact differences (e.g. 3 John 1:15 and Revelation 12:18 in SBLGNT).

The final NDJSON-derived index is loaded into local application D1, with full-data HTTP/MCP acceptance checks. Production binding configuration/import awaits deployment authorization; no cloud resources were provisioned. TFLSJ requires an independently established permissive digital-edition grant; in-progress reception English and normalized original redistribution require upstream license expansion or eligible completed paths at a newly pinned revision. OAuth credentials/configuration and UI acceptance belong to the other owned packages. Large generated data stays local/ignored; parent must intentionally decide its hosting/import destination.
