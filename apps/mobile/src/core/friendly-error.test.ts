import test from 'node:test';
import assert from 'node:assert/strict';
import { friendlyError, GENERIC_ERROR } from './friendly-error';

test('maps network, auth and permission errors to plain language', () => {
  assert.match(friendlyError(new Error('Network request failed')), /No connection/);
  assert.match(friendlyError(new Error('new row violates row-level security policy for table "scouting_entries"')), /permission/);
  assert.match(friendlyError({ message: 'JWT expired' }), /Sign in again/);
  assert.match(friendlyError('Invalid login credentials'), /email or password/);
  assert.match(friendlyError(new Error('duplicate key value violates unique constraint "x"')), /already exists/);
});
test('keeps readable messages and hides technical ones', () => {
  assert.equal(friendlyError(new Error('Pick a team first.')), 'Pick a team first.');
  assert.equal(friendlyError(new Error('relation "foo" does not exist PGRST205')), GENERIC_ERROR);
  assert.equal(friendlyError(undefined, 'Could not save.'), 'Could not save.');
});
