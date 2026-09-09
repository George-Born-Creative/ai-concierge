import { StyleSheet, Text, View } from 'react-native';

import { UiSpacing, UiTypography } from '@/constants/theme';
import type { HubspotContactSummary } from '@/lib/api/types';
import { useAppTheme } from '@/lib/theme/theme-provider';

const EMPTY = 'None';

function displayText(value?: string | null): string {
  const trimmed = value?.trim();
  return trimmed ? trimmed : EMPTY;
}

function displayDate(value?: string): string {
  const trimmed = value?.trim();
  if (!trimmed) return EMPTY;
  const date = new Date(trimmed);
  if (Number.isNaN(date.getTime())) return trimmed;
  return date.toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

type HubspotContactCardProps = {
  contact: HubspotContactSummary;
};

export function HubspotContactCard({ contact }: HubspotContactCardProps) {
  const { colors } = useAppTheme();
  const details = [
    { label: 'Name', value: displayText(contact.name) },
    { label: 'First name', value: displayText(contact.firstName) },
    { label: 'Last name', value: displayText(contact.lastName) },
    { label: 'Email', value: displayText(contact.email) },
    { label: 'Phone', value: displayText(contact.phone) },
    { label: 'Mobile', value: displayText(contact.mobilePhone) },
    { label: 'Fax', value: displayText(contact.fax) },
    { label: 'Company', value: displayText(contact.company) },
    { label: 'Job title', value: displayText(contact.jobTitle) },
    { label: 'Website', value: displayText(contact.website) },
    { label: 'Address', value: displayText(contact.address) },
    { label: 'City', value: displayText(contact.city) },
    { label: 'State', value: displayText(contact.state) },
    { label: 'Postal code', value: displayText(contact.postalCode) },
    { label: 'Country', value: displayText(contact.country) },
    { label: 'Lifecycle stage', value: displayText(contact.lifecycleStage) },
    { label: 'Lead status', value: displayText(contact.leadStatus) },
    { label: 'Owner', value: displayText(contact.ownerId) },
    { label: 'Created', value: displayDate(contact.createdAt) },
    { label: 'Updated', value: displayDate(contact.updatedAt) },
  ];

  return (
    <View style={[styles.grid, { borderTopColor: colors.border }]}>
      {details.map((detail) => (
        <View key={detail.label} style={styles.cell}>
          <Text style={[styles.label, { color: colors.textSecondary }]}>{detail.label}</Text>
          <Text
            selectable
            style={[
              styles.value,
              { color: detail.value === EMPTY ? colors.textMuted : colors.textPrimary },
            ]}>
            {detail.value}
          </Text>
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  grid: {
    borderTopWidth: 1,
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginTop: UiSpacing.sm,
    paddingTop: UiSpacing.sm,
  },
  cell: {
    paddingBottom: UiSpacing.sm,
    paddingRight: UiSpacing.md,
    width: '50%',
  },
  label: {
    fontSize: UiTypography.caption.fontSize,
    fontWeight: '600',
    letterSpacing: 0.2,
    lineHeight: UiTypography.caption.lineHeight,
    textTransform: 'uppercase',
  },
  value: {
    fontSize: UiTypography.label.fontSize,
    lineHeight: UiTypography.label.lineHeight,
  },
});
