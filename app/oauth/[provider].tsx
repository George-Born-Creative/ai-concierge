import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useRef } from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';

import { ScreenShell } from '@/components/screen';
import {
  buildConnectRouteParams,
  consumeOAuthReturnFrom,
  type OAuthProvider,
} from '@/lib/oauth';
import { useAppTheme } from '@/lib/theme/theme-provider';

/**
 * Deep-link landing route (registered in app.json Android intent filter).
 * Examples:
 *   aiconcierge://oauth/ghl?status=ok
 *   aiconcierge://oauth/ghl?status=error&reason=token_exchange
 */
export default function OAuthReturnRoute() {
  const router = useRouter();
  const { colors } = useAppTheme();
  const { provider, status, reason } = useLocalSearchParams<{
    provider?: string;
    status?: string;
    reason?: string;
  }>();

  const consumedFrom = useRef<'crm' | null | undefined>(undefined);

  useEffect(() => {
    const crm: OAuthProvider =
      provider === 'hubspot' ? 'hubspot' : provider === 'ghl' ? 'ghl' : 'ghl';

    if (consumedFrom.current === undefined) {
      consumedFrom.current = consumeOAuthReturnFrom();
    }
    const returnFrom = consumedFrom.current;
    const params = buildConnectRouteParams(crm, status ?? '', reason ?? '');
    router.replace({
      pathname: '/connect',
      params: returnFrom === 'crm' ? { ...params, from: 'crm' } : params,
    });
  }, [provider, reason, router, status]);

  return (
    <ScreenShell>
      <View style={styles.center}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    </ScreenShell>
  );
}

const styles = StyleSheet.create({
  center: {
    alignItems: 'center',
    flex: 1,
    justifyContent: 'center',
  },
});
