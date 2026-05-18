import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
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

import { getMe } from '@/lib/api/auth';
import { ApiError } from '@/lib/api/client';
import { openaiApi } from '@/lib/api';
import { refreshUser } from '@/lib/session';
import { useToast } from '@/lib/toast';

type Mode = 'enter' | 'saved';

export function OpenAIApiKeyScreen() {
  const router = useRouter();
  const { show } = useToast();
  const { provider } = useLocalSearchParams<{ provider?: string }>();
  const [apiKey, setApiKey] = useState('');
  const [savedLast4, setSavedLast4] = useState<string | null>(null);
  const [mode, setMode] = useState<Mode>('enter');
  const [submitting, setSubmitting] = useState(false);

  const maskedKey = useMemo(() => (savedLast4 ? `sk-•••• •••• ${savedLast4}` : ''), [savedLast4]);

  // On first paint, check if the user already has a key on file. If so, jump
  // straight to the masked "saved" state so they don't have to re-paste.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const status = await openaiApi.getStatus();
        if (cancelled) return;
        if (status.exists && status.last4) {
          setSavedLast4(status.last4);
          setMode('saved');
        }
      } catch {
        // Non-fatal: keep the "enter" form visible so the user can paste a key.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  async function saveKey() {
    const trimmed = apiKey.trim();
    if (!trimmed) {
      show('Enter your OpenAI API key to continue.', 'error');
      return;
    }
    if (trimmed.length < 20) {
      show('That key looks too short. Paste the full key (sk-...).', 'error');
      return;
    }

    setSubmitting(true);
    try {
      const status = await openaiApi.saveKey({ key: trimmed });
      setSavedLast4(status.last4);
      setApiKey('');
      setMode('saved');
      show('OpenAI key saved securely.', 'success');

      // Refresh cached user so /(tabs) doesn't bounce back here on cold start.
      try {
        const me = await getMe();
        await refreshUser(me);
      } catch {
        // Non-fatal.
      }
    } catch (err) {
      const message =
        err instanceof ApiError
          ? err.message || 'Could not save the key. Please try again.'
          : err instanceof Error
            ? err.message
            : 'Could not save the key. Please try again.';
      show(message, 'error');
    } finally {
      setSubmitting(false);
    }
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

              <Pressable
                style={[styles.primaryButton, submitting && styles.primaryButtonDisabled]}
                onPress={saveKey}
                disabled={submitting}>
                {submitting ? (
                  <ActivityIndicator color="#FFFFFF" />
                ) : (
                  <>
                    <Text style={styles.primaryButtonText}>Save key securely</Text>
                    <MaterialIcons name="check" size={22} color="#FFFFFF" />
                  </>
                )}
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
  primaryButtonDisabled: {
    opacity: 0.65,
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
