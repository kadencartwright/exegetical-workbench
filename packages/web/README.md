# Foldkit research workspace

Foldkit 0.169.0 and its pinned Effect 4.0.0 browser runtime. All biblical text, annotations, grammar treatments, lexical definitions, citations and source coverage come from the Worker. No client corpus, built-in AI, local note storage, React, or cloud deployment. The Worker uses its own Effect version across a plain HTTP JSON boundary.

## Run and verify

From the repository root, after the services/corpus owners prepare the real D1 corpus:

```sh
npm run dev --workspace @exegetical/server
npm run dev --workspace @exegetical/web
npm run typecheck --workspace @exegetical/web
npm test --workspace @exegetical/web
npm run build --workspace @exegetical/web
```

Vite proxies `/api` and `/auth` to port 8787. Its default strict port is 5173. If another application occupies it, explicitly choose the web port and set the Worker's `APP_ORIGIN` to that same origin. Production uses the services-owned same-origin Worker asset binding. Foldkit navigation, command and rendering APIs were checked against the installed official package declarations/source. There is no Foldkit HMR preservation plugin: source reloads reset runtime-only drafts. Normal browser unloads receive protection while a draft is dirty.

Optional tests against the **actual full imported Worker**, without mocked corpus:

```sh
WORKBENCH_INTEGRATION_URL=http://localhost:8787 \
WORKBENCH_INTEGRATION_ORIGIN=http://localhost:5174 \
npm test --workspace @exegetical/web
```

These seven live tests verify full NT editions beyond Matthew, chapter/range navigation and syntax, the αὐτούς evidence chain, lexicons and concordance filters/distribution, 37 Matthew 28:19 cross-references, reception coverage, whole-source ἔθνος counts (160; Matthew 15), intentionally blank BSB slots, and note create/update/search/export. Their note-writing check requires the server's explicit local-development identity and leaves clearly synthetic integration notes in that disposable local database. Ordinary tests skip live checks unless the environment variable is supplied. The remaining 38 tests cover state transitions, real Effect commands, HTTP boundaries and actual Foldkit-rendered views with explicitly synthetic protocol records.

## Implemented research workflow

- Parallel server-supplied editions, interlinear gloss/parse display, all Bible book names, single verses, chapters, same-book ranges and `ff`. The server bounds ranges against its actual loaded verses; this is not historical versification adjudication. An edition with `textStatus: 'empty-upstream'` displays **“No verse text at this reference in the pinned BSB edition”**, separately from missing corpus.
- Word parsing, supplied transliteration, referent morphology comparison, supplied agreement observations/limits, grammar treatments with actual source locators/links, token notes and every indexed passage citation. The relevant referent grammar treatment opens first; other grammar treatments and raw source analyses remain expandable.
- Macula's Matthew 28:19 αὐτούς lemma remains `ἑαυτοῦ`/Strong 848. A discrepancy notice offers `αὐτός / G846` as a separate lookup, preserving the original annotation. Two independent lexicon entries render side by side. Concordance intersects book, exact form and edition, paginates 100 records, and displays full pre-pagination book distribution plus form/edition counts.
- Expandable syntax groups, selectable annotated words, source-group note anchors and clause text ordered by the source's word positions. Roles and rules remain identified as dataset labels. User-selected phrase anchors retain their actual stable token endpoints (`token-range:start..end`); groups lacking an upstream ID use stable source-word endpoints (`syntax-span:start..end`). These are user-selected spans, not invented scholarly analyses.
- Canonical cross-references are navigable and labeled editorial suggestions. OT targets may be outside the loaded NT reader.
- Reception citations retain exact locators and AI-assisted/unreviewed status. Exact source-page text is rendered safely as text. Source-library keyword results retain per-unit coverage and pinned witness links. Coverage cards distinguish loaded/partial/not-loaded; work inventory cards expose every supplied imported path and omission reason.
- Notes support real anchor selection, source-page provenance transfer, create/update/search/export, explicit server reload and clean-editor refresh after another session updates a note. Navigation preserves draft body/anchor. Discard requires explicit confirmation; in-flight saves and newer edits remain tracked. Quoted/paraphrased notes require complete source locator metadata. No source words are inserted automatically.
- Deep links support `/study/:ref`, `?ref=...`, token/view/alternate-lemma/concordance-filter/pagination parameters, `/source-page?locator=...`, `/notes/:id`, `/grammar?id=...`, `/lexicon?lemma=...`, and pinned `/sources/:id` source metadata. Foldkit's routing handles actual browser back/forward events. Stale API responses cannot overwrite a later route. Linked notes resolve their real token/source-page context.
- Browser authentication uses `GET /auth/session`, `GET /auth/login?returnTo=...`, and a native same-origin `POST /auth/logout` form. Dirty drafts disable logout. Credentials stay in same-origin requests; no private token is compiled into the app. Explicit local-development identity is labeled. Live GitHub authorization still requires the services-owned external OAuth setup.

## Browser acceptance evidence, 2026-10-26

Verified using the T3 collaborative browser against the full D1 import, not a sample server:

- Clicking the actual αὐτοὺς token displayed masculine/neuter comparison with ἔθνη, the verified Robertson pp. 683–684 treatment, token notes and **all 14** indexed Matthew 28:19 citations with exact locators and review status.
- G846 displayed Abbott-Smith and STEP TBESG alongside each other; the full distribution contained 5,067 tokens across 27 books. Book John + form αὐτοῦ + SBLGNT returned 171 occurrences and a 100-row first page. Pagination and filters issue real API requests.
- Matthew 28:19 syntax displayed 18 expandable groups, 20 annotated words and three clause groupings. Exact citation navigation opened the real CO X/1 p. 214 text, its review status and pinned upstream witness unit. Source-page anchor selection copied real provenance without inventing a quotation.
- Created a synthetic token note, reopened it in an incognito browser session, edited it there, and refreshed the clean editor in the first session through **Reload synced notes**. A dirty draft survived navigation to John 3:16–18 with its original Matthew token anchor. Keep-editing/confirm-discard and unload protection worked.
- Startup links and browser history restored the actual active evidence view; range navigation rendered all six edition panes for John 3:16–18. A 390px viewport had no horizontal overflow.
- Final checks: **45/45 tests including seven live checks**, TypeScript and production Vite build.

## Local integration and deployment boundaries

Local browser verification used Vite on **http://localhost:5174**, the Worker on **http://127.0.0.1:8787**, and an isolated full-data test store under `packages/web/.wrangler/integration`. This ignored store contains synthetic test notes. Follow the root README for reproducible setup rather than relying on a running development process.

Parent integration now loads all 110 work inventories, exposes `/api/source?id=...`, includes the pinned original-witness unit link on source-page results, and resolves cross-verse referents through indexed upstream IDs. Unknown upstream placeholders remain explicitly unresolved. The parallel reader labels native references for selected audited NT split/merged verse groups; it does not claim exhaustive TVTMS alignment.

Real browser OAuth login/callback/logout verification requires a registered GitHub OAuth app, configured credentials, canonical HTTPS origin and D1/KV resources. Browser and live persistence checks used explicitly labeled local-development auth. Provisioning and deployment are deferred at the user's request.

Reverse English-to-Greek alignment, exhaustive versification, excluded or unaudited lexical packs, untranslated/omitted reception material and original-text redistribution remain corpus coverage boundaries. Consult the corpus contract and source audit for the exact limits.
