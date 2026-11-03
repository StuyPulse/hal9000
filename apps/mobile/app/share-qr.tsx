import React,{useEffect,useMemo,useRef,useState} from 'react';
import {AppState,Pressable,View} from 'react-native';
import {useIsFocused} from 'expo-router/react-navigation';
import {useRouter} from 'expo-router';
import QRCode from 'react-native-qrcode-svg';
import {activateKeepAwakeAsync,deactivateKeepAwake} from 'expo-keep-awake';
import {DEFAULT_BLOCK_SIZE,EASY_SCAN_BLOCK_SIZE} from '@wildcard/shared/src/fountain-qr';
import {Text} from '../src/components/AppText';
import {Screen} from '../src/components/Screen';
import {useLayout} from '../src/components/layout';
import {Button,DISPLAY,DISPLAY_BOLD,Label,TeamTag} from '../src/components/ui';
import {useApp} from '../src/core/context';
import {friendlyError} from '../src/core/friendly-error';
import {deliveryLabel,deliveryState,prepareQrTransfer,qrCandidates,type QrTransfer} from '../src/core/qr-share';
import {proofForReport} from '../src/core/relay-device';

const SPEEDS=[{label:'Slow',fps:2},{label:'Normal',fps:4},{label:'Fast',fps:7}];

