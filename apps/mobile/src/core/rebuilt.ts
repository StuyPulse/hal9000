import type {Payload} from './types';
export const STARTING_SPOTS=[['depot','Depot'],['depot-bump','Depot Bump'],['hub','Hub'],['outpost-bump','Outpost Bump'],['outpost','Outpost'],['depot-trench','Depot Trench'],['outpost-trench','Outpost Trench']] as const;
export const BREAKAGE_TAGS=['Intake broke','Shooter broke','Drive issue','Electrical','Other'];
const count=(n:unknown)=>typeof n==='number'&&Number.isFinite(n)?Math.max(0,Math.floor(n)):0;
export function normalizeRebuilt(payload:Payload):Payload{
 const noShow=payload.no_show===true;const auto=(payload.auto??{}) as Record<string,unknown>,teleop=(payload.teleop??{}) as Record<string,unknown>;
 const a={shoot:noShow?0:count(auto.shoot),ferry:noShow?0:count(auto.ferry)},t={shoot:noShow?0:count(teleop.shoot),ferry:noShow?0:count(teleop.ferry)};
 const broke=!noShow&&payload.robot_broke===true,defense=!noShow&&payload.defense===true;
 const issues=broke&&Array.isArray(payload.breakage_issues)?payload.breakage_issues.map(i=>{const issue=i as Record<string,unknown>;return {timestamp:String(issue.timestamp??'').slice(0,4),issue:String(issue.issue??'').trim()||null}}).filter(i=>i.timestamp||i.issue):[];
 return {...payload,no_show:noShow,no_show_reason:noShow?'No show':null,starting_spot:noShow?null:payload.starting_spot??null,starting_spot_confirmed:!noShow&&Boolean(payload.starting_spot),auto:a,teleop:t,auto_fuel:a.shoot+a.ferry,teleop_fuel:t.shoot+t.ferry,fouls:noShow?0:count(payload.fouls),defense,defense_level:defense?Math.min(10,Math.max(1,count(payload.defense_level)||5)):null,defended_teams:defense&&Array.isArray(payload.defended_teams)?payload.defended_teams.slice(0,3):[],robot_broke:broke,breakage_issues:issues,break_timestamp:issues[0]?.timestamp??null,break_tag:issues[0]?.issue??null,comments:String(payload.comments??'')};
}
