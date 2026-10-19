import React,{createContext,useContext,useState,useEffect,useRef,useCallback} from 'react';
import {Appearance,AppState} from 'react-native';
import NetInfo from '@react-native-community/netinfo';
import * as Crypto from 'expo-crypto';
import {client,requireClient} from './client';
import {putValue,getValue,listRecords,listPhotos,acknowledgeStored,failStored,removeValue,removeCachedViewer} from './storage';
import {loadViewer,loadEvents,loadBundle,uploadSnapshot,emptyRebuilt,writePicklist,writePicklistBulk,MembershipPendingError,type PicklistRow} from './data';
import {DEMO_VIEWER,demoBundle} from './demo';
import {scopedIdentity,updateLocal,reusableDraft,shouldUpload} from './sync-model';
import {canEditReport,seedServerEdit} from './report-editing';
import {stagePhoto,uploadPhoto} from './photos';
import {queuePhotoSelection} from './photo-selection-model';
import {safetyQueue} from './safety-sync';
import {drawingQueue,overlayPendingDrawings} from './strategy-sync';
import {authRedirect} from './auth-flows';
import {apiRequest} from './mobile-api';
import {serializeWrite,excludeSync} from './write-coordination';
import {canonicalJson,validateSignedProof,type SignedRelayProof} from '@wildcard/shared/src/relay-contract';
import {normalizeNativePayload,validateNativeEntry} from '@wildcard/shared/src/native-contracts';
import {workspaceCache} from './workspace-cache';
import {cacheEventPhotos} from './photo-cache';
import {overlayPendingPicklist,flushPendingPicklist} from './picklist-sync';
import {rememberConfirmedReport} from './report-overlay';
import {normalizeGoogleDocumentUrl,GOOGLE_DOCUMENT_ERROR} from './document-link';
import {friendlyError} from './friendly-error';
import {chooseWorkspaceEvent,openDownloadedEvent,type WorkspaceMode} from './workspace-cache-model';
import type {FeatureContext,Viewer,EventBundle,Event,LocalSubmission,LocalPhoto,Payload,EntryKind,Palette,PicklistRanking,NativeEntry} from './types';

