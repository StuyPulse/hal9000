import {friendlyError} from '../core/friendly-error';
import React,{useEffect,useRef,useState} from 'react';
import {Alert,Image,Pressable,Text,View} from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import {useApp} from '../core/context';
import {scopedIdentity} from '../core/sync-model';
import {photoSelections,removePhotoSelection,stagePhotoSelection,type PhotoSelection} from '../core/photo-selection';
import {TeamPicker} from '../features/common';
import {Button,Label} from './ui';
export function PhotoSubmissionQueue({initialTeamId}:{initialTeamId?:string|null}){
 const {viewer,bundle,theme,addPhoto}=useApp();
 const [teamId,setTeamId]=useState<string|null>(initialTeamId??null),[files,setFiles]=useState<PhotoSelection[]>([]),[busy,setBusy]=useState(false),[message,setMessage]=useState('');
 const scope=viewer?scopedIdentity(viewer.userId,viewer.organizationId,viewer.demo):null;
 const activeScope=useRef(scope);activeScope.current=scope;
 const eventId=bundle?.event.id;
 useEffect(()=>{setTeamId(initialTeamId??null)},[initialTeamId,eventId]);
 useEffect(()=>{setFiles([]);if(!scope||!eventId)return;let active=true;void photoSelections(scope,eventId).then(rows=>{if(active)setFiles(rows)}).catch(e=>setMessage(friendlyError(e)));return()=>{active=false}},[scope,eventId]);
 if(!viewer||!bundle||!scope)return null;
 const select=async(camera:boolean)=>{
  setBusy(true);setMessage('');try{
   if(camera){const p=await ImagePicker.requestCameraPermissionsAsync();if(!p.granted){Alert.alert('Camera access needed','Allow camera access in Settings or choose existing photos.');return}}
   const result=camera?await ImagePicker.launchCameraAsync({mediaTypes:['images'],quality:.85}):await ImagePicker.launchImageLibraryAsync({mediaTypes:['images'],allowsMultipleSelection:true,quality:.85});
   if(result.canceled)return;
   for(const asset of result.assets){const photo=await stagePhotoSelection(viewer,bundle.event.id,asset.uri);if(activeScope.current===scope)setFiles(current=>[...current,photo])}
   if(activeScope.current===scope)setMessage('Saved on this phone. Pick the team, then upload.');
  }catch(e){setMessage(friendlyError(e))}finally{setBusy(false)}
 };
 const submit=async()=>{
  if(!teamId||!files.length)return;setBusy(true);setMessage('');let submitted=0;
  try{for(const file of files){if(activeScope.current!==scope)throw Error('Your account changed. Unsubmitted photos remain in their original workspace.');await addPhoto(teamId,file.localUri);await removePhotoSelection(scope,file.id);submitted++;if(activeScope.current===scope)setFiles(current=>current.filter(p=>p.id!==file.id))}setMessage(submitted+(submitted===1?' photo':' photos')+' queued for upload.')}
  catch(e){setMessage(submitted+' queued. The rest are still on this phone: '+friendlyError(e))}finally{setBusy(false)}
 };
 return <View style={{gap:12}}>
  <TeamPicker label="Team" theme={theme} teams={bundle.teams} value={teamId} disabled={busy} onChange={setTeamId}/>
  <View style={{flexDirection:'row',gap:10}}>
   <View style={{flex:1}}><Button title="Take photo" theme={theme} disabled={busy} onPress={()=>void select(true)}/></View>
   <View style={{flex:1}}><Button title="Choose photos" secondary theme={theme} disabled={busy} onPress={()=>void select(false)}/></View>
  </View>
  {files.length?<View style={{flexDirection:'row',flexWrap:'wrap',gap:10}}>
   {files.map(file=><View key={file.id} style={{width:'31%',aspectRatio:1,borderRadius:12,overflow:'hidden',backgroundColor:theme.panel}}>
    <Image accessibilityLabel="Unsubmitted pit photo" source={{uri:file.localUri}} style={{width:'100%',height:'100%'}} resizeMode="cover"/>
    <Pressable accessibilityRole="button" accessibilityLabel="Remove photo" disabled={busy} onPress={()=>void removePhotoSelection(scope,file.id).then(()=>setFiles(current=>current.filter(p=>p.id!==file.id))).catch(e=>setMessage(friendlyError(e)))} style={{position:'absolute',top:6,right:6,width:28,height:28,borderRadius:14,backgroundColor:'rgba(0,0,0,.65)',alignItems:'center',justifyContent:'center'}}><Text style={{color:'#fff',fontWeight:'800'}}>×</Text></Pressable>
   </View>)}
  </View>:null}
  <Button title={busy?'Saving…':files.length?`Upload ${files.length} photo${files.length===1?'':'s'}`:'Upload photos'} theme={theme} disabled={busy||!files.length||!teamId} onPress={()=>void submit()}/>
  {message?<Text accessibilityLiveRegion="polite" style={{color:theme.muted,fontSize:14}}>{message}</Text>:null}
 </View>;
}
