import {friendlyError} from '../../src/core/friendly-error';
import React,{useEffect,useRef,useState} from 'react';
import {ActivityIndicator,Text,Platform} from 'react-native';
import * as Linking from 'expo-linking';
import {Stack,useRouter} from 'expo-router';
import {useApp} from '../../src/core/context';
import {completeAuthCallback} from '../../src/core/auth-flows';
import {Screen} from '../../src/components/Screen';
import {Button,Label} from '../../src/components/ui';
export default function AuthCallback(){
 const {theme,completeExternalSignIn}=useApp(),router=useRouter(),link=Linking.useURL(),started=useRef(false),active=useRef(true);const [error,setError]=useState('');
 useEffect(()=>{active.current=true;return()=>{active.current=false}},[]);
 useEffect(()=>{if(started.current)return;const url=Platform.OS==='web'?window.location.href:link;if(!url)return;started.current=true;void completeAuthCallback(url,'signin').then(()=>{if(active.current)return completeExternalSignIn()}).then(()=>{if(active.current)router.replace('/(tabs)')}).catch(e=>{if(active.current)setError(friendlyError(e))})},[link,completeExternalSignIn,router]);
 return <Screen><Stack.Screen options={{title:'Confirm sign-in'}}/>{error?<><Text accessibilityRole="alert" style={{color:theme.danger,lineHeight:22}}>{error}</Text><Button title="Back to sign in" theme={theme} onPress={()=>router.replace('/login')}/></>:<><ActivityIndicator color={theme.tint}/><Label theme={theme}>Confirming your account…</Label><Button title="Cancel" theme={theme} secondary onPress={()=>router.replace('/login')}/></>}</Screen>;
}
