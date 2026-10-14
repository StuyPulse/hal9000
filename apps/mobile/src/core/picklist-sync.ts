import { getValue, listValues, putValue, removeValue } from './storage';
import { createPicklistQueue, type PicklistBatch } from './picklist-queue';
import { uploadPicklistBatch } from './data';
import type { EventBundle } from './types';

const queues = new Map<string, ReturnType<typeof createPicklistQueue>>();
export function picklistQueue(scope: string) {
 let queue=queues.get(scope);
 if(!queue){queue=createPicklistQueue({get:id=>getValue<PicklistBatch>(scope,'picklist-queue',id),put:(id,value)=>putValue(scope,'picklist-queue',id,value),remove:id=>removeValue(scope,'picklist-queue',id),list:()=>listValues<PicklistBatch>(scope,'picklist-queue')},uploadPicklistBatch);queues.set(scope,queue);}
 return queue;
}
export const overlayPendingPicklist = (bundle: EventBundle) => picklistQueue(bundle.scope).overlay(bundle);
export const flushPendingPicklist = (scope: string, guard?: () => boolean) => picklistQueue(scope).flush(guard);
