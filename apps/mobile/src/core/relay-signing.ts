import * as ed from '@noble/ed25519';
import {sha512} from '@noble/hashes/sha2.js';
import {canonicalJson,validateSignedProof,type SignedRelayEnvelope,type SignedRelayProof} from '@wildcard/shared/src/relay-contract';
ed.hashes.sha512=sha512;
export function bytesToBase64(bytes:Uint8Array):string{let value='';for(const byte of bytes)value+=String.fromCharCode(byte);return btoa(value);}
export function base64ToBytes(value:string):Uint8Array{const decoded=atob(value);return Uint8Array.from(decoded,c=>c.charCodeAt(0));}
export function relayPublicKey(secret:Uint8Array):string{return bytesToBase64(ed.getPublicKey(secret));}
export function signRelay(envelope:SignedRelayEnvelope,secret:Uint8Array):SignedRelayProof{return validateSignedProof({envelope,signature:bytesToBase64(ed.sign(new TextEncoder().encode(canonicalJson(envelope)),secret))});}
export function verifyRelaySignature(proof:SignedRelayProof,publicKey:string):boolean{try{const parsed=validateSignedProof(proof);return ed.verify(base64ToBytes(parsed.signature),new TextEncoder().encode(canonicalJson(parsed.envelope)),base64ToBytes(publicKey),{zip215:false})}catch{return false}}
