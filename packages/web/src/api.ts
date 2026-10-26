/** HTTP boundary mirrors docs/implementation.md; no local corpus fixtures. */
export interface Envelope<T = unknown> { data: T; coverage: unknown; provenance: unknown }
export type { Token, Passage, TokenDetail, Citation, Note } from '@exegetical/shared'
export type NoteTag = 'quoted' | 'paraphrased' | 'my-inference' | 'agent-generated'

export async function request(path: string, method = 'GET', body?: unknown): Promise<Envelope> {
  const response = await fetch(path, {
    method, credentials: 'same-origin', headers: body ? { 'Content-Type': 'application/json' } : undefined,
    body: body === undefined ? undefined : JSON.stringify(body),
  })
  if (!response.ok) {
    if (response.status === 401 || response.status === 403) throw new Error('Private notes require an authenticated session. Sign in through the Worker access gateway.')
    throw new Error(`Request failed (${response.status}). Check the Worker connection and retry.`)
  }
  const value: unknown = await response.json()
  if (!value || typeof value !== 'object' || !('data' in value) || !('coverage' in value) || !('provenance' in value)) throw new Error('The Worker returned an incompatible response envelope.')
  return value as Envelope
}

export function safeLink(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined
  if (value.startsWith('/') && !value.startsWith('//')) return value
  try { const url = new URL(value); return ['https:', 'http:'].includes(url.protocol) ? url.href : undefined } catch { return undefined }
}

/** Deliberately bounded parser. Unsupported range/ff input is never silently narrowed. */
export function normalizeReference(input: string): string | undefined {
  const match = input.trim().match(/^([1-3]?\s*[a-zA-Z]+)[.\s]+(\d+)[.:](\d+)$/)
  if (!match || Number(match[2]) < 1 || Number(match[3]) < 1) return undefined
  const aliases: Record<string, string> = { matthew: 'Matt', matt: 'Matt', mt: 'Matt', john: 'John', jn: 'John', mark: 'Mark', mk: 'Mark', luke: 'Luke', lk: 'Luke', genesis: 'Gen', gen: 'Gen', romans: 'Rom', rom: 'Rom', ephesians: 'Eph', eph: 'Eph', colossians: 'Col', col: 'Col', psalms: 'Ps', ps: 'Ps', acts: 'Acts' }
  const book = match[1].replace(/\s/g, '')
  return `${aliases[book.toLowerCase()] ?? book}.${Number(match[2])}.${Number(match[3])}`
}
