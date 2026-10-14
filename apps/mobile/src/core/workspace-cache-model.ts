import type {Event,EventBundle} from './types';
export type WorkspaceMode='active'|'review';
export type CacheStore={get<T>(scope:string,kind:string,id:string):Promise<T|null>;put(scope:string,kind:string,id:string,value:unknown):Promise<void>};
export function chooseWorkspaceEvent(events:Event[],previousId:string|undefined,mode:WorkspaceMode){return mode==='review'?events.find(e=>e.id===previousId):events.find(e=>e.status==='active');}
/** Opening downloaded data never awaits a network promise. Remote refresh is
 * explicitly background work; its rejection cannot undo the displayed cache. */
export async function openDownloadedEvent(options:{cached:EventBundle|null;online:boolean;display:(bundle:EventBundle)=>Promise<void>;fetch:()=>Promise<EventBundle>;current:()=>boolean;retain:(bundle:EventBundle)=>Promise<void>;failed:(error:unknown)=>void}){
 const apply=async(bundle:EventBundle)=>{if(options.current())await options.display(bundle);else await options.retain(bundle)};
 if(options.cached)await apply(options.cached);
 if(!options.online){if(!options.cached)throw Error('This event has not been downloaded yet. Connect once to download it.');return;}
 const refresh=()=>options.fetch().then(apply);
 if(options.cached)void refresh().catch(options.failed);else await refresh();
}
export function createWorkspaceCache(store:CacheStore){return {
 events:(scope:string)=>store.get<Event[]>(scope,'meta','events'),
 saveEvents:(scope:string,events:Event[])=>store.put(scope,'meta','events',events),
 async bundle(scope:string,eventId?:string){if(eventId){const saved=await store.get<EventBundle>(scope,'event-bundle',eventId);if(saved)return saved;}const legacy=await store.get<EventBundle>(scope,'meta','bundle');return !eventId||legacy?.event.id===eventId?legacy:null;},
 async saveBundle(bundle:EventBundle,selected=true){await store.put(bundle.scope,'event-bundle',bundle.event.id,bundle);if(selected){await store.put(bundle.scope,'meta','bundle',bundle);await store.put(bundle.scope,'meta','event',bundle.event.id);}},
 };}
