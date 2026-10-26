# Exegetical Research Workbench

A personal, open-source workbench connecting biblical texts, historical reception, and research notes with explicit provenance and coverage.

See [the feature roadmap](docs/roadmap.md). Implementation is beginning with M1: Matthew 28:19, including the reformed-retrieval import and Scripture index.

Stack: TypeScript, Effect, Foldkit, Alchemy, Cloudflare Workers, D1, and R2. Bring your own agent through MCP; no built-in chat agent.

Application code is MIT licensed. Imported resources retain their own licenses and attribution; optional SA/NC packs remain separate.

## Run locally

Requires Node 22.18 or newer.

```sh
npm ci
npm run build
npm run db:migrate:local
npm run dev
# In another terminal:
npm run dev:web
```

Open http://localhost:5173. The local API and read-only MCP endpoint run on http://localhost:8787. Local development explicitly enables a local identity; production private access stays disabled pending real OAuth integration. No cloud deployment is needed.

## Current scope

The initial implementation includes a Foldkit reader, Effect HTTP/MCP services, D1 anchored notes and Markdown export, checksummed corpus importers, and a reception Scripture index. The default build includes verified Matthew 28:19 data and one reception source. It is a focused development corpus, not a complete library.

M1 remains incomplete: production OAuth, full dataset coverage, reference grammar links, lexicons, cross-references, and several research views still need implementation. Read the package documentation for precise limitations:

- [Corpus imports and coverage](packages/corpus/README.md)
- [Source licenses and audit](data/README.md)
- [Services, MCP, authentication and infrastructure](packages/server/README.md)
- [Foldkit UI and API integration](packages/web/README.md)

Run `npm run typecheck`, `npm test`, and `npm run build` to verify the workspaces. The server build performs a Wrangler dry run; it does not deploy.
