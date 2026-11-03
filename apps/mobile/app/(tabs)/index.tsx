import {useLayout} from '../../src/components/layout';
import {friendlyError} from '../../src/core/friendly-error';
import React,{useMemo,useState} from 'react';
import { Alert, Pressable, ScrollView, View } from 'react-native';
import { Text } from '../../src/components/AppText';
import {useRouter} from 'expo-router';
import {useApp} from '../../src/core/context';
import {Screen} from '../../src/components/Screen';
import {ALLIANCE_FILL,Button,DISPLAY,DISPLAY_BOLD,GroupLabel,Label,List,ListRow,Status,TeamTag} from '../../src/components/ui';
import {eventEntries} from '../../src/core/report-overlay';
import {compareMatches,matchLabel} from '../../src/features/stats';
import {openAssignments} from '../../src/core/assignments';
import type {Match} from '../../src/core/types';

const short=(m:Match)=>`${m.match_type==='qualification'?'Q':m.match_type==='practice'?'P':'E'}${m.match_number}`;

export default function Home(){
 const {wide}=useLayout();
 const {bundle,records,theme,online,viewer,createDraft}=useApp();
 const router=useRouter();
 const [busy,setBusy]=useState(false);
 const data=useMemo(()=>{
  if(!bundle||!viewer)return null;
  const mine=records.filter(r=>r.entry.event_id===bundle.event.id&&r.origin==='own');
  const assignments=openAssignments(bundle,records);
  const all=eventEntries(bundle,records).filter(e=>e.status==='submitted');
  const covered=(type:string)=>new Set(all.filter(e=>e.entry_type===type).map(e=>e.team_id)).size;
  const matches=[...bundle.matches].sort(compareMatches);
  return {
   assignments,matches,
   onField:matches.find(m=>m.status!=='played'&&m.status!=='cancelled'),
   mineMatches:new Set(bundle.assignments.map(a=>a.match_id)),
   toSend:records.filter(r=>r.entry.event_id===bundle.event.id&&r.status!=='synced'&&r.entry.status==='submitted').length,
   drafts:mine.filter(r=>r.entry.status==='draft').length,
   submitted:mine.filter(r=>r.entry.status==='submitted'&&r.entry.entry_type==='match').length,
   pit:covered('pit'),pre:covered('pre_scout'),
   recent:[...mine].sort((a,b)=>b.changedAt.localeCompare(a.changedAt)).slice(0,3),
  };
 },[bundle,records,viewer]);
 if(!bundle||!data)return <Screen topInset><Label theme={theme}>Download an event to start.</Label><Button title="Choose event" theme={theme} onPress={()=>router.push('/settings')}/></Screen>;
 const team=(id?:string)=>bundle.teams.find(t=>t.id===id);
 const sideOf=(matchId:string|null|undefined,teamId:string|undefined)=>{const m=bundle.matches.find(x=>x.id===matchId);return m&&teamId?(m.red_teams.includes(teamId)?'red' as const:m.blue_teams.includes(teamId)?'blue' as const:null):null};
 const next=data.assignments[0],nextTeam=team(next?.team_id),nextMatch=bundle.matches.find(m=>m.id===next?.match_id);
 const side=sideOf(next?.match_id,nextTeam?.id);
 const start=async(a=next)=>{if(!a)return;setBusy(true);try{const draft=await createDraft('match',a.team_id,a.match_id,a.id);router.push({pathname:'/match/[id]',params:{id:draft.entry.id}})}catch(e){Alert.alert('Could not start',friendlyError(e))}finally{setBusy(false)}};
 const statusLabel=data.toSend?`${data.toSend} to send`:online?'Online':'Offline';
 const fill=side?ALLIANCE_FILL[side]:theme.graphite;
 const total=data.submitted+data.assignments.length;
 const progress=(title:string,done:number,of:number,onPress:()=>void)=><Pressable key={title} accessibilityRole="button" accessibilityLabel={`${title}, ${done} of ${of}`} onPress={onPress} style={({pressed})=>({paddingHorizontal:16,paddingVertical:12,gap:8,backgroundColor:pressed?theme.panel:'transparent'})}>
  <View style={{flexDirection:'row',justifyContent:'space-between',alignItems:'baseline'}}>
   <Text style={{color:theme.text,fontSize:16,fontWeight:'600'}}>{title}</Text>
   <Text style={{color:theme.text,fontSize:20,fontFamily:DISPLAY_BOLD}}>{done}<Text style={{color:theme.muted}}> / {of}</Text></Text>
  </View>
  <View style={{height:6,borderRadius:3,backgroundColor:theme.panel,overflow:'hidden'}}><View style={{height:6,width:`${of?Math.min(100,Math.round(done/of*100)):0}%`,backgroundColor:theme.text,borderRadius:3}}/></View>
 </Pressable>;
 return <Screen topInset>
  <View style={{flexDirection:'row',alignItems:'center',justifyContent:'space-between',gap:10,paddingTop:4}}>
   <Text accessibilityRole="header" style={{color:theme.text,fontSize:34,lineHeight:36,fontFamily:DISPLAY,flexShrink:1}} maxFontSizeMultiplier={1.3} numberOfLines={2}>{bundle.event.name}</Text>
   <Pressable accessibilityRole="button" accessibilityLabel={`${statusLabel}. Open outbox`} onPress={()=>router.push('/outbox')} style={{backgroundColor:theme.surface,borderRadius:20,paddingHorizontal:12,minHeight:44,justifyContent:'center'}}>
    <Status label={statusLabel} tone={data.toSend?'warn':online?'ok':'warn'} theme={theme}/>
   </Pressable>
  </View>

  {data.matches.length?<ScrollView horizontal showsHorizontalScrollIndicator={false} style={{flexGrow:0,marginHorizontal:-4}} contentContainerStyle={{gap:6,paddingHorizontal:4}} contentOffset={{x:Math.max(0,data.matches.indexOf(data.onField!)-1)*62,y:0}}>
   {data.matches.map(m=>{const now=m===data.onField,played=m.status==='played',mine=data.mineMatches.has(m.id);return <Pressable key={m.id} accessibilityRole="button" accessibilityLabel={`${matchLabel(m)}${now?', next on the field':''}${mine?', you scout this match':''}`} onPress={()=>router.push({pathname:'/(tabs)/schedule',params:{match:m.id}})} style={{width:56,height:56,borderRadius:14,alignItems:'center',justifyContent:'center',backgroundColor:now?theme.text:theme.surface,opacity:played?.45:1}}>
    <Text style={{color:now?theme.bg:theme.text,fontSize:22,fontFamily:DISPLAY_BOLD}}>{short(m)}</Text>
    {mine?<View style={{position:'absolute',bottom:7,width:16,height:3,borderRadius:2,backgroundColor:now?theme.bg:theme.text}}/>:null}
   </Pressable>})}
  </ScrollView>:null}

  <View style={{flexDirection:wide?'row':'column',gap:wide?20:12,alignItems:'flex-start'}}>
   <View style={{flex:wide?1.25:undefined,width:wide?undefined:'100%',gap:12}}>
    {next&&nextTeam&&nextMatch?<View style={{backgroundColor:fill,borderRadius:22,padding:18,gap:14,borderTopWidth:2,borderBottomWidth:6,borderTopColor:'rgba(255,255,255,.25)',borderBottomColor:'rgba(0,0,0,.25)'}}>
     <View style={{flexDirection:'row',justifyContent:'space-between',alignItems:'baseline',gap:8}}>
      <Text style={{color:'#fff',fontSize:26,fontFamily:DISPLAY_BOLD,flexShrink:1}} numberOfLines={1}>{matchLabel(nextMatch)}</Text>
      {side?<Text style={{color:'rgba(255,255,255,.85)',fontSize:15,fontWeight:'700'}}>{side==='red'?'Red alliance':'Blue alliance'}</Text>:null}
     </View>
     <View accessible accessibilityLabel={`Team ${nextTeam.displayNumber}, ${nextTeam.name}`}>
      <Text maxFontSizeMultiplier={1.1} adjustsFontSizeToFit numberOfLines={1} style={{color:'#fff',fontSize:112,lineHeight:112,fontFamily:DISPLAY,includeFontPadding:false}}>{nextTeam.displayNumber}</Text>
      <Text numberOfLines={1} style={{color:'rgba(255,255,255,.85)',fontSize:17}}>{nextTeam.name}</Text>
     </View>
     <Pressable accessibilityRole="button" accessibilityLabel="Start scouting" disabled={busy} onPress={()=>void start()} style={({pressed})=>({minHeight:56,borderRadius:14,backgroundColor:'#fff',alignItems:'center',justifyContent:'center',opacity:busy?.6:pressed?.85:1})}>
      <Text style={{color:'#14171c',fontSize:17,fontWeight:'800'}}>{busy?'Opening…':'Start scouting'}</Text>
     </Pressable>
    </View>:<View style={{backgroundColor:theme.surface,borderRadius:22,padding:18,gap:12}}>
     <Text style={{color:theme.text,fontSize:30,fontFamily:DISPLAY}}>All caught up</Text>
     <Button title="Pick a match" theme={theme} onPress={()=>router.push('/(tabs)/schedule')}/>
    </View>}

    <List theme={theme}>
     {progress('Your matches',data.submitted,total,()=>router.push('/(tabs)/schedule'))}
     {progress('Pit scouting',data.pit,bundle.teams.length,()=>router.push('/pit'))}
     {progress('Pre-scouting',data.pre,bundle.teams.length,()=>router.push('/pre-scout'))}
    </List>
    {data.drafts?<ListRow theme={theme} title={`${data.drafts} unfinished draft${data.drafts===1?'':'s'}`} onPress={()=>router.push('/outbox')}/>:null}
   </View>

   <View style={{flex:wide?1:undefined,width:wide?undefined:'100%',gap:8}}>
    {data.assignments.length>1?<>
     <GroupLabel theme={theme}>Coming up</GroupLabel>
     <List theme={theme}>{data.assignments.slice(1,6).map(a=>{const t=team(a.team_id),m=bundle.matches.find(x=>x.id===a.match_id);return <ListRow key={a.id} theme={theme} title={m?matchLabel(m):'Match'} accessibilityLabel={`Scout ${t?.displayNumber} in ${m?matchLabel(m):'match'}`} lead={<TeamTag label={t?.displayNumber??'?'} alliance={sideOf(a.match_id,a.team_id)} size="md" theme={theme}/>} onPress={()=>void start(a)}/>})}</List>
    </>:null}
    {data.recent.length?<>
     <GroupLabel theme={theme}>Recent</GroupLabel>
     <List theme={theme}>{data.recent.map(r=>{const draft=r.entry.status==='draft';return <ListRow key={r.entry.id} theme={theme} title={r.entry.entry_type==='pre_scout'?'Pre-scout':r.entry.entry_type==='pit'?'Pit':'Match'} lead={<TeamTag label={team(r.entry.team_id)?.displayNumber??'?'} size="md" theme={theme}/>} tail={<Status label={draft?'Draft':r.status==='synced'?'Sent':'Saved'} tone={draft?'warn':r.status==='synced'?'ok':'quiet'} theme={theme}/>} onPress={()=>router.push({pathname:'/submission/[id]',params:{id:r.entry.id}})}/>})}</List>
    </>:null}
   </View>
  </View>
 </Screen>;
}
