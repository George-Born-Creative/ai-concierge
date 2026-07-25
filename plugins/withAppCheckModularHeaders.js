// GoogleSignIn (via @react-native-google-signin/google-signin) pulls in the
// Swift pod AppCheckCore, whose deps (GoogleUtilities, RecaptchaInterop) don't
// define modules — CocoaPods refuses to link them into a static-library build
// ("The following Swift pods cannot yet be integrated as static libraries")
// unless modular headers are turned on for those three pods specifically.
const { withDangerousMod } = require('@expo/config-plugins');
const fs = require('fs');
const path = require('path');

const MODULAR_HEADER_PODS = ['AppCheckCore', 'GoogleUtilities', 'RecaptchaInterop'];
const ANCHOR = 'use_expo_modules!';

function withAppCheckModularHeaders(config) {
  return withDangerousMod(config, [
    'ios',
    (config) => {
      const podfilePath = path.join(config.modRequest.platformProjectRoot, 'Podfile');
      const contents = fs.readFileSync(podfilePath, 'utf8');
      const injected = MODULAR_HEADER_PODS.map((name) => `  pod '${name}', :modular_headers => true`).join('\n');

      if (!contents.includes(injected)) {
        fs.writeFileSync(podfilePath, contents.replace(ANCHOR, `${ANCHOR}\n${injected}`));
      }

      return config;
    },
  ]);
}

module.exports = withAppCheckModularHeaders;
