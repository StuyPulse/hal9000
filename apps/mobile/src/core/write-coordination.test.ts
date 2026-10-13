import {test} from 'node:test';
import assert from 'node:assert/strict';
import {serializeWrite,excludeSync} from './write-coordination';
test('autosave read/write and acknowledgment cannot interleave and discard the new server token',async()=>{
 const chain={current:Promise.resolve()};let row={revision:1,acknowledgedRevision:0,base:'old',payload:'old'};
 let resume!:()=>void,entered!:()=>void;const barrier=new Promise<void>(r=>resume=r),reading=new Promise<void>(r=>entered=r);
 const save=serializeWrite(chain,async()=>{const before={...row};entered();await barrier;row={...before,revision:2,payload:'new'};});
 await reading;
 const ack=serializeWrite(chain,async()=>{row={...row,acknowledgedRevision:1,base:'new-server-token'};});
 resume();await Promise.all([save,ack]);assert.deepEqual(row,{revision:2,acknowledgedRevision:1,base:'new-server-token',payload:'new'});
 await serializeWrite(chain,async()=>{row={...row,revision:3,payload:'newer'};});assert.equal(row.base,'new-server-token');
});
test('deletion excludes a concurrent sync until all asynchronous work finishes and unlocks after failure',async()=>{
 const lock={current:false};let resume!:()=>void;const barrier=new Promise<void>(r=>resume=r);
 const deletion=excludeSync(lock,()=>barrier);assert.equal(lock.current,true);
 await assert.rejects(excludeSync(lock,async()=>{}),/Wait for/);resume();await deletion;assert.equal(lock.current,false);
 await assert.rejects(excludeSync(lock,async()=>{throw Error('network failed')}),/network/);assert.equal(lock.current,false);
});
test('failed local operations do not poison the write chain',async()=>{const chain={current:Promise.resolve()};await assert.rejects(serializeWrite(chain,async()=>{throw Error('failure')}));assert.equal(await serializeWrite(chain,async()=>42),42)});
