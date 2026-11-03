import {useLayout} from '../../src/components/layout';
import {friendlyError} from '../../src/core/friendly-error';
import React,{useMemo,useState} from 'react';
import { Alert, Pressable, View } from 'react-native';
import { Text } from '../../src/components/AppText';
import {useRouter} from 'expo-router';
import {useApp} from '../../src/core/context';
import {Screen} from '../../src/components/Screen';
import {AppIcon,Button,GroupLabel,Label,List,ListRow,Status,TeamTag} from '../../src/components/ui';
import {eventEntries} from '../../src/core/report-overlay';
import {matchLabel} from '../../src/features/stats';
import {openAssignments} from '../../src/core/assignments';

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
  return {
   assignments,
   toSend:records.filter(r=>r.entry.event_id===bundle.event.id&&r.status!=='synced'&&r.entry.status==='submitted').length,
   drafts:mine.filter(r=>r.entry.status==='draft').length,
   submitted:mine.filter(r=>r.entry.status==='submitted').length,
   played:bundle.matches.filter(m=>m.status==='played').length,
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
 const tile=(icon:string,title:string,count:string,onPress:()=>void)=><Pressable key={title} accessibilityRole="button" accessibilityLabel={`${title}, ${count}`} onPress={onPress} style={({pressed})=>({flex:1,backgroundColor:pressed?theme.panel:theme.surface,borderRadius:16,padding:14,gap:12})}>
  <AppIcon name={icon} color={theme.text}/>
  <View><Text style={{color:theme.text,fontSize:16,fontWeight:'700'}}>{title}</Text><Text style={{color:theme.muted,fontSize:13,fontVariant:['tabular-nums']}}>{count}</Text></View>
 </Pressable>;
 const stat=(value:number,label:string,onPress:()=>void)=><Pressable key={label} accessibilityRole="button" accessibilityLabel={`${value} ${label}`} onPress={onPress} style={{flex:1,alignItems:'center',paddingVertical:12}}>
  <Text style={{color:theme.text,fontSize:24,fontWeight:'800',fontVariant:['tabular-nums']}}>{value}</Text>
  <Text style={{color:theme.muted,fontSize:13}}>{label}</Text>
 </Pressable>;
 const statusLabel=data.toSend?`${data.toSend} to send`:online?'Online':'Offline';
 return <Screen topInset>
  <View style={{flexDirection:'row',alignItems:'center',justifyContent:'space-between',gap:10,paddingTop:4}}>
   <Text accessibilityRole="header" style={{color:theme.text,fontSize:24,fontWeight:'800',letterSpacing:-.5,flexShrink:1}} maxFontSizeMultiplier={1.3} numberOfLines={2}>{bundle.event.name}</Text>
   <Pressable accessibilityRole="button" accessibilityLabel={`${statusLabel}. Open outbox`} onPress={()=>router.push('/outbox')} style={{backgroundColor:theme.surface,borderRadius:20,paddingHorizontal:12,minHeight:44,justifyContent:'center'}}>
    <Status label={statusLabel} tone={data.toSend?'warn':online?'ok':'warn'} theme={theme}/>
   </Pressable>
  </View>

  <View style={{flexDirection:wide?'row':'column',gap:wide?20:12,alignItems:'flex-start'}}>
   <View style={{flex:wide?1.25:undefined,width:wide?undefined:'100%',gap:12}}>
    {next&&nextTeam&&nextMatch?<View style={{backgroundColor:theme.surface,borderRadius:20,padding:16,gap:16}}>
     <View style={{flexDirection:'row',alignItems:'center',gap:16}}>
      <TeamTag label={nextTeam.displayNumber} alliance={side} size="xl" theme={theme}/>
      <View style={{flex:1,gap:2,minWidth:0}}>
       <Text style={{color:theme.text,fontSize:18,fontWeight:'800'}}>{matchLabel(nextMatch)}</Text>
       {side?<Text style={{color:side==='red'?theme.red:theme.blue,fontSize:15,fontWeight:'700'}}>{side==='red'?'Red alliance':'Blue alliance'}</Text>:null}
       <Text style={{color:theme.muted,fontSize:15}} numberOfLines={1}>{nextTeam.name}</Text>
      </View>
     </View>
     <Button title={busy?'Opening…':'Start scouting'} theme={theme} disabled={busy} onPress={()=>void start()}/>
    </View>:<View style={{backgroundColor:theme.surface,borderRadius:20,padding:16,gap:12}}>
     <Text style={{color:theme.text,fontSize:18,fontWeight:'800'}}>All caught up</Text>
     <Button title="Pick a match" theme={theme} onPress={()=>router.push('/(tabs)/schedule')}/>
    </View>}

    <View style={{flexDirection:'row',gap:10}}>
     {tile('schedule','Match',`${data.played}/${bundle.matches.length} played`,()=>router.push('/(tabs)/schedule'))}
     {tile('team','Pit',`${data.pit}/${bundle.teams.length}`,()=>router.push('/pit'))}
     {tile('camera','Pre-scout',`${data.pre}/${bundle.teams.length}`,()=>router.push('/pre-scout'))}
    </View>

    <View style={{flexDirection:'row',backgroundColor:theme.surface,borderRadius:16}}>
     {stat(data.submitted,'Submitted',()=>router.push({pathname:'/submissions',params:{}}))}
     {stat(data.drafts,'Drafts',()=>router.push('/outbox'))}
     {stat(data.assignments.length,'Left',()=>router.push('/(tabs)/schedule'))}
     {stat(data.toSend,'To send',()=>router.push('/outbox'))}
    </View>
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
