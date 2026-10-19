import {friendlyError} from '../core/friendly-error';
import React,{useEffect,useMemo,useRef,useState} from 'react';
import { Alert, Image, Linking, Pressable, View } from 'react-native';
import { Text } from './AppText';
import * as ImagePicker from 'expo-image-picker';
import {useApp} from '../core/context';
import {scopedIdentity} from '../core/sync-model';
import {photoSelections,removePhotoSelection,stagePhotoSelection,type PhotoSelection} from '../core/photo-selection';
import {TeamPicker} from '../features/common';
import {Button,Label} from './ui';
import {useLayout} from './layout';
export function PhotoSubmissionQueue({initialTeamId}:{initialTeamId?:string|null}){
 const {viewer,bundle,theme,addPhoto}=useApp();
 const [teamId,setTeamId]=useState<string|null>(initialTeamId??null),[files,setFiles]=useState<PhotoSelection[]>([]),[busy,setBusy]=useState(false),[message,setMessage]=useState('');
 const scope=viewer?scopedIdentity(viewer.userId,viewer.organizationId,viewer.demo):null;
 const eventId=bundle?.event.id;
 const identity=useMemo(()=>({}),[scope,eventId]),activeIdentity=useRef(identity),mounted=useRef(true),actionLock=useRef<object|null>(null);
 activeIdentity.current=identity;
 const valid=()=>mounted.current&&activeIdentity.current===identity;
 const {largeText}=useLayout();
 useEffect(()=>{mounted.current=true;return()=>{mounted.current=false}},[]);
 useEffect(()=>{setTeamId(initialTeamId??null)},[initialTeamId,eventId]);
 useEffect(()=>{setFiles([]);setMessage('');setBusy(false);actionLock.current=null;if(!scope||!eventId)return;let active=true;void photoSelections(scope,eventId).then(rows=>{if(active)setFiles(rows)}).catch(e=>{if(active)setMessage(friendlyError(e))});return()=>{active=false}},[scope,eventId]);
 if(!viewer||!bundle||!scope)return null;
 const select=async(camera:boolean)=>{
  if(actionLock.current===identity)return;actionLock.current=identity;
  setBusy(true);setMessage('');try{
   if(camera){const p=await ImagePicker.requestCameraPermissionsAsync();if(!valid())return;if(!p.granted){Alert.alert('Camera access needed','Allow camera access in Settings or choose existing photos.',[{text:'Not now',style:'cancel'},{text:'Open Settings',onPress:()=>void Linking.openSettings().catch(e=>{if(valid())setMessage(friendlyError(e))})}]);return}}
   const result=camera?await ImagePicker.launchCameraAsync({mediaTypes:['images'],quality:.85}):await ImagePicker.launchImageLibraryAsync({mediaTypes:['images'],allowsMultipleSelection:true,quality:.85});
   if(result.canceled||!valid())return;
   for(const asset of result.assets){if(!valid())break;const photo=await stagePhotoSelection(viewer,bundle.event.id,asset.uri);if(valid())setFiles(current=>[...current,photo])}
   if(valid())setMessage('Saved on this phone. Pick the team, then upload.');
  }catch(e){if(valid())setMessage(friendlyError(e))}finally{if(valid()){actionLock.current=null;setBusy(false)}}
 };
 const submit=async()=>{
  if(!teamId||!files.length||actionLock.current===identity)return;actionLock.current=identity;setBusy(true);setMessage('');let submitted=0;
  try{for(const file of files){if(!valid())return;await addPhoto(teamId,file.localUri,file.id);submitted++;await removePhotoSelection(scope,file.id);if(valid())setFiles(current=>current.filter(p=>p.id!==file.id))}if(valid())setMessage(submitted+(submitted===1?' photo':' photos')+' queued for upload.')}
  catch(e){if(valid())setMessage(submitted+' queued. The rest are still on this phone: '+friendlyError(e))}finally{if(valid()){actionLock.current=null;setBusy(false)}}
 };
 const remove=async(file:PhotoSelection)=>{if(actionLock.current===identity)return;actionLock.current=identity;setBusy(true);setMessage('');try{await removePhotoSelection(scope,file.id);if(valid())setFiles(current=>current.filter(p=>p.id!==file.id))}catch(e){if(valid())setMessage(friendlyError(e))}finally{if(valid()){actionLock.current=null;setBusy(false)}}};
 return <View style={{gap:12}}>
  <TeamPicker label="Team" theme={theme} teams={bundle.teams} value={teamId} disabled={busy} onChange={setTeamId}/>
  <View style={{flexDirection:largeText?'column':'row',gap:10}}>
   <View style={{flex:1}}><Button title="Take photo" theme={theme} disabled={busy} onPress={()=>void select(true)}/></View>
   <View style={{flex:1}}><Button title="Choose photos" secondary theme={theme} disabled={busy} onPress={()=>void select(false)}/></View>
  </View>
  {files.length?<View style={{flexDirection:'row',flexWrap:'wrap',gap:10}}>
   {files.map(file=><View key={file.id} style={{width:'31%',aspectRatio:1,borderRadius:12,overflow:'hidden',backgroundColor:theme.panel}}>
    <Image accessibilityLabel="Unsubmitted pit photo" source={{uri:file.localUri}} style={{width:'100%',height:'100%'}} resizeMode="cover"/>
    <Pressable accessibilityRole="button" accessibilityLabel={`Remove photo ${files.indexOf(file)+1}`} accessibilityState={{disabled:busy}} disabled={busy} onPress={()=>void remove(file)} style={{position:'absolute',top:0,right:0,width:48,height:48,borderRadius:12,backgroundColor:'rgba(0,0,0,.65)',alignItems:'center',justifyContent:'center'}}><Text maxFontSizeMultiplier={1} style={{color:'#fff',fontWeight:'800'}}>×</Text></Pressable>
   </View>)}
  </View>:null}
  <Button title={busy?'Saving…':files.length?`Upload ${files.length} photo${files.length===1?'':'s'}`:'Upload photos'} theme={theme} disabled={busy||!files.length||!teamId} onPress={()=>void submit()}/>
  {message?<Text accessibilityLiveRegion="polite" style={{color:theme.muted,fontSize:14}}>{message}</Text>:null}
 </View>;
}
