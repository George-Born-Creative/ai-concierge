import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { Link } from 'expo-router';
import { StyleSheet, Text, View } from 'react-native';

import { ScreenShell } from '@/components/screen';
import { useAppTheme } from '@/lib/theme/theme-provider';

export default function ModalScreen() {
  const { colors } = useAppTheme();
  return (
    <ScreenShell edges={['top', 'bottom']}>
      <View style={styles.container}>
        <View style={styles.card}>
          <View style={styles.iconWrap}>
            <MaterialIcons name="mic" size={34} color={colors.onPrimary} />
          </View>
          <Text style={styles.title}>Voice concierge</Text>
          <Text style={styles.subtitle}>
            Tap the mic from Assistant to start a natural conversation with your concierge.
          </Text>
        </View>
        <Link href="/" dismissTo style={styles.link}>
          <Text style={styles.linkText}>Back to Assistant</Text>
        </Link>
      </View>
    </ScreenShell>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 12,
    paddingVertical: 24,
  },
  card: {
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderColor: '#E8EAED',
    borderRadius: 16,
    borderWidth: 1,
    padding: 28,
  },
  iconWrap: {
    alignItems: 'center',
    backgroundColor: '#1A73E8',
    borderRadius: 32,
    height: 64,
    justifyContent: 'center',
    marginBottom: 20,
    width: 64,
  },
  title: {
    color: '#202124',
    fontSize: 28,
    fontWeight: '600',
    textAlign: 'center',
  },
  subtitle: {
    color: '#5F6368',
    fontSize: 16,
    lineHeight: 24,
    marginTop: 10,
    textAlign: 'center',
  },
  link: {
    marginTop: 18,
    paddingVertical: 15,
  },
  linkText: {
    color: '#1A73E8',
    fontSize: 16,
    fontWeight: '600',
  },
});
