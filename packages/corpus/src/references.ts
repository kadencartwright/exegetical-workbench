import type { ScriptureReference } from './models.ts';
export const books = [
 ['Gen','Genesis','Gen'],['Exod','Exodus','Exod','Ex'],['Lev','Leviticus','Lev'],['Num','Numbers','Num'],['Deut','Deuteronomy','Deut'],['Josh','Joshua','Josh'],['Judg','Judges','Judg'],['Ruth','Ruth'],['1Sam','1 Samuel','1 Sam'],['2Sam','2 Samuel','2 Sam'],['1Kgs','1 Kings'],['2Kgs','2 Kings'],['1Chr','1 Chronicles'],['2Chr','2 Chronicles'],['Ezra','Ezra'],['Neh','Nehemiah'],['Esth','Esther'],['Job','Job'],['Ps','Psalms','Psalm','Ps','Psa'],['Prov','Proverbs','Prov'],['Eccl','Ecclesiastes','Eccl'],['Song','Song of Solomon','Canticles'],['Isa','Isaiah','Isa'],['Jer','Jeremiah','Jer'],['Lam','Lamentations'],['Ezek','Ezekiel'],['Dan','Daniel'],['Hos','Hosea'],['Joel','Joel'],['Amos','Amos'],['Obad','Obadiah'],['Jonah','Jonah'],['Mic','Micah'],['Nah','Nahum'],['Hab','Habakkuk'],['Zeph','Zephaniah'],['Hag','Haggai'],['Zech','Zechariah'],['Mal','Malachi'],['Matt','Matthew','Matt','Mat','Mt'],['Mark','Mark','Mk','Mar','Mrk'],['Luke','Luke','Lk','Luk'],['John','John','Jn'],['Acts','Acts','Act'],['Rom','Romans','Rom'],['1Cor','1 Corinthians','1 Cor','1 Co'],['2Cor','2 Corinthians','2 Cor','2 Co'],['Gal','Galatians','Gal'],['Eph','Ephesians','Eph','Ephes'],['Phil','Philippians','Phil'],['Col','Colossians','Col'],['1Thess','1 Thessalonians','1 Thess'],['2Thess','2 Thessalonians','2 Thess'],['1Tim','1 Timothy','1 Tim'],['2Tim','2 Timothy','2 Tim'],['Titus','Titus'],['Phlm','Philemon','Phm'],['Heb','Hebrews','Heb'],['Jas','James','Jas'],['1Pet','1 Peter','1 Pet'],['2Pet','2 Peter','2 Pet'],['1John','1 John'],['2John','2 John'],['3John','3 John'],['Jude','Jude'],['Rev','Revelation','Rev','Apocalypse']
];
const chapterCounts=Object.fromEntries(books.map((b,i)=>[b[0],[50,40,27,36,34,24,21,4,31,24,22,25,29,36,10,13,10,42,150,31,12,8,66,52,5,48,12,14,3,9,1,4,7,3,3,3,2,14,4,28,16,24,21,28,16,16,13,6,6,4,4,5,3,6,4,3,1,13,5,5,3,5,1,1,1,22][i]!]));
const additionalBooks=[['Tob','Tobit'],['Jdt','Judith'],['Wis','Wisdom'],['Sir','Sirach','Ecclesiasticus'],['Bar','Baruch'],['EpJer','Letter of Jeremiah'],['1Macc','1 Maccabees'],['2Macc','2 Maccabees'],['3Macc','3 Maccabees'],['4Macc','4 Maccabees'],['1Esd','1 Esdras'],['2Esd','2 Esdras'],['Sus','Susanna'],['Bel','Bel and the Dragon'],['PrMan','Prayer of Manasseh'],['Odes','Odes'],['PssSol','Psalms of Solomon'],['DanTh','Daniel Theodotion'],['SusTh','Susanna Theodotion'],['BelTh','Bel Theodotion'],['JoshA','Joshua A'],['JudgA','Judges A'],['TobS','Tobit Sinaiticus']];
for(const b of additionalBooks){books.push(b);chapterCounts[b[0]!]=200;}
chapterCounts.Ps=151;
const aliases = new Map(books.flatMap(([id,...names]) => [id,...names].map(n => [n!.toLowerCase(),id!] as const)));
const pattern = [...aliases.keys()].sort((a,b)=>b.length-a.length).map(x=>x.replace(/[.*+?^${}()|[\]\\]/g,'\\$&').replace(/ /g,'\\s+')).join('|');
/** Conservative English references. No guessed Psalm-number mapping or bare-v. context. */
export function extractReferences(text: string): ScriptureReference[] {
 const re = new RegExp(`(?<![\\p{L}\\d])(${pattern})(?:\\.?\\s+|\\.)(\\d{1,3})\\s*[:.,]\\s*(\\d{1,3})(?:\\s*[-–—]\\s*(?:(\\d{1,3})[:.]\\s*)?(\\d{1,3}))?(ff\\.?)?`,'giu');
 return [...text.matchAll(re)].flatMap(m=>{
  const book=aliases.get(m[1]!.toLowerCase().replace(/\s+/g,' '))!;
  const c=Number(m[2]),v=Number(m[3]); if(!c||!v||c>150||v>176)return [];
  return [{ref:`${book}.${c}.${v}`, ...(m[5]?{endRef:`${book}.${m[4]??c}.${m[5]}`} : {}),raw:m[0],start:m.index!,end:m.index!+m[0].length,versification:'unmapped' as const,...(m[6]?{uncertain:'Open-ended ff reference; range not expanded'}:book==='Ps'?{uncertain:'Psalm numbering not mapped between Vulgate/LXX/MT'}:{})}];
 });
}
export function normalizeBook(input:string):string {
 const key=input.trim().replace(/\.$/,'').replace(/\s+/g,' ').toLowerCase();
 const book=aliases.get(key)??aliases.get(key.replace(/^([1-3])\s*/, '$1'));
 if(!book)throw new Error(`Unknown Bible book: ${input}`);return book;
}
export interface ReferenceSelection {book:string;startChapter:number;startVerse?:number;endChapter:number;endVerse?:number;following:boolean;ref:string}
/** Navigation ranges are bounded by loaded verse keys, never guessed versification. */
export function parseReference(input:string):ReferenceSelection {
 const m=/^\s*([1-4]?\s*[A-Za-z]+(?:\s+[A-Za-z]+){0,3})\.?\s*(\d{1,3})(?:[.:]\s*(\d{1,3}))?(?:\s*[-–—]\s*(?:([1-4]?\s*[A-Za-z]+)\.?)?(\d{1,3})(?:[.:]\s*(\d{1,3}))?)?\s*(ff\.?)?\s*$/i.exec(input);
 if(!m)throw new Error(`Unsupported reference: ${input}`);
 const book=normalizeBook(m[1]!), c=Number(m[2]),v=m[3]?Number(m[3]):undefined;
 if(m[4]&&normalizeBook(m[4])!==book)throw new Error(`Cross-book navigation ranges are not supported: ${input}`);
 const ec=m[5]?(m[6]||v===undefined?Number(m[5]):c):c, ev=m[6]?Number(m[6]):m[5]&&v!==undefined?Number(m[5]):v;
 if(c<1||ec<1||c>(chapterCounts[book]??150)||ec>(chapterCounts[book]??150)||(v??1)>176||(ev??1)>176||ec<c||ec===c&&(ev??176)<(v??1))throw new Error(`Invalid reference bounds: ${input}`);
 const following=Boolean(m[7]);const ref=`${book}.${c}${v!==undefined?'.'+v:''}${m[5]?`-${ec}${ev!==undefined?'.'+ev:''}`:''}${following?'ff':''}`;
 return {book,startChapter:c,startVerse:v,endChapter:ec,endVerse:ev,following,ref};
}
export function normalizeRef(input:string):string {const r=parseReference(input);if(r.startVerse===undefined||r.ref.includes('-')||r.following)throw new Error(`Expected one verse: ${input}`);return r.ref;}
export const referenceOrder=(ref:string)=>{const [b,c,v]=ref.split('.');return books.findIndex(x=>x[0]===b)*1000000+Number(c)*1000+Number(v);};
export function selectReferences(input:string,available:Iterable<string>):string[] {
 const r=parseReference(input),lo=r.startChapter*1000+(r.startVerse??0), hi=r.endChapter*1000+(r.following||r.startVerse===undefined||r.endVerse===undefined?999:r.endVerse);
 return [...available].filter(ref=>{const [b,c,v]=ref.split('.');const n=Number(c)*1000+Number(v);return b===r.book&&n>=lo&&n<=hi;}).sort((a,b)=>referenceOrder(a)-referenceOrder(b));
}
export function referenceIncludes(r: ScriptureReference, ref: string): boolean {
 const target=normalizeRef(ref),start=referenceOrder(r.ref),end=referenceOrder(r.endRef??r.ref),n=referenceOrder(target);
 return start>=0&&n>=start&&n<=end;
}
export function referenceOverlaps(reference:ScriptureReference,input:string):boolean {
 const r=parseReference(input);const [book,c,v]=reference.ref.split('.'),[endBook,ec,ev]=(reference.endRef??reference.ref).split('.');
 return book===r.book&&endBook===r.book&&Number(c)*1000+Number(v)<=r.endChapter*1000+(r.following||r.endVerse===undefined?999:r.endVerse)&&Number(ec)*1000+Number(ev)>=r.startChapter*1000+(r.startVerse??0);
}
