import {friendlyError} from '../../src/core/friendly-error';
import React,{useState} from 'react';
import {Text} from 'react-native';
import {Stack,useLocalSearchParams,useRouter} from 'expo-router';
import {useApp} from '../../src/core/context';
import {configured} from '../../src/core/client';
import {requestRecovery} from '../../src/core/auth-flows';
import {Screen} from '../../src/components/Screen';
import {Button,Input,Label} from '../../src/components/ui';
export default function RequestReset(){
 const {theme,online}=useApp(),router=useRouter(),params=useLocalSearchParams<{email?:string}>();
 const [email,setEmail]=useState(typeof params.email==='string'?params.email:''),[busy,setBusy]=useState(false),[sent,setSent]=useState(false),[error,setError]=useState('');
 const request=async()=>{if(busy)return;setBusy(true);setError('');try{await requestRecovery(email);setSent(true)}catch(e){setError(friendlyError(e))}finally{setBusy(false)}};
 return <Screen><Stack.Screen options={{title:'Reset password'}}/>
  <Text accessibilityRole="header" style={{fontSize:28,fontWeight:'700',color:theme.text,marginTop:20}}>Back into your account.</Text>
  <Label theme={theme} muted>Enter your email. Open the reset link on this phone.</Label>
  <Input label="Email" theme={theme} autoCapitalize="none" autoCorrect={false} autoComplete="email" keyboardType="email-address" maxLength={254} value={email} onChangeText={value=>{setEmail(value);setSent(false)}} editable={!busy}/>
  {sent?<Text accessibilityLiveRegion="polite" style={{color:theme.text,lineHeight:22}}>Check your inbox for a reset link.</Text>:<Button title={busy?'Sending reset link…':'Send reset link'} theme={theme} disabled={busy||!configured||!online||!email.trim()} onPress={()=>void request()}/>}
  {error&&<Text accessibilityRole="alert" style={{color:theme.danger}}>{error}</Text>}
  {!online&&<Label theme={theme} muted>Reset needs an internet connection.</Label>}
  <Button title="Back to sign in" theme={theme} secondary disabled={busy} onPress={()=>router.replace('/login')}/>
 </Screen>;
}
