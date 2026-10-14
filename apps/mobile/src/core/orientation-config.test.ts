import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const {expo}=JSON.parse(readFileSync(new URL('../../app.json',import.meta.url),'utf8'));
test('native config enables portrait and both landscape orientations on iPhone and iPad',()=>{
 assert.equal(expo.orientation,'default');
 for(const key of ['UISupportedInterfaceOrientations','UISupportedInterfaceOrientations~ipad']){
  assert.ok(expo.ios.infoPlist[key].includes('UIInterfaceOrientationPortrait'));
  assert.ok(expo.ios.infoPlist[key].includes('UIInterfaceOrientationLandscapeLeft'));
  assert.ok(expo.ios.infoPlist[key].includes('UIInterfaceOrientationLandscapeRight'));
 }
});
