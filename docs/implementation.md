# Initial implementation contract

The supplied roadmap is authoritative. This first pass builds a working M1 foundation; do not claim the entire milestone complete if corpus, auth, or other requirements remain incomplete.

Use npm workspaces under packages/* with TypeScript. Workspace names: @exegetical/corpus, @exegetical/server, @exegetical/shared, @exegetical/web. Each agent may create its own package.json; services agent owns root package configuration and shared schemas. UI uses Foldkit, not React. Verify current upstream APIs in official docs or installed package source.

HTTP JSON responses use { data, coverage, provenance }. Coverage identifies loaded/partial/not-loaded datasets and their limitations. Provenance includes source, edition, version, license, locator, reviewStatus, deepLink where applicable. Never equate no search matches with an author's silence.

Initial API: GET /api/passage?ref=Matt.28.19, GET /api/token?id=..., GET /api/syntax?ref=..., GET /api/lexicon?lemma=..., GET /api/concordance?lemma=..., GET /api/citations?ref=..., GET /api/sources/search?q=..., GET /api/source-page?locator=..., GET /api/coverage, GET /api/provenance?id=..., GET /api/notes?anchor=...&q=..., GET /api/notes/:id, POST /api/notes, PUT /api/notes/:id, GET /api/notes/export. UI and MCP call the same Effect services.

Passage data shape: { ref, editions: [{ id, label, language, text, tokens: [{ id, text, lemma?, gloss?, morphology?: { code?, description?, gender? }, sourceId? }] }] }. Token detail: { id, text, lemma?, gloss?, morphology?, analyses: [], grammar: [], cautions: [] }. Citations data is an array of { id, sourceId, title, author?, date?, locator, excerpt, reviewStatus, deepLink }. Notes: { id, anchor: { type, id }, body, tags: [], provenanceTag: 'quoted'|'paraphrased'|'my-inference'|'agent-generated', createdAt, updatedAt }; quoted/paraphrased notes require source locator metadata.

Corpus agent exports typed JSON data and importer functions from packages/corpus/src/index.ts. Use a data manifest with pinned revision, checksum, upstream URL, license, included/excluded fields, coverage. Reception importer consumes /home/agent/code/reformed-retrieval read-only and verifies its MANIFEST.sha256; do not copy its whole repo or change it. Normalized output includes sources, pages and scripture citations. Prefer SQLite/D1-compatible SQL export with migrations agreed via parent. Default import can generate JSON under data/generated; server can load it via an explicit build step. Missing corpus must be surfaced as not-loaded, never fabricated.

Authentication must fail closed for private notes and MCP in production. A clearly documented explicit local-development mode may support local testing. Do not claim OAuth complete if only a scaffold exists. Agent writes via MCP are M2, so M1 MCP is read-only. Reception tools can be exposed read-only early to satisfy M1 end-to-end acceptance.
