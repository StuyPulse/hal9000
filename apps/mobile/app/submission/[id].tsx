import React,{useEffect,useState} from 'react';
import {Text,View,Alert,Share,Platform} from 'react-native';
import {useLocalSearchParams,useRouter} from 'expo-router';
import QRCode from 'react-native-qrcode-svg';
import * as Crypto from 'expo-crypto';
import {useApp} from '../../src/core/context';
import {Screen} from '../../src/components/Screen';
import {Button,Card,Label,Row,Section} from '../../src/components/ui';
import {reportGroups,qrSize} from '../../src/features/reportDetail';
import {makePackets} from '../../src/core/relay-model';
import {canEditReport} from '../../src/core/report-editing';
import {proofForReport} from '../../src/core/relay-device';
import {SvgXml} from 'react-native-svg';
import {matchLabel,manualMatchLabel} from '../../src/features/stats';
export default function Submission(){
 const {id}=useLocalSearchParams<{id:string}>();
 const {bundle,records,theme,sync,viewer,deleteLocalDraft,claimReport,deleteReport}=useApp();
 const router=useRouter();
 const local=records.find(r=>r.entry.id===id),entry=local?.entry??bundle?.entries.find(e=>e.id===id);
 const [frames,setFrames]=useState<string[]>([]),[frame,setFrame]=useState(0),[qrError,setQrError]=useState(''),[opening,setOpening]=useState(false),[qrWidth,setQrWidth]=useState(0),[showRaw,setShowRaw]=useState(false);
 useEffect(()=>{
  let active=true;setFrames([]);setFrame(0);setQrError('');
  if(!local||local.entry.status!=='submitted'||local.reviewRequired)return;
  void (async()=>{const proof=local.origin==='relay'?local.proof:viewer?await proofForReport(viewer,local.entry):null;const snapshot=JSON.stringify({entry:local.entry,revision:local.revision,proof:proof??undefined});const hash=await Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256,snapshot);if(active)setFrames(makePackets(snapshot,hash,Crypto.randomUUID()))})().catch(e=>{if(active)setQrError(e.message)});
  return()=>{active=false};
 },[id,local?.revision,local?.proof?.signature,local?.reviewRequired,viewer?.userId]);
 if(!entry)return <Screen><Label theme={theme}>This report is not in the downloaded event or local outbox.</Label></Screen>;
 const edit=async()=>{setOpening(true);try{await claimReport(id);if(entry.entry_type==='match')router.push({pathname:'/match/[id]',params:{id}});else router.push({pathname:entry.entry_type==='pit'?'/pit':'/pre-scout',params:{entryId:id}})}catch(e){Alert.alert('Could not open for editing',(e as Error).message)}finally{setOpening(false)}};
 return <Screen>
  <Text style={{color:theme.text,fontSize:26,fontWeight:'800'}}>{bundle?.teams.find(t=>t.id===entry.team_id)?.displayNumber} · {entry.entry_type}</Text>
  <Label theme={theme}>{entry.entry_type==='match'?(entry.payload.manual_match?manualMatchLabel(entry.payload.manual_match as Record<string,unknown>):bundle?.matches.find(m=>m.id===entry.match_id)?matchLabel(bundle.matches.find(m=>m.id===entry.match_id)!):'Match report'):entry.entry_type==='pit'?'Pit report':'Pre-scout report'}</Label>
  <Label theme={theme} muted>Author: {bundle?.profiles?.[entry.scout_user_id]??'Scout'} · {entry.submitted_at?new Date(entry.submitted_at).toLocaleString():'Saved draft'}</Label>
  {entry.updated_at&&<Label theme={theme} muted>Updated {new Date(entry.updated_at).toLocaleString()}{(entry as typeof entry&{last_edited_by?:string}).last_edited_by?' · Last edited by '+(bundle?.profiles?.[(entry as typeof entry&{last_edited_by:string}).last_edited_by]??'Scout'):''}</Label>}
  {local?.reviewRequired&&<Label theme={theme}>Unpublished working edits. Open Edit report and tap Save changes to publish them. QR handoff is unavailable until then.</Label>}
  <Card theme={theme}>
   <Label theme={theme}>{entry.status==='draft'?(local?.status==='synced'?'Unsubmitted draft · backed up':'Unsubmitted draft · saved locally'):local?local.status:'Downloaded server record'}</Label>
   {local&&<Label theme={theme} muted>Local revision {local.revision} · cloud acknowledgment {local.acknowledgedRevision??'none'}</Label>}
   {local?.error&&<Text selectable accessibilityRole="alert" style={{color:theme.danger}}>{local.error}</Text>}
   <Text selectable style={{color:theme.muted,fontSize:12}}>Permanent ID: {entry.id}</Text>
  </Card>
  {canEditReport(viewer,entry,local)&&<Button title={opening?'Opening…':'Edit report'} disabled={opening} theme={theme} onPress={()=>void edit()}/>}
  {entry.status==='submitted'&&Boolean(entry.payload.manual_match)&&viewer&&local?.origin!=='relay'&&(['admin','developer'].includes(viewer.role)||entry.scout_user_id===viewer.userId)&&<Button title="Correct manual match identity" secondary theme={theme} onPress={()=>router.push({pathname:'/edit-manual',params:{id}})}/>}
  {reportGroups(entry.entry_type,entry.payload,id=>bundle?.teams.find(t=>t.id===id)?.displayNumber??'Unknown team').map(group=><Section key={group.title} title={group.title} theme={theme}><Card theme={theme}>{group.rows.map(row=><View key={row.label} style={{flexDirection:'row',justifyContent:'space-between',gap:12}}><Text style={{color:theme.muted,fontSize:14,flexShrink:1}}>{row.label}</Text><Text selectable style={{color:theme.text,fontSize:14,fontWeight:'600',flex:1,textAlign:'right'}}>{row.value}</Text></View>)}</Card></Section>)}
  {entry.entry_type==='pit'&&typeof entry.payload.auto_routines_drawing==='string'&&entry.payload.auto_routines_drawing.includes('<svg')&&<Section title="Autonomous routes" theme={theme}><View style={{aspectRatio:1380/674,backgroundColor:'#fff',overflow:'hidden'}}><SvgXml xml={entry.payload.auto_routines_drawing} width="100%" height="100%"/></View></Section>}
  <Section title="Raw data" theme={theme}>
   <Button title={showRaw?'Hide raw JSON':'Show raw JSON'} secondary theme={theme} onPress={()=>setShowRaw(!showRaw)}/>
   {showRaw&&<Card theme={theme}><Text selectable style={{color:theme.muted,fontSize:12,fontFamily:Platform.select({ios:'Courier',default:'monospace'})}}>{JSON.stringify(entry.payload,null,2)}</Text></Card>}
  </Section>
  {local&&entry.status==='submitted'&&!local.reviewRequired&&<Section title="QR handoff" theme={theme}>
   <Label theme={theme} muted>This transfers your exact local snapshot. Enable signed relay in Settings while online before competition. Unsigned QR copies are backups only; cloud relay requires a registered author signature.</Label>
   {qrError&&<Label theme={theme}>{qrError}</Label>}
   {frames.length>0&&<>
    <View onLayout={e=>setQrWidth(e.nativeEvent.layout.width)} style={{alignItems:'center',padding:16,backgroundColor:'#fff',borderRadius:16}}><QRCode value={frames[frame]} size={qrSize(qrWidth)}/></View>
    <View style={{flexDirection:'row',gap:8}}><Button title="Previous" theme={theme} secondary disabled={frame===0} onPress={()=>setFrame(frame-1)} style={{flex:1}}/><Button title="Next frame" theme={theme} secondary disabled={frame===frames.length-1} onPress={()=>setFrame(frame+1)} style={{flex:1}}/></View>
    <Label theme={theme}>Frame {frame+1} of {frames.length}. The Master device needs every frame.</Label>
   </>}
   <Button title="Retry direct sync" theme={theme} onPress={()=>void sync()}/>
  </Section>}
  <Button title="Export report backup" secondary theme={theme} onPress={()=>void Share.share({message:JSON.stringify({entry,revision:local?.revision},null,2)}).catch(e=>Alert.alert('Could not export',e.message))}/>
  {local?.entry.status==='draft'&&<Button title={local.baseUpdatedAt?'Delete backed-up draft':'Remove local draft'} secondary theme={theme} onPress={()=>Alert.alert('Remove this unsubmitted draft?',local.baseUpdatedAt?'This also permanently deletes its cloud draft. Connect before deleting.':'This removes the draft from this phone.',[{text:'Keep',style:'cancel'},{text:'Remove',style:'destructive',onPress:()=>void deleteLocalDraft(id).then(()=>router.back()).catch(e=>Alert.alert('Could not remove',e.message))}])}/>}
  {entry.status==='submitted'&&local?.origin!=='relay'&&viewer&&(['admin','developer'].includes(viewer.role)||entry.scout_user_id===viewer.userId)&&<Button title={viewer.demo?'Delete practice report':'Delete server report'} secondary theme={theme} onPress={()=>Alert.alert('Delete this report?',viewer.demo?'Removes this isolated practice report.':'This permanently deletes the server report and reopens its assignment when appropriate. Unsynced edits are not uploaded.',[{text:'Keep',style:'cancel'},{text:'Delete',style:'destructive',onPress:()=>void deleteReport(id).then(()=>router.back()).catch(e=>Alert.alert('Could not delete',e.message))}])}/>}
 </Screen>;
}
