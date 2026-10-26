import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile,mkdtemp,writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';
import { Effect } from 'effect';
import { buildCorpus, unzipMember } from '../src/import.ts';
import { exportCorpusStorage, writeCorpusJson } from '../src/export.ts';
import { createCorpusAdapter, parseReference, selectReferences, referenceOverlaps, normalizeRef, parseVerseText, parseMaculaBook, parseStepLexicon, parseAbbottSmith, parseCrossReferences, lexicalKey, strongKey, type Token, type SourceManifest, type GrammarEntry, type LexiconEntry, type Distribution, type Corpus } from '../src/index.ts';
const root=new URL('../../../',import.meta.url).pathname;
const sample=()=>Effect.runPromise(buildCorpus(root));
test('M1 autous chain links actual gender/referent evidence to checked grammar and two lexicons',async()=>{
 const c=await sample(),a=createCorpusAdapter(c),t=a.query('token',{id:'sblgnt:Matt.28.19:8'}).data as Token&{agreement:{relatedTokenId:string;observation:string}[];grammar:GrammarEntry[];cautions:string[]};
 assert.equal(t.lemma,'ἑαυτοῦ');assert.equal(t.strong,'848');assert.equal(t.morphology?.gender,'masculine');
 assert.equal(t.agreement[0]!.relatedTokenId,'sblgnt:Matt.28.19:6');assert.match(t.agreement[0]!.observation,/neuter/);
 const robertson=t.grammar.find(g=>g.id==='robertson-matt-28-19')!;assert.match(robertson.locator,/683–684/);assert.match(robertson.summary,/Matthew 28:19/);assert.match(robertson.cannotEstablish,/corporate/);assert.match(robertson.url,/\/page\/684\//);
 const lex=a.query('lexicon',{lemma:'G0846'}).data as LexiconEntry[];assert.equal(new Set(lex.map(e=>e.sourceId)).size,2);assert.ok(lex.every(e=>/αὐτός|αὐτός/.test(e.lemma)));assert.ok((a.query('citations',{ref:'Mt 28:19'}).data as unknown[]).length>0);
 assert.ok(t.cautions.some(x=>x.includes('848')));
});
test('reference aliases, chapter ranges, cross-chapter ranges, ff navigation and interval overlap',()=>{
 const available=['John.3.15','John.3.16','John.3.17','John.4.1','Rom.8.28','Rom.8.29','Rom.9.1'];
 assert.equal(normalizeRef('1 Co 13:1'),'1Cor.13.1');assert.equal(normalizeRef('jn.3.16'),'John.3.16');
 assert.deepEqual(selectReferences('Jn 3:16–4:1',available),['John.3.16','John.3.17','John.4.1']);
 assert.deepEqual(selectReferences('John 3–4',available),available.slice(0,4));assert.deepEqual(selectReferences('Rom 8:28ff',available),['Rom.8.28','Rom.8.29']);
 for(const invalid of ['Fake.1.1','John 3:20-16','John.0.1','John.3.16-Matt.4.1','Matt 29:1','Gen 51:1'])assert.throws(()=>parseReference(invalid));
 assert.ok(referenceOverlaps({ref:'John.3.1',endRef:'John.3.16',raw:'fixture',start:0,end:0,versification:'unmapped'},'Jn 3:15–20'));
});
test('all NT editions parse aliases beyond Matthew; Macula book projection preserves syntax and punctuation order',async()=>{
 const c=await sample(),sbl=c.manifests.find(m=>m.id==='sblgnt')!,mac=c.manifests.find(m=>m.id==='macula')!;
 const rows=parseVerseText('Mark 1:1\tἀρχή\n1 John 1:1\tλόγος\nRevelation 22:21\tἀμήν',sbl);assert.deepEqual([...rows.keys()],['Mark.1.1','1John.1.1','Rev.22.21']);
 const xml='<book><sentence><wg rule="fixture-cross-verse"><w ref="MRK 1:1!2" lemma="β" gender="neuter" ln="excluded">β</w><w ref="MRK 1:1!1" lemma="α">α</w><w ref="MRK 1:2!1" lemma="γ">γ</w></wg></sentence></book>';
 const parsed=parseMaculaBook(xml,mac);assert.equal(parsed.length,2);assert.deepEqual(parsed[0]!.tokens.map(t=>t.text),['α','β']);assert.match(JSON.stringify(parsed[1]!.trees),/fixture-cross-verse/);assert.doesNotMatch(JSON.stringify(parsed),/excluded|"ln"/);
});
test('STEP excludes uncertain Teknia rows, preserves independent lexical analyses and never executes markup',async()=>{
 const c=await sample(),m=c.manifests.find(m=>m.id==='step-tbesg')!;
 const fixture='G0001\tG1\tG1\tα\ta\tG:N\ta\t<b>alpha</b> (AS)\nG0002\tG2\tG2\tβ\tb\tG:N\tb\tunclear permission (MT)';
 const result=parseStepLexicon(fixture,m);assert.equal(result.omitted,1);assert.equal(result.entries.length,1);assert.equal(result.entries[0]!.definition,'alpha (AS)');
 const lex=createCorpusAdapter(c).query('lexicon',{lemma:'εθνος',sources:'abbott-smith'}).data as LexiconEntry[];assert.equal(lex.length,1);assert.equal(lex[0]!.sourceId,'abbott-smith');assert.doesNotMatch(lex[0]!.definition,/<(?:script|ref|form)/i);
 assert.equal(lexicalKey('ἜΘΝΟΣ'),lexicalKey('ἔθνος'));assert.equal(strongKey('G01484'),'1484');
});
test('concordance filters intersect and distribution counts all results before pagination',async()=>{
 const c=await sample(),token=c.passages[0]!.editions.find(e=>e.id==='sblgnt')!.tokens.find(t=>t.lemma==='ἔθνος')!;
 // Explicit synthetic occurrences exercise pagination and grouping independently of upstream counts.
 c.passages.push({ref:'Rom.1.1',editions:[{...c.passages[0]!.editions[0]!,id:'sblgnt',tokens:[{...token,id:'sblgnt:Rom.1.1:1',text:'ἔθνους'}]}]});const a=createCorpusAdapter(c);
 const all=a.query('distribution',{lemma:'εθνος'}).data as Distribution;assert.equal(all.total,2);assert.equal(all.books.length,2);
 assert.equal((a.query('concordance',{lemma:'ἔθνος',limit:'1'}).data as unknown[]).length,1);assert.equal((a.query('distribution',{lemma:'ἔθνος',book:'Romans'}).data as Distribution).total,1);
 assert.equal((a.query('distribution',{lemma:'G1484',edition:'bsb'}).data as Distribution).total,0);
 assert.equal((a.query('concordance',{lemma:'ἔθνος',book:'Matt',form:'ΕΘΝΗ',edition:'sblgnt'}).data as unknown[]).length,1);
});
test('cross references retain target ranges and editorial votes with provenance',async()=>{
 const c=await sample(),m=c.manifests.find(m=>m.id==='openbible')!;
 const rows=parseCrossReferences('From Verse\tTo Verse\tVotes\nMatt.28.19\tActs.2.38-Acts.2.39\t12\nJohn.3.16\tRom.5.8\t-1',m);
 assert.equal(rows[0]!.endRef,'Acts.2.39');assert.equal(rows[1]!.votes,-1);assert.equal(rows[0]!.provenance.source,'openbible');
 const a=createCorpusAdapter({...c,crossreferences:rows});assert.equal((a.query('crossreferences',{ref:'Matthew 28:18–20'}).data as unknown[]).length,1);
 assert.throws(()=>unzipMember(new Uint8Array([1,2,3]),'missing'),/Missing ZIP member/);
});
test('storage exports stream JSON, preserve data, escape SQL and keep D1 statements below official limit',async()=>{
 const c=await sample(),dir=await mkdtemp(join(tmpdir(),'corpus-export-'));c.pages[0]!.text="A quoted ' page "+'x'.repeat(110000);
 const report=await exportCorpusStorage(c,dir);assert.ok(report.records>0);assert.ok(report.maxStatementBytes<100000);
 const sql=await readFile(join(dir,'standalone-corpus.sql'),'utf8');assert.match(sql,/r2_key/);assert.doesNotMatch(sql,/'x{110000}/);
 const catalog=JSON.parse(await readFile(join(dir,'r2/catalog.json'),'utf8'));assert.equal(catalog.counts.passage,1);assert.equal(catalog.passages,undefined);assert.ok(catalog.objects.every((x:{sha256:string})=>/^[a-f0-9]{64}$/.test(x.sha256)));
 const path=join(dir,'snapshot.json');await writeCorpusJson(c,path);assert.equal((JSON.parse(await readFile(path,'utf8')) as Corpus).pages[0]!.text,c.pages[0]!.text);
 execFileSync(process.execPath,['--experimental-strip-types',join(root,'packages/corpus/src/cli.ts'),'build','--out',path],{cwd:root});assert.equal((JSON.parse(await readFile(path,'utf8')) as Corpus).pages[0]!.text,c.pages[0]!.text);
});
test('Macula parser accepts actual deep-tree scale while retaining a finite depth ceiling',async()=>{
 const c=await sample(),m=c.manifests.find(m=>m.id==='macula')!,word='<w ref="LUK 1:1!1" lemma="fixture">fixture</w>';
 const nested=(depth:number)=>'<book>'+'<wg>'.repeat(depth)+word+'</wg>'.repeat(depth)+'</book>';
 assert.equal(parseMaculaBook(nested(159),m)[0]!.tokens.length,1);assert.throws(()=>parseMaculaBook(nested(270),m),/Maximum nested tags/);
});
test('explicit empty publisher verse slots remain distinguishable from missing imports',async()=>{
 const c=await sample(),m=c.manifests.find(m=>m.id==='bsb')!;
 const rows=parseVerseText('John 5:3\tpeople\nJohn 5:4\t\nJohn 5:5\ta man',m);
 assert.equal(rows.size,3);assert.equal(rows.get('John.5.4')!.text,'');assert.equal(rows.get('John.5.4')!.textStatus,'empty-upstream');assert.deepEqual(rows.get('John.5.4')!.tokens,[]);
});
