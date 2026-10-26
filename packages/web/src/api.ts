/** HTTP boundary mirrors docs/implementation.md; no local corpus fixtures. */
export interface Envelope<T = unknown> { data: T; coverage: unknown; provenance: unknown }
export type { Token, Passage, TokenDetail, Citation, Note } from '@exegetical/shared'
export type NoteTag = 'quoted' | 'paraphrased' | 'my-inference' | 'agent-generated'

export async function request(path: string, method = 'GET', body?: unknown): Promise<Envelope> {
  const response = await fetch(path, {
    method, credentials: 'same-origin', headers: { ...(body ? { 'Content-Type': 'application/json' } : {}) },
    body: body === undefined ? undefined : JSON.stringify(body),
  })
  if (!response.ok) {
    if (response.status === 401 || response.status === 403) throw new Error('Private notes require an authenticated session. Use Sign in to establish a browser session.')
    const failure = await response.json().catch(() => null) as {error?:{message?:string}} | null
    throw new Error(failure?.error?.message ?? `Request failed (${response.status}). Check the Worker connection and retry.`)
  }
  const value: unknown = await response.json()
  if (!value || typeof value !== 'object' || !('data' in value) || !('coverage' in value) || !('provenance' in value)) throw new Error('The Worker returned an incompatible response envelope.')
  return value as Envelope
}

export function safeLink(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined
  if (value.startsWith('/') && !value.startsWith('//') && !/[\\\x00-\x1f]/.test(value)) return value
  try { const url = new URL(value); return ['https:', 'http:'].includes(url.protocol) ? url.href : undefined } catch { return undefined }
}

/** Normalizes navigation syntax; the server resolves loaded verses and versification. */
const bookGroups = [
  ['Tob','Tobit'],['Jdt','Judith'],['Wis','Wisdom'],['Sir','Sirach'],['1Macc','1 Maccabees'],['2Macc','2 Maccabees'],['3Macc','3 Maccabees'],['4Macc','4 Maccabees'],['1Esd','1 Esdras'],['2Esd','2 Esdras'],['Bar','Baruch'],['EpJer','Letter of Jeremiah'],['Sus','Susanna'],['Bel','Bel'],['DanTh','Daniel Theodotion'],['SusTh'],['BelTh'],['TobS'],['Odes'],['PssSol'],
  ['Gen','Genesis','Ge'],['Exod','Exodus','Ex'],['Lev','Leviticus'],['Num','Numbers'],['Deut','Deuteronomy'],['Josh','Joshua'],['Judg','Judges'],['Ruth'],['1Sam','1 Samuel'],['2Sam','2 Samuel'],['1Kgs','1 Kings'],['2Kgs','2 Kings'],['1Chr','1 Chronicles'],['2Chr','2 Chronicles'],['Ezra'],['Neh','Nehemiah'],['Esth','Esther'],['Job'],['Ps','Psalms','Psalm'],['Prov','Proverbs'],['Eccl','Ecclesiastes'],['Song','Song of Songs'],['Isa','Isaiah'],['Jer','Jeremiah'],['Lam','Lamentations'],['Ezek','Ezekiel'],['Dan','Daniel'],['Hos','Hosea'],['Joel'],['Amos'],['Obad','Obadiah'],['Jonah'],['Mic','Micah'],['Nah','Nahum'],['Hab','Habakkuk'],['Zeph','Zephaniah'],['Hag','Haggai'],['Zech','Zechariah'],['Mal','Malachi'],
  ['Matt','Matthew','Mt'],['Mark','Mk'],['Luke','Lk'],['John','Jn'],['Acts'],['Rom','Romans'],['1Cor','1 Corinthians'],['2Cor','2 Corinthians'],['Gal','Galatians'],['Eph','Ephesians'],['Phil','Philippians'],['Col','Colossians'],['1Thess','1 Thessalonians'],['2Thess','2 Thessalonians'],['1Tim','1 Timothy'],['2Tim','2 Timothy'],['Titus'],['Phlm','Philemon'],['Heb','Hebrews'],['Jas','James'],['1Pet','1 Peter'],['2Pet','2 Peter'],['1John','1 John','1Jn'],['2John','2 John','2Jn'],['3John','3 John','3Jn'],['Jude'],['Rev','Revelation'],
]
export const ntBooks = bookGroups.map(row => ({ id: row[0], name: row[1] ?? row[0] }))
export function normalizeReference(input: string): string | undefined {
  const text = input.trim().replace(/[–—]/g, '-')
  const match = text.match(/^(.+?)[.\s]+(\d+)(?:[.:](\d+))?(?:(ff)|-(?:(\d+)[.:])?(\d+))?$/i)
  if (!match) return undefined
  const book = bookGroups.find(row => row.some(alias => alias.replace(/\s/g,'').toLowerCase() === match[1].replace(/\s/g,'').toLowerCase()))?.[0]
  if (!book || Number(match[2]) < 1 || (match[5] !== undefined && Number(match[5]) < 1) || [match[2], match[3], match[5], match[6]].some(n => n !== undefined && Number(n) < 0)) return undefined
  const chapter = Number(match[2]), verse = match[3] && Number(match[3])
  if (match[5] && verse === undefined) return undefined
  if (match[6] && (Number(match[5] ?? chapter) < chapter || (!match[5] && Number(match[6]) < Number(verse ?? chapter)))) return undefined
  return `${book}.${chapter}${verse !== undefined && verse !== '' ? `.${verse}` : ''}${match[4] ? 'ff' : match[6] ? `-${match[5] ? `${Number(match[5])}.` : ''}${Number(match[6])}` : ''}`
}
