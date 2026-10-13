// Run with an isolated installed PGlite package path; no hosted connection.
// node apps/web/src/lib/mobile/verify-migration.mjs /tmp/.../node_modules/@electric-sql/pglite/dist/index.js
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';

const { PGlite } = await import(pathToFileURL(process.argv[2]).href);
const database = new PGlite();
const uuid = n => `00000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
try {
  await database.exec(`
    create role anon; create role authenticated; create role service_role;
    create schema auth; create schema private; create table auth.users(id uuid primary key);
    create function auth.uid() returns uuid language sql as 'select nullif(current_setting(''test.user'',true),'''')::uuid';
    create table public.organizations(id uuid primary key);
    create table public.organization_members(organization_id uuid,user_id uuid,role text);
    create table public.events(id uuid primary key,organization_id uuid references public.organizations(id),status text);
    create table public.scouting_entries(id uuid primary key,organization_id uuid,event_id uuid,scout_user_id uuid,team_id uuid,match_id uuid,assignment_id uuid,entry_type text,status text,updated_at timestamptz,form_version integer default 4,payload jsonb default '{}',last_edited_by uuid,submitted_at timestamptz default now());
    create table public.scouting_assignments(id uuid primary key,match_id uuid,team_id uuid,scout_user_id uuid,assignment_type text,status text,completed_at timestamptz);
    create table public.event_teams(event_id uuid,team_id uuid);
    create table public.matches(id uuid primary key,event_id uuid,red_teams uuid[],blue_teams uuid[]);
  `);
  await database.exec(await readFile('supabase/migrations/20261013143440_mobile_device_keys_and_event_activation.sql','utf8'));
  await database.exec(await readFile('supabase/migrations/20260915034934_complete_assignments_from_match_reports.sql','utf8'));
  await database.exec(`
    insert into organizations values ('${uuid(2)}');
    insert into auth.users values ('${uuid(1)}'),('${uuid(6)}');
    insert into organization_members values ('${uuid(2)}','${uuid(1)}','admin'),('${uuid(2)}','${uuid(6)}','scout');
    insert into events values ('${uuid(4)}','${uuid(2)}','active'),('${uuid(40)}','${uuid(2)}','upcoming');
    insert into scouting_assignments values ('${uuid(8)}','${uuid(9)}','${uuid(5)}','${uuid(6)}','objective','complete',now());
    insert into scouting_entries values ('${uuid(3)}','${uuid(2)}','${uuid(4)}','${uuid(6)}','${uuid(5)}','${uuid(9)}',null,'match','submitted','2026-10-13T00:00:00Z');
  `);
  const deletion = (id=uuid(3),time='2026-10-13T00:00:00Z',caller=uuid(6)) => database.query('select public.mobile_delete_report($1,$2,$3,$4,$5) result',[id,uuid(2),uuid(4),caller,time]);
  assert.equal((await deletion(uuid(3),'2026-10-13T00:00:01Z')).rows[0].result.code,'conflict');
  const result = (await deletion()).rows[0].result;
  assert.equal(result.deleted,true); assert.equal(result.assignmentReopened,true);
  assert.equal((await database.query('select status from scouting_assignments')).rows[0].status,'pending');
  assert.equal((await deletion()).rows[0].result.alreadyDeleted,true);
  await database.exec(`
    update scouting_assignments set status='complete';
    insert into scouting_entries values ('${uuid(3)}','${uuid(2)}','${uuid(4)}','${uuid(6)}','${uuid(5)}','${uuid(9)}',null,'match','submitted','2026-10-13T00:00:00Z'),('${uuid(30)}','${uuid(2)}','${uuid(4)}','${uuid(6)}','${uuid(5)}','${uuid(9)}',null,'match','submitted','2026-10-13T00:00:00Z');
  `);
  assert.equal((await deletion()).rows[0].result.assignmentReopened,false);
  assert.equal((await database.query('select status from scouting_assignments')).rows[0].status,'complete');
  assert.equal((await deletion(uuid(30),'2026-10-13T00:00:00Z',uuid(99))).rows[0].result.code,'forbidden');
  await database.query("select set_config('test.user',$1,false)",[uuid(1)]);
  await database.query('select public.mobile_activate_event($1)',[uuid(40)]);
  assert.deepEqual((await database.query("select id from events where status='active'")).rows.map(row=>row.id),[uuid(40)]);
  const grant = await database.query("select has_function_privilege('authenticated','public.mobile_delete_report(uuid,uuid,uuid,uuid,timestamptz)','EXECUTE') allowed");
  assert.equal(grant.rows[0].allowed,false);
  await database.exec(`
    insert into event_teams values ('${uuid(4)}','${uuid(5)}'),('${uuid(4)}','${uuid(60)}');
    insert into matches values ('${uuid(9)}','${uuid(4)}',array['${uuid(5)}']::uuid[],array[]::uuid[]),('${uuid(10)}','${uuid(4)}',array['${uuid(60)}']::uuid[],array[]::uuid[]);
    insert into scouting_assignments values ('${uuid(80)}','${uuid(10)}','${uuid(60)}','${uuid(6)}','objective','pending',null);
    update scouting_entries set payload='{"manual_match":{"stage":"Qualification","label":"1","alliance":"red"}}';
    insert into scouting_entries(id,organization_id,event_id,scout_user_id,team_id,match_id,entry_type,status,updated_at,payload) values ('${uuid(3)}','${uuid(2)}','${uuid(4)}','${uuid(6)}','${uuid(5)}','${uuid(9)}','match','submitted','2026-10-13T00:00:00Z','{"manual_match":{"stage":"Qualification","label":"1","alliance":"red"}}');
  `);
  const correction = (entryId, caller=uuid(6), time='2026-10-13T00:00:00Z') => database.query('select public.mobile_correct_manual_report($1,$2,$3,$4,$5,$6,$7,$8) result',[entryId,uuid(2),uuid(4),caller,time,uuid(60),uuid(10),{manual_match:{stage:'Qualification',label:'2',alliance:'red'},report_source:'manual'}]);
  assert.equal((await correction(uuid(3),uuid(99))).rows[0].result.code,'forbidden');
  assert.equal((await correction(uuid(3),uuid(6),'2026-10-13T00:00:01Z')).rows[0].result.code,'conflict');
  assert.equal((await correction(uuid(3))).rows[0].result.entry.team_id,uuid(60));
  assert.equal((await database.query('select status from scouting_assignments where id=$1',[uuid(8)])).rows[0].status,'complete');
  assert.equal((await database.query('select status from scouting_assignments where id=$1',[uuid(80)])).rows[0].status,'complete');
  await correction(uuid(30));
  assert.equal((await database.query('select status from scouting_assignments where id=$1',[uuid(8)])).rows[0].status,'pending');
  assert.equal((await database.query('select status from scouting_assignments where id=$1',[uuid(80)])).rows[0].status,'complete');
  const correctionGrant = await database.query("select has_function_privilege('authenticated','public.mobile_correct_manual_report(uuid,uuid,uuid,uuid,timestamptz,uuid,uuid,jsonb)','EXECUTE') allowed");
  assert.equal(correctionGrant.rows[0].allowed,false);
  console.log('PASS: actual PostgreSQL migration syntax, atomic deletion/null-assignment reopening, remaining-report guard, conflict/idempotence/auth, activation, manual movement old-slot/new-slot reconciliation with original completion trigger, and service-only grants.');
} finally { await database.close(); }
