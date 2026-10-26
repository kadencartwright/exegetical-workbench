import { expect,it } from 'vitest';
import { database } from './helpers';
import { d1Research } from '../src/research';
import { d1Notes } from '../src/notes';
import { createServices } from '../src/services';
import { unavailableCorpus } from '../src/corpus';
import { createMcpServer } from '../src/mcp';
it('persists dual anchors, owned links, explicit divergences and conflict-protected history',async()=>{
 const {db,sqlite}=database();try{
 const s=createServices(unavailableCorpus,d1Notes(db),d1Research(db));
 const input={anchor:{type:'source-page',id:'fixture:latin:p1'},additionalAnchors:[{type:'token',id:'fixture:1Tim.5.17:1'}],body:'Synthetic research evidence',tags:[],provenanceTag:'my-inference'};
 const a=(await s.createAgentNote('a',input)).data,b=(await s.save('a',input)).data;
 expect(a.provenanceTag).toBe('agent-generated');expect((await s.notes('a','fixture:1Tim.5.17:1')).data).toHaveLength(2);
 const link=await s.link('a',{from:a.id,to:b.id,relation:'objects-to'},true);expect(link.provenanceTag).toBe('agent-generated');
 await expect(s.link('b',{from:a.id,to:b.id})).rejects.toMatchObject({status:404});
 const inputDispute={question:'Synthetic question?',positions:[{id:'a',title:'First',premises:[a.id]},{id:'b',title:'Second',premises:[b.id]}],divergences:[{leftNote:a.id,rightNote:b.id,explanation:'Explicit human comparison'}],timeline:[{date:'1647',positionId:'a',noteId:a.id,description:'Synthetic historical attribution'}]};
 const d=await s.saveDispute('a',inputDispute);expect(d.revision).toBe(1);
 expect((await s.saveDispute('a',{...inputDispute,question:'Revised?'},d.id,1)).revision).toBe(2);
 await expect(s.saveDispute('a',inputDispute,d.id,1)).rejects.toMatchObject({status:409});
 expect(await s.disputeHistory('a',d.id)).toHaveLength(1);expect(await s.disputes('b')).toEqual([]);
 await expect(s.saveDispute('b',inputDispute)).rejects.toMatchObject({status:404});
 const promoted=await s.save('a',{...input,body:a.body},a.id);expect(promoted.data.provenanceTag).toBe('my-inference');
 }finally{sqlite.close();}
});
it('read-only MCP sessions never register write tools',async()=>{
 const s=createMcpServer(createServices(unavailableCorpus,{} as any),'owner',false);
 expect(Object.keys((s as any)._registeredTools)).not.toContain('create_note');await s.close();
});
