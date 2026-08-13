import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { useRouter } from 'expo-router';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { HEADER_ACTION, HEADER_ROW } from '@/constants/theme';
import { useAppTheme } from '@/lib/theme/theme-provider';

export function AppHeader() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { colors } = useAppTheme();

  return (
    <View
      style={[
        styles.headerWrapper,
        {
          backgroundColor: colors.headerBackground,
          borderBottomColor: colors.border,
          paddingTop: insets.top,
        },
      ]}>
      <View style={styles.header}>
        <View style={styles.brand}>
          <View style={styles.logoMark}>
            <View style={[styles.logoDot, styles.blueDot]} />
            <View style={[styles.logoDot, styles.redDot]} />
            <View style={[styles.logoDot, styles.yellowDot]} />
            <View style={[styles.logoDot, styles.greenDot]} />
          </View>
          <View>
            <Text style={[styles.appName, { color: colors.textPrimary }]}>AI-Concierge</Text>
            <Text style={[styles.appTagline, { color: colors.textSecondary }]}>Voice assistant</Text>
          </View>
        </View>

        <Pressable
          accessibilityLabel="History"
          hitSlop={10}
          style={styles.actionButton}
          onPress={() => router.push('/history')}>
          <MaterialIcons name="history" size={24} color={colors.primary} />
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  headerWrapper: {
    borderBottomWidth: 1,
  },
  header: {
    alignItems: 'center',
    flexDirection: 'row',
    height: HEADER_ROW,
    justifyContent: 'space-between',
    paddingHorizontal: 12,
  },
  actionButton: {
    alignItems: 'center',
    height: HEADER_ACTION,
    justifyContent: 'center',
    width: HEADER_ACTION,
  },
  brand: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 12,
  },
  logoMark: {
    alignItems: 'center',
    height: 46,
    justifyContent: 'center',
    width: 46,
  },
  logoDot: {
    borderRadius: 10,
    position: 'absolute',
  },
  blueDot: {
    backgroundColor: '#4285F4',
    height: 27,
    left: 4,
    width: 27,
  },
  redDot: {
    backgroundColor: '#EA4335',
    height: 17,
    right: 6,
    top: 6,
    width: 17,
  },
  yellowDot: {
    backgroundColor: '#FBBC04',
    bottom: 6,
    height: 15,
    right: 8,
    width: 15,
  },
  greenDot: {
    backgroundColor: '#34A853',
    bottom: 10,
    height: 12,
    left: 12,
    width: 12,
  },
  appName: {
    fontSize: 20,
    fontWeight: '600',
    letterSpacing: -0.3,
  },
  appTagline: {
    fontSize: 12,
    fontWeight: '600',
    marginTop: 2,
  },
});
