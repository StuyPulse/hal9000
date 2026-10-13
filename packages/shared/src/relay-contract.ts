import {z} from 'zod';
import {nativeEntrySchema,validateNativeEntry} from './native-contracts';
export const signedRelayEnvelopeSchema=z.object({version:z.literal(1),deviceId:z.string().uuid(),entry:nativeEntrySchema,createdAt:z.string().datetime()}).strict().refine(v=>v.entry.status==='submitted','Only submitted reports may be signed');
export const signedRelayProofSchema=z.object({envelope:signedRelayEnvelopeSchema,signature:z.string().regex(/^[A-Za-z0-9+/]{86}==$/)}).strict();
export type SignedRelayEnvelope=z.infer<typeof signedRelayEnvelopeSchema>;
export type SignedRelayProof=z.infer<typeof signedRelayProofSchema>;
export function validateSignedProof(value:unknown):SignedRelayProof{const proof=signedRelayProofSchema.parse(value);validateNativeEntry(proof.envelope.entry);return proof;}
export function canonicalJson(value:unknown,depth=0):string{
 if(depth>64)throw Error('Signed data is nested too deeply.');
 if(value===null)return 'null';
 if(typeof value==='string'||typeof value==='boolean')return JSON.stringify(value);
 if(typeof value==='number'){if(!Number.isFinite(value))throw Error('Signed data contains a non-finite number.');return JSON.stringify(value)}
 if(Array.isArray(value))return '['+value.map(v=>canonicalJson(v,depth+1)).join(',')+']';
 if(value&&typeof value==='object'){if(Object.getPrototypeOf(value)!==Object.prototype)throw Error('Signed data must contain plain JSON objects.');const record=value as Record<string,unknown>;return '{'+Object.keys(record).sort().map(k=>JSON.stringify(k)+':'+canonicalJson(record[k],depth+1)).join(',')+'}'}
 throw Error('Signed data contains a non-JSON value.');
}
