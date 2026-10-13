import {DEFAULT_2026_FORM} from '@wildcard/shared';
import type {EventBundle,Viewer} from './types';
import {scopedIdentity} from './sync-model';
export const DEMO_VIEWER:Viewer={userId:'00000000-0000-4000-8000-000000000001',organizationId:'00000000-0000-4000-8000-000000000002',role:'developer',displayName:'Local practice scout',demo:true};
export function demoBundle():EventBundle{
 const eventId='00000000-0000-4000-8000-000000000003';
 const teams=[694,1678,254,118,115,148].map((n,i)=>({id:`00000000-0000-4000-8000-${String(10+i).padStart(12,'0')}`,number:n,displayNumber:String(n),name:['StuyPulse','Citrus Circuits','The Cheesy Poofs','Robonauts','MVRT','Robowranglers'][i]}));
 const matches=[18,21,24].map((n,i)=>({id:`00000000-0000-4000-8000-${String(30+i).padStart(12,'0')}`,event_id:eventId,match_number:n,match_type:'qualification',status:'scheduled',red_teams:teams.slice(0,3).map(t=>t.id),blue_teams:teams.slice(3).map(t=>t.id),scheduled_at:null}));
 return {event:{id:eventId,organization_id:DEMO_VIEWER.organizationId,name:'Local practice event',event_key:'demo',status:'active',is_manual:true},teams,matches,assignments:matches.map((m,i)=>({id:`00000000-0000-4000-8000-${String(50+i).padStart(12,'0')}`,match_id:m.id,team_id:teams[i].id,scout_user_id:DEMO_VIEWER.userId,assignment_type:'objective',status:'pending'})),forms:[{id:'example-form',version:4,name:'REBUILT',definition:DEFAULT_2026_FORM}],entries:[],photos:[],rankings:[],categories:[],tags:[],globalDocument:null,robotProfiles:{},reportSources:[],canViewPicklist:true,downloadedAt:new Date().toISOString(),scope:scopedIdentity(DEMO_VIEWER.userId,DEMO_VIEWER.organizationId,true)};
}
