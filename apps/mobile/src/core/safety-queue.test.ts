import test from 'node:test';
import assert from 'node:assert/strict';
import {createSafetyQueue,isPermanentSafetyError,type SafetyReport,type QueuedSafetyReport} from './safety-queue';
const report:SafetyReport={id:'report-1',eventId:'event-1',targetKind:'workspace',targetId:null,reason:'privacy',details:'A privacy concern'};
function fixture(upload:(r:SafetyReport)=>Promise<{id:string}>){const rows=new Map<string,QueuedSafetyReport>();return {rows,queue:createSafetyQueue({put:async(id,row)=>{rows.set(id,row)},list:async()=>[...rows.values()]},upload)}}
test('saves locally before attempting delivery and trims details',async()=>{
 let calls=0;const {rows,queue}=fixture(async()=>{calls++;return {id:report.id}});
 await queue.save({...report,details:'  A concern  '});assert.equal(calls,0);assert.equal(rows.get(report.id)?.report.details,'A concern');
 await queue.flush(()=>true);assert.equal(rows.get(report.id)?.status,'sent');assert.equal(calls,1);
 await queue.flush(()=>true);assert.equal(calls,1);
});
test('network failures retain the immutable id and payload for retry',async()=>{
 let fails=true;const ids:string[]=[];const {rows,queue}=fixture(async r=>{ids.push(r.id);if(fails)throw Error('Offline');return {id:r.id}});
 await queue.save(report);await queue.flush(()=>true);assert.equal(rows.get(report.id)?.status,'pending');assert.equal(rows.get(report.id)?.error,'Offline');
 fails=false;await queue.flush(()=>true);assert.deepEqual(ids,[report.id,report.id]);assert.equal(rows.get(report.id)?.status,'sent');
});
test('account change or disconnect stops uploads; wrong acknowledgments do not mark sent',async()=>{
 const {rows,queue}=fixture(async()=>({id:'wrong'}));await queue.save(report);
 await queue.flush(()=>false);assert.equal(rows.get(report.id)?.error,null);
 await queue.flush(()=>true);assert.equal(rows.get(report.id)?.status,'pending');assert.match(rows.get(report.id)?.error??'',/confirm/);
});
test('parallel flush calls share one in-flight delivery',async()=>{
 let calls=0;const {queue}=fixture(async r=>{calls++;return {id:r.id}});await queue.save(report);
 await Promise.all([queue.flush(()=>true),queue.flush(()=>true)]);assert.equal(calls,1);
});
test('invalid details never create a local request',async()=>{
 const {queue,rows}=fixture(async()=>({id:report.id}));
 for(const details of ['', '  ', 'a'.repeat(2001)])await assert.rejects(queue.save({...report,details}));
 assert.equal(rows.size,0);
});
test('permanent client errors stop retrying; timeouts, rate limits and expired sign-in keep the report pending',async()=>{
 const httpError=(status:number)=>Object.assign(Error(`HTTP ${status}`),{status});
 assert.equal(isPermanentSafetyError(httpError(404)),true);assert.equal(isPermanentSafetyError(httpError(409)),true);assert.equal(isPermanentSafetyError(httpError(422)),true);
 for(const status of [401,408,429,500,503])assert.equal(isPermanentSafetyError(httpError(status)),false);assert.equal(isPermanentSafetyError(Error('Offline')),false);
 let calls=0;const {rows,queue}=fixture(async()=>{calls++;throw httpError(404)});await queue.save(report);
 await queue.flush(()=>true);assert.equal(rows.get(report.id)?.status,'failed');assert.equal(rows.get(report.id)?.error,'HTTP 404');
 await queue.flush(()=>true);assert.equal(calls,1);
 const limited=fixture(async()=>{throw httpError(429)});await limited.queue.save(report);await limited.queue.flush(()=>true);assert.equal(limited.rows.get(report.id)?.status,'pending');
});
test('only failed safety reports can be discarded, and discarded reports leave the list',async()=>{
 const {rows,queue}=fixture(async()=>{throw Object.assign(Error('Gone'),{status:404})});await queue.save(report);
 await assert.rejects(queue.discard(report.id),/failed/);await queue.flush(()=>true);
 await queue.discard(report.id);assert.equal(rows.get(report.id)?.status,'discarded');assert.deepEqual(await queue.list(),[]);
 await assert.rejects(queue.discard('missing'),/failed/);
});
