import React from 'react';
import { View } from 'react-native';
import { Text } from '../../src/components/AppText';
import {useRouter} from 'expo-router';
import {useApp} from '../../src/core/context';
import {Screen} from '../../src/components/Screen';
import {AppIcon,GroupLabel,List,ListRow} from '../../src/components/ui';
import {canOpenEmailAccess} from '../../src/core/setup-model';
import type {Viewer} from '../../src/core/types';

type Route=[label:string,path:string,icon:string,show?:(viewer:Viewer|null)=>boolean];
const setupRole=(viewer:Viewer|null)=>!!viewer&&['admin','developer'].includes(viewer.role);
const groups:{title:string;routes:Route[];roles?:string[]}[]=[
 {title:'Reports',routes:[['Submissions','/submissions','list'],['Outbox','/outbox','outbox'],['Search','/search','search'],['Leaderboard','/leaderboard','trophy']]},
 {title:'Scouting',routes:[['Pit scouting','/pit','team'],['Pre-scouting','/pre-scout','camera'],['Photos and coverage','/photos','images'],['Global scouting','/global','document']]},
 {title:'Strategy',routes:[['Compare teams','/strategy/compare','swap'],['Picklist','/strategy/picklist','clipboard'],['Match strategy','/strategy/strategy','flag'],['Teams','/teams','team']]},
 {title:'QR handoff',routes:[['Scan reports','/scanner','scan']],roles:['master','admin','developer','strategist']},
 // Email access follows the server's can_manage_email_access check, not the admin role.
 {title:'Admin',routes:[['Event setup','/admin','shield',setupRole],['Email access','/admin/email-access','mail',canOpenEmailAccess]]},
 {title:'Device',routes:[['Settings and event download','/settings','settings']]},
];
export default function More(){
 const {theme,viewer}=useApp();const router=useRouter();
 const row=([label,path,icon]:Route)=><ListRow key={path} theme={theme} title={label} lead={<AppIcon name={icon} color={theme.muted} size={20}/>} onPress={()=>router.push(path as never)}/>;
 return <Screen>
  <List theme={theme}>
   <ListRow theme={theme} title={viewer?.displayName??'Signed in'} detail={viewer?.role?`${viewer.role[0].toUpperCase()+viewer.role.slice(1)} · Settings`:'Settings'} lead={<View style={{width:40,height:40,borderRadius:20,backgroundColor:theme.graphite,alignItems:'center',justifyContent:'center'}}><Text style={{color:'#fff',fontSize:17,fontWeight:'800'}}>{(viewer?.displayName??'?').trim()[0]?.toUpperCase()}</Text></View>} accessibilityLabel="Settings" onPress={()=>router.push('/settings')}/>
  </List>
  {groups.filter(g=>!g.roles||g.roles.includes(viewer?.role??'')).map(group=>({...group,routes:group.routes.filter(([,,,show])=>!show||show(viewer))})).filter(group=>group.routes.length).map(group=><View key={group.title} style={{gap:8}}>
   <GroupLabel theme={theme}>{group.title}</GroupLabel>
   <List theme={theme}>{group.routes.map(row)}</List>
  </View>)}
 </Screen>;
}
