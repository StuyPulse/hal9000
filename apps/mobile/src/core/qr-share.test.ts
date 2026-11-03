import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {FountainDecoder,parseFrame} from '@wildcard/shared/src/fountain-qr';
import {decodeReportBatch} from '@wildcard/shared/src/qr-batch';
import {deliveryState,prepareQrTransfer,qrCandidates} from './qr-share';
import {canReceiveQr,canUploadRelay,relayReceiptAction,scheduleWarning} from './relay-receipt';
import type {LocalSubmission,NativeEntry,Viewer} from './types';

const org=randomUUID(),event=randomUUID(),team=randomUUID(),scout=randomUUID();
const entry=(over:Partial<NativeEntry>={}):NativeEntry=>({id:randomUUID(),organization_id:org,event_id:event,team_id:team,match_id:null,assignment_id:null,scout_user_id:scout,entry_type:'pit',form_version:2,payload:{comments:'x'},status:'submitted',submitted_at:'2026-11-02T15:00:00.000Z',...over});
const local=(over:Partial<LocalSubmission>={}):LocalSubmission=>({entry:entry(),revision:1,acknowledgedRevision:null,status:'pending',error:null,origin:'own',baseUpdatedAt:null,changedAt:'2026-11-02T15:00:00.000Z',...over});
const viewer={userId:scout,organizationId:org,role:'scout',displayName:'S',demo:false} as Viewer;

test('only submitted, unsent reports in this event can be shared',()=>{
 const keep=local(),acked=local({status:'synced',acknowledgedRevision:1}),draft=local({entry:entry({status:'draft',submitted_at:null}),status:'draft'}),edit=local({reviewRequired:true}),other=local({entry:entry({event_id:randomUUID()})}),relay=local({origin:'relay',status:'received'});
 assert.deepEqual(qrCandidates([keep,acked,draft,edit,other,relay],viewer,event).map(r=>r.entry.id),[keep.entry.id,relay.entry.id]);
});
test('delivery state says what really happened, and an edit clears shared',()=>{
 assert.equal(deliveryState(local()),'waiting');
 assert.equal(deliveryState(local({qrShared:{revision:1,at:'x'}})),'shared');
 assert.equal(deliveryState(local({revision:2,qrShared:{revision:1,at:'x'}})),'waiting');
 assert.equal(deliveryState(local({status:'synced',acknowledgedRevision:1})),'uploaded');
 assert.equal(deliveryState(local({status:'failed',error:'no'})),'attention');
 assert.equal(deliveryState(local({origin:'relay',status:'received'})),'received');
});
test('a prepared transfer round-trips, is frozen, and keeps the permanent IDs',async()=>{
 const records=Array.from({length:30},()=>local());
 const transfer=await prepareQrTransfer(records,async()=>null);
 records[0].entry.payload.comments='edited after preparing';
 let decoder:FountainDecoder|null=null;
 for(let seq=0;!decoder?.done;seq+=1){const f=parseFrame(transfer.encoder.frame(seq));decoder??=new FountainDecoder(f);decoder.accept(f)}
 const {reports,rejected}=decodeReportBatch(decoder.data!);
 assert.equal(rejected.length,0);
 assert.deepEqual(reports.map(r=>r.entry.id),transfer.reports.map(r=>r.id));
 assert.equal(reports[0].entry.payload.comments,'x');
 assert.equal(transfer.unsignedCount,30);
 await assert.rejects(prepareQrTransfer([local({reviewRequired:true})],async()=>null),/Drafts/);
 await assert.rejects(prepareQrTransfer([],async()=>null),/at least one/);
});
test('relayed copies keep their proof and are never re-signed by the forwarder',async()=>{
 let signed=0;const proof={envelope:{version:1,deviceId:randomUUID(),entry:entry(),createdAt:'2026-11-02T15:00:00.000Z'},signature:`${'A'.repeat(86)}==`} as never;
 const transfer=await prepareQrTransfer([local({origin:'relay',status:'received',proof}),local({origin:'relay',status:'received'})],async()=>{signed++;return null});
 assert.equal(signed,0);assert.equal(transfer.unsignedCount,1);
});
test('receiving is repeat-safe and never overwrites newer or own work',()=>{
 const e=entry(),proof={signature:`${'A'.repeat(86)}==`} as never,other={signature:`${'B'.repeat(86)}==`} as never;
 assert.equal(relayReceiptAction(null,e,1),'save');
 assert.equal(relayReceiptAction(local({entry:e}),e,1),'own-copy');
 assert.equal(relayReceiptAction(local({entry:e,origin:'relay',revision:3}),e,2),'already-here');
 assert.equal(relayReceiptAction(local({entry:e,origin:'relay',revision:1}),e,2),'save');
 assert.equal(relayReceiptAction(local({entry:e,origin:'relay',status:'synced',acknowledgedRevision:1}),e,1,proof),'already-here','a replay must not undo the upload');
 assert.equal(relayReceiptAction(local({entry:e,origin:'relay',status:'received'}),e,1),'already-here');
 assert.equal(relayReceiptAction(local({entry:e,origin:'relay',status:'received'}),e,1,proof),'save','an unsigned backup gains its signature');
 assert.equal(relayReceiptAction(local({entry:e,origin:'relay',status:'received',proof}),e,1,proof),'already-here');
 assert.equal(relayReceiptAction(local({entry:e,origin:'relay',status:'received',proof}),e,1,other),'save');
 assert.equal(relayReceiptAction(local({entry:e,origin:'relay',status:'received'}),{...e,payload:{comments:'other'}},1),'conflict');
});
test('a stale schedule warns instead of losing the report',()=>{
 const teams=new Set([team]),match=randomUUID(),schedule=[{id:match,red_teams:[team],blue_teams:[]}];
 assert.equal(scheduleWarning(entry({match_id:match}),teams,schedule),null);
 assert.match(String(scheduleWarning(entry({team_id:randomUUID()}),teams,schedule)),/not in this phone/);
 assert.match(String(scheduleWarning(entry({match_id:randomUUID()}),teams,schedule)),/not in this phone/);
});
test('strategists can hold reports but only relay roles upload',()=>{
 assert.equal(canReceiveQr('strategist'),true);assert.equal(canUploadRelay('strategist'),false);
 assert.equal(canReceiveQr('scout'),false);assert.equal(canUploadRelay('master'),true);
});
