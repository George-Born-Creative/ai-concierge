import type { SupportRequestCategory } from '@/lib/api/types';

export type SupportTopic =
  | 'account'
  | 'billing'
  | 'gohighlevel'
  | 'hubspot'
  | 'openai'
  | 'voice'
  | 'notifications'
  | 'connectivity'
  | 'privacy';

export type SupportArticleAction =
  | { type: 'settings'; label: string }
  | { type: 'openai-key'; label: string }
  | { type: 'reminders'; label: string }
  | {
      type: 'contact-support';
      label: string;
      category: SupportRequestCategory;
    };

export type SupportArticleStep = {
  title: string;
  body: string;
};

export type SupportArticle = {
  slug: string;
  topic: SupportTopic;
  title: string;
  summary: string;
  keywords: readonly string[];
  steps: readonly SupportArticleStep[];
  actions?: readonly SupportArticleAction[];
  escalationCategory: SupportRequestCategory;
};

export const SUPPORT_TOPIC_META: Record<
  SupportTopic,
  { label: string; icon: 'person' | 'payments' | 'hub' | 'key' | 'mic' | 'notifications' | 'wifi' | 'shield' }
> = {
  account: { label: 'Account', icon: 'person' },
  billing: { label: 'Billing', icon: 'payments' },
  gohighlevel: { label: 'GoHighLevel', icon: 'hub' },
  hubspot: { label: 'HubSpot', icon: 'hub' },
  openai: { label: 'OpenAI assistant', icon: 'key' },
  voice: { label: 'Voice', icon: 'mic' },
  notifications: { label: 'Notifications', icon: 'notifications' },
  connectivity: { label: 'Connectivity', icon: 'wifi' },
  privacy: { label: 'Privacy & security', icon: 'shield' },
};

export const SUPPORT_TOPIC_ORDER: readonly SupportTopic[] = [
  'account',
  'billing',
  'gohighlevel',
  'hubspot',
  'openai',
  'voice',
  'notifications',
  'connectivity',
  'privacy',
];

