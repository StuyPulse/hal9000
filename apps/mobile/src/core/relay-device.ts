import * as SecureStore from 'expo-secure-store';
import * as Crypto from 'expo-crypto';
import {Platform} from 'react-native';
import {apiRequest} from './mobile-api';
import {base64ToBytes,bytesToBase64,relayPublicKey,signRelay} from './relay-signing';
import {validateNativeEntry} from '@wildcard/shared/src/native-contracts';
import type {SignedRelayProof} from '@wildcard/shared/src/relay-contract';
import type {NativeEntry,Viewer} from './types';
type DeviceKey={id:string;secret:string;publicKey:string;registered:boolean};
const storageKey=(viewer:Viewer)=>`hal9000-relay-${viewer.userId}-${viewer.organizationId}`;
async function readDevice(viewer:Viewer):Promise<DeviceKey|null>{if(Platform.OS==='web')return null;const stored=await SecureStore.getItemAsync(storageKey(viewer));return stored?JSON.parse(stored):null;}
export async function relayDeviceStatus(viewer:Viewer){const key=await readDevice(viewer);return {registered:Boolean(key?.registered),deviceId:key?.id??null};}
export async function registerRelayDevice(viewer:Viewer,name='Scouting phone'){
 if(viewer.demo)throw Error('Practice never registers devices with the server.');
 if(Platform.OS==='web')throw Error('Signed offline relay requires the native app and secure device storage.');
 let device=await readDevice(viewer);
 if(!device){const secret=await Crypto.getRandomBytesAsync(32);device={id:Crypto.randomUUID(),secret:bytesToBase64(secret),publicKey:relayPublicKey(secret),registered:false};await SecureStore.setItemAsync(storageKey(viewer),JSON.stringify(device));}
 await apiRequest('/api/mobile/devices','POST',{deviceId:device.id,publicKey:device.publicKey,name},{expectedUserId:viewer.userId,expectedOrganizationId:viewer.organizationId});
 await SecureStore.setItemAsync(storageKey(viewer),JSON.stringify({...device,registered:true}));
 return device.id;
}
export async function revokeRelayDevice(viewer:Viewer){const device=await readDevice(viewer);if(!device)return;await apiRequest('/api/mobile/devices','DELETE',{deviceId:device.id},{expectedUserId:viewer.userId,expectedOrganizationId:viewer.organizationId});await SecureStore.deleteItemAsync(storageKey(viewer));}
export async function proofForReport(viewer:Viewer,entry:NativeEntry):Promise<SignedRelayProof|null>{
 if(viewer.demo)return null;
 if(viewer.userId!==entry.scout_user_id)throw Error('Only the original scout may sign this report.');
 const device=await readDevice(viewer);if(!device?.registered)return null;
 const validated=validateNativeEntry(entry);
 const envelope={version:1 as const,deviceId:device.id,entry:validated,createdAt:new Date().toISOString()};
 return signRelay(envelope,base64ToBytes(device.secret));
}
