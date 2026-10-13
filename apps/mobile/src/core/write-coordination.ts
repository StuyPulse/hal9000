export function serializeWrite<T>(chain:{current:Promise<void>},operation:()=>Promise<T>):Promise<T>{
 const pending=chain.current.then(operation);
 chain.current=pending.then(()=>{},()=>{});
 return pending;
}
export async function excludeSync<T>(lock:{current:boolean},operation:()=>Promise<T>):Promise<T>{
 if(lock.current)throw Error('Wait for the current sync to finish before changing or removing this report.');
 lock.current=true;
 try{return await operation()}finally{lock.current=false}
}
