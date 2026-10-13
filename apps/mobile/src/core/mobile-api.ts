import {requireClient} from './client';
import {MobileApiError,mobileApiMessage} from './api-errors';
export {MobileApiError} from './api-errors';
type Method='GET'|'POST'|'PATCH'|'DELETE';
export type MobileApiOptions={authenticated?:boolean;expectedUserId?:string;expectedOrganizationId?:string};
export async function apiRequest<T=unknown>(path:string,method:Method='GET',body?:unknown,options:MobileApiOptions={}):Promise<T>{
 if(!path.startsWith('/api/mobile/')||path.includes('://'))throw Error('Invalid mobile API path.');
 const base=new URL(process.env.EXPO_PUBLIC_WEB_URL??'https://hal9000.stuypulse.com');
 if(base.protocol!=='https:'&&!(base.protocol==='http:'&&['localhost','127.0.0.1'].includes(base.hostname)))throw Error('The mobile server must use HTTPS.');
 const headers:Record<string,string>={'Content-Type':'application/json'};
 if(options.authenticated!==false){const {data,error}=await requireClient().auth.getSession();if(error||!data.session)throw new MobileApiError(mobileApiMessage(401),401,'unauthorized');if(options.expectedUserId&&data.session.user.id!==options.expectedUserId)throw new MobileApiError('Your account changed. Reopen this screen before saving.',409,'account_changed');headers.Authorization=`Bearer ${data.session.access_token}`;if(options.expectedOrganizationId)headers['X-HAL9000-Organization']=options.expectedOrganizationId;}
 const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),15000);
 try{
  const response=await fetch(new URL(path,base).toString(),{method,headers,body:body===undefined?undefined:JSON.stringify(body),signal:controller.signal});
  if(response.redirected||!response.headers.get('content-type')?.includes('application/json'))throw new MobileApiError('The mobile server endpoint is not available on this deployment. Your local work is retained.',503,'mobile_api_unavailable');
  const parsed=await response.json().catch(()=>null) as any;
  if(!response.ok)throw new MobileApiError(mobileApiMessage(response.status,parsed?.error?.message??parsed?.error??parsed?.message),response.status,parsed?.error?.code??parsed?.code??'mobile_api_error');
  if(parsed===null)throw new MobileApiError('The mobile server returned an invalid response.',502,'invalid_response');
  return parsed as T;
 }catch(e){if(e instanceof MobileApiError)throw e;throw new MobileApiError('Cannot reach the mobile server. Check your connection; your local work is retained.',0,'network_error')}
 finally{clearTimeout(timer);}
}
export type MobileCapabilities={apiVersion:number;configured:boolean;operations:Record<string,boolean>;limitations:Record<string,string>};
export const getMobileCapabilities=()=>apiRequest<MobileCapabilities>('/api/mobile/capabilities','GET',undefined,{authenticated:false});
