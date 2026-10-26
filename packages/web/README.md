# Web research workspace

Actual Foldkit 0.169.0 application, with an Effect 4.0.0 browser runtime. No React, bundled corpus, built-in AI, offline store, or client-side note persistence. The browser and Worker may use different Effect versions: the boundary is plain HTTP JSON. Foldkit pins its Effect peer to exactly 4.0.0, so do not flatten this dependency into the Worker's Effect 3 dependency.

## Run from the repository root

The services owner installs the root npm workspace dependencies and prepares the corpus and local D1 database. Then use separate terminals:

```sh
npm run dev --workspace @exegetical/server
npm run dev --workspace @exegetical/web
```

Vite serves http://localhost:5173 and forwards `/api` to http://127.0.0.1:8787. `strictPort` prevents silently switching to a port that disagrees with the Worker's allowed `APP_ORIGIN`. If either port changes, update the proxy and the Worker's local `APP_ORIGIN` together. No credentials or private corpus data are compiled into the frontend. For production, serve `packages/web/dist` and `/api/*` from the same origin, with the existing Worker and access/auth gateway. Worker asset binding/hosting configuration belongs to services/infra, and is not configured or deployed by this package.

```sh
npm run build --workspace @exegetical/web
npm run typecheck --workspace @exegetical/web
npm test --workspace @exegetical/web
```

The Vite Foldkit HMR plugin is not installed. Development source reloads reset the application state. Save drafts before reloading or closing the page; unsaved notes exist only in runtime memory. Fonts load from Google Fonts with local serif/system fallbacks.

## API integration

Requests and response envelopes follow `docs/implementation.md`. Shared contract types are imported from `@exegetical/shared`. Every JSON response must include `{ data, coverage, provenance }`; missing envelope fields cause an explicit error. Same-origin credentials are included. Authentication errors remain errors, and the UI never claims a failed write succeeded. The export link uses `GET /api/notes/export`, which must return a Markdown attachment (not a JSON envelope).

- Startup loads `Matt.28.19`, syntax, indexed citations, verse notes, and corpus coverage. The UI selects **the actual supplied token** whose diacritic-normalized text is αὐτούς; it never invents an ID or supplies local sample passage data.
- Initial deep links support `/study/Book.chapter.verse`, `?ref=Book.chapter.verse`, `/source-page?locator=…`, and `/notes/:id`. Browser back/forward synchronization is not yet implemented.
- Navigation accepts a single normalized `Book.chapter.verse` or `Book chapter:verse`, with common English aliases. Ranges and `ff` are explicitly refused rather than narrowed. The Worker remains authoritative about which books/verses/editions are loaded. Full versification-aware parsing is unfinished.
- Selection fetches `/api/token?id=…`, then `/api/lexicon?lemma=…` and `/api/concordance?lemma=…`. Syntax, analyses, grammar entries, lexical witnesses, source pages, coverage, and provenance are rendered from server data with safe external links. There is no client-authored grammatical quotation or referent analysis.
- The reception pane uses `/api/citations?ref=…`, keyword `/api/sources/search?q=…`, and `/api/source-page?locator=…`. Every citation displays its exact locator and review status, with its supplied deep link. Coverage remains available even for empty results. Source page structures are rendered as labeled evidence, not a paragraph-aligned bilingual reader.
- Notes use `POST /api/notes` or `PUT /api/notes/:id`. A single verse uses anchor type `verse-range`, matching the shared/server schema. The anchor can be changed to token, phrase, clause, verse-range, or source-page; phrase/clause IDs must be supplied from a real dataset, since the UI does not synthesize spans. Draft anchors remain fixed across navigation/selection. Editing another note/new note is blocked until the current draft is saved. There is no discard action yet.
- Quoted/paraphrased notes collect the complete `sourceLocator` object: source, edition, pinned version, license, locator, reviewStatus, optional deepLink. M1 rejects agent-generated writes, so that tag is displayed on existing records but not offered for new user notes.
- Initial notes are filtered by passage anchor; successful saves reload the note's anchor. Search explicitly searches all notes. Export includes all server-side notes. No result is presented as proof that an author is silent.

## Verification and remaining work

Unit tests exercise reference validation, initial API commands, supplied-token selection, stale response rejection, encoded lemmas, draft/anchor preservation, source metadata against the shared note schema, POST/PUT behavior, failed saves, edits arriving during a create request, safe links, authenticated HTTP, envelope validation, and execution of actual Foldkit commands. Test records are explicitly synthetic protocol cases, not shipped corpus evidence.

Browser rendering was checked using the T3 collaborative preview at desktop and narrow widths. Integration needs a running Worker, migrated D1, an explicitly enabled local auth mode or production gateway, and a real corpus adapter/import. This package alone does **not** complete M1. Dedicated syntax-tree visualization, interlinear alignment, lexicon filters/distribution charts, browser history synchronization, full reference parsing, and paragraph-aligned bilingual reading remain future work. Data is rendered as server evidence rather than pretending those analyses exist.
