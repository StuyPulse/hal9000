import {friendlyError} from '../../src/core/friendly-error';
import React,{useEffect,useRef,useState} from 'react';
import { Image, Pressable, View } from 'react-native';
import * as Haptics from 'expo-haptics';
import { Text } from '../../src/components/AppText';
import {useLocalSearchParams,useRouter} from 'expo-router';
import {useApp} from '../../src/core/context';
import {Screen} from '../../src/components/Screen';
import {ALLIANCE_FILL,Button,Choice,Input,Label,Section,Status,TeamTag} from '../../src/components/ui';
import {BREAKAGE_TAGS,initialBreakageIssues,normalizeMatchTimestamp,normalizeRebuilt} from '../../src/core/rebuilt';
import {canEditReport} from '../../src/core/report-editing';
import {matchLabel,manualMatchLabel} from '../../src/features/stats';
import type {Palette,Payload} from '../../src/core/types';
import {useLayout} from '../../src/components/layout';
import {fieldSize} from '../../src/core/layout-model';

const spots=[
 {id:'depot',label:'Depot',x:14.6,y:8.5,mx:85.3,my:8.5},
 {id:'depot-bump',label:'Depot Bump',x:14.6,y:29.2,mx:85.3,my:29.6},
 {id:'hub',label:'Hub',x:14.6,y:49.8,mx:85.3,my:50.7},
 {id:'outpost-bump',label:'Outpost Bump',x:14.6,y:70.5,mx:85.3,my:71.7},
 {id:'outpost',label:'Outpost',x:14.6,y:91.1,mx:85.3,my:92.8},
 {id:'depot-trench',label:'Depot Trench',x:28,y:7.3,mx:72.6,my:7.6},
 {id:'outpost-trench',label:'Outpost Trench',x:28,y:92.7,mx:72.6,my:92.6},
];
const tick=()=>void Haptics.selectionAsync().catch(()=>undefined);

/** The whole tile adds one. Taking counts back is a separate, quieter row. */
function Counter({label,value,onStep,theme,fill}:{label:string;value:number;onStep:(delta:number)=>void;theme:Palette;fill:string}){
 const {largeText}=useLayout();
 // Taps can outrun a render, so the parent applies each step to its latest payload.
 const step=(delta:number)=>{tick();onStep(delta)};
 const small=(delta:number)=><Pressable key={delta} accessibilityRole="button" accessibilityLabel={(delta>0?'Add ':'Take back ')+Math.abs(delta)+' '+label} disabled={delta<0&&value===0} onPress={()=>step(delta)} style={({pressed})=>({flex:1,minHeight:48,borderRadius:12,alignItems:'center',justifyContent:'center',backgroundColor:pressed?theme.line:theme.panel,opacity:delta<0&&value===0?.4:1})}><Text style={{color:theme.text,fontSize:17,fontWeight:'700',fontVariant:['tabular-nums']}}>{delta>0?'+':'−'}{Math.abs(delta)}</Text></Pressable>;
 return <View style={{gap:8}}>
  <Pressable accessibilityRole="button" accessibilityLabel={`${label}, ${value}. Add 1`} onPress={()=>step(1)} style={({pressed})=>({minHeight:largeText?120:92,borderRadius:18,backgroundColor:fill,paddingHorizontal:18,flexDirection:largeText?'column':'row',alignItems:largeText?'flex-start':'center',justifyContent:'space-between',borderTopWidth:2,borderBottomWidth:5,borderTopColor:'rgba(255,255,255,.28)',borderBottomColor:'rgba(0,0,0,.25)',transform:[{scale:pressed?.98:1}]})}>
   <Text style={{color:'#fff',fontSize:19,fontWeight:'800'}}>{label}</Text>
   <Text style={{color:'#fff',fontSize:52,fontWeight:'900',fontVariant:['tabular-nums'],letterSpacing:-1}}>{value}</Text>
  </Pressable>
  <View style={{flexDirection:'row',gap:8}}>{small(-10)}{small(-1)}{small(10)}</View>
 </View>;
}

