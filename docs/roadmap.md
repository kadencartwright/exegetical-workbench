Exegetical Research Workbench — Feature Roadmap
Oct 26, 2026 · @Kaden
Vision and user
A personal, open-source research workbench for historically grounded exegesis, not a Bible reader with Strong's numbers attached. It connects the biblical text, the history of its interpretation, and the arguments built on both, and keeps the evidence for every step.
The primary user is the author: a theology nerd with no formal Greek or Hebrew training, who wants the richest data and the most in-the-weeds analysis available. The study style is disputation, not devotion:
• Philological: what the grammar and syntax actually establish, and where they don't.
• Canonical: cross-references, LXX usage, OT quotations in the NT.
• Historical: how the fathers, scholastics, Reformers and Reformed orthodox read the text, in primary sources with exact citations.
• Dogmatic: the confessional and systematic conclusions drawn, especially in ecclesiology and worship.
• Adversarial: each position tested against its strongest alternative, down to the premise where the two sides diverge.
Principles
Six rules govern every feature decision below.
1. Provenance on everything. Every token, gloss, parse, quote and note records its source, edition, version and license. The UI can always answer "says who?"
2. Show ambiguity, don't hide it. When datasets, lexicons or grammarians disagree, show every reading. The user can't vet the grammar alone, so a single confident answer is the wrong behavior.
3. Be honest about coverage. "No result" must be distinguishable from "source not loaded" or "not yet translated."
4. Separate the license packs. The core stays public domain, CC0 or CC BY. CC BY-SA and CC BY-NC data ship as optional, clearly labeled packs.
5. Bring your own agent. The app has no built-in AI. It exposes an MCP server so any external agent can query the corpus and the user's notes.
6. Grow the structure; don't impose it. Notes start simple and acquire structure through use. An earlier heavy argument-graph attempt didn't pan out.
Architecture
The web UI and the MCP server are thin shells over the same Effect services, which serve three data layers built from pinned upstream sources.
Notes anchor into both the text layer (tokens, verses) and the reception layer (source pages), and the reception layer's Scripture index points back into the text. The stack is Effect, Alchemy for infrastructure and Foldkit for UI, on Cloudflare Workers, D1 and R2. It is online only.
Layer 1: Text and language
The aim is guardrails for a non-specialist. The layer shows what the grammar establishes, what it leaves open, and what the grammarians say, so no argument claims more from the Greek than it can bear.
Reading
• Parallel panes: BSB and WEB in English; SBLGNT and OSHB/WLC in the originals; the LXX from M3.
• Reverse interlinear (English with the original underneath) built from the BSB translation tables, and a full interlinear (original with gloss and parse).
• Reference parsing ("Jn 3:16", "Gen 1-3", "Rom 8:28ff") and navigation that handles versification differences between editions (TVTMS).
• Hebrew right-to-left display with toggles for pointing and cantillation.
Word analysis
• Click any word for its lemma, transliteration, gloss, and a parse spelled out in plain English rather than codes.
• Each grammatical category links to the relevant section of a public-domain reference grammar: Smyth and Robertson for Greek, Gesenius–Kautzsch for Hebrew.
• A "can and can't establish" note per category, e.g. that an aorist does not by itself mean once-for-all.
• Agreement and referent checks from Macula. For example, in Matt 28:19 the masculine αὐτούς does not agree in gender with the neuter ἔθνη.
• Where analyses disagree (Macula vs. BHSA, or two lexicons), show both side by side with their sources.
Syntax
• Syntax tree and clause view per verse (Macula Greek and Hebrew; BHSA as an NC pack).
• Syntax search ("where X is the subject of Y") comes after M2, once the data shapes are known.
Lexical
• Several lexicons side by side: UBS (Louw–Nida, SDBH), BDB, LSJ, Abbott-Smith, STEP's brief lexicons.
• Concordance by lemma, filterable by book, form and edition, with a distribution chart.
• "How is this word translated": BSB renderings grouped by English word.
• Semantic domain browsing: other words in the same Louw–Nida/UBS domain.
• A combined LXX + NT lemma concordance for intertextual study (M3).
Layer 2: Historical reception
This layer answers "how has this text been read, by whom, and when?" from primary sources with exact citations. The seed corpus already exists: reformed-retrieval, with 82 completed and 28 in-progress Latin/French units and AI-assisted English translations.
reformed-retrieval integration
• Imported as a pinned upstream source (a commit plus MANIFEST.sha256), the same way as SBLGNT. The repos stay separate, and production of translations stays in reformed-retrieval.
• Side-by-side reader for the original language and English, aligned on page markers at first and on paragraphs or sentences later.
• Citations anchor to normalized printed-page locators. The importer unifies the marker formats ([CO X/1, p. 189], [PDF p. …; printed p. …], [Marg.: …]) into one locator scheme.
• Review status ("AI-assisted, unreviewed") appears on every quote. The original-language text is always one click away, because "quote the source when wording is decisive."
• Partial works (Turretin's Institutio, Boyd on Ephesians) show exact coverage, so a missing section is never read as "the author is silent."
• Flag an error while reading, and the app drafts an issue or PR against reformed-retrieval.
• A translation queue driven by research: "You're studying Eph 5:19; Boyd's lecture on it is untranslated."
Scripture index
• "Who cites Eph 5:19?" across the whole library, ordered by date.
• Extract references from the English first, since the translations already normalize them ("Ephesians 4:3"). Then map back to the Latin ("Ephes. 4, 3", "Coll. Act. 1.16") through the page markers.
• Handle Vulgate/LXX Psalm numbering and bare back-references such as "v. 19" through TVTMS.
Further sources (public domain unless noted)
• CCEL ThML texts with existing Scripture tags: Schaff's fathers, and Calvin's commentaries and Institutes. Check CCEL's terms on the markup files.
• Aquinas's Catena Aurea, a verse-by-verse patristic catena on the Gospels.
• Verse-keyed commentaries already in reformed-retrieval (Cartwright on Proverbs and Ecclesiastes, Boyd on Ephesians), surfaced in the passage view.
• Bring-your-own sources: private PDF/EPUB uploads (R2) for copyrighted works such as Bavinck or the English Turretin. They stay in the user's account and never ship.
Layer 3: Notes and argument
Notes begin simple and gain structure in stages, so entering them never feels like paperwork. Every note syncs across devices and carries a provenance tag.
Provenance tag
Meaning
Quoted
Exact words from a source, with a locator
Paraphrased
An author's point in my words, with a locator
My inference
My own conclusion; the author doesn't say it
Agent-generated
Written by an external agent through MCP; promoted to "my inference" once checked
Growth stages
1. M1: anchored notes. Each note attaches to an anchor: a token, phrase, clause, verse range, or source page. Markdown body, tags, full-text search.
2. M2: linked notes. A note can link to another, optionally labeled (supports, objects to, distinguishes, answers).
3. M4: disputations. Group linked notes under a Question and its Positions. A dispute view sets each side's premises side by side and highlights the premise where they diverge.
4. Later. A timeline of a position across history (first appearance, who held it, who changed it); links to confession sections (WCF and others) and their proof texts; claim status (tentative, held, abandoned) with history.
Sync
• Single user, online only. Notes are stored server-side (D1, or a Durable Object per user), with OAuth-protected access shared by the web UI and MCP.
• Export to Markdown, so notes outlive the app.
MCP server
The MCP server is a second interface beside the web UI, and both sit on the same Effect services. The user's own agent does the reasoning; the app supplies evidence with citations.
Area
Tools
Milestone
Text
get_passage(ref, editions), get_token(id), get_syntax(ref)
M1
Lexical
lexicon_lookup(lemma, sources?), concordance(lemma, filters), semantic_domain(id)
M1
Notes (read)
search_notes, get_note
M1
Reception
search_sources(query, author?, dates?), citations_of(ref), get_source_page(locator)
M2
Notes (write)
create_note, link_notes, always tagged agent-generated
M2
Meta
coverage(source), provenance(resource)
M1
Design rules
• Every result carries a locator, edition, review status and an app deep link, so the agent's answers point back into the reader for checking.
• Coverage is explicit. An empty search in a partly translated work reports what wasn't searched.
• Agent writes are never mistaken for the user's own conclusions or an author's words.
• Search starts with keywords (D1 FTS5, lemma-aware for biblical text). Semantic search (Vectorize) only if keywords prove insufficient.
• Remote MCP on Workers with OAuth. Confirm the current Cloudflare and Effect MCP APIs before building.
Data sources and license packs
Each source is imported at a pinned version with a checksum, its license text, and a list of the layers included and excluded. Licenses below come from earlier research and still need a per-file audit.
Source
Provides
License
Pack
Needed by
SBLGNT
Greek NT text
CC BY 4.0
Core
M1
Macula Greek
Morphology, syntax, referents
CC BY 4.0 (exclude UBS ln/domain fields)
Core
M1
Berean Standard Bible
English text, translation tables
Public domain (check table fields)
Core
M1
STEPBible Data
Brief lexicons, LSJ, TVTMS versification, TIPNR
CC BY 4.0 (per-file check)
Core
M1
OpenBible cross-references
About 340k cross-references
CC BY 4.0
Core
M1
reformed-retrieval
Reformed primary texts and English
English CC0; sources public domain
Core
M1
UBS open dictionaries
Louw–Nida-derived Greek, SDBH Hebrew, parallels, HOTTP
CC BY-SA 4.0
SA
M2
Open Scriptures Hebrew Bible
WLC text, lemmas, morphology
Public domain text; CC BY 4.0 tags
Core
M3
Macula Hebrew
Hebrew syntax, semantic roles
CC BY 4.0
Core
M3
CenterBLC LXX
Tagged Rahlfs LXX
MIT repo; audit CATSS upstream
NC (provisional)
M3
Westminster Standards
Confession and catechisms with proof texts
Public domain
Core
M3
ETCBC BHSA
Rich Hebrew syntax database
CC BY-NC 4.0
NC
Later
Robinson–Pierpont Byzantine
Byzantine text, variants
Public domain
Core
Later
CCEL ThML texts, Catena Aurea
Fathers, Calvin, Scripture-tagged
Public domain texts; check markup terms
Core
Later
Known discrepancies to resolve in the audit: the TTESV license (keep it excluded), which SBLGNT repository is canonical, and whether OpenBible or crossreferences.org is the cross-reference source.
Milestones
Each milestone is done when it can answer one real research question end to end, both in the UI and through an external agent over MCP.
Milestone
Acceptance question
Builds
Done when
M1
Matt 28:19: are the nations discipled corporately, or individuals from among them?
NT reader (SBLGNT, BSB), word analysis, Macula syntax and referents, grammar links, lexicons, concordance, cross-references, anchored notes with sync, reformed-retrieval import and Scripture index, read-only MCP
The gender mismatch, its grammatical treatment, every corpus citation of the verse, and my notes are reachable from one click on αὐτούς
M2
Beza, De vera excommunicatione, on 1 Tim 5:17 and the presbyter
Bilingual source reader, page-locator citations, quote-to-note with review status, linked notes, UBS SA pack, reception and write MCP tools
A note quoting Beza links to the Latin page and to the Greek token, and an agent can produce the same chain
M3
Eph 5:19 / Col 3:16: psalms, hymns and spiritual songs
LXX with lemmas, LXX + NT concordance, Psalter titles, semantic domains, Westminster Standards with proof texts, OSHB and Macula Hebrew
Every LXX use of ψαλμός / ὕμνος / ᾠδή is listed with its Hebrew, alongside WCF 21.5 and its proof texts
M4
Exclusive psalmody vs. uninspired hymnody, as a full dispute
Questions and Positions, dispute view, point of divergence, history timeline
Both positions' premises are laid out with evidence, and the divergent premise is identified
Later
Hebrew-heavy and text-critical questions
BHSA NC pack and Macula comparison, Byzantine/TR variants, HOTTP, syntax search, CCEL and Catena Aurea, Latin-original search
Chosen when a real question needs it
M1 deliberately includes the reformed-retrieval import and the Scripture index, so reception is present from the start even though the first milestone is larger.
Non-goals, decisions and open questions
Non-goals for now
• Offline use, mobile apps, multiple users or sharing.
• A built-in AI agent or chat.
• Translation, OCR or scan workflows inside the app; those stay in reformed-retrieval.
• Reading plans, devotional features, and licensed commercial texts (ESV, NA28, BDAG).
Decisions
Decision
Rationale
Built for one user: me
Optimize for depth over onboarding
Effect, Alchemy and Foldkit on Cloudflare; online only
Familiar stack; corpus served from D1/R2
Notes and sync required from M1
Notes are the research product
NC data allowed, in separate packs
Scholarly richness, with a permissive core kept reusable
No built-in agent; expose MCP
External agents improve faster than anything built in
reformed-retrieval stays a separate upstream repo
Its production pipeline and licensing remain independent
Argument structure grows incrementally
An earlier heavy graph attempt didn't pan out
Open questions
[ ] Should Latin originals be searchable directly by M2, or only through the English?
[ ] When does Hebrew depth (BHSA vs. Macula) become a near-term need?
[ ] Is a corpus database split needed against D1's 10 GB limit (text vs. reception vs. user data)?
[ ] Can syntax search run on D1, or does it need a precomputed index elsewhere?
[ ] Is there a lesson from the failed argument-graph attempt to record here?
