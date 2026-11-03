import test from 'node:test';
import assert from 'node:assert/strict';
import {eventInput,teamInput,matchInput,validateMatchTeams,requireSetup,aliasInput,editableFormSchema,planAssignments,protectAssignment,resultInput,inviteInput} from './setup-model';
import {DEMO_VIEWER,demoBundle} from './demo';
import {assertSetupIdentity} from './setup-model';
import {assertAssignmentSlotOpen,assertBundleAssignmentSlotOpen,eventTeamNumberFromInput,manualLineupNumbers,editableRoles,invitationRoles,manualCompletionPatch} from './setup-model';
import {assignableRoles,assertAssignableRole,assertManualAssignmentAllowed,canOpenEmailAccess,practiceClearPlan,successAfterRefresh} from './setup-model';
import type {EventBundle} from './types';
test('setup operation is bound to its original account',()=>{assert.doesNotThrow(()=>assertSetupIdentity(DEMO_VIEWER.userId,DEMO_VIEWER.userId));assert.throws(()=>assertSetupIdentity(DEMO_VIEWER.userId,'another-user'),/Account changed/);assert.throws(()=>assertSetupIdentity(DEMO_VIEWER.userId,null),/Account changed/);});
test('setup requires an admin/developer role',()=>{assert.throws(()=>requireSetup({...DEMO_VIEWER,role:'scout'}));assert.doesNotThrow(()=>requireSetup(DEMO_VIEWER))});
test('team and event input validation',()=>{assert.equal(teamInput.parse({number:'694',name:' StuyPulse '}).number,694);assert.equal(teamInput.safeParse({number:0,name:'x'}).success,false);assert.equal(eventInput.safeParse({name:'',date:'2026-10-13'}).success,false)});
test('a match rejects duplicate and out-of-event teams',()=>{const b=demoBundle(),red=[b.teams[0].id],blue=[b.teams[1].id];assert.equal(matchInput.safeParse({number:2,type:'practice',red,blue:red}).success,false);assert.doesNotThrow(()=>validateMatchTeams({number:2,type:'practice',red,blue},b));assert.throws(()=>validateMatchTeams({number:2,type:'practice',red,blue:['00000000-0000-4000-8000-999999999999']},b))});
test('assignment generation preserves occupied slots and rotates scouts',()=>{const b=demoBundle();const scouts=[b.assignments[0].scout_user_id,'00000000-0000-4000-8000-999999999999'];const plan=planAssignments(b,scouts).assignments;assert.ok(plan.length);assert.ok(plan.every(a=>!b.assignments.some(old=>old.assignment_type==='objective'&&old.match_id===a.match_id&&old.team_id===a.team_id)));// The demo scout already holds a robot in every demo match, so only the second scout is used, once per match.
assert.ok(plan.every(a=>a.scout_user_id===scouts[1]));assert.equal(plan.length,b.matches.length);assert.throws(()=>planAssignments(b,[]));});
test('completed or submitted assignments cannot be removed',()=>{const b=demoBundle(),a=b.assignments[0];assert.doesNotThrow(()=>protectAssignment(b,a.id));assert.throws(()=>protectAssignment({...b,assignments:[{...a,status:'complete'}]},a.id));assert.throws(()=>protectAssignment({...b,entries:[{...b.entries[0],assignment_id:a.id,status:'submitted'}]},a.id));});
test('form builder rejects duplicate IDs and invalid select choices',()=>{const field={id:'fuel',label:'Fuel',type:'counter',section:'auto',required:true};assert.equal(editableFormSchema.safeParse({title:'Game',gameYear:2027,fields:[field,field]}).success,false);assert.equal(editableFormSchema.safeParse({title:'Game',gameYear:2027,fields:[{...field,type:'select',options:['A','A']}]}).success,false);assert.equal(editableFormSchema.safeParse({title:'Game',gameYear:2027,fields:[{...field,type:'select',options:['A','B']}]}).success,true);});
test('alias, scores, dates and invitation inputs are bounded',()=>{assert.equal(aliasInput.parse('694B'),'694B');assert.equal(aliasInput.safeParse('frc694').success,false);assert.equal(resultInput.safeParse({redScore:-1,blueScore:0}).success,false);assert.equal(resultInput.safeParse({redScore:1.5,blueScore:0}).success,false);assert.equal(eventInput.safeParse({name:'Test',date:'2026-02-30'}).success,false);assert.equal(inviteInput.parse({email:' TEST@example.com ',role:'scout'}).email,'test@example.com');});
test('admins can grant master; only a developer can grant developer',()=>{assert.deepEqual(invitationRoles,['scout','global_scout','strategist','master','admin']);assert.deepEqual(editableRoles,invitationRoles);assert.deepEqual(assignableRoles('admin'),['scout','global_scout','strategist','master','admin']);assert.deepEqual(assignableRoles('developer'),['scout','global_scout','strategist','master','admin','developer']);assert.throws(()=>assertAssignableRole('admin','developer'),/developer/);assert.doesNotThrow(()=>assertAssignableRole('developer','developer'));assert.doesNotThrow(()=>assertAssignableRole('admin','master'));});
test('manual completion preserves unknown and previously recorded scores',()=>{assert.deepEqual(manualCompletionPatch(),{status:'played'});assert.deepEqual({...{red_score:null,blue_score:7},...manualCompletionPatch()},{red_score:null,blue_score:7,status:'played'});});
test('website manual event date range remains optional and ordered',()=>{assert.equal(eventInput.safeParse({name:'AB',date:'2026-10-13'}).success,false);assert.equal(eventInput.safeParse({name:'Practice',date:'2026-10-13',endDate:'2026-10-14'}).success,true);assert.equal(eventInput.safeParse({name:'Practice',date:'2026-10-13',endDate:'2026-10-12'}).success,false);assert.equal(eventInput.parse({name:'Practice',date:'2026-10-13'}).endDate,undefined);});
test('website team input permits an omitted name and mapped robot aliases',()=>{const b=demoBundle();b.teams[0]={...b.teams[0],displayNumber:'694B'};assert.equal(teamInput.parse({number:'694B'}).name,'');assert.equal(eventTeamNumberFromInput('694b',b),b.teams[0].number);assert.equal(eventTeamNumberFromInput('9999',b),9999);assert.throws(()=>eventTeamNumberFromInput('9999B',b),/not mapped/);assert.equal(teamInput.safeParse({number:'100000'}).success,false);});
test('manual alliances accept website comma/space input and new numeric teams',()=>{const b=demoBundle();b.teams[0]={...b.teams[0],number:694,displayNumber:'694B'};assert.deepEqual(manualLineupNumbers('694B, 9999 694B','1234',b),{red:[694,9999],blue:[1234]});assert.throws(()=>manualLineupNumbers('694B','694',b),/distinct/);assert.throws(()=>manualLineupNumbers('1 2 3 4','5',b),/one to three/);assert.throws(()=>manualLineupNumbers('','1234',b));});
test('adding a scout refuses a completed or submitted slot, not merely duplicates',()=>{assert.throws(()=>assertAssignmentSlotOpen([{id:'a',status:'complete'}],new Set()),/submitted/);assert.throws(()=>assertAssignmentSlotOpen([{id:'a',status:'pending'}],new Set(['a'])),/submitted/);assert.doesNotThrow(()=>assertAssignmentSlotOpen([{id:'a',status:'pending'}],new Set()));const b=demoBundle(),a=b.assignments[0];assert.throws(()=>assertBundleAssignmentSlotOpen({...b,assignments:[{...a,status:'complete'}]},a.match_id,a.team_id));});
test('assignment preview matches backend schedule/id and user-id ordering regardless of fetch order',()=>{const b=demoBundle(),scouts=['00000000-0000-4000-8000-999999999999','00000000-0000-4000-8000-111111111111'];assert.deepEqual(planAssignments(b,scouts),planAssignments({...b,matches:[...b.matches].reverse(),assignments:[...b.assignments].reverse()},[...scouts].reverse()));});
const uid=(n:number)=>`00000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
function scheduleBundle(statuses:string[]):EventBundle{const b=demoBundle();const teams=b.teams.slice(0,6).map(t=>t.id);return {...b,assignments:[],matches:statuses.map((status,i)=>({id:uid(700+i),event_id:b.event.id,match_number:i+1,match_type:'qualification',status,red_teams:teams.slice(0,3),blue_teams:teams.slice(3,6),scheduled_at:null}))};}
test('assignment preview never gives one scout two robots in a match and leaves slots open when the roster is short',()=>{
 const b=scheduleBundle(['scheduled','scheduled']);const scouts=[uid(901),uid(902),uid(903),uid(904)];const plan=planAssignments(b,scouts);
 for(const m of b.matches){const used=plan.assignments.filter(a=>a.match_id===m.id).map(a=>a.scout_user_id);assert.equal(new Set(used).size,used.length);assert.equal(used.length,4);}
 assert.equal(plan.unfilled,4);assert.equal(plan.assignments.length,8);
});
test('assignment preview skips played, complete and cancelled matches',()=>{
 const b=scheduleBundle(['played','complete','cancelled','scheduled']);const plan=planAssignments(b,[uid(901),uid(902),uid(903),uid(904),uid(905),uid(906)]);
 assert.equal(plan.skippedMatches,3);assert.ok(plan.assignments.every(a=>a.match_id===b.matches[3].id));assert.equal(plan.assignments.length,6);assert.equal(plan.unfilled,0);
});
test('assignment preview does not reuse a scout who already holds a robot in that match',()=>{
 const b=scheduleBundle(['scheduled']);const m=b.matches[0];b.assignments=[{id:uid(950),match_id:m.id,team_id:m.red_teams[0],scout_user_id:uid(901),assignment_type:'objective',status:'pending'}];
 const plan=planAssignments(b,[uid(901),uid(902)]);assert.deepEqual(plan.assignments.map(a=>a.scout_user_id),[uid(902)]);assert.equal(plan.unfilled,4);
});
test('manual assignment refuses played matches and a scout already on another robot in the match',()=>{
 const b=scheduleBundle(['played','scheduled']);const [played,open]=b.matches;
 assert.throws(()=>assertManualAssignmentAllowed(b,played.id,played.red_teams[0],uid(901)),/played/);
 assert.doesNotThrow(()=>assertManualAssignmentAllowed(b,open.id,open.red_teams[0],uid(901)));
 b.assignments=[{id:uid(950),match_id:open.id,team_id:open.red_teams[0],scout_user_id:uid(901),assignment_type:'objective',status:'pending'}];
 assert.throws(()=>assertManualAssignmentAllowed(b,open.id,open.red_teams[1],uid(901)),/another robot/);
 assert.doesNotThrow(()=>assertManualAssignmentAllowed(b,open.id,open.red_teams[0],uid(901)));
 assert.throws(()=>assertManualAssignmentAllowed(b,open.id,uid(999),uid(901)),/team in the selected match/);
});
test('practice clear keeps prescout assignments with a submitted pre-scout report and submitted match assignments',()=>{
 const b=scheduleBundle(['scheduled']);const m=b.matches[0],[t1,t2]=m.red_teams;
 b.assignments=[{id:uid(950),match_id:m.id,team_id:t1,scout_user_id:uid(901),assignment_type:'objective',status:'pending'},{id:uid(951),match_id:m.id,team_id:t2,scout_user_id:uid(902),assignment_type:'objective',status:'pending'}];
 b.prescoutAssignments=[{event_id:b.event.id,team_id:t1,scout_user_id:uid(901)},{event_id:b.event.id,team_id:t2,scout_user_id:uid(901)}];
 const plan=practiceClearPlan(b,[{assignment_id:uid(951),team_id:t2,scout_user_id:uid(902),entry_type:'match',status:'submitted'},{assignment_id:null,team_id:t1,scout_user_id:uid(901),entry_type:'pre_scout',status:'submitted'},{assignment_id:null,team_id:t2,scout_user_id:uid(901),entry_type:'pre_scout',status:'draft'}]);
 assert.deepEqual(plan.assignments.map(a=>a.id),[uid(950)]);assert.deepEqual(plan.prescout.map(a=>a.team_id),[t2]);assert.deepEqual(plan.keptPrescout.map(a=>a.team_id),[t1]);
});
test('a saved setup change stays reported as saved when the refresh fails',async()=>{
 assert.equal(await successAfterRefresh('Roster created.',async()=>{},()=>'x'),'Roster created.');
 const text=await successAfterRefresh('Roster created.',async()=>{throw Error('timeout')},e=>(e as Error).message);assert.match(text,/^Roster created\./);assert.match(text,/timeout/);
});
test('email access follows the server capability, not the admin role',()=>{
 assert.equal(canOpenEmailAccess({role:'strategist',demo:false,canManageEmailAccess:true}),true);
 assert.equal(canOpenEmailAccess({role:'admin',demo:false,canManageEmailAccess:false}),false);
 assert.equal(canOpenEmailAccess({role:'admin',demo:false}),false);
 assert.equal(canOpenEmailAccess({role:'developer',demo:true}),true);
 assert.equal(canOpenEmailAccess(null),false);
});
