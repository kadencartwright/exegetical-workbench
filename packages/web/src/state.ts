import { Effect, Schema } from 'effect'
import { Command, type Runtime, type Update } from 'foldkit'
import { defineMessageUnion } from 'foldkit/message'
import { normalizeReference, request, type Envelope, type Note, type NoteTag, type Passage, type TokenDetail } from './api'

const Resource = Schema.Struct({ status: Schema.String, requestId: Schema.Number, payload: Schema.Unknown, error: Schema.String })
export const Model = Schema.Struct({
  ref: Schema.String, referenceInput: Schema.String, navigationError: Schema.String,
  serial: Schema.Number, selectedToken: Schema.String, tab: Schema.String,
  resources: Schema.Record(Schema.String, Resource),
  body: Schema.String, tags: Schema.String, provenanceTag: Schema.String, sourceLocator: Schema.String, source: Schema.String, sourceEdition: Schema.String, sourceVersion: Schema.String, sourceLicense: Schema.String, sourceReview: Schema.String, sourceLink: Schema.String,
  editingId: Schema.String, dirty: Schema.Boolean, editorVersion: Schema.Number, saveVersion: Schema.Number,
  noteAnchorType: Schema.String, noteAnchorId: Schema.String, noteQuery: Schema.String, sourceQuery: Schema.String,
  notice: Schema.String, discardPending: Schema.Boolean, pendingToken: Schema.String, pageLocator: Schema.String,
  filterBook: Schema.String, filterForm: Schema.String, filterEdition: Schema.String, concordanceOffset: Schema.Number, phraseStart: Schema.String, readingMode: Schema.String, lookupLemma: Schema.String, sourceId: Schema.String,
})
export type Model = typeof Model.Type
export const Message = defineMessageUnion({
  LookupLemma: { lemma: Schema.String },
  PhraseStart: { id: Schema.String }, PhraseEnd: { id: Schema.String }, ReadingMode: { value: Schema.String },
  BrowserDone: {}, RouteChanged: { href: Schema.String }, LinkRequested: { href: Schema.String },
  Discard: {}, CancelDiscard: {}, ConfirmDiscard: {}, ReloadNotes: {}, Logout: {},
  AnchorSelected: { type: Schema.String, id: Schema.String },
  FilterChanged: { field: Schema.String, value: Schema.String }, SearchConcordance: {}, ConcordancePage: { offset: Schema.Number },
  ReferenceChanged: { value: Schema.String }, Navigate: {}, Retry: { key: Schema.String },
  SelectToken: { id: Schema.String }, TabChanged: { value: Schema.String },
  Loaded: { key: Schema.String, requestId: Schema.Number, payload: Schema.Unknown, error: Schema.String },
  EditorChanged: { field: Schema.String, value: Schema.String }, Save: {},
  EditNote: { note: Schema.Unknown }, NewNote: {},
  NotesQueryChanged: { value: Schema.String }, SearchNotes: {},
  SourceQueryChanged: { value: Schema.String }, SearchSources: {}, OpenPage: { locator: Schema.String },
})
export type Message = typeof Message.Type
const FetchResource = Command.define('FetchResource', {
  args: { key: Schema.String, path: Schema.String, requestId: Schema.Number, method: Schema.String, body: Schema.Unknown },
  messages: [Message.Loaded],
  execute: ({ key, path, requestId, method, body }) => Effect.tryPromise({
    try: () => request(path, method, body), catch: error => error instanceof Error ? error.message : 'Network unavailable. This workspace requires an online connection.',
  }).pipe(
    Effect.map(payload => Message.Loaded({ key, requestId, payload, error: '' })),
    Effect.catch(error => Effect.succeed(Message.Loaded({ key, requestId, payload: null, error }))),
  ),
})
const Browser = Command.define('Browser', {
  args: { href: Schema.String, external: Schema.Boolean, dirty: Schema.Boolean }, messages: [Message.BrowserDone],
  execute: ({ href, external, dirty }) => Effect.sync(() => {
    window.onbeforeunload = dirty ? event => { event.preventDefault(); event.returnValue = ''; } : null
    if (href && external) window.location.assign(href)
    else if (href && window.location.pathname + window.location.search !== href) window.history.pushState(null, '', href)
    return Message.BrowserDone()
  }),
})
type Result = Update.Return<Model, Message>
export function load(model: Model, requests: Array<{ key: string; path: string; method?: string; body?: unknown }>): Result {
  const serial = model.serial + 1
  const resources = { ...model.resources }
  for (const r of requests) resources[r.key] = { status: 'loading', requestId: serial, payload: null, error: '' }
  return { model: { ...model, serial, resources }, commands: requests.map(r => FetchResource({ ...r, requestId: serial, method: r.method ?? 'GET', body: r.body })) }
}
export const envelope = <T = unknown>(model: Model, key: string): Envelope<T> | undefined => model.resources[key]?.status === 'ready' ? model.resources[key].payload as Envelope<T> : undefined
const query = encodeURIComponent
function passageRequests(ref: string) { return [
  { key: 'passage', path: `/api/passage?ref=${query(ref)}` },
  { key: 'syntax', path: `/api/syntax?ref=${query(ref)}` },
  { key: 'citations', path: `/api/citations?ref=${query(ref)}` },
  { key: 'crossreferences', path: `/api/crossreferences?ref=${query(ref)}` },
  { key: 'notes', path: `/api/notes?anchor=${query(ref)}` },
] }
export const initialModel: Model = {
  ref: 'Matt.28.19', referenceInput: 'Matt.28.19', navigationError: '', serial: 0, selectedToken: '', tab: 'word', resources: {},
  body: '', tags: '', provenanceTag: 'my-inference', sourceLocator: '', source: '', sourceEdition: '', sourceVersion: '', sourceLicense: '', sourceReview: '', sourceLink: '', editingId: '', dirty: false, editorVersion: 0, saveVersion: 0,
  discardPending: false, pendingToken: '', pageLocator: '', filterBook: '', filterForm: '', filterEdition: '', concordanceOffset: 0, phraseStart: '', readingMode: 'reading', lookupLemma: '', sourceId: '',
  noteAnchorType: 'verse-range', noteAnchorId: 'Matt.28.19', noteQuery: '', sourceQuery: '', notice: '',
}
export const init: Runtime.ApplicationInit<Model, Message> = () => load(initialModel, [...passageRequests(initialModel.ref), { key: 'coverage', path: '/api/coverage' }, { key: 'session', path: '/auth/session' }])
/** Initial app deep links; normal navigation still uses explicit server requests. */
const decodePath = (path: string): string => { try { return decodeURIComponent(path) } catch { return path } }
export function initFromUrl(href: string): Result {
  const url = new URL(href)
  const pathRef = url.pathname.startsWith('/study/') ? decodePath(url.pathname.slice(7)) : undefined
  const ref = normalizeReference(url.searchParams.get('ref') ?? pathRef ?? initialModel.ref) ?? initialModel.ref
  const model = { ...initialModel, ref, referenceInput: ref, noteAnchorId: ref, tab: ['word','syntax','lexicon','reception','crossreferences','grammar'].includes(url.searchParams.get('tab') ?? '') ? url.searchParams.get('tab')! : 'word', pendingToken: url.searchParams.get('token') ?? '', lookupLemma: url.searchParams.get('lemma') ?? '', concordanceOffset: Math.max(0,Math.floor(Number(url.searchParams.get('offset')) || 0)), filterBook: url.searchParams.get('book') ?? '', filterForm: url.searchParams.get('form') ?? '', filterEdition: url.searchParams.get('edition') ?? '' }
  const requests = [...passageRequests(ref), { key: 'coverage', path: '/api/coverage' }, { key: 'session', path: '/auth/session' }]
  if (url.pathname === '/grammar') {
    model.tab = 'grammar'
    requests.push({key:'grammar',path:`/api/grammar?${url.searchParams}`})
  }
  if (url.pathname === '/lexicon' && url.searchParams.get('lemma')) {
    model.tab = 'lexicon'; model.lookupLemma = url.searchParams.get('lemma')!
    const params = new URLSearchParams({lemma:model.lookupLemma})
    requests.push({key:'lexicon',path:`/api/lexicon?${params}`},{key:'concordance',path:`/api/concordance?${params}`},{key:'distribution',path:`/api/distribution?${params}`})
  }
  if (url.pathname.startsWith('/sources/')) {
    model.tab = 'reception'; model.sourceId = decodePath(url.pathname.slice(9))
    requests.push({key:'sourceMeta',path:`/api/source?id=${query(model.sourceId)}`})
  }
  if (url.pathname === '/source-page' && url.searchParams.get('locator')) {
    requests.push({ key: 'page', path: `/api/source-page?locator=${query(url.searchParams.get('locator')!)}` })
    model.tab = 'reception'; model.pageLocator = url.searchParams.get('locator')!
  }
  if (url.pathname.startsWith('/notes/') && url.pathname.slice(7)) requests.push({ key: 'openNote', path: `/api/notes/${query(decodePath(url.pathname.slice(7)))}` })
  return load(model, requests)
}
function select(model: Model, id: string): Result {
  return load({ ...model, selectedToken: id, lookupLemma: '', pendingToken: '', tab: 'word', pageLocator: '', concordanceOffset: 0, resources: Object.fromEntries(Object.entries(model.resources).filter(([key]) => !['lexicon', 'concordance'].includes(key))),
    ...(!model.dirty && !model.editingId ? { noteAnchorType: 'token', noteAnchorId: id } : {}),
  }, [{ key: 'token', path: `/api/token?id=${query(id)}` }, { key: 'tokenNotes', path: `/api/notes?anchor=${query(id)}` }])
}
export function noteValidation(model: Model): string | undefined {
  if (!model.noteAnchorId.trim()) return 'An anchor is required.'
  if (!['token', 'phrase', 'clause', 'verse-range', 'source-page'].includes(model.noteAnchorType)) return 'Select a supported anchor type.'
  if (!model.body.trim()) return 'Write a note before saving.'
  if (['quoted', 'paraphrased'].includes(model.provenanceTag) && [model.sourceLocator, model.source, model.sourceEdition, model.sourceVersion, model.sourceLicense, model.sourceReview].some(value => !value.trim())) return 'Quoted and paraphrased notes require a source, edition, version, license, exact locator, and review status.'
  if (model.provenanceTag === 'agent-generated') return 'M1 supports user-authored notes. External-agent writes are not enabled.'
  return undefined
}
const coreUpdate = (model: Model, message: Message): Result => Message.match<Result>(message, {
  LookupLemma: ({lemma}) => lexicalRequests({...model,lookupLemma:lemma,tab:'lexicon'},0),
  PhraseStart: ({id}) => ({model:{...model,phraseStart:id,notice:'Select the end of your phrase, then anchor it. This is your selected span, not an imported clause analysis.'}}),
  PhraseEnd: ({id}) => model.phraseStart ? coreUpdate(model,Message.AnchorSelected({type:'phrase',id:`token-range:${model.phraseStart}..${id}`})) : {model:{...model,notice:'Select a phrase start first.'}},
  ReadingMode: ({value}) => ({model:{...model,readingMode:value}}),
  BrowserDone: () => ({ model }),
  LinkRequested: ({ href }) => {
    const url = new URL(href, 'https://workbench.invalid')
    if (url.hash) return {model,commands:[Browser({href,external:true,dirty:model.dirty})]}
    if ((url.pathname.startsWith('/api/') || url.pathname.startsWith('/auth/')) || !href.startsWith('/')) return { model, commands: [Browser({ href, external: true, dirty: model.dirty })] }
    const next = coreUpdate(model, Message.RouteChanged({ href: url.href }))
    return { ...next, commands: [...(next.commands ?? []), Browser({ href: url.pathname + url.search, external: false, dirty: model.dirty })] }
  },
  RouteChanged: ({ href }) => {
    const route = initFromUrl(href)
    // In-flight responses from the previous route must never overwrite this route.
    const requests = (route.commands ?? []).map(c => c.args as {key:string;path:string}).filter(r => r.key !== 'session')
    return load({ ...model, ref: route.model.ref, referenceInput: route.model.ref, selectedToken: '', pendingToken: route.model.pendingToken, lookupLemma:route.model.lookupLemma, concordanceOffset:route.model.concordanceOffset, tab: route.model.tab, pageLocator: route.model.pageLocator, sourceId:route.model.sourceId, filterBook: route.model.filterBook, filterForm: route.model.filterForm, filterEdition: route.model.filterEdition, resources: Object.fromEntries(Object.entries(model.resources).filter(([key]) => ['session','save'].includes(key))), navigationError: '', ...(!model.dirty && !model.editingId ? { noteAnchorType: 'verse-range', noteAnchorId: route.model.ref } : {}) }, requests)
  },
  Discard: () => ({ model: { ...model, discardPending: true } }),
  CancelDiscard: () => ({ model: { ...model, discardPending: false } }),
  ConfirmDiscard: () => model.resources.save?.status === 'loading' ? { model } : coreUpdate({ ...model, dirty: false, discardPending: false }, Message.NewNote()),
  AnchorSelected: ({ type, id }) => {
    if (model.dirty || model.resources.save?.status === 'loading') return {model:{...model,notice:'Save or discard the draft before changing its anchor.'}}
    const reset = coreUpdate(model,Message.NewNote()).model
    const page = type === 'source-page' ? envelope<{provenance?:Record<string,string>}>(model,'page')?.data?.provenance : undefined
    return load({...reset,noteAnchorType:type,noteAnchorId:id,phraseStart:'',...(page ? {source:page.source??'',sourceEdition:page.edition??'',sourceVersion:page.version??'',sourceLicense:page.license??'',sourceReview:page.reviewStatus??'',sourceLocator:page.locator??id,sourceLink:page.deepLink??''} : {})},[{key:'notes',path:`/api/notes?anchor=${query(id)}`}])
  },
  ReloadNotes: () => load(model, [{ key: 'notes', path: `/api/notes?anchor=${query(model.noteAnchorId)}` }, ...(model.selectedToken ? [{ key: 'tokenNotes', path: `/api/notes?anchor=${query(model.selectedToken)}` }] : []), { key: 'session', path: '/auth/session' }, ...(model.editingId && !model.dirty ? [{key:'openNote',path:`/api/notes/${query(model.editingId)}`}] : [])]),
  Logout: () => model.dirty ? { model: { ...model, notice: 'Save or discard your draft before signing out.' } } : load(model, [{ key: 'logout', path: '/auth/logout', method: 'POST' }]),
  FilterChanged: ({ field, value }) => ['filterBook','filterForm','filterEdition'].includes(field) ? { model: { ...model, [field]: value, concordanceOffset: 0 } } : { model },
  SearchConcordance: () => lexicalRequests(model, 0),
  ConcordancePage: ({ offset }) => lexicalRequests(model, Math.max(0, offset)),
  ReferenceChanged: ({ value }) => ({ model: { ...model, referenceInput: value } }),
  Navigate: () => {
    if (model.resources.save?.status === 'loading') return { model: { ...model, navigationError: 'Wait for the note save to finish before opening another passage.' } }
    const ref = normalizeReference(model.referenceInput)
    if (!ref) return { model: { ...model, navigationError: 'Enter a Bible reference, for example Matthew 28:19, John 3, or Rom 8:28-30.' } }
    return load({ ...model, ref, referenceInput: ref, selectedToken: '', pendingToken: '', pageLocator: '', resources: Object.fromEntries(Object.entries(model.resources).filter(([key]) => ['session','save'].includes(key))), navigationError: '',
      ...(!model.dirty && !model.editingId ? { noteAnchorType: 'verse-range', noteAnchorId: ref } : {}),
    }, [...passageRequests(ref), { key: 'coverage', path: '/api/coverage' }])
  },
  SelectToken: ({ id }) => select(model, id),
  TabChanged: ({ value }) => ({ model: { ...model, tab: value, ...(value !== 'reception' ? {pageLocator:''} : {}) } }),
  Retry: ({ key }) => {
    if (key === 'token' && model.selectedToken) return select(model, model.selectedToken)
    if (key === 'notes') return load(model, [{ key, path: `/api/notes?anchor=${query(model.noteAnchorId)}&q=${query(model.noteQuery)}` }])
    if (key === 'page' && model.pageLocator) return load(model,[{key,path:`/api/source-page?locator=${query(model.pageLocator)}`}])
    if (key === 'tokenNotes') return load(model,[{key,path:`/api/notes?anchor=${query(model.selectedToken)}`}])
    if (['lexicon','concordance','distribution'].includes(key)) return lexicalRequests(model,model.concordanceOffset)
    if (key === 'sources') return coreUpdate(model,Message.SearchSources())
    if (key === 'session') return load(model,[{key,path:'/auth/session'}])
    if (key === 'coverage') return load(model, [{ key, path: '/api/coverage' }])
    return load(model, passageRequests(model.ref).filter(r => r.key === key))
  },
  Loaded: ({ key, requestId, payload, error }) => {
    if (model.resources[key]?.requestId !== requestId) return { model }
    const next: Model = { ...model, resources: { ...model.resources, [key]: { status: error ? 'error' : 'ready', requestId, payload, error } } }
    if (error) return { model: key === 'save' ? { ...next, notice: `Note was not saved. ${error}` } : key === 'openNote' ? { ...next, notice: `Could not open the linked note. ${error}` } : next }
    if (key === 'passage') {
      const passage = (payload as Envelope<Passage>).data
      const token = passage?.editions?.flatMap(e => e.tokens ?? []).find(t => t.text.normalize('NFD').replace(/\p{M}/gu, '').replace(/[.,·;]/g, '') === 'αυτους')
      const requested = next.pendingToken
      if ((requested || token) && !next.selectedToken) {
        const selected = select(next, requested || token!.id)
        return { ...selected, model: { ...selected.model, tab: next.tab, pageLocator: next.pageLocator, lookupLemma: next.lookupLemma, concordanceOffset: next.concordanceOffset } }
      }
    }
    if ((key === 'page' || key === 'citations') && !envelope(next,'sourceLibrary')) {
      const page = envelope<{sourceId:string}>(next,'page')?.data
      const citation = envelope<{sourceId:string;title:string}[]>(next,'citations')?.data?.find(c=>c.sourceId === page?.sourceId)
      if (citation) return load(next,[{key:'sourceLibrary',path:`/api/sources/search?q=${query(citation.title)}`}])
    }
    if (key === 'logout') return load({ ...next, notice: 'Signed out.' }, [{ key: 'session', path: '/auth/session' }])
    if (key === 'openNote') {
      const note = (payload as Envelope<Note | null>).data
      if (!note) return { model: { ...next, notice: 'The linked note is not available.' } }
      const edited = coreUpdate(next,Message.EditNote({note})).model
      if (next.dirty) return {model:edited}
      if (note.anchor.type === 'source-page') return load({...edited,tab:'reception',pageLocator:note.anchor.id},[{key:'page',path:`/api/source-page?locator=${query(note.anchor.id)}`}])
      const anchorRef = normalizeReference(note.anchor.id) ?? normalizeReference(note.anchor.id.match(/(?:^|:)([1-3]?[A-Za-z]+\.\d+\.\d+)/)?.[1] ?? '')
      if (anchorRef && anchorRef !== next.ref) return load({...edited,ref:anchorRef,referenceInput:anchorRef,selectedToken:'',pendingToken:note.anchor.type === 'token' ? note.anchor.id : ''},passageRequests(anchorRef))
      if (note.anchor.type === 'token' && edited.selectedToken !== note.anchor.id) return select(edited,note.anchor.id)
      return {model:edited}
    }
    if (key === 'token') {
      const token = (payload as Envelope<TokenDetail>).data
      if (token?.lemma || next.lookupLemma) return lexicalRequests(next, next.concordanceOffset)
    }
    if (key === 'save') {
      const unchanged = next.editorVersion === next.saveVersion
      return load({ ...next, editingId: ((payload as Envelope<Note>).data)?.id ?? next.editingId, ...(unchanged ? { dirty: false } : {}), notice: unchanged ? 'Note saved to the server.' : 'Earlier version saved. Your newer edits remain unsaved.' }, [{ key: 'notes', path: `/api/notes?anchor=${query(next.noteAnchorId)}&q=${query(next.noteQuery)}` }, ...(next.selectedToken ? [{ key: 'tokenNotes', path: `/api/notes?anchor=${query(next.selectedToken)}` }] : [])])
    }
    return { model: next }
  },
  EditorChanged: ({ field, value }) => {
    if (!['body', 'tags', 'provenanceTag', 'sourceLocator', 'source', 'sourceEdition', 'sourceVersion', 'sourceLicense', 'sourceReview', 'sourceLink', 'noteAnchorType', 'noteAnchorId'].includes(field)) return { model }
    return { model: { ...model, [field]: value, dirty: true, editorVersion: model.editorVersion + 1, notice: '' } }
  },
  Save: () => {
    const error = noteValidation(model)
    if (error) return { model: { ...model, notice: error } }
    if (model.resources.save?.status === 'loading') return { model }
    return load({ ...model, saveVersion: model.editorVersion, notice: '' }, [{ key: 'save', path: `/api/notes${model.editingId ? `/${query(model.editingId)}` : ''}`, method: model.editingId ? 'PUT' : 'POST', body: {
      anchor: { type: model.noteAnchorType, id: model.noteAnchorId }, body: model.body, tags: model.tags.split(',').map(t => t.trim()).filter(Boolean),
      provenanceTag: model.provenanceTag as NoteTag, ...(['quoted', 'paraphrased'].includes(model.provenanceTag) ? { sourceLocator: { source: model.source.trim(), edition: model.sourceEdition.trim(), version: model.sourceVersion.trim(), license: model.sourceLicense.trim(), locator: model.sourceLocator.trim(), reviewStatus: model.sourceReview.trim(), ...(model.sourceLink.trim() ? { deepLink: model.sourceLink.trim() } : {}) } } : {}),
    } }])
  },
  EditNote: ({ note }) => {
    if (model.dirty || model.resources.save?.status === 'loading') return { model: { ...model, notice: 'Save the current draft or discard it before opening another note.' } }
    const n = note as Note
    return { model: { ...model, editingId: n.id, body: n.body, tags: n.tags.join(', '), provenanceTag: n.provenanceTag, sourceLocator: n.sourceLocator?.locator ?? '', source: n.sourceLocator?.source ?? '', sourceEdition: n.sourceLocator?.edition ?? '', sourceVersion: n.sourceLocator?.version ?? '', sourceLicense: n.sourceLocator?.license ?? '', sourceReview: n.sourceLocator?.reviewStatus ?? '', sourceLink: n.sourceLocator?.deepLink ?? '', noteAnchorType: n.anchor.type, noteAnchorId: n.anchor.id, notice: '', editorVersion: model.editorVersion + 1 } }
  },
  NewNote: () => model.dirty || model.resources.save?.status === 'loading' ? { model: { ...model, notice: 'Save the current draft or discard it before starting another note.' } } : { model: { ...model, editingId: '', body: '', tags: '', sourceLocator: '', source: '', sourceEdition: '', sourceVersion: '', sourceLicense: '', sourceReview: '', sourceLink: '', provenanceTag: 'my-inference', noteAnchorType: model.selectedToken ? 'token' : 'verse-range', noteAnchorId: model.selectedToken || model.ref, editorVersion: model.editorVersion + 1, notice: '' } },
  NotesQueryChanged: ({ value }) => ({ model: { ...model, noteQuery: value } }),
  SearchNotes: () => load(model, [{ key: 'notes', path: `/api/notes?q=${query(model.noteQuery)}` }]),
  SourceQueryChanged: ({ value }) => ({ model: { ...model, sourceQuery: value } }),
  SearchSources: () => load({...model,sourceId:''}, [{ key: 'sources', path: `/api/sources/search?q=${query(model.sourceQuery)}` }]),
  OpenPage: ({ locator }) => load({ ...model, tab: 'reception', pageLocator: locator }, [{ key: 'page', path: `/api/source-page?locator=${query(locator)}` }]),
})

