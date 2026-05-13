import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { useRouter } from 'expo-router';
import { Pressable, SafeAreaView, ScrollView, StyleSheet, Text, View } from 'react-native';

const integrations = [
  {
    id: 'gohighlevel',
    name: 'GoHighLevel',
    description: 'Connect your CRM contacts, leads, and automations.',
    icon: 'hub',
  },
  {
    id: 'salesforce',
    name: 'Salesforce',
    description: 'Sync customer records and assistant context.',
    icon: 'cloud',
  },
] as const;

export function ConnectIntegrationScreen() {
  const router = useRouter();

  return (
    <SafeAreaView style={styles.screen}>
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <Pressable style={styles.backButton} onPress={() => router.replace('/payment')}>
          <MaterialIcons name="arrow-back" size={22} color="#202124" />
        </Pressable>

        <View style={styles.headerIcon}>
          <MaterialIcons name="lan" size={34} color="#1A73E8" />
        </View>
        <Text style={styles.title}>Connect your CRM</Text>
        <Text style={styles.subtitle}>
          Choose the CRM you want AI-Concierge to use for customer and contact workflows.
        </Text>

        <View style={styles.integrationList}>
          {integrations.map((integration) => (
            <Pressable
              key={integration.id}
              style={styles.integrationCard}
              onPress={() => router.push({ pathname: '/openai-key', params: { crm: integration.id } })}>
              <View style={styles.integrationIcon}>
                <MaterialIcons name={integration.icon} size={25} color="#1A73E8" />
              </View>
              <View style={styles.integrationCopy}>
                <Text style={styles.integrationTitle}>Connect {integration.name}</Text>
                <Text style={styles.integrationDescription}>{integration.description}</Text>
              </View>
              <MaterialIcons name="arrow-forward" size={22} color="#9AA0A6" />
            </Pressable>
          ))}
        </View>

        <Pressable style={styles.secondaryButton} onPress={() => router.push('/openai-key')}>
          <Text style={styles.secondaryButtonText}>Skip CRM for now</Text>
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
  integrationList: {
    gap: 14,
    marginTop: 28,
  },
  integrationCard: {
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderColor: '#E8EAED',
    borderRadius: 16,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 12,
    padding: 16,
  },
  integrationIcon: {
    alignItems: 'center',
    backgroundColor: '#E8F0FE',
    borderRadius: 14,
    height: 48,
    justifyContent: 'center',
    width: 48,
  },
  integrationCopy: {
    flex: 1,
  },
  integrationTitle: {
    color: '#202124',
    fontSize: 17,
    fontWeight: '600',
  },
  integrationDescription: {
    color: '#5F6368',
    fontSize: 14,
    lineHeight: 20,
    marginTop: 4,
  },
  secondaryButton: {
    alignItems: 'center',
    marginTop: 22,
  },
  secondaryButtonText: {
    color: '#1A73E8',
    fontSize: 15,
    fontWeight: '600',
  },
});
