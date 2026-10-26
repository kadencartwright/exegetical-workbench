# M1–M4 local implementation

All four numbered milestone workflows are implemented locally. No Cloudflare resources were provisioned and nothing was deployed. The “Later” backlog in the roadmap remains separate. The application does not contain an AI agent; the example arguments below were written by an external agent through MCP and remain labeled for review.

## Acceptance paths

| Milestone | Reproducible path | Evidence |
| --- | --- | --- |
| M1 | Open Matthew 28:19 and select αὐτούς. | Native morphology and unresolved referents, masculine/neuter comparison, six relevant grammar treatments, lexicons, 14 reception citations, cross-references and synced notes. Existing full-import regression passes. |
| M2 | Open 1 Timothy 5:17, select πρεσβύτεροι, open Beza's indexed citation, and choose **Quote page into note**. | Printed p. 106 aligns with Latin `[Scan 128; p. 106]`. Saving retains the page locator, AI-assisted/unreviewed translation status and a second Greek-token anchor. MCP creates the same evidence chain and links owned notes. |
| M3 | Open Eph 5:19 or Col 3:16, look up ψαλμός / ὕμνος / ᾠδή, choose **NT + LXX**, and inspect Hebrew parallels. Open **Translations & sources** for WCF 21.5. | All pinned LXX occurrences: 92 / 33 / 88 tokens respectively (99 / 35 / 95 with NT). Native Psalm headings remain addressable. OSHB, Macula Hebrew, UBS semantic domains, BSB alignment tables and Westminster proof texts are available. |
| M4 | Load **Linked notes & disputations**, select evidence for each position, enter the divergent premise and dated witness, then save. | The saved exclusive-psalmody example has two positions, shared evidence, an explicit divergent premise and a dated WCF witness. UI and MCP read the same record. Revision conflicts fail instead of overwriting; previous revisions retain provenance. |

`data/audits/milestones-local.json` records the live Worker/MCP run, including every target-lemma verse without a loaded Hebrew counterpart. The generated example is illustrative research requiring review, not a historical verdict or a claim that the Westminster Assembly settled the modern dispute. `scripts/verify-milestones.mjs` creates labeled example research only against explicit loopback development auth.

## Reproduce the optional corpus locally

First follow the root README for the base NT/reception import and migrations. Python 3, Git, Node 22.18+, and sufficient local disk space are required. All optional inputs are pinned in `data/manifests/milestone-packs.json`; downloads and generated packs are ignored by Git.

```sh
# Explicit pack selection; SA and NC never silently join the permissive core.
npm run packs:acquire -- --packs core,sa,nc
npm run packs:build -- --packs core,sa,nc
# Optional private originals from the verified sibling reformed-retrieval checkout:
npm run packs:private
npm run db:migrate:local
# Stop the local Worker before replacing packs; supply its exact local SQLite path.
npm run packs:load:local -- --database /absolute/path/to/checkout/packages/server/.wrangler/state/v3/d1/miniflare-D1DatabaseObject/ACTUAL.sqlite --packs core,sa,nc,private
npm run build
npm run dev
# With the local Worker running (creates clearly labeled example notes/dispute):
EW_ACCEPTANCE_ORIGIN=http://localhost:8787 npm run test:milestones
```

Omit `private` if original transcriptions are unavailable. Omit `sa` or `nc` to keep those licenses out of an installation. Missing packs appear as not loaded, rather than as empty scholarly results. The loader also builds indexed lexical aliases/domains and materialized BSB rendering counts, avoiding request-time scans. `--reindex-only` rebuilds these indexes from installed packs after a schema upgrade. The loader uses an atomic local SQLite transaction and refuses paths outside this checkout's Wrangler storage. Normal builds verify hashes; `--audit` intentionally repins files and is only for a new source audit, never a workaround for checksum drift.

The combined local database is about 4.7 GB before extra development copies and SQLite journals. No cloud quota or cost assumptions were tested. Current records fit the loader's conservative 1.9 MB per-row ceiling. Corpus replacement preserves notes and authentication tables.

## Data, rights and scholarly boundaries

