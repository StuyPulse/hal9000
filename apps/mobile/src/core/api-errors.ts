export class MobileApiError extends Error {
 constructor(message:string,readonly status:number,readonly code:string='mobile_api_error'){super(message);this.name='MobileApiError';}
}
export function mobileApiMessage(status:number,message?:string){if(status===404||status===503)return 'This mobile server feature has not been deployed yet. Your local work is retained.';if(status===401)return 'Sign in again before using this server feature. Your local work is retained.';if(status===409)return message||'This record changed on another device. Refresh before retrying; your local copy is retained.';return message||'The server could not complete this change. Your local work is retained.';}