export const SUPPORT_ARTICLES: readonly SupportArticle[] = [
  {
    slug: 'sign-in-and-account-access',
    topic: 'account',
    title: 'Fix sign-in and account access',
    summary: 'Get back into your account when a password, verification code, or session is not working.',
    keywords: ['sign in', 'login', 'password', 'verification code', 'account locked'],
    steps: [
      { title: 'Confirm the account email', body: 'Use the same email address you used when creating your AI Concierge account.' },
      { title: 'Check the verification message', body: 'Look in spam or promotions, then request one new code and use only the newest message.' },
      { title: 'Reset the password if needed', body: 'From the sign-in screen, choose Forgot password and create a new password.' },
      { title: 'Try a clean sign-in', body: 'Close and reopen the app, then sign in again on a stable connection.' },
    ],
    actions: [{ type: 'settings', label: 'Open Settings' }],
    escalationCategory: 'ACCOUNT',
  },
  {
    slug: 'update-account-details',
    topic: 'account',
    title: 'Update your account details',
    summary: 'Change the name, email address, or password associated with your account.',
    keywords: ['profile', 'email', 'name', 'change password', 'account details'],
    steps: [
      { title: 'Open Settings', body: 'Go to your Profile tab, then choose Settings.' },
      { title: 'Choose Edit profile', body: 'Review your current name and account email before making changes.' },
      { title: 'Save one change at a time', body: 'Enter the updated information and follow any verification prompt shown.' },
    ],
    actions: [{ type: 'settings', label: 'Open Settings' }],
    escalationCategory: 'ACCOUNT',
  },
  {
    slug: 'billing-and-subscription-help',
    topic: 'billing',
    title: 'Check billing and subscription status',
    summary: 'Review a missing plan, payment issue, renewal, or subscription managed by Apple or Stripe.',
    keywords: ['billing', 'payment', 'subscription', 'invoice', 'renewal', 'apple', 'stripe'],
    steps: [
      { title: 'Check the account in use', body: 'Confirm that you are signed in with the email that purchased the subscription.' },
      { title: 'Review the payment provider', body: 'Apple subscriptions are managed in App Store subscriptions; other plans use the checkout provider shown in the app.' },
      { title: 'Restore when available', body: 'If you paid through Apple and the plan is missing, use Restore purchases from the plan screen.' },
      { title: 'Allow time for renewal', body: 'After a recent payment, reopen the app so the subscription status can refresh.' },
    ],
    escalationCategory: 'BILLING',
  },
  {
    slug: 'connect-gohighlevel',
    topic: 'gohighlevel',
    title: 'Connect or reconnect GoHighLevel',
    summary: 'Restore access to GoHighLevel contacts, opportunities, and calendar data.',
    keywords: ['ghl', 'go high level', 'gohighlevel', 'location', 'oauth', 'reconnect'],
    steps: [
      { title: 'Open integration settings', body: 'Open Settings and find GoHighLevel under Integrations.' },
      { title: 'Choose Connect or Reconnect', body: 'The app opens the secure GoHighLevel authorization screen.' },
      { title: 'Select the correct location', body: 'Approve access for the business location you want AI Concierge to use.' },
      { title: 'Return to the app', body: 'Wait for the connection confirmation before opening CRM data.' },
    ],
    actions: [{ type: 'settings', label: 'Open integration settings' }],
    escalationCategory: 'CRM_GHL',
  },
  {
    slug: 'gohighlevel-calendar-access',
    topic: 'gohighlevel',
    title: 'Restore GoHighLevel calendar access',
    summary: 'Reconnect when contacts work but calendars or appointments are unavailable.',
    keywords: ['ghl calendar', 'appointments', 'calendar scope', 'permission', 'missing calendar'],
    steps: [
      { title: 'Review the connection', body: 'In Settings, check whether GoHighLevel shows a calendar permissions warning.' },
      { title: 'Enable calendar scopes', body: 'Confirm the required calendar permissions in the GoHighLevel Marketplace.' },
      { title: 'Reconnect the integration', body: 'Return to AI Concierge and choose Reconnect GoHighLevel.' },
      { title: 'Approve every requested scope', body: 'Finish authorization, then retry the calendar or appointment action.' },
    ],
    actions: [{ type: 'settings', label: 'Open integration settings' }],
    escalationCategory: 'CRM_GHL',
  },
  {
    slug: 'connect-hubspot',
    topic: 'hubspot',
    title: 'Connect or reconnect HubSpot',
    summary: 'Restore access to HubSpot contacts, companies, and deals.',
    keywords: ['hubspot', 'portal', 'oauth', 'reconnect', 'contacts', 'deals'],
    steps: [
      { title: 'Open integration settings', body: 'Open Settings and find HubSpot under Integrations.' },
      { title: 'Choose Connect or Reconnect', body: 'Sign in to HubSpot in the secure authorization window.' },
      { title: 'Select the correct account', body: 'Choose the HubSpot portal that contains the records you need.' },
      { title: 'Approve access', body: 'Complete authorization and return to AI Concierge before retrying.' },
    ],
    actions: [{ type: 'settings', label: 'Open integration settings' }],
    escalationCategory: 'CRM_HUBSPOT',
  },
  {
    slug: 'openai-api-key',
    topic: 'openai',
    title: 'Add or replace your OpenAI API key',
    summary: 'Set the key used for voice transcription and assistant requests.',
    keywords: ['openai', 'api key', 'quota', 'invalid key', 'assistant unavailable'],
    steps: [
      { title: 'Create a key in your OpenAI account', body: 'Use a project you control and make sure billing or credits are available.' },
      { title: 'Open the key screen', body: 'In AI Concierge Settings, choose OpenAI API key.' },
      { title: 'Paste and save the key', body: 'Copy the complete key once. Never send it in a support request.' },
      { title: 'Retry the assistant', body: 'After the connected status appears, retry your text or voice request.' },
    ],
    actions: [{ type: 'openai-key', label: 'Manage OpenAI key' }],
    escalationCategory: 'OPENAI_ASSISTANT',
  },
  {
    slug: 'voice-command-not-working',
    topic: 'voice',
    title: 'Fix a voice command that is not working',
    summary: 'Check microphone access, recording quality, and the services needed for voice commands.',
    keywords: ['voice', 'microphone', 'recording', 'transcription', 'audio', 'speech'],
    steps: [
      { title: 'Allow microphone access', body: 'Open your device settings and allow microphone access for AI Concierge.' },
      { title: 'Check the OpenAI key', body: 'Voice transcription needs a valid OpenAI API key with available quota.' },
      { title: 'Record a short, clear request', body: 'Move to a quieter place and keep the app open while recording.' },
      { title: 'Try text as a comparison', body: 'If text works but voice does not, contact support under Voice.' },
    ],
    actions: [{ type: 'openai-key', label: 'Check OpenAI key' }],
    escalationCategory: 'VOICE',
  },
  {
    slug: 'reminder-notifications',
    topic: 'notifications',
    title: 'Turn reminder notifications back on',
    summary: 'Restore reminder alerts after notifications were denied or stopped appearing.',
    keywords: ['notifications', 'reminder', 'alert', 'permission', 'push', 'not received'],
    steps: [
      { title: 'Open device notification settings', body: 'Find AI Concierge and allow notifications, sounds, and lock-screen alerts.' },
      { title: 'Review the reminder time', body: 'Confirm that the reminder is scheduled in the future and uses the expected timezone.' },
      { title: 'Open AI Concierge again', body: 'Reopening the app lets it refresh notification registration.' },
      { title: 'Create a short test reminder', body: 'Schedule one a few minutes ahead and keep the device online.' },
    ],
    actions: [{ type: 'reminders', label: 'Open Reminders' }],
    escalationCategory: 'REMINDERS_NOTIFICATIONS',
  },
  {
    slug: 'connection-and-sync-problems',
    topic: 'connectivity',
    title: 'Resolve connection and sync problems',
    summary: 'Troubleshoot timeouts, stale CRM data, and requests that cannot reach the service.',
    keywords: ['offline', 'network', 'timeout', 'sync', 'connection', 'stale data'],
    steps: [
      { title: 'Check your connection', body: 'Open another online service and switch between Wi-Fi and mobile data if needed.' },
      { title: 'Retry once', body: 'Wait a moment, then retry the same action without repeatedly tapping.' },
      { title: 'Refresh the integration', body: 'If only CRM data is affected, open Settings and check the integration status.' },
      { title: 'Keep your draft', body: 'Support form drafts remain on this device after a temporary failure, so you can submit again.' },
    ],
    actions: [{ type: 'settings', label: 'Open Settings' }],
    escalationCategory: 'CONNECTIVITY',
  },
  {
    slug: 'protect-your-account-and-data',
    topic: 'privacy',
    title: 'Protect your account and connected data',
    summary: 'Know what sensitive information should never be included in a support request.',
    keywords: ['privacy', 'security', 'password', 'token', 'api key', 'verification code'],
    steps: [
      { title: 'Keep credentials private', body: 'Never share passwords, verification codes, CRM tokens, or API keys with support.' },
      { title: 'Describe the behavior', body: 'Share what you expected, what happened, and the approximate time instead of sending secret values.' },
      { title: 'Rotate exposed credentials', body: 'If a credential was shared accidentally, revoke or replace it with the issuing provider.' },
      { title: 'Contact support safely', body: 'Use the in-app form and include only the minimum account context needed.' },
    ],
    actions: [{ type: 'contact-support', label: 'Contact support', category: 'PRIVACY_SECURITY' }],
    escalationCategory: 'PRIVACY_SECURITY',
  },
] as const;

export function getSupportArticle(slug: string): SupportArticle | undefined {
  return SUPPORT_ARTICLES.find((article) => article.slug === slug);
}

export function getArticlesForTopic(topic: SupportTopic): SupportArticle[] {
  return SUPPORT_ARTICLES.filter((article) => article.topic === topic);
}
