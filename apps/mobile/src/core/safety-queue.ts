export type SafetyReport={id:string;eventId:string;targetKind:'report'|'photo'|'workspace';targetId:string|null;reason:'harassment'|'inappropriate'|'privacy'|'other';details:string};
export type QueuedSafetyReport={report:SafetyReport;status:'pending'|'sent';error:string|null};
export function createSafetyQueue(store:{put:(id:string,row:QueuedSafetyReport)=>Promise<void>;list:()=>Promise<QueuedSafetyReport[]>},upload:(report:SafetyReport)=>Promise<{id:string}>) {
 let flushing:Promise<void>|null=null;
 return {
  async save(report:SafetyReport){
   if(!report.details.trim()||report.details.trim().length>2000)throw Error('Describe the problem in 1–2000 characters.');
   await store.put(report.id,{report:{...report,details:report.details.trim()},status:'pending',error:null});
  },
  list:store.list,
  flush(allowed:()=>boolean):Promise<void>{
   if(flushing)return flushing;
   flushing=(async()=>{for(const row of await store.list()){
    if(!allowed())break;if(row.status==='sent')continue;
    try{const receipt=await upload(row.report);if(receipt.id!==row.report.id)throw Error('The server did not confirm this safety report.');await store.put(row.report.id,{...row,status:'sent',error:null})}
    catch(error){await store.put(row.report.id,{...row,error:error instanceof Error?error.message:'Could not send this report.'})}
   }})().finally(()=>{flushing=null});return flushing;
  },
 };
}
