import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { useRouter } from 'expo-router';
import type { ReactNode } from 'react';
import { Platform, Pressable, StatusBar, StyleSheet, Text, View } from 'react-native';

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

const STATUS_BAR_HEIGHT = Platform.OS === 'android' ? StatusBar.currentHeight ?? 24 : 0;

export function PageHeader({ title, showBack, onBack, right }: PageHeaderProps) {
  const router = useRouter();

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
    <View style={styles.headerWrapper}>
      <View style={styles.header}>
        <View style={styles.leftGroup}>
          {showBack ? (
            <Pressable
              accessibilityLabel="Go back"
              hitSlop={10}
              onPress={handleBack}
              style={styles.backButton}>
              <MaterialIcons name="arrow-back" size={22} color="#202124" />
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

// Header height (excluding the status-bar padding). "Medium-height rectangle"
// as requested.
const HEADER_HEIGHT = 60;

const styles = StyleSheet.create({
  headerWrapper: {
    backgroundColor: '#FFFFFF',
    borderBottomColor: '#E8EAED',
    borderBottomWidth: 1,
    paddingTop: STATUS_BAR_HEIGHT,
  },
  header: {
    alignItems: 'center',
    flexDirection: 'row',
    height: HEADER_HEIGHT,
    justifyContent: 'space-between',
    paddingHorizontal: 16,
  },
  leftGroup: {
    alignItems: 'center',
    flex: 1,
    flexDirection: 'row',
    gap: 12,
  },
  backButton: {
    alignItems: 'center',
    height: 36,
    justifyContent: 'center',
    width: 36,
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
