import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { useRouter } from 'expo-router';
import type { ReactNode } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { APP_BG, BORDER, HEADER_ACTION, HEADER_ROW } from '@/constants/theme';

// Reusable sticky page header. Lives outside the screen's ScrollView so it
// stays anchored to the top while content scrolls underneath. Used by the
// signup/signin and settings screens.

type PageHeaderProps = {
  /**
   * Title shown in the header. If omitted, the four-dot brand mark is shown
   * instead (used on signin / signup).
   */
  title?: string;
  /**
   * Render a back-arrow on the left. When pressed, falls back to
   * `router.back()` unless `onBack` is provided.
   */
  showBack?: boolean;
  onBack?: () => void;
  /** Optional right-side slot for an action button. */
  right?: ReactNode;
};

export function PageHeader({ title, showBack, onBack, right }: PageHeaderProps) {
  const router = useRouter();
  const insets = useSafeAreaInsets();

  function handleBack() {
    if (onBack) {
      onBack();
      return;
    }
    if (router.canGoBack()) {
      router.back();
    } else {
      router.replace('/');
    }
  }

  return (
    <View style={[styles.headerWrapper, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <View style={styles.leftGroup}>
          {showBack ? (
            <Pressable
              accessibilityLabel="Go back"
              hitSlop={10}
              onPress={handleBack}
              style={styles.actionButton}>
              <MaterialIcons name="arrow-back" size={24} color="#202124" />
            </Pressable>
          ) : null}

          {title ? (
            <Text style={styles.title} numberOfLines={1}>
              {title}
            </Text>
          ) : (
            <View style={styles.brand}>
              <View style={styles.logoMark}>
                <View style={[styles.logoDot, styles.blueDot]} />
                <View style={[styles.logoDot, styles.redDot]} />
                <View style={[styles.logoDot, styles.yellowDot]} />
                <View style={[styles.logoDot, styles.greenDot]} />
              </View>
              <Text style={styles.brandName}>AI-Concierge</Text>
            </View>
          )}
        </View>

        {right ? <View style={styles.right}>{right}</View> : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  headerWrapper: {
    backgroundColor: APP_BG,
    borderBottomColor: BORDER,
    borderBottomWidth: 1,
  },
  header: {
    alignItems: 'center',
    flexDirection: 'row',
    height: HEADER_ROW,
    justifyContent: 'space-between',
    paddingHorizontal: 12,
  },
  leftGroup: {
    alignItems: 'center',
    flex: 1,
    flexDirection: 'row',
    gap: 8,
  },
  actionButton: {
    alignItems: 'center',
    height: HEADER_ACTION,
    justifyContent: 'center',
    width: HEADER_ACTION,
  },
  title: {
    color: '#202124',
    flexShrink: 1,
    fontSize: 18,
    fontWeight: '600',
    letterSpacing: -0.2,
  },
  brand: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 10,
  },
  brandName: {
    color: '#202124',
    fontSize: 17,
    fontWeight: '600',
    letterSpacing: -0.2,
  },
  // Four-dot logo, mirrors the home/auth screens but sized for a header bar.
  logoMark: {
    alignItems: 'center',
    height: 32,
    justifyContent: 'center',
    width: 32,
  },
  logoDot: {
    borderRadius: 8,
    position: 'absolute',
  },
  blueDot: {
    backgroundColor: '#4285F4',
    height: 19,
    left: 3,
    width: 19,
  },
  redDot: {
    backgroundColor: '#EA4335',
    height: 12,
    right: 4,
    top: 4,
    width: 12,
  },
  yellowDot: {
    backgroundColor: '#FBBC04',
    bottom: 4,
    height: 11,
    right: 6,
    width: 11,
  },
  greenDot: {
    backgroundColor: '#34A853',
    bottom: 7,
    height: 9,
    left: 9,
    width: 9,
  },
  right: {
    alignItems: 'center',
    flexDirection: 'row',
  },
});
