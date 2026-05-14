import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';

export function PaymentScreen() {
  const router = useRouter();
  const { plan } = useLocalSearchParams<{ plan?: string }>();
  const [isPaying, setIsPaying] = useState(false);
  const selectedPlan = plan === 'starter' ? 'Starter' : 'Pro';

  async function completePayment() {
    setIsPaying(true);

    setTimeout(() => {
      setIsPaying(false);
      router.replace('/connect');
    }, 350);
  }

  return (
    <SafeAreaView style={styles.screen}>
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <View style={styles.headerIcon}>
          <MaterialIcons name="payments" size={34} color="#1A73E8" />
        </View>
        <Text style={styles.title}>Secure checkout</Text>
        <Text style={styles.subtitle}>
          Finish setup for the {selectedPlan} plan using Stripe checkout. Card details are collected
          securely by Stripe.
        </Text>

        <View style={styles.summaryCard}>
          <Text style={styles.summaryLabel}>Selected plan</Text>
          <Text style={styles.summaryPlan}>{selectedPlan}</Text>
        </View>

        <View style={styles.formCard}>
          <View style={styles.securityRow}>
            <MaterialIcons name="verified-user" size={24} color="#34A853" />
            <View style={styles.securityCopy}>
              <Text style={styles.securityTitle}>Stripe secure payment</Text>
              <Text style={styles.securityText}>
                AI-Concierge does not store card numbers. Payment details stay inside Stripe.
              </Text>
            </View>
          </View>

          <Pressable
            style={[styles.primaryButton, isPaying && styles.disabledButton]}
            onPress={completePayment}
            disabled={isPaying}>
            {isPaying ? (
              <ActivityIndicator color="#FFFFFF" />
            ) : (
              <>
                <MaterialIcons name="lock" size={21} color="#FFFFFF" />
                <Text style={styles.primaryButtonText}>Pay with Stripe</Text>
              </>
            )}
          </Pressable>

          <Pressable style={styles.secondaryButton} onPress={() => router.back()} disabled={isPaying}>
            <Text style={styles.secondaryButtonText}>Change plan</Text>
          </Pressable>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: '#F8FAFF',
  },
  content: {
    paddingHorizontal: 12,
    paddingTop: 24,
    paddingBottom: 42,
  },
  headerIcon: {
    alignItems: 'center',
    backgroundColor: '#E8F0FE',
    borderRadius: 32,
    height: 64,
    justifyContent: 'center',
    width: 64,
  },
  title: {
    color: '#202124',
    fontSize: 34,
    fontWeight: '600',
    letterSpacing: -0.8,
    marginTop: 22,
  },
  subtitle: {
    color: '#5F6368',
    fontSize: 16,
    lineHeight: 24,
    marginTop: 10,
  },
  summaryCard: {
    backgroundColor: '#E8F0FE',
    borderRadius: 14,
    marginTop: 24,
    padding: 18,
  },
  summaryLabel: {
    color: '#5F6368',
    fontSize: 12,
    fontWeight: '600',
    letterSpacing: 1,
    textTransform: 'uppercase',
  },
  summaryPlan: {
    color: '#174EA6',
    fontSize: 24,
    fontWeight: '600',
    marginTop: 4,
  },
  formCard: {
    backgroundColor: '#FFFFFF',
    borderColor: '#E8EAED',
    borderRadius: 16,
    borderWidth: 1,
    marginTop: 18,
    padding: 20,
  },
  securityRow: {
    alignItems: 'flex-start',
    backgroundColor: '#F8FAFF',
    borderRadius: 14,
    flexDirection: 'row',
    gap: 12,
    padding: 16,
  },
  securityCopy: {
    flex: 1,
  },
  securityTitle: {
    color: '#202124',
    fontSize: 16,
    fontWeight: '600',
  },
  securityText: {
    color: '#5F6368',
    fontSize: 14,
    lineHeight: 20,
    marginTop: 4,
  },
  primaryButton: {
    alignItems: 'center',
    backgroundColor: '#1A73E8',
    borderRadius: 12,
    flexDirection: 'row',
    gap: 9,
    justifyContent: 'center',
    marginTop: 20,
    minHeight: 56,
  },
  disabledButton: {
    opacity: 0.65,
  },
  primaryButtonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '600',
  },
  secondaryButton: {
    alignItems: 'center',
    marginTop: 16,
  },
  secondaryButtonText: {
    color: '#1A73E8',
    fontSize: 14,
    fontWeight: '600',
  },
});
