# Worker services

The browser HTTP API and read-only remote MCP call the same Effect services and the corpus package's shared query implementation. Production serves the Foldkit build through the Worker's `ASSETS` binding, on the API's origin. There is no bundled corpus, built-in agent, cloud deployment script, or unauthenticated production shortcut.

## Local setup

Use Node >=22.18. From the repository root:

```sh
npm ci
npm run corpus:acquire
npm run corpus:import
npm run build
npm run dev:prepare
npm run dev
# Optional Vite/HMR development in another terminal:
npm run dev:web
```

`dev:prepare` requires a prepared corpus snapshot, applies migrations to **local** D1, prepares the corpus index and imports it into Wrangler's emulated SQLite store. An import is atomic; stop the development Worker while replacing a large index. The local importer discovers exactly one migrated database under this package's `.wrangler/state/v3/d1/miniflare-D1DatabaseObject`; it refuses ambiguity and cannot select a cloud database. This accommodates Wrangler's current whole-file string reader, which cannot read the full 800+ MB corpus SQL. The importer prints its selected local path and counts. After a future Wrangler storage-layout change, adapt this helper or import the bounded SQL parts using Wrangler.

`--env local` explicitly selects `APP_ENV=development`, `AUTH_MODE=local-development` and a loopback-only identity. It checks request origin (Vite defaults to `http://localhost:5173`) and refuses a non-loopback request host. Do not use local mode for production or expose it with a tunnel. The same-origin Worker assets are available on port 8787 after `npm run build`; the Vite server proxies `/api` and `/auth` during development.

`npm run build` builds the frontend and a **dry-run** Worker bundle independently of corpus acquisition/import. It does not deploy. No resource provisioning command is run by tests or CI.

## Corpus storage

`npm run prepare:corpus --workspace @exegetical/server` prefers the corpus agent's final `data/generated/storage/corpus.ndjson` plus `r2/catalog.json`, and streams both input records and output SQL. Small sample `corpus.json` inputs are supported; large JSON inputs are refused. Token ref/edition come from the NDJSON outer record. Coverage and manifest records are deduplicated when also present in the catalog. A changing NDJSON export is rejected.

The output is `data/generated/corpus-index.sql`, its `.report.json`, and bounded `.parts/0000.sql` files. No statement exceeds D1's 100,000-byte limit: larger records use ordered chunk assembly, preserving Unicode and JSON validity. Each part is at most 16 MB. Records exceeding D1's 2 MB row limit are refused explicitly. The final imported corpus's largest record is below this limit. The loader touches only `corpus_*` tables; private notes and auth survive corpus replacement.

Use **migrations/0003_corpus.sql plus this index output** for the server. The corpus export's `standalone-corpus.sql` is a separate storage option; do not mix its initialization/indexing instructions with this loader. The server schema retains compatible metadata columns and an optional R2 pointer, but its normal index stores the complete records in D1, so R2 uploading is not required for M1. R2 remains bound for optional large-record storage and future private uploads.

D1 selects passages, tokens, lexical keys (including Strong IDs and lemma aliases), numeric citation intervals, cross-references and source pages using indexes. Source search uses FTS5 over reception pages and title matching; user text is quoted as literal FTS terms. Source search is a keyword phrase search, not a Latin/original-language search. Concordance book/form/edition filters and pagination preserve the existing array shape; distribution counts precede pagination. Empty selections retain global coverage and do not relabel loaded lexicons as missing. The corpus package alone supplies morphology, grammar treatments, agreement observations and provenance semantics. There is no divergent server analysis switch.

## Production GitHub OAuth

Production is configured for the maintained `@cloudflare/workers-oauth-provider` **1.2.4**, using its authorization-server and resource-server APIs in one Worker. The OAuth issuer and MCP audience are fixed from canonical HTTPS `APP_ORIGIN`, with MCP audience `${APP_ORIGIN}/mcp`.

Browser sign-in starts at `/auth/login`. GitHub authorization uses random state, a browser-binding secure cookie, and S256 PKCE. The callback atomically consumes a ten-minute D1 state record, exchanges the code on the server, then retrieves `/user` using the resulting GitHub access token. No identity from query parameters, cookies, or claimed user headers is trusted. The verified login must be `kadencartwright` **and** its numeric GitHub ID must match `40246541` (verified through the GitHub REST API on 2026-10-26). `GITHUB_ALLOWED_USER_ID` can explicitly override the numeric pin. Notes are owned by `github:<numeric ID>` across browser sessions and MCP.

Browser sessions are random opaque cookies (`__Host-ew-session`, Secure, HttpOnly, SameSite=Lax), stored only as SHA-256 hashes in D1, with an eight-hour absolute expiry. `/auth/session` returns the authenticated identity. `POST /auth/logout` deletes the server session and clears its cookie. Production note writes and logout require an exact same-origin Origin header. Cross-origin and cross-site browser access is rejected server-side. Every production API read, private-note route and frontend asset is protected; unauthenticated page navigation redirects to sign-in and API access returns 401. Missing production auth configuration fails closed. Browser cookies do not authorize remote MCP.

