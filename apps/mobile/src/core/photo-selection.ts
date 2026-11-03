import {Image,Platform} from 'react-native';
import {Directory,File,Paths} from 'expo-file-system';
import {manipulateAsync,SaveFormat} from 'expo-image-manipulator';
import * as Crypto from 'expo-crypto';
import {putValue,getValue,listValues,removeValue} from './storage';
import {scopedIdentity} from './sync-model';
import type {Viewer} from './types';
import {discardPhotoSelection,isOwnedSelectionFile,validSelectionLocation,relativeDocumentPath,resolveDocumentUri,type PhotoSelection} from './photo-selection-model';
// Stored rows keep a document-relative path; callers always receive a resolved URI.
const resolved=(photo:PhotoSelection):PhotoSelection=>Platform.OS==='web'?photo:{...photo,localUri:resolveDocumentUri(photo.localUri,Paths.document.uri)};
export type {PhotoSelection} from './photo-selection-model';
export async function stagePhotoSelection(viewer:Viewer,eventId:string,uri:string):Promise<PhotoSelection>{
 const id=Crypto.randomUUID(),size=await Image.getSize(uri),ratio=Math.min(1,1920/Math.max(size.width,size.height));
 const image=await manipulateAsync(uri,ratio<1?[{resize:{width:Math.round(size.width*ratio),height:Math.round(size.height*ratio)}}]:[],{format:SaveFormat.JPEG,compress:.82});
 let localUri=image.uri,storedUri=image.uri;
 if(Platform.OS!=='web'){const directory=new Directory(Paths.document,'hal9000-photo-selections',scopedIdentity(viewer.userId,viewer.organizationId,viewer.demo));directory.create({idempotent:true,intermediates:true});const file=new File(directory,id+'.jpg');new File(localUri).copy(file);localUri=file.uri;storedUri=relativeDocumentPath(file.uri,Paths.document.uri);}
 const photo={id,eventId,localUri,createdAt:new Date().toISOString()};
 try {await putValue(scopedIdentity(viewer.userId,viewer.organizationId,viewer.demo),'photo-selection',id,{...photo,localUri:storedUri})}
 catch(error){if(Platform.OS!=='web'){const file=new File(localUri);if(file.exists)file.delete()}throw error;}
 return photo;
}
export async function photoSelections(scope:string,eventId:string){return (await listValues<PhotoSelection>(scope,'photo-selection')).filter(p=>p.eventId===eventId).map(resolved)}
export const removePhotoSelection=(scope:string,id:string)=>discardPhotoSelection(id,{
 read:async()=>{const photo=await getValue<PhotoSelection>(scope,'photo-selection',id);return photo?resolved(photo):null},
 discardFile:photo=>{
  if(Platform.OS==='web')return;
  if(!validSelectionLocation(scope,id))throw Error('This photo has an invalid local workspace. Contact support before removing it.');
  const expected=new File(Paths.document,'hal9000-photo-selections',scope,id+'.jpg');
  if(!isOwnedSelectionFile(photo.localUri,expected.uri))throw Error('This photo is outside its local workspace. Contact support before removing it.');
  if(expected.exists)expected.delete();
 },
 removeRow:()=>removeValue(scope,'photo-selection',id),
});
