import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useState } from 'react';
import {
  Alert,
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

export function OpenAIApiKeyScreen() {
  const router = useRouter();
  const { crm } = useLocalSearchParams<{ crm?: string }>();
  const [apiKey, setApiKey] = useState('');

  function saveKey() {
    if (!apiKey.trim()) {
      Alert.alert('Missing key', 'Enter your OpenAI API key to continue.');
      return;
    }

    Alert.alert('Key saved', 'Your AI-Concierge setup is ready.', [
      { text: 'Open app', onPress: () => router.replace('/(tabs)') },
    ]);
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
          <Text style={styles.title}>Enter your OpenAI API Key</Text>
          <Text style={styles.subtitle}>
            {crm
              ? 'Your CRM is selected. Add your OpenAI key to activate assistant responses.'
              : 'Add your OpenAI key to activate assistant responses.'}
          </Text>

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
              <Text style={styles.primaryButtonText}>Save Key</Text>
              <MaterialIcons name="check" size={22} color="#FFFFFF" />
            </Pressable>
          </View>
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
});
