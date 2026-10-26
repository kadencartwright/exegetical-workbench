"""Acquire pinned optional-pack inputs, then verify every audited checksum.
Explicit --packs core,sa,nc controls download; private originals require a separate checkout.
No upstream scripts are executed, and no cloud resources are provisioned.
"""
import argparse,hashlib,json,pathlib,runpy,subprocess,urllib.parse,urllib.request
MODULE=runpy.run_path(str(pathlib.Path(__file__).with_name('milestone-packs.py')))
ROOT=MODULE['ROOT'];DOWNLOADS=MODULE['DOWNLOADS'];manifest=json.loads((ROOT/'data/manifests/milestone-packs.json').read_text())
parser=argparse.ArgumentParser();parser.add_argument('--packs',default='core');args=parser.parse_args();packs=set(args.packs.split(','))
if not packs<=set(['core','sa','nc']):raise ValueError('Expected core,sa,nc')
DOWNLOADS.mkdir(parents=True,exist_ok=True)
for sid,source in manifest['sources'].items():
 if source['pack'] not in packs:continue
 folder=MODULE['SOURCES'][sid][0];dest=DOWNLOADS/folder
 if not dest.exists():subprocess.run(['git','clone','--filter=blob:none','--no-checkout','https://github.com/'+source['repository']+'.git',str(dest)],check=True)
 subprocess.run(['git','-C',str(dest),'fetch','--depth=1','origin',source['revision']],check=True)
 subprocess.run(['git','-C',str(dest),'checkout','--detach',source['revision']],check=True)
urls={'bsb.txt':('core','https://bereanbible.com/bsb.txt'),'bsb-tables.tsv':('core','https://bereanbible.com/bsb_tables.tsv'),'eng-web_vpl.zip':('core','https://ebible.org/Scriptures/eng-web_vpl.zip'),'lxx-upstream-readme.md':('nc','https://raw.githubusercontent.com/eliranwong/LXX-Rahlfs-1935/master/README.md')}
for name,checksum in manifest['files'].items():
 path=ROOT/name;folder=path.parent.name
 selected=False;url=None
 if path.name in urls:
  pack,url=urls[path.name];selected=pack in packs
 elif folder=='tvtms':
  selected='core' in packs;url='https://raw.githubusercontent.com/STEPBible/STEPBible-Data/be4191f0082aeedddb0eff0c02c966292b2bd641/Versification/'+urllib.parse.quote(path.name)
 else:selected=any(s['pack'] in packs and '/'+MODULE['SOURCES'][sid][0]+'/' in name for sid,s in manifest['sources'].items())
 if not selected:continue
 if not path.exists() and url:
  path.parent.mkdir(parents=True,exist_ok=True);tmp=path.with_suffix(path.suffix+'.download')
  request=urllib.request.Request(url,headers={'User-Agent':'Mozilla/5.0 (Exegetical Workbench source acquisition)'})
  with urllib.request.urlopen(request,timeout=120) as response,tmp.open('wb') as output:
   while chunk:=response.read(1024*1024):output.write(chunk)
  if hashlib.sha256(tmp.read_bytes()).hexdigest()!=checksum:tmp.unlink();raise ValueError('Upstream changed; audit required: '+name)
  tmp.replace(path)
 if hashlib.sha256(path.read_bytes()).hexdigest()!=checksum:raise ValueError('Checksum mismatch: '+name)
print('Verified selected source files:',','.join(sorted(packs)))
