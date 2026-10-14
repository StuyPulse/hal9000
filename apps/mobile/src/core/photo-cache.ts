import {Platform} from 'react-native';
import {Directory,File,Paths} from 'expo-file-system';
import {getValue,putValue} from './storage';
import type {EventBundle} from './types';

/** Images live in documents, not the OS-evictable cache. Failed downloads never
 * discard a previously stored image or prevent the event from opening. */
export async function cacheEventPhotos(bundle:EventBundle,allowed:()=>boolean):Promise<EventBundle>{
 if(Platform.OS==='web')return bundle;
 const dir=new Directory(Paths.document,'hal9000-downloaded-photos',encodeURIComponent(bundle.scope),bundle.event.id);
 dir.create({idempotent:true,intermediates:true});
 const photos=[];
 for(const photo of bundle.photos){
  const saved=await getValue<{uri:string;path:string}>(bundle.scope,'downloaded-photo',photo.id);
  let localUri=saved?.path===photo.storage_path&&new File(saved.uri).exists?saved.uri:undefined;
  if(!localUri&&photo.signedUrl&&allowed()){
   try{const target=new File(dir,`${photo.id}.jpg`);await File.downloadFileAsync(photo.signedUrl,target,{idempotent:true});
    if(target.exists&&target.size>0){localUri=target.uri;await putValue(bundle.scope,'downloaded-photo',photo.id,{uri:localUri,path:photo.storage_path});}
   }catch{/* Retry with a fresh signed URL on the next refresh. */}
  }
  photos.push({...photo,localUri});
 }
 return {...bundle,photos};
}
