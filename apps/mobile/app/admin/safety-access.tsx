import React,{useEffect,useMemo,useRef,useState} from 'react';
import {Alert} from 'react-native';
import {Stack} from 'expo-router';
import {useApp} from '../../src/core/context';
import {apiRequest} from '../../src/core/mobile-api';
import {friendlyError} from '../../src/core/friendly-error';
import {Screen} from '../../src/components/Screen';
import {Button,Input,Label,Row,Section} from '../../src/components/ui';
type Member={id:string;name:string;role:string};
type Suspension={user_id:string;previous_role:string;reason:string;profiles:{display_name:string}|null};
export default function SafetyAccess(){
 const {viewer,theme,online}=useApp();
 const identity=useMemo(()=>({}),[viewer?.userId,viewer?.organizationId,viewer?.role]),current=useRef(identity),mounted=useRef(true),lock=useRef<object|null>(null);current.current=identity;
 const valid=()=>mounted.current&&current.current===identity;
 const [members,setMembers]=useState<Member[]>([]),[suspended,setSuspended]=useState<Suspension[]>([]),[target,setTarget]=useState<Member|null>(null),[reason,setReason]=useState(''),[busy,setBusy]=useState(false),[message,setMessage]=useState('');
 useEffect(()=>{mounted.current=true;return()=>{mounted.current=false}},[]);
 useEffect(()=>{setMembers([]);setSuspended([]);setTarget(null);setReason('');setMessage('');setBusy(false);lock.current=null},[identity]);
 const manager=!!viewer&&['admin','developer'].includes(viewer.role),binding={expectedUserId:viewer?.userId,expectedOrganizationId:viewer?.organizationId};
 const run=async(fn:()=>Promise<void>)=>{if(!manager||!online||viewer?.demo||lock.current===identity)return;lock.current=identity;setBusy(true);setMessage('');try{await fn()}catch(e){if(valid())setMessage(friendlyError(e))}finally{if(valid()){lock.current=null;setBusy(false)}}};
 const load=async()=>{const [active,blocked]=await Promise.all([apiRequest<{members:Member[]}>('/api/mobile/admin/members','GET',undefined,binding),apiRequest<{suspensions:Suspension[]}>('/api/mobile/admin/suspensions','GET',undefined,binding)]);if(valid()){const activeIds=new Set(active.members.map(member=>member.id));setMembers(active.members);setSuspended(blocked.suspensions.filter(member=>!activeIds.has(member.user_id)))}};
 const change=(userId:string,name:string,restore:boolean)=>Alert.alert(restore?'Restore team access?':'Suspend team access?',restore?`${name} will regain their previously recorded team role. This grants access to team data again.`:`${name} will lose membership in this team. Reports are retained, not deleted. Offline copies cannot be remotely erased, and other teams are unaffected.`,[{text:'Cancel',style:'cancel'},{text:restore?'Restore access':'Suspend access',style:restore?'default':'destructive',onPress:()=>{if(!valid())return;void run(async()=>{await apiRequest('/api/mobile/admin/suspensions','POST',{userId,restore,reason:restore?'Administrator restored prior team access.':reason},binding);if(valid()){setTarget(null);setReason('');await load()}})}}]);
 return <Screen><Stack.Screen options={{title:'Team access safeguards'}}/>
  {!manager?<Label theme={theme}>Admin or developer access is required.</Label>:<>
   <Label theme={theme}>Suspension blocks team membership without deleting accounts or scouting records. It is reversible and requires a connection.</Label>
   {viewer?.demo?<Label theme={theme}>Access changes are unavailable in local practice. No live account is affected.</Label>:null}
   {!!message?<Label theme={theme}>{message}</Label>:null}
   <Button title="Load team access" theme={theme} disabled={busy||!online||viewer?.demo} onPress={()=>void run(load)}/>
   <Section title="Active members" theme={theme}>{members.filter(member=>member.id!==viewer?.userId).map(member=><Row key={member.id} title={member.name} subtitle={member.role} theme={theme} onPress={()=>{if(!busy){setTarget(member);setReason('')}}}/>)}
    {target?<><Label theme={theme}>Suspend {target.name}</Label><Input label="Reason for suspension" theme={theme} value={reason} maxLength={500} onChangeText={setReason} editable={!busy}/><Button title="Suspend this member" theme={theme} disabled={busy||!online||!reason.trim()} onPress={()=>change(target.id,target.name,false)}/></>:null}
   </Section>
   <Section title="Suspended members" theme={theme}>{suspended.map(member=><Section key={member.user_id} title={member.profiles?.display_name??'Member'} theme={theme}><Label theme={theme}>{member.reason} · prior role: {member.previous_role}</Label><Button title="Restore prior team access" secondary theme={theme} disabled={busy||!online} onPress={()=>change(member.user_id,member.profiles?.display_name??'This member',true)}/></Section>)}</Section>
  </>}
 </Screen>;
}
