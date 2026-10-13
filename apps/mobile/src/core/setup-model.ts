import {z} from 'zod';
import type {Viewer,EventBundle} from './types';
import {formDefinitionSchema,organizationRoleSchema} from '@wildcard/shared';
export const eventInput=z.object({name:z.string().trim().min(1).max(160),date:z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine(v=>!Number.isNaN(Date.parse(v))&&new Date(v).toISOString().slice(0,10)===v,'Enter a valid date')});
export const teamInput=z.object({number:z.coerce.number().int().positive().max(99999),name:z.string().trim().min(1).max(160)});
export const matchInput=z.object({number:z.coerce.number().int().positive(),type:z.enum(['qualification','playoff','practice']),red:z.array(z.string().uuid()).min(1).max(3),blue:z.array(z.string().uuid()).min(1).max(3),scheduledAt:z.string().datetime({offset:true}).nullable().optional()}).refine(v=>new Set([...v.red,...v.blue]).size===v.red.length+v.blue.length,'A team may appear only once in a match');
export const assignmentInput=z.object({matchId:z.string().uuid(),teamId:z.string().uuid(),scoutId:z.string().uuid()});
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
export function planAssignments(bundle:EventBundle,scoutIds:string[]){
 const scouts=[...new Set(scoutIds)];if(!scouts.length)throw Error('Choose at least one eligible scout.');
 const occupied=new Set(bundle.assignments.filter(a=>a.assignment_type==='objective').map(a=>`${a.match_id}:${a.team_id}`));
 const rows:{match_id:string;team_id:string;scout_user_id:string;assignment_type:'objective'}[]=[];
 for(const match of bundle.matches){for(const teamId of [...new Set([...match.red_teams,...match.blue_teams])]){
  if(occupied.has(`${match.id}:${teamId}`))continue;rows.push({match_id:match.id,team_id:teamId,scout_user_id:scouts[rows.length%scouts.length],assignment_type:'objective'});
 }}return rows;
}
export function protectAssignment(bundle:EventBundle,id:string){
 const a=bundle.assignments.find(a=>a.id===id);if(!a)throw Error('Refresh: this assignment is no longer available.');
 if(a.status==='complete'||bundle.entries.some(e=>e.status==='submitted'&&e.assignment_id===id))throw Error('Submitted assignments stay assigned.');return a;
}
