// Mirrors apps/web/src/app/scout/global/actions.ts (googleDocumentUrl).
export const GOOGLE_DOCUMENT_ERROR='Use a Google Docs, Sheets, or Slides share link.';
export function normalizeGoogleDocumentUrl(input:string):string|null{
 const value=input.trim();
 if(!value||value.length>2048)return null;
 let url:URL;
 try{url=new URL(value)}catch{return null}
 const ok=url.protocol==='https:'&&url.hostname==='docs.google.com'&&/^\/(document|spreadsheets|presentation)\/(?:u\/\d+\/)?d\/[A-Za-z0-9_-]+(?:\/|$)/.test(url.pathname);
 return ok?value:null;
}
