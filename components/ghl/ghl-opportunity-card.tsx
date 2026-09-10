import { StyleSheet, Text, View } from 'react-native';

import { UiSpacing, UiTypography } from '@/constants/theme';
import type { GhlOpportunitySummary } from '@/lib/api/types';
import { useAppTheme } from '@/lib/theme/theme-provider';

const EMPTY = 'None';

const STATUS_LABELS: Record<string, string> = {
  open: 'Open',
  won: 'Won',
  lost: 'Lost',
  abandoned: 'Abandoned',
};

function displayText(value?: string | null): string {
  const trimmed = value?.trim();
  return trimmed ? trimmed : EMPTY;
}

function displayList(values?: string[]): string {
  const cleaned = (values ?? []).map((value) => value.trim()).filter(Boolean);
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

function displayMoney(value?: number): string {
  if (value == null || Number.isNaN(value)) return EMPTY;
  return `$${value.toLocaleString(undefined, { maximumFractionDigits: 2 })}`;
}

function displayCount(value?: number): string {
  if (value == null || Number.isNaN(value)) return EMPTY;
  return String(value);
}

function displayProbability(value?: number): string {
  if (value == null || Number.isNaN(value)) return EMPTY;
  const percent = value > 0 && value <= 1 ? value * 100 : value;
  return `${Math.round(percent)}%`;
}

function displayStatus(value?: string): string {
  const trimmed = value?.trim();
  if (!trimmed) return EMPTY;
  return STATUS_LABELS[trimmed.toLowerCase()] ?? trimmed.replace(/[_-]+/g, ' ');
}

function displayCustomValue(value: unknown): string {
  if (value == null) return EMPTY;
  if (Array.isArray(value)) {
    const cleaned = value.map((item) => String(item).trim()).filter(Boolean);
    return cleaned.length ? cleaned.join(', ') : EMPTY;
  }
  if (typeof value === 'boolean') return value ? 'Yes' : 'No';
  const text = String(value).trim();
  return text || EMPTY;
}

function customFieldLabel(field: { id?: string; key?: string }, index: number): string {
  const key = field.key?.trim() || field.id?.trim();
  if (!key) return `Custom field ${index + 1}`;
  return key.replace(/[_-]+/g, ' ');
}

type GhlOpportunityCardProps = {
  opportunity: GhlOpportunitySummary;
};

export function GhlOpportunityCard({ opportunity }: GhlOpportunityCardProps) {
  const { colors } = useAppTheme();
  const details = [
    { label: 'Name', value: displayText(opportunity.name) },
    { label: 'Value', value: displayMoney(opportunity.monetaryValue) },
    { label: 'Status', value: displayStatus(opportunity.status) },
    { label: 'Pipeline', value: displayText(opportunity.pipelineName) },
    { label: 'Stage', value: displayText(opportunity.pipelineStageName) },
    { label: 'Contact', value: displayText(opportunity.contactName) },
    { label: 'Contact email', value: displayText(opportunity.contactEmail) },
    { label: 'Contact phone', value: displayText(opportunity.contactPhone) },
    { label: 'Assigned to', value: displayText(opportunity.assignedTo) },
    { label: 'Source', value: displayText(opportunity.source) },
    { label: 'Followers', value: displayList(opportunity.followers) },
    { label: 'Lost reason', value: displayText(opportunity.lostReasonId) },
    { label: 'Expected close', value: displayDate(opportunity.forecastExpectedCloseDate) },
    { label: 'Original close', value: displayDate(opportunity.forecastOriginalCloseDate) },
    { label: 'Forecast chance', value: displayProbability(opportunity.forecastProbability) },
    { label: 'Win chance', value: displayProbability(opportunity.effectiveProbability) },
    { label: 'Times slipped', value: displayCount(opportunity.forecastSlippageCount) },
    { label: 'Days slipped', value: displayCount(opportunity.forecastDaysSlipped) },
    { label: 'Last slipped', value: displayDate(opportunity.forecastLastSlippedAt) },
    { label: 'Last action', value: displayDate(opportunity.lastActionDate) },
    { label: 'Status changed', value: displayDate(opportunity.lastStatusChangeAt) },
    { label: 'Stage changed', value: displayDate(opportunity.lastStageChangeAt) },
    { label: 'Created', value: displayDate(opportunity.createdAt) },
    { label: 'Updated', value: displayDate(opportunity.updatedAt) },
    { label: 'Notes', value: displayList(opportunity.notes) },
    { label: 'Location', value: displayText(opportunity.locationId) },
    ...(opportunity.customFields ?? []).map((field, index) => ({
      label: customFieldLabel(field, index),
      value: displayCustomValue(field.fieldValue),
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
