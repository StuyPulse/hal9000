import {Image,Platform} from 'react-native';
import {Directory,File,Paths} from 'expo-file-system';
import {manipulateAsync,SaveFormat} from 'expo-image-manipulator';
import * as Crypto from 'expo-crypto';
import {putValue,listValues,removeValue} from './storage';
import {scopedIdentity} from './sync-model';
import type {Viewer} from './types';
export type PhotoSelection={id:string;eventId:string;localUri:string;createdAt:string};
export async function stagePhotoSelection(viewer:Viewer,eventId:string,uri:string):Promise<PhotoSelection>{
 const id=Crypto.randomUUID(),size=await Image.getSize(uri),ratio=Math.min(1,1920/Math.max(size.width,size.height));
 const image=await manipulateAsync(uri,ratio<1?[{resize:{width:Math.round(size.width*ratio),height:Math.round(size.height*ratio)}}]:[],{format:SaveFormat.JPEG,compress:.82});
 let localUri=image.uri;
 if(Platform.OS!=='web'){const directory=new Directory(Paths.document,'hal9000-photo-selections',scopedIdentity(viewer.userId,viewer.organizationId,viewer.demo));directory.create({idempotent:true,intermediates:true});const file=new File(directory,id+'.jpg');new File(localUri).copy(file);localUri=file.uri;}
 const photo={id,eventId,localUri,createdAt:new Date().toISOString()};
 await putValue(scopedIdentity(viewer.userId,viewer.organizationId,viewer.demo),'photo-selection',id,photo);return photo;
}
export async function photoSelections(scope:string,eventId:string){return (await listValues<PhotoSelection>(scope,'photo-selection')).filter(p=>p.eventId===eventId)}
export const removePhotoSelection=(scope:string,id:string)=>removeValue(scope,'photo-selection',id);
