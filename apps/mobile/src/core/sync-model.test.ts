import {test} from 'node:test';
import assert from 'node:assert/strict';
import {acknowledge,updateLocal,payloadEqual,scopedIdentity,failRevision,sameReport,sameManualIdentity,reusableDraft,shouldUpload} from './sync-model';
import type {LocalSubmission} from './types';
const record:LocalSubmission={entry:{id:'permanent-id',organization_id:'org',event_id:'event',team_id:'team',match_id:'match',assignment_id:null,scout_user_id:'scout',entry_type:'match',form_version:4,payload:{auto:{shoot:7,ferry:10}},status:'submitted',submitted_at:'2026-10-12'},revision:1,acknowledgedRevision:null,status:'pending',error:null,origin:'own',baseUpdatedAt:null,changedAt:'2026-10-12'};
test('acknowledgment of an older queued snapshot cannot mark a newer edit synced',()=>{const edited=updateLocal(record,{auto:{shoot:9,ferry:10}});const acknowledged=acknowledge(edited,1,'server-time');assert.equal(acknowledged.status,'pending');assert.equal(acknowledged.revision,2);assert.deepEqual(acknowledged.entry.payload,edited.entry.payload)});
test('matching revision is acknowledged and permanent ID is retained',()=>{const done=acknowledge(record,1,'server-time');assert.equal(done.status,'synced');assert.equal(done.entry.id,'permanent-id');assert.equal(done.baseUpdatedAt,'server-time')});
test('equal payloads compare independent of JSON key order',()=>{assert.ok(payloadEqual({a:1,b:[2,3]},{b:[2,3],a:1}));assert.ok(!payloadEqual({a:1},{a:2}))});
test('demo, live users and organizations have separate storage namespaces',()=>{assert.notEqual(scopedIdentity('user','org',true),scopedIdentity('user','org'));assert.notEqual(scopedIdentity('user','org'),scopedIdentity('other','org'));assert.notEqual(scopedIdentity('user','org'),scopedIdentity('user','other'))});
test('a failed older upload cannot overwrite or mark a newer edit failed',()=>{const edited=updateLocal(record,{auto:{shoot:99,ferry:1}});assert.equal(failRevision(edited,1,'offline'),edited);assert.equal(failRevision(record,1,'offline').status,'failed')});
test('server acknowledgment compares report kind and assignment identity',()=>{assert.ok(sameReport(record.entry,{...record.entry}));assert.ok(!sameReport(record.entry,{...record.entry,entry_type:'pit'}));assert.ok(!sameReport(record.entry,{...record.entry,assignment_id:'different'}))});
const manual={report_source:'manual',manual_match:{stage:'Qualification',label:'18',alliance:'red'}};
test('manual identity includes stage, label and alliance and requires valid metadata',()=>{
 assert.ok(sameManualIdentity(manual,{...manual,comments:'new'}));
 for(const patch of [{stage:'Practice'},{label:'19'},{alliance:'blue'}])assert.ok(!sameManualIdentity(manual,{manual_match:{...manual.manual_match,...patch}}));
 assert.ok(!sameManualIdentity({},{}));assert.ok(!sameManualIdentity({manual_match:{stage:'Qualification',label:'18'}},manual));
});
test('draft lookup distinguishes separate manual matches while preserving scheduled permanent IDs',()=>{
 const local={...record,entry:{...record.entry,match_id:null,payload:manual}};
 const target={eventId:'event',kind:'match' as const,teamId:'team',matchId:null,payload:manual};
 assert.ok(reusableDraft(local,target));
 assert.ok(!reusableDraft(local,{...target,payload:{manual_match:{...manual.manual_match,label:'19'}}}));
 assert.ok(!reusableDraft({...local,origin:'relay'},target));
 assert.ok(!reusableDraft(local,{...target,eventId:'other'}));
 assert.ok(reusableDraft(record,{...target,matchId:'match',payload:{}}));
 assert.ok(!reusableDraft({...record,entry:{...record.entry,entry_type:'pit'}},{...target,kind:'pit',matchId:'match'}));
});
test('queue uploads changed own drafts and submissions, but only signed submitted receipts',()=>{
 const draft={...record,entry:{...record.entry,status:'draft' as const,submitted_at:null},status:'draft' as const};
 assert.ok(shouldUpload(draft));assert.ok(shouldUpload(record));
 assert.ok(!shouldUpload({...draft,acknowledgedRevision:draft.revision,status:'synced'}));
 assert.ok(!shouldUpload({...record,origin:'relay',status:'received'}));
 const proof={envelope:{version:1 as const,deviceId:'device',entry:record.entry,createdAt:'now'},signature:'proof'};
 assert.ok(shouldUpload({...record,origin:'relay',proof,status:'received'}));
 assert.ok(!shouldUpload({...draft,origin:'relay',proof}));
});
test('server linking of submitted manual reports is idempotent only with preserved full identity',()=>{
 const original={...record.entry,match_id:null,payload:{...record.entry.payload,...manual}};
 const linked={...original,match_id:'server-linked-match'};
 assert.ok(sameReport(original,linked));assert.ok(!sameReport(linked,original));
 assert.ok(!sameReport({...original,status:'draft'}, {...linked,status:'draft'}));
 assert.ok(!sameReport(original,{...linked,scout_user_id:'other'}));
 assert.ok(!sameReport(original,{...linked,payload:{...linked.payload,manual_match:{...manual.manual_match,alliance:'blue'}}}));
 assert.ok(!sameReport({...original,payload:{...original.payload,report_source:'scheduled'}},{...linked,payload:{...linked.payload,report_source:'scheduled'}}));
});
test('an older uploaded draft cannot mark a newer autosave synchronized',()=>{
 const draft={...record,entry:{...record.entry,status:'draft' as const,submitted_at:null},status:'draft' as const};
 const edited=updateLocal(draft,{comments:'next'});
 assert.equal(acknowledge(edited,1,'server-time').status,'draft');
 assert.equal(acknowledge(edited,edited.revision,'server-time').status,'synced');
});
