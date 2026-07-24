import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { StyleSheet, Text, View } from 'react-native';

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
    gap: 11,
    minHeight: 68,
    paddingHorizontal: 14,
    paddingVertical: 11,
  },
  iconWrap: {
    alignItems: 'center',
    borderRadius: 10,
    height: 36,
    justifyContent: 'center',
    width: 36,
  },
  copy: { flex: 1, gap: 2 },
  label: { fontSize: 14, fontWeight: '700', lineHeight: 19 },
  detail: { fontSize: 12, lineHeight: 17 },
  valueWrap: { alignItems: 'flex-end', gap: 1, maxWidth: '37%' },
  value: { fontSize: 13, fontWeight: '700', lineHeight: 18, textAlign: 'right' },
  statusLabel: { fontSize: 10, fontWeight: '600', lineHeight: 14, textAlign: 'right' },
});
