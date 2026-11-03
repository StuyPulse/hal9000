import {friendlyError} from '../src/core/friendly-error';
import React,{useEffect,useRef,useState} from 'react';
import { View, Alert, Linking, Platform } from 'react-native';
import { Text } from '../src/components/AppText';
import {useRouter} from 'expo-router';
import {useApp} from '../src/core/context';
import {Screen} from '../src/components/Screen';
import {Button,Input,Label,Row,Section,Choice} from '../src/components/ui';
import {getMobileCapabilities,type MobileCapabilities} from '../src/core/mobile-api';
import {registerRelayDevice,relayDeviceStatus,revokeRelayDevice} from '../src/core/relay-device';
import {picklistQueue} from '../src/core/picklist-sync';
import {useLayout} from '../src/components/layout';
import {safetyQueue} from '../src/core/safety-sync';
import type {QueuedSafetyReport} from '../src/core/safety-queue';

// Matches the server limit in apps/web/src/lib/mobile/device-operations.ts.
const DEVICE_NAME_MAX=80;

export default function Settings(){
 const {largeText}=useLayout();
 const {viewer,bundle,events,records,photos,theme,online,appearance,setAppearance,selectEvent,refresh,sync,syncing,signOut}=useApp();
 const [busy,setBusy]=useState(false),[message,setMessage]=useState(''),[registered,setRegistered]=useState(false),[deviceLoaded,setDeviceLoaded]=useState(false),[deviceName,setDeviceName]=useState('Scouting phone');
 const [capabilities,setCapabilities]=useState<MobileCapabilities|null>(null),[capabilityError,setCapabilityError]=useState(''),[checkedAt,setCheckedAt]=useState<string|null>(null);
 const [pendingBoards,setPendingBoards]=useState(0),[boardError,setBoardError]=useState<string|null>(null);
 const [pendingSafety,setPendingSafety]=useState(0),[failedSafety,setFailedSafety]=useState<QueuedSafetyReport[]>([]);
 const router=useRouter(),scope=viewer?`${viewer.demo?'practice':'live'}:${viewer.userId}:${viewer.organizationId}`:'signed-out';
 const current=useRef(scope),mounted=useRef(true),actionLock=useRef<string|null>(null);current.current=scope;
 useEffect(()=>{let active=true;if(!viewer){setPendingBoards(0);setBoardError(null);return;}void picklistQueue(scope).pending().then(rows=>{if(active){const pending=rows.filter(row=>!row.acknowledged);setPendingBoards(pending.length);setBoardError(pending.find(row=>row.error)?.error??null)}}).catch(()=>{});return()=>{active=false}},[scope,bundle,syncing]);
 const loadSafety=async(captured:string)=>{const rows=await safetyQueue(captured).list();if(current.current===captured){setPendingSafety(rows.filter(row=>row.status==='pending').length);setFailedSafety(rows.filter(row=>row.status==='failed'))}};
 useEffect(()=>{setPendingSafety(0);setFailedSafety([]);if(viewer&&!viewer.demo)void loadSafety(scope).catch(()=>{})},[scope,bundle,syncing]);
 useEffect(()=>{mounted.current=true;return()=>{mounted.current=false}},[]);
 const valid=(captured:string)=>mounted.current&&current.current===captured;
 const checkServer=async()=>{const captured=scope;if(!viewer||viewer.demo||!online)return;try{const data=await getMobileCapabilities();if(valid(captured)){setCapabilities(data);setCapabilityError('');setCheckedAt(new Date().toISOString())}}catch(e){if(valid(captured)){setCapabilities(null);setCapabilityError(friendlyError(e));setCheckedAt(new Date().toISOString())}}};
 useEffect(()=>{const captured=scope;actionLock.current=null;setBusy(false);setMessage('');setRegistered(false);setDeviceLoaded(false);setCapabilities(null);setCapabilityError('');setCheckedAt(null);if(!viewer)return;relayDeviceStatus(viewer).then(status=>{if(valid(captured)){setRegistered(status.registered);setDeviceLoaded(true)}}).catch(e=>{if(valid(captured)){setMessage(friendlyError(e));setDeviceLoaded(true)}});void checkServer()},[scope]);
 const action=async(fn:()=>Promise<void>,success?:string)=>{const captured=scope;if(!valid(captured)||actionLock.current===scope||!viewer)return;actionLock.current=captured;setBusy(true);setMessage('');try{await fn();if(valid(captured)&&success)setMessage(success)}catch(e){if(valid(captured))setMessage(friendlyError(e))}finally{if(valid(captured)){if(actionLock.current===captured)actionLock.current=null;setBusy(false)}}};
 const download=(id?:string)=>action(async()=>{if(id)await selectEvent(id);else await refresh()},'Event package saved on this device.');
 const register=()=>action(async()=>{const captured=scope;if(!viewer)return;if(!deviceName.trim()||deviceName.trim().length>DEVICE_NAME_MAX)throw Error(`Enter a device name of 1–${DEVICE_NAME_MAX} characters.`);await registerRelayDevice(viewer,deviceName.trim());const status=await relayDeviceStatus(viewer);if(valid(captured))setRegistered(status.registered)},'Device registered. New QR exports can carry an authenticated scout signature.');
 const discardSafety=(row:QueuedSafetyReport)=>{const captured=scope;Alert.alert('Discard this safety report?','The server refused it, so retrying cannot deliver it. Discarding removes it from your delivery list. Contact se@stuypulse.com if the problem still needs attention.',[{text:'Keep',style:'cancel'},{text:'Discard',style:'destructive',onPress:()=>{if(!valid(captured))return;void action(async()=>{await safetyQueue(captured).discard(row.report.id);await loadSafety(captured)},'Safety report discarded.')}}])};
 const revoke=()=>{const captured=scope;Alert.alert('Revoke this relay device?','The signing key is removed only after server confirmation. Previously exported proofs from this device will no longer be accepted. Local reports are kept.',[{text:'Cancel',style:'cancel'},{text:'Revoke device',style:'destructive',onPress:()=>{if(!valid(captured))return;void action(async()=>{if(!viewer)return;await revokeRelayDevice(viewer);if(valid(captured))setRegistered(false)},'Device revoked. Local reports are kept.')}}])};
 const relayAvailable=capabilities?.configured===true&&capabilities.operations.deviceRegistration===true&&capabilities.operations.masterRelay===true;
 const nativeLive=!!viewer&&!viewer.demo&&Platform.OS!=='web';
 const pendingReports=records.filter(r=>r.entry.status==='submitted'&&r.status!=='synced').length,pendingPhotos=photos.filter(p=>p.status!=='synced').length;
 const packageReady=!!bundle&&bundle.teams.length>0&&!!bundle.downloadedAt;
 const labels:Record<string,string>={masterRelay:'Signed scout-to-Master relay',deviceRegistration:'Native device registration',reportCorrection:'Submitted report corrections',manualReportCorrection:'Pit and pre-scout corrections',reportDeletion:'Report deletion',robotProfiles:'Robot profile editing',memberRoles:'Member roles',invitations:'Member invitations',emailAccess:'Email authorization',eventActivation:'Transactional event activation',tbaImport:'TBA event import',tbaStats:'Official TBA statistics'};
 const down=(capabilities?Object.entries(capabilities.operations).filter(([,enabled])=>!enabled).map(([key])=>labels[key]??key):[]);
 return <Screen>
  <Text style={{color:theme.muted,fontSize:14}}>{viewer?.displayName} · {viewer?.role}</Text>
  {!!message&&<Text accessibilityRole="alert" selectable style={{color:theme.text,lineHeight:22}}>{message}</Text>}
  <Section title="Event" theme={theme}>
   {events.map(event=><Row key={event.id} title={event.name} subtitle={bundle?.event.id===event.id?`Downloaded ${new Date(bundle.downloadedAt).toLocaleString()}`:event.status} theme={theme} onPress={()=>{if(!busy)void download(event.id)}}/>)}
   <Button title={busy?'Working…':'Refresh event'} theme={theme} disabled={busy||(!online&&!viewer?.demo)} onPress={()=>void download()}/>
  </Section>
  <Section title="Delivery" theme={theme}>
   <Label theme={theme}>{pendingReports||pendingPhotos||pendingBoards||pendingSafety?`${pendingReports} report${pendingReports===1?'':'s'} · ${pendingPhotos} photo${pendingPhotos===1?'':'s'} · ${pendingBoards} picklist${pendingBoards===1?'':'s'} · ${pendingSafety} safety report${pendingSafety===1?'':'s'} to send`:'Everything is sent'}{online?'':' · offline'}</Label>
   {boardError?<Label theme={theme}>{friendlyError(boardError)}</Label>:null}
   {failedSafety.map(row=><Row key={row.report.id} theme={theme} title="Safety report not accepted" subtitle={`${friendlyError(row.error??'The server refused this report.')} · ${row.report.id}`} tail={<Button secondary title="Discard" theme={theme} disabled={busy} onPress={()=>discardSafety(row)}/>}/>)}
   <Button title={syncing?'Syncing…':'Sync now'} theme={theme} secondary={!(pendingReports||pendingPhotos)} disabled={busy||!online||syncing||viewer?.demo} onPress={()=>void action(sync)}/>
  </Section>
  {!viewer?.demo&&Platform.OS!=='web'?<Section title="QR relay signing" theme={theme}>
   <Label theme={theme}>{deviceLoaded?(registered?'This device is registered':'This device is not registered'):'Checking…'}</Label>
   {!registered&&<Input label="Device name" theme={theme} value={deviceName} onChangeText={setDeviceName} maxLength={DEVICE_NAME_MAX}/>}
   <Button title={registered?'Confirm registration':'Register this device'} theme={theme} disabled={busy||!online||!nativeLive||!relayAvailable} onPress={()=>void register()}/>
   {registered?<Button title="Revoke this device" secondary theme={theme} disabled={busy||!online||!nativeLive||!relayAvailable} onPress={revoke}/>:null}
  </Section>:null}
  {!viewer?.demo?<Section title="Server" theme={theme}>
   <Label theme={theme}>{capabilities?(capabilities.configured&&!down.length?'Ready':down.length?`Unavailable: ${down.join(', ')}`:'Configuration incomplete'):capabilityError||'Not checked'}</Label>
   <Button secondary title="Check server" theme={theme} disabled={busy||!online} onPress={()=>void action(checkServer)}/>
  </Section>:null}
  <Section title="Appearance" theme={theme}><View style={{flexDirection:largeText?'column':'row',gap:8}}>{(['light','dark','system'] as const).map(mode=><Choice key={mode} label={mode[0].toUpperCase()+mode.slice(1)} selected={appearance===mode} theme={theme} onPress={()=>setAppearance(mode)}/>)}</View></Section>
  <Section title="Help and privacy" theme={theme}>
   <Button title="Content safety and reports" theme={theme} secondary onPress={()=>router.push('/safety')}/>
   {viewer&&['admin','developer'].includes(viewer.role)?<Button title="Team access safeguards" theme={theme} secondary onPress={()=>router.push('/admin/safety-access')}/>:null}
   <Button title="Contact support" theme={theme} secondary onPress={()=>void Linking.openURL('mailto:se@stuypulse.com').catch(e=>setMessage(friendlyError(e)))}/>
   <Label theme={theme} muted>For help or to report inappropriate content, contact se@stuypulse.com. Include the screen and report ID, but never your password or private scouting exports.</Label>
   <Button title="Privacy policy" theme={theme} secondary onPress={()=>void Linking.openURL('https://hal9000.stuypulse.com/privacy').catch(e=>setMessage(friendlyError(e)))}/>
   <Button title="Terms of service" theme={theme} secondary onPress={()=>void Linking.openURL('https://hal9000.stuypulse.com/terms').catch(e=>setMessage(friendlyError(e)))}/>
   <Button title="Open-source notice" theme={theme} secondary onPress={()=>Alert.alert('URI decoder · MIT license',require('../../../vendor/decode-uri-component/license.cjs'))}/>
  </Section>
  <Button title="Sign out" theme={theme} secondary disabled={busy} onPress={()=>{const captured=scope;Alert.alert('Sign out?','Your local reports stay on this phone.',[{text:'Keep working',style:'cancel'},{text:'Sign out',onPress:()=>{if(!valid(captured))return;void action(async()=>{await signOut();if(mounted.current)router.replace('/login')})}}])}}/>
 </Screen>;
}
