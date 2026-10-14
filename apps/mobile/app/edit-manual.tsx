import {friendlyError} from '../src/core/friendly-error';
import React,{useState} from 'react';
import {Alert,View} from 'react-native';
import {Stack,useLocalSearchParams,useRouter} from 'expo-router';
import {useApp} from '../src/core/context';
import {Screen} from '../src/components/Screen';
import {Button,Choice,Input,Label,Section} from '../src/components/ui';

export default function EditManual(){
 const {id}=useLocalSearchParams<{id:string}>();
 const {bundle,records,theme,viewer,online,saveManualIdentity}=useApp();
 const entry=records.find(r=>r.entry.id===id)?.entry??bundle?.entries.find(e=>e.id===id);
 const metadata=entry?.payload.manual_match as {stage?:string;label?:string;alliance?:string}|undefined;
 const [teamId,setTeamId]=useState(entry?.team_id??''),[stage,setStage]=useState(metadata?.stage??'Qualification'),[label,setLabel]=useState(metadata?.label??''),[alliance,setAlliance]=useState<'red'|'blue'>(metadata?.alliance==='blue'?'blue':'red'),[busy,setBusy]=useState(false);
 const router=useRouter();
 if(!entry||!metadata||!bundle)return <Screen><Label theme={theme}>Download this report first.</Label></Screen>;
 const save=async()=>{setBusy(true);try{await saveManualIdentity(id,teamId,{stage,label:label.trim()||null,alliance});router.back()}catch(e){Alert.alert('Correction not confirmed',friendlyError(e))}finally{setBusy(false)}};
 return <Screen><Stack.Screen options={{title:'Correct manual match'}}/>
  
  <Section title="Robot" theme={theme}><View style={{flexDirection:'row',flexWrap:'wrap',gap:8}}>{bundle.teams.map(team=><Choice key={team.id} label={`${team.displayNumber} · ${team.name}`} selected={teamId===team.id} theme={theme} onPress={()=>setTeamId(team.id)}/>)}</View></Section>
  <Section title="Stage" theme={theme}><View style={{flexDirection:'row',flexWrap:'wrap',gap:8}}>{['Qualification','Practice','Quarterfinal','Semifinal','Final','Other / exception'].map(value=><Choice key={value} label={value} selected={stage===value} theme={theme} onPress={()=>setStage(value)}/>)}</View></Section>
  <Input label={stage==='Other / exception'?'Optional match label':'Match number'} theme={theme} keyboardType="default" placeholder="e.g. 3 or 2–1" maxLength={30} value={label} onChangeText={setLabel}/>
  <View style={{flexDirection:'row',gap:8}}>{(['red','blue'] as const).map(value=><Choice key={value} label={`${value==='red'?'Red':'Blue'} alliance`} selected={alliance===value} theme={theme} onPress={()=>setAlliance(value)}/>)}</View>
  {!online&&!viewer?.demo&&<Label theme={theme}>Connect to edit this report.</Label>}
  <Button title={busy?'Confirming correction…':'Save correction'} theme={theme} disabled={busy||(!online&&!viewer?.demo)} onPress={()=>void save()}/>
 </Screen>;
}
