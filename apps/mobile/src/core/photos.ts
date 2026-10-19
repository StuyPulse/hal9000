import {Image,Platform} from 'react-native';
import {File,Directory,Paths} from 'expo-file-system';
import {manipulateAsync,SaveFormat} from 'expo-image-manipulator';
import * as Crypto from 'expo-crypto';
import {requireClient} from './client';
import type {LocalPhoto,Viewer,EventBundle} from './types';
export async function stagePhoto(viewer:Viewer,bundle:EventBundle,uri:string,teamId:string,id=Crypto.randomUUID()):Promise<LocalPhoto>{
 if(!bundle.teams.some(t=>t.id===teamId))throw Error('Choose a team in this event.');
 if(!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id))throw Error('Invalid photo identifier. Reopen the photo chooser.');
 const size=await Image.getSize(uri),ratio=Math.min(1,1920/Math.max(size.width,size.height));
 const resize=ratio<1?[{resize:{width:Math.round(size.width*ratio),height:Math.round(size.height*ratio)}}]:[];
 const compressed=await manipulateAsync(uri,resize,{compress:.8,format:SaveFormat.JPEG});
 let localUri=compressed.uri;
 if(Platform.OS!=='web'){
  const dir=new Directory(Paths.document,'hal9000-photos',viewer.userId);dir.create({idempotent:true,intermediates:true});
  const target=new File(dir,`${id}.jpg`);
  // A prior copy may exist if persisting the queue failed; retry the same owned file.
  new File(localUri).copy(target,{overwrite:true});localUri=target.uri;
 }
 return {id,organization_id:viewer.organizationId,event_id:bundle.event.id,team_id:teamId,uploaded_by:viewer.userId,storage_path:`${viewer.userId}/${bundle.event.id}/${teamId}/${id}.jpg`,localUri,status:'pending',error:null};
}
export async function uploadPhoto(photo:LocalPhoto,expectedUserId?:string){const c=requireClient();if(expectedUserId){const {data,error}=await c.auth.getUser();if(error||data.user?.id!==expectedUserId||photo.uploaded_by!==expectedUserId)throw Error('Your account changed. This photo is retained in its original workspace.');}const {data:existing}=await c.from('pit_photos').select('id,storage_path').eq('id',photo.id).maybeSingle();if(existing?.storage_path===photo.storage_path)return;
 const buffer=Platform.OS==='web'?await (await fetch(photo.localUri)).arrayBuffer():await new File(photo.localUri).arrayBuffer();if(buffer.byteLength>10*1024*1024)throw Error('Compressed photo exceeds 10 MB. Capture a smaller photo.');
 const {error:uploadError}=await c.storage.from('pit-photos').upload(photo.storage_path,buffer,{contentType:'image/jpeg',upsert:false});if(uploadError&& !/already exists|duplicate/i.test(uploadError.message))throw uploadError;
 const {error}=await c.from('pit_photos').insert({id:photo.id,organization_id:photo.organization_id,event_id:photo.event_id,team_id:photo.team_id,storage_path:photo.storage_path,uploaded_by:photo.uploaded_by});if(error){const {data:after}=await c.from('pit_photos').select('storage_path').eq('id',photo.id).maybeSingle();if(after?.storage_path!==photo.storage_path)throw error;}
}
