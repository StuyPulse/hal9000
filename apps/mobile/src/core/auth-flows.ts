import {Platform} from 'react-native';
import * as WebBrowser from 'expo-web-browser';
import {requireClient} from './client';
import {NATIVE_CALLBACK,NATIVE_RECOVERY,normalizedEmail,parseAuthCallback,RecoveryPermit,validatePassword,type AuthPurpose} from './auth-model';

WebBrowser.maybeCompleteAuthSession();
const recoveryPermit=new RecoveryPermit();
const callbacks=new Map<string,Promise<'signin'|'recovery'>>();
let observesSession=false;
function observeSession() {
 if(observesSession)return;observesSession=true;
 requireClient().auth.onAuthStateChange(event=>{
  if(event==='SIGNED_OUT'||event==='SIGNED_IN')recoveryPermit.clear();
 });
}
export function authRedirect(purpose:AuthPurpose) {
 return Platform.OS==='web'?`${window.location.origin}/auth/${purpose==='recovery'?'recovery':'callback'}`:purpose==='recovery'?NATIVE_RECOVERY:NATIVE_CALLBACK;
}
export async function completeAuthCallback(url:string,purpose:AuthPurpose):Promise<'signin'|'recovery'> {
 observeSession();
 const {code,flowId}=parseAuthCallback(url,purpose,Platform.OS==='web'?window.location.origin:undefined);
 const callbackKey=`${purpose}:${flowId??''}:${code}`;
 const existing=callbacks.get(callbackKey);if(existing)return existing;
 const pending=(async()=>{
  const auth=requireClient().auth;let recoveryUser:string|null=null;
  // Keep this callback synchronous: invoking another auth method inside the
  // listener can deadlock the SDK's session lock.
  const {data:listener}=auth.onAuthStateChange((event,session)=>{
   if(event==='PASSWORD_RECOVERY')recoveryUser=session?.user.id??null;
  });
  try {
   const {data,error}=await auth.exchangeCodeForSession(code,flowId?{flowId}:undefined);
   if(error)throw Error('This link expired or was opened on a different device. Request a new link here.');
   if(!data.session)throw Error('Sign-in did not return a session. Try again.');
   if(purpose==='recovery') {
    if(!recoveryPermit.grant(recoveryUser?'PASSWORD_RECOVERY':'SIGNED_IN',recoveryUser)||!recoveryPermit.allows(data.session.user.id))throw Error('This is not a password-recovery link. Request a new reset email from this device.');
    return 'recovery' as const;
   }
   // A recovery code must not accidentally activate the normal app shell.
   if(recoveryUser)throw Error('Open the password-reset link to finish recovery.');
   return 'signin' as const;
  } finally {listener.subscription.unsubscribe();}
 })();
 callbacks.set(callbackKey,pending);
 // Deduplicate browser completion and Router's deep-link delivery; bound memory
 // and do not persist raw codes anywhere.
 setTimeout(()=>callbacks.delete(callbackKey),60_000);
 return pending;
}
export async function signInWithGoogle() {
 recoveryPermit.clear();
 const redirectTo=authRedirect('signin');
 const {data,error}=await requireClient().auth.signInWithOAuth({provider:'google',options:{redirectTo,skipBrowserRedirect:true}});
 if(error)throw error;if(!data.url)throw Error('Google sign-in could not start. Please try again.');
 const result=await WebBrowser.openAuthSessionAsync(data.url,redirectTo);
 if(result.type!=='success')return false;
 await completeAuthCallback(result.url,'signin');return true;
}
export async function requestRecovery(email:string) {
 recoveryPermit.clear();
 const {error}=await requireClient().auth.resetPasswordForEmail(normalizedEmail(email),{redirectTo:authRedirect('recovery')});
 if(error)throw error;
}
export async function recoveryAllowed() {
 const {data,error}=await requireClient().auth.getSession();
 return !error&&recoveryPermit.allows(data.session?.user.id??null);
}
export async function finishRecovery(password:string,confirmation:string) {
 validatePassword(password,confirmation);
 if(!await recoveryAllowed())throw Error('Recovery has expired. Request another reset link.');
 const {error}=await requireClient().auth.updateUser({password});if(error)throw error;
 recoveryPermit.clear();
}
