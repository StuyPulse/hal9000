import React,{useEffect,useMemo,useRef,useState} from 'react';
import {View} from 'react-native';
import {Stack,useLocalSearchParams,useRouter} from 'expo-router';
import * as Crypto from 'expo-crypto';
import {Text} from '../src/components/AppText';
import {Screen} from '../src/components/Screen';
import {Button,Choice,Input,Label,Section} from '../src/components/ui';
import {useApp} from '../src/core/context';
import {scopedIdentity} from '../src/core/sync-model';
import {apiRequest} from '../src/core/mobile-api';
import {friendlyError} from '../src/core/friendly-error';
import {safetyQueue} from '../src/core/safety-sync';
import type {QueuedSafetyReport,SafetyReport} from '../src/core/safety-queue';

type ReceivedReport={id:string;target_kind:string;target_id:string|null;reason:string;details:string;status:string;resolution:string|null;created_at:string};
export default function Safety(){
 const router=useRouter();
 const {viewer,bundle,theme,online}=useApp();
 const params=useLocalSearchParams<{targetKind?:string;targetId?:string;eventId?:string}>();
 const scope=viewer?scopedIdentity(viewer.userId,viewer.organizationId,viewer.demo):null;
 const eventId=params.eventId??bundle?.event.id;
 const identity=useMemo(()=>({}),[scope,viewer?.role,eventId,params.targetKind,params.targetId]);
 const active=useRef(identity),mounted=useRef(true),lock=useRef<object|null>(null);active.current=identity;
 const valid=()=>mounted.current&&active.current===identity;
 const [details,setDetails]=useState(''),[reason,setReason]=useState<SafetyReport['reason']>('other'),[saved,setSaved]=useState(false),[busy,setBusy]=useState(false),[message,setMessage]=useState('');
 const [local,setLocal]=useState<QueuedSafetyReport[]>([]),[received,setReceived]=useState<ReceivedReport[]>([]),[page,setPage]=useState(0),[reviewId,setReviewId]=useState<string|null>(null),[resolution,setResolution]=useState('');
 useEffect(()=>{mounted.current=true;return()=>{mounted.current=false}},[]);
 useEffect(()=>{setDetails('');setSaved(false);setMessage('');setLocal([]);setReceived([]);setReviewId(null);setResolution('');setPage(0);setBusy(false);lock.current=null;if(!scope)return;let current=true;void safetyQueue(scope).list().then(rows=>{if(current)setLocal(rows)}).catch(e=>{if(current)setMessage(friendlyError(e))});return()=>{current=false}},[identity]);
 const manager=!!viewer&&['admin','developer'].includes(viewer.role);
 const targetKind=params.targetKind??'workspace',targetId=params.targetId??null;
 const targetValid=['workspace','report','photo'].includes(targetKind)&&(targetKind==='workspace'?targetId===null:!!targetId);
 const binding={expectedUserId:viewer?.userId,expectedOrganizationId:viewer?.organizationId};
 const run=async(task:()=>Promise<void>)=>{if(lock.current===identity)return;lock.current=identity;setBusy(true);setMessage('');try{await task()}catch(e){if(valid())setMessage(friendlyError(e))}finally{if(valid()){lock.current=null;setBusy(false)}}};
 const refreshLocal=async()=>{if(!scope)return;const rows=await safetyQueue(scope).list();if(valid())setLocal(rows)};
 const retry=async()=>{if(!scope||viewer?.demo||!online)return;await safetyQueue(scope).flush(valid);await refreshLocal()};
 const load=async(nextPage:number)=>{if(!viewer||viewer.demo||!online)return;const result=await apiRequest<{reports:ReceivedReport[]}>(`/api/mobile/safety?page=${nextPage}`,'GET',undefined,binding);if(valid()){setReceived(result.reports);setPage(nextPage)}};
 const send=()=>run(async()=>{
  if(!viewer||!scope||!eventId||!targetValid||saved)return;
  const report:SafetyReport={id:Crypto.randomUUID(),eventId,targetKind:targetKind as SafetyReport['targetKind'],targetId,reason,details};
  await safetyQueue(scope).save(report);if(!valid())return;
  setSaved(true);setMessage(viewer.demo?'Practice report saved locally. Nothing is sent to the team.':'Saved on this device. Delivery will retry when connected; a saved report is not yet received by an admin.');
  await refreshLocal();if(online&&!viewer.demo)await retry();
 });
 const resolve=(status:'action_taken'|'dismissed')=>run(async()=>{
  if(!reviewId||!manager)return;
  await apiRequest('/api/mobile/safety','PATCH',{id:reviewId,status,resolution},binding);
  if(valid()){setReviewId(null);setResolution('');await load(page)}
 });
 return <Screen><Stack.Screen options={{title:'Content safety'}}/>
  <Section title="Report a concern" theme={theme}>
   <Label theme={theme}>Report harassment, inappropriate content or a privacy concern to team administrators. For urgent help, contact se@stuypulse.com directly; offline reports are not delivered until connected.</Label>
   {!viewer||!eventId?<Label theme={theme}>Sign in and download an event before reporting content.</Label>:!targetValid?<Label theme={theme}>This content link is invalid. Reopen it from the report or photo.</Label>:<>
    <Label theme={theme} muted>{targetKind==='workspace'?'About this event workspace':`${targetKind==='photo'?'Photo':'Scouting report'}: ${targetId}`}</Label>
    <View style={{flexDirection:'row',flexWrap:'wrap',gap:8}}>{(['harassment','inappropriate','privacy','other'] as const).map(value=><Choice key={value} label={value[0].toUpperCase()+value.slice(1)} theme={theme} selected={reason===value} onPress={()=>{if(!busy&&!saved)setReason(value)}}/>)}</View>
    <Input label="What happened?" theme={theme} multiline maxLength={2000} value={details} onChangeText={setDetails} editable={!busy&&!saved}/>
    <Label theme={theme} muted>Only you and authorized team administrators can read this report. Do not include passwords or unrelated personal information.</Label>
    <Button title={saved?'Saved on this device':busy?'Saving…':'Save and send report'} theme={theme} disabled={busy||saved||!details.trim()} onPress={()=>void send()}/>
   </>}
   {!!message&&<Text accessibilityRole="alert" selectable style={{color:theme.text}}>{message}</Text>}
  </Section>
  <Section title="Reports saved on this device" theme={theme}>
   {!local.length?<Label theme={theme} muted>No locally saved safety reports.</Label>:local.map(row=><View key={row.report.id} style={{gap:6,paddingVertical:12,borderBottomWidth:1,borderColor:theme.line}}>
    <Text selectable style={{color:theme.text}}>{row.report.details}</Text>
    <Label theme={theme} muted>{row.status==='sent'?'Received by the server · awaiting review status below':viewer?.demo?'Local practice only':'Pending delivery'} · {row.report.id}</Label>
    {row.error?<Label theme={theme}>{friendlyError(row.error)}</Label>:null}
   </View>)}
   <Button title="Retry pending reports" secondary theme={theme} disabled={busy||!online||!viewer||viewer.demo||!local.some(row=>row.status==='pending')} onPress={()=>void run(retry)}/>
  </Section>
  {!viewer?.demo&&viewer?<Section title={manager?'Team moderation inbox':'Your report status'} theme={theme}>
   {manager?<Button title="Manage suspended team access" secondary theme={theme} onPress={()=>router.push('/admin/safety-access')}/>:null}
   <Button title="Load report status" secondary theme={theme} disabled={busy||!online} onPress={()=>void run(()=>load(0))}/>
   {received.map(row=><View key={row.id} style={{gap:8,paddingVertical:16,borderBottomWidth:1,borderColor:theme.line}}>
    <Label theme={theme}>{row.reason} · {row.status.replace('_',' ')}</Label>
    <Text selectable style={{color:theme.text}}>{row.details}</Text>
    <Label theme={theme} muted>{row.target_kind}{row.target_id?` · ${row.target_id}`:''} · {row.id}</Label>
    {row.resolution?<Label theme={theme}>Review: {row.resolution}</Label>:null}
    {manager&&row.status==='open'?<Button title="Review this concern" secondary theme={theme} disabled={busy} onPress={()=>{setReviewId(row.id);setResolution('')}}/>:null}
    {reviewId===row.id?<><Input label="Action taken or reason for dismissal" theme={theme} multiline value={resolution} maxLength={1000} onChangeText={setResolution} editable={!busy}/><Label theme={theme} muted>Resolving a concern records your review; it does not remove content or suspend an account. Perform and verify any corrective action before marking action taken.</Label><Button title="Mark action taken" theme={theme} disabled={busy||!resolution.trim()||!online} onPress={()=>void resolve('action_taken')}/><Button title="Dismiss with explanation" secondary theme={theme} disabled={busy||!resolution.trim()||!online} onPress={()=>void resolve('dismissed')}/></>:null}
   </View>)}
   <View style={{gap:8}}><Button title="Previous page" secondary theme={theme} disabled={busy||!online||page===0} onPress={()=>void run(()=>load(page-1))}/><Button title="Next page" secondary theme={theme} disabled={busy||!online||received.length<50} onPress={()=>void run(()=>load(page+1))}/></View>
  </Section>:null}
 </Screen>;
}
