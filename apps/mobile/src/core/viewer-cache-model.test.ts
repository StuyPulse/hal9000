import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {REMOVE_REVOKED_VIEWER_SQL,matchesRevokedViewer} from './viewer-cache-model';
test('revocation removes only the matching live viewer pointer; SQLite drafts and other accounts survive',()=>{
 const db=new DatabaseSync(':memory:');
 try{
  db.exec('create table local_items(scope text,kind text,id text,json text,primary key(scope,kind,id))');
  const put=db.prepare('insert or replace into local_items values(?,?,?,?)');
  put.run('live:user:org','entry','draft',JSON.stringify({unsent:true}));put.run('live:other:org','entry','draft2','{}');
  for(const viewer of [{userId:'other',organizationId:'org'},{userId:'user',organizationId:'other-org'},{userId:'user',organizationId:'org',demo:true}]){
   put.run('device','meta','viewer',JSON.stringify(viewer));db.prepare(REMOVE_REVOKED_VIEWER_SQL).run('user','org');
   assert.equal((db.prepare("select count(*) n from local_items where id='viewer'").get() as any).n,1);
  }
  put.run('device','meta','viewer',JSON.stringify({userId:'user',organizationId:'org',demo:false}));db.prepare(REMOVE_REVOKED_VIEWER_SQL).run('user','org');
  assert.equal((db.prepare("select count(*) n from local_items where id='viewer'").get() as any).n,0);
  assert.equal((db.prepare("select count(*) n from local_items where kind='entry'").get() as any).n,2);
 }finally{db.close()}
});
test('web revocation matches the same account/org and excludes practice',()=>{
 assert.equal(matchesRevokedViewer({userId:'u',organizationId:'o'},'u','o'),true);
 assert.equal(matchesRevokedViewer({userId:'u',organizationId:'o',demo:true},'u','o'),false);
 assert.equal(matchesRevokedViewer({userId:'other',organizationId:'o'},'u','o'),false);
});
