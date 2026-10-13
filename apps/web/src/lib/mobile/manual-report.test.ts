import test from "node:test";
import assert from "node:assert/strict";
import { assertFixedManualMetadata, MobileError, type Actor, type MobileDatabase } from "./operations";
import { correctManualReport, manualCandidate, type ManualCandidate } from "./manual-report";

const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12,"0")}`;
const time = "2026-10-13T00:00:00.000Z";
const actor: Actor = { userId: id(1), organizationId: id(2), role: "scout" };
const metadata = { stage: "Qualification" as const, label: "1", alliance: "red" as const };
const payload = { no_show:false,auto:{shoot:0,ferry:0},teleop:{shoot:0,ferry:0},auto_fuel:0,teleop_fuel:0,fouls:0,defense:false,defense_level:null,defended_teams:[],robot_broke:false,breakage_issues:[],comments:"",manual_match:metadata,report_source:"manual" };
const entry = { id:id(3),organization_id:id(2),event_id:id(4),team_id:id(5),match_id:null,assignment_id:null,scout_user_id:id(1),entry_type:"match",form_version:4,status:"submitted",submitted_at:time,updated_at:time,payload };
const match: ManualCandidate = { id:id(9),match_type:"qualification",match_number:1,tba_match_key:"2026test_qm1",red_teams:[id(5)],blue_teams:[id(6)] };
const errorStatus = (status: number) => (error: unknown) => error instanceof MobileError && error.status === status;
function fake(results: Record<string,{data:any;error?:unknown}[]>) {
  const writes: any[] = [];
  const database: MobileDatabase = { auth:{getUser:async()=>({})},rpc:async(name,args)=>{writes.push({name,args});return results[name]?.shift()??{data:null};},from(table) {
    let patch: unknown;
    const execute = () => { if(patch)writes.push({table,patch}); return Promise.resolve(results[table]?.shift() ?? {data:null}); };
    const query:any = {select:()=>query,eq:()=>query,order:()=>query,range:()=>query,update:(value:unknown)=>{patch=value;return query;},maybeSingle:execute,then:(resolve:any,reject:any)=>execute().then(resolve,reject)};
    return query;
  }};
  return {database,writes};
}
const request = { entryId:entry.id,eventId:entry.event_id,teamId:entry.team_id,payload,expectedUpdatedAt:time };
const ready = (): Record<string,{data:any;error?:unknown}[]> => ({events:[{data:{id:entry.event_id,organization_id:actor.organizationId}}],scouting_entries:[{data:entry}],mobile_correct_manual_report:[{data:{entry:{...entry,match_id:match.id}}}],event_teams:[{data:{team_id:entry.team_id}}],matches:[{data:[match]}]});

test("generic correction freezes stage/label/alliance/source and indirect linking", () => {
  for (const patch of [{stage:"Final"},{label:"2"},{alliance:"blue"}]) assert.throws(()=>assertFixedManualMetadata(payload,{...payload,manual_match:{...metadata,...patch}}),errorStatus(422));
  assert.throws(()=>assertFixedManualMetadata(payload,{...payload,report_source:"scheduled"}),errorStatus(422));
  assert.throws(()=>assertFixedManualMetadata({},payload),errorStatus(422));
  assertFixedManualMetadata({}, {manual_match:null,report_source:"scheduled"});
  assertFixedManualMetadata(payload,{...payload,comments:"score-only correction"});
});
test("manual matching follows website stage/type, number and unambiguous robot slot", () => {
  assert.equal(manualCandidate([match],entry.team_id,metadata)?.id,match.id);
  assert.equal(manualCandidate([match],entry.team_id,{...metadata,stage:"Final"}),null);
  assert.equal(manualCandidate([match, {...match,id:id(10)}],entry.team_id,metadata),null);
  assert.equal(manualCandidate([match],entry.team_id,{...metadata,alliance:"blue"})?.id,match.id);
  assert.equal(manualCandidate([match],entry.team_id,{...metadata,stage:"Semifinal",label:"2–1"}),null);
});
test("manual correction retains website playoff labels without inventing a schedule link",async()=>{
 const results=ready();const correctedPayload={...payload,manual_match:{...metadata,stage:"Semifinal",label:"2–1"}};
 results.mobile_correct_manual_report=[{data:{entry:{...entry,payload:correctedPayload}}}];
 const {database,writes}=fake(results);
 await correctManualReport(database,actor,{...request,payload:correctedPayload});
 assert.equal(writes[0].args.corrected_match_id,null);
 assert.equal(writes[0].args.corrected_payload.manual_match.label,"2–1");
});
test("manual correction preserves author/event/UUID and returns post-trigger readback", async () => {
  const {database,writes}=fake(ready());
  const result=await correctManualReport(database,actor,request);
  assert.equal(result.entry.match_id,match.id);
  assert.deepEqual(writes[0].args,{target_entry_id:entry.id,target_organization_id:actor.organizationId,target_event_id:entry.event_id,caller_user_id:actor.userId,expected_updated_at:time,corrected_team_id:entry.team_id,corrected_match_id:match.id,corrected_payload:payload});
  assert.equal(writes[0].name,"mobile_correct_manual_report");
});
test("another author's manual report is not editable by strategist/global scout",async()=>{
  for(const role of ["strategist","global_scout"] as const){
    const results=ready();results.scouting_entries=[{data:{...entry,scout_user_id:id(7)}}];
    const {database,writes}=fake(results);
    await assert.rejects(correctManualReport(database,{...actor,role},request),errorStatus(403));assert.equal(writes.length,0);
  }
});
test("invalid team and stale CAS prevent all writes",async()=>{
  const results=ready();results.event_teams=[{data:null}];
  await assert.rejects(correctManualReport(fake(results).database,actor,request),errorStatus(422));
  await assert.rejects(correctManualReport(fake(ready()).database,actor,{...request,expectedUpdatedAt:"2026-10-13T00:00:01.000Z"}),errorStatus(409));
});
test("scheduled reports cannot be converted into manual reports",async()=>{
  const results=ready();results.scouting_entries=[{data:{...entry,payload:{...payload,manual_match:null}}}];
  await assert.rejects(correctManualReport(fake(results).database,actor,request),errorStatus(404));
});
test("manual movement has no nontransactional fallback when RPC unavailable",async()=>{
  const results=ready();results.mobile_correct_manual_report=[{data:null,error:{code:"PGRST202"}}];
  const {database,writes}=fake(results);
  await assert.rejects(correctManualReport(database,actor,request),errorStatus(503));
  assert.equal(writes.length,1);assert.equal(writes[0].name,"mobile_correct_manual_report");
});
