import { z } from 'zod';

export const anchorSchema = z.object({
  type: z.enum(['token', 'phrase', 'clause', 'verse-range', 'source-page']),
  id: z.string().trim().min(1).max(512),
}).strict();
export const sourceLocatorSchema = z.object({
  source: z.string().trim().min(1).max(512),
  edition: z.string().trim().min(1).max(512),
  version: z.string().trim().min(1).max(512),
  license: z.string().trim().min(1).max(512),
  locator: z.string().trim().min(1).max(1024),
  reviewStatus: z.string().trim().min(1).max(256),
  deepLink: z.string().max(2048).optional(),
}).strict();
export const noteInputSchema = z.object({
  anchor: anchorSchema,
  additionalAnchors: z.array(anchorSchema).max(20).optional(),
  body: z.string().trim().min(1).max(100_000),
  tags: z.array(z.string().trim().min(1).max(80)).max(50).default([]),
  provenanceTag: z.enum(['quoted', 'paraphrased', 'my-inference', 'agent-generated']),
  sourceLocator: sourceLocatorSchema.optional(),
}).strict().superRefine((note, ctx) => {
  if ((note.provenanceTag === 'quoted' || note.provenanceTag === 'paraphrased') && !note.sourceLocator)
    ctx.addIssue({ code: 'custom', path: ['sourceLocator'], message: 'Quoted and paraphrased notes require full source locator metadata.' });
});
export type Anchor = z.infer<typeof anchorSchema>;
export type NoteInput = z.infer<typeof noteInputSchema>;
export type Note = NoteInput & { id: string; createdAt: string; updatedAt: string };
export type Provenance = z.infer<typeof sourceLocatorSchema>;
export interface Coverage { source: string; status: 'loaded' | 'partial' | 'not-loaded'; limitations: string[]; [key: string]: unknown }
export interface Envelope<T> { data: T; coverage: Coverage[]; provenance: Provenance[] }
export interface Morphology { code?: string; description?: string; gender?: string }
export interface Token { id: string; text: string; lemma?: string; gloss?: string; morphology?: Morphology; sourceId?: string }
export interface Passage { ref: string; editions: { id: string; label: string; language: string; text: string; textStatus?: 'empty-upstream'; tokens: Token[] }[] }
export interface TokenDetail extends Token { analyses: unknown[]; grammar: unknown[]; cautions: string[] }
export interface Citation { id: string; sourceId: string; title: string; author?: string; date?: string; locator: string; excerpt: string; reviewStatus: string; deepLink: string }
export const apiPaths = { passage: '/api/passage', token: '/api/token', syntax: '/api/syntax', lexicon: '/api/lexicon', concordance: '/api/concordance', citations: '/api/citations', sources: '/api/sources/search', sourcePage: '/api/source-page', coverage: '/api/coverage', provenance: '/api/provenance', notes: '/api/notes', grammar: '/api/grammar', crossreferences: '/api/crossreferences', distribution: '/api/distribution', session: '/auth/session', login: '/auth/login', logout: '/auth/logout' } as const;

export const noteLinkSchema = z.object({ from: z.string().min(1).max(512), to: z.string().min(1).max(512), relation: z.enum(['related','supports','objects-to','distinguishes','answers']).default('related') }).strict().refine(x => x.from !== x.to, 'A note cannot link to itself.');
export type NoteLink = z.infer<typeof noteLinkSchema> & { id: string; provenanceTag: 'my-inference'|'agent-generated'; createdAt: string };
export const disputeInputSchema = z.object({
  question: z.string().trim().min(1).max(2000),
  positions: z.array(z.object({ id: z.string().min(1).max(100), title: z.string().trim().min(1).max(500), premises: z.array(z.string().min(1).max(512)).max(100) }).strict()).min(2).max(10),
  divergences: z.array(z.object({ leftNote: z.string().min(1), rightNote: z.string().min(1), explanation: z.string().trim().min(1).max(10000) }).strict()).max(100).default([]),
  timeline: z.array(z.object({ date: z.string().regex(/^-?\d{1,4}(-\d{2}(-\d{2})?)?$/), positionId: z.string().min(1), noteId: z.string().min(1), description: z.string().min(1).max(2000) }).strict()).max(300).default([]),
}).strict().superRefine((d,ctx) => {
 const ids=d.positions.map(p=>p.id), notes=new Set(d.positions.flatMap(p=>p.premises));
 if(new Set(ids).size!==ids.length)ctx.addIssue({code:'custom',message:'Position IDs must be unique.'});
 for(const x of d.divergences)if(x.leftNote===x.rightNote||!notes.has(x.leftNote)||!notes.has(x.rightNote)||!d.positions.some(a=>a.premises.includes(x.leftNote)&&d.positions.some(b=>b.id!==a.id&&b.premises.includes(x.rightNote))))ctx.addIssue({code:'custom',message:'Divergence must compare premises in different positions.'});
 for(const x of d.timeline)if(!ids.includes(x.positionId))ctx.addIssue({code:'custom',message:'Timeline position does not exist.'});
});
export type DisputeInput = z.infer<typeof disputeInputSchema>;
export type Dispute = DisputeInput & { id:string; createdAt:string; updatedAt:string; provenanceTag:'my-inference'|'agent-generated'; revision:number };
