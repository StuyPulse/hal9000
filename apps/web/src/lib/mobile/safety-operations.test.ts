import test from 'node:test';
import assert from 'node:assert/strict';
import {submitSafetyReport,resolveSafetyReport,listSafetyReports} from './safety-operations';
import {MobileError,type Actor,type MobileDatabase} from './operations';
const id=(n:number)=>`00000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
const actor:Actor={userId:id(1),organizationId:id(2),role:'scout'};
const input={id:id(3),eventId:id(4),targetKind:'report',targetId:id(5),reason:'privacy',details:'Privacy concern'};
const row={id:input.id,organization_id:actor.organizationId,event_id:input.eventId,reporter_id:actor.userId,target_kind:input.targetKind,target_id:input.targetId,reason:input.reason,details:input.details,status:'open'};
function fake(results:Record<string,any[]>){
 const writes:any[]=[],reads:any[]=[];
 const db:MobileDatabase={auth:{getUser:async()=>({})},from(table){let action='read',value:unknown;const filters:any[]=[];const exec=()=>{(action==='read'?reads:writes).push({table,action,value,filters});return Promise.resolve(results[table]?.shift()??{data:null})};const q:any={select:()=>q,eq:(k:string,v:unknown)=>{filters.push([k,v]);return q},order:()=>q,range:()=>q,insert:(v:unknown)=>{action='insert';value=v;return q},update:(v:unknown)=>{action='update';value=v;return q},maybeSingle:exec,then:(r:any,e:any)=>exec().then(r,e)};return q}};
 return {db,writes,reads};
}
test('cross-organization targets cannot be reported and create no rows',async()=>{
 const {db,writes,reads}=fake({events:[{data:{id:input.eventId}}],scouting_entries:[{data:null}]});
 await assert.rejects(submitSafetyReport(db,actor,input),(e:any)=>e instanceof MobileError&&e.status===404);
 assert.equal(writes.length,0);assert.ok(reads.find(r=>r.table==='scouting_entries').filters.some(([k,v]:any[])=>k==='organization_id'&&v===actor.organizationId));
});
test('exact retries are acknowledged even after content removal; mismatches fail',async()=>{
 const {db,reads}=fake({content_reports:[{data:{...row,status:'action_taken'}}]});
 assert.deepEqual(await submitSafetyReport(db,actor,input),{id:input.id,status:'action_taken'});assert.equal(reads.length,1);
 for(const patch of [{reporter_id:id(9)},{organization_id:id(9)},{details:'different'}]){
  await assert.rejects(submitSafetyReport(fake({content_reports:[{data:{...row,...patch}}]}).db,actor,input),MobileError);
 }
});
test('request cannot supply a reporter, organization or resolution',async()=>{
 for(const field of ['reporter_id','organization_id','status'])await assert.rejects(submitSafetyReport(fake({}).db,actor,{...input,[field]:'forged'}));
});
test('only organization managers resolve reports with compare-and-swap',async()=>{
 await assert.rejects(resolveSafetyReport(fake({}).db,actor,{id:input.id,status:'dismissed',resolution:'Reviewed'}),(e:any)=>e.status===403);
 const {db,writes}=fake({content_reports:[{data:{id:input.id,status:'dismissed'}}]});
 await resolveSafetyReport(db,{...actor,role:'admin'},{id:input.id,status:'dismissed',resolution:'Reviewed'});
 assert.ok(writes[0].filters.some(([k,v]:any[])=>k==='status'&&v==='open'));
 assert.ok(writes[0].filters.some(([k,v]:any[])=>k==='organization_id'&&v===actor.organizationId));
 assert.equal(writes[0].value.reviewed_by,actor.userId);
});
test('scouts list only their own reports, and pagination is bounded',async()=>{
 const {db,reads}=fake({content_reports:[{data:[]}]});await listSafetyReports(db,actor);
 assert.ok(reads[0].filters.some(([k,v]:any[])=>k==='reporter_id'&&v===actor.userId));
 await assert.rejects(listSafetyReports(db,actor,-1));await assert.rejects(listSafetyReports(db,actor,NaN));
});
test('resource limits return a retryable response without losing the request',async()=>{
 const {db}=fake({content_reports:[{data:null},{data:null,error:{code:'23514',message:'Safety report rate limit'}},{data:null}],events:[{data:{id:input.eventId}}],scouting_entries:[{data:{id:input.targetId}}]});
 await assert.rejects(submitSafetyReport(db,actor,input),(e:any)=>e.status===429&&e.code==='safety_rate_limit');
});
