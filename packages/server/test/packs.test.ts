import {expect,it} from 'vitest';
import {database} from './helpers';
import {withPacks} from '../src/packs';
import {unavailableCorpus} from '../src/corpus';
const provenance={source:'synthetic',edition:'fixture',version:'1',license:'CC0',locator:'Ps.3.1',reviewStatus:'fixture',deepLink:'/study/Ps.3.1',upstreamUrl:'https://example.test'};
it('keeps explicit packs separate and combines lemma occurrences without losing editions or provenance',async()=>{
 const {sqlite,db}=database();try{
 const insert=(pack:string,kind:string,id:string,ref:string,lemma:string,data:unknown)=>sqlite.prepare('INSERT INTO corpus_packs VALUES(?,?,?,?,?,?,?,?)').run(pack,kind,id,ref,lemma,'','synthetic',JSON.stringify(data));
 const t={id:'lxx:Ps.3.1:1',ref:'Ps.3.1',edition:'lxx',text:'ψαλμός',lemma:'ψαλμός',sourceId:'lxx',provenance};
 insert('nc','token',t.id,t.ref,'ψαλμοσ',t);
 insert('nc','passage','lxx:Ps.3.1',t.ref,'',{ref:t.ref,editions:[{id:'lxx',label:'LXX',language:'grc',text:t.text,tokens:[t],provenance}]});
 insert('core','passage','oshb:Ps.3.1',t.ref,'',{ref:t.ref,editions:[{id:'oshb',text:'מזמור',tokens:[],provenance}]});
 insert('core','mapping','lxx:Ps.3.1',t.ref,'',{ref:t.ref,hebrewRefs:[t.ref],method:'fixture mapping',provenance});
 insert('sa','lexicon','ubs:fixture','','ψαλμοσ',{id:'ubs:fixture',lemma:'ψαλμός',domains:['033'],definition:'fixture',provenance});
 insert('sa','domain','ubs:033','','',{id:'ubs:033',code:'033',label:'fixture',provenance});
 sqlite.prepare('INSERT INTO corpus_pack_keys VALUES(?,?,?,?)').run('sa','lexicon-domain','ubs:fixture','033');
 const base={query:(op:any)=>({data:op==='concordance'?[]:op==='passage'?{ref:t.ref,editions:[]}:[],coverage:[],provenance:[]})};const a=withPacks(db,base);
 expect((await a.query('passage',{ref:t.ref})).data).toMatchObject({editions:expect.arrayContaining([expect.objectContaining({id:'oshb'}),expect.objectContaining({id:'lxx'})])});
 expect((await a.query('distribution',{lemma:'ψαλμός',edition:'lxx'})).data).toMatchObject({total:1});
 expect((await a.query('semantic_domain',{id:'ubs:033'})).data).toMatchObject({entries:[expect.objectContaining({lemma:'ψαλμός'})]});
 expect((await a.query('parallel',{ref:t.ref})).data).toMatchObject({hebrew:[expect.objectContaining({id:'oshb'})]});
 expect((await a.query('token',{id:t.id})).provenance.length).toBeGreaterThan(0);
 }finally{sqlite.close();}
});
