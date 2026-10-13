import {z} from 'zod';

const count=z.number().finite().int().min(0).max(100000);
const score=z.object({shoot:count,ferry:count});
export const rebuiltPayloadSchema=z.object({
 no_show:z.boolean(),starting_spot:z.enum(['depot','depot-bump','hub','outpost-bump','outpost','depot-trench','outpost-trench','line-1','line-2']).nullable().optional(),starting_spot_confirmed:z.boolean().optional(),
 auto:score,teleop:score,auto_fuel:count,teleop_fuel:count,fouls:count,
 defense:z.boolean(),defense_level:z.number().int().min(1).max(10).nullable(),defended_teams:z.array(z.string().uuid()).max(3),
 robot_broke:z.boolean(),breakage_issues:z.array(z.object({timestamp:z.string().max(4).nullable(),issue:z.string().max(300).nullable()})).max(30),
 comments:z.string().max(10000),report_source:z.enum(['scheduled','manual']).optional(),manual_match:z.record(z.string(),z.unknown()).nullable().optional(),
}).passthrough();
export const nativeEntrySchema=z.object({
 id:z.string().uuid(),organization_id:z.string().uuid(),event_id:z.string().uuid(),team_id:z.string().uuid(),match_id:z.string().uuid().nullable(),assignment_id:z.string().uuid().nullable(),scout_user_id:z.string().uuid(),
 entry_type:z.enum(['match','pit','pre_scout']),form_version:z.number().int().positive(),payload:z.record(z.string(),z.unknown()),status:z.enum(['draft','submitted']),submitted_at:z.string().datetime({offset:true}).nullable(),updated_at:z.string().optional(),
});
export const manualMatchMetadataSchema=z.object({stage:z.enum(['Qualification','Practice','Quarterfinal','Semifinal','Final','Other / exception']),label:z.string().trim().max(30).nullable(),alliance:z.enum(['red','blue'])}).strict().superRefine((value,ctx)=>{if(value.stage!=='Other / exception'&&!/^[1-9]\d{0,5}$/.test(value.label??''))ctx.addIssue({code:'custom',message:'Enter a positive match number (up to six digits).',path:['label']})});
export function normalizeNativePayload(kind:'match'|'pit'|'pre_scout',payload:Record<string,unknown>){if(kind==='pre_scout'&&payload.average_pieces===''){const {average_pieces:_,...rest}=payload;return rest}return payload;}
export function validateNativeEntry(value:unknown){
 const entry=nativeEntrySchema.parse(value);
 if(entry.entry_type==='match'){
  if('climb' in entry.payload||'shifts' in entry.payload)throw Error('This scouting form does not support climb or shifts fields.');
  if(entry.form_version===4){rebuiltPayloadSchema.parse(entry.payload);if(entry.status==='submitted'&&entry.payload.manual_match)manualMatchMetadataSchema.parse(entry.payload.manual_match);}
 }else{
  if(entry.entry_type==='pit'&&'climb' in entry.payload)throw Error('Pit scouting does not support the removed climb field.');
  if(entry.entry_type==='pre_scout'&&Object.hasOwn(entry.payload,'average_pieces')&&!/^[0-9]{1,3}$/.test(String(entry.payload.average_pieces??'')))throw Error('Average game pieces must be a whole number up to 999, or left unrecorded.');
  for(const value of Object.values(entry.payload))if(typeof value==='string'&&value.length>200000)throw Error('A scouting text field exceeds the supported length.');
 }
 return entry;
}
