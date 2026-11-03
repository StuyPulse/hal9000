import {test} from 'node:test';
import assert from 'node:assert/strict';
import {acknowledge,updateLocal,payloadEqual,scopedIdentity,failRevision,sameReport,sameManualIdentity,reusableDraft,shouldUpload,uploadableHere,toSendCount,staleAcknowledgedCopy,uploadBase} from './sync-model';
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
 const target={userId:'scout',eventId:'event',kind:'match' as const,teamId:'team',matchId:null,payload:manual};
 assert.ok(reusableDraft(local,target));
 assert.ok(!reusableDraft(local,{...target,payload:{manual_match:{...manual.manual_match,label:'19'}}}));
 assert.ok(!reusableDraft({...local,origin:'relay'},target));
 assert.ok(!reusableDraft(local,{...target,eventId:'other'}));
 assert.ok(reusableDraft(record,{...target,matchId:'match',payload:{}}));
 assert.ok(!reusableDraft({...record,entry:{...record.entry,entry_type:'pit'}},{...target,kind:'pit',matchId:'match'}));
 // An admin who claimed another scout's report starts their own scouting, not that report.
 assert.ok(!reusableDraft(record,{...target,userId:'admin',matchId:'match',payload:{}}));
 assert.ok(!reusableDraft(local,{...target,userId:'admin'}));
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

test('connection failures are told apart from server refusals',async()=>{
 const {isConnectionFailure}=await import('./sync-model');
 for(const failure of [{code:'network_error',status:0,message:'Cannot reach the mobile server.'},new TypeError('Network request failed'),{message:'The operation was aborted'},{message:'Failed to fetch'}])assert.equal(isConnectionFailure(failure),true);
 for(const failure of [{status:403,code:'forbidden',message:'Master relay access is required.'},{message:'duplicate key value violates unique constraint'},{status:409,code:'conflict',message:'Conflict: this report was changed on another device.'}])assert.equal(isConnectionFailure(failure),false);
});

test('an edit to a submitted report the cloud has not acknowledged stays a submitted revision that uploads',()=>{
 const edited=updateLocal(record,{auto:{shoot:8,ferry:10}});
 assert.equal(edited.reviewRequired,false);assert.equal(edited.entry.status,'submitted');assert.equal(edited.status,'pending');
 assert.equal(edited.revision,2);assert.ok(shouldUpload(edited));
 // A failed earlier upload is still unacknowledged.
 assert.equal(updateLocal({...record,acknowledgedRevision:null,status:'failed'},{}).reviewRequired,false);
});
test('an edit to an acknowledged submitted report still waits for Save changes',()=>{
 const published={...record,acknowledgedRevision:1,status:'synced' as const,baseUpdatedAt:'t1'};
 const working=updateLocal(published,{auto:{shoot:1,ferry:1}});
 assert.equal(working.reviewRequired,true);assert.ok(!shouldUpload(working));
 // Further working edits keep waiting, even though the acknowledged revision is now older.
 assert.equal(updateLocal(working,{auto:{shoot:2,ferry:1}}).reviewRequired,true);
 assert.equal(updateLocal(working,working.entry.payload,true).reviewRequired,false);
});
test('Auth that cannot be reached is a connection failure',async()=>{
 const {isConnectionFailure}=await import('./sync-model');
 const retryable=Object.assign(new Error('Request failed'),{name:'AuthRetryableFetchError',status:502});
 assert.equal(isConnectionFailure(retryable),true);
 assert.equal(isConnectionFailure(Object.assign(new Error('invalid JWT'),{name:'AuthApiError',status:401})),false);
});
test('to-send counts only rows this account can deliver',()=>{
 const proof={envelope:{version:1 as const,deviceId:'device',entry:record.entry,createdAt:'now'},signature:'proof'};
 const signedRelay={...record,origin:'relay' as const,status:'received' as const,proof};
 const unsignedRelay={...record,entry:{...record.entry,id:'unsigned'},origin:'relay' as const,status:'received' as const};
 const synced={...record,entry:{...record.entry,id:'synced'},acknowledgedRevision:1,status:'synced' as const};
 const working={...record,entry:{...record.entry,id:'working'},reviewRequired:true};
 const failed={...record,entry:{...record.entry,id:'failed'},status:'failed' as const};
 assert.ok(uploadableHere(signedRelay,'master'));assert.ok(!uploadableHere(signedRelay,'strategist'));assert.ok(!uploadableHere(unsignedRelay,'master'));
 assert.equal(toSendCount([record,signedRelay,unsignedRelay,synced,working,failed],'event','strategist'),2);
 assert.equal(toSendCount([record,signedRelay,unsignedRelay,synced,working,failed],'event','master'),3);
 assert.equal(toSendCount([record],'other-event','master'),0);
});
test('a fully uploaded local copy yields to a newer server version, pending work never does',()=>{
 const acked={...record,acknowledgedRevision:1,status:'synced' as const,baseUpdatedAt:'2026-10-13T00:00:00.123456+00:00'};
 const server={...record.entry,updated_at:'2026-10-13T00:05:00.000001+00:00'};
 assert.ok(staleAcknowledgedCopy(acked,server));
 assert.ok(!staleAcknowledgedCopy(acked,{...server,updated_at:acked.baseUpdatedAt}));
 assert.ok(!staleAcknowledgedCopy(acked,{...server,updated_at:'2026-10-12T23:00:00+00:00'}),'an older download never replaces a newer upload');
 assert.ok(!staleAcknowledgedCopy({...acked,revision:2},server),'unacknowledged edits stay');
 assert.ok(!staleAcknowledgedCopy({...acked,reviewRequired:true},server));
 assert.ok(!staleAcknowledgedCopy({...acked,origin:'relay'},server));
 assert.ok(!staleAcknowledgedCopy(acked,undefined));
 assert.ok(staleAcknowledgedCopy({...acked,baseUpdatedAt:null},server));
});
test('a server row relayed from this phone\'s QR export becomes the upload base',()=>{
 const exported=record.entry;
 const edited={...updateLocal(record,{auto:{shoot:9,ferry:10}}),qrShared:{revision:1,at:'now',entry:exported}};
 const relayed={...exported,updated_at:'relayed-time'};
 assert.equal(uploadBase(edited,relayed),'relayed-time');
 assert.equal(uploadBase(edited,{...relayed,payload:{auto:{shoot:1,ferry:1}}}),null,'someone else\'s change is still a conflict');
 assert.equal(uploadBase({...edited,qrShared:{revision:1,at:'now'}},relayed),null,'no exported copy, no inference');
 assert.equal(uploadBase({...edited,baseUpdatedAt:'mine'},null),'mine');
});
