import React,{useState,useEffect} from 'react';
import {Text,View,Image,Platform} from 'react-native';
import {useRouter} from 'expo-router';
import {useApp} from '../src/core/context';
import {configured} from '../src/core/client';
import {signInWithGoogle} from '../src/core/auth-flows';
import {normalizedEmail,signupProfile,validatePassword} from '../src/core/auth-model';
import {Screen} from '../src/components/Screen';
import {Button,Input,Label} from '../src/components/ui';
export default function Login(){
 const {ready,viewer,bundle,theme,signIn,signUp,startDemo,completeExternalSignIn}=useApp();const router=useRouter();
 const [email,setEmail]=useState(''),[password,setPassword]=useState(''),[firstName,setFirstName]=useState(''),[lastName,setLastName]=useState('');
 const [register,setRegister]=useState(false),[busy,setBusy]=useState<string|null>(null),[message,setMessage]=useState(''),[success,setSuccess]=useState(false);
 useEffect(()=>{if(ready&&viewer&&bundle)router.replace('/(tabs)')},[ready,viewer?.userId,bundle?.event.id,router]);
 const run=async(name:string,action:()=>Promise<void>)=>{if(busy)return;setBusy(name);setMessage('');setSuccess(false);try{await action()}catch(e){setMessage((e as Error).message)}finally{setBusy(null)}};
 const login=()=>run(register?'Creating account…':'Signing in…',async()=>{const address=normalizedEmail(email);validatePassword(password);if(register){await signUp(address,password,signupProfile(firstName,lastName));setSuccess(true);setMessage('Check your inbox to confirm your account, then sign in. If you already have an account, sign in or reset your password.')}else{await signIn(address,password);router.replace('/(tabs)')}});
 return <Screen>
  <View style={{paddingTop:Platform.OS==='ios'?46:30,gap:14,paddingBottom:12}}><Image source={require('../assets/icon.png')} accessibilityLabel="StuyPulse" style={{width:60,height:60,borderRadius:14}}/><Text accessibilityRole="header" style={{color:theme.text,fontSize:38,fontWeight:'800',letterSpacing:-1}}>HAL9000</Text><Text style={{color:theme.text,fontSize:24,fontWeight:'600'}}>{register?'Join your scouting team.':'Ready for the next match.'}</Text><Label theme={theme} muted>Sign in and download your event. Your reports stay on this device when the venue goes offline.</Label></View>
  <Button title={busy==='Opening Google…'?busy:'Continue with Google'} theme={theme} secondary disabled={Boolean(busy)||!configured} onPress={()=>void run('Opening Google…',async()=>{if(await signInWithGoogle()){await completeExternalSignIn();router.replace('/(tabs)')}})}/>
  <View style={{flexDirection:'row',alignItems:'center',gap:12,marginVertical:8}}><View style={{height:1,backgroundColor:theme.line,flex:1}}/><Label theme={theme} muted>or use email</Label><View style={{height:1,backgroundColor:theme.line,flex:1}}/></View>
  {register&&<><Input label="First name" theme={theme} autoComplete="given-name" maxLength={40} value={firstName} onChangeText={setFirstName} editable={!busy}/><Input label="Last name" theme={theme} autoComplete="family-name" maxLength={60} value={lastName} onChangeText={setLastName} editable={!busy}/></>}
  <Input label="Email" theme={theme} autoCapitalize="none" autoCorrect={false} autoComplete="email" keyboardType="email-address" maxLength={254} value={email} onChangeText={setEmail} editable={!busy}/>
  <Input label="Password" theme={theme} secureTextEntry autoComplete={register?'new-password':'current-password'} maxLength={128} value={password} onChangeText={setPassword} editable={!busy} returnKeyType="go" onSubmitEditing={()=>{if(!busy)void login()}}/>
  {register&&<Label theme={theme} muted>Use 8–128 characters. Team access follows the same authorized-email rules as the website.</Label>}
  <Button title={busy&&busy!=='Opening Google…'?busy:register?'Create account':'Sign in'} theme={theme} disabled={Boolean(busy)||!configured||!email||!password||(register&&(!firstName.trim()||!lastName.trim()))} onPress={()=>void login()}/>
  {message&&<Text accessibilityRole="alert" accessibilityLiveRegion="polite" style={{color:success?theme.text:theme.danger,lineHeight:22}}>{message}</Text>}
  {!register&&<Button title="Forgot password?" theme={theme} secondary disabled={Boolean(busy)||!configured} onPress={()=>router.push({pathname:'/auth/request-reset',params:{email}})}/>}
  <Button title={register?'Already have an account? Sign in':'New to the team? Create an account'} theme={theme} secondary disabled={Boolean(busy)} onPress={()=>{setRegister(!register);setMessage('')}}/>
  {!configured&&<Label theme={theme} muted>Live sign-in is not configured in this build. You can still try the local practice workspace.</Label>}
  {configured&&<Label theme={theme} muted>Google and email links need this app’s redirects registered with the team’s authentication service. Native links require an installed HAL9000 build, not Expo Go.</Label>}
  <View style={{height:1,backgroundColor:theme.line,marginTop:14}}/>
  <Button title="Try local practice" theme={theme} secondary disabled={Boolean(busy)} onPress={()=>void run('Opening practice…',async()=>{await startDemo();router.replace('/(tabs)')})}/>
  <Label theme={theme} muted>Practice is separate from your team. Nothing is uploaded.</Label>
 </Screen>;
}
