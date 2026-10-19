import test from 'node:test';
import assert from 'node:assert/strict';
import {changeSuspension} from './suspension-operations';
import {type Actor,type MobileDatabase,MobileError} from './operations';
const id=(n:number)=>`00000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
const actor:Actor={userId:id(1),organizationId:id(2),role:'admin'},input={userId:id(3),restore:false,reason:'Reviewed abuse report'};
test('nonmanagers and self suspension are blocked before the database',async()=>{
 const db={rpc:async()=>assert.fail('no access change')} as unknown as MobileDatabase;
 await assert.rejects(changeSuspension(db,{...actor,role:'scout'},input),(e:any)=>e.status===403);
 await assert.rejects(changeSuspension(db,actor,{...input,userId:actor.userId}),(e:any)=>e.status===422);
});
test('server binds caller and organization; input cannot forge either',async()=>{
 let args:any;
 const db={rpc:async(name:string,value:any)=>{assert.equal(name,'mobile_set_member_suspension');args=value;return {data:{suspended:true}}}} as unknown as MobileDatabase;
 assert.deepEqual(await changeSuspension(db,actor,input),{suspended:true});assert.equal(args.caller_user,actor.userId);assert.equal(args.target_organization,actor.organizationId);
 await assert.rejects(changeSuspension(db,actor,{...input,organizationId:id(9)}));
});
test('database refusals and missing migrations never report success',async()=>{
 for(const result of [{error:{message:'last admin'}},{data:{code:'forbidden'}},{data:null},{data:{suspended:false}}]){
  await assert.rejects(changeSuspension({rpc:async()=>result} as unknown as MobileDatabase,actor,input),MobileError);
 }
 await assert.rejects(changeSuspension({} as MobileDatabase,actor,input),MobileError);
});
test('restoration must explicitly confirm restored state',async()=>{
 const db={rpc:async()=>({data:{suspended:false}})} as unknown as MobileDatabase;
 assert.deepEqual(await changeSuspension(db,actor,{...input,restore:true}),{suspended:false});
});
