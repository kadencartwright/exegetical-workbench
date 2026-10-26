import { test } from 'node:test';
import assert from 'node:assert/strict';
import { alignedPassage, parallelReferences, referenceEdition, type Passage, type Provenance } from '../src/index.ts';
const provenance: Provenance = { source:'fixture', edition:'fixture', version:'test', license:'CC0', locator:'test', reviewStatus:'upstream', deepLink:'/test', upstreamUrl:'https://example.invalid' };
const passages = new Map<string, Passage>();
for (const ref of ['2Cor.13.12','2Cor.13.13','2Cor.13.14']) passages.set(ref, { ref, editions: ['sblgnt','bsb'].flatMap(id => id === 'sblgnt' && ref.endsWith('.14') ? [] : [{ id, label:id, language:id==='bsb'?'en':'el', text:`fixture ${id} ${ref}`, tokens:[{id:`${id}:${ref}:1`,text:'fixture',sourceId:'fixture',provenance:{...provenance,locator:ref}}], provenance:{...provenance,locator:ref} }]) });
test('parallel groups retain native token IDs and source references across split and renumbered verses', () => {
  const group=alignedPassage('2Cor.13.12',passages);
  assert.deepEqual(group.editions.find(e=>e.id==='bsb')!.sourceRefs,['2Cor.13.12','2Cor.13.13']);
  assert.deepEqual(group.editions.find(e=>e.id==='bsb')!.tokens.map(t=>t.id),['bsb:2Cor.13.12:1','bsb:2Cor.13.13:1']);
  assert.match(group.alignment!.note,/No word-level alignment/);
  const benediction=alignedPassage('2Cor.13.14',passages,'bsb');
  assert.deepEqual(benediction.editions.find(e=>e.id==='sblgnt')!.sourceRefs,['2Cor.13.13']);
  assert.deepEqual(benediction.editions.find(e=>e.id==='bsb')!.sourceRefs,['2Cor.13.14']);
});
test('BSB-specific boundaries are not replaced by KJV mappings and ordinary verses remain unchanged', () => {
  assert.deepEqual(parallelReferences('Rev.12.18').bsb,['Rev.12.17']);
  assert.deepEqual(parallelReferences('Phil.1.16'),{sblgnt:['Phil.1.16'],bsb:['Phil.1.16']});
  assert.deepEqual(parallelReferences('3John.1.14','bsb').sblgnt,['3John.1.14','3John.1.15']);
  assert.deepEqual(alignedPassage('John.3.16',new Map()),{ref:'John.3.16',editions:[]});
  assert.throws(()=>referenceEdition('kjv'));
});
