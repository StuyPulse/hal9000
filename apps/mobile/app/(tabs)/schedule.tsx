import {friendlyError} from '../../src/core/friendly-error';
import React,{useEffect,useRef,useState} from 'react';
import { Alert, Pressable, ScrollView, View } from 'react-native';
import { Text } from '../../src/components/AppText';
import {useLayout} from '../../src/components/layout';
import {useLocalSearchParams,useRouter} from 'expo-router';
import {useApp} from '../../src/core/context';
import {emptyRebuilt} from '../../src/core/data';
import {Screen} from '../../src/components/Screen';
import {Button,Choice,Input,Label,Section} from '../../src/components/ui';
import {TeamPicker} from '../../src/features/common';
import {compareMatches,matchLabel} from '../../src/features/stats';

export default function Schedule(){
 const {wide,large}=useLayout();
 const {bundle,theme,createDraft}=useApp(),router=useRouter(),params=useLocalSearchParams<{match?:string}>();
 const [matchId,setMatchId]=useState(''),[teamId,setTeamId]=useState(''),[search,setSearch]=useState(''),[manual,setManual]=useState(false),[stage,setStage]=useState('Qualification'),[label,setLabel]=useState(''),[alliance,setAlliance]=useState<'red'|'blue'|null>(null),[busy,setBusy]=useState(false),[round,setRound]=useState('all'),[state,setState]=useState('all');
 const previous=useRef(new Map<string,string>()),observed=useRef(new Map<string,number>()),[now,setNow]=useState(Date.now());
 useEffect(()=>{const timer=setInterval(()=>setNow(Date.now()),30000);return()=>clearInterval(timer)},[]);
 useEffect(()=>{for(const m of bundle?.matches??[]){if(m.status==='played'&&previous.current.has(m.id)&&previous.current.get(m.id)!=='played')observed.current.set(m.id,Date.now());previous.current.set(m.id,m.status)}},[bundle?.matches]);
 useEffect(()=>{if(params.match&&bundle?.matches.some(m=>m.id===params.match)){setMatchId(params.match);setTeamId('');setManual(false);setSearch('')}},[params.match,bundle?.event.id]);
 if(!bundle)return <Screen><Label theme={theme}>Download an event first.</Label></Screen>;
 const match=bundle.matches.find(m=>m.id===matchId);
 const q=search.trim().toLowerCase();
 const matches=bundle.matches.filter(m=>(round==='all'||m.match_type===round)&&(state==='all'||(state==='finished'?m.status==='played':m.status!=='played'&&m.status!=='cancelled'))).filter(m=>!q||[matchLabel(m),...bundle.teams.filter(t=>[...m.red_teams,...m.blue_teams].includes(t.id)).flatMap(t=>[t.displayNumber,t.name])].join(' ').toLowerCase().includes(q)).sort((a,b)=>{const played=(m:typeof a)=>m.status==='played'&&(!observed.current.has(m.id)||now-observed.current.get(m.id)!>=5*60*1000);return Number(played(a))-Number(played(b))||compareMatches(a,b)});
 const open=async()=>{
  if(!teamId||(!manual&&!match))return;
  if(manual&&(!alliance||(stage!=='Other / exception'&&!label.trim())))return;
  setBusy(true);try{const payload=manual?{...emptyRebuilt(),report_source:'manual',manual_match:{stage,label:label.trim()||null,alliance}}:undefined;const local=await createDraft('match',teamId,manual?null:matchId,null,payload);router.push({pathname:'/match/[id]',params:{id:local.entry.id}})}catch(e){Alert.alert('Cannot start',friendlyError(e))}finally{setBusy(false)}
 };
 const numbers=(ids:string[])=>bundle.teams.filter(t=>ids.includes(t.id)).sort((a,b)=>a.number-b.number);
 const chosen=bundle.teams.find(t=>t.id===teamId);
 const manualReady=Boolean(alliance&&(stage==='Other / exception'||label.trim()));
 const ready=Boolean(teamId&&(manual?manualReady:match));
 const footer=<Button title={busy?'Opening…':ready?(manual?`Scout ${chosen?.displayNumber} · manual report`:`Scout ${chosen?.displayNumber} · ${matchLabel(match!)}`):manual?(teamId?'Choose alliance and match number':'Choose a robot'):match?'Choose a robot':'Choose a match'} disabled={busy||!ready} theme={theme} onPress={()=>void open()}/>;
 return <Screen footer={!manual&&!match?undefined:footer} footerInset={false}>
  <View style={{flexDirection:'row',gap:8}}><Choice label="Scheduled" theme={theme} selected={!manual} onPress={()=>{setManual(false);setTeamId('')}}/><Choice label="Manual report" theme={theme} selected={manual} onPress={()=>{setManual(true);setTeamId('')}}/></View>
  {manual?<>
   <View style={{flexDirection:'row',flexWrap:'wrap',gap:8}}>{['Qualification','Practice','Quarterfinal','Semifinal','Final','Other / exception'].map(v=><Choice key={v} label={v} theme={theme} selected={stage===v} onPress={()=>setStage(v)}/>)}</View>
   <Input label={stage==='Other / exception'?'Match label (optional)':'Match number'} theme={theme} value={label} onChangeText={setLabel} placeholder="e.g. 3 or 2–1"/>
   <View style={{flexDirection:'row',gap:8}}>{(['red','blue'] as const).map(a=><Choice key={a} label={a==='red'?'Red alliance':'Blue alliance'} theme={theme} selected={alliance===a} onPress={()=>setAlliance(a)}/>)}</View>
   <TeamPicker teams={bundle.teams} theme={theme} value={teamId||null} onChange={setTeamId} label="Robot"/>
  </>:match?<>
   <View style={{backgroundColor:theme.surface,borderRadius:14,padding:14,flexDirection:'row',alignItems:'center',justifyContent:'space-between'}}>
    <Text style={{color:theme.text,fontSize:20,fontWeight:'800'}}>{matchLabel(match)}</Text>
    <Button title="Change" secondary theme={theme} onPress={()=>{setMatchId('');setTeamId('')}} style={{minHeight:44,paddingVertical:8}}/>
   </View>
   <View style={{flexDirection:'row',gap:10}}>{(['red','blue'] as const).map(a=><View key={a} style={{flex:1,gap:8}}>
    <Text style={{color:a==='red'?theme.red:theme.blue,fontWeight:'800',fontSize:14}}>{a==='red'?'RED':'BLUE'}</Text>
    {numbers(a==='red'?match.red_teams:match.blue_teams).map(t=><Choice key={t.id} label={t.displayNumber} selected={teamId===t.id} onPress={()=>setTeamId(t.id)} theme={theme}/>)}
   </View>)}</View>
  </>:<>
   <Input label="Find a match or team" theme={theme} value={search} onChangeText={setSearch}/>
   <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{flexGrow:0}} contentContainerStyle={{gap:8}}>
    {[['all','All rounds'],['qualification','Quals'],['playoff','Playoffs'],['practice','Practice']].map(([id,l])=><Choice key={id} label={l} theme={theme} selected={round===id} onPress={()=>setRound(id)}/>)}
    <View style={{width:1,backgroundColor:theme.line,marginHorizontal:4}}/>
    {[['all','Any status'],['upcoming','Upcoming'],['finished','Finished']].map(([id,l])=><Choice key={id} label={l} theme={theme} selected={state===id} onPress={()=>setState(id)}/>)}
   </ScrollView>
   {matches.length===0?<Label theme={theme} muted>No matches found.</Label>:<View style={{flexDirection:'row',flexWrap:'wrap',gap:10}}>{matches.map(m=>{const played=m.status==='played',scored=typeof m.red_score==='number'&&typeof m.blue_score==='number'&&m.red_score>=0&&m.blue_score>=0;const time=m.scheduled_at?new Date(m.scheduled_at).toLocaleTimeString([],{hour:'numeric',minute:'2-digit'}):null;return <View key={m.id} style={{flexGrow:1,flexBasis:large?'31%':wide?'47%':'100%',backgroundColor:theme.surface,borderWidth:1,borderColor:theme.line,borderRadius:14,opacity:played?.75:1,overflow:'hidden'}}>
    <Pressable accessibilityRole="button" accessibilityLabel={matchLabel(m)} onPress={()=>{setMatchId(m.id);setTeamId('')}} style={{padding:14,gap:6}}>
     <View style={{flexDirection:'row',justifyContent:'space-between',alignItems:'center'}}><Text style={{color:theme.text,fontSize:17,fontWeight:'800'}}>{matchLabel(m)}</Text><Text style={{color:theme.muted,fontSize:13}}>{scored?`${m.red_score} – ${m.blue_score}`:played?'Played':time??''}</Text></View>
     <Text style={{fontSize:15}}><Text style={{color:theme.red,fontWeight:'700'}}>{numbers(m.red_teams).map(t=>t.displayNumber).join('  ')}</Text><Text style={{color:theme.muted}}>   |   </Text><Text style={{color:theme.blue,fontWeight:'700'}}>{numbers(m.blue_teams).map(t=>t.displayNumber).join('  ')}</Text></Text>
    </Pressable>
    <Pressable accessibilityRole="button" accessibilityLabel={`Reports for ${matchLabel(m)}`} onPress={()=>router.push({pathname:'/submissions',params:{match:m.id}})} style={{borderTopWidth:1,borderTopColor:theme.line,paddingVertical:10,paddingHorizontal:14}}><Text style={{color:theme.tint,fontWeight:'700',fontSize:14}}>Reports</Text></Pressable>
   </View>})}</View>}
  </>}
 </Screen>;
}
