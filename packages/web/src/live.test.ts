import { describe, it, expect } from 'vitest'
import type { Envelope } from './api'
// Opt-in acceptance against the actual Worker + full imported D1 corpus; no mocked corpus.
const base = process.env.WORKBENCH_INTEGRATION_URL
const get = async (path: string) => {
  const response = await fetch(new URL(path, base))
  expect(response.status, path).toBe(200)
  const result = await response.json() as Envelope<any>
  expect(result).toHaveProperty('coverage')
  expect(result).toHaveProperty('provenance')
  return result
}
describe.runIf(Boolean(base))('live web API acceptance against full corpus',()=>{
  it('reads both NT editions outside the acceptance sample',async()=>{
    for(const ref of ['John.3.16','Rom.8.28','Rev.22.21']){
      const result = await get(`/api/passage?ref=${ref}`)
      expect(result.data.editions.map((e:any)=>e.id)).toEqual(expect.arrayContaining(['sblgnt','bsb']))
      expect(result.provenance).not.toEqual([])
    }
  })
  it('supports chapter and range navigation with syntax',async()=>{
    const chapter = await get('/api/passage?ref=John.3')
    expect(chapter.data.passages.length).toBeGreaterThan(30)
    const range = await get('/api/passage?ref=John.3.16-18')
    expect(range.data.passages.map((p:any)=>p.ref)).toEqual(['John.3.16','John.3.17','John.3.18'])
    const syntax = await get('/api/syntax?ref=John.3.16')
    expect(syntax.data.trees.length).toBeGreaterThan(0)
  })
  it('supplies the complete autous chain and preserves the source lemma discrepancy',async()=>{
    const passage = await get('/api/passage?ref=Matt.28.19')
    const token = passage.data.editions.flatMap((e:any)=>e.tokens).find((t:any)=>t.text.normalize('NFD').replace(/\p{M}/gu,'').replace(/[.,·;]/g,'')==='αυτους')
    expect(token).toBeDefined()
    const detail = await get(`/api/token?id=${encodeURIComponent(token.id)}`)
    expect(detail.data.lemma).toBe('ἑαυτοῦ')
    expect(detail.data.agreement.some((a:any)=>/masculine/.test(a.observation)&&/neuter/.test(a.observation))).toBe(true)
    expect(detail.data.grammar.some((g:any)=>g.id==='robertson-matt-28-19'&&g.url.startsWith('https://')&&g.locator.includes('683'))).toBe(true)
    const citations = await get('/api/citations?ref=Matt.28.19')
    expect(citations.data.length).toBeGreaterThan(10)
    for(const citation of citations.data){expect(citation.locator).toBeTruthy();expect(citation.reviewStatus).toBe('AI-assisted, unreviewed')}
    const sourcePage = await get(`/api/source-page?locator=${encodeURIComponent(citations.data[0].locator)}`)
    expect(sourcePage.data.text.length).toBeGreaterThan(100)
  })
  it('supports independent lexicons and intersected concordance filters/distribution',async()=>{
    const entries = await get('/api/lexicon?lemma=G846')
    expect(new Set(entries.data.map((e:any)=>e.sourceId)).size).toBeGreaterThanOrEqual(2)
    const total = await get('/api/distribution?lemma=G846')
    expect(total.data.total).toBeGreaterThan(100)
    const matches = await get('/api/concordance?lemma=G846&book=John&edition=sblgnt&limit=10&offset=0')
    expect(matches.data.length).toBeGreaterThan(0)
    for(const row of matches.data){expect(row.ref.startsWith('John.')).toBe(true);expect(row.edition).toBe('sblgnt');expect(row.token.id).toBeTruthy()}
    const form = matches.data[0].token.text
    const filtered = await get(`/api/concordance?lemma=G846&book=John&edition=sblgnt&form=${encodeURIComponent(form)}`)
    expect(filtered.data.every((r:any)=>r.token.text.normalize('NFD').replace(/\p{M}/gu,'').toLowerCase()===form.normalize('NFD').replace(/\p{M}/gu,'').toLowerCase())).toBe(true)
  })
  it('returns audited cross-references and full reception coverage',async()=>{
    const refs = await get('/api/crossreferences?ref=Matt.28.19')
    expect(refs.data.length).toBe(37)
    expect(refs.data[0].provenance.license).toBeTruthy()
    const coverage = await get('/api/coverage')
    expect(coverage.data.find((c:any)=>c.sourceId==='reformed-retrieval').count).toBe(311)
    expect(coverage.data.find((c:any)=>c.sourceId==='sblgnt').status).toBe('loaded')
  })
  it('counts whole-source ethnos matches and preserves intentionally blank BSB slots',async()=>{
    const all = await get(`/api/distribution?lemma=${encodeURIComponent('ἔθνος')}`)
    expect(all.data.total).toBe(160)
    const matt = await get(`/api/distribution?lemma=${encodeURIComponent('ἔθνος')}&book=Matt`)
    expect(matt.data.total).toBe(15)
    const empty = await get('/api/passage?ref=Matt.17.21')
    const bsb = empty.data.editions.find((e:any)=>e.id==='bsb')
    expect(bsb.textStatus).toBe('empty-upstream')
    expect(bsb.text).toBe('')
    expect(bsb.tokens).toEqual([])
  })
  it('persists, updates, searches and exports notes through independent HTTP requests',async()=>{
    const health = await get('/api/health')
    // Never create test notes against a production identity.
    expect(health.data.auth).toBe('local-development')
    const marker = `Synthetic M1 integration ${crypto.randomUUID()}`
    const input = {anchor:{type:'token',id:'sblgnt:Matt.28.19:8'},body:marker,tags:['integration-test'],provenanceTag:'my-inference'}
    const headers = {'Content-Type':'application/json',...(process.env.WORKBENCH_INTEGRATION_ORIGIN?{Origin:process.env.WORKBENCH_INTEGRATION_ORIGIN}:{})}
    const created = await fetch(new URL('/api/notes',base),{method:'POST',headers,body:JSON.stringify(input)})
    expect(created.status).toBe(201)
    const {data:note} = await created.json() as Envelope<any>
    expect((await get(`/api/notes/${note.id}`)).data.body).toBe(marker)
    const updated = await fetch(new URL(`/api/notes/${note.id}`,base),{method:'PUT',headers,body:JSON.stringify({...input,body:marker+' revised'})})
    expect(updated.status).toBe(200)
    expect((await get(`/api/notes?anchor=${encodeURIComponent(input.anchor.id)}&q=${encodeURIComponent(marker)}`)).data.some((n:any)=>n.id===note.id)).toBe(true)
    const exported = await fetch(new URL('/api/notes/export',base))
    expect(await exported.text()).toContain(marker+' revised')
  })
})
