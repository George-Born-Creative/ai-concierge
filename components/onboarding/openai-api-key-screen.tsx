import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useMemo, useState } from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';

import { useToast } from '@/lib/toast';

type Mode = 'enter' | 'saved';

export function OpenAIApiKeyScreen() {
  const router = useRouter();
  const { show } = useToast();
  const { provider } = useLocalSearchParams<{ provider?: string }>();
  const [apiKey, setApiKey] = useState('');
  const [savedLast4, setSavedLast4] = useState<string | null>(null);
  const [mode, setMode] = useState<Mode>('enter');

  const maskedKey = useMemo(() => (savedLast4 ? `sk-•••• •••• ${savedLast4}` : ''), [savedLast4]);

  function saveKey() {
    const trimmed = apiKey.trim();
    if (!trimmed) {
      show('Enter your OpenAI API key to continue.', 'error');
      return;
    }
    if (trimmed.length < 8) {
      show('That key looks too short. Paste the full key (sk-...).', 'error');
      return;
    }

    // Phase 1: POST /openai/keys to the backend; on success use the returned
    // last4 instead of slicing on the client.
    const last4 = trimmed.slice(-4);
    setSavedLast4(last4);
    setApiKey('');
    setMode('saved');
    show('OpenAI key saved securely.', 'success');
  }

  function startReplace() {
    setMode('enter');
    setApiKey('');
  }

  function finish() {
    router.replace('/(tabs)');
  }

  return (
    <SafeAreaView style={styles.screen}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={styles.keyboardView}>
        <ScrollView
          contentContainerStyle={styles.content}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}>
          <Pressable style={styles.backButton} onPress={() => router.replace('/connect')}>
            <MaterialIcons name="arrow-back" size={22} color="#202124" />
          </Pressable>

          <View style={styles.headerIcon}>
            <MaterialIcons name="key" size={34} color="#1A73E8" />
          </View>
          <Text style={styles.title}>Your OpenAI API key</Text>
          <Text style={styles.subtitle}>
            {provider
              ? 'Your CRM is connected. Add your OpenAI key to power voice commands.'
              : 'Add your OpenAI key to power voice commands.'}
          </Text>
          <Text style={styles.helperText}>
            Stored encrypted on our server. We never show your full key again after you save it.
          </Text>

          {mode === 'saved' && savedLast4 ? (
            <View style={styles.formCard}>
              <Text style={styles.fieldLabel}>Saved key</Text>
              <View style={styles.maskedKey}>
                <MaterialIcons name="lock" size={20} color="#34A853" />
                <Text style={styles.maskedKeyText}>{maskedKey}</Text>
              </View>
              <Text style={styles.maskedHint}>You can replace this key at any time.</Text>

              <Pressable style={styles.secondaryButton} onPress={startReplace}>
                <MaterialIcons name="refresh" size={20} color="#1A73E8" />
                <Text style={styles.secondaryButtonText}>Replace key</Text>
              </Pressable>

              <Pressable style={styles.primaryButton} onPress={finish}>
                <Text style={styles.primaryButtonText}>Continue to the app</Text>
                <MaterialIcons name="arrow-forward" size={22} color="#FFFFFF" />
              </Pressable>
            </View>
          ) : (
            <View style={styles.formCard}>
              <Text style={styles.fieldLabel}>OpenAI API Key</Text>
              <View style={styles.inputShell}>
                <MaterialIcons name="vpn-key" size={21} color="#80868B" />
                <TextInput
                  value={apiKey}
                  onChangeText={setApiKey}
                  placeholder="sk-..."
                  placeholderTextColor="#9AA0A6"
                  style={styles.input}
                  autoCapitalize="none"
                  autoCorrect={false}
                  secureTextEntry
                  returnKeyType="done"
                  onSubmitEditing={saveKey}
                />
              </View>

              <Pressable style={styles.primaryButton} onPress={saveKey}>
                <Text style={styles.primaryButtonText}>Save key securely</Text>
                <MaterialIcons name="check" size={22} color="#FFFFFF" />
              </Pressable>
            </View>
          )}
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: '#F8FAFF',
  },
  keyboardView: {
    flex: 1,
  },
  content: {
    flexGrow: 1,
    paddingHorizontal: 12,
    paddingTop: 24,
    paddingBottom: 120,
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
    lineHeight: 40,
    marginTop: 22,
  },
  subtitle: {
    color: '#5F6368',
    fontSize: 16,
    lineHeight: 24,
    marginTop: 10,
  },
  helperText: {
    color: '#80868B',
    fontSize: 13,
    lineHeight: 19,
    marginTop: 6,
  },
  formCard: {
    backgroundColor: '#FFFFFF',
    borderColor: '#E8EAED',
    borderRadius: 16,
    borderWidth: 1,
    marginTop: 28,
    padding: 18,
  },
  fieldLabel: {
    color: '#202124',
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 12,
  },
  inputShell: {
    alignItems: 'center',
    backgroundColor: '#F8FAFF',
    borderColor: '#E4EBF7',
    borderRadius: 12,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 10,
    minHeight: 54,
    paddingHorizontal: 16,
  },
  input: {
    color: '#202124',
    flex: 1,
    fontSize: 16,
  },
  maskedKey: {
    alignItems: 'center',
    backgroundColor: '#F1F8F4',
    borderColor: '#CDE6D5',
    borderRadius: 12,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 10,
    minHeight: 54,
    paddingHorizontal: 16,
  },
  maskedKeyText: {
    color: '#1A5C33',
    fontSize: 16,
    fontWeight: '600',
    letterSpacing: 1,
  },
  maskedHint: {
    color: '#5F6368',
    fontSize: 13,
    lineHeight: 18,
    marginTop: 10,
  },
  primaryButton: {
    alignItems: 'center',
    backgroundColor: '#1A73E8',
    borderRadius: 12,
    flexDirection: 'row',
    gap: 8,
    justifyContent: 'center',
    marginTop: 18,
    minHeight: 56,
  },
  primaryButtonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '600',
  },
  secondaryButton: {
    alignItems: 'center',
    borderColor: '#1A73E8',
    borderRadius: 12,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 8,
    justifyContent: 'center',
    marginTop: 18,
    minHeight: 52,
  },
  secondaryButtonText: {
    color: '#1A73E8',
    fontSize: 15,
    fontWeight: '600',
  },
});
