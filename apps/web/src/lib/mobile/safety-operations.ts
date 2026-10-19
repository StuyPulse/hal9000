import {z} from 'zod';
import {canonicalJson} from '@wildcard/shared/src/relay-contract';
import {scopedEvent,MobileError,type Actor,type MobileDatabase} from './operations';
import {requireManager} from './admin-operations';

const uuid=z.string().uuid();
export const safetyInput=z.object({id:uuid,eventId:uuid,targetKind:z.enum(['report','photo','workspace']),targetId:uuid.nullable(),reason:z.enum(['harassment','inappropriate','privacy','other']),details:z.string().trim().min(1).max(2000)}).strict().refine(v=>v.targetKind==='workspace'?v.targetId===null:v.targetId!==null);
type SafetyRow=Record<string,unknown>&{id:string;status:string};
const checked=<T>(result:{data:T;error?:unknown}):T=>{if(result.error)throw new MobileError(503,'safety_unavailable','The safety report could not be saved. Your device will retain it for retry.');return result.data;};
export async function submitSafetyReport(db:MobileDatabase,actor:Actor,input:unknown){
 const v=safetyInput.parse(input);
 const row={id:v.id,organization_id:actor.organizationId,event_id:v.eventId,reporter_id:actor.userId,target_kind:v.targetKind,target_id:v.targetId,reason:v.reason,details:v.details};
 // Check retry identity before target lookup: a moderator may already have removed it.
 const existing=checked<SafetyRow|null>(await db.from('content_reports').select('*').eq('id',v.id).maybeSingle());
 const receipt=(saved:SafetyRow)=>{
  if(!saved||Object.keys(row).some(key=>canonicalJson(saved[key])!==canonicalJson(row[key as keyof typeof row])))throw new MobileError(409,'safety_conflict','This report identifier is already in use. Keep your local copy and contact support.');
  return {id:saved.id,status:saved.status};
 };
 if(existing)return receipt(existing);
 await scopedEvent(db,actor,v.eventId);
 if(v.targetKind!=='workspace'){
  const target=checked<{id:string}|null>(await db.from(v.targetKind==='report'?'scouting_entries':'pit_photos').select('id').eq('id',v.targetId).eq('organization_id',actor.organizationId).eq('event_id',v.eventId).maybeSingle());
  if(!target)throw new MobileError(404,'content_unavailable','This content is unavailable. You can report the workspace instead.');
 }
 const saved=await db.from('content_reports').insert(row).select('*').maybeSingle();
 if(!saved.error&&saved.data)return receipt(saved.data);
 // Concurrent retry: acknowledge only this exact immutable request.
 const after=checked<SafetyRow|null>(await db.from('content_reports').select('*').eq('id',v.id).maybeSingle());
 if(after)return receipt(after);
 if(saved.error?.code==='23514'&&saved.error?.message?.includes('Safety report rate limit'))throw new MobileError(429,'safety_rate_limit','You have reached the 50-report limit for a 24-hour period. Your report is retained for retry; contact se@stuypulse.com for urgent concerns.');
 checked(saved);throw new MobileError(503,'safety_unavailable','The server did not confirm this safety report. Retry later.');
}
export async function listSafetyReports(db:MobileDatabase,actor:Actor,page=0){
 if(!Number.isInteger(page)||page<0||page>10000)throw new MobileError(422,'invalid_page','Invalid report page.');
 let query=db.from('content_reports').select('*').eq('organization_id',actor.organizationId);
 if(!['admin','developer'].includes(actor.role))query=query.eq('reporter_id',actor.userId);
 const reports=checked<SafetyRow[]|null>(await query.order('created_at',{ascending:false}).order('id').range(page*50,page*50+49));
 return {reports:reports??[],page};
}
export async function resolveSafetyReport(db:MobileDatabase,actor:Actor,input:unknown){
 requireManager(actor);
 const v=z.object({id:uuid,status:z.enum(['action_taken','dismissed']),resolution:z.string().trim().min(1).max(1000)}).strict().parse(input);
 const report=checked<{id:string;status:string}|null>(await db.from('content_reports').update({status:v.status,resolution:v.resolution,reviewed_by:actor.userId,reviewed_at:new Date().toISOString()}).eq('id',v.id).eq('organization_id',actor.organizationId).eq('status','open').select('id,status').maybeSingle());
 if(!report)throw new MobileError(409,'safety_changed','This report was already reviewed or is unavailable. Refresh the inbox.');
 return report;
}
