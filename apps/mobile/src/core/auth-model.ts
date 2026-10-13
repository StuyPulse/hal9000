export type AuthPurpose = 'signin' | 'recovery';
export const NATIVE_CALLBACK = 'hal9000://auth/callback';
export const NATIVE_RECOVERY = 'hal9000://auth/recovery';

// PKCE codes alone are accepted. Tokens in a deep link are never installed as a
// session: the SDK must prove possession of this device's stored verifier.
export function parseAuthCallback(raw: string, purpose: AuthPurpose, webOrigin?: string): {code:string;flowId?:string} {
 let url:URL;
 try {url=new URL(raw)} catch {throw Error('This sign-in link is not valid. Request a new link.');}
 const native=purpose==='recovery'?NATIVE_RECOVERY:NATIVE_CALLBACK;
 const expected=new URL(webOrigin?`${webOrigin}/auth/${purpose==='recovery'?'recovery':'callback'}`:native);
 if(url.protocol!==expected.protocol||url.host!==expected.host||url.pathname!==expected.pathname||url.username||url.password)throw Error('This link is not a HAL9000 authentication callback.');
 const query=url.searchParams,fragment=new URLSearchParams(url.hash.slice(1));
 for(const key of ['code','sb_flow_id','access_token','refresh_token','error','error_description','error_code','type']) {
  if(query.getAll(key).length+fragment.getAll(key).length>1)throw Error('This link contains conflicting authentication values. Request a new link.');
 }
 if(['error','error_code','error_description'].some(key=>query.has(key)||fragment.has(key)))throw Error('Sign-in was not completed. Try again or request a new email link.');
 if(query.has('access_token')||fragment.has('access_token')||query.has('refresh_token')||fragment.has('refresh_token'))throw Error('This link uses an unsupported sign-in format. Request a new link from this device.');
 const code=query.get('code')??fragment.get('code');
 if(!code||code.length>2048||/\s/.test(code))throw Error('This link is missing a valid authentication code. Request a new link from this device.');
 const flowId=query.get('sb_flow_id')??fragment.get('sb_flow_id');
 if(flowId!==null&&!/^[a-zA-Z0-9_-]{8,64}$/.test(flowId))throw Error('This link has an invalid sign-in flow. Request a new link.');
 return flowId?{code,flowId}:{code};
}

export function normalizedEmail(value:string) {
 const email=value.trim().toLowerCase();
 if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)||email.length>254)throw Error('Enter a valid email address.');
 return email;
}
export function validatePassword(password:string,confirmation?:string) {
 if(password.length<8||password.length>128)throw Error('Use a password with 8–128 characters.');
 if(confirmation!==undefined&&password!==confirmation)throw Error('The passwords do not match.');
}
export function signupProfile(firstName:string,lastName:string) {
 const first=firstName.trim(),last=lastName.trim();
 if(!first||first.length>40||!last||last.length>60)throw Error('Enter your first name (up to 40 characters) and last name (up to 60 characters).');
 return {firstName:first,lastName:last};
}

export class RecoveryPermit {
 private userId:string|null=null;
 private expires=0;
 grant(event:string,userId:string|null,now=Date.now()) {
  if(event!=='PASSWORD_RECOVERY'||!userId)return false;
  this.userId=userId;this.expires=now+10*60*1000;return true;
 }
 allows(userId:string|null,now=Date.now()) {return Boolean(userId&&userId===this.userId&&now<this.expires);}
 clear(){this.userId=null;this.expires=0;}
}
