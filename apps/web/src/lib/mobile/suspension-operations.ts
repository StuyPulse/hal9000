import {z} from 'zod';
import {requireManager} from './admin-operations';
import {MobileError,type Actor,type MobileDatabase} from './operations';
export async function changeSuspension(db:MobileDatabase,actor:Actor,input:unknown){
 requireManager(actor);
 const v=z.object({userId:z.string().uuid(),restore:z.boolean(),reason:z.string().trim().min(1).max(500)}).strict().parse(input);
 if(v.userId===actor.userId)throw new MobileError(422,'cannot_suspend_self','You cannot change your own suspension.');
 if(!db.rpc)throw new MobileError(503,'suspension_unavailable','The suspension migration is not available.');
 const result=await db.rpc('mobile_set_member_suspension',{target_organization:actor.organizationId,caller_user:actor.userId,target_user:v.userId,restore_access:v.restore,suspension_reason:v.reason});
 if(result.error)throw new MobileError(409,'suspension_failed','Access was not confirmed changed. The final admin cannot be suspended. Refresh and retry.');
 if(!result.data||result.data.code)throw new MobileError(result.data?.code==='forbidden'?403:409,'suspension_failed','The member is unavailable or your permission changed.');
 if(result.data.suspended!==!v.restore)throw new MobileError(503,'suspension_unconfirmed','The server did not confirm the access change. Refresh before retrying.');
 return result.data;
}
export async function listSuspensions(db:MobileDatabase,actor:Actor){
 requireManager(actor);
 const result=await db.from('member_suspensions').select('user_id,previous_role,reason,suspended_at,profiles(display_name)').eq('organization_id',actor.organizationId).is('restored_at',null).order('suspended_at',{ascending:false}).limit(500);
 if(result.error)throw new MobileError(503,'suspension_unavailable','Suspended members could not be loaded.');
 return {suspensions:result.data??[]};
}
