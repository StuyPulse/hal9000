import React,{useEffect,useRef,useState} from 'react';
import {Alert,Image,Text,View} from 'react-native';
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
 useEffect(()=>{setFiles([]);if(!scope||!eventId)return;let active=true;void photoSelections(scope,eventId).then(rows=>{if(active)setFiles(rows)}).catch(e=>setMessage((e as Error).message));return()=>{active=false}},[scope,eventId]);
 if(!viewer||!bundle||!scope)return null;
 const select=async(camera:boolean)=>{
  setBusy(true);setMessage('');try{
   if(camera){const p=await ImagePicker.requestCameraPermissionsAsync();if(!p.granted){Alert.alert('Camera access needed','Allow camera access in Settings or choose existing photos.');return}}
   const result=camera?await ImagePicker.launchCameraAsync({mediaTypes:['images'],quality:.85}):await ImagePicker.launchImageLibraryAsync({mediaTypes:['images'],allowsMultipleSelection:true,quality:.85});
   if(result.canceled)return;
   for(const asset of result.assets){const photo=await stagePhotoSelection(viewer,bundle.event.id,asset.uri);if(activeScope.current===scope)setFiles(current=>[...current,photo])}
   if(activeScope.current===scope)setMessage('Photos saved on this device. Check the team and remove unwanted photos before submitting.');
  }catch(e){setMessage((e as Error).message)}finally{setBusy(false)}
 };
 const submit=async()=>{
  if(!teamId||!files.length)return;setBusy(true);setMessage('');let submitted=0;
  try{for(const file of files){if(activeScope.current!==scope)throw Error('Your account changed. Unsubmitted photos remain in their original workspace.');await addPhoto(teamId,file.localUri);await removePhotoSelection(scope,file.id);submitted++;if(activeScope.current===scope)setFiles(current=>current.filter(p=>p.id!==file.id))}setMessage(submitted+' photos submitted to the upload queue. Cloud delivery is shown separately.')}
  catch(e){setMessage(submitted+' submitted. Remaining photos are retained: '+(e as Error).message)}finally{setBusy(false)}
 };
 return <View style={{gap:10}}>
  <Label theme={theme}>Add photos or choose a team first. Nothing uploads until you tap Submit photos.</Label>
  <TeamPicker label="Photo team" theme={theme} teams={bundle.teams} value={teamId} disabled={busy} onChange={setTeamId}/>
  <Button title="Take photo" theme={theme} disabled={busy} onPress={()=>void select(true)}/>
  <Button title="Choose photos" secondary theme={theme} disabled={busy} onPress={()=>void select(false)}/>
  {files.map(file=><View key={file.id} style={{gap:8}}><Image accessibilityLabel="Unsubmitted pit photo" source={{uri:file.localUri}} style={{width:'100%',height:180,resizeMode:'contain'}}/><Button title="Remove unsubmitted photo" secondary theme={theme} disabled={busy} onPress={()=>void removePhotoSelection(scope,file.id).then(()=>setFiles(current=>current.filter(p=>p.id!==file.id))).catch(e=>setMessage(e.message))}/></View>)}
  <Button title={busy?'Saving…':'Submit photos'+(files.length?' ('+files.length+')':'')} theme={theme} disabled={busy||!files.length||!teamId} onPress={()=>void submit()}/>
  {message?<Text accessibilityLiveRegion="polite" style={{color:theme.text}}>{message}</Text>:null}
 </View>;
}
