import { useLocalSearchParams } from 'expo-router';

import { SupportArticleScreenContent } from '@/components/support/support-article-screen-content';

export default function SupportArticleScreen() {
  const { slug } = useLocalSearchParams<{ slug?: string | string[] }>();
  const resolvedSlug = Array.isArray(slug) ? slug[0] : slug;
  return <SupportArticleScreenContent slug={resolvedSlug ?? ''} />;
}
