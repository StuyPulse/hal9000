import React,{useEffect,useState} from 'react';
import {Alert,Text,View} from 'react-native';
import {useLocalSearchParams,useRouter} from 'expo-router';
import {useApp} from '../src/core/context';
import {eventEntries} from '../src/core/report-overlay';
import {Screen} from '../src/components/Screen';
import {Button,Choice,Label,Row,Section} from '../src/components/ui';
import {TeamPicker} from '../src/features/common';
import {matchLabel,manualMatchLabel} from '../src/features/stats';
import type {NativeEntry} from '../src/core/types';
export default function Submissions(){
 const {viewer,bundle,records,events,selectEvent,theme}=useApp(),router=useRouter();
 const params=useLocalSearchParams<{match?:string;team?:string;type?:string}>();
 const [type,setType]=useState(params.type??'match'),[scope,setScope]=useState<'all'|'mine'>('all'),[teamId,setTeamId]=useState<string|null>(params.team??null),[scoutId,setScoutId]=useState<string|null>(null),[matchId,setMatchId]=useState<string|null>(params.match??null),[busy,setBusy]=useState(false);
 useEffect(()=>{setTeamId(params.team??null);setMatchId(params.match??null);setType(params.type??'match')},[params.team,params.match,params.type]);
 if(!bundle||!viewer)return <Screen><Label theme={theme}>Download an event to review reports.</Label></Screen>;
 const authors=[...new Set(eventEntries(bundle,records,{includeWorking:true}).map(e=>e.scout_user_id))];
 const entries=eventEntries(bundle,records,{includeWorking:true}).filter(e=>e.entry_type===type&&(scope!=='mine'||e.scout_user_id===viewer.userId)&&(!teamId||e.team_id===teamId)&&(!scoutId||e.scout_user_id===scoutId)&&(!matchId||e.match_id===matchId)).sort((a,b)=>(b.submitted_at??(b as NativeEntry&{created_at?:string}).created_at??b.updated_at??'').localeCompare(a.submitted_at??(a as NativeEntry&{created_at?:string}).created_at??a.updated_at??''));
 const reportLabel=(entry:NativeEntry)=>entry.entry_type==='match'?(entry.payload.manual_match?manualMatchLabel(entry.payload.manual_match as Record<string,unknown>):bundle.matches.find(m=>m.id===entry.match_id)?matchLabel(bundle.matches.find(m=>m.id===entry.match_id)!):'Match report'):entry.entry_type==='pit'?'Pit report':'Pre-scout report';
 return <Screen><Text style={{color:theme.text,fontSize:26,fontWeight:'700'}}>Submissions</Text>
  <Section title="Event" theme={theme}><Label theme={theme}>{bundle.event.name}</Label>{events.filter(e=>e.id!==bundle.event.id).map(e=><Button key={e.id} title={e.name} secondary theme={theme} disabled={busy} onPress={()=>{setBusy(true);void selectEvent(e.id).then(()=>{setTeamId(null);setScoutId(null);setMatchId(null)}).catch(err=>Alert.alert('Event not opened',err.message)).finally(()=>setBusy(false))}}/>)}</Section>
  <View style={{flexDirection:'row',gap:8}}>{(['all','mine'] as const).map(v=><Choice key={v} label={v==='all'?'Everyone':'Just me'} selected={scope===v} theme={theme} onPress={()=>setScope(v)}/>)}</View>
  <View style={{flexDirection:'row',flexWrap:'wrap',gap:8}}>{[['match','Match scouting'],['pit','Pit scouting'],['pre_scout','Pre scouting']].map(([v,label])=><Choice key={v} label={label} selected={type===v} theme={theme} onPress={()=>{setType(v);if(v!=='match')setMatchId(null)}}/>)}</View>
  <TeamPicker label="Filter by team" theme={theme} teams={bundle.teams} value={teamId} onChange={setTeamId}/>
  {teamId&&<Button title="All teams" secondary theme={theme} onPress={()=>setTeamId(null)}/>}
  <Section title="Filter by scout" theme={theme}><View style={{flexDirection:'row',flexWrap:'wrap',gap:8}}><Choice label="All scouts" selected={!scoutId} theme={theme} onPress={()=>setScoutId(null)}/>{authors.map(id=><Choice key={id} label={bundle.profiles?.[id]??(id===viewer.userId?viewer.displayName:'Scout')} selected={scoutId===id} theme={theme} onPress={()=>setScoutId(id)}/>)}</View></Section>
  {matchId&&<Button title="Clear match filter" secondary theme={theme} onPress={()=>setMatchId(null)}/>}
  <Section title="Reports" theme={theme}>{!entries.length&&<Label theme={theme}>No reports match these filters.</Label>}{entries.map(entry=>{const local=records.find(r=>r.entry.id===entry.id),date=entry.submitted_at??(entry as NativeEntry&{created_at?:string}).created_at;return <Row key={entry.id} theme={theme} title={reportLabel(entry)+' · '+(bundle.teams.find(t=>t.id===entry.team_id)?.displayNumber??'Team')} subtitle={(bundle.profiles?.[entry.scout_user_id]??'Scout')+' · '+(date?new Date(date).toLocaleString():'Saved draft')+' · '+(local?.reviewRequired?'Unpublished working edits':entry.status)} onPress={()=>router.push({pathname:'/submission/[id]',params:{id:entry.id}})}/>})}</Section>
 </Screen>;
}
