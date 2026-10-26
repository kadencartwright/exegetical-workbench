"""Verified offline pack importer. Produces separate core/SA/NC/private NDJSON.
Never provisions infrastructure. Original transcriptions are private local inputs.
Run --audit once after reviewing sources; normal runs reject all checksum drift.
"""
import argparse,collections,csv,hashlib,json,pathlib,re,subprocess,unicodedata,zipfile,xml.etree.ElementTree as ET
ROOT=pathlib.Path(__file__).resolve().parents[3]; DOWNLOADS=ROOT/'data/downloads/milestones'; OUT=ROOT/'data/generated/packs'
SOURCES={'oshb':('morphhb','openscriptures/morphhb','CC BY 4.0 tags; public-domain WLC text','core'), 'macula-hebrew':('macula-hebrew','Clear-Bible/macula-hebrew','CC BY 4.0','core'), 'lxx':('LXX','CenterBLC/LXX','CC BY-NC-SA 4.0 upstream; MIT conversion','nc'), 'ubs':('ubs-open-license','ubsicap/ubs-open-license','CC BY-SA 4.0','sa'), 'wcf':('westminster-json','andrewhwaller/westminster-json','Public domain text; MIT digital edition','core')}
SOURCES.update({'hebrew-lexicon':('HebrewLexicon','openscriptures/HebrewLexicon','CC BY 4.0 digital edition; public-domain historical text','core'),'catechisms':('Creeds.json','NonlinearFruit/Creeds.json','Public domain Westminster texts; Unlicense digital edition','core')})
BOOKS='Gen Exod Lev Num Deut Josh Judg Ruth 1Sam 2Sam 1Kgs 2Kgs 1Chr 2Chr Ezra Neh Esth Job Ps Prov Eccl Song Isa Jer Lam Ezek Dan Hos Joel Amos Obad Jonah Mic Nah Hab Zeph Hag Zech Mal Matt Mark Luke John Acts Rom 1Cor 2Cor Gal Eph Phil Col 1Thess 2Thess 1Tim 2Tim Titus Phlm Heb Jas 1Pet 2Pet 1John 2John 3John Jude Rev'.split()
ALIASES=dict(zip('Gen Exo Lev Num Deu Jos Jdg Rut 1Sa 2Sa 1Ki 2Ki 1Ch 2Ch Ezr Neh Est Job Psa Pro Ecc Sng Isa Jer Lam Ezk Dan Hos Jol Amo Oba Jon Mic Nam Hab Zep Hag Zec Mal Mat Mrk Luk Jhn Act Rom 1Co 2Co Gal Eph Php Col 1Th 2Th 1Ti 2Ti Tit Phm Heb Jas 1Pe 2Pe 1Jn 2Jn 3Jn Jud Rev'.split(),BOOKS));ALIASES.update({x:x for x in BOOKS});ALIASES.update({'1Re':'1Sam','2Re':'2Sam','3Re':'1Kgs','4Re':'2Kgs','1Par':'1Chr','2Par':'2Chr','Cant':'Song','PsSol':'PssSol','Qoh':'Eccl','Od':'Odes','TobBA':'Tob','1Esdr':'1Esd','2Esdr':'2Esd','1Mac':'1Macc','2Mac':'2Macc','3Mac':'3Macc','4Mac':'4Macc'})
ALIASES['Psalm']='Ps'
ALIASES.update(dict(zip('SOL EZE JOE MAR JOH PHI JAM 1JO 2JO 3JO'.split(),'Song Ezek Joel Mark John Phil Jas 1John 2John 3John'.split())))
NAMES='Genesis|Exodus|Leviticus|Numbers|Deuteronomy|Joshua|Judges|Ruth|1 Samuel|2 Samuel|1 Kings|2 Kings|1 Chronicles|2 Chronicles|Ezra|Nehemiah|Esther|Job|Psalms|Proverbs|Ecclesiastes|Song of Solomon|Isaiah|Jeremiah|Lamentations|Ezekiel|Daniel|Hosea|Joel|Amos|Obadiah|Jonah|Micah|Nahum|Habakkuk|Zephaniah|Haggai|Zechariah|Malachi|Matthew|Mark|Luke|John|Acts|Romans|1 Corinthians|2 Corinthians|Galatians|Ephesians|Philippians|Colossians|1 Thessalonians|2 Thessalonians|1 Timothy|2 Timothy|Titus|Philemon|Hebrews|James|1 Peter|2 Peter|1 John|2 John|3 John|Jude|Revelation'.split('|');ALIASES.update(dict(zip(NAMES,BOOKS)))
def book(b):return ALIASES.get(b, next((v for k,v in ALIASES.items() if k.lower()==b.lower()),b))
def key(s):return ''.join(c for c in unicodedata.normalize('NFD',s.lower()) if not unicodedata.combining(c)).replace('ς','σ')
def ref(s):
 m=re.match(r'(.+?)[. ](\d+)[:.](\d+)',s)
 return f'{book(m[1])}.{int(m[2])}.{int(m[3])}' if m else s

