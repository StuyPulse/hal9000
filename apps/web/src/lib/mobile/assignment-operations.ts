import {z} from 'zod';
import {requireManager} from './admin-operations';
import {MobileError,scopedEvent,type Actor,type MobileDatabase} from './operations';

const inputSchema=z.discriminatedUnion('action',[
 z.object({action:z.literal('generate'),eventId:z.string().uuid(),rosterId:z.string().uuid()}).strict(),
 z.object({action:z.literal('clear'),eventId:z.string().uuid()}).strict(),
 z.object({action:z.literal('restore'),eventId:z.string().uuid(),snapshotId:z.string().uuid()}).strict(),
]);
const check=(error:unknown)=>{if(error)throw new MobileError(503,'assignment_database_error','Could not complete the assignment operation. Refresh and retry.');};
async function allRows(make:(from:number,to:number)=>any){const rows:any[]=[];for(let from=0;;from+=1000){const q=await make(from,from+999);check(q.error);rows.push(...(q.data??[]));if((q.data??[]).length<1000)return rows;if(rows.length>100000)throw new MobileError(422,'schedule_too_large','This schedule is too large for one assignment operation.');}}
export function objectivePlan(matches:{id:string;red_teams:string[];blue_teams:string[]}[],scouts:string[],occupied:Set<string>){
 if(!scouts.length)throw new MobileError(422,'empty_roster','Add at least one scout-capable member to this roster.');const plan:{match_id:string;team_id:string;scout_user_id:string;assignment_type:'objective'}[]=[];
 for(const m of matches)for(const team_id of [...new Set([...m.red_teams,...m.blue_teams])])if(!occupied.has(`${m.id}:${team_id}`))plan.push({match_id:m.id,team_id,scout_user_id:scouts[plan.length%scouts.length],assignment_type:'objective'});return plan;
}
export function clearableAssignments(rows:any[],submittedIds:Set<string>){return rows.filter(a=>a.status!=='complete'&&!submittedIds.has(a.id));}
export function restorableAssignments(rows:any[],occupied:Set<string>){return rows.filter(a=>!occupied.has(`${a.match_id}:${a.team_id}`));}
async function assignmentsFor(database:MobileDatabase,matchIds:string[]){return matchIds.length?allRows((from,to)=>database.from('scouting_assignments').select('id,match_id,team_id,scout_user_id,assignment_type,status,created_at,completed_at').in('match_id',matchIds).eq('assignment_type','objective').order('id').range(from,to)):[];}
export async function assignmentOperation(database:MobileDatabase,actor:Actor,input:unknown){
 requireManager(actor);const v=inputSchema.parse(input);await scopedEvent(database,actor,v.eventId);
 const matches=await allRows((from,to)=>database.from('matches').select('id,red_teams,blue_teams,scheduled_at').eq('event_id',v.eventId).order('scheduled_at').order('id').range(from,to));const matchIds=matches.map(m=>m.id);
 if(v.action==='generate'){
  const roster=await database.from('scout_assignment_rosters').select('id,name').eq('id',v.rosterId).eq('organization_id',actor.organizationId).maybeSingle();check(roster.error);if(!roster.data)throw new MobileError(404,'roster_unavailable','This roster is unavailable.');
  const [members,eligible,existing]=await Promise.all([
   allRows((from,to)=>database.from('scout_assignment_roster_members').select('user_id').eq('roster_id',v.rosterId).order('user_id').range(from,to)),
   allRows((from,to)=>database.from('organization_members').select('user_id').eq('organization_id',actor.organizationId).in('role',['scout','global_scout','admin','developer']).order('user_id').range(from,to)),
   assignmentsFor(database,matchIds),
  ]);const ids=new Set(members.map(m=>m.user_id)),scouts=eligible.filter(m=>ids.has(m.user_id)).map(m=>m.user_id);
  if(!matches.length)throw new MobileError(422,'no_schedule','Create or import a match schedule first.');const plan=objectivePlan(matches,scouts,new Set(existing.map(a=>`${a.match_id}:${a.team_id}`)));if(!plan.length)return {message:'Every scheduled team already has an objective assignment.',created:0};
  let created=0;for(let i=0;i<plan.length;i+=500){const q=await database.from('scouting_assignments').upsert(plan.slice(i,i+500),{onConflict:'match_id,scout_user_id,team_id,assignment_type',ignoreDuplicates:true}).select('id');check(q.error);created+=(q.data??[]).length;}
  return {message:`Created ${created} objective assignments using ${roster.data.name}.`,created};
 }
 if(v.action==='clear'){
  const [objective,prescout,submitted,legacy]=await Promise.all([
   assignmentsFor(database,matchIds),
   allRows((from,to)=>database.from('prescout_assignments').select('id,organization_id,event_id,team_id,scout_user_id,created_at').eq('event_id',v.eventId).order('id').range(from,to)),
   allRows((from,to)=>database.from('scouting_entries').select('assignment_id').eq('event_id',v.eventId).eq('entry_type','match').eq('status','submitted').not('assignment_id','is',null).order('id').range(from,to)),
   matchIds.length?allRows((from,to)=>database.from('match_submissions').select('assignment_id').in('match_id',matchIds).not('assignment_id','is',null).order('id').range(from,to)):[],
  ]);const clearable=clearableAssignments(objective,new Set([...submitted,...legacy].map(e=>e.assignment_id)));
  if(!clearable.length&&!prescout.length)throw new MobileError(409,'nothing_to_clear','There are no pending assignments to clear. Submitted assignments are protected.');
  const snapshot=await database.from('assignment_clear_snapshots').insert({organization_id:actor.organizationId,event_id:v.eventId,actor_user_id:actor.userId,objective_assignments:clearable,prescout_assignments:prescout}).select('id').single();check(snapshot.error);if(!snapshot.data)throw new MobileError(503,'snapshot_failed','Could not save an undo point. No assignments were removed.');
  // Persist an undo point before either delete. Partial results return the point,
  // rather than claiming an all-or-nothing transaction that does not exist.
  let removed=0;if(clearable.length){const q=await database.from('scouting_assignments').delete().in('id',clearable.map(a=>a.id)).neq('status','complete').select('id');if(q.error)return {message:'The undo point was saved, but match assignments could not be cleared.',undoSnapshotId:snapshot.data.id,partial:true};removed=(q.data??[]).length;}
  if(prescout.length){const q=await database.from('prescout_assignments').delete().eq('event_id',v.eventId).in('id',prescout.map(a=>a.id)).select('id');if(q.error)return {message:'Match assignments were cleared, but prescout assignments could not be cleared. Use Undo.',undoSnapshotId:snapshot.data.id,partial:true};}
  return {message:`Cleared ${removed} pending match assignments and ${prescout.length} prescout assignments. Submitted assignments were preserved.`,undoSnapshotId:snapshot.data.id};
 }
 const result=await database.from('assignment_clear_snapshots').select('id,event_id,objective_assignments,prescout_assignments').eq('id',v.snapshotId).eq('event_id',v.eventId).eq('organization_id',actor.organizationId).is('restored_at',null).maybeSingle();check(result.error);const snapshot=result.data;if(!snapshot)throw new MobileError(409,'snapshot_unavailable','This undo point is unavailable or already restored.');
 const objective=Array.isArray(snapshot.objective_assignments)?snapshot.objective_assignments:[],prescout=Array.isArray(snapshot.prescout_assignments)?snapshot.prescout_assignments:[];
 if(objective.some((a:any)=>!matchIds.includes(a.match_id))||prescout.some((a:any)=>a.event_id!==v.eventId||a.organization_id!==actor.organizationId))throw new MobileError(409,'snapshot_changed','The saved schedule changed. Review assignments on the website.');
 const existing=await assignmentsFor(database,matchIds),restorable=restorableAssignments(objective,new Set(existing.map(a=>`${a.match_id}:${a.team_id}`)));
 if(restorable.length){const q=await database.from('scouting_assignments').insert(restorable.map((a:any)=>({id:a.id,match_id:a.match_id,scout_user_id:a.scout_user_id,team_id:a.team_id,assignment_type:a.assignment_type,status:a.status,created_at:a.created_at,completed_at:a.completed_at}))).select('id');check(q.error);if(q.data?.length!==restorable.length)throw new MobileError(409,'restore_incomplete','Not all assignments could be restored. Refresh and retry.');}
 if(prescout.length){const q=await database.from('prescout_assignments').upsert(prescout.map((a:any)=>({id:a.id,organization_id:a.organization_id,event_id:a.event_id,team_id:a.team_id,scout_user_id:a.scout_user_id,created_at:a.created_at})),{onConflict:'event_id,team_id,scout_user_id',ignoreDuplicates:true});if(q.error)return {message:'Match assignments restored, but prescout restore failed. Retry Undo.',partial:true};}
 const marked=await database.from('assignment_clear_snapshots').update({restored_at:new Date().toISOString()}).eq('id',snapshot.id).is('restored_at',null).select('id');check(marked.error);if(marked.data?.length!==1)throw new MobileError(409,'restore_conflict','Assignments restored, but the undo point changed. Refresh before retrying.');
 return {message:`Restored ${restorable.length} match and ${prescout.length} prescout assignments; preserved ${objective.length-restorable.length} reassigned slots.`,restored:restorable.length};
}
