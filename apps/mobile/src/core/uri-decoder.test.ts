import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url);
const decode=require('../../../../vendor/decode-uri-component/index.cjs');
const metro=require('../../metro.config.js');
test('the distributed open-source notice includes the complete upstream license',()=>{
 const {readFileSync}=require('node:fs');
 assert.equal(require('../../../../vendor/decode-uri-component/license.cjs'),readFileSync(new URL('../../../../vendor/decode-uri-component/license',import.meta.url),'utf8').trim());
});

test('patched decoder preserves valid Unicode and partial malformed values',()=>{
 assert.equal(decode('Scouting%20%E2%9C%93'),'Scouting ✓');
 assert.equal(decode('%F0%9F%A4%96'),'🤖');
 assert.equal(decode('%41%ZZ%42'),'A%ZZB');
 assert.equal(decode('%FE%FF'),'��');
 assert.throws(()=>decode(null),TypeError);
});
test('Metro redirects the query-string decoder on both native platforms',()=>{
 assert.ok(metro.watchFolders.includes(require('node:path').resolve(metro.projectRoot,'../../vendor')));
 for(const platform of ['ios','android']){
  const result=metro.resolver.resolveRequest({resolveRequest:()=>{throw Error('Decoder must not fall through to vulnerable npm copy')}},'decode-uri-component',platform);
  assert.equal(result.type,'sourceFile');
  assert.equal(require(result.filePath),decode);
 }
});
test('query-string source consumes the Metro-resolved CommonJS decoder for auth and filter links',()=>{
 const {readFileSync}=require('node:fs');
 const {runInNewContext}=require('node:vm');
 const path=require.resolve('query-string');
 const actualRequire=createRequire(path);
 const module={exports:{}};
 runInNewContext(readFileSync(path,'utf8'),{module,exports:module.exports,require:(name:string)=>name==='decode-uri-component'?decode:actualRequire(name)});
 const query=module.exports as {parse:(value:string)=>Record<string,string>};
 const result=query.parse('code=pkce-code&team=694&name=Stuy%20Pulse&unicode=%E2%9C%93');
 assert.deepEqual({...result},{code:'pkce-code',team:'694',name:'Stuy Pulse',unicode:'✓'});
});
test('malformed percent-encoded input completes in a bounded child process',()=>{
 const {spawnSync}=require('node:child_process');
 const script=`const decode=require(${JSON.stringify(require.resolve('../../../../vendor/decode-uri-component/index.cjs'))});decode('%C0'.repeat(50000));`;
 const result=spawnSync(process.execPath,['-e',script],{timeout:2000,encoding:'utf8'});
 assert.equal(result.error,undefined);
 assert.equal(result.status,0,result.stderr);
});
