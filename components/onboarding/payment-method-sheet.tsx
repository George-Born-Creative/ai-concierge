import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import {
  ActivityIndicator,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';

import {
  UiControlHeights,
  UiRadii,
  UiSpacing,
  UiTypography,
} from '@/constants/theme';
import { useAppTheme } from '@/lib/theme/theme-provider';

// Which payment rail the user is mid-checkout on, so the sheet can show a
// spinner on the row they tapped while leaving the other one tappable (in
// case the first one errors and they want to fall back).
export type PaymentMethod = 'apple' | 'stripe';

type PaymentMethodSheetProps = {
  visible: boolean;
  planName: string;
  // Pre-formatted display strings (e.g. "$35", "$29"). Apple may be null for
  // a plan that isn't sold via IAP, in which case only Stripe is offered.
  applePriceDisplay: string | null;
  stripePriceDisplay: string | null;
  // Whole-number percent the Stripe price saves vs the Apple price, or null
  // when there's no meaningful discount (prices equal / Apple price unknown).
  savingsPercent: number | null;
  appleAvailable: boolean;
  // Shown under the (disabled) Apple row to explain why it can't be used.
  appleUnavailableReason?: string | null;
  stripeAvailable: boolean;
  busy: PaymentMethod | null;
  onSelectApple: () => void;
  onSelectStripe: () => void;
  onClose: () => void;
};

export function PaymentMethodSheet({
  visible,
  planName,
  applePriceDisplay,
  stripePriceDisplay,
  savingsPercent,
  appleAvailable,
  appleUnavailableReason,
  stripeAvailable,
  busy,
  onSelectApple,
  onSelectStripe,
  onClose,
}: PaymentMethodSheetProps) {
  const anyBusy = busy !== null;
  const { colors } = useAppTheme();

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={() => {
        if (!anyBusy) onClose();
      }}>
      <Pressable
        style={styles.backdrop}
        onPress={() => {
          if (!anyBusy) onClose();
        }}>
        {/* Stop touches inside the sheet from bubbling to the backdrop. */}
        <Pressable style={styles.sheet} onPress={() => {}}>
          <View style={styles.handle} />

          <Text style={styles.title}>Choose how to pay</Text>
          <Text style={styles.subtitle}>{planName}</Text>

          {/* Apple In-App Purchase */}
          <Pressable
            style={[
              styles.option,
              (!appleAvailable || anyBusy) && styles.optionDisabled,
            ]}
            onPress={onSelectApple}
            disabled={!appleAvailable || anyBusy}>
            <View style={styles.optionIcon}>
              <MaterialIcons name="apple" size={26} color={colors.textPrimary} />
            </View>
            <View style={styles.optionBody}>
              <Text style={styles.optionTitle}>Pay with Apple</Text>
              <Text style={styles.optionMeta}>
                {appleAvailable
                  ? 'Billed to your Apple ID · manage in Settings'
                  : (appleUnavailableReason ?? 'Not available right now')}
              </Text>
            </View>
            <View style={styles.optionRight}>
              {busy === 'apple' ? (
                <ActivityIndicator color={colors.primary} />
              ) : applePriceDisplay ? (
                <>
                  <Text style={styles.optionPrice}>{applePriceDisplay}</Text>
                  <Text style={styles.optionPriceMeta}>/mo</Text>
                </>
              ) : null}
            </View>
          </Pressable>

          {/* Stripe (card) */}
          <Pressable
            style={[
              styles.option,
              styles.optionStripe,
              (!stripeAvailable || anyBusy) && styles.optionDisabled,
            ]}
            onPress={onSelectStripe}
            disabled={!stripeAvailable || anyBusy}>
            <View style={styles.optionIcon}>
              <MaterialIcons name="credit-card" size={24} color={colors.primary} />
            </View>
            <View style={styles.optionBody}>
              <View style={styles.optionTitleRow}>
                <Text style={styles.optionTitle}>Pay with card</Text>
                {savingsPercent != null && savingsPercent > 0 ? (
                  <View style={styles.savingsBadge}>
                    <Text style={styles.savingsBadgeText}>
                      Save {savingsPercent}%
                    </Text>
                  </View>
                ) : null}
              </View>
              <Text style={styles.optionMeta}>
                Secure checkout powered by Stripe
              </Text>
            </View>
            <View style={styles.optionRight}>
              {busy === 'stripe' ? (
                <ActivityIndicator color={colors.primary} />
              ) : stripePriceDisplay ? (
                <>
                  {savingsPercent != null &&
                  savingsPercent > 0 &&
                  applePriceDisplay ? (
                    <Text style={styles.strikePrice}>{applePriceDisplay}</Text>
                  ) : null}
                  <Text style={styles.optionPrice}>{stripePriceDisplay}</Text>
                  <Text style={styles.optionPriceMeta}>/mo</Text>
                </>
              ) : null}
            </View>
          </Pressable>

          <Pressable
            style={styles.cancelButton}
            onPress={onClose}
            disabled={anyBusy}>
            <Text style={[styles.cancelText, anyBusy && styles.cancelTextDisabled]}>
              Cancel
            </Text>
          </Pressable>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    alignItems: 'center',
    backgroundColor: 'rgba(32, 33, 36, 0.45)',
    flex: 1,
    justifyContent: 'flex-end',
  },
  sheet: {
    backgroundColor: '#FFFFFF',
    borderTopLeftRadius: UiRadii.modal,
    borderTopRightRadius: UiRadii.modal,
    maxWidth: 640,
    paddingBottom: 34,
    paddingHorizontal: UiSpacing.lg,
    paddingTop: UiSpacing.md,
    width: '100%',
  },
  handle: {
    alignSelf: 'center',
    backgroundColor: '#DADCE0',
    borderRadius: 3,
    height: 5,
    marginBottom: UiSpacing.md,
    width: 44,
  },
  title: {
    color: '#202124',
    fontSize: UiTypography.sectionHeading.fontSize,
    fontWeight: '600',
    letterSpacing: -0.4,
    lineHeight: UiTypography.sectionHeading.lineHeight,
  },
  subtitle: {
    color: '#5F6368',
    fontSize: UiTypography.bodySmall.fontSize,
    lineHeight: UiTypography.bodySmall.lineHeight,
    marginBottom: UiSpacing.md,
    marginTop: UiSpacing.xxs,
  },
  option: {
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderColor: '#E8EAED',
    borderRadius: UiRadii.card,
    borderWidth: 1,
    flexDirection: 'row',
    gap: UiSpacing.md,
    marginTop: UiSpacing.sm,
    minHeight: 64,
    paddingHorizontal: UiSpacing.md,
    paddingVertical: UiSpacing.md,
  },
  optionStripe: {
    borderColor: '#1A73E8',
    backgroundColor: '#F6F9FE',
  },
  optionDisabled: {
    opacity: 0.5,
  },
  optionIcon: {
    alignItems: 'center',
    backgroundColor: '#F1F3F4',
    borderRadius: UiRadii.icon,
    height: UiControlHeights.iconButton,
    justifyContent: 'center',
    width: UiControlHeights.iconButton,
  },
  optionBody: {
    flex: 1,
  },
  optionTitleRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: UiSpacing.sm,
  },
  optionTitle: {
    color: '#202124',
    fontSize: UiTypography.body.fontSize,
    fontWeight: '600',
    lineHeight: UiTypography.body.lineHeight,
  },
  optionMeta: {
    color: '#5F6368',
    fontSize: UiTypography.caption.fontSize,
    lineHeight: UiTypography.caption.lineHeight,
    marginTop: 3,
  },
  optionRight: {
    alignItems: 'flex-end',
    flexDirection: 'row',
    gap: 2,
  },
  optionPrice: {
    color: '#1A73E8',
    fontSize: 18,
    fontWeight: '700',
  },
  optionPriceMeta: {
    color: '#5F6368',
    fontSize: UiTypography.caption.fontSize,
    fontWeight: '600',
    lineHeight: UiTypography.caption.lineHeight,
    paddingBottom: 2,
  },
  strikePrice: {
    color: '#9AA0A6',
    fontSize: 13,
    fontWeight: '600',
    marginRight: 6,
    paddingBottom: 1,
    textDecorationLine: 'line-through',
  },
  savingsBadge: {
    backgroundColor: '#E6F4EA',
    borderRadius: UiRadii.icon,
    paddingHorizontal: UiSpacing.sm,
    paddingVertical: 2,
  },
  savingsBadgeText: {
    color: '#188038',
    fontSize: UiTypography.caption.fontSize,
    fontWeight: '700',
    lineHeight: UiTypography.caption.lineHeight,
  },
  cancelButton: {
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: UiSpacing.md,
    minHeight: UiControlHeights.button,
  },
  cancelText: {
    color: '#5F6368',
    fontSize: UiTypography.button.fontSize,
    fontWeight: '600',
    lineHeight: UiTypography.button.lineHeight,
  },
  cancelTextDisabled: {
    opacity: 0.5,
  },
});
