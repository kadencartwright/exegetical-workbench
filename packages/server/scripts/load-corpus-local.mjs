import { DatabaseSync } from 'node:sqlite';
import { readdir } from 'node:fs/promises';
import { createReadStream } from 'node:fs';
import { createInterface } from 'node:readline';
import { fileURLToPath } from 'node:url';
import { join, resolve } from 'node:path';
// Wrangler currently reads a complete --file into a string. Stream large SQL into its local SQLite store.
// This script can only select an emulated database under this package's .wrangler directory.
const directory=fileURLToPath(new URL('../.wrangler/state/v3/d1/miniflare-D1DatabaseObject/',import.meta.url));
const input=process.argv[2]?resolve(process.argv[2]):fileURLToPath(new URL('../../../data/generated/corpus-index.sql',import.meta.url));
const candidates=[];
for(const name of await readdir(directory))if(name.endsWith('.sqlite')&&name!=='metadata.sqlite') {
 const path=join(directory,name),db=new DatabaseSync(path);
 const ready=db.prepare("SELECT count(*) AS n FROM sqlite_schema WHERE name IN ('notes','auth_sessions','corpus_records')").get().n===3;
 db.close();if(ready)candidates.push(path);
}
if(candidates.length!==1)throw new Error('Expected one migrated local workbench database. Run db:migrate:local first.');
const db=new DatabaseSync(candidates[0]);let statements=0;
try {
 db.exec('PRAGMA busy_timeout=10000; BEGIN IMMEDIATE');
 for await(const line of createInterface({input:createReadStream(input),crlfDelay:Infinity})) {
  if(!line.trim()||line.startsWith('--'))continue;
  if(!/^(?:DELETE FROM corpus_|INSERT (?:OR IGNORE )?INTO corpus_)/.test(line))throw new Error('Refusing unexpected statement in corpus index');
  db.exec(line);statements++;
  if(statements%100000===0)console.log(`Loaded ${statements} local corpus SQL statements…`);
 }
 db.exec('COMMIT; PRAGMA optimize');
 console.log(JSON.stringify({database:candidates[0],statements,counts:db.prepare('SELECT kind,count(*) AS count FROM corpus_records GROUP BY kind').all()}));
} catch(error) {if(db.isTransaction)db.exec('ROLLBACK');throw error;} finally {db.close();}
