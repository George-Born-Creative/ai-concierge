import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect } from 'react';
import { ActivityIndicator, View } from 'react-native';

/** Deep-link landing route: aiconcierge://oauth/ghl?status=ok */
export default function GhlOAuthReturnRoute() {
  const router = useRouter();
  const { status, reason } = useLocalSearchParams<{ status?: string; reason?: string }>();

  useEffect(() => {
    router.replace({
      pathname: '/connect',
      params: {
        provider: 'ghl',
        oauthStatus: status ?? '',
        oauthReason: reason ?? '',
      },
    });
  }, [reason, router, status]);

  return (
    <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: '#F8FAFF' }}>
      <ActivityIndicator size="large" color="#1A73E8" />
    </View>
  );
}
