#!/usr/bin/env python3
"""Local-build helper: make generated iOS build scripts safe when the project path contains spaces.

Cloud (EAS) builds run in a path without spaces and do not need this. Idempotent; run after
`expo prebuild` / `pod install` and before `expo run:ios`.
"""
import pathlib, sys

root = pathlib.Path(__file__).resolve().parents[1]
repo = root.parents[1]
changed = []

def patch(path, old, new, label):
    p = pathlib.Path(path)
    if not p.exists():
        return
    s = p.read_text()
    if new in s:
        return
    if old in s:
        p.write_text(s.replace(old, new))
        changed.append(label)

# 1) expo-constants script: unquoted basename of $PROJECT_DIR
patch(repo / 'node_modules/expo-constants/scripts/get-app-config-ios.sh',
      'PROJECT_DIR_BASENAME=$(basename $PROJECT_DIR)', 'PROJECT_DIR_BASENAME=$(basename "$PROJECT_DIR")',
      'expo-constants basename')

# 2) Pods project: script path passed through `bash -l -c "<path>"` loses its quoting
patch(root / 'ios/Pods/Pods.xcodeproj/project.pbxproj',
      'shellScript = "bash -l -c \\"$PODS_TARGET_SRCROOT/../scripts/get-app-config-ios.sh\\"";',
      'shellScript = "bash -l -c \\"\\\\\\"$PODS_TARGET_SRCROOT/../scripts/get-app-config-ios.sh\\\\\\"\\"";',
      'Pods app.config phase')

# 3) App target: react-native-xcode.sh is executed from an unquoted command substitution
old = "`\\\"$NODE_BINARY\\\" --print \\\"require('path').dirname(require.resolve('react-native/package.json')) + '/scripts/react-native-xcode.sh'\\\"`"
new = ("RN_XCODE_SCRIPT=\\\"$(\\\"$NODE_BINARY\\\" --print \\\"require('path').dirname(require.resolve('react-native/package.json')) "
       "+ '/scripts/react-native-xcode.sh'\\\")\\\"\\n/bin/bash \\\"$RN_XCODE_SCRIPT\\\"")
patch(root / 'ios/HAL9000.xcodeproj/project.pbxproj', old, new, 'app bundle phase')

print('patched: ' + (', '.join(changed) if changed else 'nothing (already safe or not present)'))
