import type {EventBundle,LocalSubmission,NativeEntry} from './types';

/** Successful downloaded snapshots own acknowledged reports. Local work only
 * overrides them while it is actually pending; unreviewed edits never count as
 * published scouting observations. Practice has no cloud acknowledgment. */
export function eventEntries(bundle:EventBundle,records:LocalSubmission[],options:{includeWorking?:boolean}={}):NativeEntry[]{
 const rows=new Map(bundle.entries.map(entry=>[entry.id,entry]));
 for(const item of records){
  if(item.entry.event_id!==bundle.event.id||item.entry.organization_id!==bundle.event.organization_id)continue;
  if(item.reviewRequired&&!options.includeWorking)continue;
  if(item.acknowledgedRevision===item.revision&&!options.includeWorking)continue;
  rows.set(item.entry.id,item.entry);
 }
 return [...rows.values()];
}
export function pendingSubmittedCount(bundle:EventBundle,records:LocalSubmission[]){return records.filter(r=>r.entry.event_id===bundle.event.id&&r.entry.status==='submitted'&&!r.reviewRequired&&r.acknowledgedRevision!==r.revision).length;}
