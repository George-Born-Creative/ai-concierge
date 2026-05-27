import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { useFocusEffect } from '@react-navigation/native';
import { useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';

import { PageHeader } from '@/components/page-header';
import { ghlApi, openaiApi } from '@/lib/api';
import { ApiError } from '@/lib/api/client';
import type { GhlStatusResponse, OpenAIKeyStatus } from '@/lib/api/types';
import { getOAuthReturnUrl, useCrmOAuth } from '@/lib/oauth';
import { getUser } from '@/lib/session';
import { useToast } from '@/lib/toast';

export function SettingsScreenContent() {
  const router = useRouter();
  const { show } = useToast();
  const [loadingStatus, setLoadingStatus] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [connected, setConnected] = useState(false);
  const [status, setStatus] = useState<GhlStatusResponse | null>(null);
  const [openaiStatus, setOpenaiStatus] = useState<OpenAIKeyStatus | null>(null);
  const [loadingOpenai, setLoadingOpenai] = useState(true);

  const onStatusChange = useCallback((isConnected: boolean) => {
    setConnected(isConnected);
  }, []);

  const { startOAuthConnect } = useCrmOAuth({
    provider: 'ghl',
    api: ghlApi,
    integrationName: 'GoHighLevel',
    show,
    onStatusChange: (isConnected) => onStatusChange(isConnected),
    setLoadingStatus,
    setSubmitting,
  });

  const refreshStatus = useCallback(async () => {
    setLoadingStatus(true);
    try {
      const next = await ghlApi.getStatus();
      setStatus(next);
      setConnected(next.connected);
    } catch {
      setStatus(null);
      setConnected(false);
    } finally {
      setLoadingStatus(false);
    }
  }, []);

  const refreshOpenaiStatus = useCallback(async () => {
    setLoadingOpenai(true);
    try {
      const next = await openaiApi.getStatus();
      setOpenaiStatus(next);
    } catch {
      setOpenaiStatus(null);
    } finally {
      setLoadingOpenai(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      void refreshStatus();
      void refreshOpenaiStatus();
    }, [refreshStatus, refreshOpenaiStatus]),
  );

  async function handleDisconnect() {
    if (submitting) return;
    setSubmitting(true);
    try {
      await ghlApi.disconnect();
      await refreshStatus();
      show('GoHighLevel disconnected.', 'success');
    } catch (err) {
      const message =
        err instanceof ApiError ? err.message : 'Could not disconnect GoHighLevel.';
      show(message, 'error');
    } finally {
      setSubmitting(false);
    }
  }

  async function handleReconnect() {
    if (submitting) return;
    setSubmitting(true);
    try {
      const returnUrl = getOAuthReturnUrl('ghl');
      await ghlApi.reconnect(returnUrl);
      setSubmitting(false);
      await startOAuthConnect();
    } catch (err) {
      setSubmitting(false);
      const message =
        err instanceof ApiError ? err.message : 'Could not start GoHighLevel reconnect.';
      show(message, 'error');
    }
  }

  function handleManageOpenaiKey() {
    router.push({
      pathname: '/openai-key',
      params: { from: 'settings', replace: '1' },
    });
  }

  function handleSwitchCrm() {
    show('CRM switching will be available once both providers are wired.', 'info');
  }

  const calendarReady = status?.calendarScopesGranted !== false;
  const hasOpenaiKey = openaiStatus?.exists === true;
  const currentUser = getUser();
  const crmProviderLabel = currentUser?.provider === 'hubspot' ? 'HubSpot' : 'GoHighLevel';

  return (
    <SafeAreaView style={styles.screen}>
      <PageHeader title="Settings" showBack onBack={() => router.back()} />
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <Text style={styles.subtitle}>
          Manage your CRM connection, OpenAI key, and assistant preferences.
        </Text>

        {/* ── GoHighLevel ─────────────────────────────────────────────────── */}
        <View style={styles.card}>
          <View style={styles.cardHeader}>
            <MaterialIcons name="hub" size={28} color="#1A73E8" />
            <View style={styles.cardCopy}>
              <Text style={styles.cardTitle}>GoHighLevel</Text>
              {loadingStatus ? (
                <ActivityIndicator size="small" color="#1A73E8" style={styles.inlineSpinner} />
              ) : (
                <Text style={[styles.statusText, connected ? styles.statusOn : styles.statusOff]}>
                  {connected ? 'Connected' : 'Not connected'}
                </Text>
              )}
            </View>
          </View>

          {connected && status?.locationId ? (
            <Text style={styles.detailText}>Location {status.locationId}</Text>
          ) : null}

          {connected && status?.calendarScopesGranted === false ? (
            <View style={styles.warningBox}>
              <MaterialIcons name="warning" size={20} color="#E37400" />
              <Text style={styles.warningText}>
                Calendar scopes are missing on this token. Tap Reconnect to approve calendar access.
              </Text>
            </View>
          ) : null}

          {connected && calendarReady ? (
            <Text style={styles.detailText}>Contacts and calendar access are enabled.</Text>
          ) : null}

          <View style={styles.actions}>
            <Pressable
              style={[styles.primaryButton, submitting && styles.buttonDisabled]}
              onPress={() => void handleReconnect()}
              disabled={submitting || loadingStatus}>
              {submitting ? (
                <ActivityIndicator size="small" color="#FFFFFF" />
              ) : (
                <Text style={styles.primaryButtonText}>
                  {connected ? 'Reconnect GoHighLevel' : 'Connect GoHighLevel'}
                </Text>
              )}
            </Pressable>

            {connected ? (
              <Pressable
                style={[styles.secondaryButton, submitting && styles.buttonDisabled]}
                onPress={() => void handleDisconnect()}
                disabled={submitting || loadingStatus}>
                <Text style={styles.secondaryButtonText}>Disconnect</Text>
              </Pressable>
            ) : null}
          </View>

          <Text style={styles.helpText}>
            Reconnect after enabling new scopes in the GHL Marketplace (for example Calendars).
            This clears the old token and opens the authorization screen again.
          </Text>
        </View>

        {/* ── OpenAI key ──────────────────────────────────────────────────── */}
        <View style={styles.card}>
          <View style={styles.cardHeader}>
            <MaterialIcons name="vpn-key" size={28} color="#1A73E8" />
            <View style={styles.cardCopy}>
              <Text style={styles.cardTitle}>OpenAI API key</Text>
              {loadingOpenai ? (
                <ActivityIndicator size="small" color="#1A73E8" style={styles.inlineSpinner} />
              ) : (
                <Text
                  style={[styles.statusText, hasOpenaiKey ? styles.statusOn : styles.statusOff]}>
                  {hasOpenaiKey ? 'Connected' : 'Not set'}
                </Text>
              )}
            </View>
          </View>

          {hasOpenaiKey && openaiStatus?.last4 ? (
            <Text style={styles.detailText}>Current key ···{openaiStatus.last4}</Text>
          ) : (
            <Text style={styles.detailText}>
              Add a personal key to enable voice transcription and intent parsing.
            </Text>
          )}

          {openaiStatus?.quotaWarning ? (
            <View style={styles.warningBox}>
              <MaterialIcons name="warning" size={20} color="#E37400" />
              <Text style={styles.warningText}>
                This key looks low on quota. Rotate to a fresh key to keep voice commands working.
              </Text>
            </View>
          ) : null}

          <View style={styles.actions}>
            <Pressable style={styles.primaryButton} onPress={handleManageOpenaiKey}>
              <Text style={styles.primaryButtonText}>
                {hasOpenaiKey ? 'Rotate OpenAI key' : 'Add OpenAI key'}
              </Text>
            </Pressable>
          </View>

          <Text style={styles.helpText}>
            Your key is stored encrypted on the server and only used for your transcriptions.
          </Text>
        </View>

        {/* ── Switch CRM ──────────────────────────────────────────────────── */}
        <View style={styles.card}>
          <View style={styles.cardHeader}>
            <MaterialIcons name="swap-horiz" size={28} color="#1A73E8" />
            <View style={styles.cardCopy}>
              <Text style={styles.cardTitle}>CRM provider</Text>
              <Text style={[styles.statusText, styles.statusOn]}>{crmProviderLabel}</Text>
            </View>
          </View>

          <Text style={styles.detailText}>
            Switch between GoHighLevel and HubSpot. The assistant will use the active provider
            for all contact, calendar, and (soon) opportunity commands.
          </Text>

          <View style={styles.actions}>
            <Pressable style={styles.secondaryNeutralButton} onPress={handleSwitchCrm}>
              <Text style={styles.secondaryNeutralButtonText}>Switch CRM</Text>
            </Pressable>
          </View>
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
    paddingHorizontal: 16,
    paddingBottom: 40,
    paddingTop: 18,
  },
  subtitle: {
    color: '#5F6368',
    fontSize: 15,
    lineHeight: 22,
    marginBottom: 20,
  },
  card: {
    backgroundColor: '#FFFFFF',
    borderColor: '#E8EAED',
    borderRadius: 16,
    borderWidth: 1,
    marginBottom: 14,
    padding: 18,
  },
  cardHeader: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 14,
  },
  cardCopy: {
    flex: 1,
  },
  cardTitle: {
    color: '#202124',
    fontSize: 18,
    fontWeight: '600',
  },
  statusText: {
    fontSize: 14,
    fontWeight: '600',
    marginTop: 4,
  },
  statusOn: {
    color: '#34A853',
  },
  statusOff: {
    color: '#80868B',
  },
  inlineSpinner: {
    alignSelf: 'flex-start',
    marginTop: 6,
  },
  detailText: {
    color: '#5F6368',
    fontSize: 14,
    lineHeight: 20,
    marginTop: 12,
  },
  warningBox: {
    alignItems: 'flex-start',
    backgroundColor: '#FEF7E0',
    borderRadius: 12,
    flexDirection: 'row',
    gap: 10,
    marginTop: 12,
    padding: 12,
  },
  warningText: {
    color: '#5F4400',
    flex: 1,
    fontSize: 13,
    lineHeight: 19,
  },
  actions: {
    gap: 10,
    marginTop: 18,
  },
  primaryButton: {
    alignItems: 'center',
    backgroundColor: '#1A73E8',
    borderRadius: 12,
    paddingVertical: 14,
  },
  primaryButtonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '600',
  },
  secondaryButton: {
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderColor: '#FAD2CF',
    borderRadius: 12,
    borderWidth: 1,
    paddingVertical: 14,
  },
  secondaryButtonText: {
    color: '#EA4335',
    fontSize: 16,
    fontWeight: '600',
  },
  secondaryNeutralButton: {
    alignItems: 'center',
    backgroundColor: '#F1F3F4',
    borderRadius: 12,
    paddingVertical: 14,
  },
  secondaryNeutralButtonText: {
    color: '#1A73E8',
    fontSize: 16,
    fontWeight: '600',
  },
  buttonDisabled: {
    opacity: 0.65,
  },
  helpText: {
    color: '#80868B',
    fontSize: 13,
    lineHeight: 19,
    marginTop: 16,
  },
});
