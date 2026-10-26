# Implementation instructions

Read docs/roadmap.md and docs/implementation.md. Preserve Effect + Foldkit + Alchemy on Cloudflare. No built-in agent. Do not invent quotations, source analyses, or coverage. Mark fixtures explicitly and report missing datasets honestly. Keep upstream licenses separate from the application MIT license. Do not deploy cloud infrastructure as part of initial implementation.

Parallel ownership: corpus agent owns packages/corpus and data; services agent owns packages/server, packages/shared, root build/package configuration, migrations and infra; UI agent owns packages/web. Avoid editing another agent's files. Coordinate interfaces through docs/implementation.md; report incompatibilities to the parent. Do not commit other agents' changes. Parent handles integration, commits and pushes.
