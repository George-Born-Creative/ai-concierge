import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect } from 'react';
import { ActivityIndicator, View } from 'react-native';

import { buildConnectRouteParams, type OAuthProvider } from '@/lib/oauth';

/**
 * Deep-link landing route (registered in app.json Android intent filter).
 * Examples:
 *   aiconcierge://oauth/ghl?status=ok
 *   aiconcierge://oauth/ghl?status=error&reason=token_exchange
 */
export default function OAuthReturnRoute() {
  const router = useRouter();
  const { provider, status, reason } = useLocalSearchParams<{
    provider?: string;
    status?: string;
    reason?: string;
  }>();

  useEffect(() => {
    const crm: OAuthProvider =
      provider === 'hubspot' ? 'hubspot' : provider === 'ghl' ? 'ghl' : 'ghl';

    router.replace({
      pathname: '/connect',
      params: buildConnectRouteParams(crm, status ?? '', reason ?? ''),
    });
  }, [provider, reason, router, status]);

  return (
    <View
      style={{
        flex: 1,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: '#F8FAFF',
      }}>
      <ActivityIndicator size="large" color="#1A73E8" />
    </View>
  );
}
