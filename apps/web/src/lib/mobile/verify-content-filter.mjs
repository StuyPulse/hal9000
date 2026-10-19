// Disposable database only. Run with node --import tsx; never uses hosted credentials.
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {pathToFileURL} from 'node:url';
import {textCases} from '../../../../mobile/src/core/content-filter-fixtures.ts';
import {hasBlockedContent} from '../../../../../packages/shared/src/content-filter.ts';
const {PGlite}=await import(pathToFileURL(process.argv[2]).href);
const db=new PGlite();
try {
  await db.exec(`create schema private;create role anon;create role authenticated;create role service_role;
    create table scouting_entries(id int primary key,payload jsonb,status text);
    create table team_notes(id int primary key,note text);
    create table shared_picklist_rankings(id int primary key,note text,rank int);
    create table picklist_rankings(id int primary key,note text);
    create table picklist_categories(id int primary key,name text);
    create table picklist_tags(id int primary key,name text);
    grant usage on schema private to authenticated;
    grant all on all tables in schema public to authenticated,service_role;
    insert into shared_picklist_rankings values(1,'shit',1);
    insert into scouting_entries values(1,'{"notes":"shit"}','draft');`);
  await db.exec(await readFile('supabase/migrations/20261018221045_shared_text_content_filter.sql','utf8'));
  for (const [text,expected] of textCases) {
    assert.equal((await db.query('select private.content_text_blocked($1) blocked',[text])).rows[0].blocked,expected,text);
  }
  for (const value of [null,{},[],{nested:['Fine',{notes:'shit'}]},{shit:'Safe'},'shit',42]) {
    assert.equal((await db.query('select private.content_json_blocked($1::jsonb) blocked',[JSON.stringify(value)])).rows[0].blocked,hasBlockedContent(value),JSON.stringify(value));
  }
  for(const role of ['authenticated','service_role']) {
    await db.exec(`set role ${role}`);
    await assert.rejects(db.query('insert into scouting_entries values(2,$1,\'draft\')',[JSON.stringify({nested:[{notes:'f.u.c.k'}]})]),/Content safety/);
    for(const [table,column] of [['team_notes','note'],['shared_picklist_rankings','note'],['picklist_rankings','note'],['picklist_categories','name'],['picklist_tags','name']]) {
      await assert.rejects(db.query(`insert into ${table}(id,${column}) values(2,$1)`,['shit']),/Content safety/);
    }
    await db.exec('reset role');
  }
  await db.exec(`set role authenticated;
    update shared_picklist_rankings set rank=2 where id=1;
    update shared_picklist_rankings set note='Useful defense' where id=1;
    update scouting_entries set payload='{"comments":"Shoot and ferry fuel"}' where id=1;`);
  await assert.rejects(db.query('update scouting_entries set payload=$1 where id=1',[JSON.stringify({comments:'shit'})]),/Content safety/);
  assert.equal((await db.query('select payload from scouting_entries where id=1')).rows[0].payload.comments,'Shoot and ferry fuel');
  await db.exec('reset role');
  // An older draft cannot be published by changing status alone.
  await db.exec('alter table scouting_entries disable trigger filter_scouting_text');
  await db.exec(`insert into scouting_entries values(3,'{"notes":"shit"}','draft')`);
  await db.exec('alter table scouting_entries enable trigger filter_scouting_text;set role authenticated');
  await assert.rejects(db.exec("update scouting_entries set status='submitted' where id=3"),/Content safety/);
  await db.exec('reset role');
  assert.equal((await db.query("select has_function_privilege('anon','private.content_text_blocked(text)','EXECUTE') allowed")).rows[0].allowed,false);
  assert.equal((await db.query("select has_function_privilege('authenticated','private.filter_shared_text()','EXECUTE') allowed")).rows[0].allowed,false);
  console.log('Content filter passed: shared app/SQL corpus, nested JSON, direct authenticated/service writes, unchanged legacy fields, corrections and rollback.');
} finally {await db.close()}
