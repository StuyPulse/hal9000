import type { LocalSubmission, NativeEntry, Payload } from './types';
import {canUploadRelay} from './relay-receipt';

export function acknowledge(latest:LocalSubmission,uploadedRevision:number,updatedAt:string|null):LocalSubmission {
 return {...latest,acknowledgedRevision:uploadedRevision,acknowledgedAt:Date.now(),baseUpdatedAt:updatedAt,error:null,status:latest.revision===uploadedRevision?'synced':latest.entry.status==='submitted'?'pending':'draft'};
}
export function updateLocal(current:LocalSubmission,payload:Record<string,unknown>,finalize=false):LocalSubmission {
 const now=new Date().toISOString();
 const entry:NativeEntry={...current.entry,payload,status:finalize?'submitted':current.entry.status,submitted_at:finalize?current.entry.submitted_at??now:current.entry.submitted_at};
 // Working edits wait for an explicit Save only when the cloud already holds the
 // submitted revision. An unacknowledged submission is the only copy, so every
 // edit to it stays a new submitted revision that still uploads and shares by QR.
 const published=current.entry.status==='submitted'&&(Boolean(current.reviewRequired)||current.acknowledgedRevision===current.revision);
 return {...current,entry,reviewRequired:!finalize&&published,revision:current.revision+1,status:entry.status==='submitted'?'pending':'draft',error:null,changedAt:now};
}
export function payloadEqual(a:unknown,b:unknown):boolean {
 if(a===b)return true;if(!a||!b||typeof a!=='object'||typeof b!=='object')return false;
 if(Array.isArray(a)||Array.isArray(b))return Array.isArray(a)&&Array.isArray(b)&&a.length===b.length&&a.every((v,i)=>payloadEqual(v,b[i]));
 const left=a as Record<string,unknown>,right=b as Record<string,unknown>;const keys=Object.keys(left).sort();return keys.length===Object.keys(right).length&&keys.every(k=>Object.hasOwn(right,k)&&payloadEqual(left[k],right[k]));
}
export function failRevision(latest:LocalSubmission,failedRevision:number,error:string):LocalSubmission{return latest.revision===failedRevision?{...latest,status:'failed',error}:latest;}
function manualIdentity(payload:Payload):unknown {
 const value=payload.manual_match;
 if(!value||typeof value!=='object'||Array.isArray(value))return null;
 const manual=value as Record<string,unknown>;
 if(typeof manual.stage!=='string'||!manual.stage.trim()||(manual.label!==null&&typeof manual.label!=='string')||!['red','blue'].includes(String(manual.alliance)))return null;
 return {stage:manual.stage,label:manual.label,alliance:manual.alliance};
}
export function sameManualIdentity(a:Payload,b:Payload):boolean {
 const left=manualIdentity(a),right=manualIdentity(b);
 return left!==null&&right!==null&&payloadEqual(left,right);
}
export function reusableDraft(record:LocalSubmission,target:{userId:string;eventId:string;kind:NativeEntry['entry_type'];teamId:string;matchId:string|null;payload:Payload}):boolean {
 // A claimed report by another scout is never reused as this account's own scouting.
 if(record.origin!=='own'||record.entry.scout_user_id!==target.userId||record.entry.event_id!==target.eventId||record.entry.entry_type!==target.kind||record.entry.team_id!==target.teamId||record.entry.match_id!==target.matchId)return false;
 if(target.kind!=='match')return record.entry.status==='draft';
 if(target.matchId!==null)return true;
 // An unlinked report is identified by its manual stage, label and alliance,
 // not just its team. Never merge two unnamed/invalid manual reports.
 return sameManualIdentity(record.entry.payload,target.payload);
}
export function shouldUpload(record:LocalSubmission):boolean {
 if(record.reviewRequired)return false;
 if(record.revision===record.acknowledgedRevision)return false;
 if(record.origin==='relay')return record.entry.status==='submitted'&&Boolean(record.proof);
 return record.entry.status==='draft'||record.entry.status==='submitted';
}
/** Rows this account can actually deliver: relay copies need a signature and a role the server accepts. */
export function uploadableHere(record:LocalSubmission,role:string):boolean {
 return shouldUpload(record)&&(record.origin!=='relay'||canUploadRelay(role)&&Boolean(record.proof));
}
/** Submitted reports this phone still has to send. */
export function toSendCount(records:LocalSubmission[],eventId:string,role:string):number {
 return records.filter(r=>r.entry.event_id===eventId&&r.entry.status==='submitted'&&uploadableHere(r,role)).length;
}
export function sameReport(a:NativeEntry,b:NativeEntry){
 const autoLinked=a.match_id===null&&b.match_id!==null&&a.entry_type==='match'&&a.status==='submitted'&&a.payload.report_source==='manual'&&sameManualIdentity(a.payload,b.payload);
 return a.id===b.id&&a.scout_user_id===b.scout_user_id&&a.organization_id===b.organization_id&&a.team_id===b.team_id&&a.event_id===b.event_id&&(a.match_id===b.match_id||autoLinked)&&a.entry_type===b.entry_type&&a.assignment_id===b.assignment_id&&a.form_version===b.form_version&&a.status===b.status&&payloadEqual(a.payload,b.payload);
}
export function scopedIdentity(userId:string,organizationId:string,demo=false){return `${demo?'demo':'live'}:${userId}:${organizationId}`;}
/** The connection failed, as opposed to the server refusing this report. */
export function isConnectionFailure(error:unknown){
 const e=error as {status?:unknown;code?:unknown;message?:unknown};
 if(e?.code==='network_error'||e?.status===0)return true;
 // supabase-js raises this when Auth could not be reached, not when the account is wrong.
 if((error as {name?:unknown})?.name==='AuthRetryableFetchError')return true;
 return /network request failed|failed to fetch|fetch failed|network error|load failed|abort|timed? ?out|could not connect|offline/i.test(String(e?.message??error));
}
/** Postgres returns microseconds; JavaScript dates keep milliseconds. */
function serverMillis(value:string|null|undefined):number|null {
 if(!value)return null;
 const parsed=Date.parse(value.replace(/(\.\d{3})\d+/,'$1'));
 return Number.isFinite(parsed)?parsed:null;
}
/**
 * A fully acknowledged local copy is only a cache of the cloud. When the
 * downloaded server row is newer, it must be reseeded from the server rather
 * than shown or edited. Pending or unpublished work is never replaced.
 */
export function staleAcknowledgedCopy(local:LocalSubmission|null|undefined,server:NativeEntry|null|undefined):boolean {
 if(!local||!server?.updated_at||local.origin!=='own'||local.reviewRequired||local.acknowledgedRevision!==local.revision||server.id!==local.entry.id)return false;
 if(server.updated_at===local.baseUpdatedAt)return false;
 const remote=serverMillis(server.updated_at),base=serverMillis(local.baseUpdatedAt);
 return remote===null||base===null?true:remote>base;
}
/**
 * The optimistic-concurrency token for an upload. When the server row is
 * exactly what this phone exported by QR (a master relayed it), that relayed
 * row is this phone's own revision, so its timestamp becomes the base.
 */
export function uploadBase(record:LocalSubmission,remote:NativeEntry|null):string|null {
 const exported=record.qrShared?.entry;
 if(remote?.updated_at&&exported&&exported.id===remote.id&&sameReport(exported,remote))return remote.updated_at;
 return record.baseUpdatedAt;
}
