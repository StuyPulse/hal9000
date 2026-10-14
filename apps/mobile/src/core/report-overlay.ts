import type {EventBundle,LocalSubmission,NativeEntry} from './types';

/** Successful downloaded snapshots own acknowledged reports. Local work only
 * overrides them while it is actually pending; unreviewed edits never count as
 * published scouting observations. Practice has no cloud acknowledgment. */
export function eventEntries(bundle:EventBundle,records:LocalSubmission[],options:{includeWorking?:boolean}={}):NativeEntry[]{
 const rows=new Map(bundle.entries.map(entry=>[entry.id,entry]));
 for(const item of records){
  if(item.entry.event_id!==bundle.event.id||item.entry.organization_id!==bundle.event.organization_id)continue;
  if(item.reviewRequired&&!options.includeWorking)continue;
  if(item.acknowledgedRevision===item.revision&&!options.includeWorking){
   // A request started before this upload cannot be authoritative for it.
   if(!bundle.rankingSnapshotStartedAt||!item.acknowledgedAt||bundle.rankingSnapshotStartedAt>item.acknowledgedAt)continue;
  }
  rows.set(item.entry.id,item.entry);
 }
 return [...rows.values()];
}
export function pendingSubmittedCount(bundle:EventBundle,records:LocalSubmission[]){return records.filter(r=>r.entry.event_id===bundle.event.id&&r.entry.status==='submitted'&&!r.reviewRequired&&r.acknowledgedRevision!==r.revision).length;}

/** Persist the server-confirmed observation before acknowledging its outbox
 * revision. A subsequent complete server snapshot still owns corrections/deletes. */
export function rememberConfirmedReport(bundle:EventBundle,entry:NativeEntry,serverTime:string|null):EventBundle{
 if(bundle.event.id!==entry.event_id||bundle.event.organization_id!==entry.organization_id)throw Error('Report belongs to another event workspace.');
 const confirmed={...entry,updated_at:serverTime??undefined};
 return {...bundle,entries:[...bundle.entries.filter(row=>row.id!==entry.id),confirmed]};
}
