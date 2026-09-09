import { StyleSheet, Text, View } from 'react-native';

import { UiSpacing, UiTypography } from '@/constants/theme';
import type { GhlContactCustomField, GhlContactSummary } from '@/lib/api/types';
import { useAppTheme } from '@/lib/theme/theme-provider';

const EMPTY = 'None';

function displayText(value?: string | null): string {
  const trimmed = value?.trim();
  return trimmed ? trimmed : EMPTY;
}

function displayBool(value?: boolean): string {
  if (value === true) return 'Yes';
  if (value === false) return 'No';
  return EMPTY;
}

function displayTags(tags?: string[]): string {
  const cleaned = (tags ?? []).map((tag) => tag.trim()).filter(Boolean);
  return cleaned.length ? cleaned.join(', ') : EMPTY;
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

function displayCustomValue(value: GhlContactCustomField['field_value']): string {
  if (value == null) return EMPTY;
  if (Array.isArray(value)) {
    const cleaned = value.map((item) => String(item).trim()).filter(Boolean);
    return cleaned.length ? cleaned.join(', ') : EMPTY;
  }
  if (typeof value === 'boolean') return value ? 'Yes' : 'No';
  const text = String(value).trim();
  return text || EMPTY;
}

function customFieldLabel(field: GhlContactCustomField, index: number): string {
  const key = field.key?.trim() || field.id?.trim();
  if (!key) return `Custom field ${index + 1}`;
  return key.replace(/[_-]+/g, ' ');
}

type GhlContactCardProps = {
  contact: GhlContactSummary;
};

export function GhlContactCard({ contact }: GhlContactCardProps) {
  const { colors } = useAppTheme();
  const details = [
    { label: 'Name', value: displayText(contact.name) },
    { label: 'First name', value: displayText(contact.firstName) },
    { label: 'Last name', value: displayText(contact.lastName) },
    { label: 'Email', value: displayText(contact.email) },
    { label: 'Phone', value: displayText(contact.phone) },
    { label: 'Company', value: displayText(contact.companyName) },
    { label: 'Website', value: displayText(contact.website) },
    { label: 'Address', value: displayText(contact.address1) },
    { label: 'City', value: displayText(contact.city) },
    { label: 'State', value: displayText(contact.state) },
    { label: 'Postal code', value: displayText(contact.postalCode) },
    { label: 'Country', value: displayText(contact.country) },
    { label: 'Source', value: displayText(contact.source) },
    { label: 'Assigned to', value: displayText(contact.assignedTo) },
    { label: 'Timezone', value: displayText(contact.timezone) },
    { label: 'Type', value: displayText(contact.type) },
    { label: 'Tags', value: displayTags(contact.tags) },
    { label: 'Added', value: displayDate(contact.dateAdded) },
    { label: 'Updated', value: displayDate(contact.dateUpdated) },
    { label: 'Do not disturb', value: displayBool(contact.dnd) },
    { label: 'Location id', value: displayText(contact.locationId) },
    ...(contact.customFields ?? []).map((field, index) => ({
      label: customFieldLabel(field, index),
      value: displayCustomValue(field.field_value),
    })),
  ];

  return (
    <View style={[styles.grid, { borderTopColor: colors.border }]}>
      {details.map((detail, index) => (
        <View key={`${detail.label}-${index}`} style={styles.cell}>
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
