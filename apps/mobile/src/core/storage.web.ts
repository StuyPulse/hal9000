import type { LocalSubmission, LocalPhoto } from './types';
import { acknowledge,failRevision } from './sync-model';
import {matchesRevokedViewer} from './viewer-cache-model';
const key=(scope:string,kind:string,id:string)=>`hal-native:${scope}:${kind}:${id}`;
export async function openStore(){return null;}
export async function putValue(scope:string,kind:string,id:string,value:unknown){localStorage.setItem(key(scope,kind,id),JSON.stringify(value));}
export async function getValue<T>(scope:string,kind:string,id:string):Promise<T|null>{const value=localStorage.getItem(key(scope,kind,id));return value?JSON.parse(value) as T:null;}
export async function listValues<T>(scope:string,kind:string):Promise<T[]>{const prefix=key(scope,kind,'');return Object.keys(localStorage).filter(k=>k.startsWith(prefix)).map(k=>JSON.parse(localStorage.getItem(k)!) as T);}
export async function removeValue(scope:string,kind:string,id:string){localStorage.removeItem(key(scope,kind,id));}
export async function removeCachedViewer(userId:string,organizationId:string){const name=key('device','meta','viewer'),raw=localStorage.getItem(name);if(!raw)return;if(matchesRevokedViewer(JSON.parse(raw),userId,organizationId))localStorage.removeItem(name);}
export async function acknowledgeStored(scope:string,id:string,revision:number,serverUpdatedAt:string|null){const name=key(scope,'entry',id),raw=localStorage.getItem(name);if(raw)localStorage.setItem(name,JSON.stringify(acknowledge(JSON.parse(raw),revision,serverUpdatedAt)));}
export async function failStored(scope:string,id:string,revision:number,error:string){const name=key(scope,'entry',id),raw=localStorage.getItem(name);if(raw)localStorage.setItem(name,JSON.stringify(failRevision(JSON.parse(raw),revision,error)));}
export const listRecords=(scope:string)=>listValues<LocalSubmission>(scope,'entry');
export const listPhotos=(scope:string)=>listValues<LocalPhoto>(scope,'photo');
