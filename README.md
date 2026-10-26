# Exegetical Research Workbench

An open-source research workbench connecting biblical texts, historical reception, and anchored notes with source provenance and explicit coverage. Built with TypeScript, Effect, Foldkit, Alchemy, and Cloudflare Workers/D1/R2. Bring your own agent through read-only MCP.

## M1 implementation and verification

The full pinned NT and eligible reception corpus are imported and available in the local application. Clicking **αὐτούς in Matthew 28:19** reaches the masculine/neuter comparison, Robertson and Smyth grammar links, token notes, and all **14 indexed reception citations**. The same evidence is available through MCP. Local verification includes real D1 queries, browser interaction, cross-session note persistence, and production OAuth protocol tests.

Cloud provisioning and deployment are **deferred at the user's request**. Production authentication is implemented with GitHub OAuth and the Cloudflare OAuth provider; a registered OAuth app, real cloud bindings, and a live HTTPS sign-in check will be needed when deployment is authorized. Tests use explicit GitHub HTTP doubles and do not claim a live account authorization.

See [M1 acceptance evidence and limits](docs/m1-acceptance.md) and the complete [feature roadmap](docs/roadmap.md).

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

The full D1 database is approximately 1.1 GB; downloads and generated SQL/JSON require additional disk space. Private notes/auth tables survive corpus replacement. Stop the development Worker before replacing its corpus index.

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

The read-only MCP endpoint is `http://localhost:8787/mcp` in explicit local development. Production uses OAuth on the deployed HTTPS origin. Source citations, review status, and coverage accompany tool results.

## Data and boundaries

Imported: 7,939 SBLGNT/Macula verse records, 137,741 annotated Greek tokens, 7,957 BSB slots, 17,188 lexical entries, 344,799 cross-references, and 311 eligible reception English files. All 82 completed and 28 in-progress reception works are inventoried. Empty upstream BSB slots, omitted or untranslated sources, source disagreements and unresolved referents remain visible.

Selected verified NT verse-boundary groups are supported without renumbering native tokens. This is not exhaustive TVTMS/Psalm reversification. BSB translation-table reverse interlinear, optional UBS semantic domains, unaudited LSJ rights, contextual shorthand citations, and redistribution of normalized original transcriptions are not represented as completed features. Later-milestone Hebrew, LXX, bilingual alignment, linked-note writing through MCP and disputations remain on the roadmap.

- [Corpus import and integration](packages/corpus/README.md)
- [Per-source licensing audit](data/README.md)
- [Services, OAuth and deployment prerequisites](packages/server/README.md)
- [Foldkit research interface](packages/web/README.md)

Application code is MIT licensed. Source datasets retain their own licenses and attribution; the application license does not relicense them.
