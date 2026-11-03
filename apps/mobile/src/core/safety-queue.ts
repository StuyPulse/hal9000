export type SafetyReport={id:string;eventId:string;targetKind:'report'|'photo'|'workspace';targetId:string|null;reason:'harassment'|'inappropriate'|'privacy'|'other';details:string};
// failed: the server permanently refused it (a retry cannot succeed); discarded: the user dismissed a failed report.
export type QueuedSafetyReport={report:SafetyReport;status:'pending'|'sent'|'failed'|'discarded';error:string|null};
/** Client errors other than timeout/rate limit/expired sign-in will fail the same way on every retry. */
export function isPermanentSafetyError(error:unknown){
 const status=typeof error==='object'&&error!==null&&typeof (error as {status?:unknown}).status==='number'?(error as {status:number}).status:null;
 return status!==null&&status>=400&&status<500&&![401,408,429].includes(status);
}
export function createSafetyQueue(store:{put:(id:string,row:QueuedSafetyReport)=>Promise<void>;list:()=>Promise<QueuedSafetyReport[]>},upload:(report:SafetyReport)=>Promise<{id:string}>) {
 let flushing:Promise<void>|null=null;
 const visible=async()=>(await store.list()).filter(row=>row.status!=='discarded');
 return {
  async save(report:SafetyReport){
   if(!report.details.trim()||report.details.trim().length>2000)throw Error('Describe the problem in 1–2000 characters.');
   await store.put(report.id,{report:{...report,details:report.details.trim()},status:'pending',error:null});
  },
  list:visible,
  /** Only a permanently failed report can be discarded; pending reports keep retrying. */
  async discard(id:string){
   const row=(await store.list()).find(r=>r.report.id===id);if(!row||row.status!=='failed')throw Error('Only a failed safety report can be discarded.');
   await store.put(id,{...row,status:'discarded'});
  },
  flush(allowed:()=>boolean):Promise<void>{
   if(flushing)return flushing;
   flushing=(async()=>{for(const row of await store.list()){
    if(!allowed())break;if(row.status!=='pending')continue;
    try{const receipt=await upload(row.report);if(receipt.id!==row.report.id)throw Error('The server did not confirm this safety report.');await store.put(row.report.id,{...row,status:'sent',error:null})}
    catch(error){await store.put(row.report.id,{...row,status:isPermanentSafetyError(error)?'failed':'pending',error:error instanceof Error?error.message:'Could not send this report.'})}
   }})().finally(()=>{flushing=null});return flushing;
  },
 };
}
