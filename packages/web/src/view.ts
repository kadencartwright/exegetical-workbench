import type { Document, Html, HtmlBuilder } from 'foldkit/html'
import { safeLink, type Token, type Citation, type Note, type Passage, type TokenDetail } from './api'
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
  if (item.status === 'error') return h.div([h.Class('error'), h.Role('alert')], [h.p([], [item.error]), ...(['passage', 'syntax', 'citations', 'token', 'coverage', 'notes'].includes(key) ? [h.button([h.Type('button'), h.OnClick(Message.Retry({ key }))], ['Retry'])] : [])])
  return h.div([], [render(envelope(model, key)?.data), provenance(h, model, key)])
}
function passage(h: H, model: Model): Html {
  return resource(h, model, 'passage', value => {
    const data = value as Passage | null
    if (!data?.editions?.length) return empty(h, 'No passage editions are loaded for this reference. See coverage for missing datasets.')
    return h.div([h.Class('parallel')], data.editions.map(edition => h.article([h.Class('edition')], [
      h.div([h.Class('edition-heading')], [h.h3([], [edition.label]), h.span([h.Class('badge')], [edition.language])]),
      h.p([h.Class('passage-text'), h.Lang(edition.language), h.Dir(/^(he|hbo|heb)/i.test(edition.language) ? 'rtl' : 'ltr')], edition.tokens?.length ? edition.tokens.flatMap(token => [h.button([
        h.Type('button'), h.Class(`token ${model.selectedToken === token.id ? 'selected' : ''}`), h.AriaPressed(String(model.selectedToken === token.id)),
        h.AriaLabel(`${token.text}${token.gloss ? ` — ${token.gloss}` : ''}; inspect word`), h.OnClick(Message.SelectToken({ id: token.id })), h.Key(token.id),
      ], [token.text]), ' ']) : [edition.text || 'Text is not loaded.']),
      h.p([h.Class('caption')], [edition.tokens?.length ? 'Select a word to inspect its evidence.' : 'Token analysis is not loaded for this edition.']),
    ])))
  })
}
/** Expand common upstream abbreviations without adding grammatical claims. */
export function plainParse(description: string | undefined): string | undefined {
  return description?.replace(/\b(pron|conj|adv|adj|prep|art|interj)\b/gi, value => ({ pron: 'pronoun', conj: 'conjunction', adv: 'adverb', adj: 'adjective', prep: 'preposition', art: 'article', interj: 'interjection' })[value.toLowerCase()] ?? value)
}
function relatedTokens(h: H, model: Model, token: TokenDetail): Html {
  const referents = (token.analyses ?? []).flatMap(analysis => {
    if (!analysis || typeof analysis !== 'object' || !('referents' in analysis) || !Array.isArray(analysis.referents)) return []
    return analysis.referents.filter((id): id is string => typeof id === 'string')
  })
  const loaded = envelope<Passage>(model, 'passage')?.data?.editions?.flatMap(e => e.tokens ?? []) ?? []
  const related = loaded.filter(t => referents.includes(t.id) || referents.includes((t as Token & { upstreamId?: string }).upstreamId ?? ''))
  if (!related.length) return h.span([], [])
  return h.div([h.Class('referents')], [
    h.h4([], ['Dataset-linked referents in this passage']),
    ...related.map(other => h.div([h.Class('callout')], [
      h.button([h.Type('button'), h.OnClick(Message.SelectToken({ id: other.id }))], [other.text]),
      h.p([], [`Selected form: ${token.morphology?.gender ?? 'gender not supplied'}. Linked form: ${other.morphology?.gender ?? 'gender not supplied'}.`]),
      h.p([h.Class('caption')], ['This comparison reports the loaded morphology and referent annotation. Its grammatical treatment and exegetical implications require independent source evidence.']),
    ])),
  ])
}
function word(h: H, model: Model): Html {
  return resource(h, model, 'token', value => {
    const token = value as TokenDetail | null
    if (!token) return empty(h, 'No token detail returned. Consult coverage.')
    return h.div([], [
      h.div([h.Class('word-title')], [h.h3([h.Lang('grc')], [token.text]), h.span([], [token.gloss ?? 'Gloss not supplied'])]),
      h.dl([h.Class('word-facts')], [h.dt([], ['Lemma']), h.dd([], [token.lemma ?? 'Not loaded']), h.dt([], ['Parsing in plain language']), h.dd([], [plainParse(token.morphology?.description) ?? 'A plain-language parse has not been supplied. A code alone does not explain its interpretation.']), h.dt([], ['Dataset code']), h.dd([], [token.morphology?.code ?? 'Not supplied'])]),
      h.h4([], ['Analyses & source evidence']), evidence(h, token.analyses),
      relatedTokens(h, model, token),
      h.h4([], ['What the grammar can and cannot establish']), evidence(h, token.cautions),
      h.h4([], ['Grammar references']), evidence(h, token.grammar),
      h.p([h.Class('callout')], ['A morphological label identifies a form. A referent or theological conclusion needs its own evidence. Missing analyses are not resolved by the interface.']),
    ])
  }, 'Select a loaded word to inspect its parse, analyses, and grammar limits. αὐτούς is selected automatically when the Matt.28.19 dataset supplies it.')
}
function citations(h: H, model: Model): Html {
  return h.div([], [
    h.p([h.Class('caption')], ['Scripture citations are indexed evidence. No matches never establishes that an author is silent.']),
    resource(h, model, 'citations', value => {
      const rows = Array.isArray(value) ? value as Citation[] : []
      return rows.length ? h.div([h.Class('citations')], rows.map(c => h.article([h.Class('citation')], [
        h.h3([], [c.title]), h.p([h.Class('caption')], [[c.author, c.date].filter(Boolean).join(' · ')]),
        h.span([h.Class('badge review')], [c.reviewStatus || 'Review status not supplied']),
        h.blockquote([], [c.excerpt || 'Excerpt not supplied. Open the source page.']),
        h.p([h.Class('locator')], [c.locator]),
        h.button([h.Type('button'), h.OnClick(Message.OpenPage({ locator: c.locator }))], ['Read exact source page']),
        ...(safeLink(c.deepLink) ? [h.a([h.Href(safeLink(c.deepLink)!), h.Target('_blank'), h.Rel('noopener noreferrer'), h.Class('source-link')], ['Source link ↗'])] : []),
      ]))) : empty(h, 'No indexed citations returned for this verse. Check the loaded corpus and translation coverage below.')
    }),
    h.h3([], ['Search the source library']),
    h.form([h.OnSubmit(Message.SearchSources()), h.Class('inline-form')], [h.label([h.For('source-query'), h.Class('sr-only')], ['Source keywords']), h.input([h.Id('source-query'), h.Type('search'), h.Value(model.sourceQuery), h.Placeholder('Keywords in loaded sources'), h.OnInput(value => Message.SourceQueryChanged({ value }))]), h.button([h.Type('submit')], ['Search'])]),
    resource(h, model, 'sources', data => evidence(h, data), 'Source search has not been run.'),
    h.h3([], ['Source page reader']), resource(h, model, 'page', data => evidence(h, data), 'Open an exact citation above to read its source page and review status.'),
  ])
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
      h.div([h.Class('actions')], [h.button([h.Type('submit'), h.Class('primary'), h.Disabled(saving)], [saving ? 'Saving…' : 'Save note']), h.button([h.Type('button'), h.Disabled(saving), h.OnClick(Message.NewNote())], ['New note'])]),
    ]),
    h.p([h.Role('status'), h.AriaLive('polite'), h.Class('notice')], [model.notice]),
    h.div([h.Class('section-heading')], [h.h3([], ['Saved notes']), h.a([h.Href('/api/notes/export'), h.Attribute('download', '')], ['Export Markdown ↓'])]),
    h.form([h.OnSubmit(Message.SearchNotes()), h.Class('inline-form')], [h.label([h.For('note-query'), h.Class('sr-only')], ['Search all notes']), h.input([h.Id('note-query'), h.Type('search'), h.Value(model.noteQuery), h.Placeholder('Search all notes'), h.OnInput(value => Message.NotesQueryChanged({ value }))]), h.button([h.Type('submit')], ['Search'])]),
    resource(h, model, 'notes', value => {
      const rows = Array.isArray(value) ? value as Note[] : []
      return rows.length ? h.div([], rows.map(note => h.article([h.Class('note-card')], [h.span([h.Class('badge')], [label(note.provenanceTag)]), h.p([h.Class('locator')], [`${note.anchor.type} · ${note.anchor.id}`]), h.p([h.Class('note-body')], [note.body]), h.p([h.Class('caption')], [note.tags.join(' · ')]), h.button([h.Type('button'), h.OnClick(Message.EditNote({ note }))], ['Edit note'])]))) : empty(h, 'No saved notes returned for this query. Your unsaved draft is separate.')
    }),
  ])
}
export const view = (model: Model, h: H): Document => ({
  title: `${model.ref} · Exegetical Workbench`,
  body: h.div([h.Class('app')], [
    h.a([h.Href('#passage'), h.Class('skip-link')], ['Skip to passage']),
    h.header([h.Class('masthead')], [h.div([], [h.p([h.Class('eyebrow')], ['TEXT · LANGUAGE · RECEPTION']), h.h1([], ['Exegetical Workbench'])]), h.span([h.Class('masthead-note')], ['An evidence-led research desk'])]),
    h.main([], [
      h.section([h.Class('navigation'), h.AriaLabel('Passage navigation')], [
        h.div([], [h.p([h.Class('eyebrow')], ['READ & INVESTIGATE']), h.h2([], [model.ref])]),
        h.form([h.OnSubmit(Message.Navigate()), h.Class('reference-form')], [h.label([h.For('reference')], ['Go to a verse']), h.div([h.Class('inline-form')], [h.input([h.Id('reference'), h.Value(model.referenceInput), h.Placeholder('Matthew 28:19'), h.OnInput(value => Message.ReferenceChanged({ value })), h.AriaDescribedBy('reference-help')]), h.button([h.Type('submit'), h.Class('primary')], ['Open passage'])]), h.span([h.Id('reference-help'), h.Class('caption')], ['Book chapter:verse · one verse at a time'])]),
      ]),
      ...(model.navigationError ? [h.p([h.Role('alert'), h.Class('error')], [model.navigationError])] : []),
      h.div([h.Class('workspace')], [
        h.div([h.Class('reading-column')], [
          h.section([h.Id('passage'), h.Class('panel passage-panel'), h.Tabindex(-1), h.AriaLabel('Parallel passage reader')], [h.div([h.Class('section-heading')], [h.h2([], ['The passage']), h.span([h.Class('caption')], ['Parallel editions · select a word'])]), passage(h, model)]),
          h.section([h.Class('panel analysis-panel'), h.AriaLabel('Evidence inspector')], [
            h.nav([h.Class('tabs'), h.AriaLabel('Evidence views')], [['word', 'Word & grammar'], ['syntax', 'Syntax'], ['lexicon', 'Lexicon'], ['reception', 'Reception']].map(([value, text]) => h.button([h.Type('button'), h.Class(model.tab === value ? 'active' : ''), h.AriaPressed(String(model.tab === value)), h.OnClick(Message.TabChanged({ value }))], [text]))),
            h.div([h.Class('inspector')], [model.tab === 'word' ? word(h, model) : model.tab === 'syntax' ? resource(h, model, 'syntax', data => evidence(h, data)) : model.tab === 'lexicon' ? h.div([], [h.h3([], ['Lexical witnesses']), resource(h, model, 'lexicon', data => evidence(h, data), 'Select a token with a loaded lemma.'), h.h3([], ['Concordance']), resource(h, model, 'concordance', data => evidence(h, data), 'A lemma is required to load the concordance.')]) : citations(h, model)]),
          ]),
        ]), notes(h, model),
      ]),
      h.section([h.Class('panel corpus-status')], [h.h2([], ['The limits of this desk']), h.p([h.Class('caption')], ['Only server-loaded evidence appears here. Coverage describes what is available, partial, or not loaded; upstream licenses remain attached to their sources.']), resource(h, model, 'coverage', data => evidence(h, data))]),
    ]),
    h.footer([], ['A personal research workspace · Online only · No built-in AI']),
  ]),
})