export type AppContextValue=FeatureContext&{ready:boolean;membershipPending:boolean;events:Event[];appearance:'light'|'dark'|'system';setAppearance:(v:'light'|'dark'|'system')=>void;signIn:(email:string,password:string)=>Promise<void>;signUp:(email:string,password:string,profile?:{firstName:string;lastName:string})=>Promise<void>;completeExternalSignIn:()=>Promise<void>;startDemo:()=>Promise<void>;signOut:()=>Promise<void>;selectEvent:(id:string)=>Promise<void>;dismissError:()=>void;receiveEntry:(entry:NativeEntry,revision:number,proof?:SignedRelayProof)=>Promise<void>;deleteLocalDraft:(id:string)=>Promise<void>;saveGlobalDocument:(url:string)=>Promise<void>;claimReport:(id:string)=>Promise<LocalSubmission>;updatePractice:(next:EventBundle)=>Promise<void>;deleteReport:(id:string)=>Promise<void>;saveManualIdentity:(id:string,teamId:string,metadata:{stage:string;label:string|null;alliance:'red'|'blue'})=>Promise<void>};
const Context=createContext<AppContextValue|null>(null);
export const useApp=()=>{const c=useContext(Context);if(!c)throw Error('AppProvider missing');return c};
const dark:Palette={bg:'#10151d',surface:'#1b222d',panel:'#202b3a',text:'#f2f5fa',muted:'#a2adbd',line:'#303947',tint:'#b9cbff',onTint:'#15284d',selection:'#253653',success:'#84d8a8',warning:'#f0c377',danger:'#ff9caa',red:'#ff9daa',blue:'#9fbfff',dark:true};
const light:Palette={bg:'#f8f9fb',surface:'#fff',panel:'#eef2f7',text:'#171d28',muted:'#626e7e',line:'#dce2e9',tint:'#244bc1',onTint:'#fff',selection:'#e6edff',success:'#237443',warning:'#895214',danger:'#ac2038',red:'#a92438',blue:'#24589f',dark:false};
export function AppProvider({children}:{children:React.ReactNode}){
 const [ready,setReady]=useState(false),[viewer,setViewer]=useState<Viewer|null>(null),[bundle,setBundle]=useState<EventBundle|null>(null),[events,setEvents]=useState<Event[]>([]),[records,setRecords]=useState<LocalSubmission[]>([]),[photos,setPhotos]=useState<LocalPhoto[]>([]),[online,setOnline]=useState(true),[syncing,setSyncing]=useState(false),[error,setErrorRaw]=useState<string|null>(null),[appearance,setAppearanceState]=useState<'light'|'dark'|'system'>('system'),[systemDark,setSystemDark]=useState(Appearance.getColorScheme()==='dark');
 const setError=useCallback((message:string|null)=>setErrorRaw(message===null?null:friendlyError(message)),[]);
 const writeChain=useRef(Promise.resolve()),syncLock=useRef(false),scopeRef=useRef<string|null>(null);
 const autosaveTimer=useRef<ReturnType<typeof setTimeout>|null>(null);
 const [workspaceMode,setWorkspaceMode]=useState<WorkspaceMode>('active'),[membershipPending,setMembershipPending]=useState(false);
 const modeRef=useRef<WorkspaceMode>('active'),eventRef=useRef<string|undefined>(undefined),eventEpoch=useRef(0),connectionRef=useRef(true),refreshLock=useRef(false);
 connectionRef.current=online;
 const scope=viewer?scopedIdentity(viewer.userId,viewer.organizationId,viewer.demo):null;
 scopeRef.current=scope;
 const theme=appearance==='dark'||appearance==='system'&&systemDark?dark:light;
 const exclusiveReportMutation=<T,>(operation:()=>Promise<T>)=>excludeSync(syncLock,operation);
 const serializeLocalWrite=<T,>(operation:()=>Promise<T>)=>serializeWrite(writeChain,operation);
 const reloadLocal=useCallback(async()=>{if(!scope){setRecords([]);setPhotos([]);return}const [r,p]=await Promise.all([listRecords(scope),listPhotos(scope)]);if(scopeRef.current===scope){setRecords(r.sort((a,b)=>b.changedAt.localeCompare(a.changedAt)));setPhotos(p)}},[scope]);
 const saveBundle=useCallback(async(incoming:EventBundle)=>{const next=await overlayPendingPicklist(await overlayPendingDrawings(incoming));await workspaceCache.saveBundle(next);if(scopeRef.current===next.scope){eventRef.current=next.event.id;setBundle(next)}},[]);
 const activate=useCallback(async(v:Viewer)=>{
  const s=scopedIdentity(v.userId,v.organizationId,v.demo);scopeRef.current=s;
  setViewer(v);setMembershipPending(false);setBundle(null);setRecords([]);setPhotos([]);setEvents([]);setSyncing(false);eventEpoch.current++;
  await putValue('device','meta','viewer',v);
  const [cached,localRecords,localPhotos,eventRows,mode]=await Promise.all([workspaceCache.bundle(s),listRecords(s),listPhotos(s),workspaceCache.events(s),getValue<WorkspaceMode>(s,'meta','workspace-mode')]);if(scopeRef.current!==s)return;
  modeRef.current=mode??'active';setWorkspaceMode(modeRef.current);
  setRecords(localRecords.sort((a,b)=>b.changedAt.localeCompare(a.changedAt)));setPhotos(localPhotos);
  setEvents(eventRows??(cached?[cached.event]:[]));
  if(cached){eventRef.current=cached.event.id;await saveBundle(cached)}else eventRef.current=undefined;
  if(v.demo){const b={...(cached??demoBundle()),profiles:{...cached?.profiles,[v.userId]:v.displayName}};await saveBundle(b);if(scopeRef.current===s)setEvents([b.event]);}
 },[saveBundle]);
 const refreshOnline=useCallback(async(v:Viewer)=>{
  if(v.demo||!connectionRef.current||refreshLock.current)return;
  refreshLock.current=true;const epoch=eventEpoch.current;
  try{
   const fresh=await loadViewer(v.organizationId);if(fresh.userId!==v.userId||fresh.organizationId!==v.organizationId)throw Error('Your online account or organization changed. Sign in to that workspace before syncing.');
   const s=scopedIdentity(v.userId,v.organizationId);if(scopeRef.current!==s)return;
   setViewer(fresh);await putValue('device','meta','viewer',fresh);
   const eventRows=await loadEvents(fresh);if(scopeRef.current!==s)return;
   await workspaceCache.saveEvents(s,eventRows);setEvents(eventRows);
   const chosen=chooseWorkspaceEvent(eventRows,eventRef.current,modeRef.current);
   if(!chosen){if(epoch===eventEpoch.current){setBundle(null);eventRef.current=undefined;}return;}
   const cached=await workspaceCache.bundle(s,chosen.id);
   if(cached&&epoch===eventEpoch.current)await saveBundle({...cached,event:chosen});
   const next=await loadBundle(fresh,chosen,cached);
   if(scopeRef.current!==s)return;
   if(epoch===eventEpoch.current){await saveBundle(next);setError(null);}else await workspaceCache.saveBundle(next,false);
   void cacheEventPhotos(next,()=>scopeRef.current===s&&connectionRef.current).then(async cachedPhotos=>{
    const latest=await workspaceCache.bundle(s,next.event.id);
    if(!latest||latest.downloadedAt!==next.downloadedAt)return;
    const withPhotos={...latest,photos:cachedPhotos.photos};
    if(scopeRef.current===s&&eventRef.current===next.event.id)await saveBundle(withPhotos);else await workspaceCache.saveBundle(withPhotos,false);
   }).catch(()=>{});
  }catch(e){if(e instanceof MembershipPendingError&&scopeRef.current===scopedIdentity(v.userId,v.organizationId,v.demo)){
   // Only an authoritative membership denial closes the workspace. Network
   // failures still retain offline access; unsent rows are never destroyed.
   scopeRef.current=null;eventEpoch.current++;setMembershipPending(true);setViewer(null);setBundle(null);setRecords([]);setPhotos([]);setEvents([]);setSyncing(false);
   await removeCachedViewer(v.userId,v.organizationId);
  }throw e;}
  finally{refreshLock.current=false;}
 },[saveBundle]);
 const backgroundRefresh=useRef<(v:Viewer)=>Promise<void>>(refreshOnline);backgroundRefresh.current=refreshOnline;
 useEffect(()=>{
  let active=true;
  Promise.all([getValue<Viewer>('device','meta','viewer'),getValue<'light'|'dark'|'system'>('device','meta','appearance')]).then(async([cached,mode])=>{
   if(!active)return;
   if(mode)setAppearanceState(mode);
   if(cached)await activate(cached);
   if(active)setReady(true);
   // Cache is already interactive before reachability/Auth/network is consulted.
   if(cached&&!cached.demo)void NetInfo.fetch().then(connection=>{if(!active)return;const connected=connection.isConnected!==false&&connection.isInternetReachable!==false;connectionRef.current=connected;setOnline(connected);if(connected)return backgroundRefresh.current(cached)}).catch(e=>{if(active)setError('Using downloaded data. '+e.message)});
  }).catch(e=>setError(e.message)).finally(()=>{if(active)setReady(true)});
  return()=>{active=false};
 },[]);
 const wasOnline=useRef(true);
 useEffect(()=>NetInfo.addEventListener(s=>{const connected=s.isConnected!==false&&s.isInternetReachable!==false;connectionRef.current=connected;setOnline(connected)}),[]);
 // Reconnect: upload local work (sync effect) AND promptly refresh membership, assignments and reports.
 useEffect(()=>{
  const reconnected=online&&!wasOnline.current;wasOnline.current=online;
  if(reconnected&&ready&&viewer&&!viewer.demo)void backgroundRefresh.current(viewer).catch(e=>setError(e instanceof Error?e.message:'Could not refresh after reconnecting.'));
 },[online]);
 useEffect(()=>{const sub=Appearance.addChangeListener(({colorScheme})=>setSystemDark(colorScheme==='dark'));return()=>sub.remove()},[]);
 useEffect(()=>{void reloadLocal()},[reloadLocal]);
 const sync=useCallback(async()=>{
  if(!scope||!viewer||!online||viewer.demo||syncLock.current)return;
  syncLock.current=true;setSyncing(true);let failures=0;
  try{
   const queued=(await listRecords(scope)).filter(shouldUpload);
   for(const snapshot of queued){
    if(scopeRef.current!==scope||!connectionRef.current)break;
    try{const serverTime=await uploadSnapshot(snapshot,viewer.userId);await serializeLocalWrite(async()=>{
     const cached=await workspaceCache.bundle(scope,snapshot.entry.event_id);
     if(cached){const next=rememberConfirmedReport(cached,snapshot.entry,serverTime);if(scopeRef.current===scope&&eventRef.current===next.event.id)await saveBundle(next);else await workspaceCache.saveBundle(next,false);}
     await acknowledgeStored(scope,snapshot.entry.id,snapshot.revision,serverTime);
    })}
    catch(e){failures++;const message=snapshot.origin==='relay'?'Received copy is safe locally. The server may not authorize this account to upload another scout’s report. '+(e as Error).message:(e as Error).message;await serializeLocalWrite(()=>failStored(scope,snapshot.entry.id,snapshot.revision,message))}
   }
   for(const photo of (await listPhotos(scope)).filter(p=>p.status!=='synced')){
    if(scopeRef.current!==scope||!connectionRef.current)break;
    try{await uploadPhoto(photo,viewer.userId);await putValue(scope,'photo',photo.id,{...photo,status:'synced',error:null})}
    catch(e){failures++;await putValue(scope,'photo',photo.id,{...photo,status:'failed',error:(e as Error).message})}
   }
   await safetyQueue(scope).flush(()=>scopeRef.current===scope&&connectionRef.current);
   const safetyPending=(await safetyQueue(scope).list()).some(row=>row.status==='pending');
   const drawings=await drawingQueue(scope).flush(()=>scopeRef.current===scope&&connectionRef.current);
   if(drawings.error&&scopeRef.current===scope)setError('Strategy drawing: '+drawings.error);
   const rankings=await flushPendingPicklist(scope,()=>scopeRef.current===scope&&connectionRef.current);
   if(rankings.error&&scopeRef.current===scope)setError(rankings.error);
   await reloadLocal();
   if(!failures&&!safetyPending&&!drawings.error&&!rankings.error&&connectionRef.current){await putValue(scope,'meta','last-sync',{at:Date.now()});void backgroundRefresh.current(viewer).catch(e=>setError(e.message));}
  }catch(e){if(scopeRef.current===scope)setError((e as Error).message)}
  finally{syncLock.current=false;if(scopeRef.current===scope)setSyncing(false)}
 },[scope,viewer?.userId,viewer?.role,viewer?.demo,online,reloadLocal,saveBundle]);
 const syncRef=useRef(sync);syncRef.current=sync;
 useEffect(()=>()=>{if(autosaveTimer.current)clearTimeout(autosaveTimer.current);autosaveTimer.current=null},[scope]);
 const scheduleDraftSync=()=>{if(autosaveTimer.current)clearTimeout(autosaveTimer.current);const capturedScope=scope;autosaveTimer.current=setTimeout(()=>{autosaveTimer.current=null;if(scopeRef.current===capturedScope)void syncRef.current()},1500)};
 useEffect(()=>{if(ready&&online)void sync();const timer=setInterval(()=>void sync(),30000);const subscription=AppState.addEventListener('change',state=>{if(state==='active')void sync()});return()=>{clearInterval(timer);subscription.remove()}},[ready,online,sync]);
 const enterWorkspace=async()=>{try{const v=await loadViewer();await activate(v);void backgroundRefresh.current(v).catch(e=>setError(e.message));}catch(e){if(e instanceof MembershipPendingError){setMembershipPending(true);return}throw e}};
 const signIn=async(email:string,password:string)=>{const {error:signError}=await requireClient().auth.signInWithPassword({email:email.trim(),password});if(signError)throw signError;await enterWorkspace()};
 const signUp=async(email:string,password:string,profile?:{firstName:string;lastName:string})=>{const first=profile?.firstName.trim()??'',last=profile?.lastName.trim()??'';const {error:signError}=await requireClient().auth.signUp({email:email.trim(),password,options:{emailRedirectTo:authRedirect('signin'),data:{first_name:first,last_name:last,display_name:[first,last].filter(Boolean).join(' ')}}});if(signError)throw signError;};
 const completeExternalSignIn=enterWorkspace;
 const refresh=async()=>{await reloadLocal();if(viewer&&!viewer.demo&&connectionRef.current)await refreshOnline(viewer)};
 const refreshRef=useRef(refresh);refreshRef.current=refresh;
 useEffect(()=>{
  if(!client||!ready||!online||!viewer||viewer.demo||!bundle)return;
  const eventId=bundle.event.id,organizationId=viewer.organizationId;
  let active=true,timer:ReturnType<typeof setTimeout>|undefined,loading=false;
  const schedule=()=>{if(timer)clearTimeout(timer);timer=setTimeout(()=>{if(!active||loading||scopeRef.current!==scope)return;loading=true;void refreshRef.current().catch(e=>{if(active&&scopeRef.current===scope)setError(e.message)}).finally(()=>{loading=false})},500)};
  let channel=client.channel(`native-event-${eventId}-${viewer.userId}`);
  for(const table of ['scouting_entries','pit_photos','shared_picklist_rankings','event_global_documents','match_report_sources','event_teams'])channel=channel.on('postgres_changes',{event:'*',schema:'public',table,filter:`event_id=eq.${eventId}`},schedule);
  for(const table of ['picklist_categories','picklist_tags'])channel=channel.on('postgres_changes',{event:'*',schema:'public',table,filter:`organization_id=eq.${organizationId}`},schedule);
  channel.subscribe();
  const poll=setInterval(schedule,60000),foreground=AppState.addEventListener('change',state=>{if(state==='active')schedule()});
  return()=>{active=false;if(timer)clearTimeout(timer);clearInterval(poll);foreground.remove();void client?.removeChannel(channel)};
 },[ready,online,viewer?.userId,viewer?.demo,bundle?.event.id,scope]);
 const selectEvent=async(id:string)=>{
  if(!viewer||!scope)return;const event=events.find(e=>e.id===id);if(!event)throw Error('Event not available');
  const cached=await workspaceCache.bundle(scope,id);if(scopeRef.current!==scope)return;
  if(!cached&&!connectionRef.current)throw Error('This event has not been downloaded yet. Connect once to download it.');
  const epoch=++eventEpoch.current;eventRef.current=id;const mode:WorkspaceMode=event.status==='active'?'active':'review';modeRef.current=mode;setWorkspaceMode(mode);await putValue(scope,'meta','workspace-mode',mode);
  await openDownloadedEvent({cached:cached?{...cached,event}:null,online:!viewer.demo&&connectionRef.current,display:saveBundle,fetch:()=>loadBundle(viewer,event,cached),current:()=>scopeRef.current===scope&&epoch===eventEpoch.current,retain:next=>workspaceCache.saveBundle(next,false),failed:e=>{if(scopeRef.current===scope)setError('Using downloaded event data. '+(e as Error).message)}});
 };
 const createDraft=async(kind:EntryKind,teamId:string,matchId:string|null=null,assignmentId:string|null=null,payload?:Payload)=>{
  if(!scope||!viewer||!bundle)throw Error('Select a downloaded event first.');
  if(!bundle.teams.some(t=>t.id===teamId))throw Error('Choose a team in this event.');
  if(matchId&&!bundle.matches.some(m=>m.id===matchId&&[...m.red_teams,...m.blue_teams].includes(teamId)))throw Error('The team must belong to the selected event match.');
  const initialPayload=payload??(kind==='match'?emptyRebuilt():{});
  const operation=writeChain.current.then(async()=>{
   if(scopeRef.current!==scope)throw Error('The signed-in account changed. Reopen this report.');
   const saved=await listRecords(scope);
   if(scopeRef.current!==scope)throw Error('The signed-in account changed. Reopen this report.');
   const existing=saved.find(r=>reusableDraft(r,{eventId:bundle.event.id,kind,teamId,matchId,payload:initialPayload}));
   if(existing)return existing;
   const record:LocalSubmission={entry:{id:Crypto.randomUUID(),organization_id:viewer.organizationId,event_id:bundle.event.id,team_id:teamId,match_id:matchId,assignment_id:assignmentId,scout_user_id:viewer.userId,entry_type:kind,form_version:kind==='match'?4:2,payload:initialPayload,status:'draft',submitted_at:null},revision:1,acknowledgedRevision:null,status:'draft',error:null,origin:'own',baseUpdatedAt:null,changedAt:new Date().toISOString()};
   if(scopeRef.current!==scope)throw Error('The signed-in account changed. Reopen this report.');
   await putValue(scope,'entry',record.entry.id,record);await reloadLocal();return record;
  });
  writeChain.current=operation.then(()=>{},()=>{});
  const result=await operation;scheduleDraftSync();return result;
 };
 const claimReport=async(id:string)=>{
  if(!scope||!viewer||!bundle)throw Error('Select an event');
  const operation=writeChain.current.then(async()=>{
   const local=await getValue<LocalSubmission>(scope,'entry',id);
   if(local){if(!canEditReport(viewer,local.entry,local))throw Error('Your role cannot edit this report.');return local}
   const entry=bundle.entries.find(e=>e.id===id&&e.event_id===bundle.event.id);
   if(!entry)throw Error('Refresh this event to download the report.');
   const seeded=seedServerEdit(viewer,entry);
   await putValue(scope,'entry',id,seeded);
   await reloadLocal();
   return seeded;
  });
  writeChain.current=operation.then(()=>{},()=>{});
  return operation;
 };
 const saveDraft=async(id:string,payload:Payload,finalize=false)=>{if(!scope||!viewer)throw Error('Sign in first');const operation=writeChain.current.then(async()=>{if(scopeRef.current!==scope)throw Error('The signed-in account changed. Reopen this report.');const current=await getValue<LocalSubmission>(scope,'entry',id);if(!current)throw Error('Local draft unavailable');if(!canEditReport(viewer,current.entry,current))throw Error('This report is read-only for your role. Your saved copy is retained.');if(scopeRef.current!==scope)throw Error('The signed-in account changed. Reopen this report.');const next=updateLocal(current,normalizeNativePayload(current.entry.entry_type,payload),finalize);if(finalize)validateNativeEntry(next.entry);await putValue(scope,'entry',id,next);await reloadLocal();});writeChain.current=operation.catch(()=>{});await operation;if(finalize){if(autosaveTimer.current)clearTimeout(autosaveTimer.current);autosaveTimer.current=null;if(scopeRef.current===scope)void syncRef.current()}else scheduleDraftSync()};
 const addPhoto=async(teamId:string,uri:string,selectionId?:string)=>{if(!viewer||!bundle||!scope)throw Error('Select an event');await serializeLocalWrite(async()=>{
  if(scopeRef.current!==scope)throw Error('Your account changed. Reopen the photo chooser.');
  // Keep the selection UUID: retrying a failed staging cleanup must not upload a duplicate.
  await queuePhotoSelection({event_id:bundle.event.id,organization_id:viewer.organizationId,uploaded_by:viewer.userId,team_id:teamId},{
   read:()=>selectionId?getValue<LocalPhoto>(scope,'photo',selectionId):Promise.resolve(null),
   stage:()=>stagePhoto(viewer,bundle,uri,teamId,selectionId),
   write:photo=>putValue(scope,'photo',photo.id,photo),
  });
 });await reloadLocal();if(scopeRef.current===scope)void sync()};
 const signOut=async()=>{setMembershipPending(false);scopeRef.current=null;setViewer(null);setBundle(null);setRecords([]);setPhotos([]);setEvents([]);setSyncing(false);await removeValue('device','meta','viewer');await client?.auth.signOut({scope:'local'});};
 const updatePractice=async(next:EventBundle)=>{if(!viewer?.demo||!scope||next.scope!==scope)throw Error('This operation is only available in local practice.');await saveBundle(next);setEvents([next.event]);};
 const receiveEntry=async(entry:NativeEntry,revision:number,proof?:SignedRelayProof)=>{if(!viewer||!bundle||!scope)throw Error('Select an event');if(!['master','admin','developer'].includes(viewer.role))throw Error('Master access is required');if(entry.organization_id!==viewer.organizationId||entry.event_id!==bundle.event.id)throw Error('QR belongs to a different organization/event.');if(!bundle.teams.some(t=>t.id===entry.team_id))throw Error('QR team is not in the downloaded event.');if(entry.match_id&&!bundle.matches.some(m=>m.id===entry.match_id&&[...m.red_teams,...m.blue_teams].includes(entry.team_id)))throw Error('QR match/team does not belong to this event.');if(proof&&canonicalJson(validateSignedProof(proof).envelope.entry)!==canonicalJson(entry))throw Error('The signed proof does not match this report.');const old=await getValue<LocalSubmission>(scope,'entry',entry.id);if(old?.origin==='own')throw Error('This device already has its own copy. A QR receipt cannot overwrite it.');if(old&&old.revision>revision)return;if(old&&old.revision===revision&&!proof)return;await putValue(scope,'entry',entry.id,{entry,revision,proof,acknowledgedRevision:null,status:'received',origin:'relay',error:proof?null:'Unsigned backup: enable signed relay on the original scout device and re-export before cloud delivery.',baseUpdatedAt:null,changedAt:new Date().toISOString()} satisfies LocalSubmission);await reloadLocal();};
 const deleteLocalDraft=async(id:string)=>serializeLocalWrite(()=>exclusiveReportMutation(async()=>{if(!scope||!viewer)return;const r=await getValue<LocalSubmission>(scope,'entry',id);if(r?.entry.status!=='draft')throw Error('Only unsubmitted drafts can be removed.');if(!viewer.demo&&r.baseUpdatedAt){if(!online)throw Error('This draft is backed up to the server. Connect before deleting it.');await apiRequest('/api/mobile/reports','DELETE',{entryId:id,eventId:r.entry.event_id,expectedUpdatedAt:r.baseUpdatedAt},{expectedUserId:viewer.userId,expectedOrganizationId:viewer.organizationId});}if(scopeRef.current!==scope)return;await removeValue(scope,'entry',id);await reloadLocal()}));
 const saveManualIdentity=async(id:string,teamId:string,metadata:{stage:string;label:string|null;alliance:'red'|'blue'})=>{
  if(!viewer||!bundle||!scope)throw Error('Select an event.');
  const operation=writeChain.current.then(()=>exclusiveReportMutation(async()=>{
   if(scopeRef.current!==scope)throw Error('Your account changed. Reopen the report.');
   const local=await getValue<LocalSubmission>(scope,'entry',id),before=local?.entry??bundle.entries.find(e=>e.id===id);
   if(!before||before.entry_type!=='match'||!before.payload.manual_match||before.status!=='submitted'||local?.origin==='relay'||(!['admin','developer'].includes(viewer.role)&&before.scout_user_id!==viewer.userId))throw Error('Only the original scout or an administrator can correct this manual report.');
   if(!bundle.teams.some(t=>t.id===teamId))throw Error('Choose a team in this event.');
   if(metadata.stage!=='Other / exception'&&!(metadata.label??'').trim())throw Error('Enter the match number or label, for example 3 or 2–1.');if((metadata.label??'').length>30)throw Error('Use 30 characters or fewer for the match label.');
   const payload={...before.payload,manual_match:metadata,report_source:'manual'};
   const pending=local??seedServerEdit(viewer,before),revision=pending.revision+1;
   let saved:NativeEntry={...before,team_id:teamId,match_id:null,payload};
   const intentId=`manual-${id}`;
   await putValue(scope,'intent',intentId,{entryId:id,teamId,payload,createdAt:new Date().toISOString()});
   if(!viewer.demo){
    if(!online)throw Error('Changing a submitted report’s match identity requires a connection. Your correction intent is retained.');
    const timestamp=local?.baseUpdatedAt??before.updated_at;if(!timestamp)throw Error('Upload this report before correcting its match identity.');
    const result=await apiRequest<{entry:NativeEntry}>('/api/mobile/manual-report','PATCH',{entryId:id,eventId:before.event_id,teamId,payload,expectedUpdatedAt:timestamp},{expectedUserId:viewer.userId,expectedOrganizationId:viewer.organizationId});saved=result.entry;
   }
   await putValue(scope,'entry',id,{...pending,entry:saved,revision,acknowledgedRevision:viewer.demo?null:revision,baseUpdatedAt:saved.updated_at??null,status:viewer.demo?'pending':'synced',error:null,changedAt:new Date().toISOString()} satisfies LocalSubmission);
   await removeValue(scope,'intent',intentId);
   if(scopeRef.current===scope){await saveBundle({...bundle,entries:bundle.entries.map(e=>e.id===id?saved:e)});await reloadLocal();}
  }));
  writeChain.current=operation.then(()=>{},()=>{});await operation;
 };
 const deleteReport=async(id:string)=>serializeLocalWrite(()=>exclusiveReportMutation(async()=>{
  if(!viewer||!bundle||!scope)throw Error('Select an event');
  const local=await getValue<LocalSubmission>(scope,'entry',id),entry=local?.entry??bundle.entries.find(e=>e.id===id);
  if(!entry||entry.organization_id!==viewer.organizationId||local?.origin==='relay'||(!['admin','developer'].includes(viewer.role)&&entry.scout_user_id!==viewer.userId))throw Error('Your account cannot delete this report.');
  if(!viewer.demo){if(!online)throw Error('Server report deletion needs a connection.');const timestamp=local?.baseUpdatedAt??entry.updated_at;if(!timestamp)throw Error('Sync or refresh this report before deleting it.');const result=await apiRequest<{warning?:string}>('/api/mobile/reports','DELETE',{entryId:id,eventId:entry.event_id,expectedUpdatedAt:timestamp},{expectedUserId:viewer.userId,expectedOrganizationId:viewer.organizationId});if(scopeRef.current!==scope)return;if(result.warning)setError(result.warning);}
  await removeValue(scope,'entry',id);await saveBundle({...bundle,entries:bundle.entries.filter(e=>e.id!==id)});await reloadLocal();
 }));
 const saveReportSource=async(teamId:string,matchKey:string,entryId:string|null)=>{
  if(!viewer||!bundle||!scope)throw Error('Select an event');if(viewer.role!=='admin')throw Error('Only administrators can choose report sources.');
  if(!bundle.teams.some(t=>t.id===teamId))throw Error('Team not in this event.');
  if(entryId&&!bundle.entries.some(e=>e.id===entryId&&e.team_id===teamId&&e.event_id===bundle.event.id&&e.entry_type==='match'&&e.status==='submitted'))throw Error('Select a submitted report for this event team.');
  const intent={organization_id:viewer.organizationId,event_id:bundle.event.id,team_id:teamId,match_key:matchKey,selected_entry_id:entryId};
  await putValue(scope,'shared-intent',`source:${teamId}:${matchKey}`,intent);
  if(!viewer.demo){if(!online)throw Error('Choosing a shared report source requires internet.');const {data,error}=await requireClient().from('match_report_sources').upsert(intent,{onConflict:'event_id,team_id,match_key'}).select('team_id');if(error)throw error;if(!data?.length)throw Error('The server did not change this report source.');await refresh()}
  else await saveBundle({...bundle,reportSources:[...bundle.reportSources.filter(r=>r.team_id!==teamId||r.match_key!==matchKey),{team_id:teamId,match_key:matchKey,selected_entry_id:entryId}]});
  await removeValue(scope,'shared-intent',`source:${teamId}:${matchKey}`);
 };
 const savePicklistRankings=async(patches:{teamId:string;patch:Partial<PicklistRanking>}[])=>{
  if(!viewer||!bundle||!scope)throw Error('Select an event');if(!patches.length)return;
  const {picklistQueue}=await import('./picklist-sync');const queue=picklistQueue(scope);
  await queue.save(viewer,bundle,patches); // SQLite before any request; captures the owner, event and changed-field baselines.
  if(scopeRef.current!==scope)return;
  await saveBundle(await queue.overlay(bundle));
  if(viewer.demo||!online)return;
  const result=await queue.flush(()=>scopeRef.current===scope&&connectionRef.current);
  if(scopeRef.current!==scope)return;
  if(result.error){setError(result.error);return;} // Durable local success, with a visible retained-upload error.
  await refresh();
 };
 const savePicklistRanking=(teamId:string,patch:Partial<PicklistRanking>)=>savePicklistRankings([{teamId,patch}]);
 const saveGlobalDocument=async(url:string)=>{if(!viewer||!bundle)throw Error('Select an event');if(!['admin','strategist','developer'].includes(viewer.role))throw Error('Your role cannot change the global document');const normalized=normalizeGoogleDocumentUrl(url);if(!normalized)throw Error(GOOGLE_DOCUMENT_ERROR);url=normalized;if(!viewer.demo){const {error:writeError}=await requireClient().from('event_global_documents').upsert({event_id:bundle.event.id,organization_id:viewer.organizationId,document_url:url,updated_by:viewer.userId},{onConflict:'event_id'});if(writeError)throw writeError;}await saveBundle({...bundle,globalDocument:url})};

 const saveStrategyDrawing=async(strokes:unknown)=>{
  if(!viewer||!bundle||!scope)throw Error('Select an event');
  if(!Array.isArray(strokes)||JSON.stringify(strokes).length>300000)throw Error('Invalid or oversized drawing.');
  if(viewer.demo){await saveBundle({...bundle,strategyDrawings:[{id:bundle.strategyDrawings?.find(d=>d.user_id===viewer.userId)?.id??Crypto.randomUUID(),user_id:viewer.userId,strokes}]});return}
  // Local first: the drawing is queued on this device (one revision per save) before any network call.
  await drawingQueue(scope).save({organization_id:viewer.organizationId,event_id:bundle.event.id,user_id:viewer.userId},strokes);
  await saveBundle(bundle);
  if(online){const result=await drawingQueue(scope).flush(()=>scopeRef.current===scope);if(result.error)setError('Strategy drawing saved on this device and will upload when the connection allows. '+result.error)}
 };
 const savePicklistMeta=async(kind:'category'|'tag',patch:{id?:string;name:string;color:string;sort_order:number})=>{
  if(!viewer||!bundle)throw Error('Select an event');
  if(!['admin','developer','global_scout','strategist','master'].includes(viewer.role))throw Error('Role cannot edit tiers/tags.');
  const key=kind==='category'?'categories':'tags',table=kind==='category'?'picklist_categories':'picklist_tags',label=kind==='category'?'tier':'tag';
  const name=String(patch.name??'').trim().slice(0,48),color=String(patch.color??'').trim().toLowerCase();
  const order=Number.isFinite(patch.sort_order)?Math.max(0,Math.trunc(patch.sort_order)):0;
  if(!name)throw Error('Enter a name.');
  if(!/^#[0-9a-f]{6}$/.test(color))throw Error('Choose a valid color.');
  if(patch.id&&!/^[0-9a-f-]{36}$/i.test(patch.id))throw Error('Invalid '+label+' id.');
  const existing=patch.id?bundle[key].find(v=>v.id===patch.id):undefined;
  if(patch.id&&!existing)throw Error('That '+label+' is no longer available. Refresh and try again.');
  if(bundle[key].some(v=>v.id!==patch.id&&v.name.trim().toLowerCase()===name.toLowerCase()))throw Error('A '+label+' named "'+name+'" already exists.');
  const fields={name,color,sort_order:order};
  if(viewer.demo){const id=patch.id??Crypto.randomUUID();await saveBundle({...bundle,[key]:[...bundle[key].filter(v=>v.id!==id),{id,...fields}]});return}
  if(!online)throw Error('Shared tier/tag changes need internet.');
  const c=requireClient();
  if(existing){
   // Update only the editable fields so created_by (which governs who may delete a tier) is never rewritten.
   const {data,error:writeError}=await c.from(table).update(fields).eq('id',existing.id).eq('organization_id',viewer.organizationId).select('id');
   if(writeError)throw writeError;
   if(!data||!data.length)throw Error('The server did not change that '+label+'. It may have been removed, or your account may not be allowed to edit it.');
  }else{
   const {data,error:writeError}=await c.from(table).insert({id:Crypto.randomUUID(),organization_id:viewer.organizationId,created_by:viewer.userId,...fields}).select('id');
   if(writeError)throw writeError;
   if(!data||!data.length)throw Error('The server did not create that '+label+'.');
  }
  await refresh();
 };
 const deletePicklistMeta=async(kind:'category'|'tag',id:string)=>{
  if(!viewer||!bundle)throw Error('Select an event');
  if(!['admin','developer','global_scout','strategist','master'].includes(viewer.role))throw Error('Role cannot edit tiers/tags.');
  const key=kind==='category'?'categories':'tags',label=kind==='category'?'tier':'tag';
  if(!bundle[key].some(v=>v.id===id))throw Error('That '+label+' is not in this organization.');
  if(viewer.demo){await saveBundle({...bundle,[key]:bundle[key].filter(v=>v.id!==id)});return}
  if(!online)throw Error('Shared tier/tag changes need internet.');
  const {data,error:deleteError}=await requireClient().from(kind==='category'?'picklist_categories':'picklist_tags').delete().eq('id',id).eq('organization_id',viewer.organizationId).select('id');
  if(deleteError)throw deleteError;
  // A row-level-security refusal deletes nothing and reports no error, so confirm a row really went away.
  if(!data||!data.length)throw Error(kind==='category'?'The server did not remove that tier. Only the person who created it, or an admin or global scout, can delete it.':'The server did not remove that tag.');
  await refresh();
 };
 const saveRobotProfile=async(teamId:string,profile:{drivetrain_type:string|null;shooter_type:string|null})=>{
  if(!viewer||!bundle)throw Error('Select an event');
  if(!bundle.teams.some(t=>t.id===teamId))throw Error('Team not in this event.');
  const drivetrains=['Swerve','Tank'],shooters=['Single Turret','Single Fixed Shooter','Double Wide Shooter','Dumper','No Shooter','Triple Wide Shooter','Dual Fixed Shooters','Double Turret'];
  const clean=(value:unknown,allowed:string[],label:string)=>{if(value===null||value===undefined||value==='')return null;if(typeof value!=='string'||!allowed.includes(value))throw Error('Choose a valid '+label+'.');return value};
  const next={drivetrain_type:clean(profile.drivetrain_type,drivetrains,'drivetrain'),shooter_type:clean(profile.shooter_type,shooters,'shooter')};
  if(!viewer.demo){
   if(!online)throw Error('Robot profile changes need internet.');
   if(['admin','developer'].includes(viewer.role)){const {data,error:writeError}=await requireClient().from('event_teams').update(next).eq('event_id',bundle.event.id).eq('team_id',teamId).select('team_id');if(writeError)throw writeError;if(!data?.length)throw Error('The server did not change the robot profile.');}
   else await apiRequest('/api/mobile/robot-profile','PATCH',{eventId:bundle.event.id,teamId,...next},{expectedUserId:viewer.userId,expectedOrganizationId:viewer.organizationId});
  }
  await saveBundle({...bundle,robotProfiles:{...bundle.robotProfiles,[teamId]:next}});
 };

 return <Context.Provider value={{ready,membershipPending,viewer,bundle,events,records,photos,theme,online,syncing,error,appearance,setAppearance:v=>{setAppearanceState(v);void putValue('device','meta','appearance',v)},signIn,signUp,completeExternalSignIn,startDemo:()=>activate(DEMO_VIEWER),signOut,selectEvent,dismissError:()=>setError(null),createDraft,saveDraft,claimReport,deleteReport,saveManualIdentity,updatePractice,sync,refresh,addPhoto,receiveEntry,deleteLocalDraft,savePicklistRanking,savePicklistRankings,saveGlobalDocument,saveStrategyDrawing,savePicklistMeta,deletePicklistMeta,saveRobotProfile,saveReportSource}}>{children}</Context.Provider>
}
