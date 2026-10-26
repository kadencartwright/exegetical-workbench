import { Context, Effect } from 'effect';
import { disputeInputSchema, noteLinkSchema, type Dispute, type NoteLink } from '@exegetical/shared';
import { ServiceError } from './errors';
import { d1Notes } from './notes';
export interface ResearchRepository {
 links(owner:string,note?:string):Promise<NoteLink[]>;
 link(owner:string,input:unknown,agent?:boolean):Promise<NoteLink>;
 disputes(owner:string,id?:string):Promise<Dispute[]>;
 saveDispute(owner:string,input:unknown,id?:string,revision?:number,agent?:boolean):Promise<Dispute>;
 history(owner:string,id:string):Promise<unknown[]>;
}
export class ResearchStore extends Context.Tag('ResearchStore')<ResearchStore,ResearchRepository>() {}
export const researchOperation = <A>(fn:(store:ResearchRepository)=>Promise<A>) => Effect.gen(function*(){const store=yield* ResearchStore;return yield* Effect.tryPromise({try:()=>fn(store),catch:e=>e instanceof ServiceError?e:new ServiceError(503,'research-unavailable','Research storage is unavailable.')});});
export const unavailableResearch:ResearchRepository = {links:async()=>[],disputes:async()=>[],history:async()=>[],link:async()=>{throw new ServiceError(503,'research-unavailable','Research storage not configured.');},saveDispute:async()=>{throw new ServiceError(503,'research-unavailable','Research storage not configured.');}};
export function d1Research(db:D1Database):ResearchRepository {
 const notes=d1Notes(db);
 const checkNotes=async(owner:string,ids:string[])=>{for(const id of new Set(ids))if(!await notes.get(owner,id))throw new ServiceError(404,'note-not-found','An evidence note is not owned by this user or does not exist.');};
 const decode=(r:any):Dispute=>({...JSON.parse(r.body),id:r.id,revision:r.revision,createdAt:r.created_at,updatedAt:r.updated_at,provenanceTag:r.provenance_tag});
 const repository:ResearchRepository={
  async links(owner,note){const rows=await db.prepare('SELECT * FROM note_links WHERE owner_id=?'+(note?' AND (from_id=? OR to_id=?)':'')+' ORDER BY created_at,id').bind(owner,...(note?[note,note]:[])).all<any>();return rows.results.map(r=>({id:r.id,from:r.from_id,to:r.to_id,relation:r.relation,provenanceTag:r.provenance_tag,createdAt:r.created_at}));},
  async link(owner,input,agent=false){const result=noteLinkSchema.safeParse(input);if(!result.success)throw new ServiceError(400,'invalid-link',result.error.message);const d=result.data;await checkNotes(owner,[d.from,d.to]);const n:NoteLink={...d,id:crypto.randomUUID(),createdAt:new Date().toISOString(),provenanceTag:agent?'agent-generated':'my-inference'};await db.prepare('INSERT OR IGNORE INTO note_links VALUES(?,?,?,?,?,?,?)').bind(n.id,owner,n.from,n.to,n.relation,n.provenanceTag,n.createdAt).run();return (await repository.links(owner,d.from)).find(x=>x.from===d.from&&x.to===d.to&&x.relation===d.relation)!;},
  async disputes(owner,id){return (await db.prepare('SELECT * FROM disputes WHERE owner_id=?'+(id?' AND id=?':'')+' ORDER BY updated_at DESC,id').bind(owner,...(id?[id]:[])).all()).results.map(decode);},
  async saveDispute(owner,input,id,revision,agent=false){const result=disputeInputSchema.safeParse(input);if(!result.success)throw new ServiceError(400,'invalid-dispute',result.error.message);const d=result.data;await checkNotes(owner,[...d.positions.flatMap(p=>p.premises),...d.timeline.map(t=>t.noteId)]);const now=new Date().toISOString(),key=id??crypto.randomUUID(),tag=agent?'agent-generated':'my-inference';
   if(id){if(!Number.isInteger(revision)||revision!<1)throw new ServiceError(400,'revision-required','Supply the revision being edited.');const r=await db.prepare('UPDATE disputes SET body=?,revision=revision+1,updated_at=?,provenance_tag=? WHERE owner_id=? AND id=? AND revision=?').bind(JSON.stringify(d),now,tag,owner,id,revision!).run();if(!r.meta.changes)throw new ServiceError(409,'revision-conflict','The dispute changed or is unavailable. Reload before editing.');}
   else await db.prepare('INSERT INTO disputes VALUES(?,?,?,1,?,?,?)').bind(key,owner,JSON.stringify(d),now,now,tag).run();
   return (await repository.disputes(owner,key))[0]!;
  },
  async history(owner,id){if(!(await repository.disputes(owner,id)).length)throw new ServiceError(404,'not-found','Dispute not found.');return (await db.prepare('SELECT revision,body,changed_at,provenance_tag FROM dispute_history WHERE dispute_id=? ORDER BY revision').bind(id).all<any>()).results.map(r=>({...r,disputeId:id,body:JSON.parse(r.body),provenanceTag:r.provenance_tag}));},
 };return repository;
}
export function researchEnvelope(data:any){
 const items=Array.isArray(data)?data:[data];
 return {data,coverage:[{source:'private-research',status:'loaded',limitations:['Relations, historical attributions and divergence annotations are user or agent judgments.']}],provenance:items.filter(Boolean).map((x:any)=>({source:'private-research',edition:'personal research',version:x.updatedAt??x.createdAt??String(x.revision??''),license:'private',locator:x.id??'revision:'+x.revision,reviewStatus:x.provenanceTag??'unreviewed',deepLink:x.question||x.disputeId?'/disputes/'+encodeURIComponent(x.id??x.disputeId):'/notes/'+encodeURIComponent(x.from??x.id??'')}))};
}