def sha(p):return hashlib.sha256(p.read_bytes()).hexdigest()
def files():
 paths=[]
 for sid,(folder,repo,license,pack) in SOURCES.items():
  r=DOWNLOADS/folder
  if sid=='oshb':fs=list((r/'wlc').glob('*.xml'))+list(r.glob('*LICEN*'))
  elif sid=='macula-hebrew':fs=list((r/'WLC/lowfat').glob('*.xml'))+[r/'LICENSE.md']
  elif sid=='lxx':fs=[r/f'tf/1935/{n}.tf' for n in ['book','chapter','verse','word','lex_utf8','morphology','sp','gn','nu','tense','voice','mood','case']]+[r/'LICENSE']
  elif sid=='ubs':fs=[p for lang in ['greek','hebrew'] for p in (r/f'dictionaries/{lang}/XML').glob('*-en.XML')]+[r/f'dictionaries/{lang}/LICENSE.md' for lang in ['greek','hebrew']]
  elif sid=='hebrew-lexicon':fs=[r/'HebrewStrong.xml',r/'BrownDriverBriggs.xml',r/'readme.md']
  elif sid=='catechisms':fs=[r/'creeds/westminster_larger_catechism.json',r/'creeds/westminster_shorter_catechism.json',r/'README.md']
  else:fs=[r/'wcf.json',r/'LICENSE']
  paths.extend(fs)
 paths += [ROOT/'data/downloads/bsb/bsb.txt',DOWNLOADS/'bsb-tables.tsv',DOWNLOADS/'lxx-upstream-readme.md',DOWNLOADS/'eng-web_vpl.zip']
 paths += list((ROOT/'data/downloads/tvtms').glob('TVTMS - Translators*'))
 return paths

def audit():
 rows={str(p.relative_to(ROOT)):sha(p) for p in files()}
 return {'sources':{k:{'repository':repo,'revision':subprocess.check_output(['git','-C',str(DOWNLOADS/folder),'rev-parse','HEAD'],text=True).strip(),'license':lic,'pack':pack} for k,(folder,repo,lic,pack) in SOURCES.items()},'files':rows,'bsbTablesUrl':'https://bereanbible.com/bsb_tables.tsv','notes':['NC LXX excludes all BibleOL gloss/dictionary fields. CATSS antecedent retained in audit.','Macula Hebrew excludes UBS semantic-domain fields; Cherith gloss attribution follows its CC BY 4.0 notice.','Original transcriptions are private local research inputs, never part of redistributable packs.']}
MANIFEST={};WRITERS={};COUNTS=collections.Counter()
def prov(sid,locator,edition=None):
 source=MANIFEST['sources'].get(sid,{});repo=source.get('repository');revision=source.get('revision','2026-10-26-sha256')
 return dict(source=sid,edition=edition or sid,version=revision,license=source.get('license','Public domain'),locator=locator,reviewStatus='upstream',deepLink=('/study/'+locator.split(':')[1]+'?token='+locator if ':' in locator else '/study/'+locator) if sid in ['oshb','lxx','macula-hebrew'] else '/library?resource='+locator,upstreamUrl=f'https://github.com/{repo}/tree/{revision}' if repo else 'https://berean.bible/downloads.htm')
