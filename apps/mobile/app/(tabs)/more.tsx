import React from 'react';
import {useRouter} from 'expo-router';
import {useApp} from '../../src/core/context';
import {Screen} from '../../src/components/Screen';
import {Row,Label,Section} from '../../src/components/ui';
const groups:{title:string;routes:[string,string,string?][]}[]=[
 {title:'Find & review',routes:[['Search downloaded event','/search','Teams, matches and report text · works offline'],['Scouting leaderboard','/leaderboard','Match, pit and prescout contributions']]},
 {title:'Scouting',routes:[['Pit scouting','/pit'],['Pre scouting','/pre-scout'],['Photos & coverage','/photos'],['Global scouting document','/global']]},
 {title:'Strategy',routes:[['Teams & summary','/strategy/summary'],['Team comparison','/strategy/compare'],['Shared picklist','/strategy/picklist'],['Match strategy','/strategy/strategy']]},
 {title:'Device & access',routes:[['Settings & event download','/settings','Offline readiness, delivery and signed relay'],['Email access manager','/admin/email-access','Designated managers only · independent of admin role']]},
];
export default function More(){
 const {theme,viewer}=useApp();const router=useRouter();
 return <Screen>
  <Label theme={theme} muted>{viewer?.displayName} · {viewer?.role}</Label>
  {groups.map(group=><Section key={group.title} title={group.title} theme={theme}>{group.routes.map(([label,route,subtitle])=><Row key={route} title={label} subtitle={subtitle} theme={theme} onPress={()=>router.push(route as never)}/>)}</Section>)}
  {['master','admin','developer'].includes(viewer?.role??'')&&<Section title="Master relay" theme={theme}><Row title="Scan scout QR" subtitle="Receipts save locally before cloud delivery" theme={theme} onPress={()=>router.push('/scanner')}/></Section>}
  {['admin','developer'].includes(viewer?.role??'')&&<Section title="Organization setup" theme={theme}><Row title="Native setup tools" subtitle="Events, members, assignments and versioned forms" theme={theme} onPress={()=>router.push('/admin')}/></Section>}
 </Screen>;
}
