import React,{useState} from 'react';
import { Image, Pressable, View } from 'react-native';
import { Text } from '../src/components/AppText';
import {useApp} from '../src/core/context';
import {Screen} from '../src/components/Screen';
import {Label,Section} from '../src/components/ui';
import {useLayout} from '../src/components/layout';
import {PhotoSubmissionQueue} from '../src/components/PhotoSubmissionQueue';
export default function Photos(){
 const {bundle,photos,theme}=useApp();
 const [target,setTarget]=useState<string|null>(null);
 const {wide,large}=useLayout();
 if(!bundle)return <Screen><Label theme={theme}>Download an event first.</Label></Screen>;
 const local=photos.filter(p=>p.event_id===bundle.event.id);
 const covered=new Set([...bundle.photos.map(p=>p.team_id),...local.map(p=>p.team_id)]);
 const total=bundle.teams.length,done=bundle.teams.filter(t=>covered.has(t.id)).length;
 const teams=[...bundle.teams].sort((a,b)=>a.number-b.number);
 const number=(id:string)=>bundle.teams.find(t=>t.id===id)?.displayNumber??'';
 const cell={width:large?'15%':wide?'23%':'31.5%'} as const;
 const gallery=[...local.map(p=>({id:p.id,team:p.team_id,uri:p.localUri,status:p.status==='synced'?'':p.status==='failed'?'Failed':'Uploading'})),...bundle.photos.map(p=>({id:p.id,team:p.team_id,uri:p.signedUrl,status:''}))];
 return <Screen>
  <View style={{gap:8}}>
   <View style={{flexDirection:'row',justifyContent:'space-between',alignItems:'baseline'}}><Text style={{color:theme.text,fontSize:22,fontWeight:'800'}}>{done} of {total} teams</Text><Text style={{color:theme.muted,fontSize:14}}>have a photo</Text></View>
   <View style={{height:8,borderRadius:4,backgroundColor:theme.panel,overflow:'hidden'}}><View style={{width:`${total?Math.round(done/total*100):0}%`,height:'100%',backgroundColor:theme.success}}/></View>
  </View>
  <View style={{flexDirection:'row',flexWrap:'wrap',gap:8}}>
   {teams.map(t=>{const has=covered.has(t.id),picked=target===t.id;return <Pressable key={t.id} accessibilityRole="button" accessibilityLabel={`Team ${t.displayNumber}${has?' has a photo':' needs a photo'}`} onPress={()=>setTarget(t.id)} style={{minHeight:44,paddingHorizontal:14,borderRadius:12,borderWidth:picked?2:1,borderColor:picked?theme.tint:has?theme.success:theme.line,backgroundColor:has?theme.surface:theme.panel,alignItems:'center',justifyContent:'center'}}><Text style={{color:has?theme.success:theme.text,fontWeight:'800',fontSize:15}}>{t.displayNumber}{has?' ✓':''}</Text></Pressable>})}
  </View>
  <Section title="Add photos" theme={theme}><PhotoSubmissionQueue initialTeamId={target}/></Section>
  {gallery.length?<Section title="Photos" theme={theme}>
   <View style={{flexDirection:'row',flexWrap:'wrap',gap:10}}>
    {gallery.map(p=><View key={p.id} style={{...cell,aspectRatio:1,borderRadius:12,overflow:'hidden',backgroundColor:theme.panel}}>
     {p.uri?<Image accessibilityLabel={`Robot photo, team ${number(p.team)}`} source={{uri:p.uri}} style={{width:'100%',height:'100%'}} resizeMode="cover"/>:<View style={{flex:1,alignItems:'center',justifyContent:'center'}}><Text style={{color:theme.muted,fontSize:12,textAlign:'center'}}>Reconnect to load</Text></View>}
     <View style={{position:'absolute',left:6,bottom:6,backgroundColor:'rgba(0,0,0,.7)',borderRadius:8,paddingHorizontal:8,paddingVertical:3}}><Text style={{color:'#fff',fontWeight:'800',fontSize:12}}>{number(p.team)}{p.status?` · ${p.status}`:''}</Text></View>
    </View>)}
   </View>
  </Section>:null}
 </Screen>;
}
