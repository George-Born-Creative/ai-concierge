import { Redirect } from 'expo-router';

// The center tab is the voice mic (VoiceAssistantTabButton in the tab bar). The
// button records audio and pushes to /chat instead of switching tabs, so this
// route never actually renders. If reached directly, fall back to Home.
export default function VoiceTabPlaceholder() {
  return <Redirect href="/(tabs)" />;
}
