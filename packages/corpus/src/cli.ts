import { resolve } from 'node:path';
import { access, readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { Effect } from 'effect';
import { buildCorpus,loadManifests,acquire } from './import.ts';
import { writeCorpusJson, exportCorpusStorage } from './export.ts';
import type { Corpus } from './models.ts';
const root=fileURLToPath(new URL('../../../',import.meta.url));
const [command='help',...args]=process.argv.slice(2);
function option(key:string){const i=args.indexOf(key);if(i<0)return undefined;if(!args[i+1]||args[i+1]!.startsWith('--'))throw new Error(`Missing value: ${key}`);return args[i+1];}
try {
 if(command==='build'){
  const sample=args.includes('--sample'),out=resolve(option('--out')??resolve(root,sample?'data/generated/sample-corpus.json':'data/generated/corpus.json'));
  if(!args.includes('--refresh')&&!sample){let exists=false;try{await access(out);exists=true;}catch{}if(exists){console.log(`Preserved existing corpus: ${out}. Explicit --refresh performs a new verified import.`);process.exit(0);}}
  const downloads=sample?undefined:resolve(option('--downloads')??resolve(root,'data/downloads'));
  const reception=option('--reception')??(sample?undefined:resolve(root,'../reformed-retrieval')),only=option('--only')?.split(',');
  if(sample&&out===resolve(root,'data/generated/corpus.json'))throw new Error('Sample imports cannot replace the production corpus output.');
  const corpus=await Effect.runPromise(buildCorpus(root,reception,only,downloads));
  await writeCorpusJson(corpus,out);
  const storage=args.includes('--export')?await exportCorpusStorage(corpus,resolve(option('--export-dir')??resolve(root,'data/generated/storage'))):undefined;
  console.log(JSON.stringify({out,importMode:corpus.importMode,passages:corpus.passages.length,syntax:corpus.syntax.length,lexicon:corpus.lexicon?.length,crossreferences:corpus.crossreferences?.length,sources:corpus.sources.length,pages:corpus.pages.length,citations:corpus.citations.length,storage,coverage:corpus.coverage},null,2));
 }else if(command==='export'){
  const corpus=JSON.parse(await readFile(resolve(option('--input')??resolve(root,'data/generated/corpus.json')),'utf8')) as Corpus;
  console.log(await exportCorpusStorage(corpus,resolve(option('--out')??resolve(root,'data/generated/storage'))));
 }else if(command==='acquire'){
  const id=option('--source');if(!id)throw new Error('acquire requires --source ID|all');
  const manifests=(await loadManifests(root)).filter(m=>id==='all'||m.id===id);if(!manifests.length)throw new Error(`Unknown source ${id}`);
  for(const m of manifests){await acquire(m,resolve(option('--out')??resolve(root,'data/downloads')));console.log(`Verified ${m.id} at ${m.revision}`);}
 }else if(command==='help')console.log('corpus build [--refresh] [--downloads PATH] [--reception PATH] [--export]\ncorpus build --sample [--out FILE]\ncorpus export [--input FILE] [--out DIR]\ncorpus acquire --source ID|all [--out DIR]');
 else throw new Error(`Unknown command: ${command}`);
}catch(error){console.error(String(error));process.exitCode=1;}
