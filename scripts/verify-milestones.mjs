/** Full-data local acceptance. Creates clearly labeled agent-generated example research. */
import assert from 'node:assert/strict';
import {writeFile,mkdir} from 'node:fs/promises';
import {Client} from '@modelcontextprotocol/sdk/client/index.js';
import {StreamableHTTPClientTransport} from '@modelcontextprotocol/sdk/client/streamableHttp.js';
const origin=process.env.EW_ACCEPTANCE_ORIGIN??'http://localhost:5174';
assert(['localhost','127.0.0.1','[::1]'].includes(new URL(origin).hostname),'Acceptance writes are restricted to local development');
const get=async(path)=>{const r=await fetch(origin+path);assert.equal(r.status,200,path);return r.json();};
assert.equal((await get('/api/health')).data.auth,'local-development','Refusing writes to a non-development session');
const client=new Client({name:'milestone-acceptance',version:'1'});await client.connect(new StreamableHTTPClientTransport(new URL('/mcp',origin)));
const call=async(name,args={})=>{const result=await client.callTool({name,arguments:args});assert(!result.isError,JSON.stringify(result));return JSON.parse(result.content[0].text);};
const report={date:new Date().toISOString(),deployment:false,milestones:{}};
try{
 const p=(await call('get_passage',{ref:'Matt.28.19'})).data;
 const autous=p.editions.find(e=>e.id==='sblgnt').tokens.find(t=>t.text.normalize('NFD').replace(/\p{M}/gu,'')==='αυτους');
 const token=(await call('get_token',{id:autous.id})).data;
 assert(token.grammar.length>0);assert(token.analyses.length>0);
 assert((await call('citations_of',{ref:'Matt.28.19'})).data.length>=14);
 report.milestones.M1={autous:autous.id,grammar:token.grammar.length,citations:(await call('citations_of',{ref:'Matt.28.19'})).data.length};
 const citations=(await call('citations_of',{ref:'1Tim.5.17'})).data;
 const beza=citations.find(c=>c.sourceId.includes('beza-de-vera'));assert(beza);
 const page=(await call('get_source_page',{locator:beza.locator})).data;
 assert.match(page.text,/Let elders who rule well/);assert.match(page.original.text,/Qui bene pr[æa]e?sunt|Qui bene praesunt/i);
 const presbyter=(await call('get_passage',{ref:'1Tim.5.17'})).data.editions.find(e=>e.id==='sblgnt').tokens.find(t=>t.lemma==='πρεσβύτερος');assert(presbyter);
 const locator=p=>Object.fromEntries(['source','edition','version','license','locator','reviewStatus','deepLink'].filter(k=>p[k]!==undefined).map(k=>[k,p[k]]));
 const newNote=async(body,anchor,extra={})=>(await call('create_note',{input:{body,anchor,tags:['milestone-acceptance','agent-example'],provenanceTag:'my-inference',...extra}})).data;
 const quote=await newNote(page.text,{type:'source-page',id:page.id},{additionalAnchors:[{type:'token',id:presbyter.id}],sourceLocator:locator(page.provenance)});
 assert.equal(quote.provenanceTag,'agent-generated');assert((await call('search_notes',{anchor:presbyter.id})).data.some(n=>n.id===quote.id));
 report.milestones.M2={page:page.id,original:page.original.locator,dualAnchorNote:quote.id,reviewStatus:quote.sourceLocator.reviewStatus};
 const counts={};
 for(const lemma of ['ψαλμός','ὕμνος','ᾠδή']){
  const lxx=(await call('concordance',{lemma,edition:'lxx',limit:'1000'})).data;assert.equal(lxx.length,{'ψαλμός':92,'ὕμνος':33,'ᾠδή':88}[lemma]);
  const both=(await call('concordance',{lemma,edition:'sblgnt,lxx',limit:'1000'})).data;assert(both.length>lxx.length);
  let withHebrew=0,verifiedGroups=0,candidateGroups=0,unmapped=[];
  for(const ref of new Set(lxx.map(x=>x.ref))){const parallel=(await call('hebrew_parallel',{ref})).data;if(parallel.hebrew.length){withHebrew++;if(parallel.mapping?.status==='candidate')candidateGroups++;else verifiedGroups++;}else unmapped.push(ref);}
  counts[lemma]={lxxTokens:lxx.length,combinedTokens:both.length,verseGroupsWithHebrew:withHebrew,importedMappingGroups:verifiedGroups,candidateComparisonGroups:candidateGroups,withoutHebrew:unmapped};
 }
 const conf=(await call('confessions',{id:'WCF.21.5'})).data[0];assert.match(conf.text,/singing of psalms/i);assert(conf.proofTexts.length);
 const lex=(await call('lexicon_lookup',{lemma:'ψαλμός'})).data;const ubs=lex.find(x=>x.sourceId==='ubs-greek');assert(ubs?.domains.length);
 assert((await call('semantic_domain',{id:ubs.domains[0]})).data.entries.length);
 const heb=(await call('get_passage',{ref:'Ps.3.1',editions:'oshb,macula-hebrew'})).data;assert.equal(heb.editions.length,2);
 assert((await call('get_syntax',{ref:'Ps.3.1'})).data.length);
 assert((await call('translation_alignment',{ref:'Psalm 3:1'})).data.words.length>0);
 assert((await call('translation_renderings',{strong:'G05568'})).data.renderings.length>0);
 assert((await call('lexicon_lookup',{lemma:'G5568'})).data.some(e=>e.sourceId==='ubs-greek'));
 assert((await call('get_token',{id:'oshb:Ps.3.1:1'})).data.gloss.length>0);
 report.milestones.M3={counts,confession:conf.id,proofTexts:conf.proofTexts,hebrewEditions:heb.editions.map(e=>e.id)};
 const shared=await newNote('Example evidence: WCF 21.5 names singing of psalms as worship. This shared text alone does not establish the disputed exclusivity premise.',{type:'source-page',id:'WCF.21.5'},{sourceLocator:locator(conf.provenance)});
 const left=await newNote('Example exclusive-psalmody premise, requiring defense: the song terms in Ephesians 5:19 designate inspired Psalter material and provide no warrant for newly composed congregational songs.',{type:'verse-range',id:'Eph.5.19'});
 const right=await newNote('Example alternative premise, requiring defense: the song terms in Ephesians 5:19 permit scripturally faithful compositions beyond the canonical Psalter; their LXX use alone does not impose a closed repertoire.',{type:'verse-range',id:'Eph.5.19'});
 const link=(await call('link_notes',{input:{from:left.id,to:right.id,relation:'objects-to'}})).data;assert.equal(link.provenanceTag,'agent-generated');
 const dispute=(await call('create_dispute',{input:{question:'Example for review: exclusive psalmody or scripturally faithful uninspired hymns?',positions:[{id:'exclusive',title:'Exclusive psalmody',premises:[shared.id,left.id]},{id:'hymns',title:'Uninspired hymns permitted',premises:[shared.id,right.id]}],divergences:[{leftNote:left.id,rightNote:right.id,explanation:'The disputed premise is whether the apostolic song vocabulary restricts the repertoire to inspired Psalter texts. The lexical data must be interpreted; it does not by itself decide that normative claim.'}],timeline:[{date:'1647',positionId:'exclusive',noteId:shared.id,description:'Shared historical evidence: Westminster Confession 21.5, also cited by the alternative. This annotation does not establish that the Assembly settled the modern dispute.'}]}})).data;
 assert.equal(dispute.provenanceTag,'agent-generated');assert.equal((await get('/api/disputes/'+dispute.id)).data[0].divergences.length,1);
 assert((await call('disputes',{id:dispute.id})).data[0].positions.length===2);
 const exportText=await (await fetch(origin+'/api/research/export')).text();assert(exportText.includes(dispute.question)&&exportText.includes(quote.id));
 report.milestones.M4={dispute:dispute.id,positions:2,divergences:1,timelineWitnesses:1,provenance:dispute.provenanceTag};
 await mkdir('data/audits',{recursive:true});await writeFile('data/audits/milestones-local.json',JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report,null,2));
}finally{await client.close();}
