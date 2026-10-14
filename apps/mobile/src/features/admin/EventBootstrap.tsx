import {friendlyError} from '../../core/friendly-error';
import React,{useRef,useState} from 'react';
import { Alert } from 'react-native';
import { Text } from '../../components/AppText';
import {useRouter} from 'expo-router';
import {useApp} from '../../core/context';
import {createManualEvent,serverSetupAction} from '../../core/setup';
import {eventInput} from '../../core/setup-model';
import {Screen} from '../../components/Screen';
import {Button,Input,Label,Section} from '../../components/ui';

// Organization-level setup must not depend on an existing event package.
export function EventBootstrap(){
 const {viewer,events,theme,online,refresh}=useApp(),router=useRouter();
 const [name,setName]=useState(''),[date,setDate]=useState(''),[endDate,setEndDate]=useState(''),[key,setKey]=useState(''),[busy,setBusy]=useState(false),[message,setMessage]=useState('');
 const lock=useRef(false),currentUser=useRef(viewer?.userId);currentUser.current=viewer?.userId;
 const run=async(action:()=>Promise<void>,success:string)=>{
  if(!viewer||lock.current)return;if(!online){setMessage('Connect before setting up an event.');return;}const userId=viewer.userId;lock.current=true;setBusy(true);setMessage('');
  try{await action();if(currentUser.current!==userId)return;await refresh();if(currentUser.current===userId)setMessage(success);}catch(e){if(currentUser.current===userId)setMessage(friendlyError(e));}finally{lock.current=false;if(currentUser.current===userId)setBusy(false);}
 };
 if(!viewer||!['admin','developer'].includes(viewer.role))return <Screen><Label theme={theme}>An admin needs to create or import your organization’s event.</Label></Screen>;
 return <Screen><Text accessibilityRole="header" style={{color:theme.text,fontSize:24,fontWeight:'700'}}>Events & imports</Text>
  <Label theme={theme}>Create a manual event or import from TBA, then select and activate it. No existing event is required.</Label>
  {!!message&&<Text accessibilityRole="alert" style={{color:theme.text,lineHeight:22}}>{message}</Text>}
  <Section title="Import from TBA" theme={theme}><Input label="TBA event key" theme={theme} value={key} onChangeText={setKey} autoCapitalize="none" placeholder="2026nyhv"/><Button title={busy?'Working…':'Import event'} theme={theme} disabled={busy} onPress={()=>Alert.alert('Import this event?',key,[{text:'Cancel',style:'cancel'},{text:'Import',onPress:()=>void run(async()=>{if(!/^\d{4}[a-z0-9]+$/i.test(key.trim()))throw Error('Enter a TBA event key, for example 2026nyhv.');await serverSetupAction(viewer,'/api/mobile/admin/tba-import',{eventKey:key.trim()});},'Event imported. Select it in Settings.')}])}/></Section>
  <Section title="Create a manual event" theme={theme}><Input label="Event name" theme={theme} value={name} onChangeText={setName}/><Input label="Date (YYYY-MM-DD)" theme={theme} value={date} onChangeText={setDate}/><Input label="Final date (optional)" theme={theme} value={endDate} onChangeText={setEndDate}/><Button title="Create event" theme={theme} disabled={busy} onPress={()=>void run(async()=>{await createManualEvent(viewer,eventInput.parse({name,date,endDate:endDate||undefined}));},'Event created. Select it in Settings.')}/></Section>
  {!!events.length&&<Button secondary title="Choose an event in Settings" theme={theme} onPress={()=>router.push('/settings')}/>}
 </Screen>;
}
