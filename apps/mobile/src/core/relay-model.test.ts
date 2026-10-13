import {test} from 'node:test';import assert from 'node:assert/strict';
import {makePackets,packetSchema,assemble} from './relay-model';
const transfer='00000000-0000-4000-8000-000000000001',checksum='a'.repeat(64);
test('multi-frame transfer reassembles out of order and ignores repeated identical frames',()=>{const snapshot='z'.repeat(2500);const packets=makePackets(snapshot,checksum,transfer).map(s=>packetSchema.parse(JSON.parse(s)));assert.equal(assemble([packets[2],packets[0],packets[0]]),null);assert.equal(assemble([packets[2],packets[0],packets[0],packets[1]]),snapshot)});
test('malformed frame indexes and mixed transfer identifiers are rejected',()=>{assert.equal(packetSchema.safeParse({app:'HAL9000',v:1,transfer,checksum,index:2,count:2,chunk:'x'}).success,false);const p=packetSchema.parse(JSON.parse(makePackets('test',checksum,transfer)[0]));assert.throws(()=>assemble([p,{...p,transfer:'00000000-0000-4000-8000-000000000002'}]))});
test('oversized report retains the direct-sync recovery path',()=>assert.throws(()=>makePackets('x'.repeat(64001),checksum,transfer),/too large/));
