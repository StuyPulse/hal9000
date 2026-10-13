import test from 'node:test';import assert from 'node:assert/strict';
import {mobileApiMessage,MobileApiError} from './api-errors';
test('undeployed mobile endpoints give a recovery-oriented error',()=>{assert.match(mobileApiMessage(404),/not been deployed/);assert.match(mobileApiMessage(503),/local work is retained/);assert.equal(new MobileApiError('message',409).status,409)});
