import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import LottieView from 'lottie-react-native';
import { StyleSheet, Text, View } from 'react-native';

export type ChatVoiceActivity = 'idle' | 'recording' | 'sending';

type ChatVoiceWaveOverlayProps = {
  activity: ChatVoiceActivity;
};

export function ChatVoiceWaveOverlay({ activity }: ChatVoiceWaveOverlayProps) {
  if (activity === 'idle') {
    return null;
  }

  const isSending = activity === 'sending';

  return (
    <View pointerEvents="none" style={styles.overlay}>
      <View style={styles.card}>
        <View style={styles.lottieWrap}>
          <LottieView
            source={require('@/assets/lottie/voice-circle-wave.json')}
            autoPlay
            loop
            style={styles.lottie}
          />
          <View style={styles.centerIcon}>
            <MaterialIcons
              name={isSending ? 'cloud-upload' : 'mic'}
              size={34}
              color="#1A73E8"
            />
          </View>
        </View>
        <Text style={styles.title}>{isSending ? 'Sending voice' : 'Listening'}</Text>
        <Text style={styles.subtitle}>
          {isSending ? 'Preparing your command…' : 'Release the mic when you are done'}
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  overlay: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    backgroundColor: 'rgba(248, 250, 255, 0.72)',
    justifyContent: 'center',
    zIndex: 20,
  },
  card: {
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderColor: '#D2E3FC',
    borderRadius: 24,
    borderWidth: 1,
    elevation: 8,
    maxWidth: 320,
    paddingHorizontal: 28,
    paddingVertical: 26,
    shadowColor: '#1A73E8',
    shadowOffset: { width: 0, height: 16 },
    shadowOpacity: 0.14,
    shadowRadius: 28,
    width: '86%',
  },
  lottieWrap: {
    alignItems: 'center',
    height: 200,
    justifyContent: 'center',
    width: 200,
  },
  lottie: {
    height: 200,
    width: 200,
  },
  centerIcon: {
    alignItems: 'center',
    backgroundColor: '#E8F0FE',
    borderRadius: 36,
    height: 72,
    justifyContent: 'center',
    position: 'absolute',
    width: 72,
  },
  title: {
    color: '#202124',
    fontSize: 20,
    fontWeight: '600',
    marginTop: 4,
  },
  subtitle: {
    color: '#5F6368',
    fontSize: 14,
    lineHeight: 20,
    marginTop: 6,
    textAlign: 'center',
  },
});
