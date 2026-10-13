import React,{useDeferredValue,useMemo,useState} from 'react';
import {Text,View} from 'react-native';
import {useRouter} from 'expo-router';
import {useApp} from '../src/core/context';
import {Screen} from '../src/components/Screen';
import {Choice,Input,Label,Row,Section} from '../src/components/ui';
import {matchLabel} from '../src/features/stats';

export default function Search(){
 const {viewer,bundle,records,theme}=useApp(),router=useRouter();
 const [query,setQuery]=useState(''),[filter,setFilter]=useState<'All'|'Teams'|'Matches'|'Reports'>('All'),[limit,setLimit]=useState(30);
 const value=useDeferredValue(query.trim().toLocaleLowerCase());
 const results=useMemo(()=>{
  if(!bundle||value.length<1)return {teams:[],matches:[],reports:[]};
  const includes=(input:unknown)=>String(input??'').toLocaleLowerCase().includes(value);
  const teams=bundle.teams.filter(team=>[team.number,team.displayNumber,team.name].some(includes)),teamIds=new Set(teams.map(t=>t.id));
  const matches=bundle.matches.filter(match=>[matchLabel(match),match.match_number,match.match_type,match.status,match.tba_match_key].some(includes)||[...match.red_teams,...match.blue_teams].some(id=>teamIds.has(id))),matchIds=new Set(matches.map(m=>m.id));
  const entries=new Map(bundle.entries.map(entry=>[entry.id,{entry,localStatus:null as string|null}]));
  for(const local of records)if(local.entry.event_id===bundle.event.id)entries.set(local.entry.id,{entry:local.entry,localStatus:local.status});
  const reports=[...entries.values()].filter(({entry})=>teamIds.has(entry.team_id)||!!entry.match_id&&matchIds.has(entry.match_id)||[entry.entry_type,entry.status,bundle.profiles?.[entry.scout_user_id],entry.scout_user_id,...Object.values(entry.payload).filter(v=>typeof v==='string')].some(includes)).sort((a,b)=>String(b.entry.submitted_at??b.entry.updated_at??'').localeCompare(String(a.entry.submitted_at??a.entry.updated_at??'')));
  return {teams,matches,reports};
 },[bundle,records,value]);
 if(!viewer)return <Screen><Label theme={theme}>Sign in to search your downloaded event.</Label></Screen>;
 if(!bundle)return <Screen><Label theme={theme}>Download an event in Settings before searching offline.</Label><Row title="Open Settings" theme={theme} onPress={()=>router.push('/settings')}/></Screen>;
 const visible=filter==='All'?['Teams','Matches','Reports']:[filter],count=filter==='Teams'?results.teams.length:filter==='Matches'?results.matches.length:filter==='Reports'?results.reports.length:results.teams.length+results.matches.length+results.reports.length;
 return <Screen>
  <Text accessibilityRole="header" style={{color:theme.text,fontSize:24,fontWeight:'700'}}>Search</Text>
  <Label theme={theme} muted>{bundle.event.name} · downloaded event only · works offline</Label>
  <Input label="Search teams, matches and reports" theme={theme} autoFocus autoCorrect={false} placeholder="Team number, scout, match or report notes" value={query} onChangeText={text=>{setQuery(text);setLimit(30)}}/>
  <View style={{flexDirection:'row',flexWrap:'wrap',gap:8}}>{(['All','Teams','Matches','Reports'] as const).map(item=><Choice key={item} label={item} theme={theme} selected={filter===item} onPress={()=>{setFilter(item);setLimit(30)}}/>)}</View>
  {!value?<Label theme={theme}>Search teams, matches and reports.</Label>:!count?<Label theme={theme}>No results.</Label>:<>
   {visible.includes('Teams')&&<Section title={`Teams · ${results.teams.length}`} theme={theme}>{results.teams.slice(0,limit).map(team=><Row key={team.id} theme={theme} title={`${team.displayNumber} · ${team.name}`} subtitle={`Permanent team ${team.number}`} onPress={()=>router.push(`/teams/${team.id}` as never)}/>)}</Section>}
   {visible.includes('Matches')&&<Section title={`Matches · ${results.matches.length}`} theme={theme}>{results.matches.slice(0,limit).map(match=><Row key={match.id} theme={theme} title={matchLabel(match)} subtitle={`${match.status} · ${[...match.red_teams,...match.blue_teams].map(id=>bundle.teams.find(t=>t.id===id)?.displayNumber??'?').join(' / ')}`} onPress={()=>router.push({pathname:'/(tabs)/schedule',params:{match:match.id}} as never)}/>)}</Section>}
   {visible.includes('Reports')&&<Section title={`Reports · ${results.reports.length}`} theme={theme}>{results.reports.slice(0,limit).map(({entry,localStatus})=><Row key={entry.id} theme={theme} title={`${bundle.teams.find(t=>t.id===entry.team_id)?.displayNumber??'Team'} · ${entry.entry_type.replace('_',' ')}`} subtitle={`${bundle.profiles?.[entry.scout_user_id]??(entry.scout_user_id===viewer.userId?viewer.displayName:'Scout')} · ${localStatus??entry.status}`} onPress={()=>router.push(`/submission/${entry.id}` as never)}/>)}</Section>}
   {Math.max(results.teams.length,results.matches.length,results.reports.length)>limit&&<Row title="Show more results" subtitle="30 more per section" theme={theme} onPress={()=>setLimit(v=>v+30)}/>}
  </>}
 </Screen>;
}
