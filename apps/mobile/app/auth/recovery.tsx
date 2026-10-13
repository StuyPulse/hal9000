import {friendlyError} from '../../src/core/friendly-error';
import React,{useEffect,useRef,useState} from 'react';
import {ActivityIndicator,Text,Platform} from 'react-native';
import * as Linking from 'expo-linking';
import {Stack,useRouter} from 'expo-router';
import {useApp} from '../../src/core/context';
import {completeAuthCallback,finishRecovery,recoveryAllowed} from '../../src/core/auth-flows';
import {Screen} from '../../src/components/Screen';
import {Button,Input,Label} from '../../src/components/ui';
export default function Recovery(){
 const {theme,signOut}=useApp(),router=useRouter(),link=Linking.useURL(),started=useRef(false),active=useRef(true);
 const [authorized,setAuthorized]=useState(false),[checking,setChecking]=useState(true),[password,setPassword]=useState(''),[confirmation,setConfirmation]=useState(''),[busy,setBusy]=useState(false),[error,setError]=useState(''),[done,setDone]=useState(false);
 useEffect(()=>{active.current=true;return()=>{active.current=false}},[]);
 useEffect(()=>{if(started.current)return;const url=Platform.OS==='web'?window.location.href:link;if(!url)return;started.current=true;void completeAuthCallback(url,'recovery').then(()=>recoveryAllowed()).then(allowed=>{if(!allowed)throw Error('Recovery has expired. Request a new reset link.');if(active.current)setAuthorized(true)}).catch(e=>{if(active.current)setError(friendlyError(e))}).finally(()=>{if(active.current)setChecking(false)})},[link]);
 const update=async()=>{if(busy)return;setBusy(true);setError('');try{await finishRecovery(password,confirmation);await signOut();if(!active.current)return;setPassword('');setConfirmation('');setAuthorized(false);setDone(true)}catch(e){if(active.current)setError(friendlyError(e))}finally{if(active.current)setBusy(false)}};
 return <Screen><Stack.Screen options={{title:'Choose a new password'}}/>
  {checking?<><ActivityIndicator color={theme.tint}/><Label theme={theme}>Verifying your reset link…</Label></>:done?<><Text accessibilityRole="header" style={{color:theme.text,fontSize:28,fontWeight:'700'}}>Password updated.</Text><Label theme={theme}>Password updated. Sign in again.</Label><Button title="Back to sign in" theme={theme} onPress={()=>router.replace('/login')}/></>:authorized?<>
   <Text accessibilityRole="header" style={{color:theme.text,fontSize:28,fontWeight:'700'}}>Make it yours again.</Text>
   <Input label="New password" theme={theme} secureTextEntry autoComplete="new-password" maxLength={128} value={password} onChangeText={setPassword} editable={!busy}/>
   <Input label="Confirm new password" theme={theme} secureTextEntry autoComplete="new-password" maxLength={128} value={confirmation} onChangeText={setConfirmation} editable={!busy}/>
   <Button title={busy?'Updating password…':'Update password'} theme={theme} disabled={busy||!password||!confirmation} onPress={()=>void update()}/>
  </>:<Label theme={theme} muted>Open the reset link from your email.</Label>}
  {error&&<Text accessibilityRole="alert" style={{color:theme.danger,lineHeight:22}}>{error}</Text>}
  {!checking&&!done&&<Button title="Request another reset link" theme={theme} secondary disabled={busy} onPress={()=>router.replace('/auth/request-reset')}/>}
 </Screen>;
}