def emit(pack,kind,id,data,**columns):
 if pack not in WRITERS:return
 if 'provenance' in data:
  if kind=='lexicon':data['provenance']['deepLink']='/lexicon?lemma='+__import__('urllib.parse',fromlist=['quote']).quote(data['lemma'])
  elif kind=='confession':data['provenance']['deepLink']='/source-page?locator='+id
  elif kind in ['translation','mapping']:data['provenance']['deepLink']='/study/'+data['ref']+'?tab=library'
 if kind=='translation':
  for word in data['words']:word['provenance']['deepLink']='/study/'+data['ref']+'?tab=library'
 WRITERS[pack].write(json.dumps(dict(pack=pack,kind=kind,id=id,json=data,**columns),ensure_ascii=False)+'\n');COUNTS[(pack,kind)]+=1

def passage(pack,edition,ref_,tokens,sid,language,label):
 p=prov(sid,ref_);e=dict(id=edition,label=label,language=language,text=' '.join(t['text'] for t in tokens),tokens=tokens,provenance=p)
 emit(pack,'passage',edition+':'+ref_,dict(ref=ref_,editions=[e]),ref=ref_,source_id=sid)
 for t in tokens:emit(pack,'token',t['id'],dict(t,ref=ref_,edition=edition),ref=ref_,lemma=key(t.get('lemma','')),form=key(t['text']),source_id=sid)

def oshb():
 lex=hebrew_dictionary()
 r=DOWNLOADS/'morphhb';ns='{http://www.bibletechnologies.net/2003/OSIS/namespace}'
 for f in sorted((r/'wlc').glob('*.xml')):
  for v in ET.parse(f).getroot().iter(ns+'verse'):
   rr=v.attrib['osisID'];tokens=[]
   for i,w in enumerate(v.iter(ns+'w')):
    morph=w.get('morph','');text=''.join(w.itertext());strong=re.findall(r'\d+',w.get('lemma',''));identifier=f'oshb:{rr}:{i+1}'
    lexical=lex.get('H'+strong[-1],{}) if strong else {}
    tokens.append(dict(id=identifier,text=text.replace('/',''),lemma=lexical.get('lemma',w.get('lemma','')),gloss=lexical.get('gloss',''),transliteration=lexical.get('transliteration',''),lexicalProvenance=lexical.get('provenance'),strong='H'+strong[-1] if strong else '',morphology={'code':morph,'description':hebrew_parse(morph)},sourceId='oshb',provenance=prov('oshb',identifier),upstreamId=w.get('id')))
   passage('core','oshb',rr,tokens,'oshb','he','WLC · Open Scriptures')

def hebrew_parse(code):
 pos={'N':'noun','V':'verb','A':'adjective','P':'pronoun','R':'preposition','C':'conjunction','T':'particle','D':'adverb','S':'suffix'}
 gender={'m':'masculine','f':'feminine','c':'common gender','b':'both genders'};number={'s':'singular','p':'plural','d':'dual'};state={'a':'absolute','c':'construct','d':'determined'};person={'1':'first person','2':'second person','3':'third person'}
 stem={'q':'qal','N':'niphal','p':'piel','P':'pual','h':'hiphil','H':'hophal','t':'hithpael'};aspect={'p':'perfect','i':'imperfect','w':'sequential imperfect','q':'sequential perfect','v':'imperative','r':'active participle','s':'passive participle','a':'infinitive absolute','c':'infinitive construct','h':'cohortative','j':'jussive'}
 def segment(x):
  if not x:return ''
  values=[pos.get(x[0],x)]
  def value(mapping,i):
   if len(x)>i:values.append(mapping.get(x[i],''))
  if x[0] in 'NA':
   value({'c':'common','p':'proper','g':'gentilic','a':'qualifying','o':'ordinal'},1);value(gender,2);value(number,3);value(state,4)
  elif x[0]=='V':
   value(stem,1);value(aspect,2)
   if len(x)>2 and x[2] in 'rs':value(gender,3);value(number,4);value(state,5)
   else:value(person,3);value(gender,4);value(number,5)
  elif x[0] in 'PS':
   value({'p':'personal/pronominal','d':'demonstrative','r':'relative','i':'interrogative'},1);value(person,2);value(gender,3);value(number,4)
  elif x[0]=='T':value({'d':'definite article','o':'direct-object marker','n':'negative','r':'relative'},1)
  return '; '.join(v for v in values if v)+' ('+x+')'
 return ' / '.join(segment(x) for x in (code[1:] if code[:1] in 'HA' else code).split('/'))

