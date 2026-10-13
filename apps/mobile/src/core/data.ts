import {formDefinitionSchema} from '@wildcard/shared';
import {requireClient} from './client';
import {scopedIdentity,sameReport,sameManualIdentity} from './sync-model';
import {validateNativeEntry} from '@wildcard/shared/src/native-contracts';
import {apiRequest,MobileApiError} from './mobile-api';
import type {Event,EventBundle,Viewer,NativeEntry,LocalSubmission,Payload,PicklistRanking} from './types';

export class MembershipPendingError extends Error{constructor(){super('Your account is signed in. An administrator needs to add you to the organization.');}}
export async function loadViewer():Promise<Viewer>{const c=requireClient();const {data:{user},error}=await c.auth.getUser();if(error)throw error;if(!user)throw Error('Sign in to load your organization.');const [{data:member,error:memberError},{data:profile},{data:emailAccess}]=await Promise.all([c.from('organization_members').select('organization_id,role').eq('user_id',user.id).limit(1).maybeSingle(),c.from('profiles').select('display_name').eq('id',user.id).maybeSingle(),c.rpc('can_manage_email_access')]);if(memberError)throw memberError;if(!member)throw new MembershipPendingError();return {userId:user.id,organizationId:member.organization_id,role:member.role,displayName:profile?.display_name||user.email||'Scout',demo:false,canManageEmailAccess:emailAccess===true};}
export async function loadEvents(viewer:Viewer):Promise<Event[]>{const {data,error}=await requireClient().from('events').select('*').eq('organization_id',viewer.organizationId).order('starts_at',{ascending:false});if(error)throw error;return data??[];}
async function paged(table:string,filter:(q:any)=>any){const rows:any[]=[];for(let start=0;;start+=1000){const {data,error}=await filter(requireClient().from(table).select('*')).range(start,start+999);if(error)throw error;rows.push(...data??[]);if((data??[]).length<1000)return rows;}}
// An empty successful RLS result is authoritative. A failed query is NOT empty
// data: reject the refresh so the previous complete local package remains usable.
async function optional(table:string,filter:(q:any)=>any){return paged(table,filter)}
export async function loadBundle(viewer:Viewer,event:Event,previous?:EventBundle|null):Promise<EventBundle>{
 const c=requireClient();const [eventTeamRows,matches,assignments,forms,entries,photos,rankings,categories,tags,documents,reportSources,prescoutAssignments,strategyDrawings]=await Promise.all([
 paged('event_teams',q=>q.eq('event_id',event.id)),paged('matches',q=>q.eq('event_id',event.id)),paged('scouting_assignments',q=>['admin','developer'].includes(viewer.role)?q:q.eq('scout_user_id',viewer.userId)),paged('form_definitions',q=>q.eq('organization_id',viewer.organizationId).eq('is_active',true)),paged('scouting_entries',q=>q.eq('event_id',event.id).order('created_at',{ascending:false}).order('id')),optional('pit_photos',q=>q.eq('event_id',event.id)),optional('shared_picklist_rankings',q=>q.eq('event_id',event.id)),optional('picklist_categories',q=>q.eq('organization_id',viewer.organizationId)),optional('picklist_tags',q=>q.eq('organization_id',viewer.organizationId)),optional('event_global_documents',q=>q.eq('event_id',event.id)),optional('match_report_sources',q=>q.eq('event_id',event.id)),optional('prescout_assignments',q=>q.eq('event_id',event.id)),optional('strategy_drawings',q=>q.eq('event_id',event.id).eq('user_id',viewer.userId))]);
 const ids=eventTeamRows.map(r=>r.team_id);const teamRows=ids.length?await paged('teams',q=>q.eq('organization_id',viewer.organizationId).in('id',ids)):[];
 const picklistHistory=await optional('picklist_change_log',q=>q.eq('event_id',event.id).order('created_at',{ascending:false}));
 const authorIds=[...new Set([viewer.userId,...entries.map(e=>e.scout_user_id),...picklistHistory.map(h=>h.actor_user_id).filter(Boolean)])];
 const profileRows=authorIds.length?await optional('profiles',q=>q.in('id',authorIds)):[];
 if(photos.length){const {data:signed}=await c.storage.from('pit-photos').createSignedUrls(photos.map(p=>p.storage_path),3600);for(const photo of photos)photo.signedUrl=signed?.find(p=>p.path===photo.storage_path)?.signedUrl;}
 const {data:allowed}=await c.rpc('can_view_picklist',{target_organization:viewer.organizationId});
 const eventIds=new Set(matches.map(m=>m.id));const aliases=(event as any).tba_team_remaps||{};
 const result:EventBundle={event,teams:teamRows.map(t=>({id:t.id,number:t.team_number,displayNumber:String(aliases[`frc${t.team_number}`]??aliases[String(t.team_number)]??t.team_number),name:t.name})),matches,assignments:assignments.filter(a=>eventIds.has(a.match_id)),forms:forms.flatMap(f=>{const parsed=formDefinitionSchema.safeParse(f.schema_json);return parsed.success?[{id:f.id,version:f.version,name:f.name,definition:parsed.data}]:[]}),entries,photos,rankings,categories,tags,globalDocument:documents[0]?.document_url??null,robotProfiles:Object.fromEntries(eventTeamRows.map(p=>[p.team_id,{drivetrain_type:p.drivetrain_type,shooter_type:p.shooter_type}])),reportSources,prescoutAssignments,strategyDrawings,canViewPicklist:allowed===true,downloadedAt:new Date().toISOString(),scope:scopedIdentity(viewer.userId,viewer.organizationId)};
 result.teams=result.teams.map(t=>({...t,displayNumber:t.displayNumber.replace(/^frc/i,'')}));
 result.profiles=Object.fromEntries(profileRows.map(p=>[p.id,p.display_name||'Scout']));
 result.picklistHistory=picklistHistory;
 if(!event.is_manual){try{const official=await apiRequest<EventBundle['official']>(`/api/mobile/tba?eventId=${encodeURIComponent(event.id)}`,'GET',undefined,{expectedUserId:viewer.userId,expectedOrganizationId:viewer.organizationId});result.official=official?.apiError&&previous?.official?{...previous.official,apiError:official.apiError+' · showing the last downloaded official data'}:official;}catch(e){result.official=previous?.official?{...previous.official,apiError:(e as Error).message+' · showing the last downloaded official data'}:{rankings:[],sortInfo:[],oprs:{},apiError:(e as Error).message}}}
 return result;
}
export async function uploadSnapshot(record:LocalSubmission,expectedUserId?:string):Promise<string|null>{
 const c=requireClient();const validated=validateNativeEntry(record.entry);const {updated_at:_,...entry}=validated;
 if(expectedUserId){const {data,error}=await c.auth.getUser();if(error||data.user?.id!==expectedUserId)throw Error('Sign in as the owner of this workspace before uploading. Your report is retained.');}
 const binding={expectedUserId,expectedOrganizationId:entry.organization_id};
 if(record.origin==='relay'&&record.proof){const {entry:received}=await apiRequest<{entry:NativeEntry}>('/api/mobile/relay','POST',record.proof,binding);return received.updated_at??null;}
 if(record.origin==='relay')throw Error('Unsigned receipt is retained as a backup. The original scout must enable signed relay and re-export before cloud delivery.');
 const {data:remote,error:readError}=await c.from('scouting_entries').select('*').eq('id',entry.id).maybeSingle();if(readError)throw readError;
 if(remote&&sameReport(entry,remote as NativeEntry))return remote.updated_at??null;
 // The server may link a manual report to an official match after insertion.
 // Preserve that link on later score-only edits; never infer a new identity here.
 if(remote&&entry.match_id===null&&remote.match_id&&entry.payload.report_source==='manual'&&sameManualIdentity(entry.payload,remote.payload))entry.match_id=remote.match_id;
 const confirm=async()=>{const {data:confirmed,error}=await c.from('scouting_entries').select('*').eq('id',entry.id).maybeSingle();if(error)throw error;if(!confirmed||!sameReport(entry,confirmed as NativeEntry))throw Error('The upload was sent but its exact report could not be confirmed. Your local revision is retained; refresh and retry.');return confirmed.updated_at??null;};
 if(remote){if(!record.baseUpdatedAt||record.baseUpdatedAt!==remote.updated_at)throw Error('Conflict: this report was changed on another device. Your local copy is retained.');const {data,error}=await c.from('scouting_entries').update(entry).eq('id',entry.id).eq('updated_at',record.baseUpdatedAt).select('updated_at').maybeSingle();if(error||!data){await apiRequest<{entry:NativeEntry}>('/api/mobile/reports','PATCH',{entry,expectedUpdatedAt:record.baseUpdatedAt},binding);}return confirm();}
 const {error}=await c.from('scouting_entries').insert(entry).select('updated_at').single();if(error){const {data:after}=await c.from('scouting_entries').select('*').eq('id',entry.id).maybeSingle();if(after&&sameReport(entry,after as NativeEntry))return after.updated_at??null;throw error;}return confirm();
}
export async function writePicklist(viewer:Viewer,eventId:string,teamId:string,patch:Partial<PicklistRanking>){
 const allowed=['admin','developer','global_scout','strategist','master'].includes(viewer.role);
 if(!allowed)throw Error('Your role cannot edit the shared picklist.');
 const c=requireClient();
 const {data:existing,error:readError}=await c.from('shared_picklist_rankings').select('id').eq('event_id',eventId).eq('team_id',teamId).maybeSingle();
 if(readError)throw readError;
 const fields={rank:patch.rank,category_id:patch.category_id,note:patch.note,selected:patch.selected,tag_ids:patch.tag_ids,updated_by:viewer.userId};
 const query=existing?c.from('shared_picklist_rankings').update(fields).eq('id',existing.id):c.from('shared_picklist_rankings').insert({...fields,organization_id:viewer.organizationId,event_id:eventId,team_id:teamId,created_by:viewer.userId});
 const {data,error}=await query.select('id');
 if(error)throw error;
 if(!data?.length)throw Error('The server did not authorize this picklist change.');
}
export type PicklistRow={team_id:string;rank:number|null;category_id:string|null;note:string;selected:boolean;tag_ids:string[]};
/** One request for a multi-team change, like the website's picklist board (upsert on event_id,team_id). */
export async function writePicklistBulk(viewer:Viewer,eventId:string,rows:PicklistRow[],createdBy:Record<string,string|undefined>={}){
 if(!rows.length)return;
 if(!['admin','developer','global_scout','strategist','master'].includes(viewer.role))throw Error('Your role cannot edit the shared picklist.');
 const payload=rows.map(row=>({organization_id:viewer.organizationId,event_id:eventId,team_id:row.team_id,created_by:createdBy[row.team_id]??viewer.userId,updated_by:viewer.userId,rank:row.rank,category_id:row.category_id,note:row.note,selected:row.selected,tag_ids:row.tag_ids}));
 const {data,error}=await requireClient().from('shared_picklist_rankings').upsert(payload,{onConflict:'event_id,team_id'}).select('id,team_id');
 if(error)throw error;
 if((data?.length??0)!==rows.length)throw Error('The server did not authorize every picklist change. Refresh and try again.');
}
export function emptyRebuilt():Payload{return {no_show:false,starting_spot:null,starting_spot_confirmed:false,auto:{shoot:0,ferry:0},teleop:{shoot:0,ferry:0},auto_fuel:0,teleop_fuel:0,fouls:0,defense:false,defense_level:null,defended_teams:[],robot_broke:false,breakage_issues:[],comments:'',report_source:'scheduled',manual_match:null};}
