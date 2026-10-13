// iOS 27 asserts at launch unless the app adopts the UIScene life cycle. Expo ships
// ExpoAppSceneDelegate, but the generated AppDelegate/Info.plist of this SDK do not use it.
// This plugin makes `expo prebuild` (and EAS) emit a project that does.
const { withDangerousMod, withInfoPlist } = require('expo/config-plugins');
const fs = require('fs');
const path = require('path');

const SCENE_CLASS = 'EXExpoAppSceneDelegate';

function patchAppDelegate(source) {
  let next = source;
  if (!next.includes('ExpoReactNativeFactoryProvider')) {
    next = next.replace(/class AppDelegate: ExpoAppDelegate \{/, 'class AppDelegate: ExpoAppDelegate, ExpoReactNativeFactoryProvider {');
  }
  // React Native is started by the scene delegate once the window scene connects.
  next = next.replace(
    /#if os\(iOS\) \|\| os\(tvOS\)\n\s*window = UIWindow\(frame: UIScreen\.main\.bounds\)\n\s*factory\.startReactNative\(\n[\s\S]*?\)\n#endif\n/,
    '    // React Native is started by ExpoAppSceneDelegate once UIKit creates the window scene (required by iOS 27).\n'
  );
  return next;
}

function patchInfoPlist(plist) {
  if (plist.UIApplicationSceneManifest) return plist;
  plist.UIApplicationSceneManifest = {
    UIApplicationSupportsMultipleScenes: false,
    UISceneConfigurations: {
      UIWindowSceneSessionRole: undefined,
      UIWindowSceneSessionRoleApplication: [
        { UISceneConfigurationName: 'Default Configuration', UISceneDelegateClassName: SCENE_CLASS },
      ],
    },
  };
  delete plist.UIApplicationSceneManifest.UISceneConfigurations.UIWindowSceneSessionRole;
  return plist;
}

const withIos27SceneDelegate = (config) => {
  config = withInfoPlist(config, (mod) => {
    mod.modResults = patchInfoPlist(mod.modResults);
    return mod;
  });
  return withDangerousMod(config, [
    'ios',
    async (mod) => {
      const file = path.join(mod.modRequest.platformProjectRoot, mod.modRequest.projectName, 'AppDelegate.swift');
      if (fs.existsSync(file)) {
        const before = fs.readFileSync(file, 'utf8');
        const after = patchAppDelegate(before);
        if (after !== before) fs.writeFileSync(file, after);
      }
      return mod;
    },
  ]);
};

module.exports = withIos27SceneDelegate;
module.exports.patchAppDelegate = patchAppDelegate;
module.exports.patchInfoPlist = patchInfoPlist;
