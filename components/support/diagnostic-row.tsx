import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { StyleSheet, Text, View } from 'react-native';

import { UiRadii, UiSpacing, UiTypography } from '@/constants/theme';
import type {
  SupportDiagnosticItem,
  SupportDiagnosticStatus,
} from '@/lib/api/types';
import { useAppTheme } from '@/lib/theme/theme-provider';

const STATUS_META: Record<
  SupportDiagnosticStatus,
  { icon: 'check-circle' | 'warning' | 'error' | 'info'; label: string }
> = {
  ok: { icon: 'check-circle', label: 'Healthy' },
  warning: { icon: 'warning', label: 'Needs attention' },
  error: { icon: 'error', label: 'Unavailable' },
  info: { icon: 'info', label: 'Information' },
};

export function DiagnosticRow({ item }: { item: SupportDiagnosticItem }) {
  const { colors } = useAppTheme();
  const meta = STATUS_META[item.status];
  const statusColor =
    item.status === 'ok'
      ? colors.success
      : item.status === 'warning'
        ? colors.warning
        : item.status === 'error'
          ? colors.danger
          : colors.info;

  return (
    <View
      accessibilityLabel={`${item.label}. ${meta.label}. ${item.value}${item.detail ? `. ${item.detail}` : ''}`}
      style={styles.row}>
      <View
        style={[
          styles.iconWrap,
          {
            backgroundColor:
              item.status === 'ok'
                ? colors.successSurface
                : item.status === 'warning'
                  ? colors.warningSurface
                  : item.status === 'error'
                    ? colors.dangerSurface
                    : colors.infoSurface,
          },
        ]}>
        <MaterialIcons name={meta.icon} size={19} color={statusColor} />
      </View>
      <View style={styles.copy}>
        <Text style={[styles.label, { color: colors.textPrimary }]}>{item.label}</Text>
        {item.detail ? (
          <Text style={[styles.detail, { color: colors.textSecondary }]}>{item.detail}</Text>
        ) : null}
      </View>
      <View style={styles.valueWrap}>
        <Text style={[styles.value, { color: statusColor }]}>{item.value}</Text>
        <Text style={[styles.statusLabel, { color: colors.textMuted }]}>{meta.label}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: UiSpacing.sm,
    minHeight: 60,
    paddingHorizontal: UiSpacing.md,
    paddingVertical: UiSpacing.sm,
  },
  iconWrap: {
    alignItems: 'center',
    borderRadius: UiRadii.icon,
    height: 32,
    justifyContent: 'center',
    width: 32,
  },
  copy: { flex: 1, gap: UiSpacing.xxs },
  label: { fontSize: UiTypography.bodySmall.fontSize, fontWeight: '700', lineHeight: UiTypography.bodySmall.lineHeight },
  detail: { fontSize: UiTypography.label.fontSize, lineHeight: UiTypography.label.lineHeight },
  valueWrap: { alignItems: 'flex-end', gap: 1, maxWidth: '37%' },
  value: { fontSize: UiTypography.label.fontSize, fontWeight: '700', lineHeight: UiTypography.label.lineHeight, textAlign: 'right' },
  statusLabel: { fontSize: 10, fontWeight: '600', lineHeight: 14, textAlign: 'right' },
});
