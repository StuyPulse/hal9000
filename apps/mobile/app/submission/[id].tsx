import {friendlyError} from '../../src/core/friendly-error';
import React,{useEffect,useState} from 'react';
import { View, Alert, Share, Platform } from 'react-native';
import { Text } from '../../src/components/AppText';
import {useLocalSearchParams,useRouter} from 'expo-router';
import QRCode from 'react-native-qrcode-svg';
import * as Crypto from 'expo-crypto';
import {useApp} from '../../src/core/context';
import {Screen} from '../../src/components/Screen';
import {Button,Card,Label,Section,Status,TeamTag} from '../../src/components/ui';
import {reportGroups,qrSize} from '../../src/features/reportDetail';
import {makePackets} from '../../src/core/relay-model';
import {canEditReport} from '../../src/core/report-editing';
import {proofForReport} from '../../src/core/relay-device';
import {SvgXml} from 'react-native-svg';
import {matchLabel,manualMatchLabel} from '../../src/features/stats';
import {openAssignments} from '../../src/core/assignments';
export default function Submission(){
 const {id}=useLocalSearchParams<{id:string}>();
 const {bundle,records,theme,viewer,deleteLocalDraft,claimReport,deleteReport,createDraft}=useApp();
 const router=useRouter();
 const local=records.find(r=>r.entry.id===id),entry=local?.entry??bundle?.entries.find(e=>e.id===id);
 const [frames,setFrames]=useState<string[]>([]),[frame,setFrame]=useState(0),[qrError,setQrError]=useState(''),[opening,setOpening]=useState(false),[qrWidth,setQrWidth]=useState(0),[showRaw,setShowRaw]=useState(false),[showLegacy,setShowLegacy]=useState(false);
 useEffect(()=>{
  let active=true;setFrames([]);setFrame(0);setQrError('');
  if(!local||local.entry.status!=='submitted'||local.reviewRequired)return;
  void (async()=>{const proof=local.origin==='relay'?local.proof:viewer?await proofForReport(viewer,local.entry):null;const snapshot=JSON.stringify({entry:local.entry,revision:local.revision,proof:proof??undefined});const hash=await Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256,snapshot);if(active)setFrames(makePackets(snapshot,hash,Crypto.randomUUID()))})().catch(e=>{if(active)setQrError(friendlyError(e))});
  return()=>{active=false};
 },[id,local?.revision,local?.proof?.signature,local?.reviewRequired,viewer?.userId]);
 if(!entry)return <Screen><Label theme={theme}>This report isn't on this phone. Refresh the event and try again.</Label></Screen>;
 const edit=async()=>{setOpening(true);try{await claimReport(id);if(entry.entry_type==='match')router.push({pathname:'/match/[id]',params:{id}});else router.push({pathname:entry.entry_type==='pit'?'/pit':'/pre-scout',params:{entryId:id}})}catch(e){Alert.alert('Could not open for editing',friendlyError(e))}finally{setOpening(false)}};
 const teamOf=(teamId:string)=>bundle?.teams.find(t=>t.id===teamId);
 const match=bundle?.matches.find(m=>m.id===entry.match_id);
 const manual=entry.payload.manual_match as {alliance?:'red'|'blue'}&Record<string,unknown>|undefined;
 const alliance=manual?.alliance??(match?(match.red_teams.includes(entry.team_id)?'red':match.blue_teams.includes(entry.team_id)?'blue':null):null);
 const title=entry.entry_type==='match'?(manual?manualMatchLabel(manual):match?matchLabel(match):'Match'):entry.entry_type==='pit'?'Pit report':'Pre-scout report';
 const state=entry.status==='draft'?{label:'Draft',tone:'warn' as const}:!local?{label:'Uploaded',tone:'ok' as const}:local.status==='synced'?{label:'Uploaded',tone:'ok' as const}:local.error?{label:'Needs attention',tone:'bad' as const}:{label:'Saved on this phone',tone:'quiet' as const};
 // After submitting, the next assignment is one tap away.
 const upcoming=entry.status==='submitted'&&entry.scout_user_id===viewer?.userId&&bundle?openAssignments(bundle,records).map(a=>({a,m:bundle.matches.find(m=>m.id===a.match_id)})).find(x=>x.m):undefined;
 const nextAssignment=upcoming&&upcoming.m?upcoming:undefined;
 const startNext=async()=>{if(!nextAssignment)return;setOpening(true);try{const draft=await createDraft('match',nextAssignment.a.team_id,nextAssignment.a.match_id,nextAssignment.a.id);router.replace({pathname:'/match/[id]',params:{id:draft.entry.id}})}catch(e){Alert.alert('Could not start',friendlyError(e))}finally{setOpening(false)}};
 return <Screen>
  <View style={{flexDirection:'row',alignItems:'center',gap:14}}>
   <TeamTag label={teamOf(entry.team_id)?.displayNumber??'?'} alliance={entry.entry_type==='match'?alliance:null} size="lg" theme={theme}/>
   <View style={{flex:1,minWidth:0,gap:4}}>
    <Text numberOfLines={2} style={{color:theme.text,fontSize:18,fontWeight:'800'}}>{title}</Text>
    <Status label={state.label} tone={state.tone} theme={theme}/>
   </View>
  </View>
  {local?.reviewRequired&&<Label theme={theme}>These edits aren't published yet. Open the report and save changes.</Label>}
  {local?.error&&<Text selectable accessibilityRole="alert" style={{color:theme.danger}}>{local.error}</Text>}
  {nextAssignment&&<Button title={opening?'Opening…':`Scout next: ${teamOf(nextAssignment.a.team_id)?.displayNumber} in ${matchLabel(nextAssignment.m!)}`} disabled={opening} theme={theme} onPress={()=>void startNext()}/>}
  {canEditReport(viewer,entry,local)&&<Button title={opening&&!nextAssignment?'Opening…':'Edit report'} secondary={Boolean(nextAssignment)} disabled={opening} theme={theme} onPress={()=>void edit()}/>}
  {entry.status==='submitted'&&Boolean(entry.payload.manual_match)&&viewer&&local?.origin!=='relay'&&(['admin','developer'].includes(viewer.role)||entry.scout_user_id===viewer.userId)&&<Button title="Correct match details" secondary theme={theme} onPress={()=>router.push({pathname:'/edit-manual',params:{id}})}/>}
  {reportGroups(entry.entry_type,entry.payload,id=>teamOf(id)?.displayNumber??'Unknown team').map(group=><Section key={group.title} title={group.title} theme={theme}><Card theme={theme}>{group.rows.map(row=><View key={row.label} style={{flexDirection:'row',justifyContent:'space-between',gap:12}}><Text style={{color:theme.muted,fontSize:15,flexShrink:1}}>{row.label}</Text><Text selectable style={{color:theme.text,fontSize:15,fontWeight:'700',flex:1,textAlign:'right',fontVariant:['tabular-nums']}}>{row.value}</Text></View>)}</Card></Section>)}
  {entry.entry_type==='pit'&&typeof entry.payload.auto_routines_drawing==='string'&&entry.payload.auto_routines_drawing.includes('<svg')&&<Section title="Autonomous routes" theme={theme}><View style={{aspectRatio:1380/674,backgroundColor:'#fff',borderRadius:12,overflow:'hidden'}}><SvgXml xml={entry.payload.auto_routines_drawing} width="100%" height="100%"/></View></Section>}
  {local&&entry.status==='submitted'&&!local.reviewRequired&&local.status!=='synced'&&<Section title="Send without Wi-Fi" theme={theme}>
   <Button title="Share by QR" icon="qr" theme={theme} onPress={()=>router.push('/share-qr')}/>
   <Button title={showLegacy?'Hide code for older app versions':'Code for older app versions'} secondary theme={theme} onPress={()=>setShowLegacy(!showLegacy)}/>
   {showLegacy&&<>
    {qrError?<Label theme={theme}>{qrError}</Label>:null}
    {frames.length>0&&<>
     <View onLayout={e=>setQrWidth(e.nativeEvent.layout.width)} style={{alignItems:'center',padding:16,backgroundColor:'#fff',borderRadius:16}}><QRCode value={frames[frame]} size={qrSize(qrWidth)}/></View>
     <View style={{flexDirection:'row',gap:8,alignItems:'center'}}><Button title="Previous" theme={theme} secondary disabled={frame===0} onPress={()=>setFrame(frame-1)} style={{flex:1}}/><Text style={{color:theme.muted,fontVariant:['tabular-nums']}}>{frame+1} / {frames.length}</Text><Button title="Next" theme={theme} secondary disabled={frame===frames.length-1} onPress={()=>setFrame(frame+1)} style={{flex:1}}/></View>
    </>}
   </>}
  </Section>}
  <Section title="Details" theme={theme}>
   <Card theme={theme}>
    {[['By',bundle?.profiles?.[entry.scout_user_id]??'Scout'],['Submitted',entry.submitted_at?new Date(entry.submitted_at).toLocaleString():'Not yet'],entry.updated_at?['Updated',new Date(entry.updated_at).toLocaleString()+((entry as typeof entry&{last_edited_by?:string}).last_edited_by?' by '+(bundle?.profiles?.[(entry as typeof entry&{last_edited_by:string}).last_edited_by]??'Scout'):'')]:null,local?['Revision',`${local.revision} (cloud has ${local.acknowledgedRevision??'none'})`]:null,['ID',entry.id]].filter((r):r is string[]=>Boolean(r)).map(([label,value])=><View key={label} style={{flexDirection:'row',justifyContent:'space-between',gap:12}}><Text style={{color:theme.muted,fontSize:14}}>{label}</Text><Text selectable style={{color:theme.text,fontSize:14,flex:1,textAlign:'right'}}>{value}</Text></View>)}
   </Card>
   <Button title={showRaw?'Hide raw data':'Show raw data'} secondary theme={theme} onPress={()=>setShowRaw(!showRaw)}/>
   {showRaw&&<Card theme={theme}><Text selectable style={{color:theme.muted,fontSize:12,fontFamily:Platform.select({ios:'Courier',default:'monospace'})}}>{JSON.stringify(entry.payload,null,2)}</Text></Card>}
   <Button title="Export backup" secondary theme={theme} onPress={()=>void Share.share({message:JSON.stringify({entry,revision:local?.revision},null,2)}).catch(e=>Alert.alert('Could not export',friendlyError(e)))}/>
   <Button title="Report a problem with this content" secondary theme={theme} onPress={()=>router.push({pathname:'/safety',params:{targetKind:'report',targetId:entry.id,eventId:entry.event_id}})}/>
   {local?.entry.status==='draft'&&<Button title="Delete draft" secondary theme={theme} onPress={()=>Alert.alert('Delete this draft?',local.baseUpdatedAt?'Its cloud backup is deleted too. You need to be online.':'It is removed from this phone.',[{text:'Keep',style:'cancel'},{text:'Delete',style:'destructive',onPress:()=>void deleteLocalDraft(id).then(()=>router.back()).catch(e=>Alert.alert('Could not delete',friendlyError(e)))}])}/>}
   {entry.status==='submitted'&&local?.origin!=='relay'&&viewer&&(['admin','developer'].includes(viewer.role)||entry.scout_user_id===viewer.userId)&&<Button title="Delete report" secondary theme={theme} onPress={()=>Alert.alert('Delete this report?',viewer.demo?'This practice report is removed.':'It is deleted from the server for everyone, and its assignment reopens. Edits not yet uploaded are lost.',[{text:'Keep',style:'cancel'},{text:'Delete',style:'destructive',onPress:()=>void deleteReport(id).then(()=>router.back()).catch(e=>Alert.alert('Could not delete',friendlyError(e)))}])}/>}
  </Section>
 </Screen>;
}
