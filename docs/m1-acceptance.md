> Historical M1 checkpoint. For the completed local M2–M4 extension and current source boundaries, see [M1–M4 local acceptance](milestones-local.md).

# M1 acceptance evidence

Verified locally on 2026-10-26. The initial sample foundation was insufficient; this records the subsequent full-data implementation and integration checks. Cloud provisioning/deployment is explicitly deferred by the user.

## Implemented and locally verified

- Full pinned NT SBLGNT and BSB inputs, native reference identifiers, chapter/range/ff navigation, and explicit empty-versus-unloaded states.
- Full pinned Macula Greek morphology, plain-English parsing, syntax/clause views and referents. Cross-verse referents resolve through an indexed upstream-ID lookup; unknown upstream placeholders remain unresolved rather than guessed.
- Smyth/Robertson source links and bounded application explanations. Matthew 28:19 includes Robertson pp. 683–684 and the masculine/neuter comparison. Explanations are identified as application prose, not quotations or independent scholarly review.
- STEP TBESG and Abbott-Smith lexical entries, filtered/paginated lemma concordance, distribution counts and OpenBible cross-references.
- All eligible completed English reception paths imported from the pinned, checksum-verified upstream; every completed/in-progress work has an inventory entry. Coverage includes 82 completed and 28 in-progress units, and omitted paths/reasons. Source-page responses include an original-witness link.
- Anchored D1 notes, provenance tags, full-text search, updates, Markdown export and browser reload across sessions. Unsaved drafts keep their original anchors across navigation.
- GitHub browser OAuth and remote MCP OAuth implemented using Cloudflare's maintained provider. Protocol tests cover identity allowlisting, state binding/replay/expiry, PKCE, consent, sessions, token audience/scope/expiry, refresh/revocation, origin checks and shared note ownership. GitHub HTTP responses are mocked in tests; the authorization-server implementation is real.
- Same-origin Worker asset hosting and an indexed D1 corpus. The full corpus is not embedded in the Worker bundle. Streaming SQL import respects statement/row limits and preserves private data tables.
- Browser check: one click on αὐτούς exposes gender comparison, Robertson treatment, token notes and all 14 indexed Matthew 28:19 reception citations. MCP retrieves the same sourced evidence chain.
- Parent integration checks cover D1 work inventories, direct original-witness metadata, cross-verse referents and differing NT verse-boundary groups. Original token references remain intact when grouped for parallel display.
- Clean checkout: install, typecheck, ordinary tests, code/asset build, explicit sample preparation, local migrations and local import succeeded independently of the existing full-data workspace.
- The user-rejected green/gold theme has been replaced with white, cool gray, ink and blue. Desktop browser rendering and selections were checked after the change; a 390px viewport also had no horizontal overflow.

## Dataset and test evidence

96 checks passed across the full corpus suite (21), ordinary server suite (24), full D1/HTTP/MCP suite (6), and web suite including live Worker checks (45). Workspace typechecks and the production build passed. These are local results, separate from hosted CI and live deployment.

- [Full imported-source audit](../data/audits/m1-full-import.json)
- [Standalone storage integrity audit](../data/audits/m1-storage-validation.json)
- [Corpus/storage contract](m1-corpus-contract.md)
- `packages/server/test/full-import.check.ts`: actual full local D1, HTTP and MCP, including the parent integration checks.
- `packages/server/test/oauth.test.ts`: production protocol and authentication tests.
- `packages/web/src/live.test.ts`: real local Worker API and persistence checks.
- Package READMEs record browser and import reproduction details.

## Deferred and explicit limits

Production deployment and live external-account OAuth verification have not occurred because the user requested no provisioning yet. A future deployment requires the target account/hostname, registered GitHub OAuth application and privately configured credentials, D1/KV/R2 bindings, corpus import and HTTPS verification. Current local access is labeled development access.

The M1 acceptance path is locally verified, but the wider feature roadmap is not complete. The following remain explicitly unavailable: exhaustive TVTMS and Psalm-number mappings, BSB translation-table reverse interlinear/rendering groups, contextual shorthand historical citations, adjudication of repeated compiled/part translations, independently reviewed translations, optional UBS semantic domains and unaudited LSJ/original-transcription rights. Selected NT split/merged verse groups were checked against TVTMS and the actual BSB/SBLGNT inputs; they must not be described as exhaustive versification support. UBS SA resources, Hebrew/LXX, bilingual alignment, linked notes and disputations retain their later milestones.

An empty search is always bounded by the imported coverage; it is not evidence that an author was silent.