def macula():
 for f in sorted((DOWNLOADS/'macula-hebrew/WLC/lowfat').glob('*.xml')):
  root=ET.parse(f).getroot();groups=collections.defaultdict(list);tokenByNode={}
  for w in root.iter('w'):
   rr=ref(w.get('ref','').split('!')[0]);a=w.attrib;identifier='macula-hebrew:'+rr+':'+a.get('{http://www.w3.org/XML/1998/namespace}id',str(len(groups[rr])))
   morphology={k:a[k] for k in ['gender','number','person','state','tense','voice','mood'] if k in a};morphology.update(code=a.get('morph',''),description='; '.join(a[k] for k in ['pos','type','stem','person','gender','number','state'] if k in a))
   t=dict(id=identifier,text=w.text or '',lemma=a.get('lemma',''),gloss=a.get('english',a.get('gloss','')),transliteration=a.get('transliteration',''),morphology=morphology,sourceId='macula-hebrew',upstreamId=a.get('{http://www.w3.org/XML/1998/namespace}id'),provenance=prov('macula-hebrew',identifier),strong='H'+re.sub(r'[^0-9]','',a.get('strongnumberx','')),greekEquivalents=a.get('greek','').split(),referents=[x for k in ['subjref','participantref'] for x in a.get(k,'').split()]);groups[rr].append(t);tokenByNode[id(w)]=t
  def tree(n,rr):
   if n.tag=='w':
    t=tokenByNode.get(id(n));return {'kind':'word','attributes':{'xml:id':t.get('upstreamId','')},'text':t['text'],'children':[]} if t and rr == t['id'].split(':')[1] else None
   children=[x for child in n if (x:=tree(child,rr))]
   return {'kind':'wg','attributes':{k:n.get(k,'') for k in ['class','role','rule']},'children':children} if children else None
  for rr,tokens in groups.items():
   passage('core','macula-hebrew',rr,tokens,'macula-hebrew','he','Macula Hebrew · morph segments')
   trees=[x for sentence in root if (x:=tree(sentence,rr))];emit('core','syntax','macula-hebrew:'+rr,dict(ref=rr,sourceId='macula-hebrew',tokens=tokens,trees=trees,provenance=prov('macula-hebrew',rr)),ref=rr)

def tf(name):
 lines=(DOWNLOADS/f'LXX/tf/1935/{name}.tf').read_text().splitlines();start=lines.index('')+1;out={};node=0
 for line in lines[start:]:
  if not line:continue
  if '\t' in line:
   left,value=line.split('\t',1)
   if '-' in left:
    a,b=map(int,left.split('-'));out.update({i:value for i in range(a,b+1)});node=b
   else:node=int(left);out[node]=value
  else:node+=1;out[node]=line
 return out

