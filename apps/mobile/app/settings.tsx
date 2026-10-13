import {friendlyError} from '../src/core/friendly-error';
import React,{useEffect,useRef,useState} from 'react';
import {View,Alert,Text,Linking,Platform} from 'react-native';
import {useRouter} from 'expo-router';
import {useApp} from '../src/core/context';
import {Screen} from '../src/components/Screen';
import {Button,Input,Label,Row,Section,Choice} from '../src/components/ui';
import {getMobileCapabilities,type MobileCapabilities} from '../src/core/mobile-api';
import {registerRelayDevice,relayDeviceStatus,revokeRelayDevice} from '../src/core/relay-device';

export default function Settings(){
 const {viewer,bundle,events,records,photos,theme,online,appearance,setAppearance,selectEvent,refresh,sync,syncing,signOut}=useApp();
 const [busy,setBusy]=useState(false),[message,setMessage]=useState(''),[registered,setRegistered]=useState(false),[deviceLoaded,setDeviceLoaded]=useState(false),[deviceName,setDeviceName]=useState('Scouting phone');
 const [capabilities,setCapabilities]=useState<MobileCapabilities|null>(null),[capabilityError,setCapabilityError]=useState(''),[checkedAt,setCheckedAt]=useState<string|null>(null);
 const router=useRouter(),scope=viewer?`${viewer.demo?'practice':'live'}:${viewer.userId}:${viewer.organizationId}`:'signed-out';
 const current=useRef(scope),mounted=useRef(true),actionLock=useRef<string|null>(null);current.current=scope;
 useEffect(()=>{mounted.current=true;return()=>{mounted.current=false}},[]);
 const valid=(captured:string)=>mounted.current&&current.current===captured;
 const checkServer=async()=>{const captured=scope;if(!viewer||viewer.demo||!online)return;try{const data=await getMobileCapabilities();if(valid(captured)){setCapabilities(data);setCapabilityError('');setCheckedAt(new Date().toISOString())}}catch(e){if(valid(captured)){setCapabilities(null);setCapabilityError(friendlyError(e));setCheckedAt(new Date().toISOString())}}};
 useEffect(()=>{const captured=scope;actionLock.current=null;setBusy(false);setMessage('');setRegistered(false);setDeviceLoaded(false);setCapabilities(null);setCapabilityError('');setCheckedAt(null);if(!viewer)return;relayDeviceStatus(viewer).then(status=>{if(valid(captured)){setRegistered(status.registered);setDeviceLoaded(true)}}).catch(e=>{if(valid(captured)){setMessage(friendlyError(e));setDeviceLoaded(true)}});void checkServer()},[scope]);
 const action=async(fn:()=>Promise<void>,success?:string)=>{const captured=scope;if(!valid(captured)||actionLock.current===scope||!viewer)return;actionLock.current=captured;setBusy(true);setMessage('');try{await fn();if(valid(captured)&&success)setMessage(success)}catch(e){if(valid(captured))setMessage(friendlyError(e))}finally{if(valid(captured)){if(actionLock.current===captured)actionLock.current=null;setBusy(false)}}};
 const download=(id?:string)=>action(async()=>{if(id)await selectEvent(id);else await refresh()},'Event package saved on this device.');
 const register=()=>action(async()=>{const captured=scope;if(!viewer)return;if(!deviceName.trim()||deviceName.trim().length>100)throw Error('Enter a device name of 1–100 characters.');await registerRelayDevice(viewer,deviceName.trim());const status=await relayDeviceStatus(viewer);if(valid(captured))setRegistered(status.registered)},'Device registered. New QR exports can carry an authenticated scout signature.');
 const revoke=()=>{const captured=scope;Alert.alert('Revoke this relay device?','The signing key is removed only after server confirmation. Previously exported proofs from this device will no longer be accepted. Local reports are kept.',[{text:'Cancel',style:'cancel'},{text:'Revoke device',style:'destructive',onPress:()=>{if(!valid(captured))return;void action(async()=>{if(!viewer)return;await revokeRelayDevice(viewer);if(valid(captured))setRegistered(false)},'Device revoked. Local reports are kept.')}}])};
 const relayAvailable=capabilities?.configured===true&&capabilities.operations.deviceRegistration===true&&capabilities.operations.masterRelay===true;
 const nativeLive=!!viewer&&!viewer.demo&&Platform.OS!=='web';
 const pendingReports=records.filter(r=>r.entry.status==='submitted'&&r.status!=='synced').length,pendingPhotos=photos.filter(p=>p.status!=='synced').length;
 const packageReady=!!bundle&&bundle.teams.length>0&&!!bundle.downloadedAt;
 const labels:Record<string,string>={masterRelay:'Signed scout-to-Master relay',deviceRegistration:'Native device registration',reportCorrection:'Submitted report corrections',manualReportCorrection:'Pit and pre-scout corrections',reportDeletion:'Report deletion',robotProfiles:'Robot profile editing',memberRoles:'Member roles',invitations:'Member invitations',emailAccess:'Email authorization',eventActivation:'Transactional event activation',tbaImport:'TBA event import',tbaStats:'Official TBA statistics'};
 const down=(capabilities?Object.entries(capabilities.operations).filter(([,enabled])=>!enabled).map(([key])=>labels[key]??key):[]);
 const link=(url:string,label:string)=><Text accessibilityRole="link" onPress={()=>void Linking.openURL(url).catch(e=>{if(mounted.current)setMessage(friendlyError(e))})} style={{color:theme.muted,fontSize:14,paddingVertical:8}}>{label}</Text>;
 return <Screen>
  <Text style={{color:theme.muted,fontSize:14}}>{viewer?.displayName} · {viewer?.role}</Text>
  {!!message&&<Text accessibilityRole="alert" selectable style={{color:theme.text,lineHeight:22}}>{message}</Text>}
  <Section title="Event" theme={theme}>
   {events.map(event=><Row key={event.id} title={event.name} subtitle={bundle?.event.id===event.id?`Downloaded ${new Date(bundle.downloadedAt).toLocaleString()}`:event.status} theme={theme} onPress={()=>{if(!busy&&(online||viewer?.demo))void download(event.id)}}/>)}
   <Button title={busy?'Working…':'Refresh event'} theme={theme} disabled={busy||(!online&&!viewer?.demo)} onPress={()=>void download()}/>
  </Section>
  <Section title="Delivery" theme={theme}>
   <Label theme={theme}>{pendingReports||pendingPhotos?`${pendingReports} report${pendingReports===1?'':'s'} · ${pendingPhotos} photo${pendingPhotos===1?'':'s'} to send`:'Everything is sent'}{online?'':' · offline'}</Label>
   <Button title={syncing?'Syncing…':'Sync now'} theme={theme} secondary={!(pendingReports||pendingPhotos)} disabled={busy||!online||syncing||viewer?.demo} onPress={()=>void action(sync)}/>
  </Section>
  {!viewer?.demo&&Platform.OS!=='web'?<Section title="QR relay signing" theme={theme}>
   <Label theme={theme}>{deviceLoaded?(registered?'This device is registered':'This device is not registered'):'Checking…'}</Label>
   {!registered&&<Input label="Device name" theme={theme} value={deviceName} onChangeText={setDeviceName} maxLength={100}/>}
   <Button title={registered?'Confirm registration':'Register this device'} theme={theme} disabled={busy||!online||!nativeLive||!relayAvailable} onPress={()=>void register()}/>
   {registered?<Button title="Revoke this device" secondary theme={theme} disabled={busy||!online||!nativeLive||!relayAvailable} onPress={revoke}/>:null}
  </Section>:null}
  {!viewer?.demo?<Section title="Server" theme={theme}>
   <Label theme={theme}>{capabilities?(capabilities.configured&&!down.length?'Ready':down.length?`Unavailable: ${down.join(', ')}`:'Configuration incomplete'):capabilityError||'Not checked'}</Label>
   <Button secondary title="Check server" theme={theme} disabled={busy||!online} onPress={()=>void action(checkServer)}/>
  </Section>:null}
  <Section title="Appearance" theme={theme}><View style={{flexDirection:'row',gap:8}}>{(['light','dark','system'] as const).map(mode=><Choice key={mode} label={mode[0].toUpperCase()+mode.slice(1)} selected={appearance===mode} theme={theme} onPress={()=>setAppearance(mode)}/>)}</View></Section>
  <Button title="Sign out" theme={theme} secondary disabled={busy} onPress={()=>{const captured=scope;Alert.alert('Sign out?','Your local reports stay on this phone.',[{text:'Keep working',style:'cancel'},{text:'Sign out',onPress:()=>{if(!valid(captured))return;void action(async()=>{await signOut();if(mounted.current)router.replace('/login')})}}])}}/>
 <View style={{flexDirection:'row',gap:20,justifyContent:'center'}}>{link('https://hal9000.stuypulse.com/terms','Terms')}{link('https://hal9000.stuypulse.com/privacy','Privacy')}</View>
 </Screen>;
}
