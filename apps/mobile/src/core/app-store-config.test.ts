import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const {expo}=JSON.parse(readFileSync(new URL('../../app.json',import.meta.url),'utf8'));
const plugin=(name:string)=>expo.plugins.find((item:unknown)=>Array.isArray(item)&&item[0]===name)?.[1];
test('still-photo and QR workflows do not request microphone or biometric access',()=>{
 assert.equal(plugin('expo-camera').recordAudioAndroid,false);
 assert.equal(plugin('expo-camera').microphonePermission,false);
 assert.equal(plugin('expo-image-picker').microphonePermission,false);
 assert.equal(plugin('expo-secure-store').faceIDPermission,false);
 assert.ok(!expo.android.permissions.includes('android.permission.RECORD_AUDIO'));
 assert.ok(expo.android.blockedPermissions.includes('android.permission.RECORD_AUDIO'));
 for(const name of ['expo-camera','expo-image-picker']){
  assert.match(plugin(name).cameraPermission,/QR reports/);
  assert.match(plugin(name).cameraPermission,/pit photos/);
 }
});
test('privacy manifest describes accounts, content, support and Expo update diagnostics',()=>{
 const manifest=expo.ios.privacyManifests;
 assert.equal(manifest.NSPrivacyTracking,false);
 assert.deepEqual(manifest.NSPrivacyTrackingDomains,[]);
 const names=manifest.NSPrivacyCollectedDataTypes.map((item:{NSPrivacyCollectedDataType:string})=>item.NSPrivacyCollectedDataType).sort();
 assert.deepEqual(names,['Name','EmailAddress','UserID','DeviceID','PhotosorVideos','OtherUserContent','CustomerSupport','CrashData','OtherDiagnosticData'].map(name=>'NSPrivacyCollectedDataType'+name).sort());
 for(const item of manifest.NSPrivacyCollectedDataTypes){
  assert.equal(item.NSPrivacyCollectedDataTypeLinked,true);
  assert.equal(item.NSPrivacyCollectedDataTypeTracking,false);
  assert.deepEqual(item.NSPrivacyCollectedDataTypePurposes,['NSPrivacyCollectedDataTypePurposeAppFunctionality']);
 }
});
