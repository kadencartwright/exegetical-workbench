import type { Edition, Passage } from './models.ts';

/** Whole-verse correspondence groups, not fabricated word/subverse alignments.
 * Evidence and audited inputs: data/manifests/versification.json.
 * BSB differs from KJV at Revelation 12:17, so TVTMS is not applied blindly.
 */
export const ntVerseGroups = [
  { sblgnt: ['Acts.19.40'], bsb: ['Acts.19.40', 'Acts.19.41'] },
  { sblgnt: ['2Cor.13.12'], bsb: ['2Cor.13.12', '2Cor.13.13'] },
  { sblgnt: ['2Cor.13.13'], bsb: ['2Cor.13.14'] },
  { sblgnt: ['3John.1.14', '3John.1.15'], bsb: ['3John.1.14'] },
  { sblgnt: ['Rev.12.17', 'Rev.12.18'], bsb: ['Rev.12.17'] },
] as const;
export type ReferenceEdition = 'sblgnt' | 'bsb';
export function referenceEdition(value?: string): ReferenceEdition {
  if (value && value !== 'sblgnt' && value !== 'bsb') throw new Error('Reference edition must be sblgnt or bsb');
  return value === 'bsb' ? 'bsb' : 'sblgnt';
}
export function parallelReferences(ref: string, edition: ReferenceEdition = 'sblgnt'): { sblgnt: readonly string[]; bsb: readonly string[] } {
  return ntVerseGroups.find(group => (group[edition] as readonly string[]).includes(ref)) ?? { sblgnt: [ref], bsb: [ref] };
}
export function alignedPassage(ref: string, passages: ReadonlyMap<string, Passage>, edition: ReferenceEdition = 'sblgnt'): Passage & { referenceEdition?: ReferenceEdition; alignment?: { note: string; sourceUrl: string } } {
  const refs = parallelReferences(ref, edition);
  const changed = refs.sblgnt.length !== 1 || refs.bsb.length !== 1 || refs.sblgnt[0] !== refs.bsb[0];
  if (!changed) return passages.get(ref) ?? { ref, editions: [] };
  const editions: Edition[] = [];
  for (const id of ['sblgnt', 'bsb'] as const) {
    const parts = refs[id].flatMap(nativeRef => {
      const found = passages.get(nativeRef)?.editions.find(e => e.id === id);
      return found ? [{ nativeRef, edition: found }] : [];
    });
    if (!parts.length) continue;
    // Token IDs and per-token provenance keep their native edition references.
    editions.push({ ...parts[0]!.edition, label: `${parts[0]!.edition.label} · ${parts.map(p => p.nativeRef).join(', ')}`, text: parts.map(p => p.edition.text).join(' '), tokens: parts.flatMap(p => p.edition.tokens), sourceRefs: parts.map(p => p.nativeRef), provenances: parts.map(p => p.edition.provenance) });
  }
  return { ref, referenceEdition: edition, editions, alignment: { note: 'These editions divide this passage differently. Complete corresponding verse groups are shown; token IDs retain their native references. No word-level alignment is inferred.', sourceUrl: 'https://github.com/STEPBible/STEPBible-Data/tree/be4191f0082aeedddb0eff0c02c966292b2bd641/Versification' } };
}
