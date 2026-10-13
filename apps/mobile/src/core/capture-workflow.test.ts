import test from 'node:test';
import assert from 'node:assert/strict';
import {mergeManualPayload} from '../features/manualFields';
import {normalizeMatchTimestamp,normalizeRebuilt,initialBreakageIssues} from './rebuilt';
import {updateLocal,shouldUpload,acknowledge} from './sync-model';
import {canEditReport} from './report-editing';
import {manualMatchMetadataSchema} from '@wildcard/shared/src/native-contracts';
import type {LocalSubmission,Viewer} from './types';
const report:LocalSubmission={entry:{id:'id',organization_id:'org',event_id:'event',team_id:'team',match_id:'match',assignment_id:null,scout_user_id:'author',entry_type:'match',form_version:4,payload:{comments:'published'},status:'submitted',submitted_at:'2026-10-13'},revision:1,acknowledgedRevision:1,status:'synced',error:null,origin:'own',baseUpdatedAt:'server-time',changedAt:'now'};
test('submitted edits persist locally but cannot publish before explicit Save changes',()=>{
 const working=updateLocal(report,{comments:'unfinished'});
 assert.equal(working.reviewRequired,true);assert.equal(working.entry.status,'submitted');assert.equal(shouldUpload(working),false);
 const approved=updateLocal(working,working.entry.payload,true);
 assert.equal(approved.reviewRequired,false);assert.equal(shouldUpload(approved),true);
 assert.equal(approved.entry.id,report.entry.id);assert.equal(approved.entry.submitted_at,report.entry.submitted_at);
 assert.equal(acknowledge(working,1,'new-time').reviewRequired,true);
});
test('new draft autosaves remain eligible for cloud backup',()=>{
 const draft={...report,entry:{...report.entry,status:'draft' as const,submitted_at:null},acknowledgedRevision:null,status:'draft' as const};
 assert.equal(shouldUpload(updateLocal(draft,{comments:'draft'})),true);
});
test('reopening a pit/pre draft preserves all fields while allowing deliberate clears',()=>{
 assert.deepEqual(mergeManualPayload({autos:'saved auto',notes:'old',legacy:{keep:true}},{notes:'new'},{}),{autos:'saved auto',notes:'new',legacy:{keep:true}});
 assert.equal(mergeManualPayload({notes:'old'},{notes:''},{}).notes,'');
});
test('comment-only edit retains legacy reliability issues and timestamp',()=>{
 const old={robot_broke:true,break_tag:'Shooter broke',break_timestamp:'1:20',comments:'old'};
 const saved=normalizeRebuilt({...old,comments:'changed'});
 assert.deepEqual(saved.breakage_issues,[{timestamp:'1:20',issue:'Shooter broke'}]);
 assert.equal(saved.break_tag,'Shooter broke');assert.equal(saved.break_timestamp,'1:20');
 assert.deepEqual(initialBreakageIssues({...old,breakage_issues:[]}),saved.breakage_issues);
});
test('blank issues do not assert intake failure and timestamps mirror website normalization',()=>{
 assert.deepEqual(normalizeRebuilt({robot_broke:true,breakage_issues:[{issue:null,timestamp:''}]}).breakage_issues,[]);
 assert.equal(normalizeMatchTimestamp('1:9'),'1:09');assert.equal(normalizeMatchTimestamp('1:99'),'1:59');assert.equal(normalizeMatchTimestamp(''),'');
});
test('website playoff labels are valid and missing numbered-stage label is not',()=>{
 for(const label of ['2–1','2-1','3','0','0001'])assert.equal(manualMatchMetadataSchema.safeParse({stage:'Semifinal',label,alliance:'red'}).success,true);
 assert.equal(manualMatchMetadataSchema.safeParse({stage:'Semifinal',label:'',alliance:'red'}).success,false);
 assert.equal(manualMatchMetadataSchema.safeParse({stage:'Other / exception',label:null,alliance:'blue'}).success,true);
});
test('raw report edit permissions match website across roles, authors and kinds',()=>{
 for(const role of ['scout','global_scout','strategist','master','admin','developer'] as const){
  const viewer:Viewer={userId:'viewer',organizationId:'org',role,displayName:'Viewer',demo:false};
  for(const kind of ['match','pit','pre_scout'] as const){
   assert.equal(canEditReport(viewer,{...report.entry,entry_type:kind}),kind==='pit'||['admin','developer'].includes(role));
   assert.equal(canEditReport(viewer,{...report.entry,entry_type:kind,scout_user_id:'viewer'}),true);
  }
 }
});