- **Core:** 23,213 OSHB Hebrew verse groups, 23,213 Macula Hebrew syntax groups, 31,103 canonical WEB verses, full BSB English with independently identified native references, 20,519 Hebrew lexicon records, 475 Westminster confession/catechism sections, 31,085 BSB translation-table verse groups and 5,623 TVTMS whole-verse mapping groups. OSHB tags, Macula and Hebrew digital lexicons retain CC BY attribution; historical texts are public domain. BDB is an upstream work in progress.
- **SA:** 13,450 UBS dictionary entries and 1,153 domain records, explicitly CC BY-SA 4.0. These are UBS's released dictionaries, not a representation that a commercial edition of Louw–Nida was reproduced verbatim.
- **NC:** 623,693 LXX tokens in 29,659 native verse groups, including deuterocanonical books and alternative traditions. The converter's MIT license does not replace the upstream CC BY-NC-SA 4.0 notice or CATSS ancestry. BibleOL dictionary/gloss fields are excluded. Do not redistribute this pack as permissive core data.
- **Private reception:** 2,027 exact-marker original/English page alignments and 380 unmatched pages. Private normalized transcriptions are not published or asserted to have a redistribution grant. English is the same eligible CC0 upstream corpus. Paragraph alignment is not claimed. Beza's unnumbered quotation of 1 Tim 5:17 is labeled an editorial identification, with its actual words and pinned page retained.
- Hebrew parallels distinguish imported TVTMS correspondence from a same-number **candidate** comparison. There is no fabricated word alignment. Greek additions, Odes and some parallel traditions have no loaded Hebrew counterpart; their Greek occurrences remain listed. The complete target-lemma counts are not limited to verses with Hebrew.
- BSB reverse interlinear follows the BSB publisher's own source-word table. It is not an assertion of one-to-one identity with SBLGNT tokens. NA/ECM comparison columns, textual-variant fields and publisher notes are excluded. Hebrew and LXX analyses remain source annotations; grammar explanations are application guidance with links, not invented quotations.
- Full LSJ redistribution rights, exhaustive historical versification, contextual bare references such as “v. 19”, and uncompleted reception translations remain explicit source-coverage limits. No authorial silence follows from missing results. Latin full-text search, private PDF/EPUB ingestion, syntax search, BHSA, text-critical packs and CCEL are not claimed as delivered by these acceptance paths.

## Authentication and writes

Both interfaces use the same Effect services. Production requires GitHub sign-in to the configured single-user allowlist, including corpus and private original reads. Remote MCP requires `mcp:read`; write tools (`create_note`, `link_notes`, `create_dispute`) appear only with explicitly consented `mcp:write`. Agent writes are forced to `agent-generated`; a human can review and promote a note. Browser writes require same-origin requests in production. OAuth tests use the real provider implementation and controlled GitHub responses; a real deployed sign-in remains untested because deployment is excluded.

Disputes support 2–10 positions, explicit opposing premises and dated evidence. The UI edits the first comparison/witness while preserving additional positions and annotations authored through MCP. Notes can be reused on both sides. A timeline annotation records a user's claim about a witness, not an automatically validated history. Export contains notes, locators, links and current dispute structure as Markdown; prior dispute revisions remain available through the history endpoint.

## Verification

104 automated cases passed across the full corpus suite (21), server/OAuth suite (28), web state plus live HTTP suite (49), and indexed full-import suite (6). The additional real SDK MCP acceptance script passed all four milestone scenarios against the final installed data. TypeScript checks, the Vite production build and Wrangler dry-run passed; npm audit reported zero production dependency vulnerabilities. Pinned acquisition verification passed for core, SA and NC sources.

The T3 browser verified bilingual quote/save with a second token anchor, LXX concordance, semantic-domain browsing, Hebrew pointing removal, WCF display, and editing a saved dispute while retaining its prior provenance. Desktop 1280px and narrow 390px layouts had no horizontal overflow. Exact records are in `data/audits/milestones-browser.json` and storage counts in `data/audits/milestone-storage.json`. Cloud deployment and real-provider HTTPS sign-in were not performed.
