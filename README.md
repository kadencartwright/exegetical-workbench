# Exegetical Research Workbench

An open-source research workbench connecting biblical texts, historical reception, and anchored notes with source provenance and explicit coverage. Built with TypeScript, Effect, Foldkit, Alchemy, and Cloudflare Workers/D1/R2. Bring your own agent through OAuth-protected MCP, with separately consented research writes.

## M1–M4 implemented locally

The workbench now supports NT and Hebrew reading, LXX/NT concordance, bilingual reception, anchored and linked notes, Westminster sources, and disputations with explicit divergent premises and historical witnesses. Both the Foldkit UI and MCP use the same Effect services.

The four acceptance workflows have been exercised against the actual local corpus and Worker. See [M1–M4 setup, acceptance and coverage](docs/milestones-local.md), the [M1 regression evidence](docs/m1-acceptance.md), and the original [roadmap](docs/roadmap.md).

**Nothing has been provisioned or deployed.** Production OAuth is implemented and protocol-tested; live credentials, cloud bindings and real HTTPS sign-in remain deferred. The theme uses white, cool gray, ink and blue.

## Build and test

Node **22.18 or newer** is required. A code build does not download corpora, provision resources, or replace an existing import.

```sh
npm ci
npm run typecheck
npm test
npm run build
```

## Full local research corpus

Acquisition verifies pinned upstream files and license notices. Keep `reformed-retrieval` in a sibling checkout at the revision pinned in `data/manifests/reformed-retrieval.json`; its manifest is verified read-only. A different path can be supplied through the corpus CLI's `--reception` option.

```sh
npm run corpus:acquire
npm run corpus:import
npm run dev:prepare
npm run dev
```

Open **http://localhost:8787** for the built same-origin application. For frontend development use a second terminal:

```sh
npm run dev --workspace @exegetical/web -- --port 5173
```

Vite proxies API/auth requests to port 8787. If port 5173 is occupied, choose another port and set the Worker's local `APP_ORIGIN` to that same URL. Local development enables an explicitly labeled local identity. Keep the API loopback-only and do not expose development auth through a tunnel.

The base D1 database is approximately 1.1 GB (about 4.7 GB with all optional packs); downloads and generated SQL/JSON require additional disk space. Private notes/auth tables survive corpus replacement. Stop the development Worker before replacing its corpus index.

## Small test dataset

This separate, explicitly selected sample is useful for CI and interface work. It is not the full M1 corpus and cannot satisfy full-data acceptance.

```sh
npm run corpus:sample
node packages/server/scripts/index-corpus.mjs data/generated/sample-corpus.json data/generated/corpus-index.sql
npm run db:migrate:local
node packages/server/scripts/load-corpus-local.mjs
npm run build
npm run dev
```

The last load intentionally replaces the local corpus index with the sample. It does not change the full generated source snapshot or private notes.

## Full-data acceptance

After importing the full corpus and loading local D1:

```sh
CORPUS_FULL=1 npm test --workspace @exegetical/corpus
npm run test:full --workspace @exegetical/server
# With the local Worker running:
WORKBENCH_INTEGRATION_URL=http://localhost:8787 npm test --workspace @exegetical/web
```

The MCP endpoint is `http://localhost:8787/mcp` in explicit local development. Production uses OAuth on the deployed HTTPS origin. Source citations, review status, and coverage accompany tool results.

## Data and boundaries

Imported: 7,939 SBLGNT/Macula verse records, 137,741 annotated Greek tokens, 7,957 BSB slots, 17,188 lexical entries, 344,799 cross-references, and 311 eligible reception English files. All 82 completed and 28 in-progress reception works are inventoried. Empty upstream BSB slots, omitted or untranslated sources, source disagreements and unresolved referents remain visible.

Optional core, SA, NC and private reception packs are explicitly acquired, built and loaded separately; see [the pack workflow](docs/milestones-local.md#reproduce-the-optional-corpus-locally). Source coverage and rights remain visible. The Later backlog and the coverage limits documented there are not claimed as implemented.

- [Corpus import and integration](packages/corpus/README.md)
- [Per-source licensing audit](data/README.md)
- [Services, OAuth and deployment prerequisites](packages/server/README.md)
- [Foldkit research interface](packages/web/README.md)

Application code is MIT licensed. Source datasets retain their own licenses and attribution; the application license does not relicense them.