Remote MCP clients discover RFC 8414 authorization metadata and RFC 9728 protected-resource metadata from the Worker. Dynamic client registration is `/oauth/register`; `/authorize` displays escaped client/redirect/resource/scope information and explicit Allow/Deny controls. The maintained library binds consent and upstream state to the browser, rejects redirect tampering and plain PKCE, and implements authorization-code, token, refresh and revocation endpoints. Only GitHub-allowlisted identities receive grants. The MCP resource validates token audience, expiration and encrypted identity props through the library, then **explicitly enforces `mcp:read`**. A GitHub access token, browser cookie, arbitrary bearer, wrong audience or missing scope cannot authorize MCP. Access tokens expire after 15 minutes; grants/refresh tokens after eight hours. Client ID metadata documents are disabled; supported dynamic registration remains available. The library owns token/code hashing, encryption, code replay detection and refresh rotation.

### External prerequisites before a real production login

No credentials were requested, installed or exposed, and no cloud resources were deployed. The remaining account/resource actions are:

1. Register a GitHub OAuth application with callback **`https://<actual-host>/auth/callback`**. Install its `GITHUB_CLIENT_ID` and **secret** `GITHUB_CLIENT_SECRET` privately as Worker configuration/secrets. GitHub identity access needs only `read:user`, not repository scopes.
2. Set canonical HTTPS `APP_ORIGIN` with no trailing slash/path. Choose the actual Worker/custom-domain route. Retain `AUTH_MODE=github` and `APP_ENV=production`.
3. The current indexed D1 database is approximately **1.1 GB**. Use a Cloudflare plan with D1's 10 GB per-database capacity; the 500 MB free database limit is insufficient. Provision/bind retained D1 (`DB`), KV (`OAUTH_KV`), R2 (`CORPUS_BUCKET`) and built frontend assets (`ASSETS`). Wrangler contains local placeholder database/KV identifiers; replace them before deployment. The Alchemy definition declares the same resources/assets and uses `alchemy.secret` for the GitHub secret. Its required configuration is checked before provisioning.
4. Apply the migrations and import the prepared corpus SQL **parts in report order** to the production D1 database, under the parent's deployment authorization. This repository's supplied importer writes only to local emulation. No R2 corpus upload is needed for the normal D1 index.
5. Perform a real registered-GitHub browser sign-in and external MCP-client authorization on that deployed HTTPS origin. Tests exercise the complete protocol with mocked GitHub HTTP responses and the actual OAuth provider; they do not claim a live account authorization occurred.

## HTTP and MCP

All JSON evidence responses preserve `{ data, coverage, provenance }`. Existing HTTP paths in `docs/implementation.md` are retained, including invalid-reference 400 errors. Additions: `/api/source?id=...`, `/api/grammar?category=...`, `/api/crossreferences?ref=...`, `/api/distribution?lemma=...`, `/api/semantic-domain?id=...`. Passage/syntax ranges and concordance `book`, `form`, `edition`, `offset`, `limit` are supported. BSB's explicitly empty upstream verse slots preserve `textStatus:'empty-upstream'`; absent text is not invented.

MCP uses the official SDK Web Standard Streamable HTTP transport. Tools: `get_passage`, `get_token`, `get_syntax`, `lexicon_lookup`, `concordance`, `distribution`, `crossreferences`, `grammar`, `semantic_domain`, `citations_of`, `search_sources`, `get_source_page`, `coverage`, `provenance`, `search_notes`, `get_note`. All are annotated read-only; note creation/linking/deletion is absent. UBS semantic domains honestly report the optional SA pack as not loaded.

Notes persist in D1 with owner checks on list/get/update, FTS search, Markdown export and stable ownership across authenticated sessions. Quoted/paraphrased notes require the complete structured source locator. HTTP writes represent the human author; M1 rejects `agent-generated` writes. A successful update preserves creation time. Existing local-development notes are intentionally a separate identity from production GitHub notes.

## Verification

```sh
npm run typecheck
npm test
npm run build
npm run db:migrate:local
npm run db:corpus:local
# Requires the full pinned import loaded into local D1:
npm run test:full --workspace @exegetical/server
```

Ordinary server tests exercise real SQL/FTS, shared pure-versus-indexed query semantics, streamed NDJSON and oversized Unicode records, production session/state expiry and replay, PKCE, identity rejection, same-origin enforcement, browser/MCP note identity, real OAuth consent/code/token/refresh/revocation behavior, wrong audience, missing scope and expired tokens. Only the `cloudflare:workers` base class is adapted for Node; the OAuth provider itself is not mocked. GitHub HTTP responses are explicit test doubles, not fake production authentication.

The separate full-data suite checks exact imported counts, 16 empty BSB slots, NT passages beyond the original verse, ranges, syntax, sourced Matthew agreement/grammar, two standalone lexicons, concordance filters/distribution, all indexed Matthew citations and pages, cross-references and the same MCP evidence chain. The real local Worker was also queried successfully over HTTP after import. Scholarly limitations remain those in corpus coverage: optional LSJ/UBS packs, incomplete/untranslated reception units, unresolved shorthand/versification, and translation review status are never hidden.

Official API references verified for this implementation: [Cloudflare OAuth provider](https://github.com/cloudflare/workers-oauth-provider), [upstream sign-in helpers](https://github.com/cloudflare/workers-oauth-provider/blob/main/docs/upstream-sign-in.md), [GitHub authorization code and PKCE](https://docs.github.com/en/apps/oauth-apps/building-oauth-apps/authorizing-oauth-apps), [Worker static asset binding](https://developers.cloudflare.com/workers/static-assets/binding/), [D1 limits](https://developers.cloudflare.com/d1/platform/limits/), [Alchemy Worker](https://v1.alchemy.run/providers/cloudflare/worker).
