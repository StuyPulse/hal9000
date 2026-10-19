import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {blockedText, hasBlockedContent, assertShareableContent, CONTENT_FILTER_PATTERN} from '@wildcard/shared/src/content-filter';
import {friendlyError} from './friendly-error';
import {validateNativeEntry} from '@wildcard/shared/src/native-contracts';
import {textCases} from './content-filter-fixtures';
test('baseline text rules handle boundaries and common obfuscation without blocking scouting terms', () => {
  for (const [text, expected] of textCases) assert.equal(blockedText(text), expected, text);
});
test('checks nested values, not keys, without mutating saved observations', () => {
  const value = {shoot: 50, notes: ['Fine', {comment: 'shit'}]};
  const before = JSON.stringify(value);
  assert.equal(hasBlockedContent(value), true);
  assert.throws(() => assertShareableContent(value), /Content safety/);
  assert.equal(JSON.stringify(value), before);
  assert.equal(hasBlockedContent({shit: 'valid scouting', missing: null}), false);
});
test('local drafts remain valid and retain flagged text; only sharing is blocked', () => {
  const id='11111111-1111-4111-8111-111111111111';
  const entry=validateNativeEntry({id,organization_id:id,event_id:id,team_id:id,scout_user_id:id,match_id:null,assignment_id:null,entry_type:'pit',form_version:2,payload:{notes:'shit'},status:'draft',submitted_at:null});
  assert.equal(entry.payload.notes, 'shit');
  assert.throws(() => assertShareableContent(entry.payload), /saved local work is retained/);
});
test('database pattern matches the app and moderation errors remain actionable', () => {
  const migration = readFileSync(new URL('../../../../supabase/migrations/20261018221045_shared_text_content_filter.sql', import.meta.url), 'utf8');
  assert.ok(migration.includes(`~ '${CONTENT_FILTER_PATTERN}'`));
  assert.match(friendlyError({message:'Content safety: revise inappropriate language before sharing. Your saved local work is retained.'}), /revise inappropriate language/);
});
