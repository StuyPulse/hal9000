import test from 'node:test';
import assert from 'node:assert/strict';
import {openAssignments} from './assignments';
import type {Assignment,LocalSubmission,Match,NativeEntry} from './types';

const event={id:'e1',organization_id:'o1',name:'Event',event_key:'2026test',status:'active'} as never;
const match=(id:string,n:number):Match=>({id,event_id:'e1',match_number:n,match_type:'qualification',status:'scheduled',red_teams:['t1','t2','t3'],blue_teams:['t4','t5','t6'],scheduled_at:null});
const matches=[match('m3',3),match('m1',1),match('m2',2)];
const assignment=(id:string,matchId:string,teamId:string,status='pending'):Assignment=>({id,match_id:matchId,team_id:teamId,scout_user_id:'u1',assignment_type:'objective',status});
const report=(over:Partial<NativeEntry>,local:Partial<LocalSubmission>={}):LocalSubmission=>({entry:{id:Math.random().toString(),organization_id:'o1',event_id:'e1',team_id:'t1',match_id:'m1',assignment_id:null,scout_user_id:'u1',entry_type:'match',form_version:4,payload:{},status:'submitted',submitted_at:null,...over},revision:1,acknowledgedRevision:null,status:'pending',error:null,origin:'own',baseUpdatedAt:null,changedAt:'',...local});

test('open assignments are sorted by match and skip completed ones', () => {
 const assignments=[assignment('a3','m3','t1'),assignment('a1','m1','t1'),assignment('a2','m2','t4','complete')];
 assert.deepEqual(openAssignments({event,matches,assignments},[],'u1').map(a=>a.id),['a1','a3']);
});

test('a report closes its assignment by ID or by the same robot in the same match', () => {
 const assignments=[assignment('a1','m1','t1'),assignment('a2','m2','t4'),assignment('a3','m3','t2')];
 const records=[report({assignment_id:'a1',match_id:'m1',team_id:'t1'}),report({assignment_id:null,match_id:'m2',team_id:'t4'})];
 assert.deepEqual(openAssignments({event,matches,assignments},records,'u1').map(a=>a.id),['a3']);
});

test('drafts, received reports and other events leave assignments open', () => {
 const assignments=[assignment('a1','m1','t1')];
 const records=[report({status:'draft'}),report({},{origin:'relay'}),report({event_id:'other'}),report({entry_type:'pit'})];
 assert.deepEqual(openAssignments({event,matches,assignments},records,'u1').map(a=>a.id),['a1']);
});

test('another scout\'s claimed report does not complete this account\'s assignment', () => {
 const assignments=[assignment('a1','m1','t1')];
 const records=[report({assignment_id:'a1',scout_user_id:'u2'}),report({assignment_id:null,scout_user_id:'u2'})];
 assert.deepEqual(openAssignments({event,matches,assignments},records,'u1').map(a=>a.id),['a1']);
 assert.deepEqual(openAssignments({event,matches,assignments},records,'u2').map(a=>a.id),[]);
});
