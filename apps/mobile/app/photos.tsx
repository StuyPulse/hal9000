import React from 'react';
import {Image,Text} from 'react-native';
import {useApp} from '../src/core/context';
import {Screen} from '../src/components/Screen';
import {Card,Label,Section} from '../src/components/ui';
import {PhotoSubmissionQueue} from '../src/components/PhotoSubmissionQueue';
export default function Photos(){
 const {bundle,photos,theme}=useApp();
 if(!bundle)return <Screen><Label theme={theme}>Download an event first.</Label></Screen>;
 const local=photos.filter(p=>p.event_id===bundle.event.id);
 const cloudCoverage=new Set(bundle.photos.map(p=>p.team_id));
 return <Screen><Section title="Update pit photos" theme={theme}><PhotoSubmissionQueue/></Section>
  <Section title="Cloud photo coverage" theme={theme}><Label theme={theme}>{cloudCoverage.size} of {bundle.teams.length} teams have an uploaded photo.</Label>{bundle.teams.filter(t=>!cloudCoverage.has(t.id)).map(t=><Label key={t.id} theme={theme}>{t.displayNumber} · {t.name} · needs cloud photo</Label>)}</Section>
  <Section title="Submitted photo queue" theme={theme}>{local.map(p=><Card key={p.id} theme={theme}><Image source={{uri:p.localUri}} accessibilityLabel="Submitted robot photo" style={{height:220,width:'100%',resizeMode:'contain'}}/><Label theme={theme}>{bundle.teams.find(t=>t.id===p.team_id)?.displayNumber} · {p.status}</Label>{p.error&&<Text style={{color:theme.danger}}>{p.error}</Text>}</Card>)}</Section>
  <Section title="Cloud photos" theme={theme}>{bundle.photos.map(p=><Card key={p.id} theme={theme}><Label theme={theme}>{bundle.teams.find(t=>t.id===p.team_id)?.displayNumber}</Label>{p.signedUrl?<Image source={{uri:p.signedUrl}} accessibilityLabel="Cloud robot photo" style={{height:220,width:'100%',resizeMode:'contain'}}/>:<Label theme={theme}>Connect and refresh to load this photo.</Label>}</Card>)}</Section>
 </Screen>;
}
