import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const config=JSON.parse(readFileSync(new URL('../../store.config.json',import.meta.url),'utf8'));
test('public listing copy fits Apple limits and links use HTTPS',()=>{
 const info=config.apple.info['en-US'];
 for(const [key,max] of [['title',30],['subtitle',30],['description',4000],['promoText',170]] as const){assert.ok(info[key].length>0);assert.ok(info[key].length<=max,key);}
 assert.ok(info.keywords.join(',').length<=100);
 for(const key of ['supportUrl','privacyPolicyUrl','marketingUrl'])assert.equal(new URL(info[key]).protocol,'https:');
});
test('public metadata contains no review credentials or release/advisory changes',()=>{
 for(const key of ['review','advisory','release'])assert.equal(config.apple[key],undefined);
});