export default function ShareQr(){
 const {records,viewer,bundle,theme,markQrShared}=useApp();const router=useRouter();
 const {width,height,compactHeight}=useLayout();
 const candidates=useMemo(()=>viewer&&bundle?qrCandidates(records,viewer,bundle.event.id):[],[records,viewer,bundle]);
 const [excluded,setExcluded]=useState<Set<string>>(new Set());
 const [transfer,setTransfer]=useState<QrTransfer|null>(null),[seq,setSeq]=useState(0),[speed,setSpeed]=useState(1),[easy,setEasy]=useState(false),[paused,setPaused]=useState(false),[busy,setBusy]=useState(false),[error,setError]=useState(''),[confirmed,setConfirmed]=useState(false);
 const [active,setActive]=useState(AppState.currentState==='active');const focused=useIsFocused();const generation=useRef(0);
 useEffect(()=>{const subscription=AppState.addEventListener('change',state=>setActive(state==='active'));return()=>subscription.remove()},[]);
 const running=Boolean(transfer&&!paused&&focused&&active&&!confirmed);
 useEffect(()=>{if(!running)return;const timer=setInterval(()=>setSeq(s=>s+1),1000/SPEEDS[speed].fps);return()=>clearInterval(timer)},[running,speed]);
 // A sleeping screen would silently end the transfer in the scout's hand.
 useEffect(()=>{if(!transfer||!focused)return;void activateKeepAwakeAsync('qr-share').catch(()=>undefined);return()=>{void deactivateKeepAwake('qr-share').catch(()=>undefined)}},[transfer,focused]);
 const team=(id:string)=>bundle?.teams.find(t=>t.id===id)?.displayNumber??'Team';
 const match=(id:string|null)=>{const m=bundle?.matches.find(item=>item.id===id);return m?`${m.match_type==='qualification'?'Q':m.match_type==='practice'?'P':'E'}${m.match_number}`:null};
 const chosen=candidates.filter(r=>!excluded.has(r.entry.id));
 const start=async(blockSize=easy?EASY_SCAN_BLOCK_SIZE:DEFAULT_BLOCK_SIZE)=>{
  if(!viewer||busy||!chosen.length)return;
  const token=++generation.current;setBusy(true);setError('');
  try{
   const result=await prepareQrTransfer(chosen,r=>r.entry.scout_user_id===viewer.userId?proofForReport(viewer,r.entry):Promise.resolve(null),blockSize);
   if(token===generation.current){setTransfer(result);setSeq(0);setPaused(false);setConfirmed(false)}
  }catch(e){if(token===generation.current)setError(friendlyError(e))}
  finally{if(token===generation.current)setBusy(false)}
 };
 const toggleEasy=()=>{const next=!easy;setEasy(next);void start(next?EASY_SCAN_BLOCK_SIZE:DEFAULT_BLOCK_SIZE)};
 const confirm=async()=>{if(!transfer)return;try{await markQrShared(transfer.reports);setConfirmed(true)}catch(e){setError(friendlyError(e))}};
 const size=Math.min(width-40,compactHeight?Math.max(180,height-110):420);
 if(!transfer)return <Screen footer={<Button title={busy?'Preparing…':`Show QR for ${chosen.length} report${chosen.length===1?'':'s'}`} icon="qr" theme={theme} disabled={busy||!chosen.length} onPress={()=>void start()}/>}>
  {candidates.length?null:<Label theme={theme} muted>Nothing to share. Reports you submit show up here until they upload.</Label>}
  {candidates.length>1&&<View style={{flexDirection:'row',gap:8}}><Button title="Select all" theme={theme} secondary disabled={!excluded.size} onPress={()=>setExcluded(new Set())} style={{flex:1}}/><Button title="Select none" theme={theme} secondary disabled={excluded.size===candidates.length} onPress={()=>setExcluded(new Set(candidates.map(r=>r.entry.id)))} style={{flex:1}}/></View>}
  {candidates.map(r=>{const on=!excluded.has(r.entry.id);return <Pressable key={r.entry.id} accessibilityRole="checkbox" accessibilityState={{checked:on}} accessibilityLabel={`${team(r.entry.team_id)}, ${match(r.entry.match_id)??r.entry.entry_type}, ${deliveryLabel[deliveryState(r)]}`} onPress={()=>setExcluded(current=>{const next=new Set(current);if(on)next.add(r.entry.id);else next.delete(r.entry.id);return next})} style={{minHeight:60,flexDirection:'row',alignItems:'center',gap:12,padding:12,borderRadius:16,backgroundColor:theme.surface,opacity:on?1:.55}}>
   <TeamTag label={team(r.entry.team_id)} size="md" theme={theme}/>
   <View style={{flex:1}}><Text style={{color:theme.text,fontSize:16,fontWeight:'600'}}>{match(r.entry.match_id)??(r.entry.entry_type==='pre_scout'?'Pre-scout':r.entry.entry_type==='pit'?'Pit':'Match')}</Text><Text style={{color:theme.muted,fontSize:14}}>{deliveryLabel[deliveryState(r)]}</Text></View>
   <View style={{width:28,height:28,borderRadius:14,borderWidth:2,borderColor:on?theme.tint:theme.line,backgroundColor:on?theme.tint:'transparent',alignItems:'center',justifyContent:'center'}}>{on?<Text style={{color:theme.onTint,fontSize:15,fontWeight:'900'}}>✓</Text>:null}</View>
  </Pressable>})}
  {error?<Text accessibilityRole="alert" style={{color:theme.danger}}>{error}</Text>:null}
 </Screen>;
 return <Screen footer={confirmed?<Button title="Done" theme={theme} onPress={()=>router.back()}/>:<Button title="The receiver has them" theme={theme} onPress={()=>void confirm()}/>}>
  {confirmed?<>
   <Text accessibilityRole="header" style={{color:theme.success,fontSize:40,fontFamily:DISPLAY}}>Shared</Text>
   <Label theme={theme} muted>{transfer.reports.length===1?'It still uploads':'They still upload'} from this phone when you're online.</Label>
  </>:<>
   <View style={{flexDirection:'row',justifyContent:'space-between',alignItems:'baseline'}}><Text style={{color:theme.text,fontSize:24,fontFamily:DISPLAY_BOLD}}>{transfer.reports.length} report{transfer.reports.length===1?'':'s'}</Text><Text accessibilityLabel={`Code ${transfer.encoder.code.split('').join(' ')}`} style={{color:theme.text,fontSize:36,fontFamily:DISPLAY,letterSpacing:3}}>{transfer.encoder.code}</Text></View>
   <View accessible accessibilityRole="image" accessibilityLabel={`Animated QR code for ${transfer.reports.length} reports, transfer code ${transfer.encoder.code}`} style={{alignItems:'center',padding:12,backgroundColor:'#fff',borderRadius:16}}>
    <QRCode value={transfer.encoder.frame(seq)} size={size-24} ecl="M" backgroundColor="#fff" color="#000"/>
   </View>
   <Label theme={theme} muted>Point the receiver's Scan reports here until it shows code {transfer.encoder.code}.</Label>
   <View style={{flexDirection:'row',gap:8}}>{SPEEDS.map((option,index)=><Button key={option.label} title={option.label} theme={theme} secondary={speed!==index} onPress={()=>setSpeed(index)} style={{flex:1}}/>)}</View>
   <View style={{flexDirection:'row',gap:8}}>
    <Button title={paused?'Play':'Pause'} theme={theme} secondary onPress={()=>setPaused(!paused)} style={{flex:1}}/>
    <Button title={easy?'Denser code':'Easier code'} theme={theme} secondary disabled={busy} onPress={toggleEasy} style={{flex:1}}/>
   </View>
   {transfer.unsignedCount>0&&<Text accessibilityRole="alert" style={{color:theme.warning,fontSize:15,lineHeight:21}}>{transfer.unsignedCount} unsigned: only this phone can upload {transfer.unsignedCount===1?'it':'them'}. Go online once to fix this.</Text>}
  </>}
  {error?<Text accessibilityRole="alert" style={{color:theme.danger}}>{error}</Text>:null}
 </Screen>;
}
