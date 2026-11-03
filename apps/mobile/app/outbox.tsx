import React,{useEffect,useState} from 'react';
import {getValue} from '../src/core/storage';
import {scopedIdentity} from '../src/core/sync-model';
import { Pressable, Share, View } from 'react-native';
import { Text } from '../src/components/AppText';
import {useRouter} from 'expo-router';
import {useApp} from '../src/core/context';
import {Screen} from '../src/components/Screen';
import {Button,DISPLAY_BOLD,GroupLabel,Label,List,ListRow,Status,TeamTag} from '../src/components/ui';
import {deliveryLabel,deliveryState,qrCandidates} from '../src/core/qr-share';

const tones={draft:'warn',waiting:'warn',shared:'quiet',received:'quiet',uploaded:'ok',attention:'bad'} as const;

export default function Outbox(){
 const {records,photos,bundle,theme,sync,syncing,online,viewer}=useApp();const router=useRouter();
 const [lastSync,setLastSync]=useState<number|null>(null);
 const scope=viewer?scopedIdentity(viewer.userId,viewer.organizationId,viewer.demo):null;
 useEffect(()=>{if(!scope)return;void getValue<{at:number}>(scope,'meta','last-sync').then(v=>setLastSync(v?.at??null)).catch(()=>undefined)},[scope,syncing,records]);
 const ago=(at:number)=>{const m=Math.round((Date.now()-at)/60000);return m<1?'just now':m<60?`${m} min ago`:m<1440?`${Math.round(m/60)} h ago`:new Date(at).toLocaleDateString()};
 const local=records.filter(r=>r.entry.event_id===bundle?.event.id);
 const waiting=local.filter(r=>r.status!=='synced'&&r.entry.status==='submitted').length;
 const pendingPhotos=photos.filter(p=>p.status!=='synced').length;
 const teamNumber=(id:string)=>bundle?.teams.find(t=>t.id===id)?.displayNumber??'?';
 const kind=(t:string)=>t==='pre_scout'?'Pre-scout':t==='pit'?'Pit':'Match';
 const cloud=(bundle?.entries??[]).filter(e=>!local.some(r=>r.entry.id===e.id)).slice().reverse();
 const open=(id:string)=>router.push({pathname:'/submission/[id]',params:{id}});
 const shareable=viewer&&bundle?qrCandidates(records,viewer,bundle.event.id).length:0;
 const pending=waiting+pendingPhotos;
 const headline=pending?[waiting?`${waiting} report${waiting===1?'':'s'}`:null,pendingPhotos?`${pendingPhotos} photo${pendingPhotos===1?'':'s'}`:null].filter(Boolean).join(' and ')+' to send':'All sent';
 return <Screen>
  <View style={{backgroundColor:theme.surface,borderRadius:20,padding:16,gap:14}}>
   <View style={{gap:2}}>
    <Text accessibilityLiveRegion="polite" style={{color:pending?theme.warning:theme.success,fontSize:32,fontFamily:DISPLAY_BOLD}}>{headline}</Text>
    <Text style={{color:theme.muted,fontSize:14}}>{online?'Online':'Offline'}{lastSync?` · synced ${ago(lastSync)}`:''}</Text>
   </View>
   <View style={{flexDirection:'row',gap:8}}>
    <Button title={syncing?'Syncing…':'Sync'} icon="sync" theme={theme} secondary={!pending||!online} disabled={syncing||!online||viewer?.demo} onPress={()=>void sync()} style={{flex:1}}/>
    <Button title="Share by QR" icon="qr" theme={theme} secondary={!shareable||online} disabled={!shareable} onPress={()=>router.push('/share-qr')} style={{flex:1}}/>
   </View>
  </View>
  {local.length?<>
   <GroupLabel theme={theme}>On this phone</GroupLabel>
   <List theme={theme}>{local.map(r=>{const state=r.entry.status==='draft'?'draft':deliveryState(r);return <ListRow key={r.entry.id} theme={theme} title={kind(r.entry.entry_type)} detail={r.error} lead={<TeamTag label={teamNumber(r.entry.team_id)} size="md" theme={theme}/>} tail={<Status label={state==='draft'?'Draft':deliveryLabel[state]} tone={tones[state]} theme={theme}/>} onPress={()=>open(r.entry.id)}/>})}</List>
   <Pressable accessibilityRole="button" accessibilityLabel={`Export a backup of ${local.length} reports`} onPress={()=>void Share.share({message:JSON.stringify({exportedAt:new Date().toISOString(),event:bundle?.event.name,reports:local.map(r=>({entry:r.entry,revision:r.revision,status:r.status}))},null,2),title:'HAL9000 reports backup'}).catch(()=>undefined)} style={{alignSelf:'flex-start',minHeight:44,justifyContent:'center'}}><Text style={{color:theme.text,fontWeight:'700',fontSize:15,textDecorationLine:'underline'}}>Export backup</Text></Pressable>
  </>:<Label theme={theme} muted>No reports on this phone yet.</Label>}
  {cloud.length?<>
   <GroupLabel theme={theme}>From the cloud</GroupLabel>
   <List theme={theme}>{cloud.map(e=><ListRow key={e.id} theme={theme} title={kind(e.entry_type)} lead={<TeamTag label={teamNumber(e.team_id)} size="md" theme={theme}/>} tail={<Status label={e.status==='submitted'?'Uploaded':e.status} tone={e.status==='submitted'?'ok':'quiet'} theme={theme}/>} onPress={()=>open(e.id)}/>)}</List>
  </>:null}
 </Screen>;
}
