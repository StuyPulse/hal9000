import React,{useEffect,useState} from 'react';
import {getValue} from '../src/core/storage';
import {scopedIdentity} from '../src/core/sync-model';
import { Pressable, Share, View } from 'react-native';
import { Text } from '../src/components/AppText';
import {useRouter} from 'expo-router';
import {useApp} from '../src/core/context';
import {Screen} from '../src/components/Screen';
import {Button,Label} from '../src/components/ui';

export default function Outbox(){
 const {records,photos,bundle,theme,sync,syncing,online,viewer}=useApp();const router=useRouter();
 const [lastSync,setLastSync]=useState<number|null>(null);
 const scope=viewer?scopedIdentity(viewer.userId,viewer.organizationId,viewer.demo):null;
 useEffect(()=>{if(!scope)return;void getValue<{at:number}>(scope,'meta','last-sync').then(v=>setLastSync(v?.at??null)).catch(()=>undefined)},[scope,syncing,records]);
 const ago=(at:number)=>{const m=Math.round((Date.now()-at)/60000);return m<1?'just now':m<60?`${m} min ago`:m<1440?`${Math.round(m/60)} h ago`:new Date(at).toLocaleDateString()};
 const local=records.filter(r=>r.entry.event_id===bundle?.event.id);
 const waiting=local.filter(r=>r.status!=='synced'&&r.entry.status==='submitted').length;
 const pendingPhotos=photos.filter(p=>p.status!=='synced').length;
 const teamNumber=(id:string)=>bundle?.teams.find(t=>t.id===id)?.displayNumber??'Team';
 const kind=(t:string)=>t==='pre_scout'?'pre-scout':t;
 const cloud=(bundle?.entries??[]).filter(e=>!local.some(r=>r.entry.id===e.id)).slice().reverse();
 const open=(id:string)=>router.push({pathname:'/submission/[id]',params:{id}});
 const row=(key:string,title:string,subtitle:string,id:string,error?:string|null)=><Pressable key={key} accessibilityRole="button" accessibilityLabel={title} onPress={()=>open(id)} style={{minHeight:60,paddingHorizontal:16,paddingVertical:10,justifyContent:'center',gap:2,borderTopWidth:1,borderTopColor:theme.line}}>
  <Text style={{color:theme.text,fontSize:17,fontWeight:'600'}}>{title}</Text>
  <Text style={{color:theme.muted,fontSize:14}}>{subtitle}</Text>
  {error?<Text selectable style={{color:theme.danger,fontSize:13}}>{error}</Text>:null}
 </Pressable>;
 const group=(title:string,children:React.ReactNode)=><View style={{gap:6}}><Text accessibilityRole="header" style={{color:theme.muted,fontSize:13,fontWeight:'700',letterSpacing:.6,textTransform:'uppercase'}}>{title}</Text><View style={{backgroundColor:theme.surface,borderRadius:14,overflow:'hidden',marginTop:-1}}>{children}</View></View>;
 return <Screen>
  <View style={{flexDirection:'row',alignItems:'center',justifyContent:'space-between',gap:12}}>
   <Text style={{color:waiting||pendingPhotos?theme.warning:theme.muted,fontSize:16,fontWeight:'600',flex:1}}>{waiting||pendingPhotos?`${waiting} report${waiting===1?'':'s'} · ${pendingPhotos} photo${pendingPhotos===1?'':'s'} to send`:'Everything is sent'}{lastSync?`\nLast synced ${ago(lastSync)}`:''}</Text>
   <Button title={syncing?'Syncing…':'Sync'} theme={theme} secondary={!(waiting||pendingPhotos)} disabled={syncing||!online||viewer?.demo} onPress={()=>void sync()} style={{minHeight:46,paddingVertical:8,paddingHorizontal:20}}/>
  </View>
  {local.length?<Pressable accessibilityRole="button" accessibilityLabel="Export backup of reports on this phone" onPress={()=>void Share.share({message:JSON.stringify({exportedAt:new Date().toISOString(),event:bundle?.event.name,reports:local.map(r=>({entry:r.entry,revision:r.revision,status:r.status}))},null,2),title:'HAL9000 reports backup'}).catch(()=>undefined)} style={{alignSelf:'flex-start',minHeight:44,justifyContent:'center'}}><Text style={{color:theme.tint,fontWeight:'700',fontSize:15}}>Export backup of {local.length} report{local.length===1?'':'s'}</Text></Pressable>:null}
  {local.length?group('On this phone',local.map(r=>row(r.entry.id,`${teamNumber(r.entry.team_id)} · ${kind(r.entry.entry_type)}`,`${r.entry.status==='draft'?(r.status==='synced'?'Draft · backed up':'Draft · on this phone'):r.status}${r.origin==='relay'?' · QR receipt':''}`,r.entry.id,r.error))):<Label theme={theme} muted>Nothing on this phone yet.</Label>}
  {cloud.length?group('From the cloud',cloud.map(e=>row(e.id,`${teamNumber(e.team_id)} · ${kind(e.entry_type)}`,e.status,e.id))):null}
 </Screen>;
}
