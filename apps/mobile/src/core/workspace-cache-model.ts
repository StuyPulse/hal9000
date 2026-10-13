import type {Event,EventBundle} from './types';
export type WorkspaceMode='active'|'review';
export type CacheStore={get<T>(scope:string,kind:string,id:string):Promise<T|null>;put(scope:string,kind:string,id:string,value:unknown):Promise<void>};
export function chooseWorkspaceEvent(events:Event[],previousId:string|undefined,mode:WorkspaceMode){return mode==='review'?events.find(e=>e.id===previousId):events.find(e=>e.status==='active');}
export function createWorkspaceCache(store:CacheStore){return {
 events:(scope:string)=>store.get<Event[]>(scope,'meta','events'),
 saveEvents:(scope:string,events:Event[])=>store.put(scope,'meta','events',events),
 async bundle(scope:string,eventId?:string){if(eventId){const saved=await store.get<EventBundle>(scope,'event-bundle',eventId);if(saved)return saved;}const legacy=await store.get<EventBundle>(scope,'meta','bundle');return !eventId||legacy?.event.id===eventId?legacy:null;},
 async saveBundle(bundle:EventBundle,selected=true){await store.put(bundle.scope,'event-bundle',bundle.event.id,bundle);if(selected){await store.put(bundle.scope,'meta','bundle',bundle);await store.put(bundle.scope,'meta','event',bundle.event.id);}},
 };}
