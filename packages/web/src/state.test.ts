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
  it('normalizes verses, chapters and ranges without narrowing them', () => {
    expect(normalizeReference('Matthew 28:19')).toBe('Matt.28.19')
    expect(normalizeReference('Jn 3:16')).toBe('John.3.16')
    expect(normalizeReference('Rom 8:28ff')).toBe('Rom.8.28ff')
    expect(normalizeReference('Gen 1-3')).toBe('Gen.1-3')
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
    expect(result.commands?.map(c => c.args?.key)).toEqual(['passage','syntax','citations','translations','confessions','crossreferences','notes','coverage','session'])
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

describe('M1 complete workflow transitions (synthetic protocol cases)', () => {
  afterEach(() => vi.unstubAllGlobals())
  it('loads token notes in the same selection as word evidence', () => {
    const result = update(initialModel, Message.SelectToken({id:'sblgnt:Matt.28.19:8'}))
    expect(result.commands?.map(c=>c.args?.path).filter(Boolean)).toContain('/api/notes?anchor=sblgnt%3AMatt.28.19%3A8')
  })
  it('restores explicit token, view and filters before startup response arrives', () => {
    const result = initFromUrl('https://desk.test/study/John.3.16?token=real-token&tab=lexicon&book=John&form=test&edition=sblgnt')
    const passage = {ref:'John.3.16',editions:[{tokens:[{id:'autous',text:'αὐτούς'}]}]}
    const loaded = update(result.model,Message.Loaded({key:'passage',requestId:result.model.serial,payload:envelope(passage),error:''}))
    expect(loaded.model.selectedToken).toBe('real-token')
    expect(loaded.model.tab).toBe('lexicon')
    expect(loaded.model.filterBook).toBe('John')
  })
  it('restores browser history with increasing request IDs while preserving a draft', () => {
    const started = initFromUrl('https://desk.test/study/Matt.28.19').model
    const draft = changed('body','Keep this argument',started)
    const result = update(draft,Message.RouteChanged({href:'https://desk.test/study/John.3.16?tab=syntax'}))
    expect(result.model.ref).toBe('John.3.16')
    expect(result.model.tab).toBe('syntax')
    expect(result.model.body).toBe('Keep this argument')
    expect(result.model.noteAnchorId).toBe('Matt.28.19')
    expect(result.model.serial).toBeGreaterThan(started.serial)
    expect(update(result.model,Message.Loaded({key:'passage',requestId:started.serial,payload:envelope({editions:[]}),error:''})).model).toBe(result.model)
  })
  it('keeps an in-flight save tracked across browser history changes', () => {
    const saving = update(changed('body','Earlier draft'),Message.Save()).model
    const result = update(saving,Message.RouteChanged({href:'https://desk.test/study/John.3.16'})).model
    expect(result.resources.save).toEqual(saving.resources.save)
    const saved = update(result,Message.Loaded({key:'save',requestId:saving.serial,payload:envelope(note),error:''})).model
    expect(saved.editingId).toBe(note.id)
    expect(saved.dirty).toBe(false)
  })
  it('intersects concordance filters and requests distribution before pagination', () => {
    const selected = ready('token',{id:'a',text:'a',lemma:'αὐτός'}).model
    const filtered = {...selected,filterBook:'John',filterForm:'αὐτούς',filterEdition:'sblgnt'}
    const result = update(filtered,Message.ConcordancePage({offset:100}))
    const paths = result.commands!.map(c=>String(c.args?.path))
    expect(paths.find(p=>p.startsWith('/api/concordance'))).toMatch(/book=John.*edition=sblgnt&limit=100&offset=100/)
    const distribution = paths.find(p=>p.startsWith('/api/distribution'))!
    expect(distribution).toContain('book=John')
    expect(distribution).not.toMatch(/offset|limit/)
  })
  it('requires an explicit confirmation to discard a draft', () => {
    const draft = changed('body','Do not lose this')
    const pending = update(draft,Message.Discard()).model
    expect(pending.body).toBe(draft.body)
    expect(pending.discardPending).toBe(true)
    expect(update(pending,Message.CancelDiscard()).model.body).toBe(draft.body)
    const discarded = update(pending,Message.ConfirmDiscard()).model
    expect(discarded.body).toBe('')
    expect(discarded.dirty).toBe(false)
  })
  it('protects drafts from anchor changes and logout', () => {
    const draft = changed('body','Argument')
    expect(update(draft,Message.AnchorSelected({type:'source-page',id:'page-real'})).model.noteAnchorId).toBe('Matt.28.19')
    expect(update(draft,Message.Logout()).commands).toBeUndefined()
  })
  it('anchors a user-selected phrase using its real stable token endpoints', () => {
    const start = update(initialModel,Message.PhraseStart({id:'sblgnt:John.3.16:1'})).model
    const end = update(start,Message.PhraseEnd({id:'sblgnt:John.3.16:3'})).model
    expect(end.noteAnchorType).toBe('phrase')
    expect(end.noteAnchorId).toBe('token-range:sblgnt:John.3.16:1..sblgnt:John.3.16:3')
  })
  it('copies exact page provenance into a page-anchored note without inserting a quotation', () => {
    const sourceLocator = {source:'Synthetic source',edition:'Test edition',version:'test-revision',license:'Test license',reviewStatus:'AI-assisted, unreviewed',locator:'page-real'}
    const page = ready('page',{id:'page-real',provenance:sourceLocator}).model
    const anchor = update(page,Message.AnchorSelected({type:'source-page',id:'page-real'})).model
    expect(anchor.body).toBe('')
    expect(anchor.sourceVersion).toBe('test-revision')
    expect(anchor.sourceReview).toBe('AI-assisted, unreviewed')
    expect(anchor.noteAnchorId).toBe('page-real')
  })
  it('updates the browser URL and installs unload protection through real Foldkit commands', async () => {
    const pushState = vi.fn()
    const browser = {onbeforeunload:null,location:{pathname:'/',search:'',assign:vi.fn()},history:{pushState}}
    vi.stubGlobal('window',browser)
    const navigate = update({...initialModel,referenceInput:'2 Timothy 3:16'},Message.Navigate())
    await Effect.runPromise(navigate.commands!.at(-1)!.effect)
    expect(pushState).toHaveBeenCalledWith(null,'','/study/2Tim.3.16')
    const draft = update(initialModel,Message.EditorChanged({field:'body',value:'Argument'}))
    await Effect.runPromise(draft.commands!.at(-1)!.effect)
    expect(browser.onbeforeunload).toBeTypeOf('function')
  })
  it('refuses invalid or reversed references and normalizes every NT book name', () => {
    expect(normalizeReference('2 Timothy 3:16-17')).toBe('2Tim.3.16-17')
    expect(normalizeReference('1 Corinthians 13')).toBe('1Cor.13')
    expect(normalizeReference('Matthew 28:19-18')).toBeUndefined()
    expect(normalizeReference('Madeup 2:3')).toBeUndefined()
    expect(safeLink('/\\evil.example')).toBeUndefined()
  })
})

it('reloads the current clean editor from the server but preserves newer unsaved edits',()=>{
  const clean = update(initialModel,Message.EditNote({note})).model
  const reload = update(clean,Message.ReloadNotes())
  expect(reload.commands?.some(c=>c.args?.path==='/api/notes/note-1')).toBe(true)
  const draft = changed('body','Local changes',clean)
  expect(update(draft,Message.ReloadNotes()).commands?.some(c=>c.args?.path==='/api/notes/note-1')).toBe(false)
})
it('keeps a separate lemma lookup in its shareable URL and restores concordance pagination',()=>{
  const start = initFromUrl('https://desk.test/study/Matt.28.19?token=real-id&tab=lexicon&lemma=G846&offset=100')
  const passage = update(start.model,Message.Loaded({key:'passage',requestId:start.model.serial,payload:envelope({editions:[{tokens:[]}]}),error:''})).model
  expect(passage.lookupLemma).toBe('G846')
  expect(passage.concordanceOffset).toBe(100)
  const token = update(passage,Message.Loaded({key:'token',requestId:passage.serial,payload:envelope({id:'real-id',lemma:'source lemma'}),error:''}))
  expect(token.commands?.some(c=>String(c.args?.path).includes('offset=100'))).toBe(true)
})
it('opens a linked note on its own token rather than the default autous selection',()=>{
  const note = {id:'another-token-note',body:'Synthetic protocol note',tags:[],provenanceTag:'my-inference',anchor:{type:'token',id:'sblgnt:Matt.28.19:6'},createdAt:'now',updatedAt:'now'}
  const result = ready('openNote',note,{...initialModel,selectedToken:'sblgnt:Matt.28.19:8'})
  expect(result.model.selectedToken).toBe(note.anchor.id)
  expect(result.model.noteAnchorId).toBe(note.anchor.id)
  expect(result.commands?.[0].args?.path).toBe('/api/token?id=sblgnt%3AMatt.28.19%3A6')
})

describe('research editing safeguards',()=>{
 it('preserves extra positions and historical witnesses while editing the first comparison',()=>{
  const d={id:'d',revision:3,question:'Question',positions:[{id:'a',title:'A',premises:['n1']},{id:'b',title:'B',premises:['n2']},{id:'c',title:'C',premises:['n3']}],divergences:[{leftNote:'n1',rightNote:'n2',explanation:'Old'},{leftNote:'n1',rightNote:'n3',explanation:'Other'}],timeline:[{date:'1647',positionId:'a',noteId:'n1',description:'Old witness'},{date:'1700',positionId:'c',noteId:'n3',description:'Keep'}]};
  let m=update(initialModel,Message.ResearchEditDispute({dispute:d})).model;
  m=update(m,Message.ResearchField({field:'explanation',value:'Revised'})).model;
  m=update(m,Message.ResearchField({field:'historyDescription',value:'Revised witness'})).model;
  const args=update(m,Message.ResearchSaveDispute()).commands![0].args as any;
  expect(args.body.dispute.positions).toEqual(d.positions);
  expect(args.body.dispute.divergences[0].explanation).toBe('Revised');
  expect(args.body.dispute.timeline[0].description).toBe('Revised witness');
  expect(args.body.dispute.timeline[1]).toEqual(d.timeline[1]);
 });
 it('keeps other drafts and edits made during a save dirty',()=>{
  let m=update(initialModel,Message.ResearchField({field:'question',value:'Unsaved question'})).model;
  m=update(m,Message.ResearchField({field:'from',value:'n1'})).model;
  m=update(m,Message.ResearchSaveLink()).model;
  m=update(m,Message.Loaded({key:'linkSave',requestId:m.serial,payload:envelope({id:'link'}),error:''})).model;
  expect(m.researchDirty).toBe(true);expect(m.disputeDirty).toBe(true);expect(m.linkDirty).toBe(false);
  m=update(m,Message.ResearchSaveDispute()).model;
  m=update(m,Message.ResearchField({field:'question',value:'Newer question'})).model;
  m=update(m,Message.Loaded({key:'disputeSave',requestId:m.serial,payload:envelope({id:'d',revision:1}),error:''})).model;
  expect(m.researchDirty).toBe(true);expect(m.researchFields.question).toBe('Newer question');expect(m.researchFields.revision).toBe('1');
  expect(update(initialModel,Message.ResearchField({field:'confession',value:'WLC.1'})).model.researchDirty).toBe(false);
 });
 it('allows native Psalm headings but never chapter zero',()=>{
  expect(normalizeReference('Ps 3:0')).toBe('Ps.3.0');expect(normalizeReference('Ps 0:1')).toBeUndefined();
 });
});

it('derives rendering lookup from the active lexicon, not an unrelated selected token',()=>{
 const m={...initialModel,lookupLemma:'ψαλμός',selectedToken:'sblgnt:Matt.28.19:8'};
 const result=ready('lexicon',[{sourceId:'abbott-smith',strong:'5568'}],m);
 expect(result.commands?.[0]?.args?.path).toBe('/api/renderings?strong=G5568');
 const url=initFromUrl('https://workbench.test/lexicon?lemma=ψαλμός&edition=lxx');
 expect(url.commands?.find(c=>c.args?.key==='concordance')?.args?.path).toContain('edition=lxx');
});
