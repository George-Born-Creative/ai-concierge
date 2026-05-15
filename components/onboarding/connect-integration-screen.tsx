import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Pressable, SafeAreaView, ScrollView, StyleSheet, Text, View } from 'react-native';

import type { CrmProvider } from '@/lib/api';

type IntegrationCard = {
  id: CrmProvider;
  name: string;
  description: string;
  icon: keyof typeof MaterialIcons.glyphMap;
};

const INTEGRATIONS: Record<CrmProvider, IntegrationCard> = {
  ghl: {
    id: 'ghl',
    name: 'GoHighLevel',
    description:
      'Sync contacts, opportunities, notes, tasks, and trigger workflows from voice commands.',
    icon: 'hub',
  },
  hubspot: {
    id: 'hubspot',
    name: 'HubSpot',
    description: 'Create contacts and deals, add notes, and manage your pipeline from voice.',
    icon: 'cloud',
  },
};

export function ConnectIntegrationScreen() {
  const router = useRouter();
  const { provider } = useLocalSearchParams<{ provider?: CrmProvider }>();

  // Per client spec: one subscription = one CRM. Show only the
  // integration the user paid for. Default to GHL if missing for now.
  const activeProvider: CrmProvider =
    provider === 'hubspot' ? 'hubspot' : provider === 'ghl' ? 'ghl' : 'ghl';
  const integration = INTEGRATIONS[activeProvider];

  function startConnect() {
    // Phase 1 will replace this with a backend call to
    // GET /integrations/{provider}/auth-url and open the URL in WebBrowser.
    router.push({
      pathname: '/openai-key',
      params: { provider: integration.id },
    });
  }

  return (
    <SafeAreaView style={styles.screen}>
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <Pressable style={styles.backButton} onPress={() => router.replace('/payment')}>
          <MaterialIcons name="arrow-back" size={22} color="#202124" />
        </Pressable>

        <View style={styles.headerIcon}>
          <MaterialIcons name="lan" size={34} color="#1A73E8" />
        </View>
        <Text style={styles.title}>Connect {integration.name}</Text>
        <Text style={styles.subtitle}>
          Your plan unlocks {integration.name}. We use OAuth to connect securely so you never have
          to paste any API keys.
        </Text>

        <View style={styles.integrationCard}>
          <View style={styles.integrationIcon}>
            <MaterialIcons name={integration.icon} size={26} color="#1A73E8" />
          </View>
          <View style={styles.integrationCopy}>
            <Text style={styles.integrationTitle}>{integration.name}</Text>
            <Text style={styles.integrationDescription}>{integration.description}</Text>
          </View>
        </View>

        <Pressable style={styles.primaryButton} onPress={startConnect}>
          <MaterialIcons name="link" size={22} color="#FFFFFF" />
          <Text style={styles.primaryButtonText}>Connect with OAuth</Text>
        </Pressable>

        <Text style={styles.helperText}>
          You can disconnect or switch your CRM later from the Profile tab. Switching CRMs may
          require a new subscription.
        </Text>
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
  integrationCard: {
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderColor: '#E8EAED',
    borderRadius: 16,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 14,
    marginTop: 28,
    padding: 16,
  },
  integrationIcon: {
    alignItems: 'center',
    backgroundColor: '#E8F0FE',
    borderRadius: 14,
    height: 52,
    justifyContent: 'center',
    width: 52,
  },
  integrationCopy: {
    flex: 1,
  },
  integrationTitle: {
    color: '#202124',
    fontSize: 18,
    fontWeight: '600',
  },
  integrationDescription: {
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
    gap: 8,
    justifyContent: 'center',
    marginTop: 22,
    minHeight: 58,
  },
  primaryButtonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '600',
  },
  helperText: {
    color: '#5F6368',
    fontSize: 13,
    lineHeight: 19,
    marginTop: 18,
    textAlign: 'center',
  },
});