export default function MatchCapture(){
 const {id}=useLocalSearchParams<{id:string}>();
 const {records,bundle,viewer,theme,saveDraft}=useApp();const router=useRouter();
 const {contentWidth,height}=useLayout();
 const field=fieldSize(contentWidth,height);
 const record=records.find(r=>r.entry.id===id);
 const [payload,setPayload]=useState<Payload|null>(null),[mirror,setMirror]=useState(false),[saving,setSaving]=useState(false),[error,setError]=useState(''),[step,setStep]=useState(0);
 const latest=useRef<Payload|null>(null),loaded=useRef<string|null>(null),saveVersion=useRef(0),scroll=useRef<{scrollTo:(o:{y:number;animated:boolean})=>void}>(null);
 useEffect(()=>{if(record&&loaded.current!==id){loaded.current=id;const p={...record.entry.payload,breakage_issues:initialBreakageIssues(record.entry.payload),defense_level:record.entry.payload.defense_level??5};latest.current=p;setPayload(p)}},[id,record]);
 if(!record||!payload||!bundle)return <Screen><Label theme={theme} muted>Loading…</Label></Screen>;
 if(!canEditReport(viewer,record.entry,record))return <Screen><Label theme={theme}>Your role can only view this report.</Label><Button title="View report" theme={theme} onPress={()=>router.replace({pathname:'/submission/[id]',params:{id}})}/></Screen>;
 const team=bundle.teams.find(t=>t.id===record.entry.team_id),match=bundle.matches.find(m=>m.id===record.entry.match_id);
 const metadata=payload.manual_match as {stage:string;label:string|null;alliance:'red'|'blue'}|null;
 const alliance:'red'|'blue'=metadata?.alliance??(match?.red_teams.includes(record.entry.team_id)?'red':'blue');
 const noShow=payload.no_show===true,editing=record.entry.status==='submitted';
 const steps=noShow?['Start','End']:['Start','Auto','Teleop','End'];
 const current=Math.min(step,steps.length-1),name=steps[current],last=current===steps.length-1;
 const go=(index:number)=>{setStep(index);scroll.current?.scrollTo({y:0,animated:false})};
 const change=(next:Payload)=>{latest.current=next;setPayload(next);setSaving(true);setError('');const token=++saveVersion.current;void saveDraft(id,next).then(()=>{if(token===saveVersion.current)setSaving(false)}).catch(e=>{if(token===saveVersion.current){setSaving(false);setError(friendlyError(e))}})};
 const set=(key:string,value:unknown)=>change({...latest.current!,[key]:value});
 const clamp=(n:number)=>Math.max(0,Math.min(100000,n));
 const score=(period:'auto'|'teleop',key:'shoot'|'ferry',delta:number)=>{const old=latest.current![period] as Record<string,number>;change({...latest.current!,[period]:{...old,[key]:clamp((old?.[key]??0)+delta)}})};
 const issues=payload.breakage_issues as {timestamp:string;issue:string|null}[];
 const issueChange=(i:number,key:'timestamp'|'issue',value:string)=>set('breakage_issues',issues.map((item,j)=>j===i?{...item,[key]:value}:item));
 const submit=async()=>{setSaving(true);try{await saveDraft(id,normalizeRebuilt(latest.current!),true);void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(()=>undefined);router.replace({pathname:'/submission/[id]',params:{id}})}catch(e){setError(friendlyError(e))}finally{setSaving(false)}};
 const fill=ALLIANCE_FILL[alliance];
 const period=(key:'auto'|'teleop')=>{const sc=payload[key] as {shoot:number;ferry:number};return <>{(['shoot','ferry'] as const).map(k=><Counter key={k} label={k==='shoot'?'Scored':'Ferried'} value={sc[k]??0} fill={fill} theme={theme} onStep={d=>score(key,k,d)}/>)}</>};
 const footer=<>{error?<Text accessibilityRole="alert" style={{color:theme.danger}}>{error}</Text>:null}{last?<Button title={saving?'Saving…':editing?'Save changes':'Submit report'} theme={theme} disabled={saving} onPress={()=>void submit()}/>:<Button title={`Next: ${steps[current+1]}`} theme={theme} onPress={()=>go(current+1)}/>}</>;
 return <Screen scrollRef={scroll} footerInset footer={footer}>
  <View style={{flexDirection:'row',alignItems:'center',gap:14}}>
   <TeamTag label={team?.displayNumber??'?'} alliance={alliance} size="lg" theme={theme}/>
   <View style={{flex:1,minWidth:0}}>
    <Text numberOfLines={1} style={{color:theme.text,fontSize:17,fontWeight:'800'}}>{metadata?manualMatchLabel(metadata):match?matchLabel(match):'Match'}</Text>
    <Text numberOfLines={1} style={{color:alliance==='red'?theme.red:theme.blue,fontSize:14,fontWeight:'700'}}>{alliance==='red'?'Red':'Blue'} alliance{editing?' · editing':''}</Text>
   </View>
   <Status label={saving?'Saving':'Saved'} tone={saving?'quiet':'ok'} theme={theme}/>
  </View>

  <View accessibilityRole="tablist" style={{flexDirection:'row',backgroundColor:theme.panel,borderRadius:14,padding:4,gap:4}}>
   {steps.map((label,index)=><Pressable key={label} accessibilityRole="tab" accessibilityState={{selected:index===current}} accessibilityLabel={label} onPress={()=>go(index)} style={{flex:1,minHeight:44,borderRadius:10,alignItems:'center',justifyContent:'center',backgroundColor:index===current?theme.surface:'transparent'}}>
    <Text style={{color:index===current?theme.text:theme.muted,fontSize:15,fontWeight:index===current?'800':'600'}}>{label}</Text>
   </Pressable>)}
  </View>

  {name==='Start'&&<>
   {metadata&&<Section title="Match details" theme={theme}>{editing?<Button title="Correct match details" secondary theme={theme} onPress={()=>router.push({pathname:'/edit-manual',params:{id}})}/>:<>
    <View style={{flexDirection:'row',flexWrap:'wrap',gap:8}}>{['Qualification','Practice','Quarterfinal','Semifinal','Final','Other / exception'].map(stage=><Choice key={stage} label={stage==='Other / exception'?'Other':stage} theme={theme} selected={metadata.stage===stage} onPress={()=>set('manual_match',{...metadata,stage})}/>)}</View>
    <Input label={metadata.stage==='Other / exception'?'Label (optional)':'Match number'} theme={theme} value={metadata.label??''} onChangeText={label=>set('manual_match',{...metadata,label:label||null})}/>
   </>}</Section>}
   <View style={{flexDirection:'row',gap:8}}><View style={{flex:1}}><Choice label="No show" selected={noShow} theme={theme} onPress={()=>set('no_show',!noShow)}/></View>{!noShow&&<View style={{flex:1}}><Choice label="Mirror field" selected={mirror} theme={theme} onPress={()=>setMirror(!mirror)}/></View>}</View>
   {!noShow&&<>
    <Text accessibilityRole="header" style={{color:theme.text,fontSize:18,fontWeight:'800',marginTop:6}}>Starting position</Text>
    <View style={{...field,maxWidth:'100%',alignSelf:'center',backgroundColor:'#fff',borderRadius:14,overflow:'hidden'}}>
     <Image source={require('../../assets/2026-field-map.png')} accessibilityLabel={alliance+' alliance field'} style={{position:'absolute',width:'100%',height:'100%',resizeMode:'stretch',transform:[{rotate:alliance==='blue'?'180deg':'0deg'},{scaleX:mirror?-1:1}]}}/>
     {spots.map((spot,index)=>{const on=payload.starting_spot===spot.id;return <View key={spot.id} pointerEvents="none" style={{position:'absolute',left:((mirror?spot.mx:spot.x)+'%') as `${number}%`,top:((mirror?spot.my:spot.y)+'%') as `${number}%`,width:24,height:24,transform:[{translateX:-12},{translateY:-12}],borderRadius:12,backgroundColor:on?fill:'#fff',borderWidth:2,borderColor:on?'#fff':fill,justifyContent:'center'}}><Text style={{color:on?'#fff':'#14171c',fontSize:12,textAlign:'center',fontWeight:'800'}}>{index+1}</Text></View>})}
    </View>
    <View style={{flexDirection:'row',flexWrap:'wrap',gap:8}}>{spots.map((spot,index)=><Choice key={spot.id} label={`${index+1}  ${spot.label}`} selected={payload.starting_spot===spot.id} theme={theme} onPress={()=>set('starting_spot',payload.starting_spot===spot.id?null:spot.id)}/>)}</View>
   </>}
  </>}

  {name==='Auto'&&period('auto')}
  {name==='Teleop'&&<>{period('teleop')}<Counter label="Fouls" value={Number(payload.fouls??0)} fill={theme.graphite} theme={theme} onStep={d=>set('fouls',clamp(Number(latest.current!.fouls??0)+d))}/></>}

  {name==='End'&&<>
   {!noShow&&<>
    <Section title="Defense" theme={theme}><Choice label="Played defense" theme={theme} selected={payload.defense===true} onPress={()=>set('defense',payload.defense!==true)}/>{payload.defense===true&&<>
     <Label theme={theme} muted>How strong, 1 to 10</Label><View style={{flexDirection:'row',flexWrap:'wrap',gap:6}}>{Array.from({length:10},(_,i)=><View key={i} style={{width:'18%',flexGrow:1}}><Choice label={String(i+1)} selected={payload.defense_level===i+1} onPress={()=>set('defense_level',i+1)} theme={theme}/></View>)}</View>
     <Label theme={theme} muted>Who they defended, up to 3</Label><View style={{flexDirection:'row',flexWrap:'wrap',gap:8}}>{bundle.teams.filter(t=>t.id!==team?.id&&(!match||(match.red_teams.includes(team?.id??'')?match.blue_teams:match.red_teams).includes(t.id))).map(t=><Choice key={t.id} label={t.displayNumber} selected={(payload.defended_teams as string[]??[]).includes(t.id)} theme={theme} onPress={()=>{const old=payload.defended_teams as string[]??[];if(!old.includes(t.id)&&old.length>=3)return;set('defended_teams',old.includes(t.id)?old.filter(v=>v!==t.id):[...old,t.id])}}/>)}</View>
    </>}</Section>
    <Section title="Breakage" theme={theme}><Choice label="Robot broke or was disabled" selected={payload.robot_broke===true} theme={theme} onPress={()=>change({...latest.current!,robot_broke:payload.robot_broke!==true,breakage_issues:payload.robot_broke!==true&&!issues.length?[{timestamp:'',issue:null}]:issues})}/>{payload.robot_broke===true&&<>
     {issues.map((item,i)=>{const other=item.issue==='Other'||(Boolean(item.issue)&&!BREAKAGE_TAGS.includes(item.issue!));return <View key={i} style={{gap:8,backgroundColor:theme.surface,borderRadius:16,padding:14}}>
      <View style={{flexDirection:'row',alignItems:'center',justifyContent:'space-between'}}><Text style={{color:theme.text,fontSize:16,fontWeight:'700'}}>Issue {i+1}</Text><Pressable accessibilityRole="button" accessibilityLabel={'Remove issue '+(i+1)} onPress={()=>set('breakage_issues',issues.filter((_,j)=>j!==i))} style={{minHeight:44,justifyContent:'center',paddingHorizontal:6}}><Text style={{color:theme.danger,fontWeight:'700'}}>Remove</Text></Pressable></View>
      <View style={{flexDirection:'row',flexWrap:'wrap',gap:8}}>{BREAKAGE_TAGS.map(tag=><Choice key={tag} label={tag} theme={theme} selected={tag==='Other'?other:item.issue===tag} onPress={()=>issueChange(i,'issue',tag)}/>)}</View>
      {other&&<Input label="What happened" theme={theme} value={item.issue==='Other'?'':item.issue??''} onChangeText={v=>issueChange(i,'issue',v)}/>}
      <Input label="Match time (optional)" placeholder="1:20" theme={theme} keyboardType="numbers-and-punctuation" maxLength={4} value={item.timestamp} onChangeText={v=>issueChange(i,'timestamp',v.replace(/[^\d:]/g,''))} onBlur={()=>issueChange(i,'timestamp',normalizeMatchTimestamp(item.timestamp))}/>
     </View>})}
     <Button title="Add issue" icon="add" secondary theme={theme} onPress={()=>set('breakage_issues',[...issues,{timestamp:'',issue:null}])}/>
    </>}</Section>
   </>}
   <Input label="Comments" theme={theme} multiline value={String(payload.comments??'')} onChangeText={v=>set('comments',v)} placeholder="Anything the numbers won't show"/>
  </>}
 </Screen>;
}
