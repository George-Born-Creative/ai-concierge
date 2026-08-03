import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { Link } from 'expo-router';
import { StyleSheet, Text, View } from 'react-native';

import { ScreenShell } from '@/components/screen';
import {
  UiControlHeights,
  UiRadii,
  UiSpacing,
  UiTypography,
} from '@/constants/theme';
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
    paddingHorizontal: UiSpacing.lg,
    paddingVertical: UiSpacing.xxl,
  },
  card: {
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderColor: '#E8EAED',
    borderRadius: UiRadii.card,
    borderWidth: 1,
    maxWidth: 520,
    padding: UiSpacing.xl,
    width: '100%',
  },
  iconWrap: {
    alignItems: 'center',
    backgroundColor: '#1A73E8',
    borderRadius: UiRadii.card,
    height: 52,
    justifyContent: 'center',
    marginBottom: UiSpacing.lg,
    width: 52,
  },
  title: {
    color: '#202124',
    fontSize: UiTypography.pageTitle.fontSize,
    fontWeight: '600',
    textAlign: 'center',
  },
  subtitle: {
    color: '#5F6368',
    fontSize: UiTypography.bodySmall.fontSize,
    lineHeight: UiTypography.bodySmall.lineHeight,
    marginTop: UiSpacing.sm,
    textAlign: 'center',
  },
  link: {
    justifyContent: 'center',
    marginTop: UiSpacing.lg,
    minHeight: UiControlHeights.button,
  },
  linkText: {
    color: '#1A73E8',
    fontSize: UiTypography.button.fontSize,
    fontWeight: '600',
    lineHeight: UiTypography.button.lineHeight,
  },
});
