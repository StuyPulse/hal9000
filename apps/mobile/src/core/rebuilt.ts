import type {Payload} from './types';
export const STARTING_SPOTS=[['depot','Depot'],['depot-bump','Depot Bump'],['hub','Hub'],['outpost-bump','Outpost Bump'],['outpost','Outpost'],['depot-trench','Depot Trench'],['outpost-trench','Outpost Trench']] as const;
export const BREAKAGE_TAGS=['Intake broke','Shooter broke','Drive issue','Electrical','Other'];
const count=(n:unknown)=>typeof n==='number'&&Number.isFinite(n)?Math.max(0,Math.floor(n)):0;
export function normalizeMatchTimestamp(value:string):string {
 const [rawMinutes='',rawSeconds='']=value.split(':');
 const minutes=rawMinutes.replace(/\D/g,'').slice(0,1),seconds=rawSeconds.replace(/\D/g,'').slice(0,2);
 return !minutes&&!seconds?'':`${minutes||'0'}:${String(Math.min(59,Number(seconds||0))).padStart(2,'0')}`;
}
export function initialBreakageIssues(payload:Payload):{timestamp:string;issue:string|null}[]{
 const saved=Array.isArray(payload.breakage_issues)?payload.breakage_issues:[];
 const items=saved.map(value=>{const item=value as Record<string,unknown>;return {timestamp:normalizeMatchTimestamp(String(item.timestamp??'')),issue:typeof item.issue==='string'?item.issue:null}});
 if(items.length)return items;
 return payload.break_tag||payload.break_timestamp?[{timestamp:normalizeMatchTimestamp(String(payload.break_timestamp??'')),issue:typeof payload.break_tag==='string'?payload.break_tag:null}]:[];
}
export function normalizeRebuilt(payload:Payload):Payload{
 const noShow=payload.no_show===true;const auto=(payload.auto??{}) as Record<string,unknown>,teleop=(payload.teleop??{}) as Record<string,unknown>;
 const a={shoot:noShow?0:count(auto.shoot),ferry:noShow?0:count(auto.ferry)},t={shoot:noShow?0:count(teleop.shoot),ferry:noShow?0:count(teleop.ferry)};
 const broke=!noShow&&payload.robot_broke===true,defense=!noShow&&payload.defense===true;
 const issues=broke?initialBreakageIssues(payload).map(issue=>({...issue,issue:issue.issue?.trim()||null})).filter(i=>i.timestamp||i.issue):[];
 return {...payload,no_show:noShow,no_show_reason:noShow?'No show':null,starting_spot:noShow?null:payload.starting_spot??null,starting_spot_confirmed:!noShow&&Boolean(payload.starting_spot),auto:a,teleop:t,auto_fuel:a.shoot+a.ferry,teleop_fuel:t.shoot+t.ferry,fouls:noShow?0:count(payload.fouls),defense,defense_level:defense?Math.min(10,Math.max(1,count(payload.defense_level)||5)):null,defended_teams:defense&&Array.isArray(payload.defended_teams)?payload.defended_teams.slice(0,3):[],robot_broke:broke,breakage_issues:issues,break_timestamp:issues[0]?.timestamp??null,break_tag:issues[0]?.issue??null,comments:String(payload.comments??'')};
}
