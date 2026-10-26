export const displayHebrew=(text:string,mode:string)=>mode==='letters'?text.replace(/[\u0591-\u05BD\u05BF\u05C1\u05C2\u05C4\u05C5\u05C7]/g,''):mode==='vowels'?text.replace(/[\u0591-\u05AF]/g,''):text;
import { argumentView } from './arguments';
import type { Document, Html, HtmlBuilder } from 'foldkit/html'
import { safeLink, type Token, type Citation, type Note, type Passage, type TokenDetail } from './api'
import { translationView, confessionView, parallelView, domainView, grammarView, syntaxView, lexiconView, concordanceFilters, distributionView, concordanceView, crossreferencesView, sourcePageView, sourceResultsView, coverageView } from './research'
import { envelope, Message, type Model } from './state'

type H = HtmlBuilder<Message>
const label = (key: string) => key.replace(/([a-z])([A-Z])/g, '$1 $2').replace(/[_-]/g, ' ')
const empty = (h: H, text: string) => h.p([h.Class('empty')], [text])
/** Render server evidence as text and safe links, never as untrusted HTML/Markdown. */
function evidence(h: H, value: unknown, depth = 0): Html {
  if (value === null || value === undefined || value === '') return empty(h, 'Not supplied by this dataset.')
  if (typeof value !== 'object') return h.span([], [String(value)])
  if (depth > 7) return empty(h, 'Further nested evidence is available through the source API.')
  if (Array.isArray(value)) return value.length ? h.ul([h.Class('evidence-list')], value.map(v => h.li([], [evidence(h, v, depth + 1)]))) : empty(h, 'No records returned. Consult coverage below for what was searched.')
  return h.dl([h.Class('evidence')], Object.entries(value).flatMap(([key, val]) => {
    const url = /url|link/i.test(key) ? safeLink(val) : undefined
    return [h.dt([], [label(key)]), h.dd([], [url ? h.a([h.Href(url), h.Target('_blank'), h.Rel('noopener noreferrer')], ['Open source ↗']) : evidence(h, val, depth + 1)])]
  }))
}
function provenance(h: H, model: Model, key: string): Html {
  const response = envelope(model, key)
  return response ? h.details([h.Class('provenance')], [h.summary([], ['Coverage & provenance']), h.h4([], ['Coverage']), evidence(h, response.coverage), h.h4([], ['Source record']), evidence(h, response.provenance)]) : h.span([], [])
}
function resource(h: H, model: Model, key: string, render: (data: unknown) => Html, idle = 'Not loaded yet.'): Html {
  const item = model.resources[key]
  if (!item) return empty(h, idle)
  if (item.status === 'loading') return h.p([h.Class('empty'), h.Role('status')], ['Loading from the research server…'])
  if (item.status === 'error') return h.div([h.Class('error'), h.Role('alert')], [h.p([], [item.error]), ...(['passage', 'syntax', 'citations','crossreferences','page','tokenNotes','lexicon','concordance','distribution','sources','session', 'token', 'coverage', 'notes'].includes(key) ? [h.button([h.Type('button'), h.OnClick(Message.Retry({ key }))], ['Retry'])] : [])])
  return h.div([], [render(envelope(model, key)?.data), provenance(h, model, key)])
}
function passage(h: H, model: Model): Html {
  return resource(h, model, 'passage', value => {
    const result = value as (Passage & {passages?:Passage[]}) | null
    const data = result?.passages?.length ? { ...result, editions: result.passages.flatMap(p => p.editions.map(e => ({ ...e, label: `${p.ref} · ${e.label}` }))) } : result
    if (!data?.editions?.length) return empty(h, 'No passage editions are loaded for this reference. See coverage for missing datasets.')
    return h.div([h.Class('parallel')], data.editions.map(edition => h.article([h.Class('edition')], [
      h.div([h.Class('edition-heading')], [h.h3([], [edition.label]), h.span([h.Class('badge')], [edition.language])]),
      ...((data.editions.some(e=>e.language==='he'||e.language==='grc'))?[h.p([h.Class('caption')],['Native edition numbering. Matching reference numbers do not guarantee the same verse content; inspect Hebrew parallels for correspondence.'])]:[]),
      h.p([h.Class('passage-text'), h.Lang(edition.language), h.Dir(/^(he|hbo|heb)/i.test(edition.language) ? 'rtl' : 'ltr')], (edition as {textStatus?:string}).textStatus === 'empty-upstream' ? ['No verse text at this reference in the pinned BSB edition'] : edition.tokens?.length ? edition.tokens.flatMap(token => [h.button([
        h.Type('button'), h.Class(`token ${model.selectedToken === token.id ? 'selected' : ''}`), h.AriaPressed(String(model.selectedToken === token.id)),
        h.AriaLabel(`${token.text}${token.gloss ? ` — ${token.gloss}` : ''}; inspect word`), h.OnClick(Message.SelectToken({ id: token.id })), h.Key(token.id),
      ], [displayHebrew(token.text,model.hebrewDisplay), ...(model.readingMode === 'interlinear' ? [h.span([h.Class('token-gloss')],[token.gloss ?? '—']),h.span([h.Class('token-parse')],[plainParse(token.morphology?.description) ?? 'Parse not loaded'])] : [])]), ' ']) : [edition.text || 'Text is not loaded.']),
      ...((edition as {sourceRefs?:string[]}).sourceRefs ? [h.p([h.Class('caption')], ['Verse boundaries differ. Complete corresponding verses are shown with their native references; no word-level alignment is inferred.'])] : []),
      h.p([h.Class('caption')], [(edition as {textStatus?:string}).textStatus === 'empty-upstream' ? 'This is an explicitly empty upstream verse slot, not missing corpus data.' : edition.tokens?.length ? 'Select a word to inspect its evidence.' : 'Token analysis is not loaded for this edition.']),
    ])))
  })
}
/** Expand common upstream abbreviations without adding grammatical claims. */
export function plainParse(description: string | undefined): string | undefined {
  return description?.replace(/\b(pron|conj|adv|adj|prep|art|interj)\b/gi, value => ({ pron: 'pronoun', conj: 'conjunction', adv: 'adverb', adj: 'adjective', prep: 'preposition', art: 'article', interj: 'interjection' })[value.toLowerCase()] ?? value)
}
function relatedTokens(h: H, model: Model, token: TokenDetail): Html {
  const referents = [...((token as TokenDetail & {referents?:string[]}).referents ?? []), ...(token.analyses ?? []).flatMap(analysis => {
    if (!analysis || typeof analysis !== 'object' || !('referents' in analysis) || !Array.isArray(analysis.referents)) return []
    return analysis.referents.filter((id): id is string => typeof id === 'string')
  })]
  const supplied=(token as TokenDetail & {relatedTokens?:Token[]}).relatedTokens??[]
  const loaded = envelope<Passage>(model, 'passage')?.data?.editions?.flatMap(e => e.tokens ?? []) ?? []
  const related = [...new Map([...supplied,...loaded.filter(t => referents.includes(t.id) || referents.includes((t as Token & { upstreamId?: string }).upstreamId ?? ''))].map(t=>[t.id,t])).values()]
  if (!related.length) return h.span([], [])
  return h.div([h.Class('referents')], [
    h.h4([], ['Dataset-linked referents']),
    ...related.map(other => h.div([h.Class('callout')], [
      h.a([h.Href(`/study/${encodeURIComponent(other.id.split(':')[1] ?? model.ref)}?token=${encodeURIComponent(other.id)}`)], [other.text, ' · ',other.id.split(':')[1] ?? model.ref]),
      h.p([], [`Selected form: ${token.morphology?.gender ?? 'gender not supplied'}. Linked form: ${other.morphology?.gender ?? 'gender not supplied'}.`]),
      h.p([h.Class('caption')], ['This comparison reports the loaded morphology and referent annotation. Its grammatical treatment and exegetical implications require independent source evidence.']),
    ])),
  ])
}
function word(h: H, model: Model): Html {
  return resource(h, model, 'token', value => {
    const token = value as (TokenDetail & {strong?:string;transliteration?:string;agreement?:{relatedTokenId:string;observation:string;limitation:string}[]}) | null
    if (!token) return empty(h, 'No token detail returned. Consult coverage.')
    const autous = model.ref === 'Matt.28.19' && token.text.normalize('NFD').replace(/\p{M}/gu,'').replace(/[.,·;]/g,'') === 'αυτους'
    const noteCount = envelope<Note[]>(model,'tokenNotes')?.data?.length
    const citationCount = envelope<Citation[]>(model,'citations')?.data?.length
    return h.div([], [
      h.div([h.Class('word-title')], [h.h3([h.Lang('grc')], [token.text]), h.span([], [token.gloss ?? 'Gloss not supplied'])]),
      h.dl([h.Class('word-facts')], [h.dt([], ['Lemma']), h.dd([], [token.lemma ?? 'Not loaded']), h.dt([], ['Parsing in plain language']), h.dd([], [plainParse(token.morphology?.description) ?? 'A plain-language parse has not been supplied.']), ...(token.transliteration ? [h.dt([],['Transliteration']),h.dd([],[token.transliteration])] : []),h.dt([], ['Dataset code']), h.dd([], [token.morphology?.code ?? 'Not supplied'])]),
      relatedTokens(h, model, token),
      ...(token.agreement?.length ? [h.details([], [h.summary([], ['Agreement annotation & limits']),...token.agreement.flatMap(a => [h.p([],[a.observation]),h.p([h.Class('caption')],[a.limitation]),h.button([h.Type('button'),h.OnClick(Message.SelectToken({id:a.relatedTokenId}))],['Inspect the linked token'])])])] : []),
      h.h4([], ['Grammar references — what the form can and cannot establish']), grammarView(h, token.grammar),
      h.h4([], [`Notes on this token${noteCount === undefined ? '' : ` · ${noteCount}`}`]), savedNotes(h,model,'tokenNotes'),
      h.div([h.Class('actions')],[h.button([h.Type('button'),h.OnClick(Message.AnchorSelected({type:'token',id:token.id}))], ['Anchor a note to this word']),h.button([h.Type('button'),h.OnClick(Message.PhraseStart({id:token.id}))], ['Start phrase here']),h.button([h.Type('button'),h.Disabled(!model.phraseStart),h.OnClick(Message.PhraseEnd({id:token.id}))], ['End phrase & anchor note'])]),
      h.details([h.Class('reception-chain')], [h.summary([], [`All indexed citations of this passage${citationCount === undefined ? '' : ` · ${citationCount}`}`]),citations(h,model)]),
      ...(autous && token.lemma === 'ἑαυτοῦ' ? [h.div([h.Class('callout')],[h.h4([],['Lemma discrepancy in the source']),h.p([],[`Macula supplies ${token.lemma}${token.strong ? ` (Strong ${token.strong})` : ''} for this αὐτούς token. That annotation is retained. Compare αὐτός / G846 as a separate lexical lookup; it does not replace the dataset analysis.`]),h.button([h.Type('button'),h.OnClick(Message.LookupLemma({lemma:'G846'}))],['Compare αὐτός / G846 separately'])])] : []),
      h.details([h.Class('provenance')],[h.summary([], ['All analyses, cautions & source evidence']),evidence(h,token.analyses),h.h4([],['Cautions from the dataset']),evidence(h,token.cautions)]),
    ])
  }, 'Select a loaded word to inspect its parse, analyses, and grammar limits. αὐτούς is selected automatically when the Matt.28.19 dataset supplies it.')
}
function citations(h: H, model: Model): Html {
  return h.div([], [
    h.p([h.Class('caption')], ['Scripture citations are indexed evidence. No matches never establishes that an author is silent.']),
    resource(h, model, 'citations', value => {
      const rows = Array.isArray(value) ? value as Citation[] : []
      return rows.length ? h.div([h.Class('citations')], [h.p([h.Class('caption')],[`${rows.length} indexed citations returned · exact source locators below`]), ...rows.map(c => h.article([h.Class('citation')], [
        h.h3([], [c.title]), h.p([h.Class('caption')], [[c.author, c.date].filter(Boolean).join(' · ')]),
        h.span([h.Class('badge review')], [c.reviewStatus || 'Review status not supplied']),
        h.blockquote([], [c.excerpt || 'Excerpt not supplied. Open the source page.']),
        h.p([h.Class('locator')], [c.locator]),
        h.button([h.Type('button'), h.OnClick(Message.OpenPage({ locator: c.locator }))], ['Read exact source page']),
        ...(safeLink(c.deepLink) ? [h.a([h.Href(safeLink(c.deepLink)!), h.Target('_blank'), h.Rel('noopener noreferrer'), h.Class('source-link')], ['Source link ↗'])] : []),
      ]))]) : empty(h, 'No indexed citations returned for this verse. Check the loaded corpus and translation coverage below.')
    }),
    ...(model.sourceId ? [h.h3([],['Pinned source record']),resource(h,model,'sourceMeta',data=>evidence(h,data))] : []),
    h.h3([], ['Search the source library']),
    h.form([h.OnSubmit(Message.SearchSources()), h.Class('inline-form')], [h.label([h.For('source-query'), h.Class('sr-only')], ['Source keywords']), h.input([h.Id('source-query'), h.Type('search'), h.Value(model.sourceQuery), h.Placeholder('Keywords in loaded sources'), h.OnInput(value => Message.SourceQueryChanged({ value }))]), h.button([h.Type('submit')], ['Search'])]),
    resource(h, model, 'sources', data => sourceResultsView(h, model, data), 'Source search has not been run.'),
    h.h3([], ['Source page reader']), resource(h, model, 'page', data => sourcePageView(h, data, model), 'Open an exact citation above to read its source page and review status.'),
  ])
}
function savedNotes(h: H, model: Model, key: string): Html {
  return resource(h,model,key,value => {
    const rows = Array.isArray(value) ? value as Note[] : []
    return rows.length ? h.div([],rows.map(n => h.article([h.Class('note-card')],[h.span([h.Class('badge')],[label(n.provenanceTag)]),h.p([h.Class('note-body')],[n.body]),h.a([h.Href(`/notes/${encodeURIComponent(n.id)}?ref=${encodeURIComponent(model.ref)}`)],['Open note']),h.button([h.Type('button'),h.OnClick(Message.EditNote({note:n}))],['Edit note'])]))) : empty(h,'No saved notes at this anchor.')
  })
}
function session(h: H, model: Model): Html {
  const data = envelope<{owner?:string; login?:string; authenticated?:boolean; user?:{name?:string;sub?:string}; mode?:string;configured?:boolean}>(model,'session')?.data
  return h.div([h.Class('session')], [h.span([], [(data?.authenticated || data?.owner) ? `Signed in${data.login ? ` as ${data.login}` : data.user?.name ? ` as ${data.user.name}` : ''}${(data.mode === 'local-development' || data.owner === 'local-development-user') ? ' · Local development identity' : ''}` : 'Private notes require sign in']),(data?.owner === 'local-development-user') ? h.span([h.Class('badge')],['Local development']) : (data?.authenticated || data?.owner) ? h.form([h.Attribute('method','post'),h.Attribute('action','/auth/logout')],[h.button([h.Type('submit'),h.Disabled(model.dirty)],['Sign out'])]) : h.a([h.Href(`/auth/login?returnTo=${encodeURIComponent('/study/'+model.ref)}`)],['Sign in']),...(model.resources.session?.status === 'error' ? [h.span([h.Class('caption')],[model.resources.session.error])] : [])])
}
function notes(h: H, model: Model): Html {
  const saving = model.resources.save?.status === 'loading'
  return h.aside([h.Class('notes-panel'), h.AriaLabel('Anchored research notes')], [
    h.div([h.Class('section-heading')], [h.h2([], ['Research notes']), h.span([h.Class('badge')], [model.dirty ? 'Unsaved' : model.editingId ? 'Saved' : 'New note'])]),
    h.p([h.Class('caption')], ['Your draft stays attached to its original anchor when you navigate. Saving requires a live, authenticated server connection.']),
    h.p([h.Class('anchor')], [`${model.noteAnchorType} · ${model.noteAnchorId}`]),
    h.form([h.OnSubmit(Message.Save())], [
      h.label([h.For('anchor-type')], ['Anchor type']),
      h.select([h.Id('anchor-type'), h.Value(model.noteAnchorType), h.OnChange(value => Message.EditorChanged({ field: 'noteAnchorType', value }))], ['token', 'phrase', 'clause', 'verse-range', 'source-page'].map(value => h.option([h.Value(value)], [label(value)]))),
      h.label([h.For('anchor-id')], ['Anchor identifier']),
      h.input([h.Id('anchor-id'), h.Value(model.noteAnchorId), h.OnInput(value => Message.EditorChanged({ field: 'noteAnchorId', value }))]),
      h.details([], [h.summary([],['Additional anchors']),h.p([h.Class('caption')],['One anchor per line: token|identifier or source-page|locator. Quote-to-note adds the selected Greek token automatically.']),h.textarea([h.Value(model.extraAnchors),h.OnInput(value=>Message.EditorChanged({field:'extraAnchors',value}))])]),
      h.label([h.For('note-body')], [model.editingId ? 'Edit Markdown note' : 'New Markdown note']),
      h.textarea([h.Id('note-body'), h.Rows(9), h.Value(model.body), h.Placeholder('Record the argument, the evidence, and what remains uncertain…'), h.OnInput(value => Message.EditorChanged({ field: 'body', value }))]),
      h.label([h.For('note-provenance')], ['Provenance']),
      h.select([h.Id('note-provenance'), h.Value(model.provenanceTag), h.OnChange(value => Message.EditorChanged({ field: 'provenanceTag', value }))], [['my-inference', 'My inference'], ['quoted', 'Quoted — exact source words'], ['paraphrased', 'Paraphrased — author’s point']].map(([value, text]) => h.option([h.Value(value)], [text]))),
      h.label([h.For('source-locator')], ['Exact source locator']),
      h.input([h.Id('source-locator'), h.Value(model.sourceLocator), h.Placeholder('Exact normalized page locator'), h.OnInput(value => Message.EditorChanged({ field: 'sourceLocator', value }))]),
      ...(['quoted', 'paraphrased'].includes(model.provenanceTag) ? [
        h.div([h.Class('source-metadata')], [
          h.p([h.Class('caption')], ['Source metadata is required; copy it from the evidence record.']),
          ...[['source', 'Source'], ['sourceEdition', 'Edition'], ['sourceVersion', 'Version or pinned revision'], ['sourceLicense', 'License'], ['sourceReview', 'Review status'], ['sourceLink', 'Source page URL (optional)']].flatMap(([field, text]) => [
            h.label([h.For(`note-${field}`)], [text]),
            h.input([h.Id(`note-${field}`), h.Value(String(model[field as keyof Model])), h.OnInput(value => Message.EditorChanged({ field, value }))]),
          ]),
        ]),
      ] : []),
      h.label([h.For('note-tags')], ['Tags, separated by commas']),
      h.input([h.Id('note-tags'), h.Value(model.tags), h.Placeholder('baptism, agreement, referent'), h.OnInput(value => Message.EditorChanged({ field: 'tags', value }))]),
      h.div([h.Class('actions')], [h.button([h.Type('submit'), h.Class('primary'), h.Disabled(saving)], [saving ? 'Saving…' : 'Save note']), h.button([h.Type('button'), h.Disabled(saving), h.OnClick(Message.NewNote())], ['New note']), h.button([h.Type('button'),h.Disabled(saving || !model.dirty),h.OnClick(Message.Discard())], ['Discard draft'])]),
    ]),
    ...(model.discardPending ? [h.div([h.Class('callout'),h.Role('alert')], [h.p([], ['Discard unsaved changes? This cannot be undone.']),h.button([h.Type('button'),h.OnClick(Message.ConfirmDiscard())], ['Confirm discard']),h.button([h.Type('button'),h.OnClick(Message.CancelDiscard())], ['Keep editing'])])] : []),
    h.p([h.Role('status'), h.AriaLive('polite'), h.Class('notice')], [model.notice]),
    h.div([h.Class('section-heading')], [h.h3([], ['Saved notes']), h.a([h.Href('/api/notes/export'), h.Attribute('download', '')], ['Export Markdown ↓'])]),
    h.button([h.Type('button'),h.OnClick(Message.ReloadNotes())], ['Reload synced notes']),
    h.form([h.OnSubmit(Message.SearchNotes()), h.Class('inline-form')], [h.label([h.For('note-query'), h.Class('sr-only')], ['Search all notes']), h.input([h.Id('note-query'), h.Type('search'), h.Value(model.noteQuery), h.Placeholder('Search all notes'), h.OnInput(value => Message.NotesQueryChanged({ value }))]), h.button([h.Type('submit')], ['Search'])]),
    resource(h, model, 'notes', value => {
      const rows = Array.isArray(value) ? value as Note[] : []
      return rows.length ? h.div([], rows.map(note => h.article([h.Class('note-card')], [h.span([h.Class('badge')], [label(note.provenanceTag)]), h.p([h.Class('locator')], [`${note.anchor.type} · ${note.anchor.id}`]), h.p([h.Class('note-body')], [note.body]), h.p([h.Class('caption')], [note.tags.join(' · ')]), h.a([h.Href(`/notes/${encodeURIComponent(note.id)}?ref=${encodeURIComponent(model.ref)}`)], ['Open note']),h.button([h.Type('button'), h.OnClick(Message.EditNote({ note }))], ['Edit note'])]))) : empty(h, 'No saved notes returned for this query. Your unsaved draft is separate.')
    }),
  ])
}
export const view = (model: Model, h: H): Document => ({
  title: `${model.ref} · Exegetical Workbench`,
  body: h.div([h.Class('app')], [
    h.a([h.Href('#passage'), h.Class('skip-link')], ['Skip to passage']),
    h.header([h.Class('masthead')], [h.div([], [h.p([h.Class('eyebrow')], ['TEXT · LANGUAGE · RECEPTION']), h.h1([], ['Exegetical Workbench'])]), h.span([h.Class('masthead-note')], ['An evidence-led research desk'])]),
    h.main([], [session(h,model),
      h.section([h.Class('navigation'), h.AriaLabel('Passage navigation')], [
        h.div([], [h.p([h.Class('eyebrow')], ['READ & INVESTIGATE']), h.h2([], [model.ref])]),
        h.form([h.OnSubmit(Message.Navigate()), h.Class('reference-form')], [h.label([h.For('reference')], ['Go to a verse']), h.div([h.Class('inline-form')], [h.input([h.Id('reference'), h.Value(model.referenceInput), h.Placeholder('Matthew 28:19'), h.OnInput(value => Message.ReferenceChanged({ value })), h.AriaDescribedBy('reference-help')]), h.button([h.Type('submit'), h.Class('primary')], ['Open passage'])]), h.span([h.Id('reference-help'), h.Class('caption')], ['Verse, chapter, range, or ff · resolved against the loaded corpus'])]),
      ]),
      ...(model.navigationError ? [h.p([h.Role('alert'), h.Class('error')], [model.navigationError])] : []),
      h.div([h.Class('workspace')], [
        h.div([h.Class('reading-column')], [
          h.section([h.Id('passage'), h.Class('panel passage-panel'), h.Tabindex(-1), h.AriaLabel('Parallel passage reader')], [h.div([h.Class('section-heading')], [h.h2([], ['The passage']), h.span([h.Class('caption')], ['Parallel editions · select a word'])]), h.div([h.Class('actions')],[h.button([h.Type('button'),h.AriaPressed(String(model.readingMode === 'reading')),h.OnClick(Message.ReadingMode({value:'reading'}))],['Reading']),h.button([h.Type('button'),h.AriaPressed(String(model.readingMode === 'interlinear')),h.OnClick(Message.ReadingMode({value:'interlinear'}))],['Interlinear']),h.button([h.Type('button'),h.OnClick(Message.AnchorSelected({type:'verse-range',id:model.ref}))],['Anchor passage note']),h.select([h.AriaLabel('Hebrew display'),h.Value(model.hebrewDisplay),h.OnChange(value=>Message.HebrewDisplay({value}))],[h.option([h.Value('all')],['Hebrew: all marks']),h.option([h.Value('vowels')],['Hebrew: vowels only']),h.option([h.Value('letters')],['Hebrew: consonants'])])]),passage(h, model)]),
          h.section([h.Class('panel analysis-panel'), h.AriaLabel('Evidence inspector')], [
            h.nav([h.Class('tabs'), h.AriaLabel('Evidence views')], [['word', 'Word & grammar'], ['syntax', 'Syntax'], ['lexicon', 'Lexicon'], ['reception', 'Reception'], ['crossreferences', 'Cross-references'], ['library','Translations & sources']].map(([value, text]) => h.button([h.Type('button'), h.Class(model.tab === value ? 'active' : ''), h.AriaPressed(String(model.tab === value)), h.OnClick(Message.TabChanged({ value }))], [text]))),
            h.div([h.Class('inspector')], [model.tab === 'word' ? word(h, model) : model.tab === 'grammar' ? resource(h,model,'grammar',data=>grammarView(h,data)) : model.tab === 'syntax' ? resource(h, model, 'syntax', data => syntaxView(h, model, data)) : model.tab === 'lexicon' ? h.div([], [h.h3([], ['Lexical witnesses']),h.p([h.Class('caption')],[`Lookup: ${model.lookupLemma || envelope<TokenDetail>(model,'token')?.data?.lemma || 'select a lemma'}`]),...(model.lookupLemma ? [h.button([h.Type('button'),h.OnClick(Message.LookupLemma({lemma:''}))],['Return to source lemma'])] : []), resource(h, model, 'lexicon', data => lexiconView(h, data), 'Select a token with a loaded lemma.'), h.h3([],['BSB renderings']),resource(h,model,'renderings',data=>evidence(h,data),'Select a word with a Strong identifier to inspect BSB translation renderings.'),h.h3([], ['Concordance']),concordanceFilters(h,model),resource(h,model,'distribution',data => distributionView(h,data)), resource(h, model, 'concordance', data => concordanceView(h, model, data), 'A lemma is required to load the concordance.')]) : model.tab === 'library' ? h.div([],[h.h3([],['English-to-original translation table']),h.p([h.Class('caption')],['BSB’s own underlying-text alignment; no identity with SBLGNT tokens is presumed.']),resource(h,model,'translations',data=>translationView(h,data)),h.h3([],['Greek/Hebrew verse correspondence']),resource(h,model,'parallel',data=>parallelView(h,data),'Choose Hebrew parallel from an LXX concordance occurrence.'),h.h3([],['Semantic domain']),resource(h,model,'domain',data=>domainView(h,data),'Choose a domain from a UBS lexical entry.'),h.h3([],['Westminster Standards']),h.form([h.OnSubmit(Message.ConfessionSearch())],[h.label([],['Section or question',h.input([h.Value(model.researchFields.confession||'WCF.21.5'),h.Placeholder('WCF.21.5, WLC.1, WSC.1'),h.OnInput(value=>Message.ResearchField({field:'confession',value}))])]),h.button([h.Type('submit')],['Read'])]),resource(h,model,'confessions',data=>confessionView(h,data))]) : model.tab === 'crossreferences' ? resource(h,model,'crossreferences',data => crossreferencesView(h,data)) : citations(h, model)]),
          ]),
        ]), notes(h, model),
      ]),
      argumentView(h,model),
      h.section([h.Class('panel corpus-status')], [h.h2([], ['The limits of this desk']), h.p([h.Class('caption')], ['Only server-loaded evidence appears here. Coverage describes what is available, partial, or not loaded; upstream licenses remain attached to their sources.']), resource(h, model, 'coverage', data => coverageView(h, data))]),
    ]),
    h.footer([], ['A personal research workspace · Online only · No built-in AI']),
  ]),
})
