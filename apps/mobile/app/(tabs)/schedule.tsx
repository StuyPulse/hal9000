import React,{useEffect,useRef,useState} from 'react';
import {Alert,Pressable,Text,View} from 'react-native';
import {useLocalSearchParams,useRouter} from 'expo-router';
import {useApp} from '../../src/core/context';
import {emptyRebuilt} from '../../src/core/data';
import {Screen} from '../../src/components/Screen';
import {Button,Choice,Input,Label,Section} from '../../src/components/ui';
import {TeamPicker} from '../../src/features/common';
import {compareMatches,matchLabel} from '../../src/features/stats';

export default function Schedule(){
 const {bundle,theme,createDraft}=useApp(),router=useRouter(),params=useLocalSearchParams<{match?:string}>();
 const [matchId,setMatchId]=useState(''),[teamId,setTeamId]=useState(''),[search,setSearch]=useState(''),[manual,setManual]=useState(false),[stage,setStage]=useState('Qualification'),[label,setLabel]=useState(''),[alliance,setAlliance]=useState<'red'|'blue'|null>(null),[busy,setBusy]=useState(false);
 const previous=useRef(new Map<string,string>()),observed=useRef(new Map<string,number>()),[now,setNow]=useState(Date.now());
 useEffect(()=>{const timer=setInterval(()=>setNow(Date.now()),30000);return()=>clearInterval(timer)},[]);
 useEffect(()=>{for(const m of bundle?.matches??[]){if(m.status==='played'&&previous.current.has(m.id)&&previous.current.get(m.id)!=='played')observed.current.set(m.id,Date.now());previous.current.set(m.id,m.status)}},[bundle?.matches]);
 useEffect(()=>{if(params.match&&bundle?.matches.some(m=>m.id===params.match)){setMatchId(params.match);setTeamId('');setManual(false);setSearch('')}},[params.match,bundle?.event.id]);
 if(!bundle)return <Screen><Label theme={theme}>Download an event first.</Label></Screen>;
 const match=bundle.matches.find(m=>m.id===matchId);
 const q=search.trim().toLowerCase();
 const matches=bundle.matches.filter(m=>!q||[matchLabel(m),...bundle.teams.filter(t=>[...m.red_teams,...m.blue_teams].includes(t.id)).flatMap(t=>[t.displayNumber,t.name])].join(' ').toLowerCase().includes(q)).sort((a,b)=>{const played=(m:typeof a)=>m.status==='played'&&(!observed.current.has(m.id)||now-observed.current.get(m.id)!>=5*60*1000);return Number(played(a))-Number(played(b))||compareMatches(a,b)});
 const open=async()=>{
  if(!teamId||(!manual&&!match))return;
  if(manual&&(!alliance||(stage!=='Other / exception'&&!label.trim())))return;
  setBusy(true);try{const payload=manual?{...emptyRebuilt(),report_source:'manual',manual_match:{stage,label:label.trim()||null,alliance}}:undefined;const local=await createDraft('match',teamId,manual?null:matchId,null,payload);router.push({pathname:'/match/[id]',params:{id:local.entry.id}})}catch(e){Alert.alert('Cannot start',(e as Error).message)}finally{setBusy(false)}
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
   {matches.length===0?<Label theme={theme} muted>No matches found.</Label>:matches.map(m=>{const played=m.status==='played';return <Pressable key={m.id} accessibilityRole="button" accessibilityLabel={matchLabel(m)} onPress={()=>{setMatchId(m.id);setTeamId('')}} style={{backgroundColor:theme.surface,borderRadius:12,padding:14,gap:4,opacity:played?.65:1}}>
    <View style={{flexDirection:'row',justifyContent:'space-between'}}><Text style={{color:theme.text,fontSize:17,fontWeight:'700'}}>{matchLabel(m)}</Text>{played?<Text style={{color:theme.muted,fontSize:13}}>played</Text>:null}</View>
    <Text style={{fontSize:14}}><Text style={{color:theme.red,fontWeight:'700'}}>{numbers(m.red_teams).map(t=>t.displayNumber).join('  ')}</Text><Text style={{color:theme.muted}}>   |   </Text><Text style={{color:theme.blue,fontWeight:'700'}}>{numbers(m.blue_teams).map(t=>t.displayNumber).join('  ')}</Text></Text>
   </Pressable>})}
  </>}
 </Screen>;
}
