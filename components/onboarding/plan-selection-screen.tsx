import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { Pressable, SafeAreaView, ScrollView, StyleSheet, Text, View } from 'react-native';

const plans = [
  {
    id: 'starter',
    name: 'Starter',
    price: '$0',
    description: 'Try AI-Concierge with basic assistant access.',
    features: ['Text commands', 'Recent activity', 'Profile tools'],
  },
  {
    id: 'pro',
    name: 'Pro',
    price: '$9',
    description: 'Unlock the full voice concierge experience.',
    features: ['Voice commands', 'Contact automation', 'Priority updates'],
  },
] as const;

export function PlanSelectionScreen() {
  const router = useRouter();
  const [selectedPlan, setSelectedPlan] = useState<(typeof plans)[number]['id']>('pro');

  return (
    <SafeAreaView style={styles.screen}>
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <Pressable style={styles.backButton} onPress={() => router.replace('/signup')}>
          <MaterialIcons name="arrow-back" size={22} color="#202124" />
        </Pressable>

        <View style={styles.headerIcon}>
          <MaterialIcons name="workspace-premium" size={34} color="#1A73E8" />
        </View>
        <Text style={styles.title}>Choose your plan</Text>
        <Text style={styles.subtitle}>
          Select how you want to use AI-Concierge. You can connect real billing later.
        </Text>

        <View style={styles.planList}>
          {plans.map((plan) => {
            const isSelected = selectedPlan === plan.id;

            return (
              <Pressable
                key={plan.id}
                style={[styles.planCard, isSelected && styles.selectedPlanCard]}
                onPress={() => setSelectedPlan(plan.id)}>
                <View style={styles.planHeader}>
                  <View>
                    <Text style={styles.planName}>{plan.name}</Text>
                    <Text style={styles.planDescription}>{plan.description}</Text>
                  </View>
                  <View style={styles.pricePill}>
                    <Text style={styles.price}>{plan.price}</Text>
                    <Text style={styles.priceMeta}>{plan.id === 'starter' ? 'now' : '/mo'}</Text>
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

        <Pressable
          style={styles.primaryButton}
          onPress={() => router.push({ pathname: '/payment', params: { plan: selectedPlan } })}>
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
  planName: {
    color: '#202124',
    fontSize: 22,
    fontWeight: '600',
  },
  planDescription: {
    color: '#5F6368',
    fontSize: 14,
    lineHeight: 20,
    marginTop: 5,
    maxWidth: 190,
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
