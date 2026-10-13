const test = require('node:test');
const assert = require('node:assert/strict');
const { patchAppDelegate, patchInfoPlist } = require('./withIos27SceneDelegate');

const original = `internal import Expo
import React

@main
class AppDelegate: ExpoAppDelegate {
  var window: UIWindow?

  public override func application(
    _ application: UIApplication,
    didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey: Any]? = nil
  ) -> Bool {
    let delegate = ReactNativeDelegate()
    let factory = ExpoReactNativeFactory(delegate: delegate)

    reactNativeFactory = factory

#if os(iOS) || os(tvOS)
    window = UIWindow(frame: UIScreen.main.bounds)
    factory.startReactNative(
      withModuleName: "main",
      in: window,
      launchOptions: launchOptions)
#endif

    return super.application(application, didFinishLaunchingWithOptions: launchOptions)
  }
}
`;

test('AppDelegate no longer starts React Native and conforms to the provider', () => {
  const out = patchAppDelegate(original);
  assert.match(out, /class AppDelegate: ExpoAppDelegate, ExpoReactNativeFactoryProvider \{/);
  assert.doesNotMatch(out, /startReactNative/);
  assert.doesNotMatch(out, /UIWindow\(frame/);
  assert.match(out, /return super\.application/);
});

test('patch is idempotent', () => {
  const once = patchAppDelegate(original);
  assert.equal(patchAppDelegate(once), once);
});

test('Info.plist gets the scene manifest once', () => {
  const plist = patchInfoPlist({ CFBundleName: 'HAL9000' });
  const configs = plist.UIApplicationSceneManifest.UISceneConfigurations;
  assert.equal(configs.UIWindowSceneSessionRoleApplication[0].UISceneDelegateClassName, 'EXExpoAppSceneDelegate');
  assert.equal(plist.UIApplicationSceneManifest.UIApplicationSupportsMultipleScenes, false);
  assert.deepEqual(patchInfoPlist(plist), plist);
});
