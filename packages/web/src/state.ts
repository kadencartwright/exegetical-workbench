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
  notice: Schema.String,
})
export type Model = typeof Model.Type
export const Message = defineMessageUnion({
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
  { key: 'notes', path: `/api/notes?anchor=${query(ref)}` },
] }
export const initialModel: Model = {
  ref: 'Matt.28.19', referenceInput: 'Matt.28.19', navigationError: '', serial: 0, selectedToken: '', tab: 'word', resources: {},
  body: '', tags: '', provenanceTag: 'my-inference', sourceLocator: '', source: '', sourceEdition: '', sourceVersion: '', sourceLicense: '', sourceReview: '', sourceLink: '', editingId: '', dirty: false, editorVersion: 0, saveVersion: 0,
  noteAnchorType: 'verse-range', noteAnchorId: 'Matt.28.19', noteQuery: '', sourceQuery: '', notice: '',
}
export const init: Runtime.ApplicationInit<Model, Message> = () => load(initialModel, [...passageRequests(initialModel.ref), { key: 'coverage', path: '/api/coverage' }])
/** Initial app deep links; normal navigation still uses explicit server requests. */
const decodePath = (path: string): string => { try { return decodeURIComponent(path) } catch { return path } }
export function initFromUrl(href: string): Result {
  const url = new URL(href)
  const pathRef = url.pathname.startsWith('/study/') ? decodePath(url.pathname.slice(7)) : undefined
  const ref = normalizeReference(url.searchParams.get('ref') ?? pathRef ?? initialModel.ref) ?? initialModel.ref
  const model = { ...initialModel, ref, referenceInput: ref, noteAnchorId: ref }
  const requests = [...passageRequests(ref), { key: 'coverage', path: '/api/coverage' }]
  if (url.pathname === '/source-page' && url.searchParams.get('locator')) {
    requests.push({ key: 'page', path: `/api/source-page?locator=${query(url.searchParams.get('locator')!)}` })
    model.tab = 'reception'
  }
  if (url.pathname.startsWith('/notes/') && url.pathname.slice(7)) requests.push({ key: 'openNote', path: `/api/notes/${query(decodePath(url.pathname.slice(7)))}` })
  return load(model, requests)
}
function select(model: Model, id: string): Result {
  return load({ ...model, selectedToken: id, tab: 'word', resources: Object.fromEntries(Object.entries(model.resources).filter(([key]) => !['lexicon', 'concordance'].includes(key))),
    ...(!model.dirty && !model.editingId ? { noteAnchorType: 'token', noteAnchorId: id } : {}),
  }, [{ key: 'token', path: `/api/token?id=${query(id)}` }])
}
export function noteValidation(model: Model): string | undefined {
  if (!model.noteAnchorId.trim()) return 'An anchor is required.'
  if (!['token', 'phrase', 'clause', 'verse-range', 'source-page'].includes(model.noteAnchorType)) return 'Select a supported anchor type.'
  if (!model.body.trim()) return 'Write a note before saving.'
  if (['quoted', 'paraphrased'].includes(model.provenanceTag) && [model.sourceLocator, model.source, model.sourceEdition, model.sourceVersion, model.sourceLicense, model.sourceReview].some(value => !value.trim())) return 'Quoted and paraphrased notes require a source, edition, version, license, exact locator, and review status.'
  if (model.provenanceTag === 'agent-generated') return 'M1 supports user-authored notes. External-agent writes are not enabled.'
  return undefined
}
export const update = (model: Model, message: Message): Result => Message.match<Result>(message, {
  ReferenceChanged: ({ value }) => ({ model: { ...model, referenceInput: value } }),
  Navigate: () => {
    if (model.resources.save?.status === 'loading') return { model: { ...model, navigationError: 'Wait for the note save to finish before opening another passage.' } }
    const ref = normalizeReference(model.referenceInput)
    if (!ref) return { model: { ...model, navigationError: 'Enter one verse, for example Matthew 28:19 or John.3.16. Ranges and “ff” are not yet supported.' } }
    return load({ ...model, ref, referenceInput: ref, selectedToken: '', resources: {}, navigationError: '',
      ...(!model.dirty && !model.editingId ? { noteAnchorType: 'verse-range', noteAnchorId: ref } : {}),
    }, [...passageRequests(ref), { key: 'coverage', path: '/api/coverage' }])
  },
  SelectToken: ({ id }) => select(model, id),
  TabChanged: ({ value }) => ({ model: { ...model, tab: value } }),
  Retry: ({ key }) => {
    if (key === 'token' && model.selectedToken) return select(model, model.selectedToken)
    if (key === 'notes') return load(model, [{ key, path: `/api/notes?anchor=${query(model.noteAnchorId)}&q=${query(model.noteQuery)}` }])
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
      if (token && !next.selectedToken) {
        const selected = select(next, token.id)
        return { ...selected, model: { ...selected.model, tab: next.tab } }
      }
    }
    if (key === 'openNote') {
      const note = (payload as Envelope<Note | null>).data
      return note ? update(next, Message.EditNote({ note })) : { model: { ...next, notice: 'The linked note is not available.' } }
    }
    if (key === 'token') {
      const token = (payload as Envelope<TokenDetail>).data
      if (token?.lemma) return load(next, [{ key: 'lexicon', path: `/api/lexicon?lemma=${query(token.lemma)}` }, { key: 'concordance', path: `/api/concordance?lemma=${query(token.lemma)}` }])
    }
    if (key === 'save') {
      const unchanged = next.editorVersion === next.saveVersion
      return load({ ...next, editingId: ((payload as Envelope<Note>).data)?.id ?? next.editingId, ...(unchanged ? { dirty: false } : {}), notice: unchanged ? 'Note saved to the server.' : 'Earlier version saved. Your newer edits remain unsaved.' }, [{ key: 'notes', path: `/api/notes?anchor=${query(next.noteAnchorId)}&q=${query(next.noteQuery)}` }])
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
    if (model.dirty || model.resources.save?.status === 'loading') return { model: { ...model, notice: 'Save the current draft before opening another note.' } }
    const n = note as Note
    return { model: { ...model, editingId: n.id, body: n.body, tags: n.tags.join(', '), provenanceTag: n.provenanceTag, sourceLocator: n.sourceLocator?.locator ?? '', source: n.sourceLocator?.source ?? '', sourceEdition: n.sourceLocator?.edition ?? '', sourceVersion: n.sourceLocator?.version ?? '', sourceLicense: n.sourceLocator?.license ?? '', sourceReview: n.sourceLocator?.reviewStatus ?? '', sourceLink: n.sourceLocator?.deepLink ?? '', noteAnchorType: n.anchor.type, noteAnchorId: n.anchor.id, notice: '', editorVersion: model.editorVersion + 1 } }
  },
  NewNote: () => model.dirty || model.resources.save?.status === 'loading' ? { model: { ...model, notice: 'Save the current draft before starting another note.' } } : { model: { ...model, editingId: '', body: '', tags: '', sourceLocator: '', source: '', sourceEdition: '', sourceVersion: '', sourceLicense: '', sourceReview: '', sourceLink: '', provenanceTag: 'my-inference', noteAnchorType: model.selectedToken ? 'token' : 'verse-range', noteAnchorId: model.selectedToken || model.ref, editorVersion: model.editorVersion + 1, notice: '' } },
  NotesQueryChanged: ({ value }) => ({ model: { ...model, noteQuery: value } }),
  SearchNotes: () => load(model, [{ key: 'notes', path: `/api/notes?q=${query(model.noteQuery)}` }]),
  SourceQueryChanged: ({ value }) => ({ model: { ...model, sourceQuery: value } }),
  SearchSources: () => load(model, [{ key: 'sources', path: `/api/sources/search?q=${query(model.sourceQuery)}` }]),
  OpenPage: ({ locator }) => load({ ...model, tab: 'reception' }, [{ key: 'page', path: `/api/source-page?locator=${query(locator)}` }]),
})
