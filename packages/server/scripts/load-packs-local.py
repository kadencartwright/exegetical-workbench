"""Install explicit optional packs in one local SQLite transaction. Never contacts Cloudflare."""
import argparse,json,pathlib,sqlite3,hashlib
ROOT=pathlib.Path(__file__).resolve().parents[3]
p=argparse.ArgumentParser();p.add_argument('--database',required=True);p.add_argument('--packs',default='core');p.add_argument('--reindex-only',action='store_true');a=p.parse_args();path=pathlib.Path(a.database).resolve()
if not path.is_relative_to(ROOT) or '.wrangler' not in path.parts or path.suffix!='.sqlite':raise ValueError('Only this checkout’s local Wrangler SQLite is accepted')
packs=a.packs.split(',')
if any(x not in ['core','sa','nc','private'] for x in packs):raise ValueError('Unknown pack')
db=sqlite3.connect(path);db.execute('SELECT count(*) FROM corpus_packs').fetchone()
with db:
 for pack in ([] if a.reindex_only else packs):
  f=ROOT/f'data/generated/packs/{pack}.ndjson';count=0
  if not f.is_file():raise ValueError('Build pack first: '+pack)
  db.execute('DELETE FROM corpus_packs WHERE pack=?',(pack,))
  with f.open() as stream:
   for line in stream:
    r=json.loads(line)
    if r['pack']!=pack:raise ValueError('Pack boundary mismatch')
    encoded=json.dumps(r['json'],ensure_ascii=False)
    if len(encoded.encode())>1900000:raise ValueError('D1 row size exceeded: '+r['id'])
    db.execute('INSERT INTO corpus_packs VALUES(?,?,?,?,?,?,?,?)',(pack,r['kind'],r['id'],r.get('ref'),r.get('lemma'),r.get('form'),r.get('source_id'),encoded));count+=1
  print(pack,count,flush=True)
 # Materialized lookup keys avoid scanning large JSON records on every word click.
 db.execute('DELETE FROM corpus_pack_keys')
 for field,kind in [('aliases','lexicon-alias'),('domains','lexicon-domain')]:
  db.execute("INSERT OR IGNORE INTO corpus_pack_keys SELECT p.pack,?,p.id,a.value FROM corpus_packs p,json_each(p.json,?) a WHERE p.kind='lexicon' AND a.type='text'",(kind,'$.'+field))
 db.execute('DELETE FROM corpus_pack_renderings')
 import collections
 renderings=collections.defaultdict(collections.Counter);provenance={}
 for (raw,) in db.execute("SELECT json FROM corpus_packs WHERE kind='translation'"):
  item=json.loads(raw)
  for word in item['words']:
   strong=word.get('strong','')
   if not strong:continue
   renderings[strong][word.get('english','')]+=1;provenance.setdefault(strong,item['provenance'])
 for strong,counts in renderings.items():
  item={'strong':strong,'renderings':[{'rendering':word,'count':count} for word,count in counts.most_common()],'provenance':provenance[strong]}
  db.execute('INSERT INTO corpus_pack_renderings VALUES(?,?)',(strong,json.dumps(item,ensure_ascii=False)))
 print('Indexed lexical keys and renderings:',len(renderings),flush=True)
print('Local integrity:',db.execute('PRAGMA quick_check').fetchone()[0]);db.close()
