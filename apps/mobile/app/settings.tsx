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
 const checkServer=async()=>{const captured=scope;if(!viewer||viewer.demo||!online)return;try{const data=await getMobileCapabilities();if(valid(captured)){setCapabilities(data);setCapabilityError('');setCheckedAt(new Date().toISOString())}}catch(e){if(valid(captured)){setCapabilities(null);setCapabilityError((e as Error).message);setCheckedAt(new Date().toISOString())}}};
 useEffect(()=>{const captured=scope;actionLock.current=null;setBusy(false);setMessage('');setRegistered(false);setDeviceLoaded(false);setCapabilities(null);setCapabilityError('');setCheckedAt(null);if(!viewer)return;relayDeviceStatus(viewer).then(status=>{if(valid(captured)){setRegistered(status.registered);setDeviceLoaded(true)}}).catch(e=>{if(valid(captured)){setMessage((e as Error).message);setDeviceLoaded(true)}});void checkServer()},[scope]);
 const action=async(fn:()=>Promise<void>,success?:string)=>{const captured=scope;if(!valid(captured)||actionLock.current===scope||!viewer)return;actionLock.current=captured;setBusy(true);setMessage('');try{await fn();if(valid(captured)&&success)setMessage(success)}catch(e){if(valid(captured))setMessage((e as Error).message)}finally{if(valid(captured)){if(actionLock.current===captured)actionLock.current=null;setBusy(false)}}};
 const download=(id?:string)=>action(async()=>{if(id)await selectEvent(id);else await refresh()},'Event package saved on this device.');
 const register=()=>action(async()=>{const captured=scope;if(!viewer)return;if(!deviceName.trim()||deviceName.trim().length>100)throw Error('Enter a device name of 1–100 characters.');await registerRelayDevice(viewer,deviceName.trim());const status=await relayDeviceStatus(viewer);if(valid(captured))setRegistered(status.registered)},'Device registered. New QR exports can carry an authenticated scout signature.');
 const revoke=()=>{const captured=scope;Alert.alert('Revoke this relay device?','The signing key is removed only after server confirmation. Previously exported proofs from this device will no longer be accepted. Local reports are kept.',[{text:'Cancel',style:'cancel'},{text:'Revoke device',style:'destructive',onPress:()=>{if(!valid(captured))return;void action(async()=>{if(!viewer)return;await revokeRelayDevice(viewer);if(valid(captured))setRegistered(false)},'Device revoked. Local reports are kept.')}}])};
 const relayAvailable=capabilities?.configured===true&&capabilities.operations.deviceRegistration===true&&capabilities.operations.masterRelay===true;
 const nativeLive=!!viewer&&!viewer.demo&&Platform.OS!=='web';
 const pendingReports=records.filter(r=>r.entry.status==='submitted'&&r.status!=='synced').length,pendingPhotos=photos.filter(p=>p.status!=='synced').length;
 const packageReady=!!bundle&&bundle.teams.length>0&&!!bundle.downloadedAt;
 const labels:Record<string,string>={masterRelay:'Signed scout-to-Master relay',deviceRegistration:'Native device registration',reportCorrection:'Submitted report corrections',manualReportCorrection:'Pit and pre-scout corrections',reportDeletion:'Report deletion',robotProfiles:'Robot profile editing',memberRoles:'Member roles',invitations:'Member invitations',emailAccess:'Email authorization',eventActivation:'Transactional event activation',tbaImport:'TBA event import',tbaStats:'Official TBA statistics'};
 return <Screen>
  <Text accessibilityRole="header" style={{color:theme.text,fontSize:24,fontWeight:'700'}}>Settings</Text>
  <Label theme={theme}>{viewer?.displayName} · {viewer?.role}</Label>
  {!!message&&<Text accessibilityRole="alert" selectable style={{color:theme.text,lineHeight:22}}>{message}</Text>}
  <Section title="Event download" theme={theme}>
   {events.map(event=><Row key={event.id} title={event.name} subtitle={bundle?.event.id===event.id?'Selected · saved on this device':event.status} theme={theme} onPress={()=>{if(!busy&&(online||viewer?.demo))void download(event.id)}}/>)}
   <Button title={busy?'Working…':'Refresh event package'} theme={theme} disabled={busy||(!online&&!viewer?.demo)} onPress={()=>void download()}/>
   <Label theme={theme} muted>{bundle?`Teams, schedule, assignments, forms and reports saved ${new Date(bundle.downloadedAt).toLocaleString()}.`:'No downloaded event. Sign in online and choose an event.'}</Label>
  </Section>
  <Section title="Offline readiness" theme={theme}>
   <Row theme={theme} title={viewer?'Account loaded':'Sign in online first'} subtitle={viewer?.demo?'Practice is isolated from organization data.':'Local work is scoped to this account and organization.'}/>
   <Row theme={theme} title={packageReady?'Event package downloaded':'Download an event package'} subtitle={bundle?`${bundle.teams.length} teams · ${bundle.matches.length} matches · ${bundle.forms.length} generic form definitions`:'Keep a connection until the initial download completes.'}/>
   <Row theme={theme} title={`${pendingReports} reports and ${pendingPhotos} photos await delivery`} subtitle="Local saving is separate from confirmed server delivery. Photos upload directly, not through QR codes."/>
   <Row theme={theme} title="Before competition: test in Airplane Mode" subtitle="Complete a practice report, export and scan its QR on a second native device, reconnect, and verify exactly one server record. This checklist is not automatically verified."/>
  </Section>
  <Section title="Signed offline relay" theme={theme}>
   <Label theme={theme}>{deviceLoaded?(registered?'Registration remembered on this device':'This device is not registered for signed relay'):'Checking secure device storage…'}</Label>
   
   {viewer?.demo?<Label theme={theme}>Practice does not register or revoke real devices.</Label>:Platform.OS==='web'?null:<>
    {!registered&&<Input label="Device name" theme={theme} value={deviceName} onChangeText={setDeviceName} maxLength={100}/>}
    <Button title={registered?'Confirm device registration':'Register this device'} theme={theme} disabled={busy||!online||!nativeLive||!relayAvailable} onPress={()=>void register()}/>
    <Button title="Revoke this device" secondary theme={theme} disabled={busy||!online||!registered||!nativeLive||!relayAvailable} onPress={revoke}/>
    {!relayAvailable&&null}
   </>}
  </Section>
  <Section title="Mobile server" theme={theme}>
   {viewer?.demo?<Label theme={theme}>Local practice does not contact the mobile server.</Label>:<>
    <Label theme={theme}>{capabilities?`API v${capabilities.apiVersion} · ${capabilities.configured?'server configured':'server configuration incomplete'}`:capabilityError||'Server capabilities have not been checked.'}</Label>
    {checkedAt&&<Label theme={theme} muted>Last checked {new Date(checkedAt).toLocaleString()}{!online?' · currently offline':''}</Label>}
    {capabilities&&Object.entries(capabilities.operations).map(([key,enabled])=><Row key={key} theme={theme} title={labels[key]??key} subtitle={enabled?'Server reports available':'Not available on this server'}/>)}
    {capabilities&&Object.entries(capabilities.limitations).map(([key,limitation])=><Label key={key} theme={theme} muted>{limitation}</Label>)}
    <Button secondary title="Check server capabilities" theme={theme} disabled={busy||!online} onPress={()=>void action(checkServer)}/>
    {(!capabilities||!capabilities.configured)&&null}
   </>}
  </Section>
  <Section title="Appearance" theme={theme}><View style={{flexDirection:'row',gap:8}}>{(['light','dark','system'] as const).map(mode=><Choice key={mode} label={mode} selected={appearance===mode} theme={theme} onPress={()=>setAppearance(mode)}/>)}</View></Section>
  <Section title="Delivery" theme={theme}>
   <Label theme={theme}>{online?'Network available':'Offline'} · {pendingReports} reports and {pendingPhotos} photos await delivery.</Label>
   <Button title={syncing?'Syncing…':'Retry sync now'} theme={theme} disabled={busy||!online||syncing||viewer?.demo} onPress={()=>void action(sync)}/>
   
  </Section>
  <Button title="Sign out · keep local work" theme={theme} secondary disabled={busy} onPress={()=>{const captured=scope;Alert.alert('Sign out?','Local reports remain protected under this account and reappear when you sign back in. Pending work is not deleted.',[{text:'Keep working',style:'cancel'},{text:'Sign out',onPress:()=>{if(!valid(captured))return;void action(async()=>{await signOut();if(mounted.current)router.replace('/login')})}}])}}/>
  <Button title="Privacy policy" theme={theme} secondary onPress={()=>void Linking.openURL('https://hal9000.stuypulse.com/privacy').catch(e=>{if(mounted.current)setMessage(e.message)})}/>
  <Button title="Terms of service" theme={theme} secondary onPress={()=>void Linking.openURL('https://hal9000.stuypulse.com/terms').catch(e=>{if(mounted.current)setMessage(e.message)})}/>
 </Screen>;
}