function lexicalRequests(model: Model, offset: number): Result {
  const lemma = model.lookupLemma || envelope<TokenDetail>(model, 'token')?.data?.lemma
  if (!lemma) return { model }
  const params = new URLSearchParams({ lemma })
  if (model.lookupLemma) params.set('lemma', model.lookupLemma)
  if (model.filterBook) params.set('book', model.filterBook)
  if (model.filterForm) params.set('form', model.filterForm)
  if (model.filterEdition) params.set('edition', model.filterEdition)
  return load({ ...model, concordanceOffset: offset }, [
    { key: 'lexicon', path: `/api/lexicon?lemma=${query(lemma)}` },
    { key: 'concordance', path: `/api/concordance?${params}&limit=100&offset=${offset}` },
    { key: 'distribution', path: `/api/distribution?${params}` },
  ])
}
export function studyUrl(model: Model): string {
  const params = new URLSearchParams()
  if (model.selectedToken || model.pendingToken) params.set('token', model.selectedToken || model.pendingToken)
  if (model.tab !== 'word') params.set('tab', model.tab)
  if (model.concordanceOffset) params.set('offset',String(model.concordanceOffset))
  if (model.lookupLemma) params.set('lemma',model.lookupLemma)
  if (model.filterBook) params.set('book', model.filterBook)
  if (model.filterForm) params.set('form', model.filterForm)
  if (model.filterEdition) params.set('edition', model.filterEdition)
  if (model.pageLocator) return `/source-page?${new URLSearchParams({ref:model.ref, locator:model.pageLocator})}`
  return `/study/${encodeURIComponent(model.ref)}${params.size ? `?${params}` : ''}`
}
export function update(model: Model, message: Message): Result {
  const result = coreUpdate(model, message)
  const routing = !result.model.navigationError && ['Navigate','SelectToken','TabChanged','OpenPage','SearchConcordance','LookupLemma','ConcordancePage'].includes(message._tag)
  const protectionChanged = model.dirty !== result.model.dirty
  if (routing || protectionChanged) return { ...result, commands: [...(result.commands ?? []), Browser({ href: routing ? studyUrl(result.model) : '', external: false, dirty: result.model.dirty })] }
  return result
}
