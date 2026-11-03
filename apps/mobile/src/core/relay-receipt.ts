import {canonicalJson,type SignedRelayProof} from '@wildcard/shared/src/relay-contract';
import {validateNativeEntry} from '@wildcard/shared/src/native-contracts';
import type {LocalSubmission,NativeEntry} from './types';

export type ReceiptAction='save'|'already-here'|'own-copy'|'conflict';
/** Scanning the same report twice must change nothing, and must never undo a cloud acknowledgment. */
export function relayReceiptAction(old:LocalSubmission|null,entry:NativeEntry,revision:number,proof?:SignedRelayProof):ReceiptAction{
 if(!old)return 'save';
 if(old.origin==='own')return 'own-copy';
 if(old.revision>revision)return 'already-here';
 if(old.revision<revision)return 'save';
 if(canonicalJson(validateNativeEntry(old.entry))!==canonicalJson(validateNativeEntry(entry)))return 'conflict';
 if(old.status==='synced'||!proof)return 'already-here';
 // An unsigned backup can gain a signature, which is what lets it reach the cloud.
 return old.proof?.signature===proof.signature?'already-here':'save';
}
/** A stale schedule must not lose a report: keep it and let the server decide at upload. */
export function scheduleWarning(entry:NativeEntry,teamIds:Set<string>,matches:{id:string;red_teams:string[];blue_teams:string[]}[]):string|null{
 if(!teamIds.has(entry.team_id))return 'This team is not in this phone\'s event download. The report is saved; refresh the event when connected.';
 if(!entry.match_id)return null;
 const match=matches.find(m=>m.id===entry.match_id);
 if(!match)return 'This match is not in this phone\'s schedule. The report is saved; refresh the event when connected.';
 if(![...match.red_teams,...match.blue_teams].includes(entry.team_id))return 'This team is not listed in that match on this phone. The report is saved; check it after refreshing the event.';
 return null;
}
export const canReceiveQr=(role:string)=>['master','admin','developer','strategist'].includes(role);
/** The server only accepts relayed reports from these roles. */
export const canUploadRelay=(role:string)=>['master','admin','developer'].includes(role);