def lxx():
 fields={k:tf(k) for k in ['book','chapter','verse','word','lex_utf8','morphology','sp','gn','nu','tense','voice','mood','case']};groups=collections.defaultdict(list)
 for i,word in fields['word'].items():
  if i>623693:continue
  rr=f"{book(fields['book'][i])}.{fields['chapter'][i]}.{fields['verse'][i]}";identifier=f'lxx:{rr}:{i}';morph={k:fields[f].get(i,'') for k,f in [('gender','gn'),('number','nu'),('case','case'),('tense','tense'),('voice','voice'),('mood','mood')]};morph.update(code=fields['morphology'].get(i,''),description='; '.join(fields[f].get(i,'') for f in ['sp','case','gn','nu','tense','voice','mood'] if fields[f].get(i)))
  groups[rr].append(dict(id=identifier,text=word,lemma=fields['lex_utf8'].get(i,''),morphology=morph,sourceId='lxx',provenance=prov('lxx',identifier)))
 for rr,tokens in groups.items():passage('nc','lxx',rr,tokens,'lxx','grc','Rahlfs 1935 LXX · native numbering · NC-SA')

def ubs():
 for language in ['greek','hebrew']:
  folder=DOWNLOADS/f'ubs-open-license/dictionaries/{language}/XML';f=next(p for p in folder.glob('*Dic-v*-en.XML'))
  for _,e in ET.iterparse(f,events=['end']):
   if e.tag!='Lexicon_Entry':continue
   lemma=e.get('Lemma','');identifier='ubs-'+language+':'+e.get('Id','');senses=[];domains=[]
   for meaning in e.findall('.//LEXMeaning'):
    gloss=[x.text for x in meaning.findall('.//Gloss') if x.text];definitions=[''.join(x.itertext()) for x in meaning.findall('.//DefinitionShort') if x.text];ds=[x.get('Code') for x in meaning.findall('.//LEXDomain')+meaning.findall('.//LEXSubDomain')];domains.extend(ds);senses.append(dict(code=meaning.get('EntryCode'),glosses=gloss,definitions=definitions,domains=ds))
   strongs=[re.sub(r'^([GHA])0+(?=\d)',r'\1',x.text) for x in e.findall('./StrongCodes/Strong') if x.text];entry=dict(id=identifier,sourceId='ubs-'+language,lemma=lemma,definition='\n'.join((s['code'] or '')+' '+ '; '.join(s['definitions']) for s in senses),gloss='; '.join(g for s in senses for g in s['glosses']),senses=senses,domains=sorted(set(d for d in domains if d)),aliases=strongs,provenance=prov('ubs',identifier,'UBS '+language+' dictionary'))
   emit('sa','lexicon',identifier,entry,lemma=key(lemma),source_id='ubs-'+language);e.clear()
  for f in folder.glob('*LexicalDomains*-en.XML'):
   for d in ET.parse(f).getroot().findall('SemanticDomain'):
    code=d.findtext('Code','');emit('sa','domain','ubs-'+language+':'+code,dict(id='ubs-'+language+':'+code,code=code,label=d.findtext('.//Label',''),description=d.findtext('.//Description',''),comment=d.findtext('.//Comment',''),provenance=prov('ubs',code)),source_id='ubs-'+language)

def wcf():
 data=json.loads((DOWNLOADS/'westminster-json/wcf.json').read_text())['languages']['eng']
 for c in data['chapters']:
  for s in c.get('sections',[{'id':1,'text':c['text']}] if 'text' in c else []):
   identifier=f"WCF.{c['id']}.{s['id']}";emit('core','confession',identifier,dict(id=identifier,title=c['title'],text=s['text'],proofTexts=re.findall(r'\(([^)]+)\)',s['text']),provenance=prov('wcf',identifier)))

def translations():
 current='';rows=collections.defaultdict(list)
 with (DOWNLOADS/'bsb-tables.tsv').open() as f:
  reader=csv.reader(f,delimiter='\t');next(reader)
  for i,r in enumerate(reader):
   if len(r)<20:continue
   if r[12]:current=ref(r[12])
   if not current or not r[5].strip():continue
   # Explicitly exclude variant comparison, NA/ECM, notes and crossreference columns.
   rows[current].append(dict(id='bsb-table:'+str(i+2),english=r[18].strip(),original=r[5],transliteration=r[7],parse=r[9],strong=('H'+r[10] if r[4]=='Hebrew' else 'G'+r[11]),order=r[2],provenance=prov('bsb-tables','row:'+str(i+2))))
 for rr,words in rows.items():emit('core','translation',rr,dict(ref=rr,words=words,provenance=prov('bsb-tables',rr)),ref=rr)


