import type { ScriptureReference } from './models.ts';
const books = [
 ['Gen','Genesis','Gen'],['Exod','Exodus','Exod','Ex'],['Lev','Leviticus','Lev'],['Num','Numbers','Num'],['Deut','Deuteronomy','Deut'],['Josh','Joshua','Josh'],['Judg','Judges','Judg'],['Ruth','Ruth'],['1Sam','1 Samuel','1 Sam'],['2Sam','2 Samuel','2 Sam'],['1Kgs','1 Kings'],['2Kgs','2 Kings'],['1Chr','1 Chronicles'],['2Chr','2 Chronicles'],['Ezra','Ezra'],['Neh','Nehemiah'],['Esth','Esther'],['Job','Job'],['Ps','Psalms','Psalm','Ps','Psa'],['Prov','Proverbs','Prov'],['Eccl','Ecclesiastes','Eccl'],['Song','Song of Solomon','Canticles'],['Isa','Isaiah','Isa'],['Jer','Jeremiah','Jer'],['Lam','Lamentations'],['Ezek','Ezekiel'],['Dan','Daniel'],['Hos','Hosea'],['Joel','Joel'],['Amos','Amos'],['Obad','Obadiah'],['Jonah','Jonah'],['Mic','Micah'],['Nah','Nahum'],['Hab','Habakkuk'],['Zeph','Zephaniah'],['Hag','Haggai'],['Zech','Zechariah'],['Mal','Malachi'],['Matt','Matthew','Matt','Mat'],['Mark','Mark','Mk'],['Luke','Luke','Lk'],['John','John','Jn'],['Acts','Acts','Act'],['Rom','Romans','Rom'],['1Cor','1 Corinthians','1 Cor'],['2Cor','2 Corinthians','2 Cor'],['Gal','Galatians','Gal'],['Eph','Ephesians','Eph','Ephes'],['Phil','Philippians','Phil'],['Col','Colossians','Col'],['1Thess','1 Thessalonians','1 Thess'],['2Thess','2 Thessalonians','2 Thess'],['1Tim','1 Timothy','1 Tim'],['2Tim','2 Timothy','2 Tim'],['Titus','Titus'],['Phlm','Philemon'],['Heb','Hebrews','Heb'],['Jas','James','Jas'],['1Pet','1 Peter','1 Pet'],['2Pet','2 Peter','2 Pet'],['1John','1 John'],['2John','2 John'],['3John','3 John'],['Jude','Jude'],['Rev','Revelation','Rev']
];
const aliases = new Map(books.flatMap(([id,...names]) => [id,...names].map(n => [n!.toLowerCase(),id!] as const)));
const pattern = [...aliases.keys()].sort((a,b)=>b.length-a.length).map(x=>x.replace(/[.*+?^${}()|[\]\\]/g,'\\$&').replace(/ /g,'\\s+')).join('|');
/** Conservative English references. No guessed Psalm-number mapping or bare-v. context. */
export function extractReferences(text: string): ScriptureReference[] {
 const re = new RegExp(`(?<![\\p{L}\\d])(${pattern})\\.?\\s+(\\d{1,3})\\s*[:.,]\\s*(\\d{1,3})(?:\\s*[-–—]\\s*(?:(\\d{1,3})[:.]\\s*)?(\\d{1,3}))?(ff\\.?)?`,'giu');
 return [...text.matchAll(re)].flatMap(m=>{
  const book=aliases.get(m[1]!.toLowerCase().replace(/\s+/g,' '))!;
  const c=Number(m[2]),v=Number(m[3]); if(!c||!v||c>150||v>176)return [];
  return [{ref:`${book}.${c}.${v}`, ...(m[5]?{endRef:`${book}.${m[4]??c}.${m[5]}`} : {}),raw:m[0],start:m.index!,end:m.index!+m[0].length,versification:'unmapped' as const,...(m[6]?{uncertain:'Open-ended ff reference; range not expanded'}:book==='Ps'?{uncertain:'Psalm numbering not mapped between Vulgate/LXX/MT'}:{})}];
 });
}
export function normalizeRef(input: string): string { if(/^[1-3]?[A-Za-z]+\.\d+\.\d+$/.test(input))return input; const r=extractReferences(input); if(r.length!==1||r[0]!.raw!==input||r[0]!.endRef)throw new Error(`Expected one verse: ${input}`);return r[0]!.ref; }
export function referenceIncludes(r: ScriptureReference, ref: string): boolean { if(r.ref===ref)return true; if(!r.endRef)return false; const [b,c,v]=ref.split('.'),[rb,rc,rv]=r.ref.split('.'),[eb,ec,ev]=r.endRef.split('.'); return b===rb&&b===eb && (+c!*1000+ +v!) >= (+rc!*1000+ +rv!) && (+c!*1000+ +v!) <= (+ec!*1000+ +ev!); }
