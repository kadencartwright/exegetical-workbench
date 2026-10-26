import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile,mkdtemp,writeFile,mkdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';
import { Effect } from 'effect';
import { buildCorpus, verifyChecksum, parseChecksumManifest, safePath, importReception, sha256, type ReceptionPin } from '../src/import.ts';
import { normalizeLocator, splitPages, extractReferences, normalizeRef, referenceIncludes, parseMacula } from '../src/index.ts';
const root=new URL('../../../',import.meta.url).pathname;
test('verified real samples retain text, morphology, syntax; exclude UBS attributes',async()=>{
 const corpus=await Effect.runPromise(buildCorpus(root)); const passage=corpus.passages[0]!;
 assert.equal(passage.ref,'Matt.28.19');assert.equal(passage.editions.length,2);
 assert.match(passage.editions.find(e=>e.id==='bsb')!.text,/make disciples of all nations/);
 const tokens=passage.editions.find(e=>e.id==='sblgnt')!.tokens;assert.equal(tokens.length,20);
 assert.equal(tokens.find(t=>t.lemma==='ἔθνος')!.morphology!.gender,'neuter');
 assert.equal(tokens.find(t=>t.text==='αὐτοὺς')!.morphology!.gender,'masculine');
 assert.ok(corpus.syntax[0]!.trees.length);assert.doesNotMatch(JSON.stringify(corpus),/"(?:ln|domain|english|mandarin)":/);
 assert.ok(corpus.citations.some(c=>c.reference.ref==='Matt.28.19'&&c.locator.includes('p:214')));
 assert.ok(corpus.citations.every(c=>c.reviewStatus==='AI-assisted, unreviewed'));
 assert.ok(corpus.coverage.every(c=>c.status==='partial'));
});
test('normalizes actual CO, PDF p./page, printed and marginal formats',()=>{
 assert.equal(normalizeLocator('work','[CO X/1, p. 189]')!.printedPage,'189');
 assert.equal(normalizeLocator('work','[PDF p. 132; printed p. 80]')!.id,'reception:work:p:80');
 assert.equal(normalizeLocator('work','[PDF page 132; printed page 80]')!.id,'reception:work:p:80');
 assert.equal(normalizeLocator('work','[PDF p. 5]')!.kind,'pdf');
 assert.equal(normalizeLocator('work','[p. 16]')!.printedPage,'16');
 assert.equal(normalizeLocator('work','[Marg.: Eph. 5:19]')!.kind,'marginal');
 const pages=splitPages('work','preface\n[CO X/1, p. 189]\nMatthew 28:19\n[CO X/1, p. 190]\nnext');
 assert.equal(pages.length,3);assert.equal(pages[0]!.locator.kind,'unpaginated');assert.match(pages[1]!.text,/Matthew/);
});
test('extracts explicit references and ranges without inventing shorthand or Psalm mapping',()=>{
 const text='Matthew 28:19–20; Ephesians 4:3; Eph. 5:19; 1 Timothy 5:17. Psalm 22:1; Romans 8:28ff. v. 19';
 const refs=extractReferences(text);assert.equal(refs.length,6);assert.equal(refs[0]!.endRef,'Matt.28.20');assert.ok(referenceIncludes(refs[0]!,'Matt.28.20'));
 assert.equal(normalizeRef('Jn 3:16'),'John.3.16');assert.equal(normalizeRef('Matt.28.19'),'Matt.28.19');
 assert.match(refs[4]!.uncertain!,/Psalm/);assert.match(refs[5]!.uncertain!,/ff/);assert.equal(refs[0]!.raw,text.slice(refs[0]!.start,refs[0]!.end));
 assert.equal(extractReferences('NotMatthew 28:19; Example 4:3; Matthew 0:19').length,0);
});
test('rejects damaged checksums, unsafe paths and duplicate/malformed manifests',()=>{
 assert.throws(()=>verifyChecksum('modified','a'.repeat(64)),/Checksum mismatch/);
 assert.throws(()=>safePath('/tmp/root','../outside'),/Unsafe/);
 assert.throws(()=>parseChecksumManifest('bad'),/Malformed/);
 assert.throws(()=>parseChecksumManifest(`${'a'.repeat(64)}  file\n${'a'.repeat(64)}  file`),/Duplicate/);
});
test('Macula uses allowlist on unsanitized input and rejects DTD',async()=>{
 const c=await Effect.runPromise(buildCorpus(root));const m=c.manifests.find(m=>m.id==='macula')!;
 const xml='<book><w ref="MAT 28:19!1" lemma="x" ln="1.2" domain="2" unknown="private">x</w></book>';
 assert.doesNotMatch(JSON.stringify(parseMacula(xml,m)),/private|domain|"ln"/);
 assert.throws(()=>parseMacula('<!DOCTYPE book><book/>',m),/DTD/);
 assert.throws(()=>parseMacula('<book>',m),/Invalid/);
});
test('reception verifies every manifest member, even excluded originals',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'corpus-'));await mkdir(join(dir,'completed','work'),{recursive:true});
 const english='[CO X/1, p. 1]\nMatthew 28:19'; const original='original';
 await writeFile(join(dir,'completed/work/english.md'),english);await writeFile(join(dir,'completed/work/latin.txt'),original);
 const manifest=`${sha256(english)}  completed/work/english.md\n${sha256(original)}  completed/work/latin.txt\n`;await writeFile(join(dir,'MANIFEST.sha256'),manifest);
 execFileSync('git',['init','-q'],{cwd:dir}); execFileSync('git',['-c','user.name=Test','-c','user.email=test@example.invalid','commit','--allow-empty','-qm','test'],{cwd:dir});
 const pin:ReceptionPin={revision:execFileSync('git',['rev-parse','HEAD'],{cwd:dir,encoding:'utf8'}).trim(),manifestSha256:sha256(manifest),upstreamUrl:'https://example.invalid',licensePolicy:'fixture'};
 const imported=await Effect.runPromise(importReception(dir,pin));assert.equal(imported.sources.length,1);assert.equal(imported.citations.length,1);assert.equal(imported.pages[0]!.text.includes(original),false);
 await writeFile(join(dir,'completed/work/latin.txt'),'damaged');await assert.rejects(Effect.runPromise(importReception(dir,pin)),/Checksum mismatch/);
 await assert.rejects(Effect.runPromise(importReception(dir,{...pin,revision:'wrong'})),/revision mismatch/);
});
test('service adapter returns real range citations and explicit absent lexicon coverage',async()=>{
 const {createCorpusAdapter}=await import('../src/index.ts');const corpus=await Effect.runPromise(buildCorpus(root));const adapter=createCorpusAdapter(corpus);
 assert.ok((adapter.query('citations',{ref:'Matthew 28:19'}).data as unknown[]).length>0);
 const lexicon=adapter.query('lexicon',{lemma:'ἔθνος'});assert.deepEqual(lexicon.data,[]);assert.ok(lexicon.coverage.some(c=>c.status==='not-loaded'));
 assert.equal(adapter.query('passage',{ref:'John.3.16'}).data,null);
 assert.ok(corpus.scriptureIndex?.['Matt.28.19']?.length);
});
test('pipe witness markers and unpaginated digital signatures retain exact locators',()=>{
 const witness=normalizeLocator('rutherford','[1668 KBNL/UvA witness | logical printed p. 686 | PDF p. 735 | resumes at Quæritur]')!;
 assert.equal(witness.printedPage,'686');assert.equal(witness.pdfPage,'735');
 const part=normalizeLocator('beza','[Part II | PDF page 140 | logical source scan 139 | printed page 138]')!;assert.equal(part.printedPage,'138');assert.equal(part.pdfPage,'140');
 const sig=normalizeLocator('rollock','[Digital frame 2; sig. A1v; blank verso]')!;assert.equal(sig.signature,'A1v');assert.equal(sig.frame,'2');
 assert.equal(splitPages('rollock','[Digital frame 2; sig. A1v; blank verso\nbearing marks]\ntext')[0]!.locator.kind,'signature');
});
test('marginal reference markers remain searchable evidence',()=>{
 const pages=splitPages('work','[p. 1]\nText\n[Marg.: Matthew 28:19]\nFollowing words');
 const marginal=pages.find(p=>p.locator.kind==='marginal')!;assert.equal(extractReferences(marginal.text)[0]!.ref,'Matt.28.19');
});
