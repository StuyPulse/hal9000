import {useLayout} from '../../src/components/layout';
import {friendlyError} from '../../src/core/friendly-error';
import React,{useMemo,useState} from 'react';
import { Alert, Pressable, View } from 'react-native';
import { Text } from '../../src/components/AppText';
import {useRouter} from 'expo-router';
import {useApp} from '../../src/core/context';
import {Screen} from '../../src/components/Screen';
import {AppIcon,Button,Label} from '../../src/components/ui';
import {eventEntries} from '../../src/core/report-overlay';
import {compareMatches,matchLabel} from '../../src/features/stats';

export default function Home(){
 const {wide}=useLayout();
 const {bundle,records,theme,online,viewer,createDraft}=useApp();
 const router=useRouter();
 const [busy,setBusy]=useState(false);
 const data=useMemo(()=>{
  if(!bundle||!viewer)return null;
  const mine=records.filter(r=>r.entry.event_id===bundle.event.id&&r.origin==='own');
  const submittedIds=new Set(mine.filter(r=>r.entry.status==='submitted').map(r=>r.entry.assignment_id));
  const assignments=bundle.assignments.filter(a=>a.status!=='complete'&&!submittedIds.has(a.id)).sort((a,b)=>{const ma=bundle.matches.find(m=>m.id===a.match_id),mb=bundle.matches.find(m=>m.id===b.match_id);return ma&&mb?compareMatches(ma,mb):0});
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
 if(!bundle||!data)return <Screen><Label theme={theme}>Choose and download an event to start.</Label><Button title="Event setup" theme={theme} onPress={()=>router.push('/settings')}/></Screen>;
 const team=(id?:string)=>bundle.teams.find(t=>t.id===id);
 const next=data.assignments[0],nextTeam=team(next?.team_id),nextMatch=bundle.matches.find(m=>m.id===next?.match_id);
 const side=nextMatch&&nextTeam?(nextMatch.red_teams.includes(nextTeam.id)?'red':'blue'):null;
 const start=async(a=next)=>{if(!a)return;setBusy(true);try{const draft=await createDraft('match',a.team_id,a.match_id,a.id);router.push({pathname:'/match/[id]',params:{id:draft.entry.id}})}catch(e){Alert.alert('Cannot start',friendlyError(e))}finally{setBusy(false)}};
 const stat=(value:string,label:string,onPress?:()=>void)=><Pressable key={label} disabled={!onPress} onPress={onPress} accessibilityRole={onPress?'button':undefined} accessibilityLabel={`${label} ${value}`} style={{width:'48%',backgroundColor:theme.surface,borderRadius:18,padding:14,gap:2,borderWidth:1,borderColor:theme.line}}>
  <Text style={{color:theme.text,fontSize:26,fontWeight:'800',letterSpacing:-.5}}>{value}</Text>
  <Text style={{color:theme.muted,fontSize:13,fontWeight:'600'}}>{label}</Text>
 </Pressable>;
 const tile=(icon:string,title:string,sub:string,onPress:()=>void)=><Pressable key={title} accessibilityRole="button" accessibilityLabel={`${title} scouting`} onPress={onPress} style={({pressed})=>({flex:1,backgroundColor:theme.surface,borderRadius:18,padding:14,gap:10,borderWidth:1,borderColor:theme.line,opacity:pressed?.85:1})}>
  <View style={{width:40,height:40,borderRadius:12,backgroundColor:theme.selection,alignItems:'center',justifyContent:'center'}}><AppIcon name={icon} color={theme.tint}/></View>
  <View style={{gap:1}}><Text style={{color:theme.text,fontSize:16,fontWeight:'800'}}>{title}</Text><Text style={{color:theme.muted,fontSize:12}}>{sub}</Text></View>
 </Pressable>;
 const accent=side==='red'?theme.red:side==='blue'?theme.blue:theme.tint;
 return <Screen topInset>
  <View style={{flexDirection:'row',alignItems:'center',justifyContent:'space-between',gap:10}}>
   <Text style={{color:theme.text,fontSize:22,fontWeight:'800',letterSpacing:-.4,flexShrink:1}} maxFontSizeMultiplier={1.3} numberOfLines={2}>{bundle.event.name}</Text>
   <Pressable accessibilityRole="button" accessibilityLabel="Open outbox" onPress={()=>router.push('/outbox')} style={{flexDirection:'row',alignItems:'center',gap:6,backgroundColor:theme.surface,borderWidth:1,borderColor:theme.line,borderRadius:20,paddingHorizontal:12,minHeight:36}}>
    <View style={{width:8,height:8,borderRadius:4,backgroundColor:online?theme.success:theme.warning}}/>
    <Text style={{color:theme.text,fontSize:13,fontWeight:'700'}}>{data.toSend?`${data.toSend} to send`:online?'Online':'Offline'}</Text>
   </Pressable>
  </View>

  <View style={{flexDirection:wide?'row':'column',gap:wide?20:12,alignItems:'flex-start'}}>
   <View style={{flex:wide?1.25:undefined,width:wide?undefined:'100%',gap:12}}>
  {next&&nextTeam&&nextMatch?<View style={{backgroundColor:theme.surface,borderRadius:22,borderWidth:1,borderColor:theme.line,overflow:'hidden'}}>
   <View style={{height:6,backgroundColor:accent}}/>
   <View style={{padding:18,gap:14}}>
    <View style={{flexDirection:'row',flexWrap:'wrap',justifyContent:'space-between',alignItems:'center',gap:6}}>
     <Text style={{color:theme.muted,fontSize:13,fontWeight:'700',letterSpacing:.6,textTransform:'uppercase'}}>Up next</Text>
     <Text style={{color:accent,fontSize:13,fontWeight:'800'}}>{matchLabel(nextMatch)} · {String(side).toUpperCase()}</Text>
    </View>
    <View style={{flexDirection:'row',flexWrap:'wrap',alignItems:'baseline',columnGap:12}}>
     <Text style={{color:theme.text,fontSize:56,fontWeight:'900',letterSpacing:-1.5}} maxFontSizeMultiplier={1.1} adjustsFontSizeToFit numberOfLines={1}>{nextTeam.displayNumber}</Text>
     <Text style={{color:theme.muted,fontSize:17,flexShrink:1}} numberOfLines={1}>{nextTeam.name}</Text>
    </View>
    <Button title={busy?'Opening…':'Start scouting'} theme={theme} disabled={busy} onPress={()=>void start()}/>
   </View>
  </View>:<View style={{backgroundColor:theme.surface,borderRadius:22,borderWidth:1,borderColor:theme.line,padding:18,gap:12}}>
   <Text style={{color:theme.text,fontSize:18,fontWeight:'800'}}>No assignments waiting</Text>
   <Button title="Choose a match" theme={theme} onPress={()=>router.push('/(tabs)/schedule')}/>
  </View>}

  <View style={{gap:10}}>
   <Text style={{color:theme.muted,fontSize:13,fontWeight:'700',letterSpacing:.6,textTransform:'uppercase'}}>Scout</Text>
   <View style={{flexDirection:'row',gap:10}}>
    {tile('schedule','Match',`${data.played}/${bundle.matches.length} played`,()=>router.push('/(tabs)/schedule'))}
    {tile('team','Pit',`${data.pit}/${bundle.teams.length} teams`,()=>router.push('/pit'))}
    {tile('camera','Pre-scout',`${data.pre}/${bundle.teams.length} teams`,()=>router.push('/pre-scout'))}
   </View>
  </View>

  <View style={{gap:10}}>
   <Text style={{color:theme.muted,fontSize:13,fontWeight:'700',letterSpacing:.6,textTransform:'uppercase'}}>Your session</Text>
   <View style={{flexDirection:'row',flexWrap:'wrap',gap:10,justifyContent:'space-between'}}>
    {stat(String(data.submitted),'Reports submitted',()=>router.push({pathname:'/submissions',params:{}}))}
    {stat(String(data.drafts),'Drafts in progress',()=>router.push('/outbox'))}
    {stat(String(data.assignments.length),'Assignments left',()=>router.push('/(tabs)/schedule'))}
    {stat(String(data.toSend),'Waiting to send',()=>router.push('/outbox'))}
   </View>
  </View>

   </View>
   <View style={{flex:wide?1:undefined,width:wide?undefined:'100%',gap:12}}>
  {data.assignments.length>1?<View style={{gap:10}}>
   <Text style={{color:theme.muted,fontSize:13,fontWeight:'700',letterSpacing:.6,textTransform:'uppercase'}}>Coming up</Text>
   <View style={{backgroundColor:theme.surface,borderRadius:18,borderWidth:1,borderColor:theme.line,overflow:'hidden'}}>
    {data.assignments.slice(1,6).map((a,index)=>{const t=team(a.team_id),m=bundle.matches.find(x=>x.id===a.match_id),red=m&&t?m.red_teams.includes(t.id):false;return <Pressable key={a.id} accessibilityRole="button" accessibilityLabel={`${m?matchLabel(m):'Match'} ${t?.displayNumber}`} onPress={()=>void start(a)} style={{minHeight:58,paddingHorizontal:16,flexDirection:'row',alignItems:'center',gap:12,borderTopWidth:index?1:0,borderTopColor:theme.line}}>
     <View style={{width:6,height:30,borderRadius:3,backgroundColor:red?theme.red:theme.blue}}/>
     <Text style={{color:theme.text,fontSize:18,fontWeight:'800',width:64}}>{t?.displayNumber}</Text>
     <Text style={{color:theme.muted,fontSize:15,flex:1}} numberOfLines={1}>{m?matchLabel(m):'Match'}</Text>
     <Text style={{color:theme.muted,fontSize:20}}>›</Text>
    </Pressable>})}
   </View>
  </View>:null}

  {data.recent.length?<View style={{gap:10}}>
   <Text style={{color:theme.muted,fontSize:13,fontWeight:'700',letterSpacing:.6,textTransform:'uppercase'}}>Recent</Text>
   <View style={{backgroundColor:theme.surface,borderRadius:18,borderWidth:1,borderColor:theme.line,overflow:'hidden'}}>
    {data.recent.map((r,index)=><Pressable key={r.entry.id} accessibilityRole="button" onPress={()=>router.push({pathname:'/submission/[id]',params:{id:r.entry.id}})} style={{minHeight:56,paddingHorizontal:16,flexDirection:'row',alignItems:'center',justifyContent:'space-between',borderTopWidth:index?1:0,borderTopColor:theme.line}}>
     <Text style={{color:theme.text,fontSize:16,fontWeight:'700'}}>{team(r.entry.team_id)?.displayNumber} · {r.entry.entry_type==='pre_scout'?'pre-scout':r.entry.entry_type}</Text>
     <Text style={{color:r.entry.status==='draft'?theme.warning:theme.muted,fontSize:13,fontWeight:'600'}}>{r.entry.status==='draft'?'Draft':r.status==='synced'?'Sent':'Saved'}</Text>
    </Pressable>)}
   </View>
  </View>:null}
   </View>
  </View>
 </Screen>;
}
