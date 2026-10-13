import 'react-native-url-polyfill/auto';
import {createClient, type SupabaseClient} from '@supabase/supabase-js';
import * as SecureStore from 'expo-secure-store';
import {AppState,Platform} from 'react-native';

const url=process.env.EXPO_PUBLIC_SUPABASE_URL;
const key=process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
const storage={getItem:(name:string)=>Platform.OS==='web'?Promise.resolve(localStorage.getItem(name)):SecureStore.getItemAsync(name),setItem:(name:string,value:string)=>Platform.OS==='web'?Promise.resolve(localStorage.setItem(name,value)):SecureStore.setItemAsync(name,value),removeItem:(name:string)=>Platform.OS==='web'?Promise.resolve(localStorage.removeItem(name)):SecureStore.deleteItemAsync(name)};
const timedFetch:typeof fetch=async(input,init)=>{const controller=new AbortController();const abort=()=>controller.abort();if(init?.signal?.aborted)controller.abort();else init?.signal?.addEventListener('abort',abort,{once:true});const timer=setTimeout(abort,8000);try{return await fetch(input,{...init,signal:controller.signal})}finally{clearTimeout(timer);init?.signal?.removeEventListener('abort',abort)}};
export const configured=Boolean(url&&key);
// Several current tables are absent from the generated website types. Queries
// below use explicit domain contracts while the server's RLS remains authority.
// This SDK version coordinates refreshes internally; its old custom processLock
// opt-in is deprecated and can generate acquisition-timeout loops on refresh.
export const client:SupabaseClient|null=url&&key?createClient(url,key,{global:{fetch:timedFetch},auth:{storage,autoRefreshToken:true,persistSession:true,detectSessionInUrl:false,flowType:'pkce'}}):null;
const lifecycle=Platform.OS!=='web'?AppState.addEventListener('change',state=>{if(state==='active')client?.auth.startAutoRefresh();else client?.auth.stopAutoRefresh()}):null;
if(typeof module!=='undefined')(module as unknown as {hot?:{dispose:(callback:()=>void)=>void}}).hot?.dispose(()=>{lifecycle?.remove();client?.auth.stopAutoRefresh()});
export function requireClient(){if(!client)throw Error('Configure the publishable Supabase URL/key in apps/mobile/.env.local to connect your account.');return client;}
