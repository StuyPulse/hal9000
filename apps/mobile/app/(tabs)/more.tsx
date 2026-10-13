import React from 'react';
import {Pressable,Text,View} from 'react-native';
import {useRouter} from 'expo-router';
import {useApp} from '../../src/core/context';
import {Screen} from '../../src/components/Screen';

type Route=[label:string,path:string];
const groups:{title:string;routes:Route[];roles?:string[]}[]=[
 {title:'Review',routes:[['Submissions','/submissions'],['Outbox & sync','/outbox'],['Search','/search'],['Leaderboard','/leaderboard']]},
 {title:'Scouting',routes:[['Pit scouting','/pit'],['Pre scouting','/pre-scout'],['Photos & coverage','/photos'],['Global scouting document','/global']]},
 {title:'Strategy',routes:[['Compare teams','/strategy/compare'],['Shared picklist','/strategy/picklist'],['Match strategy','/strategy/strategy'],['Team directory','/teams']]},
 {title:'Master',routes:[['Scan scout QR','/scanner']],roles:['master','admin','developer']},
 {title:'Admin',routes:[['Event setup & members','/admin'],['Email access','/admin/email-access']],roles:['admin','developer']},
 {title:'Device',routes:[['Settings & event download','/settings']]},
];
export default function More(){
 const {theme,viewer}=useApp();const router=useRouter();
 return <Screen>
  <Text style={{color:theme.muted,fontSize:14}}>{viewer?.displayName} · {viewer?.role}</Text>
  {groups.filter(g=>!g.roles||g.roles.includes(viewer?.role??'')).map(group=><View key={group.title} style={{gap:6}}>
   <Text accessibilityRole="header" style={{color:theme.muted,fontSize:13,fontWeight:'700',letterSpacing:.6,textTransform:'uppercase'}}>{group.title}</Text>
   <View style={{backgroundColor:theme.surface,borderRadius:14,overflow:'hidden'}}>
    {group.routes.map(([label,path],index)=><Pressable key={path} accessibilityRole="button" accessibilityLabel={label} onPress={()=>router.push(path as never)} style={{minHeight:52,paddingHorizontal:16,flexDirection:'row',alignItems:'center',justifyContent:'space-between',borderTopWidth:index?1:0,borderTopColor:theme.line}}>
     <Text style={{color:theme.text,fontSize:17}}>{label}</Text>
     <Text style={{color:theme.muted,fontSize:22}}>›</Text>
    </Pressable>)}
   </View>
  </View>)}
 </Screen>;
}
