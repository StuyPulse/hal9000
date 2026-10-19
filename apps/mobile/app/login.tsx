import {friendlyError} from '../src/core/friendly-error';
import React,{useState,useEffect} from 'react';
import { View, Image, Linking, Pressable } from 'react-native';
import { Text } from '../src/components/AppText';
import {useRouter} from 'expo-router';
import {useApp} from '../src/core/context';
import {configured} from '../src/core/client';
import {signInWithGoogle} from '../src/core/auth-flows';
import {normalizedEmail,signupProfile,validatePassword} from '../src/core/auth-model';
import {Screen} from '../src/components/Screen';
import {Button,Input,Label} from '../src/components/ui';
import {useLayout} from '../src/components/layout';
export default function Login(){
 const {ready,viewer,bundle,theme,signIn,signUp,startDemo,completeExternalSignIn,membershipPending,signOut}=useApp();const router=useRouter();
 const {compactHeight,largeText}=useLayout();
 const [email,setEmail]=useState(''),[password,setPassword]=useState(''),[firstName,setFirstName]=useState(''),[lastName,setLastName]=useState('');
 const [register,setRegister]=useState(false),[busy,setBusy]=useState<string|null>(null),[message,setMessage]=useState(''),[success,setSuccess]=useState(false);
 useEffect(()=>{if(ready&&viewer&&bundle)router.replace('/(tabs)')},[ready,viewer?.userId,bundle?.event.id,router]);
 const run=async(name:string,action:()=>Promise<void>)=>{if(busy)return;setBusy(name);setMessage('');setSuccess(false);try{await action()}catch(e){setMessage(friendlyError(e))}finally{setBusy(null)}};
 const login=()=>run(register?'Creating account…':'Signing in…',async()=>{const address=normalizedEmail(email);validatePassword(password);if(register){await signUp(address,password,signupProfile(firstName,lastName));setSuccess(true);setMessage('Check your inbox to confirm, then sign in.')}else{await signIn(address,password);router.replace('/(tabs)')}});
 if(membershipPending)return <Screen topInset>
  <View style={{paddingTop:compactHeight?0:16,gap:14}}>
   <Text accessibilityRole="header" style={{color:theme.text,fontSize:28,fontWeight:'800'}}>Waiting for access</Text>
   <Label theme={theme}>You're signed in, but an admin still needs to add you.</Label>
   {message?<Label theme={theme} muted>{message}</Label>:null}
   <Button title={busy?'Checking…':'Check again'} theme={theme} disabled={Boolean(busy)} onPress={()=>void run('Checking…',completeExternalSignIn)}/>
   <Button title="Sign out" secondary theme={theme} onPress={()=>void signOut()}/>
  </View>
 </Screen>;
 const primary=<Button title={busy&&busy!=='Opening Google…'?busy:register?'Create account':'Sign in'} theme={theme} disabled={Boolean(busy)||!configured||!email||!password||(register&&(!firstName.trim()||!lastName.trim()))} onPress={()=>void login()}/>;
 const link=(url:string,label:string)=><Pressable accessibilityRole="link" accessibilityLabel={label} onPress={()=>void Linking.openURL(url).catch(()=>setMessage('Could not open the page.'))} style={{minWidth:48,minHeight:48,padding:8,justifyContent:'center'}}><Text style={{color:theme.muted,fontSize:14}}>{label}</Text></Pressable>;
 return <Screen topInset>
  <View style={{flexDirection:'row',alignItems:'center',gap:12,paddingTop:compactHeight?0:16}}><Image source={require('../assets/icon.png')} accessibilityLabel="HAL9000" style={{width:44,height:44,borderRadius:11}}/><Text accessibilityRole="header" style={{color:theme.text,fontSize:30,fontWeight:'800',letterSpacing:-.8,flexShrink:1}}>{register?'Create account':'HAL9000'}</Text></View>
  {register&&<><Input label="First name" theme={theme} autoComplete="given-name" maxLength={40} value={firstName} onChangeText={setFirstName} editable={!busy}/><Input label="Last name" theme={theme} autoComplete="family-name" maxLength={60} value={lastName} onChangeText={setLastName} editable={!busy}/></>}
  <Input label="Email" theme={theme} autoCapitalize="none" autoCorrect={false} autoComplete="email" keyboardType="email-address" maxLength={254} value={email} onChangeText={setEmail} editable={!busy}/>
  <Input label="Password" theme={theme} secureTextEntry autoComplete={register?'new-password':'current-password'} maxLength={128} value={password} onChangeText={setPassword} editable={!busy} returnKeyType="go" onSubmitEditing={()=>{if(!busy)void login()}}/>
  {primary}
  {message&&<Text accessibilityRole="alert" accessibilityLiveRegion="polite" style={{color:success?theme.text:theme.danger,lineHeight:22}}>{message}</Text>}
  {!configured&&<Label theme={theme} muted>Sign-in isn't configured in this build.</Label>}
  <View style={{flexDirection:largeText?'column':'row',gap:8}}>
   {!register&&<Button title="Forgot password?" theme={theme} secondary style={{flex:1}} disabled={Boolean(busy)||!configured} onPress={()=>router.push({pathname:'/auth/request-reset',params:{email}})}/>}
   <Button title={register?'I have an account':'Create account'} theme={theme} secondary style={{flex:1}} disabled={Boolean(busy)} onPress={()=>{setRegister(!register);setMessage('')}}/>
  </View>
  <Button title={busy==='Opening Google…'?busy:'Continue with Google'} theme={theme} secondary disabled={Boolean(busy)||!configured} onPress={()=>void run('Opening Google…',async()=>{if(await signInWithGoogle()){await completeExternalSignIn();router.replace('/(tabs)')}})}/>
  <Button title="Try local practice" theme={theme} secondary disabled={Boolean(busy)} onPress={()=>void run('Opening practice…',async()=>{await startDemo();router.replace('/(tabs)')})}/>
  <View style={{flexDirection:'row',gap:20,justifyContent:'center'}}>{link('https://hal9000.stuypulse.com/terms','Terms')}{link('https://hal9000.stuypulse.com/privacy','Privacy')}</View>
 </Screen>;
}
