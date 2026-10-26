export type ReviewStatus = 'upstream' | 'AI-assisted, unreviewed';
export interface Coverage { sourceId: string; status: 'partial' | 'not-loaded' | 'loaded'; scope: string; limitations: string[]; count?: number }
export interface Provenance { source: string; edition: string; version: string; license: string; locator: string; reviewStatus: ReviewStatus; deepLink: string; upstreamUrl: string }
export interface SourceManifest { id: string; revision: string; upstreamUrl: string; license: string; licenseFile: string; attribution: string; included: string[]; excluded: string[]; coverage: Coverage; files: { path: string; url: string; sha256: string; samplePath?: string; sampleSha256?: string }[] }
export interface Token { id: string; text: string; lemma?: string; gloss?: string; morphology?: { code?: string; description?: string; gender?: string; number?: string; case?: string }; sourceId: string; upstreamId?: string; referents?: string[]; provenance: Provenance }
export interface Edition { id: string; label: string; language: string; text: string; tokens: Token[]; provenance: Provenance }
export interface Passage { ref: string; editions: Edition[] }
export interface Source { id: string; title: string; path: string; date?: string; author?: string; originalUrl: string; provenance: Provenance; coverage: Coverage }
export interface PageLocator { id: string; kind: 'printed'|'pdf'|'marginal'|'signature'|'unpaginated'; label: string; printedPage?: string; pdfPage?: string; volume?: string; marginal?: string; signature?: string; frame?: string }
export interface SourcePage { id: string; sourceId: string; locator: PageLocator; text: string; startOffset: number; provenance: Provenance }
export interface ScriptureReference { ref: string; endRef?: string; raw: string; start: number; end: number; versification: 'unmapped'; uncertain?: string }
export interface Citation { id: string; sourceId: string; title: string; author?: string; date?: string; locator: string; excerpt: string; reviewStatus: ReviewStatus; deepLink: string; reference: ScriptureReference; provenance: Provenance }
export interface Corpus { schemaVersion: 1; passages: Passage[]; sources: Source[]; pages: SourcePage[]; citations: Citation[]; coverage: Coverage[]; manifests: SourceManifest[]; scriptureIndex?: Record<string,string[]> }
