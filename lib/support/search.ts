import type { CrmProvider } from '@/lib/api/types';
import {
  SUPPORT_ARTICLES,
  type SupportArticle,
  type SupportTopic,
} from '@/lib/support/articles';

export type SupportSuggestionContext = {
  provider?: CrmProvider | null;
  hasOpenAIKey?: boolean | null;
  pushStatus?: string | null;
};

export type SupportSearchResult = {
  article: SupportArticle;
  score: number;
};

export function normalizeSupportText(value: string): string {
  return value
    .toLocaleLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .replace(/\s+/g, ' ');
}

function topicSearchText(topic: SupportTopic): string {
  if (topic === 'gohighlevel') return 'gohighlevel go high level ghl crm';
  if (topic === 'openai') return 'openai assistant api key';
  if (topic === 'notifications') return 'notification reminders alerts';
  return normalizeSupportText(topic);
}

function scoreArticle(article: SupportArticle, query: string): number {
  const normalizedTitle = normalizeSupportText(article.title);
  const keywords = article.keywords.map(normalizeSupportText);
  const words = query.split(' ');
  let score = 0;

  if (normalizedTitle === query) score += 1000;
  if (keywords.includes(query)) score += 900;
  if (normalizedTitle.startsWith(query)) score += 360;
  if (normalizedTitle.includes(query)) score += 260;
  if (keywords.some((keyword) => keyword.includes(query))) score += 220;

  const category = topicSearchText(article.topic);
  const summary = normalizeSupportText(article.summary);
  const steps = normalizeSupportText(
    article.steps.map((step) => `${step.title} ${step.body}`).join(' '),
  );

  for (const word of words) {
    if (word.length < 2) continue;
    if (normalizedTitle.split(' ').includes(word)) score += 55;
    if (keywords.some((keyword) => keyword.split(' ').includes(word))) score += 45;
    if (category.includes(word)) score += 30;
    if (summary.includes(word)) score += 18;
    if (steps.includes(word)) score += 8;
  }

  return score;
}

export function searchSupportArticles(
  query: string,
  articles: readonly SupportArticle[] = SUPPORT_ARTICLES,
): SupportSearchResult[] {
  const normalized = normalizeSupportText(query);
  if (!normalized) return [];

  return articles
    .map((article) => ({ article, score: scoreArticle(article, normalized) }))
    .filter((result) => result.score > 0)
    .sort(
      (a, b) =>
        b.score - a.score || a.article.title.localeCompare(b.article.title),
    );
}

function contextualScore(
  article: SupportArticle,
  context: SupportSuggestionContext,
): number {
  let score = 0;
  if (context.provider === 'ghl' && article.topic === 'gohighlevel') score += 100;
  if (context.provider === 'hubspot' && article.topic === 'hubspot') score += 100;
  if (!context.provider) {
    if (
      article.slug === 'connect-gohighlevel' ||
      article.slug === 'connect-hubspot'
    ) {
      score += 100;
    } else if (article.topic === 'account') {
      score += 45;
    }
  }
  if (context.hasOpenAIKey === false && article.slug === 'openai-api-key') score += 130;
  if (context.pushStatus === 'denied' && article.slug === 'reminder-notifications') score += 120;
  if (article.slug === 'connection-and-sync-problems') score += 20;
  if (article.slug === 'protect-your-account-and-data') score += 10;
  return score;
}

export function getContextualSuggestions(
  context: SupportSuggestionContext,
  limit = 3,
  articles: readonly SupportArticle[] = SUPPORT_ARTICLES,
): SupportArticle[] {
  return articles
    .map((article, index) => ({ article, index, score: contextualScore(article, context) }))
    .sort((a, b) => b.score - a.score || a.index - b.index)
    .slice(0, limit)
    .map(({ article }) => article);
}
