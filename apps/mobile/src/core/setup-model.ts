import {z} from 'zod';
import type {Viewer,EventBundle} from './types';
import {formDefinitionSchema,organizationRoleSchema} from '@wildcard/shared';
const eventDate=z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine(v=>!Number.isNaN(Date.parse(v))&&new Date(v).toISOString().slice(0,10)===v,'Enter a valid date');
export const eventInput=z.object({name:z.string().trim().min(3).max(160),date:eventDate,endDate:eventDate.optional()}).refine(v=>!v.endDate||v.endDate>=v.date,'The end date must not be before the event date.');
export const teamInput=z.object({number:z.union([z.number().int().positive().max(99999),z.string().trim().regex(/^\d+[A-Za-z]*$/)]),name:z.string().trim().max(160).default('')}).transform(v=>({...v,number:typeof v.number==='string'&&/^\d+$/.test(v.number)?Number(v.number):v.number})).refine(v=>typeof v.number!=='number'||v.number>0&&v.number<=99999,'Enter a team number below 100000.');
export const matchInput=z.object({number:z.coerce.number().int().positive(),type:z.enum(['qualification','playoff','practice']),red:z.array(z.string().uuid()).min(1).max(3),blue:z.array(z.string().uuid()).min(1).max(3),scheduledAt:z.string().datetime({offset:true}).nullable().optional()}).refine(v=>new Set([...v.red,...v.blue]).size===v.red.length+v.blue.length,'A team may appear only once in a match');
export const manualScheduleInput=z.object({number:z.coerce.number().int().positive(),type:z.enum(['qualification','playoff','practice']),scheduledAt:z.string().datetime({offset:true}).nullable().optional()});
export function manualCompletionPatch(){return {status:'played'} as const;}
export const assignmentInput=z.object({matchId:z.string().uuid(),teamId:z.string().uuid(),scoutId:z.string().uuid()});
// Every role an admin may grant. Developer is granted only by a developer.
export const invitationRoles=['scout','global_scout','strategist','master','admin'] as const;
export const editableRoles=invitationRoles;
export function assignableRoles(actingRole:string):string[]{return actingRole==='developer'?[...editableRoles,'developer']:[...editableRoles];}
export function assertAssignableRole(actingRole:string,role:string){if(!assignableRoles(actingRole).includes(role))throw Error(role==='developer'?'Only a developer can grant the developer role.':'Choose a valid role.');}
/** The server gates email access on can_manage_email_access, not on role. */
export function canOpenEmailAccess(viewer:Pick<Viewer,'role'|'demo'|'canManageEmailAccess'>|null|undefined){return !!viewer&&(viewer.canManageEmailAccess===true||viewer.demo&&['admin','developer'].includes(viewer.role));}
export function eventTeamNumberFromInput(value:string|number,bundle:EventBundle){
 const label=String(value).trim();if(!/^\d+[A-Za-z]*$/.test(label))throw Error('Enter a valid team number.');
 const number=/^\d+$/.test(label)?Number(label):bundle.teams.find(t=>t.displayNumber.toLowerCase()===label.toLowerCase())?.number;
 if(!number||!Number.isSafeInteger(number)||number>99999)throw Error(`Team ${label} is not mapped in this event.`);return number;
}
export function manualLineupNumbers(red:string,blue:string,bundle:EventBundle){
 const parse=(text:string)=>[...new Set(text.split(/[\s,]+/).filter(Boolean).map(v=>eventTeamNumberFromInput(v,bundle)))];const r=parse(red),b=parse(blue);
 if(!r.length||!b.length||r.length>3||b.length>3||r.some(n=>b.includes(n)))throw Error('Enter one to three distinct team numbers for each alliance.');return {red:r,blue:b};
}
export function assertAssignmentSlotOpen(assignments:{id:string;status:string}[],submittedAssignmentIds:Set<string>){
 if(assignments.some(a=>a.status==='complete'||submittedAssignmentIds.has(a.id)))throw Error('This assignment already has a submitted report and cannot be reassigned.');
}
export function assertBundleAssignmentSlotOpen(bundle:EventBundle,matchId:string,teamId:string){
 const existing=bundle.assignments.filter(a=>a.match_id===matchId&&a.team_id===teamId&&a.assignment_type==='objective');assertAssignmentSlotOpen(existing,new Set(bundle.entries.filter(e=>e.status==='submitted'&&e.assignment_id).map(e=>e.assignment_id!)));
}
export function requireSetup(viewer:Viewer){if(!['admin','developer'].includes(viewer.role))throw Error('Admin or developer access is required.');}
export function assertSetupIdentity(expectedUserId:string,currentUserId:string|null|undefined){if(!currentUserId||currentUserId!==expectedUserId)throw Error('Account changed. This setup operation was not sent.');}
export function validateMatchTeams(input:z.infer<typeof matchInput>,bundle:EventBundle){if([...input.red,...input.blue].some(id=>!bundle.teams.some(t=>t.id===id)))throw Error('Every match team must belong to this event.');}
export const roleInput=z.object({userId:z.string().uuid(),role:organizationRoleSchema});
export const inviteInput=z.object({email:z.string().trim().email().max(254).toLowerCase(),role:organizationRoleSchema});
export const aliasInput=z.string().trim().regex(/^\d+[A-Za-z]*$/,'Use a team number with an optional letter suffix, like 694B.').max(20);
export const resultInput=z.object({redScore:z.coerce.number().int().min(0).max(100000),blueScore:z.coerce.number().int().min(0).max(100000)});
export const rosterInput=z.string().trim().min(1).max(80);
export const editableFormSchema=formDefinitionSchema.superRefine((form,ctx)=>{
 const ids=new Set<string>();for(const [i,f] of form.fields.entries()){
  if(ids.has(f.id))ctx.addIssue({code:'custom',path:['fields',i,'id'],message:'Field IDs must be unique.'});ids.add(f.id);
  if(f.type==='select'&&(!f.options?.length||f.options.some(v=>!v.trim())||new Set(f.options).size!==f.options.length))ctx.addIssue({code:'custom',path:['fields',i,'options'],message:'Select fields need distinct, nonempty choices.'});
 }
});
// Mirrors apps/web/src/lib/admin/assignment-plan.ts so the preview shows what the server creates.
export const UNASSIGNABLE_MATCH_STATUSES:ReadonlySet<string>=new Set(['played','complete','cancelled']);
export function isAssignableMatch(match:{status?:string|null}){return !match.status||!UNASSIGNABLE_MATCH_STATUSES.has(match.status);}
export type PlannedAssignment={match_id:string;team_id:string;scout_user_id:string;assignment_type:'objective'};
/** Round-robin that never gives one scout two robots in a match, skips played/complete/cancelled matches and leaves slots open when the roster is short. */
export function planAssignments(bundle:EventBundle,scoutIds:string[]):{assignments:PlannedAssignment[];unfilled:number;skippedMatches:number}{
 const scouts=[...new Set(scoutIds)].sort();if(!scouts.length)throw Error('Choose at least one eligible scout.');
 const existing=bundle.assignments.filter(a=>a.assignment_type==='objective');
 const occupied=new Set(existing.map(a=>`${a.match_id}:${a.team_id}`)),busy=new Set(existing.map(a=>`${a.match_id}:${a.scout_user_id}`));
 const rows:PlannedAssignment[]=[];let unfilled=0,skippedMatches=0,cursor=0;
 const matches=[...bundle.matches].sort((a,b)=>a.scheduled_at==null?(b.scheduled_at==null?a.id.localeCompare(b.id):1):b.scheduled_at==null?-1:a.scheduled_at.localeCompare(b.scheduled_at)||a.id.localeCompare(b.id));
 for(const match of matches){
  if(!isAssignableMatch(match)){skippedMatches++;continue;}
  const used=new Set(scouts.filter(s=>busy.has(`${match.id}:${s}`)));
  for(const teamId of [...new Set([...match.red_teams,...match.blue_teams])]){
   if(occupied.has(`${match.id}:${teamId}`))continue;
   let chosen=-1;for(let offset=0;offset<scouts.length;offset++){const index=(cursor+offset)%scouts.length;if(!used.has(scouts[index])){chosen=index;break;}}
   if(chosen<0){unfilled++;continue;}
   used.add(scouts[chosen]);cursor=(chosen+1)%scouts.length;rows.push({match_id:match.id,team_id:teamId,scout_user_id:scouts[chosen],assignment_type:'objective'});
  }
 }return {assignments:rows,unfilled,skippedMatches};
}
/** Manual assignment: the match must still be upcoming and the scout must not already hold another robot in it. */
export function assertManualAssignmentAllowed(bundle:EventBundle,matchId:string,teamId:string,scoutId:string){
 const match=bundle.matches.find(m=>m.id===matchId);if(!match||![...match.red_teams,...match.blue_teams].includes(teamId))throw Error('Choose a team in the selected match.');
 if(!isAssignableMatch(match))throw Error('This match was already played. Choose an upcoming match.');
 if(bundle.assignments.some(a=>a.assignment_type==='objective'&&a.match_id===matchId&&a.scout_user_id===scoutId&&a.team_id!==teamId))throw Error('This scout already has another robot in this match.');
}
/** A write that succeeded is reported as saved even when the follow-up refresh fails, so it is not repeated. */
export async function successAfterRefresh(success:string,refresh:()=>Promise<void>,describe:(error:unknown)=>string){
 try{await refresh();return success;}catch(error){return `${success} The screen could not refresh (${describe(error)}). Refresh before repeating this change.`;}
}
type ClearEntry={assignment_id?:string|null;team_id:string;scout_user_id:string;entry_type:string;status:string};
/** Practice "Clear pending": keep completed/submitted match assignments and prescout assignments that already have a submitted pre-scout report. */
export function practiceClearPlan(bundle:EventBundle,entries:ClearEntry[]){
 const submitted=entries.filter(e=>e.status==='submitted');
 const submittedIds=new Set(submitted.filter(e=>e.assignment_id).map(e=>e.assignment_id!)),submittedPrescout=new Set(submitted.filter(e=>e.entry_type==='pre_scout').map(e=>`${e.team_id}:${e.scout_user_id}`));
 const assignments=bundle.assignments.filter(a=>a.status!=='complete'&&!submittedIds.has(a.id));
 const allPrescout=bundle.prescoutAssignments??[];const prescout=allPrescout.filter(a=>!submittedPrescout.has(`${a.team_id}:${a.scout_user_id}`));
 return {assignments,prescout,keptPrescout:allPrescout.filter(a=>!prescout.includes(a))};
}
export function protectAssignment(bundle:EventBundle,id:string){
 const a=bundle.assignments.find(a=>a.id===id);if(!a)throw Error('Refresh: this assignment is no longer available.');
 if(a.status==='complete'||bundle.entries.some(e=>e.status==='submitted'&&e.assignment_id===id))throw Error('Submitted assignments stay assigned.');return a;
}
