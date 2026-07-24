import { useLocalSearchParams } from 'expo-router';

import { ContactSupportScreenContent } from '@/components/support/contact-support-screen-content';

export default function ContactSupportScreen() {
  const params = useLocalSearchParams<{
    mode?: string | string[];
    category?: string | string[];
    subject?: string | string[];
    includeDiagnostics?: string | string[];
  }>();
  const modeParam = Array.isArray(params.mode) ? params.mode[0] : params.mode;
  const category = Array.isArray(params.category) ? params.category[0] : params.category;
  const subject = Array.isArray(params.subject) ? params.subject[0] : params.subject;
  const includeDiagnostics = Array.isArray(params.includeDiagnostics)
    ? params.includeDiagnostics[0]
    : params.includeDiagnostics;

  return (
    <ContactSupportScreenContent
      initialCategory={category}
      initialIncludeDiagnostics={includeDiagnostics === '1'}
      initialSubject={subject}
      mode={modeParam === 'feedback' ? 'feedback' : 'support'}
    />
  );
}
