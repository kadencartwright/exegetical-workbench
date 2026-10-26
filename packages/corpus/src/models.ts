export type ReviewStatus = 'upstream' | 'AI-assisted, unreviewed';
export interface Coverage { sourceId: string; status: 'partial' | 'not-loaded' | 'loaded'; scope: string; limitations: string[]; count?: number }
export interface Provenance { source: string; edition: string; version: string; license: string; locator: string; reviewStatus: ReviewStatus; deepLink: string; upstreamUrl: string }
export interface SourceManifest { id: string; revision: string; upstreamUrl: string; license: string; licenseFile: string; licenseSha256?: string; attribution: string; included: string[]; excluded: string[]; coverage: Coverage; files: { path: string; url: string; sha256: string; samplePath?: string; sampleSha256?: string }[] }
export interface Token { id: string; text: string; lemma?: string; gloss?: string; morphology?: { code?: string; description?: string; gender?: string; number?: string; case?: string; person?: string; tense?: string; voice?: string; mood?: string; partOfSpeech?: string }; sourceId: string; strong?: string; transliteration?: string; upstreamId?: string; referents?: string[]; provenance: Provenance }
export interface Edition { id: string; label: string; language: string; text: string; textStatus?: 'empty-upstream'; tokens: Token[]; provenance: Provenance; sourceRefs?: string[]; provenances?: Provenance[] }
export interface Passage { ref: string; editions: Edition[] }
export interface Source { id: string; title: string; path: string; date?: string; author?: string; originalUrl: string; provenance: Provenance; coverage: Coverage }
export interface PageLocator { id: string; kind: 'printed'|'pdf'|'marginal'|'signature'|'unpaginated'; label: string; printedPage?: string; pdfPage?: string; volume?: string; marginal?: string; signature?: string; frame?: string }
export interface SourcePage { id: string; sourceId: string; locator: PageLocator; text: string; startOffset: number; provenance: Provenance }
export interface ScriptureReference { ref: string; endRef?: string; raw: string; start: number; end: number; versification: 'unmapped'; uncertain?: string }
export interface Citation { id: string; sourceId: string; title: string; author?: string; date?: string; locator: string; excerpt: string; reviewStatus: ReviewStatus; deepLink: string; reference: ScriptureReference; provenance: Provenance }
export interface Corpus { schemaVersion: 1; importMode?: 'sample'|'full'; syntax?: import('./bible.ts').Syntax[]; lexicon?: LexiconEntry[]; grammar?: GrammarEntry[]; crossreferences?: CrossReference[]; sourceInventory?: SourceInventory[]; passages: Passage[]; sources: Source[]; pages: SourcePage[]; citations: Citation[]; coverage: Coverage[]; manifests: SourceManifest[]; scriptureIndex?: Record<string,string[]> }
export interface LexiconEntry { id:string; sourceId:string; lemma:string; aliases?:string[]; strong?:string; transliteration?:string; gloss?:string; definition:string; provenance:Provenance }
export interface GrammarEntry { id:string; category:string; title:string; summary:string; canEstablish:string; cannotEstablish:string; url:string; locator:string; provenance:Provenance }
export interface CrossReference { id:string; fromRef:string; toRef:string; endRef?:string; votes:number; sourceId:string; provenance:Provenance }
export interface SourceInventory { id:string; state:'completed'|'in-progress'; importedPaths:string[]; omitted:{path:string;reason:string}[]; upstreamUrl:string }
export interface Distribution { total:number; books:{book:string;count:number}[]; forms:{form:string;count:number}[]; editions:{edition:string;count:number}[] }
