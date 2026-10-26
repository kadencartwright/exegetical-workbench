# Worker services: M1 foundation

The HTTP API and remote MCP tools call the same Effect 3 services. Worker execution is online only. There is no agent, model SDK, or AI integration. MCP uses the installed official `@modelcontextprotocol/sdk` Web Standard Streamable HTTP transport, not a hand-written JSON-RPC imitation.

## Run locally (Node 22.13+)

From the repository root:

```sh
npm install
npm run build --workspace @exegetical/corpus
# Optional: explicitly import the pinned reception checkout; see corpus README for licensing and manifest verification.
npm run db:migrate:local
npm run dev
# A second terminal, for Foldkit UI:
npm run dev:web
```

The API binds loopback on port 8787. The web dev server proxies `/api` to it. Wrangler `--env local` explicitly enables the unauthenticated local identity `local-development-user`; this mode only accepts localhost/127.0.0.1/[::1] request hosts and same-origin requests or `APP_ORIGIN` (default local web origin http://localhost:5173). Never expose this mode through a tunnel or use it for real private data. Local development is deliberately opt-in: top-level Wrangler and Alchemy configuration disable private access.

`npm run build`, `npm run typecheck`, `npm test` run workspace checks. Server build uses **Wrangler dry-run only** and never deploys. `infra/alchemy.run.ts` declares a Worker, retained D1 notes database and retained R2 corpus bucket; do not execute it without separate deployment authorization. The placeholder D1 UUID is for local emulation only. There is no deployment script or deployment CI.

Corpus preparation reads `data/generated/corpus.json` into an ignored build snapshot. The server imports the Worker-safe `@exegetical/corpus` API for reference normalization, range matching and types. Missing snapshots produce explicit `not-loaded` coverage; malformed snapshots fail the build. Rebuild/restart the server after every corpus import. No filesystem access happens in the Worker. R2 is provisioned/bound for a future corpus/private-upload loader; the current implementation uses the bundled snapshot. Do not bundle private uploads or notes into that snapshot.

## API and provenance

The endpoints in `docs/implementation.md` return `{ data, coverage, provenance }`; Markdown export returns `text/markdown`. Empty corpus results always retain source coverage limitations. Concordance searches only imported passages. Lexicons, semantic domains, grammar references and cross-references currently report not loaded. Source search is a keyword substring scan of the bundled corpus; the notes store uses D1 FTS5. Source dates are an exact optional filter, not a date-range parser. Notes currently return all matching owned rows; pagination remains future work.

Notes accept `{ anchor: { type, id }, body, tags, provenanceTag, sourceLocator? }`. Anchor types are token, phrase, clause, verse-range, source-page. Identifiers are opaque stable corpus IDs; syntax/length/type are validated, but referential existence against every optional corpus is not asserted. Quoted/paraphrased notes require `sourceLocator` as an **object** with source, edition, version, license, locator and reviewStatus (optional deepLink). A bare locator string is rejected. The web caller must send this object. Unknown input fields and empty bodies are rejected. `PUT` is a complete validated replacement, preserving creation time. All SQL reads and updates include the authenticated owner. Missing and foreign-owned IDs both return 404. The M1 API rejects agent-generated writes. Markdown export preserves anchors, tags, provenance, source locator metadata and timestamps.

## Authentication status: incomplete, production fails closed

**OAuth is not implemented.** Production private notes and every `/mcp` request return 503 `authentication-not-configured`, regardless of bearer token, cookie or claimed user header. Public corpus reads remain available. There is no fake OAuth metadata, registration endpoint, token minting or trusted identity header. A production integration must implement issuer discovery, authorization-code + PKCE flow, token verification (issuer/audience/expiry/scopes), protected-resource metadata, browser session/CSRF handling and an authenticated stable subject shared by UI and MCP. Do not enable local mode in production as a substitute.

Local MCP URL: `http://localhost:8787/mcp`. Use Streamable HTTP with `Accept: application/json, text/event-stream`. The SDK negotiates MCP protocol versions. Stateless request handling avoids sharing sessions across users or isolates. Tools: get_passage, get_token, get_syntax, lexicon_lookup, concordance, semantic_domain, citations_of, search_sources, get_source_page, coverage, provenance, search_notes, get_note. Every advertised tool has `readOnlyHint: true`; create/link/delete operations are absent and rejected by the SDK. Notes tools use the authenticated principal captured per request.

## Validation

Server tests execute the exact migration SQL with SQLite FTS5 and the actual D1 adapter, exercise HTTP status/envelopes, validate provenance, check ownership/FTS updates/export, and send real MCP initialize/list/call wire requests through the official transport. Local Wrangler migrations and dry-run Worker bundling validate Cloudflare compatibility separately. Full M1 acceptance still needs real production auth and the remaining scholarly datasets/features; this implementation does not claim M1 complete.
