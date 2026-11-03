import {deflateSync,inflateSync,strFromU8,strToU8} from 'fflate';
import {z} from 'zod';
import {validateNativeEntry} from './native-contracts';
import {canonicalJson,validateSignedProof,type SignedRelayProof} from './relay-contract';

export type QrReport<Entry=ReturnType<typeof validateNativeEntry>>={entry:Entry;revision:number;proof?:SignedRelayProof};
const MAX_INFLATED_BYTES=32*1024*1024;
const batchSchema=z.object({app:z.literal('HAL9000'),v:z.literal(1),reports:z.array(z.unknown()).min(1).max(5000)});

/** Validates one report in the existing `{entry,revision,proof?}` relay shape. */
export function parseQrReport(raw:unknown):QrReport{
 const record=z.object({entry:z.unknown(),revision:z.number().int().positive(),proof:z.unknown().optional()}).parse(raw);
 const entry=validateNativeEntry(record.entry);
 if(entry.status!=='submitted')throw Error('Only submitted reports can be shared by QR.');
 const proof=record.proof?validateSignedProof(record.proof):undefined;
 if(proof&&canonicalJson(proof.envelope.entry)!==canonicalJson(entry))throw Error('The signature does not match this report.');
 return {entry,revision:record.revision,...(proof?{proof}:{})};
}

export function encodeReportBatch(reports:QrReport<unknown>[]):Uint8Array{
 if(!reports.length)throw Error('Select at least one report.');
 return deflateSync(strToU8(JSON.stringify({app:'HAL9000',v:1,reports})),{level:9});
}

export type DecodedBatch={reports:QrReport[];rejected:{id:string|null;reason:string}[]};
/** One unreadable report never blocks the rest of the batch. */
export function decodeReportBatch(bytes:Uint8Array):DecodedBatch{
 let parsed:unknown;
 try{
  const inflated=inflateSync(bytes);
  if(inflated.length>MAX_INFLATED_BYTES)throw Error('too large');
  parsed=JSON.parse(strFromU8(inflated));
 }catch{throw Error('This QR transfer could not be read. It may come from a newer app version.')}
 const batch=batchSchema.parse(parsed);
 const decoded:DecodedBatch={reports:[],rejected:[]},seen=new Set<string>();
 for(const raw of batch.reports){
  const id=typeof (raw as {entry?:{id?:unknown}})?.entry?.id==='string'?(raw as {entry:{id:string}}).entry.id:null;
  try{
   const report=parseQrReport(raw);
   const key=`${report.entry.id}:${report.revision}`;
   if(seen.has(key))continue;
   seen.add(key);decoded.reports.push(report);
  }catch(error){decoded.rejected.push({id,reason:error instanceof Error&&!error.message.startsWith('[')?error.message:'Report failed validation.'})}
 }
 return decoded;
}
