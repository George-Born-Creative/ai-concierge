import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { Pressable, SafeAreaView, ScrollView, StyleSheet, Text, View } from 'react-native';

import type { CrmProvider, PlanId } from '@/lib/api';

type PlanCard = {
  id: PlanId;
  provider: CrmProvider;
  name: string;
  price: string;
  description: string;
  features: string[];
  icon: keyof typeof MaterialIcons.glyphMap;
};

const PLANS: PlanCard[] = [
  {
    id: 'ghl-pro',
    provider: 'ghl',
    name: 'GoHighLevel plan',
    price: '$29',
    description: 'Voice AI that drives your GoHighLevel CRM.',
    features: [
      'GHL contacts, deals, notes, tasks',
      'Trigger GHL workflows by voice',
      'Per-location access',
    ],
    icon: 'hub',
  },
  {
    id: 'hubspot-pro',
    provider: 'hubspot',
    name: 'HubSpot plan',
    price: '$29',
    description: 'Voice AI that drives your HubSpot CRM.',
    features: [
      'HubSpot contacts and deals',
      'Add notes and create tasks by voice',
      'Per-portal access',
    ],
    icon: 'cloud',
  },
];

export function PlanSelectionScreen() {
  const router = useRouter();
  const [selectedPlan, setSelectedPlan] = useState<PlanId>('ghl-pro');

  const active = PLANS.find((plan) => plan.id === selectedPlan) ?? PLANS[0];

  function continueToPayment() {
    router.push({
      pathname: '/payment',
      params: { plan: active.id, provider: active.provider },
    });
  }

  return (
    <SafeAreaView style={styles.screen}>
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <Pressable style={styles.backButton} onPress={() => router.replace('/signup')}>
          <MaterialIcons name="arrow-back" size={22} color="#202124" />
        </Pressable>

        <View style={styles.headerIcon}>
          <MaterialIcons name="workspace-premium" size={34} color="#1A73E8" />
        </View>
        <Text style={styles.title}>Choose your CRM plan</Text>
        <Text style={styles.subtitle}>
          One subscription = one CRM integration. Pick the CRM you want your voice AI to drive.
        </Text>

        <View style={styles.planList}>
          {PLANS.map((plan) => {
            const isSelected = selectedPlan === plan.id;

            return (
              <Pressable
                key={plan.id}
                style={[styles.planCard, isSelected && styles.selectedPlanCard]}
                onPress={() => setSelectedPlan(plan.id)}>
                <View style={styles.planHeader}>
                  <View style={styles.planTitleRow}>
                    <View style={styles.planIcon}>
                      <MaterialIcons name={plan.icon} size={22} color="#1A73E8" />
                    </View>
                    <View style={styles.planTitleCopy}>
                      <Text style={styles.planName}>{plan.name}</Text>
                      <Text style={styles.planDescription}>{plan.description}</Text>
                    </View>
                  </View>
                  <View style={styles.pricePill}>
                    <Text style={styles.price}>{plan.price}</Text>
                    <Text style={styles.priceMeta}>/mo</Text>
                  </View>
                </View>

                <View style={styles.featuresList}>
                  {plan.features.map((feature) => (
                    <View key={feature} style={styles.featureRow}>
                      <MaterialIcons name="check-circle" size={20} color="#34A853" />
                      <Text style={styles.featureText}>{feature}</Text>
                    </View>
                  ))}
                </View>

                <View style={[styles.radio, isSelected && styles.selectedRadio]}>
                  {isSelected ? <View style={styles.radioDot} /> : null}
                </View>
              </Pressable>
            );
          })}
        </View>

        <Pressable style={styles.primaryButton} onPress={continueToPayment}>
          <Text style={styles.primaryButtonText}>Continue to payment</Text>
          <MaterialIcons name="arrow-forward" size={22} color="#FFFFFF" />
        </Pressable>
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
  backButton: {
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderColor: '#E8EAED',
    borderRadius: 14,
    borderWidth: 1,
    height: 44,
    justifyContent: 'center',
    marginBottom: 22,
    width: 44,
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
    letterSpacing: -1,
    marginTop: 22,
  },
  subtitle: {
    color: '#5F6368',
    fontSize: 16,
    lineHeight: 24,
    marginTop: 10,
  },
  planList: {
    gap: 16,
    marginTop: 28,
  },
  planCard: {
    backgroundColor: '#FFFFFF',
    borderColor: '#E8EAED',
    borderRadius: 16,
    borderWidth: 1,
    padding: 18,
  },
  selectedPlanCard: {
    borderColor: '#1A73E8',
    shadowColor: '#1A73E8',
    shadowOffset: { width: 0, height: 14 },
    shadowOpacity: 0.12,
    shadowRadius: 24,
  },
  planHeader: {
    alignItems: 'flex-start',
    flexDirection: 'row',
    gap: 12,
    justifyContent: 'space-between',
  },
  planTitleRow: {
    alignItems: 'center',
    flex: 1,
    flexDirection: 'row',
    gap: 12,
  },
  planIcon: {
    alignItems: 'center',
    backgroundColor: '#E8F0FE',
    borderRadius: 12,
    height: 42,
    justifyContent: 'center',
    width: 42,
  },
  planTitleCopy: {
    flex: 1,
  },
  planName: {
    color: '#202124',
    fontSize: 18,
    fontWeight: '600',
  },
  planDescription: {
    color: '#5F6368',
    fontSize: 13,
    lineHeight: 19,
    marginTop: 4,
  },
  pricePill: {
    alignItems: 'center',
    backgroundColor: '#E8F0FE',
    borderRadius: 18,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  price: {
    color: '#1A73E8',
    fontSize: 22,
    fontWeight: '600',
  },
  priceMeta: {
    color: '#5F6368',
    fontSize: 11,
    fontWeight: '600',
  },
  featuresList: {
    gap: 10,
    marginTop: 18,
  },
  featureRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 10,
  },
  featureText: {
    color: '#3C4043',
    fontSize: 14,
    fontWeight: '600',
  },
  radio: {
    alignItems: 'center',
    borderColor: '#DADCE0',
    borderRadius: 12,
    borderWidth: 2,
    height: 24,
    justifyContent: 'center',
    position: 'absolute',
    right: 18,
    bottom: 18,
    width: 24,
  },
  selectedRadio: {
    borderColor: '#1A73E8',
  },
  radioDot: {
    backgroundColor: '#1A73E8',
    borderRadius: 6,
    height: 12,
    width: 12,
  },
  primaryButton: {
    alignItems: 'center',
    backgroundColor: '#1A73E8',
    borderRadius: 12,
    flexDirection: 'row',
    gap: 8,
    justifyContent: 'center',
    marginTop: 24,
    minHeight: 58,
  },
  primaryButtonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '600',
  },
});
