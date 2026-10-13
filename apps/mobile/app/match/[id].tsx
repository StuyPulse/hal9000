import React,{useEffect,useRef,useState} from 'react';
import {Image,Pressable,Text,View} from 'react-native';
import {useLocalSearchParams,useRouter} from 'expo-router';
import {useApp} from '../../src/core/context';
import {Screen} from '../../src/components/Screen';
import {Button,Choice,Input,Label,Section} from '../../src/components/ui';
import {BREAKAGE_TAGS,initialBreakageIssues,normalizeMatchTimestamp,normalizeRebuilt} from '../../src/core/rebuilt';
import {canEditReport} from '../../src/core/report-editing';
import {matchLabel,manualMatchLabel} from '../../src/features/stats';
import type {Palette,Payload} from '../../src/core/types';

const spots=[
 {id:'depot',label:'Depot',x:14.6,y:8.5,mx:85.3,my:8.5},
 {id:'depot-bump',label:'Depot Bump',x:14.6,y:29.2,mx:85.3,my:29.6},
 {id:'hub',label:'Hub',x:14.6,y:49.8,mx:85.3,my:50.7},
 {id:'outpost-bump',label:'Outpost Bump',x:14.6,y:70.5,mx:85.3,my:71.7},
 {id:'outpost',label:'Outpost',x:14.6,y:91.1,mx:85.3,my:92.8},
 {id:'depot-trench',label:'Depot Trench',x:28,y:7.3,mx:72.6,my:7.6},
 {id:'outpost-trench',label:'Outpost Trench',x:28,y:92.7,mx:72.6,my:92.6},
];
function Counter({label,value,step,onChange,theme}:{label:string;value:number;step:number;onChange:(v:number)=>void;theme:Palette}){
 return <View style={{gap:6}}><Label theme={theme}>{label}</Label><View style={{flexDirection:'row',alignItems:'center',gap:8}}>
  <Button title={'−'+step} secondary theme={theme} disabled={value===0} onPress={()=>onChange(Math.max(0,value-step))}/>
  <View style={{flex:1}}><Input label={label+' count'} theme={theme} keyboardType="number-pad" value={String(value)} onChangeText={v=>{if(/^\d*$/.test(v))onChange(Math.min(100000,Number(v)))}} style={{textAlign:'center'}}/></View>
  <Button title={'+'+step} secondary theme={theme} onPress={()=>onChange(Math.min(100000,value+step))}/>
 </View></View>;
}
export default function MatchCapture(){
 const {id}=useLocalSearchParams<{id:string}>();
 const {records,bundle,viewer,theme,saveDraft}=useApp();const router=useRouter();
 const record=records.find(r=>r.entry.id===id);
 const [payload,setPayload]=useState<Payload|null>(null),[mirror,setMirror]=useState(false),[saving,setSaving]=useState(false),[error,setError]=useState('');
 const latest=useRef<Payload|null>(null),loaded=useRef<string|null>(null),saveVersion=useRef(0);
 useEffect(()=>{if(record&&loaded.current!==id){loaded.current=id;const p={...record.entry.payload,breakage_issues:initialBreakageIssues(record.entry.payload),defense_level:record.entry.payload.defense_level??5};latest.current=p;setPayload(p)}},[id,record]);
 if(!record||!payload||!bundle)return <Screen><Label theme={theme}>Loading local report…</Label></Screen>;
 if(!canEditReport(viewer,record.entry,record))return <Screen><Label theme={theme}>This report is read-only for your role.</Label><Button title="View report" theme={theme} onPress={()=>router.replace({pathname:'/submission/[id]',params:{id}})}/></Screen>;
 const team=bundle.teams.find(t=>t.id===record.entry.team_id),match=bundle.matches.find(m=>m.id===record.entry.match_id);
 const metadata=payload.manual_match as {stage:string;label:string|null;alliance:'red'|'blue'}|null;
 const alliance=metadata?.alliance??(match?.red_teams.includes(record.entry.team_id)?'red':'blue');
 const noShow=payload.no_show===true,editing=record.entry.status==='submitted';
 const change=(next:Payload)=>{latest.current=next;setPayload(next);setSaving(true);setError('');const token=++saveVersion.current;void saveDraft(id,next).then(()=>{if(token===saveVersion.current)setSaving(false)}).catch(e=>{if(token===saveVersion.current){setSaving(false);setError((e as Error).message)}})};
 const set=(key:string,value:unknown)=>change({...latest.current!,[key]:value});
 const score=(period:'auto'|'teleop',key:'shoot'|'ferry',n:number)=>change({...latest.current!,[period]:{...(latest.current![period] as object),[key]:n}});
 const issues=payload.breakage_issues as {timestamp:string;issue:string|null}[];
 const issueChange=(i:number,key:'timestamp'|'issue',value:string)=>set('breakage_issues',issues.map((item,j)=>j===i?{...item,[key]:value}:item));
 const submit=async()=>{setSaving(true);try{await saveDraft(id,normalizeRebuilt(latest.current!),true);router.replace({pathname:'/submission/[id]',params:{id}})}catch(e){setError((e as Error).message)}finally{setSaving(false)}};
 return <Screen>
  <Text style={{color:theme.text,fontSize:25,fontWeight:'700'}}>{team?.displayNumber} · {team?.name}</Text>
  <Label theme={theme}>{metadata?manualMatchLabel(metadata):match?matchLabel(match):'Match'} · {alliance} alliance</Label>
  <Label theme={theme} muted>{editing?'Working edits save only on this device. Tap Save changes to publish.':'Your draft saves on this device. Tap Submit scout report when complete.'}</Label>
  {metadata&&<Section title="Manual match details" theme={theme}>{editing?<Button title="Correct manual match identity" secondary theme={theme} onPress={()=>router.push({pathname:'/edit-manual',params:{id}})}/>:<>
   <View style={{flexDirection:'row',flexWrap:'wrap',gap:8}}>{['Qualification','Practice','Quarterfinal','Semifinal','Final','Other / exception'].map(stage=><Choice key={stage} label={stage} theme={theme} selected={metadata.stage===stage} onPress={()=>set('manual_match',{...metadata,stage})}/>)}</View>
   <Input label={metadata.stage==='Other / exception'?'Optional match label':'Match number / label'} theme={theme} value={metadata.label??''} onChangeText={label=>set('manual_match',{...metadata,label:label||null})}/>
  </>}</Section>}
  <Section title="Auton starting position" theme={theme}>
   <Choice label={noShow?'Undo no show':'Mark no show'} selected={noShow} theme={theme} onPress={()=>set('no_show',!noShow)}/>
   <Button title={mirror?'Use alliance view':'Mirror field'} secondary theme={theme} onPress={()=>setMirror(!mirror)}/>
   {!noShow&&<View style={{height:300,width:'100%',backgroundColor:'#fff',borderRadius:12,overflow:'hidden'}}>
    <Image source={require('../../assets/2026-field-map.png')} accessibilityLabel={alliance+' alliance field'} style={{position:'absolute',width:'100%',height:'100%',resizeMode:'stretch',transform:[{rotate:alliance==='blue'?'180deg':'0deg'},{scaleX:mirror?-1:1}]}}/>
    {spots.map(spot=><Pressable key={spot.id} accessibilityRole="button" accessibilityLabel={'Start at '+spot.label} accessibilityState={{selected:payload.starting_spot===spot.id}} onPress={()=>set('starting_spot',payload.starting_spot===spot.id?null:spot.id)} style={{position:'absolute',left:((mirror?spot.mx:spot.x)+'%') as `${number}%`,top:((mirror?spot.my:spot.y)+'%') as `${number}%`,width:50,minHeight:48,transform:[{translateX:-25},{translateY:-24}],borderRadius:8,backgroundColor:payload.starting_spot===spot.id?theme.tint:theme.surface,borderWidth:1,borderColor:theme.tint,justifyContent:'center',padding:2}}><Text style={{color:payload.starting_spot===spot.id?theme.onTint:theme.text,fontSize:11,textAlign:'center',fontWeight:'600'}}>{spot.label}</Text></Pressable>)}
   </View>}
  </Section>
  {!noShow&&<>
   <Section title="Scoring" theme={theme}>{(['auto','teleop'] as const).map(period=>{const s=payload[period] as {shoot:number;ferry:number};return <View key={period} style={{gap:8}}><Text style={{color:theme.text,fontWeight:'700',fontSize:18}}>{period==='auto'?'Autonomous':'Teleop'}</Text>{(['shoot','ferry'] as const).map(key=><Counter key={key} label={(period==='auto'?'Auto':'Teleop')+' '+(key==='shoot'?'scored':'ferried')} value={s[key]??0} step={10} theme={theme} onChange={n=>score(period,key,n)}/>)}</View>})}</Section>
   <Section title="Fouls" theme={theme}><Counter label="Fouls" value={Number(payload.fouls??0)} step={1} onChange={n=>set('fouls',n)} theme={theme}/></Section>
   <Section title="Defense" theme={theme}><Choice label="Played defense" theme={theme} selected={payload.defense===true} onPress={()=>set('defense',payload.defense!==true)}/>{payload.defense===true&&<>
    <Label theme={theme}>Defense level: {String(payload.defense_level)} / 10</Label><View style={{flexDirection:'row',flexWrap:'wrap',gap:8}}>{Array.from({length:10},(_,i)=><Choice key={i} label={String(i+1)} selected={payload.defense_level===i+1} onPress={()=>set('defense_level',i+1)} theme={theme}/>)}</View>
    <Label theme={theme}>Select up to three {metadata?'event teams':'opposing robots'} defended.</Label><View style={{flexDirection:'row',flexWrap:'wrap',gap:8}}>{bundle.teams.filter(t=>t.id!==team?.id&&(!match||(match.red_teams.includes(team?.id??'')?match.blue_teams:match.red_teams).includes(t.id))).map(t=><Choice key={t.id} label={t.displayNumber} selected={(payload.defended_teams as string[]??[]).includes(t.id)} theme={theme} onPress={()=>{const old=payload.defended_teams as string[]??[];if(!old.includes(t.id)&&old.length>=3)return;set('defended_teams',old.includes(t.id)?old.filter(v=>v!==t.id):[...old,t.id])}}/>)}</View>
   </>}</Section>
   <Section title="Breakage · PulseCrew" theme={theme}><Choice label="Robot broke / disabled" selected={payload.robot_broke===true} theme={theme} onPress={()=>change({...latest.current!,robot_broke:payload.robot_broke!==true,breakage_issues:payload.robot_broke!==true&&!issues.length?[{timestamp:'',issue:null}]:issues})}/>{payload.robot_broke===true&&<>
    {issues.map((item,i)=>{const other=item.issue==='Other'||(Boolean(item.issue)&&!BREAKAGE_TAGS.includes(item.issue!));return <View key={i} style={{gap:8}}><Label theme={theme}>Issue {i+1}</Label><Input label={'Issue '+(i+1)+' timestamp (optional)'} placeholder="1:20" theme={theme} keyboardType="numbers-and-punctuation" maxLength={4} value={item.timestamp} onChangeText={v=>issueChange(i,'timestamp',v.replace(/[^\d:]/g,''))} onBlur={()=>issueChange(i,'timestamp',normalizeMatchTimestamp(item.timestamp))}/><View style={{flexDirection:'row',flexWrap:'wrap',gap:8}}>{BREAKAGE_TAGS.map(tag=><Choice key={tag} label={tag} theme={theme} selected={tag==='Other'?other:item.issue===tag} onPress={()=>issueChange(i,'issue',tag)}/>)}</View>{other&&<Input label={'Issue '+(i+1)+' description'} theme={theme} value={item.issue==='Other'?'':item.issue??''} onChangeText={v=>issueChange(i,'issue',v)}/>}<Button title={'Remove issue '+(i+1)} secondary theme={theme} onPress={()=>set('breakage_issues',issues.filter((_,j)=>j!==i))}/></View>})}
    <Button title="Add another issue" secondary theme={theme} onPress={()=>set('breakage_issues',[...issues,{timestamp:'',issue:null}])}/>
   </>}</Section>
  </>}
  <Input label="Comments" theme={theme} multiline value={String(payload.comments??'')} onChangeText={v=>set('comments',v)} placeholder="Be succinct and include what the data won't show"/>
  <Label theme={theme} muted>{saving?'Saving on device…':editing?'Working changes saved on this device':'Draft saved on this device'}</Label>
  {error&&<Text accessibilityRole="alert" style={{color:theme.danger}}>{error}</Text>}
  <Button title={saving?'Saving…':editing?'Save changes':'Submit scout report'} theme={theme} disabled={saving} onPress={()=>void submit()}/>
 </Screen>;
}
