import { useLocalSearchParams } from 'expo-router';

import { ContactSupportScreenContent } from '@/components/support/contact-support-screen-content';

export default function ContactSupportScreen() {
  const params = useLocalSearchParams<{
    mode?: string | string[];
    category?: string | string[];
    subject?: string | string[];
  }>();
  const modeParam = Array.isArray(params.mode) ? params.mode[0] : params.mode;
  const category = Array.isArray(params.category) ? params.category[0] : params.category;
  const subject = Array.isArray(params.subject) ? params.subject[0] : params.subject;

  return (
    <ContactSupportScreenContent
      initialCategory={category}
      initialSubject={subject}
      mode={modeParam === 'feedback' ? 'feedback' : 'support'}
    />
  );
}
