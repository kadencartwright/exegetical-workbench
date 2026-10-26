import { resolve } from 'node:path';
import { mkdir,writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { Effect } from 'effect';
import { buildCorpus,loadManifests,acquire } from './import.ts';
const root=fileURLToPath(new URL('../../../',import.meta.url));
const [command='help',...args]=process.argv.slice(2);
function option(key:string){const i=args.indexOf(key);if(i<0)return undefined;if(!args[i+1]||args[i+1]!.startsWith('--'))throw new Error(`Missing value: ${key}`);return args[i+1];}
try {
 if(command==='build'){
  const reception=option('--reception'),only=option('--only')?.split(',');
  const corpus=await Effect.runPromise(buildCorpus(root,reception,only,option('--downloads')));
  const out=resolve(option('--out')??resolve(root,'data/generated/corpus.json'));await mkdir(resolve(out,'..'),{recursive:true});await writeFile(out,JSON.stringify(corpus,null,2)+'\n');
  console.log(JSON.stringify({out,passages:corpus.passages.length,sources:corpus.sources.length,pages:corpus.pages.length,citations:corpus.citations.length,coverage:corpus.coverage},null,2));
 }else if(command==='acquire'){
  const id=option('--source');if(!id)throw new Error('acquire requires --source sblgnt|bsb|macula');
  const m=(await loadManifests(root)).find(m=>m.id===id);if(!m)throw new Error(`Unknown source ${id}`);
  await acquire(m,resolve(option('--out')??resolve(root,'data/downloads')));console.log(`Verified ${id} at ${m.revision}`);
 }else if(command==='help')console.log('corpus build [--reception PATH] [--only comma-separated-eligible-paths] [--out FILE]\ncorpus acquire --source sblgnt|bsb|macula [--out DIR]');
 else throw new Error(`Unknown command: ${command}`);
}catch(error){console.error(String(error));process.exitCode=1;}
