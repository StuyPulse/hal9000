import test from 'node:test';
import assert from 'node:assert/strict';
import {parseAuthCallback,RecoveryPermit,normalizedEmail,signupProfile,validatePassword} from './auth-model';
test('accepts only the exact native or explicitly supplied web callback',()=>{
 assert.deepEqual(parseAuthCallback('hal9000://auth/callback?code=abc','signin'),{code:'abc'});
 assert.deepEqual(parseAuthCallback('hal9000://auth/recovery?code=reset','recovery'),{code:'reset'});
 assert.deepEqual(parseAuthCallback('hal9000://auth/callback?code=abc&sb_flow_id=abcd1234','signin'),{code:'abc',flowId:'abcd1234'});
 assert.deepEqual(parseAuthCallback('https://example.com/auth/callback?code=abc','signin','https://example.com'),{code:'abc'});
 for(const url of ['https://evil.test/auth/callback?code=a','hal9000://auth/recovery?code=a','hal9000://other/callback?code=a','hal9000://auth/callback/extra?code=a','hal9000://user@auth/callback?code=a'])assert.throws(()=>parseAuthCallback(url,'signin'));
});
test('rejects missing, mixed, duplicate or error callback material',()=>{
 for(const params of ['', '?code=', '?code=a&code=b', '?code=a#code=b', '?access_token=a&refresh_token=b', '?code=a#access_token=b', '?code=a&error=denied', '?code=a&error_code=401','?code=a&error_description=failed','?code=a&sb_flow_id=short','?code=a&sb_flow_id=abcd1234#sb_flow_id=abcd5678', '?code=a%20b'])assert.throws(()=>parseAuthCallback(`hal9000://auth/callback${params}`,'signin'));
});
test('recovery requires explicit SDK recovery event and matching unexpired user',()=>{
 const permit=new RecoveryPermit();assert.equal(permit.grant('SIGNED_IN','user',100),false);assert.equal(permit.allows('user',101),false);
 assert.equal(permit.grant('PASSWORD_RECOVERY','user',100),true);assert.equal(permit.allows('other',101),false);assert.equal(permit.allows('user',101),true);
 assert.equal(permit.allows('user',600100),false);permit.clear();assert.equal(permit.allows('user',101),false);
});
test('signup and reset validation match website name and password limits',()=>{
 assert.equal(normalizedEmail(' TEST@EXAMPLE.COM '),'test@example.com');assert.throws(()=>normalizedEmail('not-email'));
 assert.deepEqual(signupProfile(' Ada ',' Lovelace '),{firstName:'Ada',lastName:'Lovelace'});assert.throws(()=>signupProfile('','User'));assert.throws(()=>signupProfile('a'.repeat(41),'User'));
 validatePassword('valid-pass','valid-pass');assert.throws(()=>validatePassword('short'));assert.throws(()=>validatePassword('valid-pass','different'));assert.throws(()=>validatePassword('x'.repeat(129)));
});