def hebrew_dictionary():
 ns='{http://openscriptures.github.com/morphhb/namespace}';result={}
 for e in ET.parse(DOWNLOADS/'HebrewLexicon/HebrewStrong.xml').getroot().findall(ns+'entry'):
  w=e.find(ns+'w');identifier=e.get('id');meaning=e.find(ns+'meaning');usage=e.find(ns+'usage');definition=' '.join(''.join(x.itertext()) for x in [meaning,usage] if x is not None)
  result[identifier]=dict(id='hebrew-strong:'+identifier,sourceId='hebrew-strong',lemma=w.text or '',strong=identifier,aliases=[identifier],transliteration=w.get('xlit',''),gloss=definition,definition=definition,provenance=prov('hebrew-lexicon',identifier,'Strong Hebrew (1890)'))
 return result

def libraries():
 ns='{http://openscriptures.github.com/morphhb/namespace}'
 for e in hebrew_dictionary().values():emit('core','lexicon',e['id'],e,lemma=key(e['lemma']),source_id=e['sourceId'])
 for e in ET.parse(DOWNLOADS/'HebrewLexicon/BrownDriverBriggs.xml').getroot().iter(ns+'entry'):
  w=e.find(ns+'w');identifier='bdb:'+e.get('id','')
  if w is None:continue
  lemma=w.text or '';entry=dict(id=identifier,sourceId='bdb',lemma=lemma,definition=''.join(e.itertext()).strip(),provenance=prov('hebrew-lexicon',identifier,'Brown–Driver–Briggs (1906)'))
  emit('core','lexicon',identifier,entry,lemma=key(lemma),source_id='bdb')
 for name,prefix in [('larger','WLC'),('shorter','WSC')]:
  data=json.loads((DOWNLOADS/f'Creeds.json/creeds/westminster_{name}_catechism.json').read_text())
  for row in data['Data']:
   identifier=prefix+'.'+str(row['Number']);emit('core','confession',identifier,dict(id=identifier,title=row['Question'],text=row.get('AnswerWithProofs',row['Answer']),proofTexts=row.get('Proofs',[]),provenance=prov('catechisms',identifier)))
 webHash=sha(DOWNLOADS/'eng-web_vpl.zip')
 with zipfile.ZipFile(DOWNLOADS/'eng-web_vpl.zip') as z:
  for line in z.read('eng-web_vpl.txt').decode().splitlines():
   m=re.match(r'(\S+) (\d+):(\d+) (.*)',line)
   if not m:continue
   b=book(m[1]);
   if b not in BOOKS:continue
   rr=f'{b}.{m[2]}.{m[3]}';pr={**prov('web',rr),'version':webHash,'upstreamUrl':'https://ebible.org/eng-web/','deepLink':'/study/'+rr}
   emit('core','passage','web:'+rr,dict(ref=rr,editions=[dict(id='web',label='World English Bible Classic',language='en',text=m[4],tokens=[],provenance=pr)]),ref=rr,source_id='web')

 # BSB OT text uses the same pinned publisher file audited by the base NT importer.
 bsbHash=sha(ROOT/'data/downloads/bsb/bsb.txt')
 for line in (ROOT/'data/downloads/bsb/bsb.txt').read_text().splitlines():
  if '\t' not in line:continue
  location,text=line.split('\t',1);rr=ref(location)
  if rr.split('.')[0] not in BOOKS[:39]:continue
  pr={**prov('bsb',rr),'version':bsbHash,'deepLink':'/study/'+rr}
  emit('core','passage','bsb:'+rr,dict(ref=rr,editions=[dict(id='bsb',label='Berean Standard Bible',language='en',text=text,tokens=[],provenance=pr)]),ref=rr,source_id='bsb')

