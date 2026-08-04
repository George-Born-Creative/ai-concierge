// Dynamic Expo config. Extends the static app.json so the Google Sign-In iOS
// URL scheme can be injected from the environment (the iOS OAuth client ID is
// not committed). On Android only the runtime `webClientId`
// (GoogleSignin.configure) is required, so the plugin stays a bare string
// there. Once EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID is set, the iOS reversed-client
// URL scheme is added automatically for the next dev-client rebuild.

const withAppCheckModularHeaders = require('./plugins/withAppCheckModularHeaders');

const GOOGLE_PLUGIN = '@react-native-google-signin/google-signin';

function withGoogleIosScheme(plugins) {
  const iosClientId = process.env.EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID?.trim();
  if (!iosClientId) return plugins;

  const iosUrlScheme = `com.googleusercontent.apps.${iosClientId.replace(
    /\.apps\.googleusercontent\.com$/,
    '',
  )}`;

  return plugins.map((plugin) =>
    plugin === GOOGLE_PLUGIN ? [GOOGLE_PLUGIN, { iosUrlScheme }] : plugin,
  );
}

module.exports = ({ config }) => withAppCheckModularHeaders({
  ...config,
  plugins: withGoogleIosScheme(config.plugins ?? []),
});
