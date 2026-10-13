import React,{useDeferredValue,useMemo,useState} from 'react';
import {Text} from 'react-native';
import {useRouter} from 'expo-router';
import {useApp} from '../../src/core/context';
import {Screen} from '../../src/components/Screen';
import {Input,Label,Row,Section} from '../../src/components/ui';
import {eventEntries} from '../../src/core/report-overlay';

// Website parity: /events/[eventId]/teams is a number-sorted, searchable directory of the event's teams.
export default function TeamDirectory(){
 const {bundle,records,theme}=useApp(),router=useRouter();
 const [query,setQuery]=useState(''),needle=useDeferredValue(query.trim().toLowerCase());
 const reports=useMemo(()=>{
  const counts=new Map<string,number>();
  if(!bundle)return counts;
  for(const entry of eventEntries(bundle,records))if(entry.status==='submitted')counts.set(entry.team_id,(counts.get(entry.team_id)??0)+1);
  return counts;
 },[bundle,records]);
 if(!bundle)return <Screen><Label theme={theme}>Download an event first.</Label></Screen>;
 const teams=[...bundle.teams].filter(t=>!needle||`${t.displayNumber} ${t.number} ${t.name}`.toLowerCase().includes(needle)).sort((a,b)=>a.number-b.number||a.displayNumber.localeCompare(b.displayNumber));
 return <Screen>
  <Text accessibilityRole="header" style={{color:theme.text,fontSize:26,fontWeight:'800'}}>Teams</Text>
  <Label theme={theme} muted>{bundle.event.name} · {bundle.teams.length} teams · works offline</Label>
  <Input label="Find team by number or name" theme={theme} value={query} onChangeText={setQuery} autoCorrect={false} keyboardType="default"/>
  <Section title={`${teams.length} team${teams.length===1?'':'s'}`} theme={theme}>
   {teams.length===0?<Label theme={theme}>No teams match that search.</Label>:teams.map(team=><Row key={team.id} theme={theme} title={`${team.displayNumber} · ${team.name}`} subtitle={`${reports.get(team.id)??0} submitted report${(reports.get(team.id)??0)===1?'':'s'}`} onPress={()=>router.push(`/teams/${team.id}` as never)}/>)}
  </Section>
 </Screen>;
}
