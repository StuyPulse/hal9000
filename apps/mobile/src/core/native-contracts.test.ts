import {test} from 'node:test';
import assert from 'node:assert/strict';
import {normalizeNativePayload,validateNativeEntry} from '@wildcard/shared/src/native-contracts';
const uuid='11111111-1111-4111-8111-111111111111';
const entry={id:uuid,organization_id:uuid,event_id:uuid,team_id:uuid,match_id:null,assignment_id:null,scout_user_id:uuid,entry_type:'pre_scout',form_version:2,payload:{},status:'draft',submitted_at:null};
test('blank average pieces is omitted without converting missing data to zero',()=>{assert.deepEqual(normalizeNativePayload('pre_scout',{average_pieces:'',notes:'kept'}),{notes:'kept'});assert.deepEqual(normalizeNativePayload('pre_scout',{average_pieces:'0'}),{average_pieces:'0'})});
test('pre-scout constraints reject invalid averages and retain unknown legacy JSON',()=>{assert.throws(()=>validateNativeEntry({...entry,payload:{average_pieces:'2.5'}}));assert.throws(()=>validateNativeEntry({...entry,payload:{average_pieces:''}}));assert.equal(validateNativeEntry({...entry,payload:{average_pieces:'999',legacy:{kept:true}}}).payload.average_pieces,'999')});
test('removed pit climb is rejected before networking',()=>{assert.throws(()=>validateNativeEntry({...entry,entry_type:'pit',payload:{climb:'yes'}}))});
