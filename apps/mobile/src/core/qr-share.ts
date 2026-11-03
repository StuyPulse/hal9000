import {encodeReportBatch} from '@wildcard/shared/src/qr-batch';
import {FountainEncoder,DEFAULT_BLOCK_SIZE} from '@wildcard/shared/src/fountain-qr';
import type {SignedRelayProof} from '@wildcard/shared/src/relay-contract';
import type {LocalSubmission,Viewer} from './types';

export type Delivery='draft'|'waiting'|'shared'|'uploaded'|'attention'|'received';
/** One plain state per report: what has really happened to it, and nothing more. */
export function deliveryState(record:LocalSubmission):Delivery{
 if(record.entry.status==='draft'||record.reviewRequired)return 'draft';
 if(record.status==='synced'&&record.acknowledgedRevision===record.revision)return 'uploaded';
 if(record.status==='failed')return 'attention';
 if(record.origin==='relay')return 'received';
 return record.qrShared?.revision===record.revision?'shared':'waiting';
}
export const deliveryLabel:Record<Delivery,string>={draft:'Draft, not submitted',waiting:'Saved on this phone, not shared yet',shared:'Shared by QR, not uploaded yet',uploaded:'Uploaded',attention:'Needs attention',received:'Received by QR, not uploaded yet'};

export function qrCandidates(records:LocalSubmission[],viewer:Viewer,eventId:string){
 return records.filter(r=>r.entry.organization_id===viewer.organizationId&&r.entry.event_id===eventId&&r.entry.status==='submitted'&&!r.reviewRequired&&r.status!=='synced');
}
export type QrTransfer={encoder:FountainEncoder;reports:{id:string;revision:number}[];unsignedCount:number};
export async function prepareQrTransfer(records:LocalSubmission[],proof:(record:LocalSubmission)=>Promise<SignedRelayProof|null>,blockSize=DEFAULT_BLOCK_SIZE):Promise<QrTransfer>{
 if(!records.length)throw Error('Select at least one report.');
 // Later edits must not change a transfer that is already on screen.
 const frozen=JSON.parse(JSON.stringify(records)) as LocalSubmission[];
 if(frozen.some(r=>r.entry.status!=='submitted'||r.reviewRequired))throw Error('Drafts and unpublished edits cannot be shared.');
 let unsignedCount=0;
 const reports=[];
 for(const record of frozen){
  const signature=record.origin==='relay'?record.proof??null:await proof(record);
  if(!signature)unsignedCount++;
  reports.push({entry:record.entry,revision:record.revision,...(signature?{proof:signature}:{})});
 }
 return {encoder:new FountainEncoder(encodeReportBatch(reports),blockSize),reports:frozen.map(r=>({id:r.entry.id,revision:r.revision})),unsignedCount};
}
