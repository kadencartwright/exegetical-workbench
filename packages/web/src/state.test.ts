import { describe, expect, it, vi, afterEach } from 'vitest'
import { Effect, Schema } from 'effect'
import { noteInputSchema } from '@exegetical/shared'
import { initialModel, init, initFromUrl, load, Message, Model, noteValidation, update } from './state'
import { normalizeReference, request, safeLink } from './api'

const envelope = (data: unknown) => ({ data, coverage: [], provenance: [] })
const changed = (field: string, value: string, model = initialModel) => update(model, Message.EditorChanged({ field, value })).model
const ready = (key: string, data: unknown, model = initialModel) => {
  const next = load(model, [{ key, path: '/api/test' }]).model
  return update(next, Message.Loaded({ key, requestId: next.serial, payload: envelope(data), error: '' }))
}
const note = { id: 'note-1', body: 'Argument', tags: ['syntax'], provenanceTag: 'my-inference', anchor: { type: 'token', id: 'token-a' }, createdAt: 'now', updatedAt: 'now' }

describe('reference navigation and selection', () => {
  it('normalizes common references and refuses to narrow ranges', () => {
    expect(normalizeReference('Matthew 28:19')).toBe('Matt.28.19')
    expect(normalizeReference('Jn 3:16')).toBe('John.3.16')
    expect(normalizeReference('Rom 8:28ff')).toBeUndefined()
    expect(normalizeReference('Gen 1-3')).toBeUndefined()
    expect(normalizeReference('Matt.0.19')).toBeUndefined()
  })
  it('opens source-page and passage deep links using actual API requests', () => {
    const source = initFromUrl('https://workbench.test/source-page?locator=printed%3A12')
    expect(source.model.tab).toBe('reception')
    expect(source.commands?.at(-1)?.args?.path).toBe('/api/source-page?locator=printed%3A12')
    expect(initFromUrl('https://workbench.test/study/John.3.16').model.ref).toBe('John.3.16')
  })
  it('starts on Matthew with real server requests and a schema-valid model', () => {
    const result = init()
    expect(result.model.ref).toBe('Matt.28.19')
    expect(result.commands).toHaveLength(5)
    expect(Schema.decodeUnknownSync(Model)(result.model)).toEqual(result.model)
  })
  it('selects the actual supplied αὐτούς token, without assuming a corpus ID', () => {
    const result = ready('passage', { ref: 'Matt.28.19', editions: [{ id: 'sbl', tokens: [{ id: 'upstream-id', text: 'αὐτούς' }] }] })
    expect(result.model.selectedToken).toBe('upstream-id')
    expect(result.model.noteAnchorId).toBe('upstream-id')
    expect(result.commands?.[0].args).toMatchObject({ path: '/api/token?id=upstream-id' })
    expect(Schema.decodeUnknownSync(Model)(result.model)).toEqual(result.model)
  })
  it('does not fabricate tokens for unloaded passages', () => {
    expect(ready('passage', { ref: 'Matt.28.19', editions: [] }).model.selectedToken).toBe('')
  })
  it('ignores stale responses after navigating to another passage', () => {
    const first = load(initialModel, [{ key: 'passage', path: '/api/passage' }]).model
    const typing = update(first, Message.ReferenceChanged({ value: 'John 3:16' })).model
    const second = update(typing, Message.Navigate()).model
    const result = update(second, Message.Loaded({ key: 'passage', requestId: first.serial, payload: envelope({ editions: [] }), error: '' }))
    expect(result.model).toBe(second)
    expect(second.ref).toBe('John.3.16')
  })
  it('encodes the selected lemma for lexical API requests', () => {
    const result = ready('token', { id: 'a', text: 'αὐτούς', lemma: 'αὐτός & test' })
    expect(result.commands?.[0].args?.path).toBe('/api/lexicon?lemma=%CE%B1%E1%BD%90%CF%84%CF%8C%CF%82%20%26%20test')
  })
})
describe('anchored notes', () => {
  it('preserves unsaved body and anchor while navigating or selecting words', () => {
    const draft = changed('body', 'My unfinished argument')
    const next = update(draft, Message.SelectToken({ id: 'another-word' })).model
    expect(next.body).toBe(draft.body)
    expect(next.noteAnchorId).toBe('Matt.28.19')
    const nav = update({ ...next, referenceInput: 'John 3:16' }, Message.Navigate()).model
    expect(nav.body).toBe(draft.body)
    expect(nav.noteAnchorId).toBe('Matt.28.19')
  })
  it('rejects empty notes and incomplete source citations', () => {
    expect(noteValidation(initialModel)).toMatch(/Write a note/)
    const quote = changed('provenanceTag', 'quoted', changed('body', 'A source quotation'))
    expect(noteValidation(changed('sourceLocator', 'printed-p12', quote))).toMatch(/edition/)
    expect(update(quote, Message.Save()).commands).toBeUndefined()
  })
  it('sends all source metadata and a valid anchor in a quoted note request', () => {
    const quote = { ...initialModel, body: 'A quotation', provenanceTag: 'quoted', source: 'source-a', sourceEdition: 'first', sourceVersion: 'abc', sourceLicense: 'CC0', sourceReview: 'unreviewed', sourceLocator: 'page-12' }
    const result = update(quote, Message.Save())
    expect(result.commands?.[0].args?.body).toMatchObject({ anchor: { type: 'verse-range', id: 'Matt.28.19' }, sourceLocator: { source: 'source-a', edition: 'first', version: 'abc', license: 'CC0', locator: 'page-12', reviewStatus: 'unreviewed' } })
    expect(result.commands?.[0].args?.method).toBe('POST')
    expect(noteInputSchema.safeParse(result.commands?.[0].args?.body).success).toBe(true)
  })
  it('updates an existing note with PUT and retains its anchor', () => {
    const edit = update(initialModel, Message.EditNote({ note })).model
    const save = update(changed('body', 'Revised argument', edit), Message.Save())
    expect(save.commands?.[0].args).toMatchObject({ method: 'PUT', path: '/api/notes/note-1', body: { anchor: note.anchor } })
  })
  it('does not overwrite unsaved work when another note is opened', () => {
    const draft = changed('body', 'Keep this')
    const result = update(draft, Message.EditNote({ note }))
    expect(result.model.body).toBe('Keep this')
    expect(result.model.notice).toMatch(/Save the current draft/)
  })
  it('keeps newer edits dirty when an earlier save completes and reuses the created id', () => {
    const saving = update(changed('body', 'Original'), Message.Save()).model
    const newer = changed('body', 'More recent edit', saving)
    const saved = update(newer, Message.Loaded({ key: 'save', requestId: saving.serial, payload: envelope(note), error: '' })).model
    expect(saved.body).toBe('More recent edit')
    expect(saved.dirty).toBe(true)
    expect(saved.editingId).toBe('note-1')
    expect(update(saved, Message.Save()).commands?.[0].args?.method).toBe('PUT')
  })
  it('keeps draft text on save failure', () => {
    const saving = update(changed('body', 'Keep me'), Message.Save()).model
    const failed = update(saving, Message.Loaded({ key: 'save', requestId: saving.serial, payload: null, error: 'Storage unavailable' })).model
    expect(failed.body).toBe('Keep me')
    expect(failed.dirty).toBe(true)
    expect(failed.notice).toMatch(/not saved/)
  })
})
describe('HTTP and provenance boundaries', () => {
  afterEach(() => vi.unstubAllGlobals())
  it('rejects unsafe source links', () => {
    expect(safeLink('javascript:alert(1)')).toBeUndefined()
    expect(safeLink('//evil.test')).toBeUndefined()
    expect(safeLink('/?ref=Matt.28.19')).toBe('/?ref=Matt.28.19')
    expect(safeLink('https://example.org/page#p12')).toBe('https://example.org/page#p12')
  })
  it('requires the coverage and provenance envelope', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({ data: [] }))))
    await expect(request('/api/coverage')).rejects.toThrow(/incompatible/)
  })
  it('uses same-origin credentials and reports auth failures honestly', async () => {
    const fetcher = vi.fn().mockResolvedValue(new Response('', { status: 401 }))
    vi.stubGlobal('fetch', fetcher)
    await expect(request('/api/notes')).rejects.toThrow(/authenticated/)
    expect(fetcher.mock.calls[0][1].credentials).toBe('same-origin')
  })
  it('executes a Foldkit command and turns network failure into a message', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('Disconnected')))
    const result = load(initialModel, [{ key: 'coverage', path: '/api/coverage' }])
    const message = await Effect.runPromise(result.commands![0].effect)
    expect(message).toMatchObject({ _tag: 'Loaded', key: 'coverage', error: 'Disconnected' })
  })
})
