import {listValues,putValue} from './storage';
import {apiRequest} from './mobile-api';
import {createSafetyQueue,type QueuedSafetyReport} from './safety-queue';
const queues=new Map<string,ReturnType<typeof createSafetyQueue>>();
export function safetyQueue(scope:string){
 let queue=queues.get(scope);if(queue)return queue;
 const [mode,userId,organizationId]=scope.split(':');
 queue=createSafetyQueue({put:(id,row)=>putValue(scope,'safety-report',id,row),list:()=>listValues<QueuedSafetyReport>(scope,'safety-report')},async report=>{
  if(mode!=='live')throw Error('Practice safety reports stay on this device.');
  return apiRequest<{id:string}>('/api/mobile/safety','POST',report,{expectedUserId:userId,expectedOrganizationId:organizationId});
 });queues.set(scope,queue);return queue;
}
