import test from 'node:test';
import assert from 'node:assert/strict';
import {discardPhotoSelection,isOwnedSelectionFile,validSelectionLocation,queuePhotoSelection} from './photo-selection-model';

const photo={id:'photo-1',eventId:'event-1',localUri:'file:///documents/staged/photo-1.jpg',createdAt:'2026-10-18'};
test('removal unlinks staged file before removing its row',async()=>{
 const steps:string[]=[];
 await discardPhotoSelection(photo.id,{read:async()=>photo,discardFile:()=>{steps.push('file')},removeRow:async()=>{steps.push('row')}});
 assert.deepEqual(steps,['file','row']);
});
test('unlink failures preserve the row for retry',async()=>{
 let removed=false;
 await assert.rejects(discardPhotoSelection(photo.id,{read:async()=>photo,discardFile:()=>{throw Error('disk failure')},removeRow:async()=>{removed=true}}),/disk failure/);
 assert.equal(removed,false);
});
test('missing rows make repeated removal harmless',async()=>{
 let removed=0;
 await discardPhotoSelection(photo.id,{read:async()=>null,discardFile:()=>assert.fail('no file to unlink'),removeRow:async()=>{removed++}});
 assert.equal(removed,1);
});
test('mismatched records cannot delete files',async()=>{
 await assert.rejects(discardPhotoSelection('other',{read:async()=>photo,discardFile:()=>assert.fail('wrong file'),removeRow:async()=>assert.fail('wrong row')}),/changed/);
});
test('file ownership requires exact app-owned path, never a library or remote URI',()=>{
 assert.equal(isOwnedSelectionFile(photo.localUri,photo.localUri),true);
 for(const uri of ['ph://library/1','https://example.com/photo.jpg','file:///documents/other/photo-1.jpg',photo.localUri+'/../other.jpg']){
  assert.equal(isOwnedSelectionFile(uri,photo.localUri),false);
 }
});
test('workspace and filename components cannot escape the staging directory',()=>{
 const uuid='00000000-0000-4000-8000-000000000001';
 assert.equal(validSelectionLocation(`live:${uuid}:${uuid}`,uuid),true);
 assert.equal(validSelectionLocation(`practice:${uuid}:${uuid}`,uuid),true);
 for(const part of ['..','../../other','file:///documents','/','bad-id']){
  assert.equal(validSelectionLocation(part,uuid),false);
  assert.equal(validSelectionLocation(`live:${uuid}:${uuid}`,part),false);
 }
});
const destination={event_id:'event-1',organization_id:'org-1',uploaded_by:'user-1',team_id:'team-1'};
test('retry after staging cleanup failure does not enqueue another photo or reset delivery state',async()=>{
 const existing={...destination,id:'original-photo',status:'synced'};
 await queuePhotoSelection(destination,{read:async()=>existing,stage:async()=>assert.fail('no second file'),write:async()=>assert.fail('no duplicate or status reset')});
 assert.equal(existing.status,'synced');
});
test('existing selections cannot be reassigned to another account, event, organization or team',async()=>{
 for(const key of ['event_id','organization_id','uploaded_by','team_id'] as const){
  await assert.rejects(queuePhotoSelection(destination,{read:async()=>({...destination,[key]:'other'}),stage:async()=>assert.fail('no second file'),write:async()=>assert.fail('no write')}),/workspace|original team/);
 }
});
test('new selection is staged and durably saved once before delivery',async()=>{
 const steps:string[]=[];
 await queuePhotoSelection(destination,{read:async()=>null,stage:async()=>{steps.push('stage');return destination},write:async value=>{assert.equal(value,destination);steps.push('save')}});
 assert.deepEqual(steps,['stage','save']);
});
