import React,{useEffect,useState} from 'react';
import {Alert,Pressable,Text,View} from 'react-native';
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
 const [type,setType]=useState(params.type??'match'),[scope,setScope]=useState<'all'|'mine'>('all'),[teamId,setTeamId]=useState<string|null>(params.team??null),[scoutId,setScoutId]=useState<string|null>(null),[matchId,setMatchId]=useState<string|null>(params.match??null),[busy,setBusy]=useState(false),[open,setOpen]=useState<'event'|'team'|'scout'|null>(null);
 useEffect(()=>{setTeamId(params.team??null);setMatchId(params.match??null);setType(params.type??'match')},[params.team,params.match,params.type]);
 if(!bundle||!viewer)return <Screen><Label theme={theme}>Download an event to review reports.</Label></Screen>;
 const authors=[...new Set(eventEntries(bundle,records,{includeWorking:true}).map(e=>e.scout_user_id))];
 const entries=eventEntries(bundle,records,{includeWorking:true}).filter(e=>e.entry_type===type&&(scope!=='mine'||e.scout_user_id===viewer.userId)&&(!teamId||e.team_id===teamId)&&(!scoutId||e.scout_user_id===scoutId)&&(!matchId||e.match_id===matchId)).sort((a,b)=>(b.submitted_at??(b as NativeEntry&{created_at?:string}).created_at??b.updated_at??'').localeCompare(a.submitted_at??(a as NativeEntry&{created_at?:string}).created_at??a.updated_at??''));
 const reportLabel=(entry:NativeEntry)=>entry.entry_type==='match'?(entry.payload.manual_match?manualMatchLabel(entry.payload.manual_match as Record<string,unknown>):bundle.matches.find(m=>m.id===entry.match_id)?matchLabel(bundle.matches.find(m=>m.id===entry.match_id)!):'Match report'):entry.entry_type==='pit'?'Pit report':'Pre-scout report';
 const scoutName=(id:string)=>bundle.profiles?.[id]??(id===viewer.userId?viewer.displayName:'Scout');
 const teamNumber=(id:string)=>bundle.teams.find(t=>t.id===id)?.displayNumber??'Team';
 const matchName=matchId?(()=>{const m=bundle.matches.find(x=>x.id===matchId);return m?matchLabel(m):'Match'})():null;
 const filterChip=(key:'event'|'team'|'scout',label:string,active:boolean)=><Pressable key={key} accessibilityRole="button" accessibilityState={{expanded:open===key}} accessibilityLabel={label} onPress={()=>setOpen(open===key?null:key)} style={{minHeight:44,paddingHorizontal:14,borderRadius:22,borderWidth:1,borderColor:active?theme.tint:theme.line,backgroundColor:active?theme.selection:theme.surface,justifyContent:'center'}}><Text style={{color:active?theme.tint:theme.text,fontSize:14,fontWeight:'600'}}>{label} ▾</Text></Pressable>;
 const options=(items:{id:string|null;label:string;selected:boolean;onPress:()=>void}[])=><View style={{flexDirection:'row',flexWrap:'wrap',gap:8}}>{items.map(item=><Choice key={String(item.id)} label={item.label} selected={item.selected} theme={theme} onPress={()=>{item.onPress();setOpen(null)}}/>)}</View>;
 return <Screen>
  <View style={{flexDirection:'row',gap:8}}>{(['all','mine'] as const).map(v=><View key={v} style={{flex:1}}><Choice label={v==='all'?'Everyone':'Just me'} selected={scope===v} theme={theme} onPress={()=>setScope(v)}/></View>)}</View>
  <View style={{flexDirection:'row',gap:8}}>{[['match','Match'],['pit','Pit'],['pre_scout','Pre-scout']].map(([v,label])=><View key={v} style={{flex:1}}><Choice label={label} selected={type===v} theme={theme} onPress={()=>{setType(v);if(v!=='match')setMatchId(null)}}/></View>)}</View>
  <View style={{flexDirection:'row',flexWrap:'wrap',gap:8}}>
   {events.length>1?filterChip('event',bundle.event.name,false):null}
   {filterChip('team',teamId?teamNumber(teamId):'All teams',Boolean(teamId))}
   {filterChip('scout',scoutId?scoutName(scoutId):'All scouts',Boolean(scoutId))}
   {matchId?<Pressable accessibilityRole="button" accessibilityLabel="Clear match filter" onPress={()=>setMatchId(null)} style={{minHeight:44,paddingHorizontal:14,borderRadius:22,borderWidth:1,borderColor:theme.tint,backgroundColor:theme.selection,justifyContent:'center'}}><Text style={{color:theme.tint,fontSize:14,fontWeight:'600'}}>{matchName} ✕</Text></Pressable>:null}
  </View>
  {open==='event'?options(events.map(e=>({id:e.id,label:e.name,selected:e.id===bundle.event.id,onPress:()=>{if(busy||e.id===bundle.event.id)return;setBusy(true);void selectEvent(e.id).then(()=>{setTeamId(null);setScoutId(null);setMatchId(null)}).catch(err=>Alert.alert('Event not opened',err.message)).finally(()=>setBusy(false))}}))):null}
  {open==='team'?options([{id:null,label:'All teams',selected:!teamId,onPress:()=>setTeamId(null)},...bundle.teams.slice().sort((x,y)=>x.number-y.number).map(t=>({id:t.id,label:t.displayNumber,selected:teamId===t.id,onPress:()=>setTeamId(t.id)}))]):null}
  {open==='scout'?options([{id:null,label:'All scouts',selected:!scoutId,onPress:()=>setScoutId(null)},...authors.map(id=>({id,label:scoutName(id),selected:scoutId===id,onPress:()=>setScoutId(id)}))]):null}
  {entries.length===0?<Label theme={theme} muted>No reports match.</Label>:<View style={{backgroundColor:theme.surface,borderRadius:14,overflow:'hidden'}}>{entries.map((entry,index)=>{const local=records.find(r=>r.entry.id===entry.id),date=entry.submitted_at??(entry as NativeEntry&{created_at?:string}).created_at,state=local?.reviewRequired?'Unpublished edits':entry.status;return <Pressable key={entry.id} accessibilityRole="button" accessibilityLabel={reportLabel(entry)+' '+teamNumber(entry.team_id)} onPress={()=>router.push({pathname:'/submission/[id]',params:{id:entry.id}})} style={{minHeight:64,paddingHorizontal:16,paddingVertical:10,justifyContent:'center',gap:2,borderTopWidth:index?1:0,borderTopColor:theme.line}}>
   <Text style={{color:theme.text,fontSize:17,fontWeight:'700'}}>{teamNumber(entry.team_id)} · {reportLabel(entry)}</Text>
   <Text style={{color:theme.muted,fontSize:14}}>{scoutName(entry.scout_user_id)} · {date?new Date(date).toLocaleString([],{month:'short',day:'numeric',hour:'numeric',minute:'2-digit'}):'Draft'}{state==='submitted'||(state==='draft'&&!date)?'':' · '+state}</Text>
  </Pressable>})}</View>}
 </Screen>;
}