def mapping():
 path=next((ROOT/'data/downloads/tvtms').glob('TVTMS - Translators*'));header=[];mapping={}
 def expand(s):
  m=re.fullmatch(r'([1-4]?[A-Za-z]+)\.(\d+):(\d+)(?:-(\d+))?',s.strip())
  if not m:return []
  return [f'{book(m[1])}.{int(m[2])}.{i}' for i in range(int(m[3]),int(m[4] or m[3])+1)]
 for line in path.read_text().splitlines():
  cols=line.split('\t')
  if ('English KJV' in cols or 'English' in cols) and 'Hebrew' in cols and 'Greek' in cols:header=cols;continue
  if not header or not cols[0] in ['OneToOne','SubdividedVerse','RenumberedVerse','MergedVerse']:continue
  try:g=expand(cols[header.index('Greek')]);h=expand(cols[header.index('Hebrew')])
  except IndexError:continue
  if not g or not h:continue
  for i,rr in enumerate(g):mapping[rr]=sorted(set(mapping.get(rr,[])+([h[i]] if len(g)==len(h) else h)))
 for rr,hebrew in mapping.items():emit('core','mapping','lxx:'+rr,dict(ref=rr,hebrewRefs=hebrew,method='TVTMS whole-verse correspondence; no word alignment',provenance={**prov('tvtms',rr),'license':'CC BY 4.0','version':sha(path),'upstreamUrl':'https://github.com/STEPBible/STEPBible-Data/tree/be4191f0082aeedddb0eff0c02c966292b2bd641/Versification'}),ref=rr)

def main():
 global MANIFEST
 parser=argparse.ArgumentParser();parser.add_argument('--audit',action='store_true');parser.add_argument('--packs',default='core');args=parser.parse_args();path=ROOT/'data/manifests/milestone-packs.json'
 if args.audit:path.write_text(json.dumps(audit(),indent=2)+'\n');print('Pinned audited input checksums.');return
 MANIFEST=json.loads(path.read_text());
 selected=set(args.packs.split(','))
 for name,checksum in MANIFEST['files'].items():
  sid=next((sid for sid,(folder,*_) in SOURCES.items() if '/'+folder+'/' in name),None)
  pack=SOURCES[sid][3] if sid else 'nc' if name.endswith('lxx-upstream-readme.md') else 'core'
  if pack not in selected:continue
  if sha(ROOT/name)!=checksum:raise ValueError('Checksum drift: '+name)
 OUT.mkdir(parents=True,exist_ok=True)
 for pack in args.packs.split(','):
  if pack not in ['core','sa','nc']:raise ValueError('Unknown pack '+pack)
  WRITERS[pack]=(OUT/(pack+'.ndjson.tmp')).open('w')
 try:
  if 'core' in WRITERS:
   for name,fn in [('OSHB',oshb),('Macula Hebrew',macula),('WCF',wcf),('Hebrew lexicons, catechisms and WEB',libraries),('BSB tables',translations),('TVTMS',mapping)]:print(name,flush=True);fn()
  if 'sa' in WRITERS:print('UBS',flush=True);ubs()
  if 'nc' in WRITERS:print('LXX',flush=True);lxx()
  for pack in WRITERS:
   counts={kind:n for (p,kind),n in COUNTS.items() if p==pack};emit(pack,'coverage','pack:'+pack,dict(sourceId='pack:'+pack,status='loaded',scope='Explicitly installed '+pack+' pack',count=sum(counts.values()),counts=counts,limitations=['Native edition references retained. Unmapped verses must not be presumed equivalent.','NC pack: upstream NC-SA restrictions apply; private research use.'] if pack=='nc' else ['Imported annotations are not independent scholarly judgments.']))
 finally:
  for writer in WRITERS.values():writer.close()
 for pack in WRITERS:(OUT/(pack+'.ndjson.tmp')).replace(OUT/(pack+'.ndjson'))
 report={pack:{kind:n for (p,kind),n in COUNTS.items() if p==pack} for pack in WRITERS};auditPath=ROOT/'data/audits/milestone-packs.json';previous=json.loads(auditPath.read_text()) if auditPath.exists() else {};auditPath.write_text(json.dumps({**previous,**report},indent=2)+'\n');print(report)
if __name__=='__main__':main()
