import {test} from 'node:test';import assert from 'node:assert/strict';
import {eventEntries} from './report-overlay';
import type {EventBundle,LocalSubmission,NativeEntry} from './types';
const entry={id:'id',organization_id:'org',event_id:'event',payload:{comments:'old'},status:'submitted'} as unknown as NativeEntry;
const bundle={event:{id:'event',organization_id:'org'},entries:[{...entry,payload:{comments:'server correction'}}]} as unknown as EventBundle;
const local={entry,revision:1,acknowledgedRevision:1,status:'synced'} as LocalSubmission;
test('acknowledged local snapshots cannot mask cloud correction or resurrect deletion',()=>{assert.equal(eventEntries(bundle,[local])[0].payload.comments,'server correction');assert.deepEqual(eventEntries({...bundle,entries:[]},[local]),[])});
test('approved pending observations override cache but working edits do not publish into stats',()=>{const pending={...local,revision:2,entry:{...entry,payload:{comments:'pending'}}};assert.equal(eventEntries(bundle,[pending])[0].payload.comments,'pending');assert.equal(eventEntries(bundle,[{...pending,reviewRequired:true}])[0].payload.comments,'server correction');assert.equal(eventEntries(bundle,[{...pending,reviewRequired:true}],{includeWorking:true})[0].payload.comments,'pending')});
test('other events and organizations never enter the selected event analysis',()=>{assert.equal(eventEntries(bundle,[{...local,revision:2,entry:{...entry,event_id:'other'}}])[0].payload.comments,'server correction');assert.equal(eventEntries(bundle,[{...local,revision:2,entry:{...entry,organization_id:'other'}}])[0].payload.comments,'server correction')});
