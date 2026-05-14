import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { useRouter } from 'expo-router';
import { useState } from 'react';
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

type AuthMode = 'signin' | 'signup';

type AuthScreenProps = {
  mode: AuthMode;
};

export function AuthScreen({ mode }: AuthScreenProps) {
  const router = useRouter();
  const { show } = useToast();
  const isSignup = mode === 'signup';
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');

  function submitAuthForm() {
    if (isSignup && !name.trim()) {
      show('Enter your full name to create an account.', 'error');
      return;
    }

    if (!email.trim() || !password.trim()) {
      show('Enter your email and password to continue.', 'error');
      return;
    }

    if (isSignup) {
      router.replace('/plan');
      return;
    }

    show('Signed in successfully.', 'success');
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
          {!isSignup ? (
            <Pressable style={styles.backButton} onPress={() => router.replace('/signup')}>
              <MaterialIcons name="arrow-back" size={22} color="#202124" />
            </Pressable>
          ) : null}

          <View style={styles.heroCard}>
            <View style={styles.heroTopRow}>
              <View style={styles.logoMark}>
                <View style={[styles.logoDot, styles.blueDot]} />
                <View style={[styles.logoDot, styles.redDot]} />
                <View style={[styles.logoDot, styles.yellowDot]} />
                <View style={[styles.logoDot, styles.greenDot]} />
              </View>

              <View style={styles.badge}>
                <MaterialIcons name="auto-awesome" size={16} color="#1A73E8" />
                <Text style={styles.badgeText}>AI-Concierge</Text>
              </View>
            </View>

            <Text style={styles.title}>{isSignup ? 'Create your account' : 'Welcome back'}</Text>
            <Text style={styles.subtitle}>
              {isSignup
                ? 'Set up your assistant profile and continue to plan selection.'
                : 'Sign in to continue to your concierge workspace.'}
            </Text>
          </View>

          <View style={styles.formCard}>
            <Text style={styles.formTitle}>{isSignup ? 'Account details' : 'Sign in details'}</Text>

            {isSignup ? (
              <View style={styles.inputShell}>
                <MaterialIcons name="person-outline" size={22} color="#80868B" />
                <TextInput
                  value={name}
                  onChangeText={setName}
                  placeholder="Full name"
                  placeholderTextColor="#9AA0A6"
                  style={styles.input}
                  autoCapitalize="words"
                  returnKeyType="next"
                />
              </View>
            ) : null}

            <View style={styles.inputShell}>
              <MaterialIcons name="alternate-email" size={21} color="#80868B" />
              <TextInput
                value={email}
                onChangeText={setEmail}
                placeholder="Email address"
                placeholderTextColor="#9AA0A6"
                style={styles.input}
                autoCapitalize="none"
                keyboardType="email-address"
                returnKeyType="next"
              />
            </View>
            <View style={styles.inputShell}>
              <MaterialIcons name="lock-outline" size={21} color="#80868B" />
              <TextInput
                value={password}
                onChangeText={setPassword}
                placeholder="Password"
                placeholderTextColor="#9AA0A6"
                style={styles.input}
                secureTextEntry
                returnKeyType="done"
                onSubmitEditing={submitAuthForm}
              />
            </View>

            <Pressable style={styles.primaryButton} onPress={submitAuthForm}>
              <Text style={styles.primaryButtonText}>
                {isSignup ? 'Create account' : 'Sign in'}
              </Text>
              <MaterialIcons name="arrow-forward" size={21} color="#FFFFFF" />
            </Pressable>

            <Pressable
              style={styles.switchButton}
              onPress={() => router.replace(isSignup ? '/signin' : '/signup')}>
              <Text style={styles.switchText}>
                {isSignup ? 'Already have an account? Sign in' : "Don't have an account? Sign up"}
              </Text>
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
    backgroundColor: '#F6F9FF',
  },
  keyboardView: {
    flex: 1,
  },
  content: {
    alignItems: 'center',
    flexGrow: 1,
    justifyContent: 'center',
    paddingHorizontal: 12,
    paddingTop: 22,
    paddingBottom: 120,
  },
  backButton: {
    alignItems: 'center',
    alignSelf: 'flex-start',
    backgroundColor: '#FFFFFF',
    borderColor: '#E8EAED',
    borderRadius: 14,
    borderWidth: 1,
    height: 44,
    justifyContent: 'center',
    marginBottom: 28,
    width: 44,
  },
  heroCard: {
    backgroundColor: '#EDF4FF',
    borderColor: '#D7E6FF',
    borderRadius: 16,
    borderWidth: 1,
    padding: 22,
    width: '100%',
  },
  heroTopRow: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  logoMark: {
    alignItems: 'center',
    height: 64,
    justifyContent: 'center',
    width: 64,
  },
  logoDot: {
    borderRadius: 20,
    position: 'absolute',
  },
  blueDot: {
    backgroundColor: '#4285F4',
    height: 38,
    left: 5,
    width: 38,
  },
  redDot: {
    backgroundColor: '#EA4335',
    height: 24,
    right: 8,
    top: 8,
    width: 24,
  },
  yellowDot: {
    backgroundColor: '#FBBC04',
    bottom: 8,
    height: 22,
    right: 12,
    width: 22,
  },
  greenDot: {
    backgroundColor: '#34A853',
    bottom: 14,
    height: 16,
    left: 16,
    width: 16,
  },
  badge: {
    alignItems: 'center',
    backgroundColor: '#F1F6FF',
    borderRadius: 999,
    flexDirection: 'row',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  badgeText: {
    color: '#174EA6',
    fontSize: 13,
    fontWeight: '600',
  },
  title: {
    color: '#202124',
    fontSize: 34,
    fontWeight: '600',
    letterSpacing: -1,
    lineHeight: 40,
    marginTop: 26,
  },
  subtitle: {
    color: '#5F6368',
    fontSize: 16,
    lineHeight: 24,
    marginTop: 10,
    maxWidth: 300,
  },
  formCard: {
    backgroundColor: '#FFFFFF',
    borderColor: '#E6EDF8',
    borderRadius: 16,
    borderWidth: 1,
    marginTop: 16,
    padding: 20,
    width: '100%',
    shadowColor: '#174EA6',
    shadowOffset: { width: 0, height: 16 },
    shadowOpacity: 0.08,
    shadowRadius: 26,
  },
  formTitle: {
    color: '#202124',
    fontSize: 18,
    fontWeight: '600',
    marginBottom: 14,
  },
  inputShell: {
    alignItems: 'center',
    backgroundColor: '#F8FAFF',
    borderColor: '#E4EBF7',
    borderRadius: 12,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 10,
    marginBottom: 12,
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
    marginTop: 10,
    minHeight: 56,
  },
  primaryButtonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '600',
  },
  switchButton: {
    alignItems: 'center',
    marginTop: 18,
  },
  switchText: {
    color: '#1A73E8',
    fontSize: 14,
    fontWeight: '600',
  },
});
